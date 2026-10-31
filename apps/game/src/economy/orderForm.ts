// 주문표 검사·미리 보기 — 입력 검사, 바로 체결될 양·평균가, 거래세, 묶이는 돈·물건(순수 함수, 시험 대상).
// 규칙의 원본은 서버 판정이다(R2 ADR 4절, sim goodsMarket). 여기는 같은 규칙으로 화면에 미리 보일 뿐이다:
// - 체결: 들어온 주문이 반대쪽 호가를 가격 차례로 먹는다. 체결가 = 걸려 있던 주문 값. 내 주문과는 체결하지 않는다(단계의 mine 빼고).
// - 묶기(에스크로): 매수는 값 × 수량의 돈(시장가는 최대 가격 × 수량), 매도는 수량만큼 물건.
// - 거래세: 판 쪽이 낸다. 체결 하나마다 ⌊총액 × 세율 ÷ 10000⌋(버림). 남아 걸어 두는 양은 한 번에 체결된다고 보고 셈한다
//   (나눠 체결되면 버림이 늘어 실제 세금은 같거나 적다).
// - 시장가는 최대(매도는 최저) 가격 안전망까지만 체결하고 나머지는 걸지 않는다(D-6035 "최대 가격 안전망", 남는 양 처리는 [임시]).
// - 조건 주문은 지금 체결하지 않는다. 조건이 맞을 때 지정가로 낸다(D-6035). 묶기는 그때 한다([임시]).
// 주문을 보내는 길(WebSocket)은 서버 거래소가 열릴 때 붙인다(지금은 "곧 열림").
import { type AmountInput, parseAmountInput } from "./amount.ts";

export type OrderSide = "buy" | "sell";
export type OrderKind = "limit" | "market" | "conditional";
/** 조건 주문의 발동 방향: 값이 발동 가격 이하로 내려가면 / 이상으로 오르면 */
export type TriggerDirection = "below" | "above";

/** 주문표에 넣은 그대로(입력칸 글) */
export interface OrderDraft {
  readonly side: OrderSide;
  readonly kind: OrderKind;
  readonly price: string;
  readonly qty: string;
  /** 시장가 안전망(매수 최대 가격, 매도 최저 가격) */
  readonly guard: string;
  readonly trigger: string;
  readonly triggerDirection: TriggerDirection;
  readonly expiryDays: number;
}

/** 호가 단계(BigInt로 바꾼 것) */
export interface DepthLevel {
  readonly price: bigint;
  readonly qty: bigint;
  /** 이 단계의 내 주문 양(나와는 체결하지 않는다) */
  readonly mine: bigint;
}

/** 주문표가 보는 시장·내 몫 */
export interface OrderContext {
  /** 매도 호가(낮은 값 차례) */
  readonly asks: readonly DepthLevel[];
  /** 매수 호가(높은 값 차례) */
  readonly bids: readonly DepthLevel[];
  readonly taxBp: number;
  /** 살 수 있는 돈(그 화폐 지갑) */
  readonly cash: bigint;
  /** 팔 수 있는 양(그 도시 창고) */
  readonly goods: bigint;
  /** 남은 주문 수(D-148) */
  readonly ordersLeft: number;
}

export type OrderField = "price" | "qty" | "guard" | "trigger";
/** 칸 오류: 비었음, 0보다 큰 정수가 아님, 너무 큼 */
export type FieldError = "required" | "integer" | "too_large";
/** 주문 전체 문제: 돈 모자람, 물건 모자람, 체결할 호가 없음(시장가), 주문 한도 */
export type OrderProblem = "cash" | "goods" | "liquidity" | "limit";

export interface OrderPreview {
  readonly qty: bigint;
  /** 지정가·조건은 주문 값, 시장가는 null */
  readonly price: bigint | null;
  /** 지금 바로 체결될 양과 그 값 합 */
  readonly fillQty: bigint;
  readonly fillValue: bigint;
  /** 바로 체결분의 평균가(버림). 체결이 없으면 null */
  readonly avgPrice: bigint | null;
  /** 걸어 둘 양(지정가) */
  readonly restQty: bigint;
  /** 안전망 때문에 체결되지 않는 양(시장가) */
  readonly unfilledQty: bigint;
  /** 총액 = 체결분 값 + 걸어 둘 양 × 주문 값 */
  readonly gross: bigint;
  /** 거래세(매도만, 그 밖은 0) */
  readonly tax: bigint;
  /** 매도: 받을 돈(총액 − 거래세). 매수: 총액 */
  readonly net: bigint;
  /** 지금 묶이는 것(조건 주문은 없음) */
  readonly escrow: { readonly kind: "cash" | "goods"; readonly amount: bigint } | null;
}

export interface OrderCheck {
  readonly fields: Partial<Record<OrderField, FieldError>>;
  readonly problems: readonly OrderProblem[];
  /** 칸이 모두 읽히면 미리 보기. 아니면 null */
  readonly preview: OrderPreview | null;
  /** 칸 오류·문제가 없는지(거래소가 열리면 보내기 단추를 켤 조건) */
  readonly ok: boolean;
}

/** [임시] 한 주문의 상한(값·수량). 입력 실수를 막는 화면 값이고 서버가 따로 본다 */
export const MAX_ORDER_QTY = 1_000_000_000_000n;
export const MAX_ORDER_PRICE = 1_000_000_000_000_000n;

/** 칸 하나 읽기: 0보다 큰 정수 */
function readPositive(text: string, max: bigint): { value: bigint } | { error: FieldError } {
  const input: AmountInput = parseAmountInput(text);
  if (input.kind === "empty") return { error: "required" };
  if (input.kind === "invalid" || input.value <= 0n) return { error: "integer" };
  if (input.value > max) return { error: "too_large" };
  return { value: input.value };
}

/** 판 쪽 거래세(체결 하나) */
export function taxOf(gross: bigint, taxBp: number): bigint {
  return (gross * BigInt(Math.max(0, Math.trunc(taxBp)))) / 10_000n;
}

/** 반대쪽 호가를 limit 값까지 먹는다(limit이 null이면 끝까지). 단계마다 체결량·값 */
export function walkBook(
  levels: readonly DepthLevel[],
  side: OrderSide,
  qty: bigint,
  limit: bigint | null,
): { fills: { price: bigint; qty: bigint }[]; left: bigint } {
  const fills: { price: bigint; qty: bigint }[] = [];
  let left = qty;
  for (const level of levels) {
    if (left === 0n) break;
    const crosses = limit === null || (side === "buy" ? level.price <= limit : level.price >= limit);
    if (!crosses) break;
    const available = level.qty > level.mine ? level.qty - level.mine : 0n;
    if (available === 0n) continue;
    const take = available < left ? available : left;
    fills.push({ price: level.price, qty: take });
    left -= take;
  }
  return { fills, left };
}

/** 주문표 검사 + 미리 보기 */
export function checkOrder(draft: OrderDraft, context: OrderContext): OrderCheck {
  const fields: Partial<Record<OrderField, FieldError>> = {};
  const qtyRead = readPositive(draft.qty, MAX_ORDER_QTY);
  if ("error" in qtyRead) fields.qty = qtyRead.error;
  let price: bigint | null = null;
  let guard: bigint | null = null;
  if (draft.kind === "market") {
    const guardRead = readPositive(draft.guard, MAX_ORDER_PRICE);
    if ("error" in guardRead) fields.guard = guardRead.error;
    else guard = guardRead.value;
  } else {
    const priceRead = readPositive(draft.price, MAX_ORDER_PRICE);
    if ("error" in priceRead) fields.price = priceRead.error;
    else price = priceRead.value;
    if (draft.kind === "conditional") {
      const triggerRead = readPositive(draft.trigger, MAX_ORDER_PRICE);
      if ("error" in triggerRead) fields.trigger = triggerRead.error;
    }
  }
  const problems: OrderProblem[] = [];
  if (context.ordersLeft <= 0) problems.push("limit");
  if ("error" in qtyRead || Object.keys(fields).length > 0) {
    return { fields, problems, preview: null, ok: false };
  }
  const qty = qtyRead.value;
  const opposite = draft.side === "buy" ? context.asks : context.bids;
  // 조건 주문은 지금 호가와 상관없이 발동 때 지정가로 낸다
  const walked =
    draft.kind === "conditional"
      ? { fills: [], left: qty }
      : walkBook(opposite, draft.side, qty, draft.kind === "market" ? guard : price);
  const fillQty = qty - walked.left;
  let fillValue = 0n;
  let fillTax = 0n;
  for (const fill of walked.fills) {
    const value = fill.price * fill.qty;
    fillValue += value;
    fillTax += taxOf(value, context.taxBp);
  }
  const restQty = draft.kind === "market" ? 0n : walked.left;
  const unfilledQty = draft.kind === "market" ? walked.left : 0n;
  const restValue = price === null ? 0n : price * restQty;
  const gross = fillValue + restValue;
  const tax = draft.side === "sell" ? fillTax + taxOf(restValue, context.taxBp) : 0n;
  const escrowCash = draft.kind === "market" ? (guard ?? 0n) * qty : (price ?? 0n) * qty;
  const escrow: OrderPreview["escrow"] =
    draft.kind === "conditional"
      ? null
      : draft.side === "buy"
        ? { kind: "cash", amount: escrowCash }
        : { kind: "goods", amount: qty };
  if (draft.side === "buy" && draft.kind !== "conditional" && escrowCash > context.cash)
    problems.push("cash");
  if (draft.side === "sell" && qty > context.goods) problems.push("goods");
  if (draft.kind === "market" && fillQty === 0n) problems.push("liquidity");
  return {
    fields,
    problems,
    preview: {
      qty,
      price,
      fillQty,
      fillValue,
      avgPrice: fillQty === 0n ? null : fillValue / fillQty,
      restQty,
      unfilledQty,
      gross,
      tax,
      net: draft.side === "sell" ? gross - tax : gross,
      escrow,
    },
    ok: problems.length === 0,
  };
}

/** "최대" 단추: 살 수 있는(팔 수 있는) 가장 큰 수량. 값을 모르면 0 */
export function maxQty(draft: OrderDraft, context: OrderContext): bigint {
  if (draft.side === "sell") return context.goods;
  const read = parseAmountInput(draft.kind === "market" ? draft.guard : draft.price);
  if (read.kind !== "ok" || read.value <= 0n) return 0n;
  const affordable = context.cash / read.value;
  return affordable > MAX_ORDER_QTY ? MAX_ORDER_QTY : affordable;
}

/** 값 한 칸 올리기·내리기(호가 단위는 [임시] 1). 비었거나 틀리면 기준 값에서 시작 */
export function stepPrice(text: string, direction: 1 | -1, fallback: bigint | null): string {
  const read = parseAmountInput(text);
  const base = read.kind === "ok" ? read.value : (fallback ?? 0n);
  const next = base + BigInt(direction);
  return String(next > 0n ? next : 1n);
}

/** 시장가 안전망 기본값: 매수는 최우선 매도 × 105%, 매도는 최우선 매수 × 95%(올림·버림). 호가가 없으면 빈 글 */
export function defaultGuard(side: OrderSide, context: OrderContext): string {
  if (side === "buy") {
    const best = context.asks[0]?.price;
    return best === undefined ? "" : String((best * 105n + 99n) / 100n);
  }
  const best = context.bids[0]?.price;
  return best === undefined ? "" : String((best * 95n) / 100n);
}
