// 사업장 장부 조회(tRPC facilities.books) — 기획 D-548·D-555(1513 "장부는 모두에게 공개"), docs/adr/2026-11-15-business-ledger.md
// - 원장 항목을 그대로 읽는다(새 요약 표 없음, ADR "장부를 어디서 읽나" 1): 그 건물 주인의 건물 위치 계정(금고·창고) 항목을 기간 안에서 거래 종류·
//   화폐·날마다 합하고, 최근 거래 목록을 붙인다. 잔고·적자·멈춤은 메모리(원장·사업장 코어)에서 읽는다.
// - 읽기 전에 쓰기 대기열을 기다린다(방금 들어온 수입이 빠지지 않게).
// - 기간은 1·7·30일(화면이 고른다). 원장은 추가만이라 지우지 않는다 — 화면이 기간만 자른다.
import {
  BOOK_COLUMNS,
  type BookColumn,
  type BookDay,
  type BookEntry,
  type BookGoods,
  type BookOwnerKind,
  type BookTotals,
  type BusinessBooksResponse,
  bookColumnOf,
  businessLocation,
  countsForProfit,
} from "@terra/shared/businessBooks";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { BusinessCommands } from "./commands.ts";
import type { BusinessCore } from "./core.ts";

const DAY_MS = 86_400_000;
/** 최근 거래 목록 길이 */
const RECENT = 30;
export const BOOK_DAYS = [1, 7, 30] as const;

export interface BooksSource {
  readonly pool: QueryPool;
  readonly ledger: Ledger;
  readonly core: BusinessCore;
  readonly commands: BusinessCommands;
  readonly catalog: () => FacilityCatalog;
  durable(): Promise<void>;
  /** 건물 주인·도시·시설 ID(없으면 undefined) */
  place(buildingId: number): { ownerId: number | null; cityId: number | null } | undefined;
  facilityOf(buildingId: number): string | undefined;
  /** NPC 세력 주체인가 */
  isNpc(ownerId: number): boolean;
}

const isMoney = (asset: string): boolean => !asset.startsWith("item:");

export async function readBusinessBooks(
  source: BooksSource,
  viewerOwnerId: number | undefined,
  buildingId: number,
  days: number,
  nowMs: number,
): Promise<BusinessBooksResponse> {
  const place = source.place(buildingId);
  const facilityId = source.facilityOf(buildingId);
  if (!place || place.ownerId === null || facilityId === undefined) return { status: "not_business" };
  const ownerId = place.ownerId;
  await source.durable();
  const here = businessLocation(buildingId);
  const accounts = new Map<number, string>();
  const vault: { asset: string; amount: string }[] = [];
  const goods: BookGoods[] = [];
  const catalog = source.catalog();
  for (const account of source.ledger.accounts()) {
    if (account.ownerId !== ownerId || account.location !== here) continue;
    accounts.set(account.id, account.asset);
    if (account.balance <= 0n) continue;
    if (isMoney(account.asset)) vault.push({ asset: account.asset, amount: String(account.balance) });
    else {
      const price = source.commands.priceOf(buildingId, account.asset);
      const name = catalog.itemName(account.asset.slice(5));
      goods.push({
        asset: account.asset,
        qty: String(account.balance),
        price: price === null ? null : String(price),
        name: name ?? null,
      });
    }
  }
  const span = BOOK_DAYS.some((value) => value === days) ? days : 7;
  const fromMs = Math.floor(nowMs / DAY_MS) * DAY_MS - (span - 1) * DAY_MS;
  const ids = [...accounts.keys()];
  const sums = new Map<string, Map<BookColumn, bigint>>();
  const daily = new Map<string, { income: bigint; spend: bigint }>();
  const entries: BookEntry[] = [];
  let firstMs: number | null = null;
  if (ids.length > 0) {
    const grouped = await source.pool.query(
      `select t.kind, e.account_id, floor(t.at_ms / ${DAY_MS})::bigint as day, sum(e.amount)::text as amount
         from ledger_entries e join ledger_transactions t on t.id = e.tx_id
        where e.account_id = any($1::bigint[]) and t.at_ms >= $2
        group by t.kind, e.account_id, day`,
      [ids, fromMs],
    );
    for (const row of grouped.rows) {
      const asset = accounts.get(Number(row.account_id));
      if (asset === undefined || !isMoney(asset)) continue;
      const column = bookColumnOf(String(row.kind), true);
      const amount = BigInt(String(row.amount));
      const byColumn = sums.get(asset) ?? new Map<BookColumn, bigint>();
      byColumn.set(column, (byColumn.get(column) ?? 0n) + amount);
      sums.set(asset, byColumn);
      if (countsForProfit(column)) {
        const key = `${String(row.day)}|${asset}`;
        const day = daily.get(key) ?? { income: 0n, spend: 0n };
        if (amount > 0n) day.income += amount;
        else day.spend -= amount;
        daily.set(key, day);
      }
    }
    const recent = await source.pool.query(
      `select t.id, t.kind, t.at_ms, e.account_id, e.amount::text as amount
         from ledger_entries e join ledger_transactions t on t.id = e.tx_id
        where e.account_id = any($1::bigint[])
        order by t.at_ms desc, t.id desc, e.account_id
        limit ${RECENT}`,
      [ids],
    );
    for (const row of recent.rows) {
      const asset = accounts.get(Number(row.account_id)) ?? "";
      entries.push({
        txId: Number(row.id),
        atMs: Number(row.at_ms),
        kind: String(row.kind),
        column: bookColumnOf(String(row.kind), isMoney(asset)),
        asset,
        amount: String(row.amount),
      });
    }
    const first = await source.pool.query(
      `select min(t.at_ms)::text as at from ledger_entries e join ledger_transactions t on t.id = e.tx_id
        where e.account_id = any($1::bigint[])`,
      [ids],
    );
    const at: unknown = first.rows[0]?.at;
    firstMs = at === null || at === undefined ? null : Number(at);
  }
  const totals: BookTotals[] = [...sums.entries()]
    .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([asset, byColumn]) => {
      const columns: Partial<Record<BookColumn, string>> = {};
      let profit = 0n;
      for (const column of BOOK_COLUMNS) {
        const value = byColumn.get(column);
        if (value === undefined || value === 0n) continue;
        columns[column] = String(value);
        if (countsForProfit(column)) profit += value;
      }
      return { asset, columns, profit: String(profit) };
    });
  const bars: BookDay[] = [...daily.entries()]
    .map(([key, day]) => {
      const [dayText = "0", asset = ""] = key.split("|");
      return { dayMs: Number(dayText) * DAY_MS, asset, income: String(day.income), spend: String(day.spend) };
    })
    .toSorted((a, b) => a.dayMs - b.dayMs || (a.asset < b.asset ? -1 : 1));
  const kindOf = (id: number): BookOwnerKind =>
    id === viewerOwnerId ? "me" : source.isNpc(id) ? "npc" : "player";
  const state = source.core.state(buildingId);
  const lot = source.commands.lotOf(buildingId);
  return {
    status: "ok",
    buildingId,
    facilityId,
    facilityName: catalog.facility(facilityId)?.name ?? null,
    ownerKind: kindOf(ownerId),
    mine: viewerOwnerId !== undefined && source.core.mayManage(buildingId, viewerOwnerId),
    holders: source.core.holders(buildingId).map((holder) => ({
      kind: kindOf(holder.ownerId),
      shares: String(holder.shares),
    })),
    vault: vault.toSorted((a, b) => (a.asset < b.asset ? -1 : 1)),
    debt: [...source.core.debts(buildingId)]
      .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([asset, amount]) => ({ asset, amount: String(amount) })),
    debtSinceMs: state?.debtSinceMs ?? null,
    suspendedAtMs: state?.suspendedAtMs ?? null,
    goods: goods.toSorted((a, b) => (a.asset < b.asset ? -1 : 1)),
    nextSettleMs: source.core.nextSettleMs(nowMs),
    taxBp: source.core.taxRateOf(buildingId, ownerId),
    minLot: lot.minLot,
    retail: lot.retail,
    fromMs,
    toMs: nowMs,
    firstMs,
    totals,
    days: bars,
    entries,
  };
}
