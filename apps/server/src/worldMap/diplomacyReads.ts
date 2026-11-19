// 1차맵 세력 외교·전황 조회(읽기만) — faction_wars(전쟁·불가침)와 war_outcomes(진행 중 점령·최근 교전지)를 아는 국가·도시 범위로 읽는다.
// 표가 없는 시험·옛 DB에서도 안전하게 빈 목록을 돌려준다.
import type { WorldMapCityOccupation, WorldMapRelation } from "@terra/shared/worldMap";
import type { QueryPool } from "../world/persist/load.ts";

/** 최근 교전지로 표시할 기간(24시간, ms) */
const RECENT_BATTLE_WINDOW_MS = 86_400_000;

/** 아는 세력 사이의 진행 중인 전쟁·유효한 불가침(faction_wars) */
export async function loadFactionRelations(
  pool: QueryPool,
  factionIds: readonly number[],
  nowMs: number,
): Promise<WorldMapRelation[]> {
  if (factionIds.length < 2) return [];
  const result = await pool
    .query(
      `select faction_a, faction_b, state, at_ms
         from faction_wars
        where faction_a = any($1::bigint[])
          and faction_b = any($1::bigint[])
          and (state = 'war' or (state = 'truce' and at_ms > $2))
        order by state asc, at_ms desc, faction_a asc, faction_b asc`,
      [factionIds, nowMs],
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const relations: WorldMapRelation[] = [];
  for (const row of result.rows) {
    const state = row.state === "war" || row.state === "truce" ? row.state : null;
    if (!state) continue;
    const factionA = Number(row.faction_a);
    const factionB = Number(row.faction_b);
    if (!Number.isFinite(factionA) || !Number.isFinite(factionB) || factionA === factionB) continue;
    relations.push({
      factionA,
      factionB,
      state,
      atMs: Number(row.at_ms ?? 0),
    });
  }
  return relations;
}

/** 아는 도시 가운데 진행 중인 약탈·점령이나 최근 24시간 안 교전 기록(war_outcomes, 도시마다 가장 최신 1건) */
export async function loadCityOccupations(
  pool: QueryPool,
  cityIds: readonly number[],
  nowMs: number,
): Promise<Map<number, WorldMapCityOccupation>> {
  if (cityIds.length === 0) return new Map();
  const sinceMs = Math.max(0, nowMs - RECENT_BATTLE_WINDOW_MS);
  const result = await pool
    .query(
      `select distinct on (city_id)
              city_id, attacker_faction_id, outcome, until_ms, ended_at_ms
         from war_outcomes
        where city_id = any($1::bigint[])
          and ((ended_at_ms is null and (until_ms is null or until_ms > $2)) or at_ms >= $3)
        order by city_id, at_ms desc, id desc`,
      [cityIds, nowMs, sinceMs],
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const occupations = new Map<number, WorldMapCityOccupation>();
  for (const row of result.rows) {
    const outcome =
      row.outcome === "loot" || row.outcome === "integrate" || row.outcome === "occupy" ? row.outcome : null;
    if (!outcome) continue;
    const cityId = Number(row.city_id);
    const attackerFactionId = Number(row.attacker_faction_id);
    if (!Number.isFinite(cityId) || !Number.isFinite(attackerFactionId)) continue;
    const untilAt = row.until_ms === null || row.until_ms === undefined ? null : Number(row.until_ms);
    const ended = row.ended_at_ms !== null && row.ended_at_ms !== undefined;
    occupations.set(cityId, {
      attackerFactionId,
      outcome,
      untilAt: untilAt !== null && Number.isFinite(untilAt) ? untilAt : null,
      recent: ended || (untilAt !== null && untilAt <= nowMs),
    });
  }
  return occupations;
}
