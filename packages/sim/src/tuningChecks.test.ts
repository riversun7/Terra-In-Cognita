import { TUNING_PROBLEMS } from "@terra/shared/tuning";
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "./society/coefficients.ts";
import { societyCoefficientsFrom } from "./tuning.ts";
import { newTuningProblems, tuningProblems } from "./tuningChecks.ts";

const withValues = (entries: readonly (readonly [string, number])[]) =>
  societyCoefficientsFrom(new Map(entries));

describe("설정 칸 여러 칸 규칙 검사(D1)", () => {
  it("시험 계수표(= 팩 출발값, 서버 combatCatalog.test.ts가 같다는 것을 본다)에는 문제가 없다", () => {
    expect(tuningProblems(TEST_SOCIETY_COEFFICIENTS)).toEqual([]);
  });

  it.each([
    ["n9_fit", [["n9_initial_sum", 200]]],
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
  ] as const)("%s ← %j", (problem, values) => {
    expect(tuningProblems(withValues(values))).toEqual([problem]);
  });

  it("문제 코드는 공용 목록(@terra/shared TUNING_PROBLEMS) 안이고, 새로 생긴 문제만 고른다", () => {
    const broken = withValues([
      ["n9_initial_sum", 200],
      ["n6_k_min", 1300],
    ]);
    const problems = tuningProblems(broken);
    for (const problem of problems) expect(TUNING_PROBLEMS).toContain(problem);
    expect(newTuningProblems(["n9_fit"], problems)).toEqual(["n6_order"]);
    expect(newTuningProblems(problems, ["n9_fit"])).toEqual([]);
  });
});
