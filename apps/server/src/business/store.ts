// 사업장 표 읽기(부팅 — facilities/state.ts loadFacilities가 함께 부른다) — docs/adr/2026-11-15-business-ledger.md
import type { QueryPool } from "../world/persist/load.ts";
import type { BusinessPrice, BusinessState } from "./core.ts";

export interface LoadedBusiness {
  readonly states: readonly BusinessState[];
  readonly prices: readonly BusinessPrice[];
}

const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadBusiness(pool: QueryPool): Promise<LoadedBusiness> {
  const states = await pool.query(
    `select building_id, debt_since_ms, suspended_at_ms, settled_at_ms from business_states order by building_id`,
  );
  const prices = await pool.query(
    `select building_id, item, price from business_prices order by building_id, item`,
  );
  return {
    states: states.rows.map((row) => ({
      buildingId: Number(row.building_id),
      debtSinceMs: numOrNull(row.debt_since_ms),
      suspendedAtMs: numOrNull(row.suspended_at_ms),
      settledAtMs: numOrNull(row.settled_at_ms),
    })),
    prices: prices.rows.map((row) => ({
      buildingId: Number(row.building_id),
      item: String(row.item),
      price: BigInt(String(row.price)),
    })),
  };
}
