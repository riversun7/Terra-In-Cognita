import { describe, expect, it } from "vitest";
import { TEST_COMBAT_COEFFICIENTS } from "./combat/coefficients.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "./society/coefficients.ts";
import { TUNING_KEYS, combatCoefficientsFrom, societyCoefficientsFrom, tuningValue } from "./tuning.ts";

describe("설정 칸 값 → 계수표", () => {
  it("값이 없으면 기본 계수표 그대로, 있으면 그 칸만 바뀐다(원본은 그대로)", () => {
    expect(combatCoefficientsFrom(new Map())).toEqual(TEST_COMBAT_COEFFICIENTS);
    const tuned = combatCoefficientsFrom(
      new Map([
        ["n12_crit_spread", 800],
        ["n13_weight_agi", 900],
        ["unknown_key", 1],
      ]),
    );
    expect(tuned.critSpreadPm).toBe(800);
    expect(tuned.stamina.scoreWeightsPm).toEqual([0, 0, 900, 300, 0, 0]);
    expect(TEST_COMBAT_COEFFICIENTS.stamina.scoreWeightsPm[2]).toBe(700);
    const society = societyCoefficientsFrom(new Map([["n24_housing_3", 2500]]));
    expect(society.housingRecoveryPm).toEqual([1000, 1500, 2000, 2500]);
    // 안쪽 칸(사이보그 환생 N34)·공물(D-443)도 같은 길로 바뀐다
    const rebirth = societyCoefficientsFrom(
      new Map([
        ["n34_rebirth_currency", 25_000],
        ["s33_tribute_rate", 100],
      ]),
    );
    expect([rebirth.cyborg.rebirthCurrency, rebirth.cyborg.rebirthFaith, rebirth.tributePm]).toEqual([
      25_000, 50, 100,
    ]);
    expect(TEST_SOCIETY_COEFFICIENTS.cyborg.rebirthCurrency).toBe(10_000);
    // D-444: 독재 재발행 충성 보상 몫, 다시 굴리기 횟수(생성·환생 같은 칸)
    const d444 = societyCoefficientsFrom(
      new Map([
        ["d444_delist_loyalty", 300],
        ["n9_initial_rerolls", 5],
      ]),
    );
    expect([d444.delistLoyaltyPm, d444.cyborg.initialRerolls, d444.cyborg.temperaments.length]).toEqual([
      300, 5, 4,
    ]);
  });

  it("첫 접속 치우침(N9, D-445 168 출발값 4000)·시작 도시 붐빔 문턱(D-6041)도 같은 길로 바뀐다", () => {
    expect(TEST_SOCIETY_COEFFICIENTS.cyborg.initialFavorMilli).toBe(4000);
    const tuned = societyCoefficientsFrom(
      new Map([
        ["n9_initial_favor", 3500],
        ["d6041_crowd_normal", 10],
        ["d6041_crowd_busy", 30],
      ]),
    );
    expect([
      tuned.cyborg.initialFavorMilli,
      tuned.cyborg.startCrowdNormal,
      tuned.cyborg.startCrowdBusy,
    ]).toEqual([3500, 10, 30]);
  });

  it("속성 분배(N36 구조 값)·빛어둠(N37)·인공장기·생활비(N38)·정착 지원금(N39)·수리(F11 배열 칸·F12)도 같은 길로 바뀐다(D-450~D-455)", () => {
    const tuned = societyCoefficientsFrom(
      new Map([
        ["n36_element_points", 12],
        ["n37_light_dark", 3],
        ["n38_living_unpaid", 500],
        ["f11_repair_lv3", 18],
        ["f12_destroy_at", 5],
        ["n39_grant_base", 120],
      ]),
    );
    expect(tuned.cyborg.grantBase).toBe(120);
    expect([
      tuned.cyborg.elementCells,
      tuned.cyborg.elementPoints,
      tuned.cyborg.lightDarkPoints,
      tuned.cyborg.livingUnpaidPm,
      tuned.durability.destroyAtMax,
    ]).toEqual([2, 12, 3, 500, 5]);
    expect(tuned.durability.repairLossPct).toEqual([30, 25, 18, 15, 10]);
    const structural = TUNING_KEYS.filter((key) => key.structural).map((key) => key.id);
    expect(structural).toEqual(expect.arrayContaining(["n36_element_cells", "n36_element_points"]));
  });

  it("속성 상성 rate(C10: 유리·불리·같은 계열, D-459)도 같은 길로 바뀌고, 옛 회복 칸(N13 회복·N15)은 없다(D-458 행으로 옮김)", () => {
    expect(TEST_COMBAT_COEFFICIENTS.affinity).toEqual({ favorPm: 50, unfavorPm: -50, samePm: -30 });
    const tuned = combatCoefficientsFrom(
      new Map([
        ["c10_affinity_favor", 60],
        ["c10_affinity_unfavor", -40],
        ["c10_affinity_same", -25],
      ]),
    );
    expect(tuned.affinity).toEqual({ favorPm: 60, unfavorPm: -40, samePm: -25 });
    // 피격 뒤 쉴드 재생 지연(N40 묶음, D-463 212, 출발값 0)
    expect(combatCoefficientsFrom(new Map([["n40_shield_regen_delay", 3000]])).shieldRegenDelayMs).toBe(3000);
    const ids = TUNING_KEYS.map((key) => key.id);
    for (const gone of ["n13_regen", "n13_regen_cap", "n15_mp_regen"]) expect(ids).not.toContain(gone);
  });

  it("정원사 칸(D-460·D-468 C16a)도 같은 길로 바뀐다", () => {
    const tuned = societyCoefficientsFrom(
      new Map([
        ["c16_strength_base", 6],
        ["c16a_target_win", 250],
        ["c16a_target_sum", 40_000],
        ["c17_physical_divisor", 80],
      ]),
    );
    expect([
      tuned.gardener.strengthBase,
      tuned.gardener.targetWinPm,
      tuned.gardener.targetSum,
      tuned.gardener.physicalDivisor,
    ]).toEqual([6, 250, 40_000, 80]);
  });

  it("모든 키는 계수표의 숫자 칸을 가리키고, ID는 겹치지 않는다", () => {
    for (const key of TUNING_KEYS) expect(Number.isInteger(tuningValue(key))).toBe(true);
    expect(new Set(TUNING_KEYS.map((key) => key.id)).size).toBe(TUNING_KEYS.length);
    expect(societyCoefficientsFrom(new Map())).toEqual(TEST_SOCIETY_COEFFICIENTS);
  });
});
