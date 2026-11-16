// AI 작전(D-5039·D-5040) — 프리셋 출발값(49 C39·X15), 검사, NPC 성격 → 프리셋, 확률 환산(C40)
import { describe, expect, it } from "vitest";
import {
  AI_PRESETS,
  AI_PRESET_VALUES,
  type AiPreset,
  isAiTactics,
  npcPresetOf,
  presetTactics,
  sliderChancePm,
  tacticsMatchPreset,
} from "./aiTactics.ts";

const row = (preset: AiPreset) => {
  const t = presetTactics(preset);
  return [t.engage, t.pursue, t.cover, t.escort, t.saveSkill, t.spread, t.retreatPct, t.target];
};

describe("AI 작전", () => {
  it("프리셋 출발값은 기획 C39(⑤⑥·목표는 X15 잠정값)", () => {
    expect(AI_PRESETS).toEqual(["aggressive", "balanced", "defensive", "hold"]);
    expect(row("aggressive")).toEqual([9, 8, 3, 2, 2, 3, 0, "weakest"]);
    expect(row("balanced")).toEqual([6, 5, 6, 5, 5, 5, 30, "nearest"]);
    expect(row("defensive")).toEqual([4, 1, 7, 9, 6, 6, 50, "threat"]);
    expect(row("hold")).toEqual([1, 0, 10, 8, 8, 7, 0, "nearest"]);
    for (const preset of AI_PRESETS) {
      expect(isAiTactics(AI_PRESET_VALUES[preset])).toBe(true);
      expect(tacticsMatchPreset(AI_PRESET_VALUES[preset])).toBe(true);
    }
  });

  it("검사: 정수 0~10, 퇴각 0~100, 목록 안의 프리셋·목표", () => {
    const base = AI_PRESET_VALUES.balanced;
    expect(isAiTactics({ ...base, engage: 11 })).toBe(false);
    expect(isAiTactics({ ...base, cover: 1.5 })).toBe(false);
    expect(isAiTactics({ ...base, retreatPct: 101 })).toBe(false);
    expect(isAiTactics({ ...base, target: "random" })).toBe(false);
    expect(isAiTactics({ ...base, preset: "custom" })).toBe(false);
    expect(isAiTactics(null)).toBe(false);
    expect(tacticsMatchPreset({ ...base, engage: 7 })).toBe(false);
  });

  it("NPC 성격 → 프리셋, 확률 환산 n × 10%", () => {
    expect(npcPresetOf(1000)).toBe("aggressive");
    expect(npcPresetOf(700)).toBe("aggressive");
    expect(npcPresetOf(699)).toBe("balanced");
    expect(npcPresetOf(450)).toBe("balanced");
    expect(npcPresetOf(200)).toBe("defensive");
    expect(npcPresetOf(0)).toBe("hold");
    expect(sliderChancePm(6)).toBe(600);
    expect(sliderChancePm(12)).toBe(1000);
    expect(sliderChancePm(-1)).toBe(0);
  });
});
