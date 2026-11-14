import { describe, expect, it } from "vitest";
import presets from "../../../../content/core/nation_presets.json" with { type: "json" };
import { inkOn, nationHex, nationStyle, relativeLuminance } from "./nationColor.ts";

const faction = (id: number, color?: string | null) => ({
  id,
  code: null,
  kind: "npc" as const,
  name: null,
  color,
});

describe("국가 색", () => {
  it("밝은 국가 색 위에는 어두운 글자, 어두운 색 위에는 흰 글자 — 어느 쪽이든 대비 4.5 이상", () => {
    expect(inkOn("#f1c40f")).toBe("#000000");
    expect(inkOn("#1a237e")).toBe("#ffffff");
    for (const hex of [
      "#c0392b",
      "#2980b9",
      "#27ae60",
      "#8e44ad",
      "#f39c12",
      "#7f8c8d",
      "#ffffff",
      "#000000",
    ]) {
      const a = relativeLuminance(hex);
      const b = relativeLuminance(inkOn(hex));
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("모양이 틀리거나 없으면 null·undefined(여섯 색 돌려 쓰기로)", () => {
    const factions = [
      faction(1, "#abcdef"),
      faction(2, "red"),
      faction(3, "#ABCDEF"),
      faction(4, null),
      faction(5),
    ];
    expect(nationHex(factions, 1)).toBe("#abcdef");
    expect([2, 3, 4, 5, 9].map((id) => nationHex(factions, id))).toEqual([null, null, null, null, null]);
    expect(nationStyle(factions, 2)).toBeUndefined();
    expect(nationStyle(factions, 1)).toEqual({
      "--nation": "#abcdef",
      "--nation-ink": "#000000",
      "--nation-halo": "#000000",
    });
  });

  it("팩 국가 프리셋 16개는 서로 다른 색(사용자 지적: 여섯 색 돌려 쓰기로 이웃이 같은 색)", () => {
    const colors = presets.entries.map((entry: { color?: string }) => entry.color?.toLowerCase());
    expect(colors.every((color) => typeof color === "string" && /^#[0-9a-f]{6}$/.test(color))).toBe(true);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
