import { describe, expect, it } from "vitest";
import { runDuels, runStatDuels } from "./duels.ts";
import { type Primaries, TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const sword: WeaponSpec = {
  kind: "physical",
  attack: 20,
  attackAppropriate: 40,
  hitPm: 900,
  // 명중·크리는 점수(D-458): DEX 16·AGI 16이면 명중 점수 28, 크리 점수 24
  hitAppropriate: 25,
  critPm: 100,
  critAppropriate: 20,
  intervalMs: 1000,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 5,
  mpCost: 0,
};
const fighter = (str: number, agi: number) =>
  specFromStats({
    id: 1,
    side: 1,
    party: 1,
    x: 0,
    y: 0,
    stats: computeSecondary({ str, dex: 16, agi, vit: 16, int: 16, wis: 16 }, TEST_STAT_TABLE),
    weapon: sword,
    moveIntervalMs: 1000,
  });

describe("반복 대결(개발자 페이지 전투 시뮬레이터가 쓸 함수)", () => {
  it("같은 입력이면 같은 결과이고, 같은 유닛끼리는 한쪽으로 쏠리지 않는다", () => {
    const a = [fighter(16, 16), fighter(16, 16), fighter(16, 16)];
    const first = runDuels(a, a, 20, 3);
    expect(runDuels(a, a, 20, 3)).toEqual(first);
    expect(first.aWins + first.bWins).toBe(20);
    expect(first.aWins).toBeGreaterThan(2);
    expect(first.bWins).toBeGreaterThan(2);
  });

  it("한 스탯을 크게 올린 쪽이 더 자주 이긴다(쏠림을 재는 도구로 쓸 수 있다)", () => {
    const strong = [fighter(40, 16), fighter(40, 16), fighter(40, 16)];
    const plain = [fighter(16, 16), fighter(16, 16), fighter(16, 16)];
    const report = runDuels(strong, plain, 20, 9);
    expect(report.aWins).toBeGreaterThan(report.bWins);
  });
});

describe("1차 스탯 대결(밸런스 화면이 쓸 함수, D-458): 1차 스탯 + 가중치 표 → 2차 스탯 → 시드 대결", () => {
  const even: Primaries = { str: 16, dex: 16, agi: 16, vit: 16, int: 16, wis: 16 };
  const options = { table: TEST_STAT_TABLE, runs: 12, seed: 5 };
  // 스태미나가 바닥나 오래 끄는 대결을 피한다(시험 시간): 공격에 스태미나를 쓰지 않는 칼
  const blade: WeaponSpec = { ...sword, staminaCost: 0 };

  it("같은 입력이면 같은 결과, 1차 스탯 하나를 +10 하면 같은 상대에게 더 자주 이긴다", () => {
    const base = { primaries: even, weapon: blade };
    const first = runStatDuels(base, base, options);
    expect(runStatDuels(base, base, options)).toEqual(first);
    expect(first.aWins + first.bWins).toBe(12);
    const plusStr = runStatDuels({ primaries: { ...even, str: 26 }, weapon: blade }, base, options);
    expect(plusStr.aWins).toBeGreaterThan(first.aWins);
  });

  it("가중치 표를 바꾸면 결과가 바뀐다(표를 고쳐 보는 화면)", () => {
    const base = { primaries: even, weapon: blade };
    const strong = { primaries: { ...even, str: 40 }, weapon: blade };
    const normal = runStatDuels(strong, base, options);
    // STR가 어느 2차 스탯에도 주지 않는 표에서는 STR를 올려도 같은 유닛이라 덜 이긴다
    const noStr = TEST_STAT_TABLE.map((row) => ({
      ...row,
      weights: row.weights.map((w, i) => (i === 0 ? 0 : w)),
    }));
    const weaker = runStatDuels(strong, base, { ...options, table: noStr });
    expect(weaker.aWins).toBeLessThan(normal.aWins);
  });
});
