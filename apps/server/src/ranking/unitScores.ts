// 유닛 점수(NPC 도시 가문원) — 질문 2146 → 고침(fixes-1116l): NPC 가문 점수 = 가문원(휴먼·유닛) 실제 점수의 합(기획 D-555 1509 "NPC만으로도
// 그대로 똑같이"·D-569 1746 "랭킹은 가문별 유닛별 모두 존재"). 옛 대리값(나라 점수 × 가문원 수 ÷ 그 나라 NPC 가문원 합)을 대신한다.
// - 랭킹 집계(snapshot.ts runSnapshot)와 같은 주기·같은 트랜잭션에서 센다(가문 판을 읽을 때는 합만 — 부하를 집계 주기에 맞춘다).
// - 유닛 하나의 지표 = 그 유닛 자신이 한 것만(원장·전투 기록에서 유닛 단위로 바로 나오는 것):
//   · 전투 승리(war_wins·battle_wins): 결과를 적용한 전투에서 이긴 편에 있던 유닛마다 그 전투의 언더독 ‰(경로 판과 같은 셈 — 상대 편 유닛 수 ÷
//     이긴 편 유닛 수, 시작 자료 기준). 사람(소유 주체) 하나가 전투 하나에 한 번 받는 것처럼 휴먼 하나가 한 번 받는다. 보호 레이드는 뺀다.
//   · 바뀜(house-8, 사용자 D-576 — 질문 2221 "여러 항목을 합친다, 플레이어 가문 랭킹과 같은 항목"): 산출(production)·시설(facilities)도 센다 —
//     NPC 나라 도시의 산출(그 도시 창고·그 도시 시설 위치에 원장 produce·job_output으로 들어온 양, 그 나라 주체 몫)과 NPC가 지은 시설(지은 사람
//     없음, Σ 레벨 × 상태)을 그 도시에 사는 NPC 가문원 일꾼(경비대 빼고)에게 똑같이 나눈다(내림). 일꾼마다 일한 시설 기록이 없어 도시 단위로 나눈다
//     [임시 질문 2258]. 변환은 플레이어와 같은 measureValues(로그 압축).
//   · 도시(cities_held): 플레이어 가문 판도 가문원(사용자) 점수만 더해 가문 소유 도시를 세지 않으므로 NPC 가문원도 0(같은 항목).
// - 점수 = 경로 판과 같은 감쇠형(nextScore — 앞 점수 × (1 − 감쇠) + 이번 기간), 지금 NPC 가문원(npc_house_units)만 둔다(떠난·죽은 유닛 줄은 지운다).
import type { RankingPathInfo } from "@terra/shared/ranking";
import { type RankingCoefficients, nextScore, periodGain, underdogPm } from "@terra/sim";
import { BUILDING_LOCATION_BASE } from "@terra/shared/goodsPlaces";
import {
  type OwnerFlows,
  type OwnerStocks,
  PRODUCTION_TX_KINDS,
  type Queryable,
  measureValues,
} from "./measures.ts";

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

/** 유닛 점수 한 줄 */
export interface UnitScoreRow {
  readonly pathId: string;
  readonly unitId: number;
  readonly score: number;
}

const NO_STOCKS: OwnerStocks = { cities: 0, developmentSum: 0, facilityLevelPpm: 0n };

/** 지금 NPC 가문원(세계 유닛 ID) */
export async function readHouseUnits(db: Queryable): Promise<Set<number>> {
  const result = await db.query(`select unit_id from npc_house_units`);
  return new Set(result.rows.map((row) => num(row.unit_id)));
}

/** 앞 집계의 유닛 점수(경로 → 유닛 → 점수) */
export async function readPrevUnits(db: Queryable): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>();
  const result = await db.query(`select path_id, unit_id, score from ranking_unit_scores`);
  for (const row of result.rows) {
    const pathId = String(row.path_id);
    const map = out.get(pathId) ?? new Map<number, number>();
    map.set(num(row.unit_id), num(row.score));
    out.set(pathId, map);
  }
  return out;
}

/**
 * 집계 기간 [from, to)의 유닛 흐름 지표(전투 승리만 — 위 머리 주석). members = 셀 유닛(NPC 가문원). 전투마다 편 유닛 수로 언더독을 셈하고
 * 이긴 편의 가문원 유닛에 준다
 */
export async function readUnitFlows(
  db: Queryable,
  fromMs: number,
  toMs: number,
  capPm: number,
  members: ReadonlySet<number>,
): Promise<Map<number, OwnerFlows>> {
  const out = new Map<number, OwnerFlows>();
  if (members.size === 0) return out;
  const result = await db.query(
    `select b.id as battle, b.war, (r.result->'result'->>'winner')::int as winner,
            (u->>'id')::bigint as unit, (u->>'side')::int as side
       from world_battle_results r
       join world_battles b on b.id = r.battle_id
       cross join lateral jsonb_array_elements(b.init->'units') u
      where r.applied_at_ms >= $1 and r.applied_at_ms < $2
        and not exists (select 1 from gardener_waves w where w.battle_id = b.id and w.kind = 'protection')
      order by b.id`,
    [fromMs, toMs],
  );
  const battles = new Map<
    number,
    { war: boolean; winner: number; units: { unit: number; side: number }[] }
  >();
  for (const row of result.rows) {
    const id = num(row.battle);
    const battle = battles.get(id) ?? { war: row.war === true, winner: num(row.winner), units: [] };
    battle.units.push({ unit: num(row.unit), side: num(row.side) });
    battles.set(id, battle);
  }
  for (const battle of battles.values()) {
    const won = battle.units.filter((entry) => entry.side === battle.winner);
    const enemy = battle.units.length - won.length;
    const points = underdogPm(enemy, won.length, capPm);
    if (points <= 0) continue;
    for (const entry of won) {
      if (!members.has(entry.unit)) continue;
      const flows = out.get(entry.unit) ?? { production: 0n, warWinsPm: 0, battleWinsPm: 0 };
      if (battle.war) flows.warWinsPm += points;
      else flows.battleWinsPm += points;
      out.set(entry.unit, flows);
    }
  }
  return out;
}

/** NPC 가문원 일꾼이 사는 도시 → 유닛들(경비대·노숙 빼고, 유닛 ID 차례) */
export async function readMemberCities(
  db: Queryable,
  members: ReadonlySet<number>,
): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (members.size === 0) return out;
  const result = await db.query(
    `select u.unit_id, h.city_id from npc_house_units u join world_humans h on h.unit_id = u.unit_id
      where h.city_id is not null and h.guard = false order by u.unit_id`,
  );
  for (const row of result.rows) {
    const unitId = num(row.unit_id);
    if (!members.has(unitId)) continue;
    const cityId = num(row.city_id);
    out.set(cityId, [...(out.get(cityId) ?? []), unitId]);
  }
  return out;
}

const big = (value: unknown): bigint =>
  typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : BigInt(Math.trunc(num(value)));

/**
 * NPC 나라 도시의 일(위 머리 주석 — D-576): 기간 [from, to)의 도시 산출과 지금 NPC 시설을 그 도시 가문원 일꾼에게 똑같이 나눠 flows(산출)·stocks(시설)에
 * 더한다. flows는 전투 승리 지표를 담은 같은 표(유닛 → 흐름)
 */
export async function addCityWork(
  db: Queryable,
  fromMs: number,
  toMs: number,
  cities: ReadonlyMap<number, readonly number[]>,
  flows: Map<number, OwnerFlows>,
): Promise<Map<number, OwnerStocks>> {
  const stocks = new Map<number, OwnerStocks>();
  if (cities.size === 0) return stocks;
  const [production, facilities] = await Promise.all([
    db.query(
      `select oc.id as city_id, sum(e.amount)::text as qty
         from ledger_entries e
         join ledger_transactions t on t.id = e.tx_id
         join ledger_accounts a on a.id = e.account_id
         left join world_facilities f on a.location = $4::bigint + f.building_id
         join world_cities oc on oc.id = coalesce(f.city_id, case when a.location < $4::bigint then a.location end)
         join factions n on n.id = oc.faction_id and n.kind = 'npc'
         join world_owners o on o.id = a.owner_id and o.faction_id = oc.faction_id
        where t.kind = any($1::text[]) and t.at_ms >= $2 and t.at_ms < $3 and e.amount > 0 and a.location > 0
        group by oc.id`,
      [PRODUCTION_TX_KINDS, fromMs, toMs, BUILDING_LOCATION_BASE],
    ),
    db.query(
      `select f.city_id, sum(f.level::bigint * f.condition_ppm)::text as v
         from world_facilities f join world_cities c on c.id = f.city_id
         join factions n on n.id = c.faction_id and n.kind = 'npc'
        where f.level >= 1 and f.built_by is null
        group by f.city_id`,
    ),
  ]);
  for (const row of production.rows) {
    const units = cities.get(num(row.city_id)) ?? [];
    if (units.length === 0) continue;
    const share = big(row.qty) / BigInt(units.length);
    if (share <= 0n) continue;
    for (const unitId of units) {
      const entry = flows.get(unitId) ?? { production: 0n, warWinsPm: 0, battleWinsPm: 0 };
      entry.production += share;
      flows.set(unitId, entry);
    }
  }
  for (const row of facilities.rows) {
    const units = cities.get(num(row.city_id)) ?? [];
    if (units.length === 0) continue;
    const share = big(row.v) / BigInt(units.length);
    if (share <= 0n) continue;
    for (const unitId of units) stocks.set(unitId, { ...NO_STOCKS, facilityLevelPpm: share });
  }
  return stocks;
}

/** 다음 유닛 점수(순수 함수 — DB 없이 시험한다). 연 경로·지표가 있는 경로만, 지금 가문원만, 점수 0은 뺀다 */
export function computeUnitScores(input: {
  readonly paths: readonly RankingPathInfo[];
  readonly prev: ReadonlyMap<string, ReadonlyMap<number, number>>;
  readonly flows: ReadonlyMap<number, OwnerFlows>;
  /** 유닛 재고 지표(NPC 시설 몫 — addCityWork). 없으면 0 */
  readonly stocks?: ReadonlyMap<number, OwnerStocks> | undefined;
  readonly members: ReadonlySet<number>;
  readonly coefficients: Pick<RankingCoefficients, "decayPm">;
  readonly periods: number;
}): UnitScoreRow[] {
  const rows: UnitScoreRow[] = [];
  for (const path of input.paths) {
    if (!path.open || path.measures.length === 0) continue;
    const prev = input.prev.get(path.id) ?? new Map<number, number>();
    const subjects = [
      ...new Set<number>([...prev.keys(), ...input.flows.keys(), ...(input.stocks?.keys() ?? [])]),
    ]
      .filter((unitId) => input.members.has(unitId))
      .toSorted((a, b) => a - b);
    for (const unitId of subjects) {
      const flows = input.flows.get(unitId) ?? { production: 0n, warWinsPm: 0, battleWinsPm: 0 };
      const gain = periodGain(measureValues(flows, input.stocks?.get(unitId) ?? NO_STOCKS), path.measures);
      const score = nextScore(prev.get(unitId) ?? 0, gain, input.coefficients.decayPm, input.periods);
      if (score > 0) rows.push({ pathId: path.id, unitId, score });
    }
  }
  return rows;
}

/** 유닛 점수를 통째로 바꿔 쓴다(랭킹 집계 트랜잭션 안) */
export async function writeUnitScores(client: Queryable, rows: readonly UnitScoreRow[]): Promise<void> {
  await client.query(`delete from ranking_unit_scores`);
  if (rows.length === 0) return;
  await client.query(
    `insert into ranking_unit_scores (path_id, unit_id, score)
     select * from unnest($1::text[], $2::bigint[], $3::bigint[])`,
    [rows.map((row) => row.pathId), rows.map((row) => row.unitId), rows.map((row) => row.score)],
  );
}
