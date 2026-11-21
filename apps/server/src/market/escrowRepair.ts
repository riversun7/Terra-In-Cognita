// 물자 거래소 물건 에스크로 부팅 손질(줄기 escrow-fix, docs/questions/2026-11-22-escrow-fix.md 2591) — 거래소 모음(books.ts)을 되살리고
// 없는 도시를 닫은 뒤, 에스크로 불변식 검사(check) 전에 한 번 부른다(settleMarketsAtBoot — npc/economy.ts).
// - 물건 에스크로(escrow:goods:<거래소>) 잔고 ≠ 걸린 팔 주문 합(남은 묶음 × 묶음 크기)이면 차이를 시스템 계정 reconcile:escrow:<자산>과 맞바꾼다:
//   남는 것(잔고 > 합)은 그 계정으로 보내고(누구에게도 주지 않는다), 모자란 것(잔고 < 합)은 그 계정에서 채운다(걸린 주문은 그대로 — 체결·돌려주기가
//   묶은 양을 옮길 수 있게). [임시] 가장 보수적인 안이다: 남는 물건을 주문 주인·도시 창고에 줄지는 질문 2591.
// - 되살리지 않은 거래소(걸린 주문이 없다 — 걸린 주문이 있는 거래소는 부팅 때 모두 되살린다)의 남은 잔고도 0으로 맞춘다.
// - 맞춘 뒤 차이는 0이라 다시 켜도 아무것도 하지 않는다(같은 결과). 돈 에스크로는 손대지 않는다(경고만 — 돈은 발행·소각 규칙이 따로다).
// - 묶음 크기가 바뀐 옛 팔 주문은 거래소를 만들 때 이미 돌려줬다(books.ts) — 여기서 함께 기록에 남긴다.
import { type LedgerAccount, type LedgerBook, goodsEscrowCode } from "@terra/sim";
import type { MarketRegistry, RelottedOrder } from "./books.ts";

/** 물건 에스크로를 맞춘 거래소 하나. diff = 맞추기 전 잔고 − 걸린 팔 주문 합(양수 = 남음, 음수 = 모자람) */
export interface EscrowAdjustment {
  readonly marketId: number;
  readonly asset: string;
  readonly escrow: bigint;
  readonly expected: bigint;
  readonly diff: bigint;
}

export interface EscrowRepair {
  readonly relotted: readonly RelottedOrder[];
  readonly adjusted: readonly EscrowAdjustment[];
}

/** 에스크로 맞추기의 짝 시스템 계정 코드(자산마다 — 잔고 = 지금까지 맞춘 차이의 합, 음수면 맞추며 채운 양) */
export function escrowReconcileCode(asset: string): string {
  return `reconcile:escrow:${asset}`;
}

/** 물건 에스크로 계정 코드(goodsEscrowCode)의 거래소 ID(아니면 undefined) */
function goodsEscrowIdOf(code: string | null): number | undefined {
  const match = code === null ? null : /^escrow:goods:(\d+)$/.exec(code);
  return match ? Number(match[1]) : undefined;
}

/** 물건 에스크로를 걸린 팔 주문 합에 맞춘다(위 머리 주석). 맞춘 것과 묶음 크기 때문에 돌려준 옛 주문을 돌려준다 */
export function reconcileGoodsEscrow(
  registry: Pick<MarketRegistry, "books" | "relotted">,
  ledger: LedgerBook,
  nowMs: number,
): EscrowRepair {
  // 물건 에스크로 계정을 먼저 모은다(맞추며 짝 계정이 새로 생긴다)
  const escrows = new Map<number, Readonly<LedgerAccount>>();
  for (const account of ledger.accounts()) {
    const id = goodsEscrowIdOf(account.systemCode);
    if (id !== undefined) escrows.set(id, account);
  }
  const adjusted: EscrowAdjustment[] = [];
  const adjust = (
    marketId: number,
    asset: string,
    location: number | null,
    escrow: bigint,
    expected: bigint,
  ): void => {
    const diff = escrow - expected;
    if (diff === 0n) return;
    ledger.post({
      kind: "escrow_reconcile",
      atMs: nowMs,
      entries: [
        { account: ledger.systemAccount(goodsEscrowCode(marketId), asset, location), amount: -diff },
        { account: ledger.systemAccount(escrowReconcileCode(asset), asset), amount: diff },
      ],
    });
    adjusted.push({ marketId, asset, escrow, expected, diff });
  };
  for (const book of [...registry.books()].toSorted((a, b) => a.id - b.id)) {
    const lot = book.market.config.lotSize ?? 1n;
    let expected = 0n;
    for (const order of book.market.orders()) if (order.side === "sell") expected += order.remaining * lot;
    adjust(book.id, book.asset, book.market.config.location, escrows.get(book.id)?.balance ?? 0n, expected);
    escrows.delete(book.id);
  }
  for (const [marketId, account] of [...escrows].toSorted(([a], [b]) => a - b))
    adjust(marketId, account.asset, account.location, account.balance, 0n);
  return { relotted: registry.relotted(), adjusted };
}

/**
 * 부팅 때 거래소 마무리(npc/economy.ts, 거래소·환전 모음을 되살린 뒤): 없는 도시(폐허 등)의 복원한 거래소는 걸린 주문을 돌려주고 닫고, 있는 도시마다
 * 도시 표를 두고, 물건 보증금을 맞춘 뒤(위) 남은 에스크로 불변식 위반(돈 포함)을 경고로 남긴다
 */
export function settleMarketsAtBoot(o: {
  readonly registry: MarketRegistry;
  readonly fx: { check(): string[] };
  readonly cities: ReadonlyMap<number, unknown>;
  readonly ledger: LedgerBook;
  readonly nowMs: number;
  readonly log: { warn(obj: object, message: string): void };
}): void {
  // 지우면서 훑어도 된다: Map 반복은 지운 열쇠를 건너뛴다
  for (const cityId of o.registry.markets.keys())
    if (!o.cities.has(cityId)) o.registry.dropCity(cityId, o.nowMs);
  for (const cityId of o.cities.keys()) o.registry.ensureCity(cityId);
  logEscrowRepair(o.log, reconcileGoodsEscrow(o.registry, o.ledger, o.nowMs));
  const problems = [...o.registry.check(), ...o.fx.check()];
  if (problems.length > 0) o.log.warn({ problems }, "market escrow differs after restore");
}

/** 서버 기록 한 줄(손질한 것이 있을 때만 경고 "market escrow repaired after restore" — 50개까지 자세히). 남겼으면 true */
export function logEscrowRepair(
  log: { warn(obj: object, message: string): void },
  repair: EscrowRepair,
): boolean {
  if (repair.relotted.length === 0 && repair.adjusted.length === 0) return false;
  log.warn(escrowRepairFields(repair), "market escrow repaired after restore");
  return true;
}

function escrowRepairFields(repair: EscrowRepair): Record<string, unknown> {
  return {
    relottedOrders: repair.relotted.length,
    relottedGoods: String(repair.relotted.reduce((sum, row) => sum + row.locked, 0n)),
    adjustedMarkets: repair.adjusted.length,
    relotted: repair.relotted.slice(0, 50).map((row) => ({
      market: row.marketId,
      order: row.orderId,
      owner: row.owner,
      remaining: String(row.remaining),
      locked: String(row.locked),
      lot: String(row.lot),
    })),
    adjusted: repair.adjusted.slice(0, 50).map((row) => ({
      market: row.marketId,
      asset: row.asset,
      escrow: String(row.escrow),
      expected: String(row.expected),
      diff: String(row.diff),
    })),
  };
}
