// 국가 색 — 서버가 보낸 국가 고유 색(세력 정체성 > 팩 국가 프리셋, world.cities factions[].color)을 1차맵 영토·도시 점·이름표·범례에 쓴다
// (사용자 요청 2026-11-14 "국가 시그니처 색을 1차맵에", ADR 2026-11-07-planet-view "바뀜 (2026-11-14)").
// - 세계 색은 화면 테마와 상관없는 자료 색이라(D-070) CSS 파일이 아니라 style의 CSS 변수로 넣는다: --nation(국가 색),
//   --nation-ink(그 색 위 글자·별 — 밝기로 검정/흰색), --nation-halo(국가 색 글자의 번짐 — ink와 같은 값: 밝은 국가 색은 어두운 번짐).
//   CSS(cityOverlay.css·planetMap.css)는 var(--nation)만 읽는다. 색이 없으면(옛 서버·프리셋 없는 세력) data-nation 여섯 색 돌려 쓰기.
// - 모양을 다시 본다(`#rrggbb`) — style에 서버 글자를 그대로 넣지 않는다.
import { NATION_COLOR_PATTERN, type WorldMapFaction } from "@terra/shared/worldMap";

declare module "react" {
  interface CSSProperties {
    /** 국가 색 CSS 변수(자료 색) */
    readonly "--nation"?: string | undefined;
    readonly "--nation-ink"?: string | undefined;
    readonly "--nation-halo"?: string | undefined;
  }
}

/** 국가 색 위 어두운 글자·밝은 글자(세계 색이라 테마와 상관없다) */
const DARK_INK = "#000000";
const LIGHT_INK = "#ffffff";

/** sRGB 성분(0~255) → 선형 */
const linear = (value: number): number => {
  const c = value / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** 상대 휘도(WCAG) */
export function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** sRGB `#rrggbb` → OKLab(L, a, b). 색끼리 "얼마나 달라 보이나"를 잰다(비슷한 색 이웃 무늬, territoryView.ts) */
export function oklab(hex: string): readonly [number, number, number] {
  const r = linear(Number.parseInt(hex.slice(1, 3), 16));
  const g = linear(Number.parseInt(hex.slice(3, 5), 16));
  const b = linear(Number.parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b);
  const m = Math.cbrt(0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b);
  const s = Math.cbrt(0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b);
  return [
    0.210_454_255_3 * l + 0.793_617_785 * m - 0.004_072_046_8 * s,
    1.977_998_495_1 * l - 2.428_592_205 * m + 0.450_593_709_9 * s,
    0.025_904_037_1 * l + 0.782_771_766_2 * m - 0.808_675_766 * s,
  ];
}

/** 두 색의 OKLab 거리(0 = 같은 색, 검정–흰색 = 1) */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** 두 휘도의 대비(1 ~ 21) */
export const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** 국가 색 위에 읽히는 글자 색: 검정·흰색 가운데 대비가 큰 것 */
export function inkOn(hex: string): string {
  const luminance = relativeLuminance(hex);
  return contrast(luminance, relativeLuminance(DARK_INK)) >= contrast(luminance, relativeLuminance(LIGHT_INK))
    ? DARK_INK
    : LIGHT_INK;
}

/** 그 국가의 색(모양이 틀리거나 없으면 null) */
export function nationHex(factions: readonly WorldMapFaction[], factionId: number): string | null {
  const color = factions.find((faction) => faction.id === factionId)?.color;
  return typeof color === "string" && NATION_COLOR_PATTERN.test(color) ? color : null;
}

/** style에 넣을 국가 색 변수. 색이 없으면 undefined(CSS data-nation 돌려 쓰기) */
export function nationStyle(factions: readonly WorldMapFaction[], factionId: number) {
  const hex = nationHex(factions, factionId);
  if (hex === null) return undefined;
  const ink = inkOn(hex);
  return { "--nation": hex, "--nation-ink": ink, "--nation-halo": ink } as const;
}
