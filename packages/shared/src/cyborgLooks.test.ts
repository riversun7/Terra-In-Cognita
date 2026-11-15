// 옛 2D 외형 시험 — 남은 것(옛 값 검사·기본 값)만 본다. 2D 그림·프리셋·넘기기·무작위는 기획 D-560 1421로 뺐다
import { describe, expect, it } from "vitest";
import {
  CYBORG_COLORS,
  CYBORG_COLOR_IDS,
  DEFAULT_CYBORG_APPEARANCE,
  isCyborgAppearance,
} from "./cyborgLooks.ts";

describe("cyborg looks", () => {
  it("색 ID 차례는 색 표의 열쇠와 같다", () => {
    expect([...CYBORG_COLOR_IDS].toSorted()).toEqual(Object.keys(CYBORG_COLORS).toSorted());
  });

  it("기본 값은 맞는 옛 외형이다", () => {
    expect(isCyborgAppearance(DEFAULT_CYBORG_APPEARANCE)).toBe(true);
  });

  it("목록 밖 ID·빠진 칸·더 있는 칸·객체가 아닌 값은 받지 않는다", () => {
    expect(isCyborgAppearance({ ...DEFAULT_CYBORG_APPEARANCE, head: "tophat" })).toBe(false);
    expect(isCyborgAppearance({ ...DEFAULT_CYBORG_APPEARANCE, primary: "#ff0000" })).toBe(false);
    const { limbs: _limbs, ...missing } = DEFAULT_CYBORG_APPEARANCE;
    expect(isCyborgAppearance(missing)).toBe(false);
    expect(isCyborgAppearance({ ...DEFAULT_CYBORG_APPEARANCE, hat: "dome" })).toBe(false);
    expect(isCyborgAppearance(null)).toBe(false);
    expect(isCyborgAppearance([])).toBe(false);
    expect(isCyborgAppearance("scout")).toBe(false);
  });
});
