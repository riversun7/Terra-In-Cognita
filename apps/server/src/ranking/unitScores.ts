// 유닛 점수(NPC 도시 가문원) — 질문 2146 → 고침(fixes-1116l): NPC 가문 점수 = 가문원(휴먼·유닛) 실제 점수의 합(기획 D-555 1509 "NPC만으로도
// 그대로 똑같이"·D-569 1746 "랭킹은 가문별 유닛별 모두 존재"). 옛 대리값(나라 점수 × 가문원 수 ÷ 그 나라 NPC 가문원 합)을 대신한다.
// - 랭킹 집계(snapshot.ts runSnapshot)와 같은 주기·같은 트랜잭션에서 센다(가문 판을 읽을 때는 합만 — 부하를 집계 주기에 맞춘다).
// - 유닛 하나의 지표 = 그 유닛 자신이 한 것만(원장·전투 기록에서 유닛 단위로 바로 나오는 것):
//   · 전투 승리(war_wins·battle_wins): 결과를 적용한 전투에서 이긴 편에 있던 유닛마다 그 전투의 언더독 ‰(경로 판과 같은 셈 — 상대 편 유닛 수 ÷
//     이긴 편 유닛 수, 시작 자료 기준). 사람(소유 주체) 하나가 전투 하나에 한 번 받는 것처럼 휴먼 하나가 한 번 받는다. 보호 레이드는 뺀다.
//   · 도시(cities_held)·산출(production)·시설(facilities): NPC 휴먼은 도시·시설·원장 계정의 주인이 아니라 0(일한 산출은 고용한 나라 주체 몫 —
//     플레이어 유닛의 산출이 그 주인 몫인 것과 같다) [임시 질문 2221].
// - 점수 = 경로 판과 같은 감쇠형(nextScore — 앞 점수 × (1 − 감쇠) + 이번 기간), 지금 NPC 가문원(npc_house_units)만 둔다(떠난·죽은 유닛 줄은 지운다).
import type { RankingPathInfo } from "@terra/shared/ranking";
import { type RankingCoefficients, nextScore, periodGain, underdogPm } from "@terra/sim";
import { type OwnerFlows, type OwnerStocks, type Queryable, measureValues } from "./measures.ts";

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

/** 다음 유닛 점수(순수 함수 — DB 없이 시험한다). 연 경로·지표가 있는 경로만, 지금 가문원만, 점수 0은 뺀다 */
export function computeUnitScores(input: {
  readonly paths: readonly RankingPathInfo[];
  readonly prev: ReadonlyMap<string, ReadonlyMap<number, number>>;
  readonly flows: ReadonlyMap<number, OwnerFlows>;
  readonly members: ReadonlySet<number>;
  readonly coefficients: Pick<RankingCoefficients, "decayPm">;
  readonly periods: number;
}): UnitScoreRow[] {
  const rows: UnitScoreRow[] = [];
  for (const path of input.paths) {
    if (!path.open || path.measures.length === 0) continue;
    const prev = input.prev.get(path.id) ?? new Map<number, number>();
    const subjects = [...new Set<number>([...prev.keys(), ...input.flows.keys()])]
      .filter((unitId) => input.members.has(unitId))
      .toSorted((a, b) => a - b);
    for (const unitId of subjects) {
      const flows = input.flows.get(unitId) ?? { production: 0n, warWinsPm: 0, battleWinsPm: 0 };
      const gain = periodGain(measureValues(flows, NO_STOCKS), path.measures);
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
