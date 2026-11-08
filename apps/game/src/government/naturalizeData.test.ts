// 국적 바꾸기(귀화) 글 시험 — docs/adr/2026-11-08-citizenship.md. 막는 까닭 한 줄(쉬는 날 남은 시간·잔고), 값 꼴, 결과 코드마다 문구가 있다.
import { NATIONALITY_RESULT_CODES } from "@terra/protocol";
import type { NaturalizationTerms } from "@terra/shared/citizenship";
import { describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import { NATURALIZE_RESULT_TEXT, blockText, costLines } from "./naturalizeData.ts";

const terms: NaturalizationTerms = {
  target: { id: 4, code: "placeholder_nation_02", name: { ko: "임시 국가 2", en: "Placeholder nation 2" } },
  current: { id: 3, code: "placeholder_nation_01", name: null },
  cityId: 9,
  fee: "100",
  grantReturn: "1080",
  total: "1180",
  balance: "5000",
  restMs: 7 * 86_400_000,
  restUntilMs: null,
  blocked: null,
};

describe("귀화 글", () => {
  it("막는 까닭이 없으면 null, 있으면 한 줄(쉬는 날은 남은 시간, 돈은 낼 값·잔고)", () => {
    const now = 1_800_000_000_000;
    expect(blockText(terms, now, "ko")).toBeNull();
    expect(blockText({ ...terms, blocked: "wrong_city" }, now, "ko")).toBe(m.naturalize_block_wrong_city());
    expect(blockText({ ...terms, blocked: "same_nation" }, now, "ko")).toBe(m.naturalize_block_same());
    const resting = blockText({ ...terms, blocked: "resting", restUntilMs: now + 3 * 86_400_000 }, now, "en");
    expect(resting).toContain("3");
    expect(blockText({ ...terms, blocked: "insufficient_funds", balance: "900" }, now, "en")).toContain(
      "1,180",
    );
  });

  it("값 줄: 자리 구분·쉬는 기간·나라 이름(없으면 코드)", () => {
    const lines = costLines(terms, "en");
    expect(lines.total).toBe("1,180");
    expect(lines.grant).toBe("1,080");
    expect(lines.target).toBe("Placeholder nation 2");
    expect(lines.current).toBe("placeholder_nation_01");
    expect(lines.rest).not.toBe("");
  });

  it("서버 결과 코드마다 문구가 있다", () => {
    for (const code of NATIONALITY_RESULT_CODES) expect(NATURALIZE_RESULT_TEXT[code]()).not.toBe("");
    expect(NATURALIZE_RESULT_TEXT.offline()).not.toBe("");
  });
});
