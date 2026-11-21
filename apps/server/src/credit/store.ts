// 신용 점수 표 읽기(부팅 — business/store.ts loadBusiness가 함께 부른다) — docs/adr/2026-11-21-credit.md
// 바뀜(governance-5, D-584 "한 점수"): 내린 몫은 nation_points 칸 하나만 읽는다(옛 city_points는 쓰지 않는다). 소속 줄(credit_standings)도 읽는다.
import type { CreditCause } from "@terra/shared/credit";
import type { QueryPool } from "../world/persist/load.ts";
import type { CreditMark, CreditStanding } from "./book.ts";

const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const KINDS: readonly CreditCause[] = ["resident", "business", "upkeep", "coup_join", "same_nation_attack"];

export async function loadCreditMarks(pool: QueryPool): Promise<CreditMark[]> {
  const { rows } = await pool.query(
    `select cause, kind, owner_id, unit_id, city_id, nation_id, nation_points, count, since_ms, updated_at_ms
       from credit_marks order by cause`,
  );
  return rows.map((row) => ({
    cause: String(row.cause),
    kind: KINDS.find((kind) => kind === row.kind) ?? "resident",
    ownerId: Number(row.owner_id),
    unitId: numOrNull(row.unit_id),
    cityId: Number(row.city_id),
    nationId: Number(row.nation_id),
    points: Number(row.nation_points),
    count: Number(row.count),
    sinceMs: Number(row.since_ms),
    updatedAtMs: Number(row.updated_at_ms),
  }));
}

export async function loadCreditStandings(pool: QueryPool): Promise<CreditStanding[]> {
  const { rows } = await pool.query(
    "select owner_id, nation_id, since_ms, rise, rose_day, updated_at_ms from credit_standings order by owner_id",
  );
  return rows.map((row) => ({
    ownerId: Number(row.owner_id),
    nationId: Number(row.nation_id),
    sinceMs: Number(row.since_ms),
    rise: Number(row.rise),
    roseDay: Number(row.rose_day),
    updatedAtMs: Number(row.updated_at_ms),
  }));
}
