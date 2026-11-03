// 노동 계약 읽기·쓰기 행 — docs/adr/2026-11-03-labor-contracts.md
// 부팅 때 한 번 읽고(쓰기 대기열이 돌기 전), 바뀌면 월드 쓰기 대기열(labor_contracts·labor_rents)로 쓴다. int8은 pg가 문자열로
// 주므로 시각·ID는 숫자, 금액은 BigInt로 바꾼다.
import {
  LABOR_END_REASONS,
  LABOR_KINDS,
  LABOR_STATES,
  type LaborContract,
  type LaborEndReason,
  type LaborKind,
  type LaborState,
} from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { Row } from "../world/persist/tables.ts";

/** 시설 임대 조건(건물마다 시간당 임대료, 0 = 빌려주지 않음) */
export interface RentRow {
  readonly buildingId: number;
  readonly ownerId: number;
  readonly asset: string;
  readonly rentPerHour: bigint;
  readonly updatedAtMs: number;
}

export interface LoadedLabor {
  readonly contracts: LaborContract[];
  readonly rents: RentRow[];
  /** 가장 큰 계약 ID(없으면 0). 끝나서 읽지 않은 줄도 센다 */
  readonly maxId: number;
}

/** 끝난 계약을 화면에 남기는 기간(이보다 오래 끝난 줄은 읽지 않는다, DB에는 남는다) */
export const KEEP_ENDED_MS = 7 * 24 * 60 * 60 * 1000;

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
/** int8 금액(pg는 글자로 준다). 모르는 모양은 0 */
const big = (value: unknown): bigint => {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return 0n;
};
const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.find((item) => item === value) ?? fallback;

export async function loadLabor(pool: QueryPool, nowMs: number): Promise<LoadedLabor> {
  const max = await pool.query(`select coalesce(max(id), 0) as id from labor_contracts`);
  const rows = await pool.query(
    `select * from labor_contracts where state <> 'ended' or ended_at_ms > $1 order by id`,
    [nowMs - KEEP_ENDED_MS],
  );
  const rents = await pool.query(`select * from labor_rents order by building_id`);
  return {
    maxId: num(max.rows[0]?.id ?? 0),
    contracts: rows.rows.map((row) => ({
      id: num(row.id),
      kind: pick<LaborKind>(LABOR_KINDS, row.kind, "wage"),
      ownerId: num(row.owner_id),
      workerOwnerId: num(row.worker_owner_id),
      unitId: num(row.unit_id),
      buildingId: num(row.building_id),
      asset: String(row.asset),
      rate: big(row.rate),
      deposit: big(row.deposit),
      startedAtMs: num(row.started_at_ms),
      endsAtMs: numOrNull(row.ends_at_ms),
      settledAtMs: num(row.settled_at_ms),
      nextDueMs: num(row.next_due_ms),
      state: pick<LaborState>(LABOR_STATES, row.state, "ended"),
      graceUntilMs: numOrNull(row.grace_until_ms),
      endedAtMs: numOrNull(row.ended_at_ms),
      endReason:
        row.end_reason === null || row.end_reason === undefined
          ? null
          : pick<LaborEndReason>(LABOR_END_REASONS, row.end_reason, "owner"),
      paidTotal: big(row.paid_total),
    })),
    rents: rents.rows.map((row) => ({
      buildingId: num(row.building_id),
      ownerId: num(row.owner_id),
      asset: String(row.asset),
      rentPerHour: big(row.rent_per_hour),
      updatedAtMs: num(row.updated_at_ms),
    })),
  };
}

export function contractRow(c: LaborContract): Row {
  return {
    id: c.id,
    kind: c.kind,
    owner_id: c.ownerId,
    worker_owner_id: c.workerOwnerId,
    unit_id: c.unitId,
    building_id: c.buildingId,
    asset: c.asset,
    rate: c.rate,
    deposit: c.deposit,
    started_at_ms: c.startedAtMs,
    ends_at_ms: c.endsAtMs,
    settled_at_ms: c.settledAtMs,
    next_due_ms: c.nextDueMs,
    state: c.state,
    grace_until_ms: c.graceUntilMs,
    ended_at_ms: c.endedAtMs,
    end_reason: c.endReason,
    paid_total: c.paidTotal,
  };
}

export function rentRow(r: RentRow): Row {
  return {
    building_id: r.buildingId,
    owner_id: r.ownerId,
    asset: r.asset,
    rent_per_hour: r.rentPerHour,
    updated_at_ms: r.updatedAtMs,
  };
}
