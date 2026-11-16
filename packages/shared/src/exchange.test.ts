// 거래소 건물 공용 규칙(docs/adr/2026-11-16-exchange-buildings.md) 시험
import { describe, expect, it } from "vitest";
import {
  EXCHANGE_BONUS_MAX,
  ORDER_BASE,
  exchangeLocked,
  isExchangeKind,
  lockerCapacityG,
  lockerFits,
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

  it("개인 창고 크기 = 기본 + 넓힌 칸 × 한 칸, 넘치면 더 넣지 못한다(D-571 1943)", () => {
    expect(lockerCapacityG(200_000, 50_000, 0)).toBe(200_000n);
    expect(lockerCapacityG(200_000, 50_000, 3)).toBe(350_000n);
    expect(lockerCapacityG(-1, 50_000, -2)).toBe(0n);
    expect(lockerFits(100n, 100n, 200n)).toBe(true);
    expect(lockerFits(150n, 100n, 200n)).toBe(false);
    // 이미 넘친 창고(설정을 줄였거나 옛 세계)도 빼는 쪽·0은 된다
    expect(lockerFits(500n, 0n, 200n)).toBe(true);
  });
});
