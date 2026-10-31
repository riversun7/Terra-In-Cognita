import { describe, expect, it } from "vitest";
import {
  CYBORG_COLORS,
  CYBORG_COLOR_IDS,
  CYBORG_LOOK_PARTS,
  CYBORG_PRESETS,
  DEFAULT_CYBORG_APPEARANCE,
  isCyborgAppearance,
  randomCyborgAppearance,
  stepCyborgPart,
  type CyborgAppearance,
} from "./cyborgLooks.ts";

describe("cyborg looks", () => {
  it("색 ID 차례는 색 표의 열쇠와 같다", () => {
    expect([...CYBORG_COLOR_IDS].toSorted()).toEqual(Object.keys(CYBORG_COLORS).toSorted());
  });

  it("프리셋은 모두 맞는 외형이고 ID가 겹치지 않는다", () => {
    for (const preset of CYBORG_PRESETS) expect(isCyborgAppearance(preset.look)).toBe(true);
    expect(new Set(CYBORG_PRESETS.map((preset) => preset.id)).size).toBe(CYBORG_PRESETS.length);
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

  it("부위 넘기기는 끝에서 처음으로 돈다", () => {
    const heads = CYBORG_LOOK_PARTS.head;
    let look: CyborgAppearance = { ...DEFAULT_CYBORG_APPEARANCE, head: heads[0] };
    look = stepCyborgPart(look, "head", -1);
    expect(look.head).toBe(heads[heads.length - 1]);
    look = stepCyborgPart(look, "head", 1);
    expect(look.head).toBe(heads[0]);
  });

  it("무작위는 늘 맞는 외형이고, 고른 수에 따라 바뀐다", () => {
    const first = randomCyborgAppearance(() => 0);
    expect(first).toEqual({
      head: CYBORG_LOOK_PARTS.head[0],
      face: CYBORG_LOOK_PARTS.face[0],
      body: CYBORG_LOOK_PARTS.body[0],
      limbs: CYBORG_LOOK_PARTS.limbs[0],
      primary: CYBORG_COLOR_IDS[0],
      accent: CYBORG_COLOR_IDS[0],
    });
    let i = 0;
    for (let round = 0; round < 50; round++) {
      const look = randomCyborgAppearance((count) => (i++ * 7) % count);
      expect(isCyborgAppearance(look)).toBe(true);
    }
    // 범위를 벗어난 수를 줘도 목록 안에서 고른다
    expect(isCyborgAppearance(randomCyborgAppearance(() => 99))).toBe(true);
  });
});
