// 거래소 건물 공용 규칙(docs/adr/2026-11-16-exchange-buildings.md) 시험
import { describe, expect, it } from "vitest";
import {
  EXCHANGE_BONUS_MAX,
  ORDER_BASE,
  exchangeLocked,
  isExchangeKind,
  defaultLockerUnit,
  lockerCapacityG,
  lockerFits,
  orderLimit,
  stationBonus,
  unitLockersG,
} from "./exchange.ts";

describe("거래소 건물 규칙", () => {
  it("유닛 거래소는 잠기고 물자·외환·증권은 열린다(증권 잠금은 D-583으로 풀림)", () => {
    expect(exchangeLocked("goods")).toBe(false);
    expect(exchangeLocked("fx")).toBe(false);
    expect(exchangeLocked("units")).toBe(true);
    expect(exchangeLocked("securities")).toBe(false);
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

  it("유닛마다 작은 창고: 주인 크기 = 유닛 창고 합, 고르지 않은 넓히기는 사이보그 본체 먼저(질문 2081)", () => {
    expect(unitLockersG(200_000, 50_000, [])).toBe(0n);
    expect(unitLockersG(200_000, 50_000, [0, 2, 1])).toBe(750_000n);
    const units = [
      { unitId: 9, cyborg: false, steps: 0 },
      { unitId: 4, cyborg: true, steps: 3 },
      { unitId: 2, cyborg: false, steps: 1 },
    ];
    expect(defaultLockerUnit(units, 5)).toBe(4);
    // 본체가 위 끝이면 유닛 ID 차례로 다음
    expect(defaultLockerUnit(units, 3)).toBe(2);
    expect(defaultLockerUnit(units, 0)).toBeUndefined();
  });
});
