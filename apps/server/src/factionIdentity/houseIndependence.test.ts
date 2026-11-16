// 독립 선언이 열리는 범위(기획 D-577 — 질문 2244 답 "독립은 가문 단위"): 알박기 도시가 하나라도 있으면 열린다
import { describe, expect, it } from "vitest";
import { independenceOpen } from "./houseIndependence.ts";

describe("independenceOpen (D-577)", () => {
  it("알박기 도시가 하나라도 있으면 열리고, 하나도 없으면 막힌다", () => {
    const claimed = new Set([2]);
    expect(independenceOpen([2], claimed)).toBe(true);
    // 알박기가 아닌 도시가 섞여도 가문 전체가 떨어진다(예전: 모두 알박기 도시일 때만)
    expect(independenceOpen([1, 2, 3], claimed)).toBe(true);
    expect(independenceOpen([1, 3], claimed)).toBe(false);
    expect(independenceOpen([], claimed)).toBe(false);
  });
});
