// 랭킹 전투력·자산 지표(집계 때 한 번) — 기획 D-576 "NPC 가문 점수는 전투력, 자산 등 여러 항목, 플레이어 가문 랭킹과 같은 항목"(질문 2258 다안 —
// 코디네이터 전달 2026-11-16), D-7022(수치형 지표는 버프를 뺀 기본값), D-555 1512(사업장 금고는 지분만큼 각 주주의 재산·순위에), D-097(유닛 지갑은
// 유닛의 사유재산). docs/adr/2026-11-07-ranking.md "바뀜 (house-9)". 읽기만 한다(쓰기는 snapshot.ts 트랜잭션).
// - 전투력: 세계 유닛(world_units, 배 빼고)마다 버프·부상을 뺀 몸(사이보그 = 저장된 본체, 그 밖 = 유닛 화면과 같은 [임시] 기본 몸 + 입은 장비)의
//   조우 전력 식((최대 HP + 아머 + 쉴드) × 공격력 × 1000 ÷ 공격 간격 — travel/clashDecide.ts clashPower). 소유 주체 = 가진 유닛 합, NPC 가문원 =
//   그 유닛 값. 몸을 셀 수 없으면(세계 준비 전·시험) 0.
// - 자산(기준 통화 최소 단위): 소유 주체 계정마다 — 화폐는 환전 시세로 기준 통화에(지난 체결가, 없으면 1:1), 물건은 시세(거래소 마지막 체결가의
//   평균 → 기준 통화, 없으면 팩 시작 시세) × 양 ÷ 묶음 크기, 사업장 금고(건물 위치 화폐)는 지분만큼 주주에게(발행 전이면 주인 전부), 지분 자산 자체는
//   금고로 세므로 따로 값을 매기지 않는다. 유닛 지갑(유닛 화물 위치 화폐)은 그 유닛 몫(주인 자산에 넣지 않는다 — D-097). 시스템 계정(에스크로·
//   가문 금고 등)은 세지 않는다 [임시 질문 2313].
// - NPC 몫을 나누는 단위: 가문원 유닛마다(그 유닛 전투력 + 그 유닛 지갑). 가문 판은 가문원 합(질문 2311).
// - 부하: 큰 표를 들고 있지 않는다 — 원장은 SQL에서 (주체, 자산[, 지갑 유닛·금고 건물])로 묶어 읽고, 유닛은 한 번 훑으며 256개마다 이벤트 루프에
//   양보한다. 결과 표는 집계가 쓰고 버린다.
import { parseBusinessShareAsset } from "@terra/shared/businessBooks";
import { BUILDING_LOCATION_BASE } from "@terra/shared/goodsPlaces";
import type { Queryable } from "./measures.ts";

/** 배(world_units.kind — world/unitKinds.ts UNIT_KIND_BOAT). 사람이 아니라 전투력에서 뺀다 */
const BOAT_KIND = 8;
/** 유닛 몇 개마다 이벤트 루프에 양보하나 */
const YIELD_EVERY = 256;

/** 전투력·자산 셈에 세계가 빌려 주는 것 */
export interface WorthSource {
  /** 버프·부상을 뺀 유닛 하나의 전투력(셀 수 없으면 0) */
  readonly powerOf?: ((unitId: number) => number) | undefined;
  /** 자산 qty를 기준 통화 최소 단위로(모르면 0) */
  readonly valueOf: (asset: string, qty: bigint) => bigint;
}

/** 주체 하나의 값 */
export interface WorthValue {
  power: bigint;
  assets: bigint;
}

export interface WorthValues {
  /** 소유 주체 ID → 값 */
  readonly owners: Map<number, WorthValue>;
  /** 세계 유닛 ID(NPC 가문원) → 값 */
  readonly units: Map<number, WorthValue>;
}

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const big = (value: unknown): bigint =>
  typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : BigInt(Math.trunc(num(value)));
const yieldLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const entryOf = (map: Map<number, WorthValue>, id: number): WorthValue => {
  const found = map.get(id);
  if (found) return found;
  const made = { power: 0n, assets: 0n };
  map.set(id, made);
  return made;
};

/** 유닛 전투력: 소유 주체 합, 가문원은 따로 */
async function readPowers(
  db: Queryable,
  powerOf: (unitId: number) => number,
  members: ReadonlySet<number>,
  out: WorthValues,
): Promise<void> {
  const result = await db.query(`select id, owner_id from world_units where kind <> $1 order by id`, [
    BOAT_KIND,
  ]);
  let count = 0;
  for (const row of result.rows) {
    count += 1;
    if (count % YIELD_EVERY === 0) await yieldLoop();
    const unitId = num(row.id);
    const power = powerOf(unitId);
    if (!(power > 0)) continue;
    const value = BigInt(Math.trunc(power));
    entryOf(out.owners, num(row.owner_id)).power += value;
    if (members.has(unitId)) entryOf(out.units, unitId).power += value;
  }
}

/**
 * 원장 자산(위 머리 주석). 지분 자산(share:…)은 화폐·물건이 아니므로 SQL이 지갑·금고 칸을 나누지 않는다 — 화폐 판정은 아이템·지분이 아닌 것으로
 * 거칠게 묶고 값은 valueOf가 매긴다(물건이 아닌 알 수 없는 자산은 0)
 */
async function readAssets(
  db: Queryable,
  valueOf: WorthSource["valueOf"],
  members: ReadonlySet<number>,
  out: WorthValues,
): Promise<void> {
  const [accounts, issued] = await Promise.all([
    db.query(
      `select owner_id, asset,
              case when location < 0 and asset not like 'item:%' and asset not like 'share:%' then -location end as purse_unit,
              case when location >= $1 and asset not like 'item:%' and asset not like 'share:%' then location - $1 end as vault_building,
              sum(balance)::text as qty
         from ledger_accounts
        where owner_id is not null and balance > 0
        group by 1, 2, 3, 4`,
      [BUILDING_LOCATION_BASE],
    ),
    db.query(
      `select system_code, (-balance)::text as issued from ledger_accounts
        where system_code like 'issue:share:biz_%' and balance < 0`,
    ),
  ]);
  /** 건물 → 금고 주인·값 */
  const vaults = new Map<number, { owner: number; value: bigint }>();
  /** 건물 → 주주 → 주 수 */
  const holders = new Map<number, Map<number, bigint>>();
  for (const row of accounts.rows) {
    const owner = num(row.owner_id);
    const asset = String(row.asset);
    const qty = big(row.qty);
    if (row.purse_unit !== null && row.purse_unit !== undefined) {
      const unitId = num(row.purse_unit);
      if (members.has(unitId)) entryOf(out.units, unitId).assets += valueOf(asset, qty);
      continue;
    }
    if (row.vault_building !== null && row.vault_building !== undefined) {
      const building = num(row.vault_building);
      const vault = vaults.get(building) ?? { owner, value: 0n };
      vault.value += valueOf(asset, qty);
      vaults.set(building, vault);
      continue;
    }
    const shareOf = parseBusinessShareAsset(asset);
    if (shareOf !== undefined) {
      const map = holders.get(shareOf) ?? new Map<number, bigint>();
      map.set(owner, (map.get(owner) ?? 0n) + qty);
      holders.set(shareOf, map);
      continue;
    }
    entryOf(out.owners, owner).assets += valueOf(asset, qty);
  }
  const issuedOf = new Map<number, bigint>();
  for (const row of issued.rows) {
    const match = /^issue:share:biz_(\d+)$/.exec(String(row.system_code));
    if (match) issuedOf.set(Number(match[1]), big(row.issued));
  }
  // 사업장 금고 → 지분만큼(D-555 1512). 발행 전이면 금고 주인 전부. 에스크로에 걸린 주는 아무에게도 가지 않는다(내림)
  for (const [building, vault] of [...vaults].toSorted((a, b) => a[0] - b[0])) {
    const total = issuedOf.get(building) ?? 0n;
    if (total <= 0n) {
      entryOf(out.owners, vault.owner).assets += vault.value;
      continue;
    }
    for (const [owner, shares] of holders.get(building) ?? [])
      entryOf(out.owners, owner).assets += (vault.value * shares) / total;
  }
}

/** 집계 때의 전투력·자산(소유 주체마다·NPC 가문원마다). source가 없으면 빈 값 */
export async function readWorth(
  db: Queryable,
  source: WorthSource | undefined,
  members: ReadonlySet<number>,
): Promise<WorthValues> {
  const out: WorthValues = { owners: new Map(), units: new Map() };
  if (!source) return out;
  await readAssets(db, source.valueOf, members, out);
  if (source.powerOf) await readPowers(db, source.powerOf, members, out);
  return out;
}

/** 값 표 줄(ranking_worth): kind 0 = 소유 주체, 1 = 세계 유닛. 둘 다 0인 주체는 뺀다 */
export function worthRows(
  values: WorthValues,
): { kind: number; id: number; power: bigint; assets: bigint }[] {
  const rows: { kind: number; id: number; power: bigint; assets: bigint }[] = [];
  for (const [kind, map] of [
    [0, values.owners],
    [1, values.units],
  ] as const)
    for (const [id, value] of [...map].toSorted((a, b) => a[0] - b[0]))
      if (value.power > 0n || value.assets > 0n) rows.push({ kind, id, ...value });
  return rows;
}

/** 값 표를 통째로 바꿔 쓴다(랭킹 집계 트랜잭션 안) */
export async function writeWorth(client: Queryable, values: WorthValues): Promise<number> {
  const rows = worthRows(values);
  await client.query(`delete from ranking_worth`);
  if (rows.length === 0) return 0;
  await client.query(
    `insert into ranking_worth (kind, subject_id, combat_power, assets)
     select * from unnest($1::smallint[], $2::bigint[], $3::bigint[], $4::bigint[])`,
    [
      rows.map((row) => row.kind),
      rows.map((row) => row.id),
      rows.map((row) => row.power.toString()),
      rows.map((row) => row.assets.toString()),
    ],
  );
  return rows.length;
}
