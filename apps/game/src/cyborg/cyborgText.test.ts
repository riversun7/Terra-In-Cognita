// 사이보그 화면 다듬기 시험 — 속성 계열 묶음(기본·강화), 상세 전투 스펙 묶음·막대 채움, 핵심 사양 출처 칸
import type { RosterPrimarySource, RosterStatBreakdown } from "@terra/shared/roster";
import { describe, expect, it } from "vitest";
import {
  barFill,
  combatGroupOf,
  combatGroups,
  coreSegments,
  corePartOf,
  elementFamilies,
  elementLabel,
  termMilliSum,
} from "./cyborgText.ts";

const hp: RosterStatBreakdown = {
  id: "hp",
  shape: "quantity",
  base: 10,
  terms: [
    { stat: "str", value: 10, weightPm: 1500, milli: 15_000 },
    { stat: "vit", value: 10, weightPm: 3000, milli: 30_000 },
  ],
  weighted: 45,
  extra: 5,
  score: 50,
  cap: null,
  halfConstant: null,
  value: 60,
};

const evade: RosterStatBreakdown = {
  id: "evade",
  shape: "probability",
  base: 0,
  terms: [{ stat: "agi", value: 25, weightPm: 1000, milli: 25_000 }],
  weighted: 25,
  extra: 0,
  score: 25,
  cap: 850,
  halfConstant: 250,
  value: 77,
};

describe("속성", () => {
  it("12칸을 계열 6줄(기본·강화)로, 모자란 값은 0", () => {
    const families = elementFamilies([3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(families).toHaveLength(6);
    expect(families[0]).toEqual({
      basic: { code: "water", value: 3 },
      enhanced: { code: "frost", value: 1 },
    });
    expect(families[5]).toEqual({ basic: { code: "dark", value: 2 }, enhanced: { code: "necro", value: 0 } });
    expect(elementLabel("lightning", "ko")).toBe("번개");
    expect(elementLabel("necro", "en")).toBe("Necro");
  });
});

describe("상세 전투 스펙(옛 SecondaryStatsCard 묶음)", () => {
  it("팩 행을 VITALS·OFFENSE·DEFENSE·MOBILITY로, 모르는 행은 기타, 빈 묶음(효율)은 뺀다", () => {
    const ids = [
      "hp",
      "armor_hp",
      "shield_hp",
      "defense_rate",
      "physical_attack",
      "elemental_attack",
      "hit",
      "evade",
      "crit_chance",
      "crit_multiplier",
      "action_speed",
      "stamina",
      "mp",
      "sight",
      "new_row",
    ];
    const groups = combatGroups(ids.map((id) => ({ id })));
    expect(groups.map((entry) => entry.group)).toEqual(["vitals", "offense", "defense", "mobility", "other"]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["hp", "armor_hp", "shield_hp", "mp", "stamina"]);
    expect(groups[2]?.rows.map((row) => row.id)).toEqual(["defense_rate", "evade"]);
    expect(combatGroupOf("sight")).toBe("mobility");
  });

  it("막대 한 색: 확률 = 값 ÷ 상한, 양 = 값 ÷ 그 값을 넘는 1·2·5 단위, 0 이하 = 빈 막대", () => {
    expect(barFill(evade)).toBeCloseTo(77 / 850);
    expect(barFill(hp)).toBeCloseTo(60 / 100);
    expect(barFill({ shape: "quantity", value: 317, cap: null })).toBeCloseTo(317 / 500);
    expect(barFill({ shape: "quantity", value: 1770, cap: null })).toBeCloseTo(1770 / 2000);
    expect(barFill({ shape: "quantity", value: 200, cap: null })).toBe(1);
    expect(barFill({ shape: "quantity", value: 0, cap: null })).toBe(0);
    expect(termMilliSum(hp)).toBe(45_000);
  });
});

describe("핵심 사양 출처", () => {
  it("칸 차례: 몸 값 → 장비 → 인공장기(부품) → 스킬·효과, 같은 칸은 더하고 0은 막대에서 뺀다", () => {
    const sources: RosterPrimarySource[] = [
      { kind: "body", value: 40 },
      { kind: "item", slot: "accessory", item: "ring", value: 2 },
      { kind: "item", slot: "accessory", item: "ring2", value: 1 },
      { kind: "item", slot: "organ", item: "heart", value: 3 },
      { kind: "effect", id: "buff", value: 0 },
    ];
    expect(coreSegments(sources)).toEqual([
      { part: "body", value: 40 },
      { part: "gear", value: 3 },
      { part: "organ", value: 3 },
    ]);
    expect(corePartOf({ kind: "item", slot: "part", item: "x", value: 1 })).toBe("organ");
    expect(corePartOf({ kind: "growth", value: 30, kPm: 1100 })).toBe("growth");
  });
});
