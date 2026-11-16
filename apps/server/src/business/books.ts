// 사업장 장부 조회(tRPC facilities.books) — 기획 D-548·D-555(1513 "장부는 모두에게 공개"), docs/adr/2026-11-15-business-ledger.md
// - 원장 항목을 그대로 읽는다(새 요약 표 없음, ADR "장부를 어디서 읽나" 1): 그 건물 주인의 건물 위치 계정(금고·창고) 항목을 기간 안에서 거래 종류·
//   화폐·날마다 합하고, 최근 거래 목록을 붙인다. 잔고·적자·멈춤은 메모리(원장·사업장 코어)에서 읽는다.
// - 읽기 전에 쓰기 대기열을 기다린다(방금 들어온 수입이 빠지지 않게).
// - 기간은 1·7·30일(화면이 고른다). 원장은 추가만이라 지우지 않는다 — 화면이 기간만 자른다.
// - 바뀜 (2026-11-15, docs/adr/2026-11-15-building-screen.md): 주인·주주 이름(names.ts)·지분 몫, 창고 물건 값 합(재무상태), 지분 시장(shares.ts)을
//   붙인다. 건물 판 머리 이름표(readBuildingOwner)도 여기서 읽는다.
import {
  BOOK_COLUMNS,
  type BookColumn,
  type BookHolder,
  type BuildingOwnerResponse,
  type BookDay,
  type BookEntry,
  type BookGoods,
  type BookOwnerKind,
  type BookTotals,
  type BusinessBooksResponse,
  type ReserveView,
  bookColumnOf,
  businessLocation,
  countsForProfit,
  majorHolders,
  sharePm,
} from "@terra/shared/businessBooks";
import { fairPriceView } from "@terra/shared/fairPrice";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { BusinessCommands } from "./commands.ts";
import type { BusinessCore } from "./core.ts";
import type { OwnerNames } from "./names.ts";
import type { ReservePlan } from "./reserve.ts";
import type { ShareMarkets } from "./shares.ts";
import { goodsFair } from "./fairPrice.ts";

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
  /** 지분 시장(없으면 지분 칸 없이) */
  readonly shares?: ShareMarkets | undefined;
  /** 주인·주주 이름(없으면 이름 없이) */
  readonly names?: OwnerNames | undefined;
  /** 적정가 수수료(‰, 설정 칸 business_service_fee_pm — D-570 1822). 없으면 적정가 칸 없이 */
  readonly fairFeePm?: (() => number) | undefined;
  /** 외주 수리를 맡을 그 공방 일꾼 수(수리 줄이 없는 건물이면 undefined — D-570 1785) */
  readonly repairWorkers?: ((buildingId: number) => number | undefined) | undefined;
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
  let stockValue = 0n;
  for (const account of source.ledger.accounts()) {
    if (account.ownerId !== ownerId || account.location !== here) continue;
    accounts.set(account.id, account.asset);
    if (account.balance <= 0n) continue;
    if (isMoney(account.asset)) vault.push({ asset: account.asset, amount: String(account.balance) });
    else {
      const price = source.commands.priceOf(buildingId, account.asset);
      const name = catalog.itemName(account.asset.slice(5));
      // 재무상태의 재고 값: 판매 값(팔지 않으면 팩 기준 값 — catalog unitPriceOf, 모르면 1)
      const unit = price ?? catalog.unitPriceOf?.(account.asset.slice(5)) ?? 1n;
      stockValue += unit * account.balance;
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
  /** 기간 산출(job_output이 이 창고에 넣은 물건) — 적정가 인건비 몫(D-570 1822) */
  const produced = new Map<string, bigint>();
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
      if (asset !== undefined && !isMoney(asset) && String(row.kind) === "job_output") {
        const qty = BigInt(String(row.amount));
        if (qty > 0n) produced.set(asset, (produced.get(asset) ?? 0n) + qty);
      }
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
  const taxBp = source.core.taxRateOf(buildingId, ownerId);
  // 적정가(D-570 1822): 기간 임금 지출(임금 칸, 금고 화폐 합 — 나간 돈이 음수)을 산출에 나눈다
  const feePm = source.fairFeePm?.();
  let wagesSpent = 0n;
  for (const byColumn of sums.values()) wagesSpent -= byColumn.get("wages") ?? 0n;
  const fair =
    feePm === undefined
      ? undefined
      : goodsFair(
          goods.map((line) => line.asset),
          wagesSpent,
          produced,
          (asset) => catalog.unitPriceOf?.(asset.slice(5)) ?? 1n,
          { feePm, taxBp },
        );
  const repairWorkers = source.repairWorkers?.(buildingId);
  const lot = source.commands.lotOf(buildingId);
  const holderList = source.core.holders(buildingId);
  const total = holderList.reduce((sum, holder) => sum + holder.shares, 0n);
  const names = source.names
    ? await source.names.names([ownerId, ...holderList.map((h) => h.ownerId)])
    : undefined;
  const holders: BookHolder[] = holderList.map((holder) => ({
    kind: kindOf(holder.ownerId),
    shares: String(holder.shares),
    name: names?.get(holder.ownerId) ?? null,
    pm: sharePm(holder.shares, total),
  }));
  return {
    status: "ok",
    buildingId,
    facilityId,
    facilityName: catalog.facility(facilityId)?.name ?? null,
    ownerKind: kindOf(ownerId),
    mine: viewerOwnerId !== undefined && source.core.mayManage(buildingId, viewerOwnerId),
    holders,
    ownerName: names?.get(ownerId) ?? null,
    stockValue: String(stockValue),
    ...(source.shares ? { market: source.shares.view(buildingId, viewerOwnerId, nowMs) } : {}),
    reserve: reserveView(source.core.reserve(buildingId)),
    vault: vault.toSorted((a, b) => (a.asset < b.asset ? -1 : 1)),
    debt: [...source.core.debts(buildingId)]
      .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([asset, amount]) => ({ asset, amount: String(amount) })),
    debtSinceMs: state?.debtSinceMs ?? null,
    suspendedAtMs: state?.suspendedAtMs ?? null,
    goods: goods
      .map((line) => {
        const value = fair?.get(line.asset);
        return value ? { ...line, fair: fairPriceView(value) } : line;
      })
      .toSorted((a, b) => (a.asset < b.asset ? -1 : 1)),
    ...(repairWorkers === undefined
      ? {}
      : {
          repairService: (() => {
            const rate = source.commands.repairRate(buildingId);
            return {
              perHour: rate.set ? String(rate.perHour) : null,
              charged: String(rate.perHour),
              fair: fairPriceView(source.commands.repairFair(buildingId)),
              workers: repairWorkers,
            };
          })(),
        }),
    nextSettleMs: source.core.nextSettleMs(nowMs),
    taxBp,
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

/** 지급준비금 계획 → 응답(화폐 차례) */
function reserveView(plan: ReservePlan): ReserveView {
  return {
    ratioPm: plan.ratioPm,
    chosen: plan.chosen,
    marginPm: plan.marginPm,
    lines: [...plan.assets]
      .toSorted((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([asset, line]) => ({
        asset,
        needed: String(line.needed),
        keep: String(line.keep),
        floor: String(line.floor),
      })),
  };
}

/** 건물 판 머리 이름표 읽기에 드는 것 */
export interface OwnerLabelSource {
  readonly core: BusinessCore;
  readonly names?: OwnerNames | undefined;
  place(buildingId: number): { ownerId: number | null; cityId: number | null } | undefined;
  isBusiness(buildingId: number): boolean;
  isNpc(ownerId: number): boolean;
}

/**
 * 건물 판 머리 이름표(사용자 요청 2026-11-15): 주인 이름, 지분을 나눴으면 가장 많은 주주 이름·몫(‰), 보는 사람의 몫·관리 가능
 */
export async function readBuildingOwner(
  source: OwnerLabelSource,
  viewerOwnerId: number | undefined,
  buildingId: number,
): Promise<BuildingOwnerResponse> {
  const place = source.place(buildingId);
  if (!place) return { status: "unknown_building" };
  const ownerId = place.ownerId;
  const kindOf = (id: number): BookOwnerKind =>
    id === viewerOwnerId ? "me" : source.isNpc(id) ? "npc" : "player";
  const business = ownerId !== null && source.isBusiness(buildingId);
  const holders = business ? source.core.holders(buildingId) : [];
  const total = holders.reduce((sum, holder) => sum + holder.shares, 0n);
  const first = holders[0];
  const split = first !== undefined && (first.ownerId !== ownerId || first.shares < total);
  const names = source.names
    ? await source.names.names([...(ownerId === null ? [] : [ownerId]), ...(first ? [first.ownerId] : [])])
    : undefined;
  const mine = viewerOwnerId !== undefined && ownerId === viewerOwnerId;
  const myShares =
    viewerOwnerId === undefined
      ? 0n
      : (holders.find((holder) => holder.ownerId === viewerOwnerId)?.shares ?? 0n);
  return {
    status: "ok",
    buildingId,
    ownerKind: ownerId === null ? null : kindOf(ownerId),
    ownerName: ownerId === null ? null : (names?.get(ownerId) ?? null),
    mine,
    top:
      split && first
        ? {
            kind: kindOf(first.ownerId),
            name: names?.get(first.ownerId) ?? null,
            pm: sharePm(first.shares, total),
          }
        : null,
    myPm: sharePm(myShares, total),
    canManage:
      viewerOwnerId !== undefined &&
      (business ? majorHolders(holders).includes(viewerOwnerId) : ownerId === viewerOwnerId),
    business,
  };
}
