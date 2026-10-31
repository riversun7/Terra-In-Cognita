import { describe, expect, it } from "vitest";
import { runDuels } from "./duels.ts";
import { TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { type WeaponSpec, specFromStats } from "./unitSpec.ts";

const sword: WeaponSpec = {
  kind: "physical",
  attack: 20,
  attackAppropriate: 40,
  hitPm: 900,
  hitAppropriate: 500,
  critPm: 100,
  critAppropriate: 200,
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
