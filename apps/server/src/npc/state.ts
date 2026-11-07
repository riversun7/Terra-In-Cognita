// NPC 사회 런타임의 DB 읽기 — docs/adr/2026-11-01-npc-brain-r5.md 7절
// 부팅 때 한 번(쓰기 대기열이 돌기 전, 월드 복구 뒤): NPC 세력·소유 주체·도시·휴먼·전쟁·런타임 상태 한 줄과 예비 세력 행,
// 구인 카드 산 칸(D-469, recruit_draws — NPC 세력 몫은 거울 도시에, 유저 몫은 구인 서비스가 따로 읽는다).
// int8은 pg가 문자열로 주므로 숫자로 바꾼다.
import type { QueryPool } from "../world/persist/load.ts";
import { type RuinRow, loadRuins } from "./ruinsState.ts";

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
  /** 태어날 때 부모 세력 행(기획 답 620 나). 사라진 부모도 행은 남는다 */
  readonly bornOfRowId: number | null;
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
  /** 웨이브를 막아 낸 뒤 쉬는 시간 끝(0 = 없음) */
  readonly waveCooldownUntilMs: number;
  /** 행정 건물 레벨(1~5, D-469) */
  readonly adminLevel: number;
  /** 도시 이름(NPC 도시는 팩 목록, 없으면 null — 폐허가 되면 폐허 줄에 남아 복원 때 되찾는다, 기획 답 552 다) */
  readonly name: string | null;
}

export interface NpcHumanRow {
  readonly unitId: number;
  /** null = 노숙(떠도는 세력의 휴먼) */
  readonly cityId: number | null;
  readonly satisfactionMilli: number;
  readonly bornAtMs: number;
  readonly lifespanMs: number;
  readonly rebirths: number;
  readonly level: number;
  /** 구인 카드의 스탯 6·속성 12칸(처음부터 있던 휴먼은 null) */
  readonly stats: number[] | null;
  readonly elements: number[] | null;
}

/** 구인 카드 산 칸(고용 주체 × 도시) */
export interface RecruitDrawRow {
  readonly ownerId: number;
  readonly cityId: number;
  readonly window: number;
  readonly taken: number;
}

export interface NpcWarRow {
  readonly a: number;
  readonly b: number;
  readonly state: "war" | "truce";
  readonly atMs: number;
}

/** 진군·전투 중인 정원사 웨이브(끝난 줄은 읽지 않는다) */
export interface NpcWaveRow {
  readonly id: number;
  readonly cityId: number;
  readonly factionRowId: number | null;
  readonly strength: number;
  readonly physical: number;
  readonly createdAtMs: number;
  readonly arriveAtMs: number;
  readonly state: "marching" | "fighting";
  readonly battleId: number | null;
  /** 싸우던 웨이브의 전투 결과가 이미 적혔으면 이긴 편(1 = 정원사). 없으면 null */
  readonly battleWinner: number | null;
  /** 도시 웨이브 | 보호 레이드(D-500, 정원사 2) */
  readonly kind: "city" | "protection";
}

export interface NpcState {
  readonly factions: NpcFactionRow[];
  readonly cities: NpcCityRow[];
  readonly humans: NpcHumanRow[];
  readonly draws: RecruitDrawRow[];
  readonly wars: NpcWarRow[];
  readonly society: { seed: number; day: number; gardener: unknown } | null;
  /** 1차맵 칸 오염(그 행성) */
  readonly pollution: { cellKey: number; value: number }[];
  readonly waves: NpcWaveRow[];
  /** 웨이브 행의 가장 큰 ID(끝난 줄 포함, 다음 ID가 겹치지 않게) */
  readonly maxWaveId: number;
  /** 예비 세력 행(이름 없음·사라짐 표시, 소유 주체 있음): 새 세력이 동기로 ID를 받는 자리 */
  readonly spares: { rowId: number; ownerId: number }[];
  /** 도시·폐허 ID의 가장 큰 값(폐허가 된 도시 ID를 새 도시가 다시 쓰지 않게 — 복원하면 같은 ID로 돌아온다) */
  readonly maxCityId: number;
  /** 폐허·복원 사업(docs/adr/2026-11-07-ruins-restoration.md) */
  readonly ruins: RuinRow[];
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const numsOrNull = (value: unknown): number[] | null => (Array.isArray(value) ? value.map(num) : null);
const regimeOf = (value: unknown): NpcFactionRow["regime"] =>
  value === "dictatorship" || value === "capitalism" ? value : "democracy";

/** 구인 카드 산 칸 모두(고용 주체 × 도시). NPC 런타임과 유저 구인 서비스가 읽는다 */
export async function loadRecruitDraws(pool: QueryPool): Promise<RecruitDrawRow[]> {
  const found = await pool.query(
    `select owner_id, city_id, window_index, taken from recruit_draws order by owner_id, city_id`,
  );
  return found.rows.map((row) => ({
    ownerId: num(row.owner_id),
    cityId: num(row.city_id),
    window: num(row.window_index),
    taken: num(row.taken),
  }));
}

export async function loadNpcState(pool: QueryPool, planetId: string): Promise<NpcState> {
  const [factions, cities, humans, wars, society, spares, maxCity, pollution, waves, maxWave, draws, ruins] =
    await Promise.all([
      pool.query(
        `select f.id, o.id as owner_id, f.code, f.regime, f.fixed, f.parent_id, f.tech_level, f.tech_blueprint,
              f.research_progress, f.traits, f.ai_step, f.rebel_of, f.born_of
       from factions f join world_owners o on o.faction_id = f.id
       where f.kind = 'npc' and f.dissolved_at_ms is null and f.code is not null order by f.id`,
      ),
      pool.query(
        `select id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms,
              development, next_rebellion_ms, wave_cooldown_until_ms, admin_level, name from world_cities order by id`,
      ),
      pool.query(
        `select unit_id, city_id, satisfaction_milli, born_at_ms, lifespan_ms, rebirths, level, stats, elements
       from world_humans order by unit_id`,
      ),
      pool.query(`select faction_a, faction_b, state, at_ms from faction_wars order by faction_a, faction_b`),
      pool.query(`select seed, day, gardener from npc_society where id = 1`),
      pool.query(
        `select f.id, o.id as owner_id from factions f join world_owners o on o.faction_id = f.id
       where f.kind = 'npc' and f.code is null and f.dissolved_at_ms is not null order by f.id`,
      ),
      pool.query(
        `select greatest((select coalesce(max(id), 0) from world_cities), (select coalesce(max(id), 0) from world_ruins)) as id`,
      ),
      pool.query(`select cell_key, value from planet_pollution where planet_id = $1 order by cell_key`, [
        planetId,
      ]),
      pool.query(
        `select w.id, w.city_id, w.faction_id, w.strength, w.physical, w.created_at_ms, w.arrive_at_ms, w.state, w.battle_id,
              w.kind, r.result -> 'result' ->> 'winner' as winner
       from gardener_waves w left join world_battle_results r on r.battle_id = w.battle_id
       where w.planet_id = $1 and w.state in ('marching', 'fighting') order by w.id`,
        [planetId],
      ),
      pool.query(`select coalesce(max(id), 0) as id from gardener_waves`),
      loadRecruitDraws(pool),
      loadRuins(pool, planetId),
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
      bornOfRowId: numOrNull(row.born_of),
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
      waveCooldownUntilMs: num(row.wave_cooldown_until_ms ?? 0),
      adminLevel: Math.max(1, num(row.admin_level ?? 1)),
      name: typeof row.name === "string" ? row.name : null,
    })),
    humans: humans.rows.map((row) => ({
      unitId: num(row.unit_id),
      cityId: numOrNull(row.city_id),
      satisfactionMilli: num(row.satisfaction_milli),
      bornAtMs: num(row.born_at_ms),
      lifespanMs: num(row.lifespan_ms),
      rebirths: num(row.rebirths),
      level: Math.max(1, num(row.level ?? 1)),
      stats: numsOrNull(row.stats),
      elements: numsOrNull(row.elements),
    })),
    draws,
    wars: wars.rows.map((row) => ({
      a: num(row.faction_a),
      b: num(row.faction_b),
      state: row.state === "truce" ? "truce" : "war",
      atMs: num(row.at_ms),
    })),
    society: societyRow
      ? { seed: num(societyRow.seed), day: num(societyRow.day), gardener: societyRow.gardener ?? null }
      : null,
    pollution: pollution.rows.map((row) => ({ cellKey: num(row.cell_key), value: num(row.value) })),
    waves: waves.rows.map((row) => ({
      id: num(row.id),
      cityId: num(row.city_id),
      factionRowId: numOrNull(row.faction_id),
      strength: num(row.strength),
      physical: num(row.physical),
      createdAtMs: num(row.created_at_ms),
      arriveAtMs: num(row.arrive_at_ms),
      state: row.state === "fighting" ? "fighting" : "marching",
      battleId: numOrNull(row.battle_id),
      battleWinner: numOrNull(row.winner),
      kind: row.kind === "protection" ? "protection" : "city",
    })),
    spares: spares.rows.map((row) => ({ rowId: num(row.id), ownerId: num(row.owner_id) })),
    maxCityId: num(maxCity.rows[0]?.id ?? 0),
    maxWaveId: num(maxWave.rows[0]?.id ?? 0),
    ruins,
  };
}
