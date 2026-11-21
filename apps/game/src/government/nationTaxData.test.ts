// 나라 세금 칸 입력 셈 시험(nationTaxData.ts) — % → 만분율, 빈칸 = 정하지 않음, 범위
import { describe, expect, it } from "vitest";
import {
  applySavedTaxes,
  draftsOf,
  parseIncomePercent,
  parseNationTaxDraft,
  periodChoices,
} from "./nationTaxData.ts";

const field = (value: number, own: number | null) => ({ value, own, source: "leader" as const });

describe("나라 세금 입력(tax-2)", () => {
  it("소득세 % → 만분율(소수 둘째 자리까지), 빈칸 null, 100% 넘음·글자 거절", () => {
    expect(parseIncomePercent("2")).toBe(200);
    expect(parseIncomePercent("2.5")).toBe(250);
    expect(parseIncomePercent("0,75")).toBe(75);
    expect(parseIncomePercent("100")).toBe(10_000);
    expect(parseIncomePercent(" ")).toBeNull();
    expect(parseIncomePercent("100.01")).toBeUndefined();
    expect(parseIncomePercent("1.234")).toBeUndefined();
    expect(parseIncomePercent("abc")).toBeUndefined();
  });

  it("칸 넷: 하나라도 틀리면 null, 빈칸은 정하지 않음", () => {
    expect(parseNationTaxDraft({ income: "3", resident: "5", every: "7", share: "" })).toEqual({
      incomeTaxBp: 300,
      residentTaxPm: 5,
      residentEveryDays: 7,
      residentNationPm: null,
    });
    expect(parseNationTaxDraft({ income: "", resident: "1001", every: "", share: "" })).toBeNull();
    expect(parseNationTaxDraft({ income: "", resident: "", every: "0", share: "" })).toBeNull();
  });

  it("처음 입력 값 = 정한 값(소득세는 %), 정하지 않았으면 빈칸", () => {
    expect(
      draftsOf({
        incomeTaxBp: field(250, 250),
        residentTaxPm: field(0, null),
        residentEveryDays: field(7, 7),
        residentNationPm: field(0, null),
        canSet: true,
      }),
    ).toEqual({ income: "2.5", resident: "", every: "7", share: "" });
  });

  it("정한 뒤: 정한 칸은 지도자 값, 지도자 값을 비우면 stale(다시 열면 서버 기본값)", () => {
    const before = {
      incomeTaxBp: { value: 250, own: 250, source: "leader" as const },
      residentTaxPm: { value: 0, own: null, source: "default" as const },
      residentEveryDays: { value: 7, own: null, source: "default" as const },
      residentNationPm: { value: 0, own: null, source: "default" as const },
      canSet: true,
    };
    const kept = applySavedTaxes(before, {
      incomeTaxBp: 300,
      residentTaxPm: 5,
      residentEveryDays: null,
      residentNationPm: null,
    });
    expect(kept.stale).toBe(false);
    expect(kept.taxes.incomeTaxBp).toEqual({ value: 300, own: 300, source: "leader" });
    expect(kept.taxes.residentEveryDays).toBe(before.residentEveryDays);
    const cleared = applySavedTaxes(before, {
      incomeTaxBp: null,
      residentTaxPm: null,
      residentEveryDays: null,
      residentNationPm: null,
    });
    expect(cleared.stale).toBe(true);
    expect(cleared.taxes.incomeTaxBp.source).toBe("default");
  });

  it("주기 고르기 줄 = 목록(하루·한 주, D-585 2) + 전에 정해 둔 목록 밖 값", () => {
    expect(periodChoices("")).toEqual([1, 7]);
    expect(periodChoices("7")).toEqual([1, 7]);
    expect(periodChoices("3")).toEqual([1, 3, 7]);
    expect(periodChoices("abc")).toEqual([1, 7]);
  });
});
