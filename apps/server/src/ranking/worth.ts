// 랭킹 전투력·자산 지표(집계 때 한 번) — 기획 D-576 "NPC 가문 점수는 전투력, 자산 등 여러 항목, 플레이어 가문 랭킹과 같은 항목"(질문 2258 다안 —
// 코디네이터 전달 2026-11-16), D-7022(수치형 지표는 버프를 뺀 기본값), D-555 1512(사업장 금고는 지분만큼 각 주주의 재산·순위에), D-097(유닛 지갑은
// 유닛의 사유재산). docs/adr/2026-11-07-ranking.md "바뀜 (house-9)". 읽기만 한다(쓰기는 snapshot.ts 트랜잭션).
// - 전투력: 세계 유닛(world_units, 배 빼고)마다 버프·부상을 뺀 몸(사이보그 = 저장된 본체, 그 밖 = 유닛 화면과 같은 [임시] 기본 몸 + 입은 장비)의
//   조우 전력 식((최대 HP + 아머 + 쉴드) × 공격력 × 1000 ÷ 공격 간격 — travel/clashDecide.ts clashPower). 소유 주체 = 가진 유닛 합, NPC 가문원 =
//   그 유닛 값. 몸을 셀 수 없으면(세계 준비 전·시험) 0.
// - 자산(기준 통화 최소 단위): 소유 주체 계정마다 — 화폐는 환전 시세로 기준 통화에(지난 체결가, 없으면 1:1), 물건은 시세(거래소 마지막 체결가의
//   평균 → 기준 통화, 없으면 팩 시작 시세) × 양 ÷ 묶음 크기, 사업장 금고(건물 위치 화폐)는 지분만큼 주주에게(발행 전이면 주인 전부), 지분 자산 자체는
//   금고로 세므로 따로 값을 매기지 않는다. 유닛 지갑(유닛 화물 위치 화폐)은 그 유닛 몫(주인 자산에 넣지 않는다 — D-097).
// - NPC 몫을 나누는 단위: 가문원 유닛마다(그 유닛 전투력 + 그 유닛 지갑). 가문 판은 가문원 합(질문 2311).
// - 부하: 큰 표를 들고 있지 않는다 — 원장은 SQL에서 (주체, 자산[, 지갑 유닛·금고 건물])로 묶어 읽고, 유닛은 한 번 훑으며 256개마다 이벤트 루프에
//   양보한다. 결과 표는 집계가 쓰고 버린다.
// 바뀜(house-10, 기획 대조 2313 — D-576·D-338 "가문 금고·지도자 지갑은 가문 재산", 걸어 둔 주문 몫은 기술 판단 "넣는다"):
// - 걸어 둔 주문 몫: 물자 거래소(market_orders — 사기 = 묶인 화폐, 팔기 = 묶인 물건)·환전(fx_orders — 사기 = 기준 통화, 팔기 = 그 화폐)·사업장 지분
//   (business_share_orders — 사기 = 기준 통화, 팔기 = 지분 → 금고 몫을 그 주주에게) 가운데 걸린(open) 주문의 locked를 주문 낸 사람 자산으로 센다. 표에서
//   읽는다(거래소 메모리 표를 건드리지 않는다 — 읽기가 거래소를 만들지 않는다).
// - 가문 금고(원장 시스템 계정 vault:house:<세력 행 ID>:… = 플레이어 가문, vault:house:npc:<NPC 가문 ID>:… = NPC 지배 가문)는 그 가문 몫(houses·npcHouses).
// - 국가 지도자(NPC 지배 가문장 — 가문원 줄이 없는 유닛)의 지갑·전투력은 그 지배 가문 몫(npcHouses — 출처 rulingHeads). 나라 줄 전투력에도 그대로 든다.
// 바뀜(house-10, 기획 대조 2316 — D-569 1746 "랭킹은 가문별 유닛별 모두 존재"): 유닛 몫(units)을 가문원만이 아니라 모든 유닛에 센다(유닛 판). 유닛마다
// 주인·이름(사이보그 본체 = 사이보그 이름, 그 밖 = 출처 nameOf — NPC 휴먼 이름)을 함께 싣는다.
import { parseBusinessShareAsset } from "@terra/shared/businessBooks";
import { BUILDING_LOCATION_BASE } from "@terra/shared/goodsPlaces";
import { parseHouseVaultCode } from "../factionIdentity/houseVault.ts";
import type { Queryable } from "./measures.ts";

/** 배(world_units.kind — world/unitKinds.ts UNIT_KIND_BOAT). 사람이 아니라 전투력에서 뺀다 */
const BOAT_KIND = 8;
/** 사이보그 본체(world/unitKinds.ts UNIT_KIND_CYBORG) — 이름 = 사이보그 이름 */
const CYBORG_KIND = 3;
/** 유닛 몇 개마다 이벤트 루프에 양보하나 */
const YIELD_EVERY = 256;

/** 전투력·자산 셈에 세계가 빌려 주는 것 */
export interface WorthSource {
  /** 버프·부상을 뺀 유닛 하나의 전투력(셀 수 없으면 0) */
  readonly powerOf?: ((unitId: number) => number) | undefined;
  /** 자산 qty를 기준 통화 최소 단위로(모르면 0) */
  readonly valueOf: (asset: string, qty: bigint) => bigint;
  /** NPC 지배 가문과 그 가문장(국가 지도자 유닛). 없으면 지도자 몫을 가문에 넣지 않는다 */
  readonly rulingHeads?: (() => Iterable<{ readonly house: number; readonly unit: number }>) | undefined;
  /** 유닛 이름(NPC 휴먼 이름 등). 없거나 모르면 null */
  readonly nameOf?: ((unitId: number) => string | undefined) | undefined;
}

/** 주체 하나의 값 */
export interface WorthValue {
  power: bigint;
  assets: bigint;
}

/** 유닛 줄의 주인·이름(유닛 판) */
export interface WorthUnitInfo {
  owner: number;
  name: string | null;
}

export interface WorthValues {
  /** 소유 주체 ID → 값 */
  readonly owners: Map<number, WorthValue>;
  /** 세계 유닛 ID → 값(모든 유닛 — 유닛 판·NPC 가문원 합) */
  readonly units: Map<number, WorthValue>;
  /** 세계 유닛 ID → 주인·이름 */
  readonly unitInfo: Map<number, WorthUnitInfo>;
  /** 플레이어 가문(세력 행 ID) → 가문 금고 */
  readonly houses: Map<number, WorthValue>;
  /** NPC 가문 ID → 가문 금고 + 가문장(국가 지도자) 지갑·전투력 */
  readonly npcHouses: Map<number, WorthValue>;
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

/** 빈 값 표 */
export const emptyWorth = (): WorthValues => ({
  owners: new Map(),
  units: new Map(),
  unitInfo: new Map(),
  houses: new Map(),
  npcHouses: new Map(),
});

/** 유닛 훑기: 주인·이름, 전투력(소유 주체 합, 유닛마다, 지도자는 지배 가문에도) */
async function readUnits(
  db: Queryable,
  source: WorthSource,
  leaders: ReadonlyMap<number, number>,
  out: WorthValues,
): Promise<void> {
  const result = await db.query(
    `select u.id, u.owner_id, u.kind, c.name as cyborg_name
       from world_units u
       left join world_owners o on o.id = u.owner_id and u.kind = $2
       left join cyborgs c on c.user_id = o.user_id
      where u.kind <> $1 order by u.id`,
    [BOAT_KIND, CYBORG_KIND],
  );
  let count = 0;
  for (const row of result.rows) {
    count += 1;
    if (count % YIELD_EVERY === 0) await yieldLoop();
    const unitId = num(row.id);
    const owner = num(row.owner_id);
    const cyborgName = typeof row.cyborg_name === "string" ? row.cyborg_name : undefined;
    out.unitInfo.set(unitId, { owner, name: cyborgName ?? source.nameOf?.(unitId) ?? null });
    const power = source.powerOf?.(unitId) ?? 0;
    if (!(power > 0)) continue;
    const value = BigInt(Math.trunc(power));
    entryOf(out.owners, owner).power += value;
    entryOf(out.units, unitId).power += value;
    const house = leaders.get(unitId);
    if (house !== undefined) entryOf(out.npcHouses, house).power += value;
  }
}

/** 걸어 둔 주문 몫(위 머리 주석 바뀜 house-10): 주문 낸 사람·자산·묶인 양. credit = 기준 통화(환전·지분 사기가 묶는 돈) */
const ORDERS_SQL = `select o.owner_id, case when o.side = 'sell' then 'item:' || b.item else coalesce(b.currency, $1) end as asset,
         sum(o.locked)::text as qty
    from market_orders o join market_books b on b.id = o.market_id
   where o.state = 'open' and o.locked > 0 group by 1, 2
  union all
  select o.owner_id, case when o.side = 'buy' then $1 else p.currency end, sum(o.locked)::text
    from fx_orders o join fx_pairs p on p.id = o.pair_id
   where o.state = 'open' and o.locked > 0 group by 1, 2
  union all
  select owner_id, case when side = 'buy' then $1 else 'share:biz_' || building_id end, sum(locked)::text
    from business_share_orders where state = 'open' and locked > 0 group by 1, 2`;

/**
 * 원장 자산(위 머리 주석). 지분 자산(share:…)은 화폐·물건이 아니므로 SQL이 지갑·금고 칸을 나누지 않는다 — 화폐 판정은 아이템·지분이 아닌 것으로
 * 거칠게 묶고 값은 valueOf가 매긴다(물건이 아닌 알 수 없는 자산은 0)
 */
async function readAssets(
  db: Queryable,
  valueOf: WorthSource["valueOf"],
  leaders: ReadonlyMap<number, number>,
  creditAsset: string,
  out: WorthValues,
): Promise<void> {
  const [accounts, issued, vaultRows, orders] = await Promise.all([
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
    db.query(
      `select system_code, asset, balance::text as qty from ledger_accounts
        where system_code like 'vault:house:%' and balance > 0`,
    ),
    db.query(ORDERS_SQL, [creditAsset]),
  ]);
  /** 건물 → 금고 주인·값 */
  const vaults = new Map<number, { owner: number; value: bigint }>();
  /** 건물 → 주주 → 주 수 */
  const holders = new Map<number, Map<number, bigint>>();
  const addShares = (building: number, owner: number, qty: bigint): void => {
    const map = holders.get(building) ?? new Map<number, bigint>();
    map.set(owner, (map.get(owner) ?? 0n) + qty);
    holders.set(building, map);
  };
  for (const row of accounts.rows) {
    const owner = num(row.owner_id);
    const asset = String(row.asset);
    const qty = big(row.qty);
    if (row.purse_unit !== null && row.purse_unit !== undefined) {
      const unitId = num(row.purse_unit);
      const value = valueOf(asset, qty);
      entryOf(out.units, unitId).assets += value;
      const house = leaders.get(unitId);
      if (house !== undefined) entryOf(out.npcHouses, house).assets += value;
      if (!out.unitInfo.has(unitId)) out.unitInfo.set(unitId, { owner, name: null });
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
      addShares(shareOf, owner, qty);
      continue;
    }
    entryOf(out.owners, owner).assets += valueOf(asset, qty);
  }
  // 걸어 둔 주문 몫 → 주문 낸 사람(지분 팔기는 그 사람의 주 수로 — 금고 몫을 받는다)
  for (const row of orders.rows) {
    const owner = num(row.owner_id);
    const asset = String(row.asset);
    const qty = big(row.qty);
    const shareOf = parseBusinessShareAsset(asset);
    if (shareOf !== undefined) addShares(shareOf, owner, qty);
    else entryOf(out.owners, owner).assets += valueOf(asset, qty);
  }
  // 가문 금고 → 그 가문(플레이어 = 세력 행 ID, NPC = NPC 가문 ID)
  for (const row of vaultRows.rows) {
    const code = String(row.system_code);
    const value = valueOf(String(row.asset), big(row.qty));
    const npc = /^vault:house:npc:(\d+):/.exec(code);
    if (npc) {
      entryOf(out.npcHouses, Number(npc[1])).assets += value;
      continue;
    }
    const player = parseHouseVaultCode(code);
    if (player) entryOf(out.houses, player.houseId).assets += value;
  }
  const issuedOf = new Map<number, bigint>();
  for (const row of issued.rows) {
    const match = /^issue:share:biz_(\d+)$/.exec(String(row.system_code));
    if (match) issuedOf.set(Number(match[1]), big(row.issued));
  }
  // 사업장 금고 → 지분만큼(D-555 1512). 발행 전이면 금고 주인 전부. 팔기 주문에 걸린 주는 주문 낸 사람 몫(위)
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

/**
 * 집계 때의 전투력·자산(소유 주체마다·유닛마다·가문마다). source가 없으면 빈 값. creditAsset = 기준 통화(환전·지분 사기 주문이 묶는 돈).
 * 유닛 몫은 가문원만이 아니라 모든 유닛에 센다(house-10 — 가문 판은 가문원 줄만 골라 더한다)
 */
export async function readWorth(
  db: Queryable,
  source: WorthSource | undefined,
  creditAsset: string,
): Promise<WorthValues> {
  const out = emptyWorth();
  if (!source) return out;
  const leaders = new Map<number, number>();
  for (const head of source.rulingHeads?.() ?? []) leaders.set(head.unit, head.house);
  await readUnits(db, source, leaders, out);
  await readAssets(db, source.valueOf, leaders, creditAsset, out);
  return out;
}

/** 값 표 줄(ranking_worth): kind 0 = 소유 주체, 1 = 세계 유닛, 2 = 플레이어 가문, 3 = NPC 가문. 둘 다 0인 주체는 뺀다 */
export interface WorthRow {
  readonly kind: number;
  readonly id: number;
  readonly power: bigint;
  readonly assets: bigint;
  readonly owner: number | null;
  readonly name: string | null;
}

export function worthRows(values: WorthValues): WorthRow[] {
  const rows: WorthRow[] = [];
  for (const [kind, map] of [
    [0, values.owners],
    [1, values.units],
    [2, values.houses],
    [3, values.npcHouses],
  ] as const)
    for (const [id, value] of [...map].toSorted((a, b) => a[0] - b[0])) {
      if (value.power <= 0n && value.assets <= 0n) continue;
      const info = kind === 1 ? values.unitInfo.get(id) : undefined;
      rows.push({ kind, id, ...value, owner: info?.owner ?? null, name: info?.name ?? null });
    }
  return rows;
}

/** 값 표를 통째로 바꿔 쓴다(랭킹 집계 트랜잭션 안) */
export async function writeWorth(client: Queryable, values: WorthValues): Promise<number> {
  const rows = worthRows(values);
  await client.query(`delete from ranking_worth`);
  if (rows.length === 0) return 0;
  await client.query(
    `insert into ranking_worth (kind, subject_id, combat_power, assets, owner_id, name)
     select * from unnest($1::smallint[], $2::bigint[], $3::bigint[], $4::bigint[], $5::bigint[], $6::text[])`,
    [
      rows.map((row) => row.kind),
      rows.map((row) => row.id),
      rows.map((row) => row.power.toString()),
      rows.map((row) => row.assets.toString()),
      rows.map((row) => row.owner),
      rows.map((row) => row.name),
    ],
  );
  return rows.length;
}
