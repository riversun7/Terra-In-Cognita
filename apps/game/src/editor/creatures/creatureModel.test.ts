// 크리쳐 편집기 화면 모델 — 변종 만들기·대표 바꾸기·오차 정리(docs/adr/2026-11-25-creature-codex-groups.md).
import type { CreatureJson } from "@terra/shared/creatureEditor";
import { describe, expect, it } from "vitest";
import { cleanCreature, createDefaultCreature, promoteToRoot, variantFrom } from "./creatureModel.ts";

const base: CreatureJson = {
  ...createDefaultCreature("wolf"),
  primaries: { str: 7, dex: 6, agi: 8, vit: 5, int: 3, wis: 3 },
  elements: [2, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0],
};

describe("cleanCreature — 스탯 오차", () => {
  it("여섯 칸이 모두 기본 규칙과 같으면 적지 않고, 하나라도 다르면 남긴다", () => {
    const same = cleanCreature({
      ...base,
      primarySpread: { str: 1, dex: 1, agi: 1, vit: 1, int: 1, wis: 1 },
    });
    expect(same.primarySpread).toBeUndefined();
    const custom = cleanCreature({
      ...base,
      primarySpread: { str: 3, dex: 1, agi: 1, vit: 1, int: 1, wis: 1 },
    });
    expect(custom.primarySpread?.str).toBe(3);
  });

  it("자기 자신을 대표로 가리키는 값은 지운다", () => {
    expect(cleanCreature({ ...base, variantOf: "wolf" }).variantOf).toBeUndefined();
    expect(cleanCreature({ ...base, variantOf: "dire_wolf" }).variantOf).toBe("dire_wolf");
  });
});

describe("variantFrom", () => {
  it("속성 변종: 주속성 칸과 고른 칸을 맞바꾼다(합은 그대로)", () => {
    const fire = variantFrom(
      base,
      "wolf",
      "fire_wolf",
      { ko: "불 늑대", en: "Fire Wolf" },
      { kind: "element", element: 1 },
    );
    expect(fire.id).toBe("fire_wolf");
    expect(fire.variantOf).toBe("wolf");
    expect(fire.elements).toEqual([2, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(fire.primaries).toEqual(base.primaries);
  });

  it("스탯 변종: 같은 합을 고른 성향으로 다시 나누고 성향 태그를 바꾼다", () => {
    const mage = variantFrom(
      base,
      "wolf",
      "mage_wolf",
      { ko: "주술 늑대", en: "Hex Wolf" },
      { kind: "stats", tendency: "tendency_magic" },
    );
    const sum = Object.values(mage.primaries).reduce((a, b) => a + b, 0);
    expect(sum).toBe(32);
    expect(mage.primaries.int).toBeGreaterThan(mage.primaries.str);
    expect(mage.tags).toEqual(["tendency_magic"]);
    expect(mage.elements).toEqual(base.elements);
  });
});

describe("promoteToRoot", () => {
  it("변종을 대표로 올리면 옛 대표와 다른 변종이 새 대표를 가리킨다", () => {
    const all: CreatureJson[] = [
      base,
      { ...base, id: "fire_wolf", variantOf: "wolf" },
      { ...base, id: "ice_wolf", variantOf: "wolf" },
      { ...base, id: "bear" },
    ];
    const changed = promoteToRoot(all, "fire_wolf");
    expect(changed.map((entry) => [entry.id, entry.variantOf ?? null])).toEqual([
      ["wolf", "fire_wolf"],
      ["fire_wolf", null],
      ["ice_wolf", "fire_wolf"],
    ]);
    expect(promoteToRoot(all, "wolf")).toEqual([]);
  });
});
