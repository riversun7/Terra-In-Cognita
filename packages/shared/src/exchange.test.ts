// 거래소 건물 공용 규칙(docs/adr/2026-11-16-exchange-buildings.md) 시험
import { describe, expect, it } from "vitest";
import {
  EXCHANGE_BONUS_MAX,
  ORDER_BASE,
  cellsFromRect,
  exchangeLocked,
  isExchangeKind,
  orderLimit,
  stationBonus,
} from "./exchange.ts";

describe("거래소 건물 규칙", () => {
  it("유닛·증권 거래소는 잠기고 물자·외환은 열린다", () => {
    expect(exchangeLocked("goods")).toBe(false);
    expect(exchangeLocked("fx")).toBe(false);
    expect(exchangeLocked("units")).toBe(true);
    expect(exchangeLocked("securities")).toBe(true);
    expect(isExchangeKind("goods")).toBe(true);
    expect(isExchangeKind("shop")).toBe(false);
  });

  it("주문 한도 = 기본 + 배치 유닛마다 ⌊(INT + WIS) ÷ 20⌋, 위 끝 있음(D-148)", () => {
    expect(stationBonus(30, 29)).toBe(2);
    expect(stationBonus(-5, 10)).toBe(0);
    expect(orderLimit([])).toBe(ORDER_BASE);
    expect(orderLimit([2, 3])).toBe(ORDER_BASE + 5);
    expect(orderLimit([EXCHANGE_BONUS_MAX, 9])).toBe(ORDER_BASE + EXCHANGE_BONUS_MAX);
  });

  it("건물 칸에서 칸까지 체비셰프 거리(안이면 0)", () => {
    const rect = { x: 10, y: 10, width: 3, height: 3 };
    expect(cellsFromRect(rect, 11, 11)).toBe(0);
    expect(cellsFromRect(rect, 12, 12)).toBe(0);
    expect(cellsFromRect(rect, 15, 11)).toBe(3);
    expect(cellsFromRect(rect, 8, 6)).toBe(4);
  });
});
