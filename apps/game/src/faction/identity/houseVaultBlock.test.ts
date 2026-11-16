// 가문 금고 칸 입력 시험 — 기획 D-574 2150(기부·가문세율), HouseVaultBlock.tsx
import { describe, expect, it } from "vitest";
import { parseDonation, parseTaxPercent, pmPercent } from "./HouseVaultBlock.tsx";

describe("가문 금고 칸 입력", () => {
  it("기부: 양의 정수(15자리까지), 앞자리 0은 지운다", () => {
    expect(parseDonation(" 250 ")).toBe("250");
    expect(parseDonation("007")).toBe("7");
    for (const text of ["0", "-1", "1.5", "", "abc", "1234567890123456"])
      expect(parseDonation(text)).toBeNull();
  });
  it("가문세율: % 소수 한 자리 → ‰, 상한까지", () => {
    expect(parseTaxPercent("12.5", 300)).toBe(125);
    expect(parseTaxPercent("0", 300)).toBe(0);
    expect(parseTaxPercent("30", 300)).toBe(300);
    for (const text of ["30.1", "-1", "1.25", "", "x"]) expect(parseTaxPercent(text, 300)).toBeNull();
    expect(pmPercent(125)).toBe("12.5");
    expect(pmPercent(300)).toBe("30");
  });
});
