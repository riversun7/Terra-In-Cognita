// 사이보그 자료 — 부팅 때 DB에서 읽고(쓰기 대기열이 돌기 전), 바뀌면 월드 쓰기 대기열로 쓴다.
// docs/adr/2026-11-01-first-login-cyborg.md 2절. int8은 pg가 문자열로 주므로 숫자로 바꾼다. smallint[]는 숫자 배열로 온다.
import { type CyborgAppearance, DEFAULT_CYBORG_APPEARANCE, isCyborgAppearance } from "@terra/shared/cyborg";
import type { Primaries } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { Row } from "../world/persist/tables.ts";

export interface CyborgRecord {
  readonly userId: string;
  readonly name: string;
  readonly nameKey: string;
  readonly temperament: string;
  readonly initial: Primaries;
  readonly kPm: Primaries;
  readonly appearance: CyborgAppearance;
  readonly factionId: number;
  readonly startCityId: number;
  unitId: number | null;
  readonly level: number;
  readonly exp: number;
  readonly rebirths: number;
  readonly faith: number;
  readonly createdAtMs: number;
}

export interface RollRecord {
  readonly userId: string;
  readonly temperament: string;
  readonly stats: Primaries;
  readonly rollsUsed: number;
  readonly seed: number;
  readonly updatedAtMs: number;
}

/** 가입할 수 있는 세력 후보(고정 NPC 세력, D-140·D-341). 시작 도시는 world_cities에서 따로 읽는다 */
export interface JoinableFaction {
  readonly id: number;
  readonly code: string | null;
}

export interface LoadedCyborgs {
  readonly cyborgs: CyborgRecord[];
  readonly rolls: RollRecord[];
  readonly factions: JoinableFaction[];
  /** 읽으며 고친 줄(외형이 목록 밖 → 기본 외형) */
  readonly fixedAppearances: number;
}

const STAT_ORDER = ["str", "dex", "agi", "vit", "int", "wis"] as const;

/** STR·DEX·AGI·VIT·INT·WIS 차례 배열 ↔ 스탯 객체 */
export function statsToArray(stats: Primaries): number[] {
  return STAT_ORDER.map((stat) => stats[stat]);
}

export function statsFromArray(value: unknown): Primaries {
  const list = Array.isArray(value) ? value.map(Number) : [];
  const at = (index: number): number => {
    const v = list[index];
    return v !== undefined && Number.isInteger(v) ? v : 0;
  };
  return { str: at(0), dex: at(1), agi: at(2), vit: at(3), int: at(4), wis: at(5) };
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadCyborgs(pool: QueryPool): Promise<LoadedCyborgs> {
  const [cyborgRows, rollRows, factionRows] = await Promise.all([
    pool.query(
      `select user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, unit_id,
              level, exp, rebirths, faith, created_at_ms from cyborgs order by created_at_ms, user_id`,
    ),
    pool.query(`select user_id, temperament, stats, rolls_used, seed, updated_at_ms from cyborg_rolls`),
    pool.query(`select id, code from factions where kind = 'npc' and fixed = true order by id`),
  ]);
  let fixedAppearances = 0;
  const cyborgs = cyborgRows.rows.map((row): CyborgRecord => {
    const appearance = row.appearance;
    const valid = isCyborgAppearance(appearance);
    if (!valid) fixedAppearances += 1;
    return {
      userId: String(row.user_id),
      name: String(row.name),
      nameKey: String(row.name_key),
      temperament: String(row.temperament),
      initial: statsFromArray(row.initial),
      kPm: statsFromArray(row.k_pm),
      appearance: valid ? appearance : DEFAULT_CYBORG_APPEARANCE,
      factionId: num(row.faction_id),
      startCityId: num(row.start_city_id),
      unitId: numOrNull(row.unit_id),
      level: num(row.level),
      exp: num(row.exp),
      rebirths: num(row.rebirths),
      faith: num(row.faith),
      createdAtMs: num(row.created_at_ms),
    };
  });
  const rolls = rollRows.rows.map(
    (row): RollRecord => ({
      userId: String(row.user_id),
      temperament: String(row.temperament),
      stats: statsFromArray(row.stats),
      rollsUsed: num(row.rolls_used),
      seed: num(row.seed),
      updatedAtMs: num(row.updated_at_ms),
    }),
  );
  const factions = factionRows.rows.map(
    (row): JoinableFaction => ({
      id: num(row.id),
      code: typeof row.code === "string" ? row.code : null,
    }),
  );
  return { cyborgs, rolls, factions, fixedAppearances };
}

/** 쓰기 대기열 한 줄(cyborgs) */
export function cyborgRow(record: CyborgRecord): Row {
  return {
    user_id: record.userId,
    name: record.name,
    name_key: record.nameKey,
    temperament: record.temperament,
    initial: statsToArray(record.initial),
    k_pm: statsToArray(record.kPm),
    appearance: record.appearance,
    faction_id: record.factionId,
    start_city_id: record.startCityId,
    unit_id: record.unitId,
    level: record.level,
    exp: record.exp,
    rebirths: record.rebirths,
    faith: record.faith,
    created_at_ms: record.createdAtMs,
  };
}

/** 쓰기 대기열 한 줄(cyborg_rolls) */
export function rollRow(record: RollRecord): Row {
  return {
    user_id: record.userId,
    temperament: record.temperament,
    stats: statsToArray(record.stats),
    rolls_used: record.rollsUsed,
    seed: record.seed,
    updated_at_ms: record.updatedAtMs,
  };
}
