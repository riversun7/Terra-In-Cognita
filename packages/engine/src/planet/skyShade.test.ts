import { describe, expect, it } from "vitest";
import { DAY_NIGHT_SHADE, type Rgb, dayAmount, shadeColor } from "./skyShade.ts";

/** "#rrggbb" → [0, 1] sRGB */
const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16) / 255,
  Number.parseInt(value.slice(3, 5), 16) / 255,
  Number.parseInt(value.slice(5, 7), 16) / 255,
];

/** sRGB → 선형 */
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG 상대 휘도 */
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 대비(1 ~ 21) */
function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * 땅 바이옴 색 = content/core/biomes.json(2026-10-29), 바다·호수 색 = planetMaterials.ts COLORS(셰이더가 물은 자기 색으로 그린다).
 * 이웃하기 쉬운 12쌍은 ADR 4절 밤 바닥 계산과 같다.
 */
const COLORS: Record<string, string> = {
  ice_sheet: "#edf2f6",
  alpine: "#9d958b",
  wetland: "#4d7c63",
  tundra: "#b5b78e",
  taiga: "#3d6a4f",
  temperate_forest: "#4e8e3d",
  grassland: "#a8c169",
  desert: "#e0c88a",
  savanna: "#c7b159",
  tropical_rainforest: "#1f6a2c",
  sea_coastal: "#9fdcef",
  sea_shelf: "#7cc6e6",
  sea_deep: "#4f97cf",
};
const PAIRS: readonly (readonly [string, string])[] = [
  ["grassland", "savanna"],
  ["savanna", "desert"],
  ["temperate_forest", "taiga"],
  ["taiga", "tropical_rainforest"],
  ["wetland", "taiga"],
  ["tundra", "alpine"],
  ["grassland", "temperate_forest"],
  ["sea_coastal", "sea_shelf"],
  ["sea_shelf", "sea_deep"],
  ["desert", "sea_coastal"],
  ["tropical_rainforest", "sea_deep"],
  ["ice_sheet", "tundra"],
];

const color = (name: string): Rgb => hex(COLORS[name] ?? "#000000");
/** 깊은 밤(항성이 지평선 아래 멀리), 한낮(항성이 머리 위) */
const DEEP_NIGHT = -1;
const NOON = 1;

/** 12쌍 중 가장 나쁜 (밤 대비 ÷ 낮 대비) */
function worstNightRatio(strength: number): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const [a, b] of PAIRS) {
    const day = contrast(shadeColor(color(a), NOON, 1), shadeColor(color(b), NOON, 1));
    const night = contrast(
      shadeColor(color(a), DEEP_NIGHT, strength),
      shadeColor(color(b), DEEP_NIGHT, strength),
    );
    worst = Math.min(worst, night / day);
  }
  return worst;
}

describe("낮밤 음영(셰이더 식의 JS판)", () => {
  it("밤 바닥: 인접 바이옴 12쌍의 대비가 밤 세기 1에서 낮 대비의 80% 이상(3판, ADR 4절)", () => {
    const worst = worstNightRatio(1);
    expect(worst).toBeGreaterThanOrEqual(0.8);
    // 3판 계산 값(0.81 안팎) — 값을 크게 바꾸면 ADR 4절 표도 고친다
    expect(worst).toBeLessThan(0.9);
  });

  it("가까운 거리의 옅은 밤(세기 0.6, 사용자 결정 U1)은 밤 1보다 대비를 덜 잃는다", () => {
    expect(worstNightRatio(0.6)).toBeGreaterThan(worstNightRatio(1));
  });

  it("흰 땅: 밤 휘도 약 32%(낮 대비), 낮은 0.94배 그대로", () => {
    const white: Rgb = [1, 1, 1];
    const day = shadeColor(white, NOON, 1);
    expect(day[0]).toBeCloseTo(DAY_NIGHT_SHADE.dayLight, 6);
    const ratio = luminance(shadeColor(white, DEEP_NIGHT, 1)) / luminance(day);
    expect(ratio).toBeGreaterThan(0.29);
    expect(ratio).toBeLessThan(0.35);
  });

  it("세기 0이면 항성 위치와 상관없이 낮 밝기(0.94) 하나다", () => {
    const base = color("grassland");
    for (const sunCos of [-1, -0.1, 0, 0.03, 0.5, 1]) {
      const shaded = shadeColor(base, sunCos, 0);
      shaded.forEach((value, i) => expect(value).toBeCloseTo((base[i] ?? 0) * DAY_NIGHT_SHADE.dayLight, 9));
    }
  });

  it("낮 정도는 띠(고도 약 −8°~+3.4°)에서 0 → 1로 늘고, 박명은 띠 가운데에서 따뜻하다(파랑을 덜 남긴다)", () => {
    expect(dayAmount(-0.2)).toBe(0);
    expect(dayAmount(0.1)).toBe(1);
    expect(dayAmount(-0.04)).toBeCloseTo(0.5, 6);
    // 띠 가운데(낮 정도 0.5, 항성 고도 sin < 0이라 낮 빛 = 0.94 × 0.82): 박명이 없으면 파랑 ÷ 빨강 = 아래 값
    const s = DAY_NIGHT_SHADE;
    const dayLight = s.dayLight * (1 - s.dayLambert);
    const untinted = (s.nightTint[2] * s.nightLight + dayLight) / (s.nightTint[0] * s.nightLight + dayLight);
    const dusk = shadeColor([1, 1, 1], -0.04, 1);
    expect((dusk[2] ?? 0) / (dusk[0] ?? 1)).toBeLessThan(untinted - 0.05);
  });

  it("기복: 항성이 머리 위면 카메라 빛 셰이더와 같은 이득(경사 0.1 → 밝기 + 지형색 × 0.062)", () => {
    const flat = shadeColor([0.5, 0.5, 0.5], NOON, 1, 0);
    const lit = shadeColor([0.5, 0.5, 0.5], NOON, 1, 0.1);
    expect((lit[0] ?? 0) - (flat[0] ?? 0)).toBeCloseTo(0.5 * DAY_NIGHT_SHADE.reliefGain * 0.1, 9);
  });
});
