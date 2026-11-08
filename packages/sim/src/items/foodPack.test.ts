// 식품 포장 판정 시험 — D-524, docs/adr/2026-11-03-item-holdings.md "바뀜 (D-524, 2026-11-08)"
import { describe, expect, it } from "vitest";
import { UNPACK_MAX, exchangeListable, lotPreserve, planUnpack } from "./foodPack.ts";
import { agedAt, freshnessPm, spoilAtMs } from "./holding.ts";

const HOUR = 3_600_000;

describe("포장 상태의 보존 배율", () => {
  it("포장된 동안은 멈추고(0), 풀린 것은 보관 곳 배율", () => {
    expect(lotPreserve(true, 1000)).toBe(0);
    expect(lotPreserve(true, 5000)).toBe(0);
    expect(lotPreserve(false, 2000)).toBe(2000);
    expect(lotPreserve(false, -5)).toBe(0);
  });

  it("포장된 칸은 시간이 흘러도 신선도가 그대로이고 썩는 시각이 없다", () => {
    const age = { agedMs: 6 * HOUR, atMs: 1000 };
    const pm = lotPreserve(true, 1000);
    expect(agedAt(age, 1000 + 100 * HOUR, pm)).toBe(6 * HOUR);
    expect(freshnessPm(agedAt(age, 1000 + 100 * HOUR, pm), 24 * HOUR)).toBe(750);
    expect(spoilAtMs(age, 24 * HOUR, pm)).toBeNull();
  });
});

describe("포장 풀기", () => {
  it("한 개를 풀면 남는 수가 하나 줄고, 낱개는 멈춘 숙성에서 지금부터 흐른다", () => {
    const plan = planUnpack({ quantity: 5, packed: true, age: { agedMs: 2 * HOUR, atMs: 1000 } }, 1, 50_000);
    expect(plan).toEqual({ count: 1, left: 4, age: { agedMs: 2 * HOUR, atMs: 50_000 } });
    // 풀린 낱개는 보관 곳 배율로 숙성한다
    if (!plan) throw new Error("plan");
    expect(agedAt(plan.age, 50_000 + HOUR, lotPreserve(false, 1000))).toBe(3 * HOUR);
  });

  it("푸는 수는 1 이상, 수량·상한 이하로 자른다", () => {
    const lot = { quantity: 3, packed: true, age: { agedMs: 0, atMs: 0 } };
    expect(planUnpack(lot, 10, 0)?.count).toBe(3);
    expect(planUnpack(lot, 10, 0)?.left).toBe(0);
    expect(planUnpack(lot, 0, 0)?.count).toBe(1);
    expect(planUnpack({ ...lot, quantity: 1_000 }, 1_000, 0)?.count).toBe(UNPACK_MAX);
  });

  it("기준 시각은 되돌아가지 않는다(시계가 앞선 칸)", () => {
    expect(planUnpack({ quantity: 1, packed: true, age: { agedMs: 0, atMs: 9_000 } }, 1, 5_000)?.age).toEqual(
      { agedMs: 0, atMs: 9_000 },
    );
  });

  it("포장이 아니거나 신선도가 없는 칸은 풀 수 없다", () => {
    expect(planUnpack({ quantity: 1, packed: false, age: { agedMs: 0, atMs: 0 } }, 1, 0)).toBeNull();
    expect(planUnpack({ quantity: 4, packed: true, age: null }, 1, 0)).toBeNull();
  });
});

describe("거래소 등록(D-524·D-289)", () => {
  it("포장되고 문턱 이상인 식품만", () => {
    expect(exchangeListable({ packed: true }, 1000, 900)).toBe(true);
    expect(exchangeListable({ packed: true }, 900, 900)).toBe(true);
    expect(exchangeListable({ packed: true }, 899, 900)).toBe(false);
    expect(exchangeListable({ packed: false }, 1000, 900)).toBe(false);
  });
});
