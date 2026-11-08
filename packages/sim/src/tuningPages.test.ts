import { TUNING_PAGES } from "@terra/shared/tuning";
import { describe, expect, it } from "vitest";
import { TEST_CENTRAL_BANK_RULE, centralBankRuleOf } from "./economy/centralBank.ts";
import { TEST_NPC_COEFFICIENTS } from "./npc/coefficients.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "./society/coefficients.ts";
import { TUNING_KEYS, societyCoefficientsFrom, tuningValue } from "./tuning.ts";
import { tuningPageOf, tuningPageTable } from "./tuningPages.ts";

describe("설정 칸 분야 페이지(2026-11-08)", () => {
  it("모든 칸이 페이지 하나에 서고, 페이지마다 칸이 있다", () => {
    const table = tuningPageTable();
    for (const key of TUNING_KEYS) expect(TUNING_PAGES, key.id).toContain(table.get(key.id));
    for (const page of TUNING_PAGES) expect([...table.values()], page).toContain(page);
  });

  it("칸 → 페이지: 규칙 ADR대로", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["s26_rebellion", "society"],
      ["d186_loot_take", "society"],
      ["n29_restore", "society"],
      ["q121_development", "society"],
      ["dev_max", "society"],
      ["d520_occupy_days", "society"],
      ["n45_refresh_every", "society"],
      ["d323_decide_every", "npc"],
      ["npc_idle_score", "npc"],
      ["npc_seed_farms", "npc"],
      ["p15_cell_max", "gardener"],
      ["travel_raid_base", "gardener"],
      ["n49_wear_chance", "holdings"],
      ["d509_potion_cooldown", "holdings"],
      ["d496_use_variance", "holdings"],
      ["c19_loot", "combat"],
      ["n54_armor_regen", "combat"],
      ["n55_heal_red_ms", "combat"],
      ["n48_wage_cycle_ms", "economy"],
      ["n43_level_bonus", "economy"],
      ["npc_bank_gain", "economy"],
      ["d506_storage_per_level", "economy"],
      ["n39_grant_base", "other"],
      ["ranking_period", "other"],
      ["nope_id", "other"],
    ];
    for (const [id, page] of cases) expect(tuningPageOf(id), id).toBe(page);
  });
});

/** 칸 ID → 계수표 기본값 */
function value(id: string): number {
  const key = TUNING_KEYS.find((candidate) => candidate.id === id);
  if (!key) throw new Error(id);
  return tuningValue(key);
}

describe("새 설정 칸(2026-11-08): 출발값 = 옛 상수, 칸으로 바뀐다", () => {
  it("NPC 판단 점수·중앙은행·발전도 식·지분 팔기 칸은 옛 값 그대로", () => {
    expect(
      [
        "npc_idle_score",
        "npc_attack_war_bonus",
        "npc_attack_declare_penalty",
        "npc_attack_comfort_cities",
        "npc_reserve_pm",
        "npc_trade_markup",
        "npc_spend_divisor",
        "npc_stall_food_pm",
      ].map(value),
    ).toEqual([250, 200, 150, 4, 2000, 250, 4, 500]);
    // 중앙은행 공식: 옛 TEST_CENTRAL_BANK_RULE 그대로
    expect(centralBankRuleOf(TEST_NPC_COEFFICIENTS)).toEqual(TEST_CENTRAL_BANK_RULE);
    expect(
      ["npc_bank_target", "npc_bank_gain", "npc_bank_daily_cap", "npc_bank_interest"].map(value),
    ).toEqual([1000, 2000, 300, 1]);
    // 발전도 식: ⌊평균 ÷ 2000⌋ + min(30, 휴먼 × 2) + 연구 Lv × 4, 상한 100. 지분 팔기 100주 × 주당 10
    expect(TEST_SOCIETY_COEFFICIENTS.development).toEqual({
      satisfactionDivisorMilli: 2000,
      perUnit: 2,
      unitCap: 30,
      perResearchLevel: 4,
      max: 100,
    });
    expect([value("share_sale_amount"), value("share_sale_price")]).toEqual([100, 10]);
  });

  it("칸 값이 계수표에 든다", () => {
    const tuned = societyCoefficientsFrom(
      new Map([
        ["npc_idle_score", 300],
        ["npc_bank_gain", 1000],
        ["dev_max", 80],
        ["share_sale_price", 25],
      ]),
    );
    expect([tuned.npc.idleScore, tuned.npc.bankGainBp, tuned.development.max, tuned.shareSalePrice]).toEqual([
      300, 1000, 80, 25,
    ]);
    expect(centralBankRuleOf(tuned.npc).gainBp).toBe(1000);
  });
});
