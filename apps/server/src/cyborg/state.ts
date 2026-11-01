// 사이보그 자료 — 부팅 때 DB에서 읽고(쓰기 대기열이 돌기 전), 바뀌면 월드 쓰기 대기열로 쓴다.
// docs/adr/2026-11-01-first-login-cyborg.md 2절·"바뀜 (D-450~D-453)". int8은 pg가 문자열로 주므로 숫자로 바꾼다. smallint[]는
// 숫자 배열로 온다. 속성값(elements)이 null이면 아직 나누지 않은 사이보그다(프로토콜 5 전에 만든 것, 한 번 나눈다).
import {
  type CyborgAppearance,
  DEFAULT_CYBORG_APPEARANCE,
  type ElementValues,
  elementsFromArray,
  elementsToArray,
  isCyborgAppearance,
} from "@terra/shared/cyborg";
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
  /** 신앙도(D-451: 쌓이는 문턱 점수, 0~100) */
  readonly faith: number;
  readonly createdAtMs: number;
  /** 생성·환생 속성값(D-450). null = 아직 나누지 않음(한 번 나누면 채운다) */
  elements: ElementValues | null;
  /** 종교 코드(D-451, 지금은 고르는 길이 없어 null) */
  readonly religion: string | null;
  /** 신앙 포인트(D-451) */
  readonly faithPoints: number;
  /**
   * 받은 정착 지원금(D-455 190: 강하 때, D-456: 지원금 전에 만든 사이보그는 한 번 속성 분배 때). null = 아직 받지 않음
   */
  startGrant: bigint | null;
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
/** int8은 pg가 문자열로 준다 */
const bigOrNull = (value: unknown): bigint | null =>
  typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? BigInt(value) : null;
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadCyborgs(pool: QueryPool): Promise<LoadedCyborgs> {
  const [cyborgRows, rollRows, factionRows] = await Promise.all([
    pool.query(
      `select user_id, name, name_key, temperament, initial, k_pm, appearance, faction_id, start_city_id, unit_id,
              level, exp, rebirths, faith, created_at_ms, elements, religion, faith_points, start_grant
         from cyborgs order by created_at_ms, user_id`,
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
      elements: row.elements === null || row.elements === undefined ? null : elementsFromArray(row.elements),
      religion: typeof row.religion === "string" ? row.religion : null,
      faithPoints: num(row.faith_points ?? 0),
      startGrant: bigOrNull(row.start_grant),
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
    elements: record.elements === null ? null : elementsToArray(record.elements),
    religion: record.religion,
    faith_points: record.faithPoints,
    start_grant: record.startGrant,
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
