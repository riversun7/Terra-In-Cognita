// 도시 지분 표 읽기(세계가 준비된 뒤 attach.ts가 한 번 부른다) — docs/adr/2026-11-21-share-market.md
import type { QueryPool } from "../world/persist/load.ts";
import { CITY_SHARE_ROUND_WINDOW_MS, type LoadedCityShares } from "./market.ts";

/** DB 큰 정수 칸 → BigInt(글자·숫자·BigInt, 그 밖은 0) */
const bigOf = (value: unknown): bigint =>
  typeof value === "bigint"
    ? value
    : typeof value === "string" || typeof value === "number"
      ? BigInt(value)
      : 0n;

/** 걸린 주문(open)·최근 회차·도시마다 마지막 체결가·가장 큰 번호 */
export async function loadCityShares(pool: QueryPool, nowMs: number): Promise<LoadedCityShares> {
  const open = await pool.query(
    `select id, city_id, holder, side, price, shares, asset, seq, placed_at_ms, filled, agenda_id
       from city_share_orders where state = 'open' order by city_id, seq`,
  );
  const rounds = await pool.query(
    `select id, city_id, at_ms, price, shares, asset from city_share_rounds where at_ms >= $1 order by id`,
    [nowMs - CITY_SHARE_ROUND_WINDOW_MS],
  );
  const last = await pool.query(
    `select distinct on (city_id) city_id, price from city_share_rounds
      where price is not null order by city_id, id desc`,
  );
  const max = await pool.query(
    `select (select coalesce(max(id), 0) from city_share_orders) as orders,
            (select coalesce(max(id), 0) from city_share_rounds) as rounds`,
  );
  return {
    open: open.rows.map((row) => ({
      id: Number(row.id),
      cityId: Number(row.city_id),
      holder: String(row.holder),
      side: row.side === "sell" ? "sell" : "buy",
      price: bigOf(row.price),
      shares: bigOf(row.shares),
      filled: bigOf(row.filled),
      asset: String(row.asset),
      seq: Number(row.seq),
      placedAtMs: Number(row.placed_at_ms),
      agendaId: row.agenda_id === null || row.agenda_id === undefined ? null : Number(row.agenda_id),
    })),
    rounds: rounds.rows.map((row) => ({
      id: Number(row.id),
      cityId: Number(row.city_id),
      atMs: Number(row.at_ms),
      price: row.price === null || row.price === undefined ? undefined : bigOf(row.price),
      shares: bigOf(row.shares),
      asset: String(row.asset),
    })),
    lastPrice: new Map(last.rows.map((row) => [Number(row.city_id), bigOf(row.price)])),
    maxOrderId: Number(max.rows[0]?.orders ?? 0),
    maxRoundId: Number(max.rows[0]?.rounds ?? 0),
  };
}
