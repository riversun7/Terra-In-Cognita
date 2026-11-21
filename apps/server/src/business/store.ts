// 사업장 표 읽기(부팅 — facilities/state.ts loadFacilities가 함께 부른다) — docs/adr/2026-11-15-business-ledger.md
import type { CreditMark, CreditStanding } from "../credit/book.ts";
import { loadCreditMarks, loadCreditStandings } from "../credit/store.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { BusinessPrice, BusinessState } from "./core.ts";
import { type LoadedShares, SHARE_ROUND_WINDOW_MS } from "./shares.ts";

export interface LoadedBusiness {
  readonly states: readonly BusinessState[];
  readonly prices: readonly BusinessPrice[];
  /** 생산시설 지분 주문·회차(docs/adr/2026-11-15-building-screen.md). 없으면 빈 것 */
  readonly shares?: LoadedShares | undefined;
  /** 신용 점수 깎은 몫(docs/adr/2026-11-21-credit.md — 사업장 장부가 신용 장부를 붙인다). 없으면 빈 것 */
  readonly credit?: readonly CreditMark[] | undefined;
  /** 신용 소속 줄(줄기 governance-5 — D-584). 없으면 빈 것 */
  readonly creditStandings?: readonly CreditStanding[] | undefined;
}

/** DB 큰 정수 칸 → BigInt(글자·숫자·BigInt, 그 밖은 0) */
const bigOf = (value: unknown): bigint =>
  typeof value === "bigint"
    ? value
    : typeof value === "string" || typeof value === "number"
      ? BigInt(value)
      : 0n;

const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export async function loadBusiness(pool: QueryPool): Promise<LoadedBusiness> {
  const states = await pool.query(
    `select building_id, debt_since_ms, suspended_at_ms, settled_at_ms, reserve_pm from business_states order by building_id`,
  );
  const prices = await pool.query(
    `select building_id, item, price from business_prices order by building_id, item`,
  );
  const shares = await loadShares(pool, Date.now());
  const credit = await loadCreditMarks(pool);
  const creditStandings = await loadCreditStandings(pool);
  return {
    shares,
    credit,
    creditStandings,
    states: states.rows.map((row) => ({
      buildingId: Number(row.building_id),
      debtSinceMs: numOrNull(row.debt_since_ms),
      suspendedAtMs: numOrNull(row.suspended_at_ms),
      settledAtMs: numOrNull(row.settled_at_ms),
      reservePm: numOrNull(row.reserve_pm),
    })),
    prices: prices.rows.map((row) => ({
      buildingId: Number(row.building_id),
      item: String(row.item),
      price: BigInt(String(row.price)),
    })),
  };
}

/** 지분 주문(open)·최근 회차·사업장마다 마지막 체결가·가장 큰 번호 */
export async function loadShares(pool: QueryPool, nowMs: number): Promise<LoadedShares> {
  const open = await pool.query(
    `select id, building_id, owner_id, side, price, shares, seq, placed_at_ms
       from business_share_orders where state = 'open' order by building_id, seq`,
  );
  const rounds = await pool.query(
    `select id, building_id, at_ms, price, shares from business_share_rounds where at_ms >= $1 order by id`,
    [nowMs - SHARE_ROUND_WINDOW_MS],
  );
  const last = await pool.query(
    `select distinct on (building_id) building_id, price from business_share_rounds
      where price is not null order by building_id, id desc`,
  );
  const max = await pool.query(
    `select (select coalesce(max(id), 0) from business_share_orders) as orders,
            (select coalesce(max(id), 0) from business_share_rounds) as rounds`,
  );
  return {
    open: open.rows.map((row) => ({
      buildingId: Number(row.building_id),
      placedAtMs: Number(row.placed_at_ms),
      order: {
        id: Number(row.id),
        owner: Number(row.owner_id),
        side: row.side === "sell" ? "sell" : "buy",
        price: BigInt(String(row.price)),
        lots: BigInt(String(row.shares)),
        seq: Number(row.seq),
      },
    })),
    rounds: rounds.rows.map((row) => ({
      id: Number(row.id),
      buildingId: Number(row.building_id),
      atMs: Number(row.at_ms),
      price: row.price === null || row.price === undefined ? undefined : bigOf(row.price),
      shares: BigInt(String(row.shares)),
    })),
    lastPrice: new Map(last.rows.map((row) => [Number(row.building_id), bigOf(row.price)])),
    maxOrderId: Number(max.rows[0]?.orders ?? 0),
    maxRoundId: Number(max.rows[0]?.rounds ?? 0),
  };
}
