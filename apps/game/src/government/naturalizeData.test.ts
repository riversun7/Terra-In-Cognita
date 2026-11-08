// 국적 바꾸기(귀화) 글 시험 — docs/adr/2026-11-08-citizenship.md "바뀜 (D-526)". 막는 까닭 한 줄(쉬는 날 남은 시간·잔고), 입회비·지원금 꼴,
// 우호도 글(수 + 호감 띠), 결과 코드마다 문구가 있다.
import { NATIONALITY_RESULT_CODES } from "@terra/protocol";
import type { NaturalizationTerms } from "@terra/shared/citizenship";
import { describe, expect, it } from "vitest";
import { m } from "../paraglide/messages.js";
import { NATURALIZE_RESULT_TEXT, blockText, confirmText, costLines, flowOf } from "./naturalizeData.ts";

const terms: NaturalizationTerms = {
  target: { id: 4, code: "placeholder_nation_02", name: { ko: "임시 국가 2", en: "Placeholder nation 2" } },
  current: { id: 3, code: "placeholder_nation_01", name: null },
  cityId: 9,
  fee: "1180",
  grant: "0",
  cost: "1180",
  balance: "5000",
  standing: { now: 0, drop: 20, after: -20, hostile: false },
  targetStanding: 55,
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

  it("값 줄: 입회비면 낸다, 지원금이면 받는다, 둘 다 없으면 없음(D-526)", () => {
    const lines = costLines(terms, "en");
    expect(lines.flow).toBe("pay");
    expect(lines.terms).toBe("Entrance fee 1,180");
    expect(lines.net).toBe("You pay 1,180 · balance 5,000");
    expect(lines.target).toBe("Placeholder nation 2");
    expect(lines.current).toBe("placeholder_nation_01");
    expect(lines.rest).not.toBe("");
    expect(confirmText(lines, "en")).toContain("1,180");
    const grant = { ...terms, fee: "0", grant: "250", cost: "-250" };
    expect(flowOf(grant)).toBe("receive");
    expect(costLines(grant, "ko").terms).toBe("지원금 250");
    expect(costLines(grant, "ko").net).toBe("250 받음 · 내 잔고 5,000");
    expect(confirmText(costLines(grant, "ko"), "ko")).toContain("지원금 250");
    expect(flowOf({ fee: "0", grant: "0" })).toBe("none");
  });

  it("우호도 글: 수(부호)와 호감 띠 — 옛 나라는 지금 → 뒤", () => {
    const lines = costLines({ ...terms, standing: { now: 0, drop: 60, after: -60, hostile: true } }, "ko");
    expect(lines.standing).toBe("0(보통) → -60(적대)");
    expect(lines.targetStanding).toBe("+55(우호)");
  });

  it("서버 결과 코드마다 문구가 있다", () => {
    for (const code of NATIONALITY_RESULT_CODES) expect(NATURALIZE_RESULT_TEXT[code]()).not.toBe("");
    expect(NATURALIZE_RESULT_TEXT.offline()).not.toBe("");
  });
});
