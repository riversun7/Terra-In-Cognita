// 기본(시작) NPC 국가를 강하게(npc/fixedNation.ts — 사용자 결정 D-593 2621): 고정 세력만, 계수가 없으면 그대로
import { describe, expect, it } from "vitest";
import {
  fixedDefenseStrength,
  fixedGuardTarget,
  fixedRebellionShift,
  fixedRetakeBonus,
} from "./fixedNation.ts";
import { rebelShift } from "../society/uprising.ts";

const c = { fixedGuardPm: 2000, fixedDefensePm: 1500, fixedRetakeBonus: 200, fixedRebellionEase: 10 };

describe("기본 NPC 국가 계수", () => {
  it("경비대 목표 = 등급 값 × 배율(내림), 고정 세력이 아니거나 등급 값 0이면 그대로, 계수 없으면 그대로", () => {
    expect(fixedGuardTarget(3, true, c)).toBe(6);
    expect(fixedGuardTarget(3, true, { fixedGuardPm: 1500 })).toBe(4);
    expect(fixedGuardTarget(3, false, c)).toBe(3);
    expect(fixedGuardTarget(0, true, c)).toBe(0);
    expect(fixedGuardTarget(3, true, {})).toBe(3);
  });

  it("방어 억지: 고정 세력의 힘을 배율로 보고, 되찾기 상대면 그대로", () => {
    expect(fixedDefenseStrength(100, true, false, c)).toBe(150);
    expect(fixedDefenseStrength(100, true, true, c)).toBe(100);
    expect(fixedDefenseStrength(100, false, false, c)).toBe(100);
    expect(fixedDefenseStrength(100, true, false, {})).toBe(100);
  });

  it("되찾기 점수는 잃은 도시가 있을 때만, 반란 문턱은 고정 세력만 낮춘다(서버 신임도 고리와 더한다)", () => {
    expect(fixedRetakeBonus(2, c)).toBe(200);
    expect(fixedRetakeBonus(0, c)).toBe(0);
    expect(fixedRebellionShift(true, c)).toBe(-10);
    expect(fixedRebellionShift(false, c)).toBe(0);
    const hooks = { rebellionThresholdShift: () => 6 };
    expect(rebelShift(hooks, { fixed: true }, c)).toBe(-4);
    expect(rebelShift(undefined, { fixed: false }, c)).toBe(0);
  });
});
