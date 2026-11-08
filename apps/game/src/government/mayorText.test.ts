// 정부 판 시장 글 시험 — docs/adr/2026-11-07-play-flow.md "WP-NPC2"(기획 답 744 나). 이름 없는 휴먼은 "휴먼 #ID · Lv레벨".
import { describe, expect, it } from "vitest";
import { mayorTitle } from "./mayorText.ts";

describe("시장 글", () => {
  it("휴먼 #유닛 ID · Lv레벨(두 언어, 유닛 ID는 자리 구분 없이)", () => {
    expect(mayorTitle({ unitId: 12345, level: 2 }, "ko")).toBe("휴먼 #12345 · Lv2");
    expect(mayorTitle({ unitId: 12345, level: 1 }, "en")).toBe("Human #12345 · Lv1");
  });
});
