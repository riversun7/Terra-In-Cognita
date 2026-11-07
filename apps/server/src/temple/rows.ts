// 신전 명령이 읽고 쓰는 줄 — 유저 휴먼 행 전체(world_humans: 환생이 태어난 시각·수명·레벨·환생 수를 바꿔 다시 쓴다)와 유닛 신앙
// (unit_faith, D-451), 수호신(temple_guardians, 기획 답 456 가). DB 행이 원본이다(메모리 캐시 없음): 쓰기 대기열이 따라잡은 뒤(writer.durable)
// 읽는다.
// docs/adr/2026-11-07-temple-religion.md
import { DEFAULT_GUARDIAN_BUFF, type GuardianBuff, isGuardianBuff } from "@terra/sim";
import type { HumanRow } from "../fusion/humans.ts";
import { HUMAN_COLUMNS, humanOf } from "../fusion/humans.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 휴먼 행 전체(쓰기 대기열 upsert는 모든 열을 쓴다) */
export interface FullHumanRow extends HumanRow {
  readonly cityId: number | null;
  readonly satisfactionMilli: number;
  /** DB 원래 스탯(null = 처음부터 있던 휴먼, HumanRow.stats는 기본 몸으로 채운 값) */
  readonly rawStats: number[] | null;
}

export interface FaithRow {
  readonly faith: number;
  readonly faithPoints: number;
}

const NO_FAITH: FaithRow = { faith: 0, faithPoints: 0 };

const intArrayOrNull = (value: unknown): number[] | null =>
  Array.isArray(value) ? value.map((entry) => Number(entry)) : null;

/** 휴먼 행 하나(없으면 undefined) */
export async function readFullHuman(pool: QueryPool, unitId: number): Promise<FullHumanRow | undefined> {
  const result = await pool.query(
    `select ${HUMAN_COLUMNS}, h.city_id, h.satisfaction_milli from world_humans h where h.unit_id = $1`,
    [unitId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    ...humanOf(row),
    cityId: row.city_id === null || row.city_id === undefined ? null : Number(row.city_id),
    satisfactionMilli: Number(row.satisfaction_milli),
    rawStats: intArrayOrNull(row.stats),
  };
}

/** 휴먼 행을 다시 쓴다(바뀐 칸만 넘긴다, 나머지는 읽은 값) */
export function writeHuman(
  writer: WorldWriter,
  human: FullHumanRow,
  change: {
    readonly bornAtMs: number;
    readonly lifespanMs: number;
    readonly rebirths: number;
    readonly level: number;
  },
): void {
  writer.upsert("humans", {
    unit_id: human.unitId,
    city_id: human.cityId,
    satisfaction_milli: human.satisfactionMilli,
    born_at_ms: change.bornAtMs,
    lifespan_ms: change.lifespanMs,
    rebirths: change.rebirths,
    level: change.level,
    stats: human.rawStats,
    elements: human.elements,
  });
}

/** 유닛마다 신앙(줄이 없으면 0) */
export async function readFaith(pool: QueryPool, unitIds: readonly number[]): Promise<Map<number, FaithRow>> {
  const out = new Map<number, FaithRow>(unitIds.map((id) => [id, NO_FAITH]));
  if (unitIds.length === 0) return out;
  const result = await pool.query(
    `select unit_id, faith, faith_points from unit_faith where unit_id = any($1::bigint[])`,
    [unitIds],
  );
  for (const row of result.rows)
    out.set(Number(row.unit_id), { faith: Number(row.faith), faithPoints: Number(row.faith_points) });
  return out;
}

export function writeFaith(writer: WorldWriter, unitId: number, faith: FaithRow): void {
  writer.upsert("unitFaith", { unit_id: unitId, faith: faith.faith, faith_points: faith.faithPoints });
}

/** 소유 주체의 마지막 기도 시각(없으면 null) */
export async function readLastPrayer(pool: QueryPool, ownerId: number): Promise<number | null> {
  const result = await pool.query(`select last_prayed_at_ms from temple_devotions where owner_id = $1`, [
    ownerId,
  ]);
  const row = result.rows[0];
  return row ? Number(row.last_prayed_at_ms) : null;
}

/** 도시마다 수호신 수 */
export async function readGuardianCounts(pool: QueryPool): Promise<Map<number, number>> {
  const result = await pool.query(`select city_id, count(*) as n from temple_guardians group by city_id`);
  return new Map(result.rows.map((row) => [Number(row.city_id), Number(row.n)]));
}

/** 수호신 한 줄(temple_guardians) */
export interface GuardianRow {
  readonly unitId: number;
  readonly ownerId: number;
  readonly cityId: number;
  readonly templeId: number;
  readonly level: number;
  readonly rebirths: number;
  /** 1차 스탯 STR·DEX·AGI·VIT·INT·WIS */
  readonly stats: readonly number[];
  readonly elements: readonly number[] | null;
  readonly faith: number;
  readonly deifiedAtMs: number;
  readonly buff: GuardianBuff;
}

const GUARDIAN_COLUMNS =
  "unit_id, owner_id, city_id, temple_id, level, rebirths, stats, elements, faith, deified_at_ms, buff";

const guardianOf = (row: Record<string, unknown>): GuardianRow => ({
  unitId: Number(row.unit_id),
  ownerId: Number(row.owner_id),
  cityId: Number(row.city_id),
  templeId: Number(row.temple_id),
  level: Number(row.level),
  rebirths: Number(row.rebirths),
  stats: intArrayOrNull(row.stats) ?? [],
  elements: intArrayOrNull(row.elements),
  faith: Number(row.faith),
  deifiedAtMs: Number(row.deified_at_ms),
  // 모르는 값(더 새 판이 쓴 값)은 출발값으로 읽는다
  buff: isGuardianBuff(row.buff) ? row.buff : DEFAULT_GUARDIAN_BUFF,
});

/** 수호신 줄(유닛 ID 차례). where = 도시 하나 또는 유닛 하나, 없으면 모두 */
export async function readGuardians(
  pool: QueryPool,
  where: { readonly cityId?: number; readonly unitId?: number } = {},
): Promise<GuardianRow[]> {
  const result =
    where.unitId !== undefined
      ? await pool.query(`select ${GUARDIAN_COLUMNS} from temple_guardians where unit_id = $1`, [
          where.unitId,
        ])
      : where.cityId !== undefined
        ? await pool.query(
            `select ${GUARDIAN_COLUMNS} from temple_guardians where city_id = $1 order by unit_id`,
            [where.cityId],
          )
        : await pool.query(`select ${GUARDIAN_COLUMNS} from temple_guardians order by unit_id`);
  return result.rows.map((row) => guardianOf(row));
}

/** 수호신 줄을 쓴다(쓰기 대기열 upsert는 모든 열을 쓴다) */
export function writeGuardian(writer: WorldWriter, row: GuardianRow): void {
  writer.upsert("templeGuardians", {
    unit_id: row.unitId,
    owner_id: row.ownerId,
    city_id: row.cityId,
    temple_id: row.templeId,
    level: row.level,
    rebirths: row.rebirths,
    stats: [...row.stats],
    elements: row.elements === null ? null : [...row.elements],
    faith: row.faith,
    deified_at_ms: row.deifiedAtMs,
    buff: row.buff,
  });
}
