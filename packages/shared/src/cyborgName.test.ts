import { describe, expect, it } from "vitest";
import { cyborgNameUnits, parseCyborgName } from "./cyborgName.ts";

describe("parseCyborgName", () => {
  it("보이는 이름은 친 모양 그대로, 열쇠는 소문자다(대소문자는 같은 이름)", () => {
    expect(parseCyborgName("Nova7")).toEqual({ ok: true, display: "Nova7", key: "nova7" });
    expect(parseCyborgName("NOVA7")).toMatchObject({ key: "nova7" });
    expect(parseCyborgName("철수")).toEqual({ ok: true, display: "철수", key: "철수" });
  });

  it("앞뒤 공백은 지우고, 가운데 빈칸·기호·밑줄은 받지 않는다", () => {
    expect(parseCyborgName("  철수  ")).toMatchObject({ ok: true, display: "철수" });
    expect(parseCyborgName("철 수")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseCyborgName("nova_7")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseCyborgName("nova!")).toEqual({ ok: false, problem: "invalid_chars" });
  });

  it("다른 나라 글자(키릴·그리스·전각·한자)와 낱자 한글은 받지 않는다", () => {
    // 키릴 а(U+0430)는 라틴 a와 모양이 같다(D-134 혼동 문자)
    expect(parseCyborgName("novа")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseCyborgName("αβγ")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseCyborgName("ｎｏｖａ")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseCyborgName("鐵水")).toEqual({ ok: false, problem: "invalid_chars" });
    expect(parseCyborgName("ㅊㅅ")).toEqual({ ok: false, problem: "invalid_chars" });
  });

  it("조합형(NFD) 한글은 완성형(NFC)으로 바꿔 같은 이름으로 본다", () => {
    const decomposed = "철수".normalize("NFD");
    expect(decomposed).not.toBe("철수");
    expect(parseCyborgName(decomposed)).toEqual({ ok: true, display: "철수", key: "철수" });
  });

  it("숫자만은 안 된다", () => {
    expect(parseCyborgName("12345")).toEqual({ ok: false, problem: "needs_letter" });
    expect(parseCyborgName("a2345")).toMatchObject({ ok: true });
  });

  it("길이: 한글만 2~8자, 영문만 3~16자, 섞으면 한글 2칸·영문 1칸으로 3~16칸", () => {
    expect(parseCyborgName("철")).toEqual({ ok: false, problem: "too_short" });
    expect(parseCyborgName("가나다라마바사아")).toMatchObject({ ok: true });
    expect(parseCyborgName("가나다라마바사아자")).toEqual({ ok: false, problem: "too_long" });
    expect(parseCyborgName("ab")).toEqual({ ok: false, problem: "too_short" });
    expect(parseCyborgName("abc")).toMatchObject({ ok: true });
    expect(parseCyborgName("a".repeat(16))).toMatchObject({ ok: true });
    expect(parseCyborgName("a".repeat(17))).toEqual({ ok: false, problem: "too_long" });
    expect(parseCyborgName("철a")).toMatchObject({ ok: true });
    expect(parseCyborgName("가나다라마바사아a")).toEqual({ ok: false, problem: "too_long" });
    expect(cyborgNameUnits("철수a1")).toBe(6);
  });

  it("빈 값·아주 긴 입력", () => {
    expect(parseCyborgName("")).toEqual({ ok: false, problem: "empty" });
    expect(parseCyborgName("   ")).toEqual({ ok: false, problem: "empty" });
    expect(parseCyborgName("a".repeat(1000))).toEqual({ ok: false, problem: "too_long" });
  });

  it("[임시] 사칭: 안에 든 말(운영·admin 등)과 이름 전체가 같은 짧은 말(GM 등)을 막는다", () => {
    expect(parseCyborgName("운영자")).toEqual({ ok: false, problem: "reserved" });
    expect(parseCyborgName("SuperAdmin")).toEqual({ ok: false, problem: "reserved" });
    expect(parseCyborgName("관리자12")).toEqual({ ok: false, problem: "reserved" });
    expect(parseCyborgName("GM")).toEqual({ ok: false, problem: "too_short" });
    expect(parseCyborgName("gm1")).toMatchObject({ ok: true });
    expect(parseCyborgName("Terra")).toEqual({ ok: false, problem: "reserved" });
    expect(parseCyborgName("Terraform")).toMatchObject({ ok: true });
  });
});
