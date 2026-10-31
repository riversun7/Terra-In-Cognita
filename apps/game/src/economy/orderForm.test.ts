// 주문표 검사·미리 보기 시험 — 칸 검사, 바로 체결분·걸어 둘 양, 거래세(판 쪽, 체결마다 버림), 묶이는 돈·물건, 한도·모자람
import { describe, expect, it } from "vitest";
import { formatBp, formatRate, parseAmountInput, toBig, trendOf } from "./amount.ts";
import {
  type OrderContext,
  type OrderDraft,
  checkOrder,
  defaultGuard,
  maxQty,
  stepPrice,
  taxOf,
  walkBook,
} from "./orderForm.ts";

const context: OrderContext = {
  asks: [
    { price: 101n, qty: 10n, mine: 0n },
    { price: 102n, qty: 5n, mine: 2n },
    { price: 110n, qty: 50n, mine: 0n },
  ],
  bids: [
    { price: 99n, qty: 8n, mine: 0n },
    { price: 95n, qty: 20n, mine: 0n },
  ],
  taxBp: 200,
  cash: 10_000n,
  goods: 30n,
  ordersLeft: 7,
};

const draft = (patch: Partial<OrderDraft> = {}): OrderDraft => ({
  side: "buy",
  kind: "limit",
  price: "100",
  qty: "10",
  guard: "",
  trigger: "",
  triggerDirection: "below",
  expiryDays: 7,
  ...patch,
});

describe("금액 글", () => {
  it("입력칸 글은 자리 나눔을 빼고 0 이상 정수만 받는다", () => {
    expect(parseAmountInput("1,250 000")).toEqual({ kind: "ok", value: 1_250_000n });
    expect(parseAmountInput("  ")).toEqual({ kind: "empty" });
    expect(parseAmountInput("1.5")).toEqual({ kind: "invalid" });
    expect(parseAmountInput("-3")).toEqual({ kind: "invalid" });
    expect(parseAmountInput("12a")).toEqual({ kind: "invalid" });
    expect(toBig("007")).toBe(7n);
    expect(toBig("x")).toBe(0n);
    expect(toBig(null)).toBe(0n);
  });

  it("만분율 글과 방향", () => {
    expect(formatBp(1234)).toBe("+12.34%");
    expect(formatBp(-5)).toBe("−0.05%");
    expect(formatBp(0)).toBe("0.00%");
    expect(formatRate(200)).toBe("2.00%");
    expect(trendOf(null)).toBe("flat");
    expect(trendOf(-1)).toBe("down");
  });
});

describe("checkOrder", () => {
  it("지정가 매수가 호가와 엇갈리지 않으면 모두 걸어 두고 값 × 수량을 묶는다", () => {
    const check = checkOrder(draft(), context);
    expect(check.ok).toBe(true);
    expect(check.preview).toMatchObject({
      fillQty: 0n,
      restQty: 10n,
      gross: 1_000n,
      tax: 0n,
      net: 1_000n,
      escrow: { kind: "cash", amount: 1_000n },
      avgPrice: null,
    });
  });

  it("지정가 매수가 매도 호가를 넘으면 걸린 값으로 먼저 체결하고(내 주문 빼고) 나머지를 건다", () => {
    const check = checkOrder(draft({ price: "102", qty: "20" }), context);
    // 101 × 10 + 102 × 3(5 − 내 것 2) = 1,316, 남은 7개는 102에 건다
    expect(check.preview).toMatchObject({ fillQty: 13n, fillValue: 1_316n, restQty: 7n, avgPrice: 101n });
    expect(check.preview?.gross).toBe(1_316n + 714n);
    // 묶기는 주문 값 × 수량(차이는 체결 때 돌려받는다)
    expect(check.preview?.escrow).toEqual({ kind: "cash", amount: 2_040n });
  });

  it("매도는 판 쪽 거래세를 체결마다 버림으로 셈하고 물건을 묶는다", () => {
    const check = checkOrder(draft({ side: "sell", price: "97", qty: "12" }), context);
    // 99 × 8 = 792 → 세금 15(15.84 버림), 남은 4개 × 97 = 388 → 세금 7(7.76 버림)
    expect(check.preview).toMatchObject({ fillQty: 8n, restQty: 4n, gross: 1_180n, tax: 22n, net: 1_158n });
    expect(check.preview?.escrow).toEqual({ kind: "goods", amount: 12n });
    expect(taxOf(792n, 200)).toBe(15n);
  });

  it("시장가는 안전망까지만 체결하고 나머지는 걸지 않는다. 묶기는 안전망 × 수량", () => {
    const check = checkOrder(draft({ kind: "market", guard: "105", qty: "20" }), context);
    expect(check.preview).toMatchObject({ fillQty: 13n, restQty: 0n, unfilledQty: 7n, gross: 1_316n });
    expect(check.preview?.escrow).toEqual({ kind: "cash", amount: 2_100n });
    expect(check.fields.price).toBeUndefined();
    const none = checkOrder(draft({ kind: "market", guard: "100" }), context);
    expect(none.problems).toContain("liquidity");
    expect(none.ok).toBe(false);
  });

  it("조건 주문은 지금 체결하지 않고 묶지도 않는다. 발동 가격이 있어야 한다", () => {
    expect(checkOrder(draft({ kind: "conditional" }), context).fields.trigger).toBe("required");
    const check = checkOrder(draft({ kind: "conditional", trigger: "98", price: "200" }), context);
    expect(check.preview).toMatchObject({ fillQty: 0n, restQty: 10n, escrow: null });
    expect(check.ok).toBe(true);
  });

  it("칸 오류: 비었음·정수 아님·너무 큼. 오류가 있으면 미리 보기가 없다", () => {
    const check = checkOrder(draft({ price: "", qty: "1.5" }), context);
    expect(check.fields).toEqual({ price: "required", qty: "integer" });
    expect(check.preview).toBeNull();
    expect(checkOrder(draft({ qty: "0" }), context).fields.qty).toBe("integer");
    expect(checkOrder(draft({ qty: "9".repeat(14) }), context).fields.qty).toBe("too_large");
    expect(checkOrder(draft({ kind: "market" }), context).fields.guard).toBe("required");
  });

  it("돈·물건이 모자라거나 주문 한도에 닿으면 문제로 알린다", () => {
    expect(checkOrder(draft({ price: "1000", qty: "11" }), context).problems).toEqual(["cash"]);
    expect(checkOrder(draft({ side: "sell", qty: "31" }), context).problems).toEqual(["goods"]);
    const limited = checkOrder(draft(), { ...context, ordersLeft: 0 });
    expect(limited.problems).toEqual(["limit"]);
    expect(limited.ok).toBe(false);
  });
});

describe("주문표 도우미", () => {
  it("최대 수량: 매수는 돈 ÷ 값(시장가는 안전망), 매도는 가진 양", () => {
    expect(maxQty(draft({ price: "300" }), context)).toBe(33n);
    expect(maxQty(draft({ kind: "market", guard: "1000" }), context)).toBe(10n);
    expect(maxQty(draft({ side: "sell" }), context)).toBe(30n);
    expect(maxQty(draft({ price: "" }), context)).toBe(0n);
  });

  it("값 올리기·내리기는 한 칸씩, 1 아래로 가지 않고, 비었으면 기준 값에서", () => {
    expect(stepPrice("100", 1, null)).toBe("101");
    expect(stepPrice("1", -1, null)).toBe("1");
    expect(stepPrice("", -1, 50n)).toBe("49");
  });

  it("안전망 기본값과 호가 먹기", () => {
    expect(defaultGuard("buy", context)).toBe("107");
    expect(defaultGuard("sell", context)).toBe("94");
    expect(defaultGuard("buy", { ...context, asks: [] })).toBe("");
    expect(walkBook(context.bids, "sell", 30n, 96n)).toEqual({ fills: [{ price: 99n, qty: 8n }], left: 22n });
  });
});
