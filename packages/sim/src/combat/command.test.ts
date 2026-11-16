import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { combatTierIndex, commandCapOf, commanderOrder } from "./command.ts";

const c = TEST_COMBAT_COEFFICIENTS;
const u = (id: number, commandCap: number, title?: number, tier?: number | null) => ({
  id,
  commandCap,
  ...(title === undefined ? {} : { commandRank: { title, combatTier: tier ?? null } }),
});
const pick = (list: ReturnType<typeof u>[]) => list.toSorted(commanderOrder)[0]?.id;

describe("지휘관 정원(C7, D-558·D-571 — 군단 3~10, 작위로만·환생 +1)", () => {
  it("계급이 없으면 아래 끝 3, 작위 표만 본다(랭킹 등급은 정원에 들지 않는다 — D-571), 칸 밖 작위는 끝으로 자른다", () => {
    expect(commandCapOf(undefined, 0, c)).toBe(3);
    expect(commandCapOf({ title: 3, combatTier: null }, 0, c)).toBe(5);
    // D-558 때는 max(작위, 등급 표)로 7이었다 → D-571: 작위 민간인 = 3
    expect(commandCapOf({ title: 0, combatTier: 1 }, 0, c)).toBe(3);
    expect(commandCapOf({ title: 4, combatTier: 3 }, 0, c)).toBe(7);
    expect(commandCapOf({ title: 5, combatTier: 0 }, 0, c)).toBe(9);
    expect(commandCapOf({ title: 99, combatTier: -4 }, 0, c)).toBe(9);
    expect(commandCapOf({ title: -2, combatTier: 0 }, 0, c)).toBe(3);
  });

  it("환생은 횟수와 상관없이 +1 한 번, 위 끝 10을 넘지 않는다. 표가 없는 옛 계수표는 0", () => {
    expect(commandCapOf(undefined, 1, c)).toBe(4);
    expect(commandCapOf(undefined, 7, c)).toBe(4);
    expect(commandCapOf({ title: 5, combatTier: 0 }, 3, c)).toBe(10);
    expect(
      commandCapOf({ title: 5, combatTier: 0 }, 3, {
        command: {
          titleParties: [3, 3, 4, 5, 7, 9],
          rebirthBonus: 5,
          min: 3,
          max: 20,
        },
      }),
    ).toBe(14);
    expect(commandCapOf(undefined, 0, {})).toBe(0);
  });

  it("랭킹 등급 문턱 → 등급 번호(0 = 가장 위), 등급 밖은 null", () => {
    expect(combatTierIndex(10, [500, 10, 200, 50])).toBe(0);
    expect(combatTierIndex(200, [10, 50, 200, 500])).toBe(2);
    expect(combatTierIndex(null, [10, 50])).toBeNull();
    expect(combatTierIndex(77, [10, 50])).toBeNull();
  });

  it("승계 순서(1545): 작위 → 전투 랭킹 등급 → 정원 → 작은 ID, 계급이 없으면 옛 선출(정원 → ID)", () => {
    expect(pick([u(1, 3), u(2, 5), u(3, 5)])).toBe(2);
    expect(pick([u(1, 9, 0, 0), u(2, 3, 2, null)])).toBe(2);
    expect(pick([u(1, 3, 1, null), u(2, 3, 1, 3), u(3, 3, 1, 1)])).toBe(3);
    expect(pick([u(4, 3, 0, null), u(2, 3)])).toBe(2);
  });
});
