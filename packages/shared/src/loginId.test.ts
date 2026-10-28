import { describe, expect, it } from "vitest";
import { isLoginIdKey, parseLoginId } from "./loginId.ts";

describe("parseLoginId", () => {
  it("입력한 모양은 표시용으로 두고, 키는 소문자로 만든다", () => {
    expect(parseLoginId("Test_User9")).toEqual({ ok: true, display: "Test_User9", key: "test_user9" });
  });

  it("앞뒤 공백(전각 공백·탭·줄바꿈 포함)을 지운다", () => {
    expect(parseLoginId("  tester  ")).toMatchObject({ ok: true, display: "tester" });
    expect(parseLoginId("　tester\t\n")).toMatchObject({ ok: true, display: "tester" });
  });

  it("가운데 공백은 허용하지 않는다", () => {
    expect(parseLoginId("te ster")).toEqual({ ok: false, problem: "invalid_chars" });
  });

  it("NFKC: 전각 영문·숫자는 반각으로 바뀐다", () => {
    expect(parseLoginId("ｔｅｓｔｅｒ１")).toEqual({ ok: true, display: "tester1", key: "tester1" });
    expect(parseLoginId("ＴＥＳＴＥＲ")).toEqual({ ok: true, display: "TESTER", key: "tester" });
  });

  it("NFKC: 켈빈 기호(U+212A)는 K로 바뀌어 kelvin과 같은 키가 된다", () => {
    const kelvin = parseLoginId("Kelvin");
    expect(kelvin).toEqual({ ok: true, display: "Kelvin", key: "kelvin" });
    expect(parseLoginId("kelvin")).toMatchObject({ key: "kelvin" });
  });

  it("길이: 2자는 짧고, 3자·20자는 되고, 21자는 길다", () => {
    expect(parseLoginId("ab")).toEqual({ ok: false, problem: "too_short" });
    expect(parseLoginId("abc")).toMatchObject({ ok: true, key: "abc" });
    expect(parseLoginId("a".repeat(20))).toMatchObject({ ok: true });
    expect(parseLoginId("a".repeat(21))).toEqual({ ok: false, problem: "too_long" });
  });

  it("길이는 공백 제거·정규화 뒤에 잰다", () => {
    expect(parseLoginId(`  ${"a".repeat(20)}  `)).toMatchObject({ ok: true });
    expect(parseLoginId("ａｂ")).toEqual({ ok: false, problem: "too_short" });
  });

  it("점(.)·하이픈·@는 허용하지 않는다", () => {
    expect(parseLoginId("te.st")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseLoginId("te-st")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseLoginId("te@st")).toEqual({ ok: false, problem: "invalid_chars" });
  });

  it("한글·이모지·다른 문자권은 허용하지 않는다", () => {
    expect(parseLoginId("테스트")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseLoginId("tester가")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseLoginId("tester😀")).toEqual({ ok: false, problem: "invalid_chars" });
    // 키릴 문자 а(U+0430)는 라틴 a와 모양이 같다
    expect(parseLoginId("аbc")).toEqual({ ok: false, problem: "invalid_chars" });
  });

  it("빈 값과 공백만 있는 값", () => {
    expect(parseLoginId("")).toEqual({ ok: false, problem: "empty" });
    expect(parseLoginId("   ")).toEqual({ ok: false, problem: "empty" });
  });

  it("아주 긴 입력은 정규화 전에 거른다", () => {
    expect(parseLoginId("a".repeat(10_000))).toEqual({ ok: false, problem: "too_long" });
  });

  it("같은 입력이면 항상 같은 결과", () => {
    expect(parseLoginId("Ｍｉｘｅｄ_Case")).toEqual(parseLoginId("Ｍｉｘｅｄ_Case"));
  });
});

describe("isLoginIdKey", () => {
  it("정규화된 소문자 키만 통과한다", () => {
    expect(isLoginIdKey("tester_1")).toBe(true);
    expect(isLoginIdKey("Tester")).toBe(false);
    expect(isLoginIdKey("ab")).toBe(false);
    expect(isLoginIdKey("a".repeat(21))).toBe(false);
  });
});
