// NPC 사회 런타임의 DB 읽기 — docs/adr/2026-11-01-npc-brain-r5.md 7절
// 부팅 때 한 번(쓰기 대기열이 돌기 전, 월드 복구 뒤): NPC 세력·소유 주체·도시·휴먼·전쟁·런타임 상태 한 줄과 예비 세력 행.
// int8은 pg가 문자열로 주므로 숫자로 바꾼다.
import type { QueryPool } from "../world/persist/load.ts";

export interface NpcFactionRow {
  readonly rowId: number;
  readonly ownerId: number;
  readonly code: string;
  readonly regime: "dictatorship" | "democracy" | "capitalism";
  readonly fixed: boolean;
  readonly parentRowId: number | null;
  readonly techLevel: number;
  readonly techBlueprint: number;
  readonly researchProgress: number;
  readonly traits: number[] | null;
  readonly aiStep: number;
  readonly rebelOfRowId: number | null;
}

export interface NpcCityRow {
  readonly id: number;
  readonly factionRowId: number;
  readonly planetId: string;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly start: boolean;
  readonly housing: number;
  readonly researchLevel: number;
  readonly foundedAtMs: number;
  readonly development: number;
  readonly nextRebellionMs: number;
}

export interface NpcHumanRow {
  readonly unitId: number;
  readonly cityId: number;
  readonly satisfactionMilli: number;
  readonly bornAtMs: number;
  readonly lifespanMs: number;
  readonly rebirths: number;
}

export interface NpcWarRow {
  readonly a: number;
  readonly b: number;
  readonly state: "war" | "truce";
  readonly atMs: number;
}

export interface NpcState {
  readonly factions: NpcFactionRow[];
  readonly cities: NpcCityRow[];
  readonly humans: NpcHumanRow[];
  readonly wars: NpcWarRow[];
  readonly society: { seed: number; day: number } | null;
  /** 예비 세력 행(이름 없음·사라짐 표시, 소유 주체 있음): 새 세력이 동기로 ID를 받는 자리 */
  readonly spares: { rowId: number; ownerId: number }[];
  readonly maxCityId: number;
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const regimeOf = (value: unknown): NpcFactionRow["regime"] =>
  value === "dictatorship" || value === "capitalism" ? value : "democracy";

export async function loadNpcState(pool: QueryPool): Promise<NpcState> {
  const [factions, cities, humans, wars, society, spares, maxCity] = await Promise.all([
    pool.query(
      `select f.id, o.id as owner_id, f.code, f.regime, f.fixed, f.parent_id, f.tech_level, f.tech_blueprint,
              f.research_progress, f.traits, f.ai_step, f.rebel_of
       from factions f join world_owners o on o.faction_id = f.id
       where f.kind = 'npc' and f.dissolved_at_ms is null and f.code is not null order by f.id`,
    ),
    pool.query(
      `select id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms,
              development, next_rebellion_ms from world_cities order by id`,
    ),
    pool.query(
      `select unit_id, city_id, satisfaction_milli, born_at_ms, lifespan_ms, rebirths from world_humans order by unit_id`,
    ),
    pool.query(`select faction_a, faction_b, state, at_ms from faction_wars order by faction_a, faction_b`),
    pool.query(`select seed, day from npc_society where id = 1`),
    pool.query(
      `select f.id, o.id as owner_id from factions f join world_owners o on o.faction_id = f.id
       where f.kind = 'npc' and f.code is null and f.dissolved_at_ms is not null order by f.id`,
    ),
    pool.query(`select coalesce(max(id), 0) as id from world_cities`),
  ]);
  const societyRow = society.rows[0];
  return {
    factions: factions.rows.map((row) => ({
      rowId: num(row.id),
      ownerId: num(row.owner_id),
      code: String(row.code),
      regime: regimeOf(row.regime),
      fixed: row.fixed === true,
      parentRowId: numOrNull(row.parent_id),
      techLevel: num(row.tech_level),
      techBlueprint: num(row.tech_blueprint),
      researchProgress: num(row.research_progress),
      traits: Array.isArray(row.traits) ? row.traits.map(num) : null,
      aiStep: num(row.ai_step),
      rebelOfRowId: numOrNull(row.rebel_of),
    })),
    cities: cities.rows.map((row) => ({
      id: num(row.id),
      factionRowId: num(row.faction_id),
      planetId: String(row.planet_id),
      mapKey: num(row.map_key),
      cellX: num(row.cell_x),
      cellY: num(row.cell_y),
      start: row.start === true,
      housing: num(row.housing),
      researchLevel: num(row.research_level),
      foundedAtMs: num(row.founded_at_ms),
      development: num(row.development),
      nextRebellionMs: num(row.next_rebellion_ms),
    })),
    humans: humans.rows.map((row) => ({
      unitId: num(row.unit_id),
      cityId: num(row.city_id),
      satisfactionMilli: num(row.satisfaction_milli),
      bornAtMs: num(row.born_at_ms),
      lifespanMs: num(row.lifespan_ms),
      rebirths: num(row.rebirths),
    })),
    wars: wars.rows.map((row) => ({
      a: num(row.faction_a),
      b: num(row.faction_b),
      state: row.state === "truce" ? "truce" : "war",
      atMs: num(row.at_ms),
    })),
    society: societyRow ? { seed: num(societyRow.seed), day: num(societyRow.day) } : null,
    spares: spares.rows.map((row) => ({ rowId: num(row.id), ownerId: num(row.owner_id) })),
    maxCityId: num(maxCity.rows[0]?.id ?? 0),
  };
}
