// 지도자 신임도 오르내림 시험(줄기 gov-coup — 사용자 결정 D-588 2493, approvalFactors.ts): 세금·전쟁·도시·하루(전쟁 벌점·만족도) 칸마다
import { describe, expect, it } from "vitest";
import {
  APPROVAL_DAY_MS,
  type ApprovalFactorRules,
  type ApprovalSnapshot,
  stepApproval,
  taxLevelPm,
} from "./approvalFactors.ts";

const RULES: ApprovalFactorRules = {
  neutralPm: 500,
  taxPerPm: 3,
  warStart: 30,
  warDaily: 10,
  peace: 40,
  cityWon: 50,
  cityLost: 80,
  satisfactionPullPm: 100,
};
const T0 = 1_800_000_000_000;
const BLANK: ApprovalSnapshot = { taxLevelPm: null, cities: null, wars: null, dayAtMs: null };

describe("신임도 오르내림(D-588 2493)", () => {
  it("처음 보는 값은 기준만 적고 바꾸지 않는다", () => {
    const step = stepApproval(
      300,
      BLANK,
      { taxLevelPm: 80, cities: 3, wars: 1, satisfaction: 70 },
      RULES,
      T0,
    );
    expect(step.approval).toBe(300);
    expect(step.snapshot).toEqual({ taxLevelPm: 80, cities: 3, wars: 1, dayAtMs: T0 });
  });

  it("세금: 올리면 내리고 내리면 오른다(1‰마다 칸 값)", () => {
    const base = { taxLevelPm: 80, cities: 3, wars: 0, dayAtMs: T0 };
    expect(
      stepApproval(500, base, { taxLevelPm: 130, cities: 3, wars: 0, satisfaction: undefined }, RULES, T0)
        .approval,
    ).toBe(350);
    expect(
      stepApproval(500, base, { taxLevelPm: 60, cities: 3, wars: 0, satisfaction: undefined }, RULES, T0)
        .approval,
    ).toBe(560);
    // 세금을 모르면 건너뛰고 기준은 그대로
    const unknown = stepApproval(
      500,
      base,
      { taxLevelPm: undefined, cities: 3, wars: 0, satisfaction: undefined },
      RULES,
      T0,
    );
    expect(unknown.approval).toBe(500);
    expect(unknown.snapshot.taxLevelPm).toBe(80);
  });

  it("전쟁 자체는 벌점(새 전쟁·하루마다), 끝나면 오른다. 도시를 얻으면(승리) 오르고 잃으면 내린다", () => {
    const base = { taxLevelPm: 0, cities: 3, wars: 0, dayAtMs: T0 };
    const war = stepApproval(
      500,
      base,
      { taxLevelPm: 0, cities: 3, wars: 1, satisfaction: undefined },
      RULES,
      T0,
    );
    expect(war.approval).toBe(470);
    expect(war.changes.warStart).toBe(-30);
    const day = stepApproval(
      470,
      war.snapshot,
      { taxLevelPm: 0, cities: 4, wars: 1, satisfaction: undefined },
      RULES,
      T0 + APPROVAL_DAY_MS,
    );
    expect(day.changes).toMatchObject({ cityWon: 50, warDaily: -10 });
    expect(day.approval).toBe(510);
    expect(day.snapshot.dayAtMs).toBe(T0 + APPROVAL_DAY_MS);
    const peace = stepApproval(
      510,
      day.snapshot,
      { taxLevelPm: 0, cities: 2, wars: 0, satisfaction: undefined },
      RULES,
      T0 + APPROVAL_DAY_MS,
    );
    expect(peace.changes).toMatchObject({ peace: 40, cityLost: -160 });
    expect(peace.approval).toBe(390);
  });

  it("하루마다 만족도 쪽으로 다가가고 밀린 날은 7일까지, 0~1000 안", () => {
    const base = { taxLevelPm: 0, cities: 1, wars: 0, dayAtMs: T0 };
    const pulled = stepApproval(
      300,
      base,
      { taxLevelPm: 0, cities: 1, wars: 0, satisfaction: 80 },
      RULES,
      T0 + 2 * APPROVAL_DAY_MS,
    );
    // 300 → 350(+50) → 395(+45)
    expect(pulled.approval).toBe(395);
    const long = stepApproval(
      300,
      base,
      { taxLevelPm: 0, cities: 1, wars: 0, satisfaction: undefined },
      RULES,
      T0 + 30 * APPROVAL_DAY_MS,
    );
    expect(long.snapshot.dayAtMs).toBe(T0 + 30 * APPROVAL_DAY_MS);
    const floor = stepApproval(
      20,
      base,
      { taxLevelPm: 500, cities: 1, wars: 0, satisfaction: undefined },
      RULES,
      T0,
    );
    expect(floor.approval).toBe(0);
  });

  it("세금 수준 = 소득세 ÷ 10 + 주민세 + 거래세 ÷ 10", () => {
    expect(taxLevelPm({ incomeTaxBp: 500, residentTaxPm: 20, tradeTaxBp: 300 })).toBe(100);
    expect(taxLevelPm({ incomeTaxBp: null, residentTaxPm: null, tradeTaxBp: undefined })).toBeUndefined();
  });
});
