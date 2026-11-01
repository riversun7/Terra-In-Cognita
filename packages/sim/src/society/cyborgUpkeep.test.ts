import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as c } from "./coefficients.ts";
import { livingEfficiencyPm, organWorks, repairOrgan, wearOrgan, withEfficiency } from "./cyborgUpkeep.ts";

const HOUR = 3_600_000;
const heart = { id: "test_heart", durability: 100, maxDurability: 100 };

describe("사이보그 생활비(D-453: 유닛 유지비 규칙 D-150, 못 내면 효율 불이익 N38)", () => {
  it("냈으면 그대로, 못 냈으면 N38 배율로 돌아간다(멈추지 않는다)", () => {
    expect(c.cyborg.livingUnpaidPm).toBe(700);
    expect(livingEfficiencyPm(false, c)).toBe(1000);
    expect(livingEfficiencyPm(true, c)).toBe(700);
    expect(withEfficiency(57, livingEfficiencyPm(true, c))).toBe(39);
    expect(withEfficiency(57, livingEfficiencyPm(false, c))).toBe(57);
  });
});

describe("인공장기 내구도(D-453, 장비 내구도 규칙 D-5031·49 F11·F12)", () => {
  it("유지비 경계(정시)마다 N38만큼 닳고 0에서 멈춘다", () => {
    expect(c.cyborg.organWearPerPeriod).toBe(1);
    expect(wearOrgan(heart, 0, 5 * HOUR, c)).toEqual({ ...heart, durability: 95 });
    // 경계를 넘지 않으면 그대로
    expect(wearOrgan(heart, HOUR + 1, 2 * HOUR - 1, c)).toBe(heart);
    expect(wearOrgan(heart, 0, 500 * HOUR, c).durability).toBe(0);
  });

  it("나눠 닳게 해도 한 번에 한 것과 같다", () => {
    const whole = wearOrgan(heart, 0, 30 * HOUR, c);
    let split = heart;
    const cuts = [0, 1234, HOUR, 7 * HOUR + 5, 29 * HOUR, 30 * HOUR];
    for (let i = 1; i < cuts.length; i++) split = wearOrgan(split, cuts[i - 1] ?? 0, cuts[i] ?? 0, c);
    expect(split).toEqual(whole);
  });

  it("내구도 0인 인공장기는 일하지 않는다(스탯·스킬 보너스 없음)", () => {
    expect(organWorks(heart)).toBe(true);
    expect(organWorks({ ...heart, durability: 0 })).toBe(false);
  });

  it("수리: 최대 내구도가 시설 레벨(F11 Lv1 30% … Lv5 10%)만큼 줄고, 장인 실력이 그 폭을 반까지 줄인다(하한 5%)", () => {
    expect(c.durability.repairLossPct).toEqual([30, 25, 20, 15, 10]);
    const worn = { ...heart, durability: 40 };
    expect(repairOrgan(worn, 1, 0, c)).toEqual({
      organ: { ...heart, durability: 70, maxDurability: 70 },
      destroyed: false,
      maxLoss: 30,
      cost: BigInt(30 * c.cyborg.organRepairCost),
    });
    expect(repairOrgan(worn, 1, 1000, c).organ).toEqual({ ...heart, durability: 85, maxDurability: 85 });
    expect(repairOrgan(worn, 5, 1000, c).organ.maxDurability).toBe(95);
    expect(repairOrgan(worn, 5, 0, c).organ.maxDurability).toBe(90);
  });

  it("수리 뒤 최대 내구도가 10 이하면 파괴된다(F12, 분해만 가능), 비용은 없다", () => {
    expect(c.durability.destroyAtMax).toBe(10);
    expect(repairOrgan({ ...heart, durability: 2, maxDurability: 14 }, 1, 0, c)).toEqual({
      organ: { ...heart, durability: 0, maxDurability: 9 },
      destroyed: true,
      maxLoss: 5,
      cost: 0n,
    });
  });

  it("닳지 않았으면 수리하지 않는다(최대 내구도도 그대로)", () => {
    expect(repairOrgan(heart, 1, 0, c)).toEqual({ organ: heart, destroyed: false, maxLoss: 0, cost: 0n });
  });

  it("시설 레벨은 1~5, 실력은 0~1000‰", () => {
    expect(() => repairOrgan(heart, 0, 0, c)).toThrow(RangeError);
    expect(() => repairOrgan(heart, 6, 0, c)).toThrow(RangeError);
    expect(() => repairOrgan(heart, 1, 1001, c)).toThrow(RangeError);
  });
});
