import { describe, expect, it } from "vitest";
import {
  EMBLEM_CHARGES,
  EMBLEM_DARK,
  EMBLEM_DIVISIONS,
  EMBLEM_LIGHT,
  EMBLEM_SCHEME_COUNT,
  EMBLEM_SHAPES,
  contrastOf,
  emblemColors,
  emblemFromSeed,
  emblemOfId,
  emblemParts,
  emblemSvg,
  luminanceOf,
  mixColor,
  normalizeEmblem,
} from "./nationEmblem.ts";

describe("emblemParts", () => {
  it("모든 틀·나눔·상징 조합이 바탕·(나눔)·상징 조각을 낸다", () => {
    for (const shape of EMBLEM_SHAPES)
      for (const division of EMBLEM_DIVISIONS)
        for (const charge of EMBLEM_CHARGES) {
          const parts = emblemParts({ shape, division, charge, scheme: 0 }, "#c0392b");
          // plain = 바탕 + 상징, 그 밖 = 바탕 + 나눔 + 상징
          expect(parts.layers).toHaveLength(division === "plain" ? 2 : 3);
          expect(parts.viewBox).toBe("0 0 100 100");
          expect(parts.shape.startsWith("M")).toBe(true);
          for (const layer of parts.layers) {
            expect(layer.d).toMatch(/^M[0-9MLHVCQTAZ .-]+Z$/);
            expect(layer.fill).toMatch(/^#[0-9a-f]{6}$/);
          }
          // 마지막 조각 = 상징(구멍 채움 규칙)
          expect(parts.layers.at(-1)?.evenodd).toBe(true);
        }
  });

  it("같은 사양·색이면 같은 조각이다", () => {
    const spec = { shape: "shield", division: "chevron", charge: "sword", scheme: 0 } as const;
    expect(emblemParts(spec, "#0984e3")).toEqual(emblemParts(spec, "#0984e3"));
  });

  it("색 짜임 0은 시그니처 컬러가 바탕이다", () => {
    const parts = emblemParts({ shape: "circle", division: "plain", charge: "star", scheme: 0 }, "#2980b9");
    expect(parts.layers[0]?.fill).toBe("#2980b9");
    expect([EMBLEM_LIGHT, EMBLEM_DARK]).toContain(parts.layers.at(-1)?.fill);
  });

  it("테두리 나눔은 틀을 줄여 안쪽 바탕을 그린다", () => {
    const parts = emblemParts({ shape: "hexagon", division: "border", charge: "sun", scheme: 0 }, "#e17055");
    expect(parts.layers[1]?.transform).toContain("scale(0.8)");
    expect(parts.layers[1]?.d).toBe(parts.shape);
  });
});

describe("emblemColors", () => {
  it("상징은 바탕과 3:1 넘게 대비된다(팩의 16색 × 색 짜임 셋)", () => {
    const colors = [
      "#c0392b",
      "#2980b9",
      "#27ae60",
      "#8e44ad",
      "#d35400",
      "#16a085",
      "#f1c40f",
      "#2c3e50",
      "#e84393",
      "#00b894",
      "#6c5ce7",
      "#fd79a8",
      "#e17055",
      "#0984e3",
      "#b2bec3",
      "#fdcb6e",
    ];
    for (const color of colors)
      for (let scheme = 0; scheme < EMBLEM_SCHEME_COUNT; scheme++) {
        const palette = emblemColors(color, scheme);
        expect(contrastOf(palette.field, palette.charge), `${color}/${scheme}`).toBeGreaterThan(3);
      }
  });

  it("밝은 시그니처 컬러에는 어두운 상징을, 어두운 색에는 밝은 상징을 쓴다", () => {
    expect(emblemColors("#fdcb6e", 0).charge).toBe(EMBLEM_DARK);
    expect(emblemColors("#2c3e50", 0).charge).toBe(EMBLEM_LIGHT);
  });

  it("틀린 색 글은 회색으로 본다", () => {
    expect(emblemColors("red", 0).field).toBe("#888888");
  });
});

describe("색 도우미", () => {
  it("밝기·대비·섞기", () => {
    expect(luminanceOf("#000000")).toBe(0);
    expect(luminanceOf("#ffffff")).toBeCloseTo(1, 2);
    expect(contrastOf("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(mixColor("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("emblemFromSeed · emblemOfId · normalizeEmblem", () => {
  it("시드가 같으면 같은 사양, 목록 안의 값만 낸다", () => {
    for (let seed = 0; seed < 200; seed++) {
      const spec = emblemFromSeed(seed);
      expect(spec).toEqual(emblemFromSeed(seed));
      expect(EMBLEM_SHAPES).toContain(spec.shape);
      expect(EMBLEM_DIVISIONS).toContain(spec.division);
      expect(EMBLEM_CHARGES).toContain(spec.charge);
      expect(spec.scheme).toBeGreaterThanOrEqual(0);
      expect(spec.scheme).toBeLessThan(EMBLEM_SCHEME_COUNT);
    }
  });

  it("시드를 올리면 여러 모양이 나온다", () => {
    const seen = new Set(Array.from({ length: 40 }, (_, seed) => JSON.stringify(emblemFromSeed(seed))));
    expect(seen.size).toBeGreaterThan(20);
  });

  it("ID로 정해지는 기본 마크는 늘 같다", () => {
    expect(emblemOfId("placeholder_nation_01")).toEqual(emblemOfId("placeholder_nation_01"));
  });

  it("모르는 값은 기본으로 고친다", () => {
    expect(normalizeEmblem(undefined)).toEqual({
      shape: "shield",
      division: "plain",
      charge: "star",
      scheme: 0,
    });
    expect(normalizeEmblem({ scheme: 7 }).scheme).toBe(1);
  });
});

describe("emblemSvg", () => {
  it("틀로 자른 조각과 테두리를 든 SVG 글을 낸다", () => {
    const svg = emblemSvg(
      { shape: "banner", division: "chief", charge: "wheat", scheme: 0 },
      "#f1c40f",
      "c1",
    );
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">')).toBe(true);
    expect(svg).toContain('<clipPath id="c1">');
    expect(svg).toContain('clip-path="url(#c1)"');
    // 바탕 + 나눔 + 상징 + 자르는 길 + 테두리 = path 다섯
    expect(svg.match(/<path /g)).toHaveLength(5);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('stroke-width="3"');
  });
});
