import type { TuningEntryView } from "@terra/shared/tuning";
import { describe, expect, it } from "vitest";
import {
  BLEND_PRESETS,
  buildLoyaltyRules,
  buildRoleRanges,
  buildTuningValuesRecord,
  effectiveValue,
  indexEntries,
  pruneNpcAiPending,
  sampleLoyaltyCurve,
  sampleTraitHistogram,
  stagePatch,
} from "./npcAiModel.ts";

function makeEntry(id: string, value: number, packValue = value): TuningEntryView {
  return {
    id,
    code: "",
    page: "npc",
    name: { ko: id, en: id },
    unit: "pm",
    min: 0,
    max: 1000,
    packValue,
    value,
    override:
      value === packValue
        ? null
        : {
            value,
            packValueAtSave: packValue,
            contentVersionAtSave: "core@125",
            note: null,
            updatedBy: "dev",
            updatedAt: 0,
          },
    scope: "live",
    structural: false,
    desc: null,
    source: null,
  };
}

describe("npcAiModel", () => {
  it("모든 조직 합성 프리셋은 각 3항·2항 합이 정확히 1000‰이다", () => {
    const groups: readonly (readonly string[])[] = [
      ["npc_ai_dict_dec_leader_pm", "npc_ai_dict_dec_members_pm", "npc_ai_dict_dec_base_pm"],
      ["npc_ai_dict_cul_leader_pm", "npc_ai_dict_cul_members_pm", "npc_ai_dict_cul_base_pm"],
      ["npc_ai_demo_dec_leader_pm", "npc_ai_demo_dec_members_pm", "npc_ai_demo_dec_base_pm"],
      ["npc_ai_demo_cul_leader_pm", "npc_ai_demo_cul_members_pm", "npc_ai_demo_cul_base_pm"],
      ["npc_ai_cap_dec_leader_pm", "npc_ai_cap_dec_members_pm", "npc_ai_cap_dec_base_pm"],
      ["npc_ai_cap_cul_leader_pm", "npc_ai_cap_cul_members_pm", "npc_ai_cap_cul_base_pm"],
      ["npc_ai_house_dec_leader_pm", "npc_ai_house_dec_members_pm"],
      ["npc_ai_house_cul_leader_pm", "npc_ai_house_cul_members_pm"],
      ["npc_ai_city_dec_mayor_pm", "npc_ai_city_dec_nation_pm"],
      ["npc_ai_city_cul_mayor_pm", "npc_ai_city_cul_citizens_pm", "npc_ai_city_cul_nation_pm"],
    ];
    for (const preset of Object.values(BLEND_PRESETS)) {
      for (const keys of groups) {
        const sum = keys.reduce((acc, k) => acc + (preset[k] ?? 0), 0);
        expect(sum).toBe(1000);
      }
    }
  });

  it("stagePatch·effectiveValue·pruneNpcAiPending·buildTuningValuesRecord가 일관되게 동작한다", () => {
    const entries = [makeEntry("npc_ai_unit_trait_min", 100), makeEntry("npc_ai_unit_trait_max", 900, 850)];
    const byId = indexEntries(entries);
    const p1 = stagePatch(new Map(), byId, { npc_ai_unit_trait_min: 200, npc_ai_unit_trait_max: null });
    expect(p1.size).toBe(2);
    expect(effectiveValue(byId, p1, "npc_ai_unit_trait_min")).toBe(200);
    expect(effectiveValue(byId, p1, "npc_ai_unit_trait_max")).toBe(850);
    expect(buildTuningValuesRecord(entries, p1)).toEqual({
      npc_ai_unit_trait_min: 200,
      npc_ai_unit_trait_max: 850,
    });
    // 원래 서버 값으로 되돌리면 pending에서 빠진다
    const p2 = stagePatch(p1, byId, { npc_ai_unit_trait_min: 100 });
    expect(p2.has("npc_ai_unit_trait_min")).toBe(false);
    // 새 목록에서 이미 같은 값이 됐으면 prune이 제거한다
    const pruned = pruneNpcAiPending(p1, [
      makeEntry("npc_ai_unit_trait_min", 200, 100),
      makeEntry("npc_ai_unit_trait_max", 850, 850),
    ]);
    expect(pruned.size).toBe(0);
  });

  it("200명 성향 분포 히스토그램은 결정적이고 지정 범위를 지킨다", () => {
    const entries = [
      makeEntry("npc_ai_guard_belligerence_min", 600),
      makeEntry("npc_ai_guard_belligerence_max", 900),
    ];
    const ranges = buildRoleRanges(indexEntries(entries), new Map());
    const a = sampleTraitHistogram({
      role: "guard",
      axis: "belligerence",
      ranges: ranges.guard,
      spread: 220,
      useAnchor: false,
    });
    const b = sampleTraitHistogram({
      role: "guard",
      axis: "belligerence",
      ranges: ranges.guard,
      spread: 220,
      useAnchor: false,
    });
    expect(a).toEqual(b);
    expect(a.min).toBeGreaterThanOrEqual(600);
    expect(a.max).toBeLessThanOrEqual(900);
    expect(a.bins.reduce((acc, n) => acc + n, 0)).toBe(200);
  });

  it("충성도 개입 곡선은 충성도가 낮아질수록 개입률이 단조 증가한다", () => {
    const rules = buildLoyaltyRules(new Map(), new Map());
    const pts = sampleLoyaltyCurve(rules);
    expect(pts).toHaveLength(11);
    expect(pts[0]?.loyalty).toBe(100);
    expect(pts[10]?.loyalty).toBe(0);
    for (let i = 1; i < pts.length; i += 1) {
      expect(pts[i]?.neutralPm ?? 0).toBeGreaterThanOrEqual(pts[i - 1]?.neutralPm ?? 0);
    }
    // 반항 성향이 순종 성향보다 개입률이 높거나 같다
    expect(pts[5]?.rebelliousPm ?? 0).toBeGreaterThan(pts[5]?.loyalistPm ?? 0);
  });
});
