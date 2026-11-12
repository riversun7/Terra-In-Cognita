// 사이보그 화면 다듬기 시험 — 속성 계열 묶음(기본·강화), 상세 전투 스펙 묶음·막대 채움, 핵심 사양 출처 칸, 버프 몫(질문 354)
import type { RosterPrimarySource, RosterStatBreakdown } from "@terra/shared/roster";
import { describe, expect, it } from "vitest";
import {
  barFill,
  barSplit,
  buffTone,
  combatGroupOf,
  combatGroups,
  coreSegments,
  corePartOf,
  effectShare,
  elementFamilies,
  elementLabel,
  expectedTierMilli,
  mapCrossMinutes,
  termMilliSum,
  tierSpan,
  tierSpanText,
  walkCellsMilli,
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
  it("팩 행(2차 스탯 17개 + 시야, D-458)을 VITALS·OFFENSE·DEFENSE·MOBILITY로, 모르는 행은 기타, 빈 묶음(효율)은 뺀다", () => {
    // 팩 차례(48 §3.2 묶음 차례)로 온다
    const ids = [
      "hp",
      "armor_hp",
      "shield_hp",
      "defense_rate",
      "elemental_defense_rate",
      "physical_attack",
      "elemental_attack",
      "hit",
      "evade",
      "crit_chance",
      "crit_multiplier",
      "action_speed",
      "stamina",
      "stamina_regen",
      "mp",
      "mp_regen",
      "shield_regen",
      "sight",
      "new_row",
    ];
    const groups = combatGroups(ids.map((id) => ({ id })));
    expect(groups.map((entry) => entry.group)).toEqual(["vitals", "offense", "defense", "mobility", "other"]);
    // 옛 VITALS(HP, 보호막, 보호막 재생, MP, STA): 재생·회복은 그 자원 바로 아래
    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      "hp",
      "armor_hp",
      "shield_hp",
      "shield_regen",
      "mp",
      "mp_regen",
      "stamina",
      "stamina_regen",
    ]);
    expect(groups[2]?.rows.map((row) => row.id)).toEqual(["defense_rate", "elemental_defense_rate", "evade"]);
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

describe("버프 몫(질문 354 → D-515: 기본값과 버프를 나눠 보인다)", () => {
  it("1차 스탯 몫 = 효과 합, 버프는 막대 끝 효과 칸, 디버프는 기본 막대 끝을 깎은 디버프 칸", () => {
    const buffed: RosterPrimarySource[] = [
      { kind: "body", value: 10 },
      { kind: "item", slot: "accessory", item: "ring", value: 2 },
      { kind: "effect", id: "food", value: 3 },
    ];
    expect(effectShare(buffed)).toBe(3);
    expect(coreSegments(buffed)).toEqual([
      { part: "body", value: 10 },
      { part: "gear", value: 2 },
      { part: "effect", value: 3 },
    ]);
    const cursed: RosterPrimarySource[] = [
      { kind: "body", value: 10 },
      { kind: "item", slot: "accessory", item: "ring", value: 2 },
      { kind: "effect", id: "curse", value: -3 },
      { kind: "effect", id: "food", value: 1 },
    ];
    expect(effectShare(cursed)).toBe(-2);
    // 막대 길이 = 기본 12, 끝 2칸(장비 칸 전부 → 몸 값은 그대로)이 디버프 칸
    expect(coreSegments(cursed)).toEqual([
      { part: "body", value: 10 },
      { part: "debuff", value: 2 },
    ]);
    // 기본보다 큰 디버프는 막대 전체
    expect(
      coreSegments([
        { kind: "body", value: 4 },
        { kind: "effect", id: "x", value: -9 },
      ]),
    ).toEqual([{ part: "debuff", value: 4 }]);
  });

  it("막대 두 칸: 앞 = 작은 값, 뒤 = 차이, 끝 = 큰 값의 barFill / 쪽: 낮을수록 좋은 값은 뒤집는다", () => {
    const quantity = { shape: "quantity", cap: null } as const;
    const up = barSplit(quantity, 60, 80);
    expect(up.fill + up.extra).toBeCloseTo(barFill({ ...quantity, value: 80 }));
    expect(up.fill).toBeCloseTo(60 / 100);
    const down = barSplit({ shape: "probability", cap: 850 }, 77, 50);
    expect(down.fill).toBeCloseTo(50 / 850);
    expect(down.extra).toBeCloseTo(27 / 850);
    expect(barSplit(quantity, 0, 0)).toEqual({ fill: 0, extra: 0 });
    expect(buffTone(5)).toBe("up");
    expect(buffTone(-5)).toBe("down");
    expect(buffTone(-100, true)).toBe("up");
    expect(buffTone(100, true)).toBe("down");
  });
});

describe("이동 속도·원자재별 채집 줄(2026-11-12)", () => {
  it("걷기 437 단위/초 = 0.426칸/초, 2차맵 한 장(256칸) 10분", () => {
    const move = { walk: 437, cellUnits: 1024, mapCells: 256 };
    expect(walkCellsMilli(move)).toBe(426);
    expect(mapCrossMinutes(move)).toBe(10);
    expect(mapCrossMinutes({ ...move, walk: 0 })).toBe(0);
  });

  it("티어 폭·기대 티어: 확률이 있는 칸만, 한 칸이면 그 티어", () => {
    const roll = [700, 150, 100, 50, 0, 0, 0, 0, 0, 0];
    expect(tierSpan(roll)).toEqual({ low: 0, high: 3 });
    expect(tierSpanText(roll)).toBe("T0–T3");
    expect(expectedTierMilli(roll)).toBe(150 + 200 + 150);
    const select = [0, 0, 1000, 0, 0, 0, 0, 0, 0, 0];
    expect(tierSpanText(select)).toBe("T2");
    expect(tierSpanText(Array.from({ length: 10 }, () => 0))).toBe("—");
    expect(tierSpan([0, 0, 0, 0, 0, 0, 0, 0, 0, 2])).toEqual({ low: 9, high: 9 });
  });
});
