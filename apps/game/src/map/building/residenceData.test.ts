// 사는 곳 카드 문구 시험(residenceData.ts, D-585 1) — 이 건물 기준 한 줄, 실패 코드 문구가 모두 있다
import { RESIDENCE_RENT_RESULT_CODES, RESIDENCE_RESULT_CODES } from "@terra/protocol";
import type { ResidenceResponse } from "@terra/shared/residence";
import { describe, expect, it } from "vitest";
import { m } from "../../paraglide/messages.js";
import { isRentText, residenceErrorText, residenceLine, residenceRentErrorText } from "./residenceData.ts";

const response = (current: ResidenceResponse["current"]): ResidenceResponse => ({
  status: "ok",
  unitId: 4,
  current,
  building: { buildingId: 9, block: null },
  generatedAt: 0,
});

describe("사는 곳 카드 문구", () => {
  it("여기·다른 곳·없음, 고른 집·숙소 배정", () => {
    expect(residenceLine(response(null), 9, "U")).toBe(m.residence_none({ unit: "U" }));
    expect(residenceLine(response({ buildingId: 9, cityId: 2, source: "chosen" }), 9, "U")).toBe(
      m.residence_here_chosen({ unit: "U" }),
    );
    expect(residenceLine(response({ buildingId: 9, cityId: 2, source: "lodging" }), 9, "U")).toBe(
      m.residence_here_lodging({ unit: "U" }),
    );
    expect(residenceLine(response({ buildingId: 3, cityId: 2, source: "chosen" }), 9, "U")).toBe(
      m.residence_elsewhere_chosen({ unit: "U" }),
    );
    expect(residenceLine(response({ buildingId: 3, cityId: 2, source: "lodging" }), 9, "U")).toBe(
      m.residence_elsewhere_lodging({ unit: "U" }),
    );
  });

  it("결과 코드마다 문구가 있다", () => {
    for (const code of [...RESIDENCE_RESULT_CODES, "offline", "timeout"] as const)
      expect(residenceErrorText(code).length).toBeGreaterThan(0);
  });

  it("집세 정하기(D-591 2): 결과 코드마다 문구, 입력은 0 이상의 정수만", () => {
    for (const code of [...RESIDENCE_RENT_RESULT_CODES, "offline", "timeout"] as const)
      expect(residenceRentErrorText(code).length).toBeGreaterThan(0);
    expect(isRentText("0")).toBe(true);
    expect(isRentText(" 120 ")).toBe(true);
    expect(isRentText("")).toBe(false);
    expect(isRentText("-1")).toBe(false);
    expect(isRentText("1.5")).toBe(false);
    expect(isRentText("1".repeat(19))).toBe(false);
  });
});
