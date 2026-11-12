import { TUNING_PROBLEMS } from "@terra/shared/tuning";
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "./society/coefficients.ts";
import { societyCoefficientsFrom } from "./tuning.ts";
import { TEST_STAT_TABLE } from "./combat/stats.ts";
import { newTuningProblems, statTableProblems, tuningProblems } from "./tuningChecks.ts";

const withValues = (entries: readonly (readonly [string, number])[]) =>
  societyCoefficientsFrom(new Map(entries));

describe("설정 칸 여러 칸 규칙 검사(D1)", () => {
  it("시험 계수표(= 팩 출발값, 서버 combatCatalog.test.ts가 같다는 것을 본다)에는 문제가 없다", () => {
    expect(tuningProblems(TEST_SOCIETY_COEFFICIENTS)).toEqual([]);
  });

  it.each([
    ["n9_fit", [["n9_initial_sum", 5]]],
    ["n9_fit", [["n9_initial_min", 11]]],
    ["n9_fit", [["n9_initial_min", 0]]],
    ["n9_fit", [["n9_initial_max", 9]]],
    ["n6_order", [["n6_k_min", 1300]]],
    ["n36_fit", [["n36_element_points", 21]]],
    ["n36_fit", [["n36_element_cells", 5]]],
    ["n39_order", [["n39_grant_min", 1600]]],
    ["crowd_order", [["d6041_crowd_normal", 60]]],
    ["unrest_order", [["s26_rebellion", 55]]],
    ["unrest_order", [["n35_sabotage", 45]]],
    ["lifespan_order", [["t4_lifespan_min", 9_000_000_000]]],
    ["fatigue_order", [["n23_band2_from", 20]]],
    ["fatigue_order", [["n21_fatigue_max", 80]]],
    ["wage_order", [["n27_rate_min", 2500]]],
    ["employer_order", [["n28_adjust_max", 700]]],
    ["food_order", [["n33_food_zero_at", 60]]],
    ["n45_fit", [["n45_cards_min_l2", 6]]],
    ["n45_fit", [["n45_stats_max_l4", 59]]],
    // Lv4·Lv5 덤(D-535 1158 나): 기본 10 + 덤 ≤ 원소 수 최소 2 × 10, 굴림 1~8번
    ["n45_fit", [["n45_element_bonus_l5", 11]]],
    ["n45_fit", [["n45_stat_rolls_l4", 0]]],
    ["n45_fit", [["n45_stat_rolls_l5", 9]]],
    ["n45_fit", [["n45_elements_max", 5]]],
    ["n45_fit", [["n45_element_points", 21]]],
    ["n45_fit", [["n45_element_points", 2]]],
    ["n45_fit", [["n45_refresh_every", 0]]],
    // 초기 스탯 합 상한(D-534): 사이보그 합·휴먼·크리쳐 최대 ≤ 100, 구인 토탈·유전자 총합 ≤ 휴먼 최대, 컨디션 상한 ≥ 0
    ["stat_sum_cap", [["n9_initial_sum", 101]]],
    ["stat_sum_cap", [["n9_human_sum_max", 101]]],
    ["stat_sum_cap", [["n9_creature_sum_max", 120]]],
    ["stat_sum_cap", [["n45_stats_max_l5", 90]]],
    ["stat_sum_cap", [["n47_total_max", 90]]],
    ["stat_sum_cap", [["condition_cap", -1]]],
  ] as const)("%s ← %j", (problem, values) => {
    expect(tuningProblems(withValues(values))).toEqual([problem]);
  });

  it("문제 코드는 공용 목록(@terra/shared TUNING_PROBLEMS) 안이고, 새로 생긴 문제만 고른다", () => {
    const broken = withValues([
      ["n9_initial_sum", 5],
      ["n6_k_min", 1300],
    ]);
    const problems = tuningProblems(broken);
    for (const problem of problems) expect(TUNING_PROBLEMS).toContain(problem);
    expect(newTuningProblems(["n9_fit"], problems)).toEqual(["n6_order"]);
    expect(newTuningProblems(problems, ["n9_fit"])).toEqual([]);
  });
});

describe("가중치 표 여러 칸 규칙(밸런스 화면, D-458 가치 없는 1차)", () => {
  it("시험 표(= 팩 stat_rows)에는 문제가 없다", () => {
    expect(statTableProblems(TEST_STAT_TABLE)).toEqual([]);
    expect(statTableProblems([])).toEqual([]);
  });

  it("켜진 모든 행에서 가중치가 0인 1차 스탯이 있으면 stat_primary_unused", () => {
    for (let column = 0; column < 6; column++) {
      const zeroed = TEST_STAT_TABLE.map((row) => ({
        ...row,
        weights: row.weights.map((w, i) => (i === column ? 0 : w)),
      }));
      expect(statTableProblems(zeroed)).toEqual(["stat_primary_unused"]);
    }
    // 한 행에라도 남아 있으면(시야 WIS만) 문제가 아니다 — 약한 1차는 화면이 따로 보인다
    const onlySight = TEST_STAT_TABLE.map((row) => ({
      ...row,
      weights: row.weights.map((w, i) => (i === 5 && row.id !== "sight" ? 0 : w)),
    }));
    expect(statTableProblems(onlySight)).toEqual([]);
    expect(TUNING_PROBLEMS).toContain("stat_primary_unused");
  });
});
