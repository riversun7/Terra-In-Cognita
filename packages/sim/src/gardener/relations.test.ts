import { describe, expect, it } from "vitest";
import { TEST_GARDENER_COEFFICIENTS as C } from "./coefficients.ts";
import {
  clampRelation,
  nextRelation,
  relationCap,
  relationChancePm,
  relationStage,
  stageChancePm,
} from "./relations.ts";
import { NO_REWARD, isEmptyReward, waveReward } from "./rewards.ts";

describe("정원 세력 관계도(49 N52, D-500·D-510)", () => {
  it("단계 문턱: 동맹 70·우호 30·중립 −20·경계 −50 이상, 그 아래 적대(옛 NpcDiplomacyAI.js)", () => {
    expect(relationStage(100, C)).toBe("allied");
    expect(relationStage(70, C)).toBe("allied");
    expect(relationStage(69, C)).toBe("friendly");
    expect(relationStage(30, C)).toBe("friendly");
    expect(relationStage(29, C)).toBe("neutral");
    expect(relationStage(0, C)).toBe("neutral");
    expect(relationStage(-20, C)).toBe("neutral");
    expect(relationStage(-21, C)).toBe("wary");
    expect(relationStage(-50, C)).toBe("wary");
    expect(relationStage(-51, C)).toBe("hostile");
    expect(relationStage(-100, C)).toBe("hostile");
  });

  it("필수 NPC 세력만 양수까지 오른다(D-500), 범위는 −100~+100", () => {
    expect(relationCap(true, C)).toBe(100);
    expect(relationCap(false, C)).toBe(0);
    expect(clampRelation(150, true, C)).toBe(100);
    expect(clampRelation(40, false, C)).toBe(0);
    expect(clampRelation(-300, false, C)).toBe(-100);
    expect(clampRelation(5, false, { ...C, relationOthersMax: 30 })).toBe(5);
  });

  it("하루 바뀜: 세력 오염 걸음마다 −1(하루 상한), 전쟁이 없는 날 +평화 몫", () => {
    // 세력 오염 90,000 = 3걸음 → −3, 평화 +2 → −1
    expect(nextRelation(0, 90_000, true, true, C)).toBe(-1);
    // 전쟁 중이면 평화 몫이 없다
    expect(nextRelation(0, 90_000, false, true, C)).toBe(-3);
    // 하루 상한 10
    expect(nextRelation(0, 9_000_000, false, true, C)).toBe(-10);
    // 오염이 없고 평화로우면 오른다(필수 NPC 세력은 양수로, 다른 세력은 0에서 멈춤)
    expect(nextRelation(68, 0, true, true, C)).toBe(70);
    expect(nextRelation(-5, 0, true, false, C)).toBe(-3);
    expect(nextRelation(-1, 0, true, false, C)).toBe(0);
    // 하한
    expect(nextRelation(-99, 900_000, false, false, C)).toBe(-100);
  });

  it("단계 배율이 도시 웨이브 확률에 곱해진다(동맹 = 웨이브 없음, 1000 상한)", () => {
    expect(stageChancePm("allied", C)).toBe(0);
    expect(relationChancePm(300, "allied", C)).toBe(0);
    expect(relationChancePm(300, "friendly", C)).toBe(150);
    expect(relationChancePm(300, "neutral", C)).toBe(300);
    expect(relationChancePm(300, "wary", C)).toBe(375);
    expect(relationChancePm(300, "hostile", C)).toBe(450);
    expect(relationChancePm(900, "hostile", C)).toBe(1000);
    // 배율 칸이 없으면 그대로
    expect(relationChancePm(300, "hostile", { ...C, stageChancePm: [] })).toBe(300);
  });
});

describe("막아 낸 웨이브 보상(D-499), 보호 레이드는 없음(D-500)", () => {
  it("도시 웨이브: 명성 = 마리 × 10, 유전자 조각 1, 크리쳐 재료 = ⌊마리 × 500 ÷ 1000⌋", () => {
    expect(waveReward("city", 15, C)).toEqual({ renown: 150, genes: 1, materials: 7 });
    expect(isEmptyReward(waveReward("city", 15, C))).toBe(false);
  });

  it("보호 레이드는 보상이 전혀 없다", () => {
    expect(waveReward("protection", 40, C)).toBe(NO_REWARD);
    expect(isEmptyReward(NO_REWARD)).toBe(true);
  });
});
