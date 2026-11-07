// 융합·유전자 명령이 읽는 유저 휴먼 행(world_humans)과 배운 스킬(unit_skills) — docs/adr/2026-11-07-cyborg-fusion-genes.md.
// 유저 휴먼의 레벨·스탯·속성·수명은 DB 행이 원본이다(메모리 캐시 없음): 쓰기 대기열이 따라잡은 뒤(writer.durable) 읽는다.
import { sixStats } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";

/** 바탕 휴먼에 스탯이 없을 때(처음부터 있던 휴먼) [임시] 1차 스탯 — 유닛 화면 기본 몸과 같은 10 */
export const BASELINE_STAT = 10;
/** 휴먼 종(팩 unit_kinds ID). 유저 휴먼(유닛 종류 4)의 종 */
export const HUMAN_SPECIES = "human";

/** DB 휴먼 한 줄(유저가 고용했거나 인큐베이터로 태어난 휴먼) */
export interface HumanRow {
  readonly unitId: number;
  readonly level: number;
  readonly rebirths: number;
  readonly stats: number[];
  readonly elements: number[] | null;
  readonly bornAtMs: number;
  readonly lifespanMs: number;
}

const num = (value: unknown): number => Number(value);
export const intArray = (value: unknown): number[] | null =>
  Array.isArray(value) ? value.map((entry) => Number(entry)) : null;

/** 휴먼 행 열 목록(이 순서로 고른다) */
export const HUMAN_COLUMNS =
  "h.unit_id, h.level, h.rebirths, h.stats, h.elements, h.born_at_ms, h.lifespan_ms";

export function humanOf(row: Record<string, unknown>): HumanRow {
  const stats = intArray(row.stats);
  return {
    unitId: num(row.unit_id),
    level: num(row.level),
    rebirths: num(row.rebirths),
    stats: stats ? sixStats(stats) : Array.from({ length: 6 }, () => BASELINE_STAT),
    elements: intArray(row.elements),
    bornAtMs: num(row.born_at_ms),
    lifespanMs: num(row.lifespan_ms),
  };
}

/** 휴먼 행 하나(없으면 undefined). 쓰기 대기열이 따라잡은 뒤 부른다 */
export async function readHuman(pool: QueryPool, unitId: number): Promise<HumanRow | undefined> {
  const result = await pool.query(`select ${HUMAN_COLUMNS} from world_humans h where h.unit_id = $1`, [
    unitId,
  ]);
  const row = result.rows[0];
  return row ? humanOf(row) : undefined;
}

/** 유닛마다 배운 스킬(스킬 ID 차례). 쓰기 대기열이 따라잡은 뒤 부른다 */
export async function readSkills(
  pool: QueryPool,
  unitIds: readonly number[],
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (unitIds.length === 0) return out;
  const result = await pool.query(
    `select unit_id, skill_id from unit_skills where unit_id = any($1::bigint[]) order by unit_id, skill_id`,
    [unitIds],
  );
  for (const row of result.rows) {
    const unitId = num(row.unit_id);
    out.set(unitId, [...(out.get(unitId) ?? []), String(row.skill_id)]);
  }
  return out;
}
