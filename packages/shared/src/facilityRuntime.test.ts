// 건물 노화·수리·장인 시간 셈 시험(49 N50·M15·D-509·D-514 351)
import { describe, expect, it } from "vitest";
import {
  CONDITION_FULL,
  OLD_FACILITY_RUNTIME_RULES as R,
  advanceCondition,
  builderCutPm,
  conditionStateOf,
  conditionWorks,
  craftTimePm,
  durabilityPoints,
  equipmentRepairMs,
  idleMsUntil,
  maxDurabilityAt,
  repairMaterialsFor,
  repairRestorePpm,
  repairTimeMs,
  storageCapacityAt,
  withBuilders,
} from "./facilityRuntime.ts";

const DAY = 86_400_000;

describe("상태 문턱(옛 경제 문서)", () => {
  it("70% 미만 손상, 30% 미만 정지, 0 폐허", () => {
    expect(conditionStateOf(CONDITION_FULL, R)).toBe("ok");
    expect(conditionStateOf(700_000, R)).toBe("ok");
    expect(conditionStateOf(699_999, R)).toBe("damaged");
    expect(conditionStateOf(300_000, R)).toBe("damaged");
    expect(conditionStateOf(299_999, R)).toBe("disabled");
    expect(conditionStateOf(0, R)).toBe("ruin");
    expect(conditionWorks(300_000, R)).toBe(true);
    expect(conditionWorks(299_999, R)).toBe(false);
  });
});

describe("노화(D-509)", () => {
  it("쓰지 않으면 노화 기간에 걸쳐 30%까지 가고 멈춘다", () => {
    expect(advanceCondition(CONDITION_FULL, R.idleDecayMs / 2, false, R)).toBe(650_000);
    expect(advanceCondition(CONDITION_FULL, R.idleDecayMs, false, R)).toBe(300_000);
    expect(advanceCondition(CONDITION_FULL, 3 * R.idleDecayMs, false, R)).toBe(300_000);
    // 멈추는 곳 아래에서는 쓰지 않으면 그대로
    expect(advanceCondition(200_000, DAY, false, R)).toBe(200_000);
  });

  it("분마다 나눠 셈해도 한 번에 셈한 것과 거의 같다(ppm 단위)", () => {
    let value = CONDITION_FULL;
    for (let minute = 0; minute < 24 * 60; minute++) value = advanceCondition(value, 60_000, false, R);
    const once = advanceCondition(CONDITION_FULL, DAY, false, R);
    expect(Math.abs(value - once)).toBeLessThanOrEqual(24 * 60);
  });

  it("쓰면 더 닳고 30% 아래로도 내려가 0까지 간다", () => {
    const used = advanceCondition(CONDITION_FULL, DAY, true, R);
    const idle = advanceCondition(CONDITION_FULL, DAY, false, R);
    expect(idle - used).toBe(70_000);
    expect(advanceCondition(300_000, DAY, true, R)).toBe(230_000);
    expect(advanceCondition(50_000, DAY, true, R)).toBe(0);
  });

  it("문턱까지 남은 쓰지 않은 시간", () => {
    expect(idleMsUntil(CONDITION_FULL, 700, R)).toBe(370_285_715);
    expect(idleMsUntil(250_000, 300, R)).toBeNull();
  });
});

describe("레벨별 내구도·창고(M15·N50)", () => {
  it("기본 × (1 + (레벨 − 1) × 0.2)", () => {
    expect(maxDurabilityAt(150, 1, R)).toBe(150);
    expect(maxDurabilityAt(150, 3, R)).toBe(210);
    expect(storageCapacityAt(10_000, 5, R)).toBe(18_000);
    expect(durabilityPoints(650_000, 150)).toBe(97);
  });
});

describe("일꾼 단축(옛 ConstructionEngine 20%·옛 경제 문서 최대 50%)", () => {
  it("하나 20%, 셋부터 50%", () => {
    expect(builderCutPm(0, R)).toBe(0);
    expect(builderCutPm(1, R)).toBe(200);
    expect(builderCutPm(3, R)).toBe(500);
    expect(withBuilders(128_000, 0, R)).toBe(128_000);
    expect(withBuilders(128_000, 1, R)).toBe(102_400);
    expect(withBuilders(128_000, 9, R)).toBe(64_000);
  });
});

describe("수리(N50: 한 번에 10%, 재료 = 건설 재료 × 비율)", () => {
  it("고칠 양은 단계 × 10%, 모자란 만큼까지", () => {
    expect(repairRestorePpm(500_000, 1, R)).toBe(100_000);
    expect(repairRestorePpm(500_000, 10, R)).toBe(500_000);
    expect(repairRestorePpm(CONDITION_FULL, 3, R)).toBe(0);
  });

  it("재료는 줄마다 올림, 시간은 비율 × 일꾼 단축", () => {
    expect(
      repairMaterialsFor(
        [
          { item: "pine_log", qty: 6 },
          { item: "stone", qty: 25 },
        ],
        100_000,
      ),
    ).toEqual([
      { item: "pine_log", qty: 1 },
      { item: "stone", qty: 3 },
    ]);
    expect(repairMaterialsFor([{ item: "pine_log", qty: 6 }], 0)).toEqual([]);
    expect(repairTimeMs(128_000, 100_000, 1, R)).toBe(10_240);
  });
});

describe("장비 수리 시간(D-514 351)", () => {
  it("장인 보정 = clamp(10 ÷ (평균 × √n), 0.3, 2.0)", () => {
    expect(craftTimePm(10, 1, R)).toBe(1000);
    expect(craftTimePm(10, 4, R)).toBe(500);
    expect(craftTimePm(100, 9, R)).toBe(300);
    expect(craftTimePm(1, 1, R)).toBe(2000);
    expect(craftTimePm(0, 1, R)).toBe(2000);
  });

  it("기준 × max(1, 티어) × 잃은 ÷ 최대 × 보정", () => {
    expect(equipmentRepairMs({ tier: 2, lost: 50, maxDurability: 100, avgScore: 10, units: 1 }, R)).toBe(
      600_000,
    );
    expect(equipmentRepairMs({ tier: 0, lost: 100, maxDurability: 100, avgScore: 10, units: 4 }, R)).toBe(
      300_000,
    );
    expect(equipmentRepairMs({ tier: 3, lost: 0, maxDurability: 100, avgScore: 10, units: 1 }, R)).toBe(0);
  });
});
