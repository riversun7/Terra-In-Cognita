// 신용 점수 표 읽기(부팅 — business/store.ts loadBusiness가 함께 부른다) — docs/adr/2026-11-21-credit.md
import type { QueryPool } from "../world/persist/load.ts";
import type { CreditMark } from "./book.ts";

const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadCreditMarks(pool: QueryPool): Promise<CreditMark[]> {
  const { rows } = await pool.query(
    `select cause, kind, owner_id, unit_id, city_id, nation_id, city_points, nation_points, count, since_ms, updated_at_ms
       from credit_marks order by cause`,
  );
  return rows.map((row) => ({
    cause: String(row.cause),
    kind: row.kind === "business" ? "business" : "resident",
    ownerId: Number(row.owner_id),
    unitId: numOrNull(row.unit_id),
    cityId: Number(row.city_id),
    nationId: Number(row.nation_id),
    cityPoints: Number(row.city_points),
    nationPoints: Number(row.nation_points),
    count: Number(row.count),
    sinceMs: Number(row.since_ms),
    updatedAtMs: Number(row.updated_at_ms),
  }));
}
