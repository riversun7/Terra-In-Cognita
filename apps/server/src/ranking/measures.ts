// 랭킹 지표 읽기 — 원장·전투 기록·세계 표에서 바로 센다(D-392 "지표가 원장·전투 기록에서 바로 나오는 경로부터"). 읽기만 한다.
// docs/adr/2026-11-07-ranking.md 3절. 흐름 지표는 집계 기간 [from, to) 안의 기록, 재고 지표는 집계 때의 값이다.
// - 산출(production): 원장 거래 종류 job_output·produce가 소유 주체 계정에 넣은 양(+)의 합. 자산을 가리지 않는다 [임시]
// - 전투 승리(war_wins·battle_wins): 결과를 적용한 전투(world_battle_results)마다 이긴 편의 소유 주체(편 faction = 소유 주체 ID,
//   src/world/battleResults.ts)에 언더독 ‰(상대 편 유닛 수 ÷ 내 편 유닛 수, 시작 자료 기준 — 도중 참전은 세지 않는다 [임시]).
//   전쟁 전투(world_battles.war)는 war_wins, 그 밖(웨이브 방어 포함)은 battle_wins. 정원사 편(소유 주체가 아님)은 받지 않는다
// - 도시(cities_held): 세력이 가진 도시 수·발전도 합 → 그 세력의 소유 주체
// - 시설(facilities): 지은 사람(world_facilities.built_by)의 소유 주체에 Σ 레벨 × 상태(ppm), 다 지은 것(레벨 1 이상)만
// - 세력 규모(세력 판): 사라지지 않은 세력마다 도시·발전도·휴먼(그 세력 도시에 사는)·국고(시험 화폐, 위치 없는 계정)·명성(정원사 2)
// - 보호 레이드(D-500, gardener_waves.kind = protection) 전투는 랭킹 점수가 없다 → 전투 승리에서 뺀다
import { underdogPm } from "@terra/sim";

/** pg Pool·Client 모양(query만) */
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const big = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  return 0n;
};

/** 산출로 치는 원장 거래 종류(정산 산출 job_output, 생산 produce) */
export const PRODUCTION_TX_KINDS: readonly string[] = ["job_output", "produce"];

/** 소유 주체마다 흐름 지표 원값 */
export interface OwnerFlows {
  production: bigint;
  warWinsPm: number;
  battleWinsPm: number;
}

/** 소유 주체마다 재고 지표 원값 */
export interface OwnerStocks {
  cities: number;
  developmentSum: number;
  facilityLevelPpm: bigint;
}

const emptyFlows = (): OwnerFlows => ({ production: 0n, warWinsPm: 0, battleWinsPm: 0 });
const emptyStocks = (): OwnerStocks => ({ cities: 0, developmentSum: 0, facilityLevelPpm: 0n });

/** 있는 소유 주체 ID */
async function ownerIds(db: Queryable): Promise<Set<number>> {
  const result = await db.query(`select id from world_owners`);
  return new Set(result.rows.map((row) => num(row.id)));
}

async function readProduction(db: Queryable, fromMs: number, toMs: number, into: Map<number, OwnerFlows>) {
  const result = await db.query(
    `select a.owner_id, sum(e.amount)::text as qty
       from ledger_entries e
       join ledger_transactions t on t.id = e.tx_id
       join ledger_accounts a on a.id = e.account_id
      where t.kind = any($1::text[]) and t.at_ms >= $2 and t.at_ms < $3 and a.owner_id is not null and e.amount > 0
      group by a.owner_id`,
    [PRODUCTION_TX_KINDS, fromMs, toMs],
  );
  for (const row of result.rows) {
    const owner = num(row.owner_id);
    const flows = into.get(owner) ?? emptyFlows();
    flows.production += big(row.qty);
    into.set(owner, flows);
  }
}

interface BattleSideRow {
  readonly battle: number;
  readonly war: boolean;
  readonly winner: number;
  readonly side: number;
  readonly owner: number;
  readonly units: number;
}

async function readBattles(
  db: Queryable,
  fromMs: number,
  toMs: number,
  capPm: number,
  owners: ReadonlySet<number>,
  into: Map<number, OwnerFlows>,
) {
  const result = await db.query(
    `select b.id as battle, b.war, (r.result->'result'->>'winner')::int as winner,
            (s->>'id')::int as side, (s->>'faction')::bigint as owner,
            (select count(*)::int from jsonb_array_elements(b.init->'units') u where u->>'side' = s->>'id') as units
       from world_battle_results r
       join world_battles b on b.id = r.battle_id
       cross join lateral jsonb_array_elements(b.init->'sides') s
      where r.applied_at_ms >= $1 and r.applied_at_ms < $2
        and not exists (select 1 from gardener_waves w where w.battle_id = b.id and w.kind = 'protection')
      order by b.id, side`,
    [fromMs, toMs],
  );
  const battles = new Map<number, BattleSideRow[]>();
  for (const row of result.rows) {
    const side: BattleSideRow = {
      battle: num(row.battle),
      war: row.war === true,
      winner: num(row.winner),
      side: num(row.side),
      owner: num(row.owner),
      units: num(row.units),
    };
    const list = battles.get(side.battle) ?? [];
    list.push(side);
    battles.set(side.battle, list);
  }
  for (const sides of battles.values()) {
    const winner = sides.find((side) => side.side === side.winner);
    if (!winner || !owners.has(winner.owner)) continue;
    const enemy = sides
      .filter((side) => side.side !== winner.side)
      .reduce((sum, side) => sum + side.units, 0);
    const points = underdogPm(enemy, winner.units, capPm);
    if (points <= 0) continue;
    const flows = into.get(winner.owner) ?? emptyFlows();
    if (winner.war) flows.warWinsPm += points;
    else flows.battleWinsPm += points;
    into.set(winner.owner, flows);
  }
}

/** 집계 기간 [from, to)의 흐름 지표(소유 주체마다) */
export async function readFlows(
  db: Queryable,
  fromMs: number,
  toMs: number,
  underdogCapPm: number,
): Promise<Map<number, OwnerFlows>> {
  const flows = new Map<number, OwnerFlows>();
  const owners = await ownerIds(db);
  await readProduction(db, fromMs, toMs, flows);
  await readBattles(db, fromMs, toMs, underdogCapPm, owners, flows);
  return flows;
}

/** 집계 때의 재고 지표(소유 주체마다) */
export async function readStocks(db: Queryable): Promise<Map<number, OwnerStocks>> {
  const stocks = new Map<number, OwnerStocks>();
  const cities = await db.query(
    `select o.id as owner_id, count(*)::int as cities, coalesce(sum(c.development), 0)::int as dev
       from world_cities c join world_owners o on o.faction_id = c.faction_id
      group by o.id`,
  );
  for (const row of cities.rows) {
    const owner = num(row.owner_id);
    const stock = stocks.get(owner) ?? emptyStocks();
    stock.cities = num(row.cities);
    stock.developmentSum = num(row.dev);
    stocks.set(owner, stock);
  }
  const facilities = await db.query(
    `select o.id as owner_id, sum(f.level::bigint * f.condition_ppm)::text as v
       from world_facilities f join world_owners o on o.user_id = f.built_by
      where f.level >= 1
      group by o.id`,
  );
  for (const row of facilities.rows) {
    const owner = num(row.owner_id);
    const stock = stocks.get(owner) ?? emptyStocks();
    stock.facilityLevelPpm = big(row.v);
    stocks.set(owner, stock);
  }
  return stocks;
}

/** 세력 하나의 규모(세력 판) */
export interface FactionScaleRow {
  readonly factionId: number;
  readonly cities: number;
  readonly developmentSum: number;
  readonly humans: number;
  readonly treasury: bigint;
  /** 세력 명성(정원사 2가 쌓은 값, 없으면 null). 세력 판 점수에 더하지 않고 따로 보인다(질문 427 가) */
  readonly renown: number | null;
}

/** 사라지지 않은 세력마다 규모. 국고 = 그 세력 소유 주체의 creditAsset 위치 없는 계정 잔고 */
export async function readFactionScales(db: Queryable, creditAsset: string): Promise<FactionScaleRow[]> {
  const result = await db.query(
    `select f.id,
            (select count(*)::int from world_cities c where c.faction_id = f.id) as cities,
            (select coalesce(sum(c.development), 0)::int from world_cities c where c.faction_id = f.id) as dev,
            (select count(*)::int from world_humans h join world_cities c on c.id = h.city_id where c.faction_id = f.id) as humans,
            (select coalesce(sum(a.balance), 0)::text from ledger_accounts a join world_owners o on o.id = a.owner_id
              where o.faction_id = f.id and a.asset = $1 and a.location is null) as treasury
       from factions f
      where f.dissolved_at_ms is null
      order by f.id`,
    [creditAsset],
  );
  const renown = await readFactionRenown(db);
  return result.rows.map((row) => ({
    factionId: num(row.id),
    cities: num(row.cities),
    developmentSum: num(row.dev),
    humans: num(row.humans),
    treasury: big(row.treasury),
    renown: renown.get(num(row.id)) ?? null,
  }));
}

/**
 * 세력 명성(정원사 2, D-499 → 질문 394 "다"): npc_society.gardener의 renown = [세력 소유 주체 ID, 값] 쌍 → 세력 ID마다 값.
 * 쌓은 적 없는 세력은 없다(화면 "명성 아직 없음")
 */
async function readFactionRenown(db: Queryable): Promise<Map<number, number>> {
  const result = await db.query(
    `select o.faction_id, (r->>1)::bigint as renown
       from npc_society s
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(s.gardener->'renown') = 'array' then s.gardener->'renown' else '[]'::jsonb end
       ) r
       join world_owners o on o.id = (r->>0)::bigint
      where s.id = 1 and o.faction_id is not null and jsonb_typeof(r) = 'array'`,
  );
  return new Map(result.rows.map((row) => [num(row.faction_id), num(row.renown)]));
}
