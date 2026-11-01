import { describe, expect, it } from "vitest";
import { type GardenerCoefficients, TEST_GARDENER_COEFFICIENTS } from "./coefficients.ts";
import { nomadFits, nomadSize, nomadTarget, roamCell, startingNomads } from "./nomads.ts";
import { squareGrid } from "./pollution.ts";

const grid = squareGrid(64);
const at = (x: number, y: number): number => grid.cellOf(x, y);
const DAY = 86_400_000;

/** 공식은 D-460 원래 값으로 본다(세기 기본 4·물리형 나눗수 200 — D-468로 맞춘 출발값과 따로, 계수 값만 바뀌어도 시험이 그대로) */
const c: GardenerCoefficients = { ...TEST_GARDENER_COEFFICIENTS, strengthBase: 4, physicalDivisor: 200 };

describe("유목 정원사 부대(D-206·D-319·D-320, D-460 202, 질문 221 가)", () => {
  it("행성마다 정찰대 2·정화 군단 1, 처음 자리는 모함 칸", () => {
    const parties = startingNomads(at(30, 30), c);
    expect(parties.map((p) => [p.id, p.kind, p.cell])).toEqual([
      [1, "scout", at(30, 30)],
      [2, "scout", at(30, 30)],
      [3, "legion", at(30, 30)],
    ]);
    expect(parties.every((p) => p.target === null && p.arriveAtMs === null && p.excluded.size === 0)).toBe(
      true,
    );
  });

  it("정찰대는 오염 5,000 아래, 정화 군단은 5,000 이상만 고른다", () => {
    expect([
      nomadFits("scout", 2_000, c),
      nomadFits("scout", 4_999, c),
      nomadFits("scout", 5_000, c),
    ]).toEqual([true, true, false]);
    expect([nomadFits("legion", 4_999, c), nomadFits("legion", 9_000, c)]).toEqual([false, true]);
  });

  it("목표 = 탐지 8칸 안·영향권 밖·문턱 이상·제외 안 된 칸 가운데 가장 높은 칸(같으면 작은 칸 키)", () => {
    const layer = new Map([
      [at(10, 10), 4_000], // 영향권 안(도시) → 못 고름
      [at(12, 10), 3_000],
      [at(10, 14), 3_000],
      [at(18, 10), 4_500], // 8칸 안
      [at(19, 10), 4_900], // 9칸 → 밖
      [at(11, 11), 1_999], // 문턱 아래
    ]);
    const inInfluence = (cell: number): boolean => cell === at(10, 10);
    const pick = (excluded = new Map<number, number>()) =>
      nomadTarget(layer, at(10, 10), grid, c, { kind: "scout", inInfluence, excluded, nowMs: 0 });
    expect(pick()).toBe(at(18, 10));
    expect(pick(new Map([[at(18, 10), DAY]]))).toBe(Math.min(at(12, 10), at(10, 14)));
    // 제외가 끝나면 다시 고른다
    expect(
      nomadTarget(layer, at(10, 10), grid, c, {
        kind: "scout",
        inInfluence,
        excluded: new Map([[at(18, 10), DAY]]),
        nowMs: DAY,
      }),
    ).toBe(at(18, 10));
    expect(
      nomadTarget(layer, at(10, 10), grid, c, { kind: "legion", inInfluence, excluded: new Map(), nowMs: 0 }),
    ).toBeNull();
  });

  it("규모: 정찰대 4, 정화 군단 4 × (1 + ⌊log2(1 + 오염 ÷ 1,000)⌋)", () => {
    expect(nomadSize("scout", 3_000, c)).toBe(4);
    // 1 + 5 = 6 → 2 → 12
    expect(nomadSize("legion", 5_000, c)).toBe(12);
    // 1 + 10 = 11 → 3 → 16
    expect(nomadSize("legion", 10_000, c)).toBe(16);
  });

  it("떠돎: 8칸 안 칸 하나를 굴림으로 고른다(같은 굴림이면 같은 칸)", () => {
    const a = roamCell(at(30, 30), grid, c.nomadDetect, 12_345);
    expect(a).toBe(roamCell(at(30, 30), grid, c.nomadDetect, 12_345));
    const x = a % 64;
    const y = Math.floor(a / 64);
    expect(Math.max(Math.abs(x - 30), Math.abs(y - 30))).toBeLessThanOrEqual(8);
  });
});
