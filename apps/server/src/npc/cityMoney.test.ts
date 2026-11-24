// 도시 화폐(도시의 기축 통화) 규칙 — docs/adr/2026-11-24-city-money.md
import { describe, expect, it } from "vitest";
import {
  FOREIGN_CITY_MONEY_MIN,
  type CityMoneyChoice,
  cityMoneyChoice,
  createCityMoney,
} from "./cityMoney.ts";

const OWN = "cur:alder";
const ALLY = "cur:birch";

function setup(chosen = new Map<number, CityMoneyChoice>()) {
  const owners = new Map([
    [1, 10],
    [2, 20],
  ]);
  const money = createCityMoney({
    chosen,
    ownerOf: (cityId) => owners.get(cityId),
    nationMoneyOf: (owner) => (owner === 10 ? OWN : ALLY),
  });
  return { owners, money };
}

describe("도시 화폐", () => {
  it("고르지 않은 도시는 주인 나라 화폐, 없는 도시는 undefined", () => {
    const { money } = setup();
    expect(money.of(1)).toBe(OWN);
    expect(money.of(2)).toBe(ALLY);
    expect(money.of(3)).toBeUndefined();
    expect(money.chosenOf(1)).toBeUndefined();
  });

  it("고른 화폐를 쓰고, null이면 주인 나라 화폐로 돌아간다", () => {
    const { money } = setup();
    money.set(1, ALLY);
    expect(money.of(1)).toBe(ALLY);
    expect(money.chosenOf(1)).toBe(ALLY);
    money.set(1, null);
    expect(money.of(1)).toBe(OWN);
  });

  it("도시 주인이 바뀌면 옛 주인이 고른 값은 쓰지 않는다", () => {
    const { owners, money } = setup(new Map([[1, { currency: "cur:cedar", owner: 10 }]]));
    expect(money.of(1)).toBe("cur:cedar");
    owners.set(1, 20);
    expect(money.chosenOf(1)).toBeUndefined();
    expect(money.of(1)).toBe(ALLY);
  });
});

describe("도시 화폐 고르기 판정", () => {
  const base = { own: OWN, issued: (currency: string) => currency === OWN || currency === ALLY };

  it("주인 나라 화폐·되돌리기는 국고 조건 없이 받는다(적는 값 없음)", () => {
    expect(cityMoneyChoice({ ...base, currency: null, treasuryOf: () => 0n })).toEqual({
      ok: true,
      store: null,
    });
    expect(cityMoneyChoice({ ...base, currency: OWN, treasuryOf: () => 0n })).toEqual({
      ok: true,
      store: null,
    });
  });

  it("다른 나라 화폐는 국고에 정한 양 이상 있어야 한다", () => {
    expect(
      cityMoneyChoice({ ...base, currency: ALLY, treasuryOf: () => FOREIGN_CITY_MONEY_MIN - 1n }),
    ).toEqual({ ok: false, code: "reserve_short" });
    expect(cityMoneyChoice({ ...base, currency: ALLY, treasuryOf: () => FOREIGN_CITY_MONEY_MIN })).toEqual({
      ok: true,
      store: ALLY,
    });
    expect(FOREIGN_CITY_MONEY_MIN).toBe(100_000n);
  });

  it("찍는 나라가 없는 화폐는 받지 않는다", () => {
    expect(cityMoneyChoice({ ...base, currency: "cur:ghost", treasuryOf: () => 10n ** 9n })).toEqual({
      ok: false,
      code: "unknown_currency",
    });
  });
});
