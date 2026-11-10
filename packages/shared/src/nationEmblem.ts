// 국가 마크(만든 것) — 마크 사양(모양·나눔·상징·색 짜임) → SVG 조각. docs/adr/2026-11-10-nation-editor.md 4절.
// 사용자 요청(2026-11-10): "국가마크도 생성 및 유저는 업로드하여 일정 사이즈를 크롭". 여기는 "생성" 쪽이다(올린 그림은 서버 nation_emblems).
// - 사양은 콘텐츠 팩 국가 프리셋 emblem 칸에 든다(없으면 프리셋 ID 해시로 고른 기본 사양 — emblemOfId).
// - 색은 국가 시그니처 컬러에서 2~3색을 낸다(바탕·나눔·상징). 그림 자료라 화면 토큰을 쓰지 않는다(세력 표지 색과 같은 뜻).
// - 실제 국기를 쓰지 않는다(기획 30 §5.3·§9, D-076): 방패·원 같은 틀 안에 상징 하나를 두는 문장 모양이고, 줄무늬만으로 된 깃발 모양은 없다.
// - 순수 함수(같은 사양·색이면 같은 조각). 화면 컴포넌트(apps/game/src/ui/NationEmblem.tsx)가 아무 크기(16~256px)로 그린다.
import { createRng } from "./rng.ts";

export const EMBLEM_SHAPES = ["shield", "circle", "diamond", "banner", "hexagon", "square"] as const;
export type EmblemShape = (typeof EMBLEM_SHAPES)[number];

export const EMBLEM_DIVISIONS = [
  "plain",
  "pale",
  "fess",
  "bend",
  "quarterly",
  "chevron",
  "chief",
  "border",
] as const;
export type EmblemDivision = (typeof EMBLEM_DIVISIONS)[number];

export const EMBLEM_CHARGES = [
  "star",
  "sun",
  "moon",
  "tree",
  "mountain",
  "wave",
  "tower",
  "gear",
  "wheat",
  "anchor",
  "flame",
  "bird",
  "sword",
  "crown",
  "hammer",
  "leaf",
] as const;
export type EmblemCharge = (typeof EMBLEM_CHARGES)[number];

/** 색 짜임 수: 0 = 시그니처 컬러 바탕, 1 = 밝은(또는 어두운) 바탕에 시그니처 컬러 상징, 2 = 짙은 바탕 */
export const EMBLEM_SCHEME_COUNT = 3;

export interface NationEmblemSpec {
  readonly shape: EmblemShape;
  readonly division: EmblemDivision;
  readonly charge: EmblemCharge;
  /** 색 짜임 0 ~ EMBLEM_SCHEME_COUNT − 1 */
  readonly scheme: number;
}

/** 그리는 칸(정사각 100 × 100) */
export const EMBLEM_VIEW_BOX = "0 0 100 100";

const SHAPE_PATHS: Readonly<Record<EmblemShape, string>> = {
  shield: "M10 8H90V52C90 76 72 90 50 96C28 90 10 76 10 52Z",
  circle: "M50 4A46 46 0 1 1 49.99 4Z",
  diamond: "M50 3L97 50L50 97L3 50Z",
  banner: "M12 5H88V95L50 78L12 95Z",
  hexagon: "M50 3L91 26.5V73.5L50 97L9 73.5V26.5Z",
  square: "M18 8H82A10 10 0 0 1 92 18V82A10 10 0 0 1 82 92H18A10 10 0 0 1 8 82V18A10 10 0 0 1 18 8Z",
};

/** 나눔 무늬(틀로 잘라 낸다). border는 틀을 줄여 다시 그린다(emblemParts) */
const DIVISION_PATHS: Readonly<Record<Exclude<EmblemDivision, "plain" | "border">, string>> = {
  pale: "M50 0H100V100H50Z",
  fess: "M0 50H100V100H0Z",
  bend: "M0 0L100 100H0Z",
  quarterly: "M50 0H100V50H50ZM0 50H50V100H0Z",
  chevron: "M0 100L50 44L100 100V78L50 22L0 78Z",
  chief: "M0 0H100V30H0Z",
};

/** 상징(가운데 50,50 둘레 약 48칸 안, 채움 규칙 evenodd) */
const CHARGE_PATHS: Readonly<Record<EmblemCharge, string>> = {
  star: "M50 28L55.6 43.3L71.9 43.9L59 53.9L63.5 69.6L50 60.5L36.5 69.6L41 53.9L28.1 43.9L44.4 43.3Z",
  sun: "M50 39A11 11 0 1 1 49.99 39ZM50 26L47 35.3L53 35.3ZM67 33L58.3 37.5L62.5 41.7ZM74 50L64.7 47L64.7 53ZM67 67L62.5 58.3L58.3 62.5ZM50 74L53 64.7L47 64.7ZM33 67L41.7 62.5L37.5 58.3ZM26 50L35.3 53L35.3 47ZM33 33L37.5 41.7L41.7 37.5Z",
  moon: "M58 29A22 22 0 1 0 58 71A17 17 0 1 1 58 29Z",
  tree: "M50 27L65 50H57L70 66H53V75H47V66H30L43 50H35Z",
  mountain: "M26 70L43 40L50 51L59 34L74 70Z",
  wave: "M27 38Q32.75 30 38.5 38T50 38T61.5 38T73 38V46Q67.25 54 61.5 46T50 46T38.5 46T27 46ZM27 55Q32.75 47 38.5 55T50 55T61.5 55T73 55V63Q67.25 71 61.5 63T50 63T38.5 63T27 63Z",
  tower: "M37 73V41H33V29H40V35H46V29H54V35H60V29H67V41H63V73ZM46 73V60A4 4 0 0 1 54 60V73Z",
  gear: "M46.7 33.3L47.2 26.2L52.8 26.2L53.3 33.3L59.4 35.9L64.9 31.2L68.8 35.1L64.1 40.6L66.7 46.7L73.8 47.2L73.8 52.8L66.7 53.3L64.1 59.4L68.8 64.9L64.9 68.8L59.4 64.1L53.3 66.7L52.8 73.8L47.2 73.8L46.7 66.7L40.6 64.1L35.1 68.8L31.2 64.9L35.9 59.4L33.3 53.3L26.2 52.8L26.2 47.2L33.3 46.7L35.9 40.6L31.2 35.1L35.1 31.2L40.6 35.9ZM50 43A7 7 0 1 0 50.01 43Z",
  wheat:
    "M48.5 76V40H51.5V76ZM50 38Q44 32 50 25Q56 32 50 38ZM48 50Q38 49 37 39Q47 40 48 50ZM52 50Q62 49 63 39Q53 40 52 50ZM48 62Q38 61 37 51Q47 52 48 62ZM52 62Q62 61 63 51Q53 52 52 62Z",
  anchor:
    "M50 26A6 6 0 1 1 49.99 26ZM50 30A2 2 0 1 0 50.01 30ZM48 38H52V45H60V49H52V68C59 67 64 62 65 56L61 57L67 48L72 58L68 57C67 67 59 73 50 73C41 73 33 67 32 57L28 58L33 48L39 57L35 56C36 62 41 67 48 68V49H40V45H48Z",
  flame: "M50 25C58 37 67 44 67 56A17 17 0 0 1 33 56C33 48 39 46 41 38C45 42 46 46 48 49C50 42 48 33 50 25Z",
  bird: "M50 45C44 34 34 30 23 32C29 36 32 42 38 46C32 46 28 50 26 55C34 52 42 54 46 58L42 71L50 64L58 71L54 58C58 54 66 52 74 55C72 50 68 46 62 46C68 42 71 36 77 32C66 30 56 34 50 45Z",
  sword: "M47.5 27L50 22L52.5 27V57H61V61H52.5V73H47.5V61H39V57H47.5Z",
  crown: "M30 64L26 38L38 49L50 32L62 49L74 38L70 64ZM30 67H70V73H30Z",
  hammer: "M34 29H61L67 35V44H34ZM47 44H53V75H47Z",
  leaf: "M50 25C65 34 69 51 50 75C31 51 35 34 50 25ZM49 40H51V68H49Z",
};

/** 방패·깃발 틀은 상징을 조금 위에 둔다(아래가 좁다) */
const CHARGE_LIFT: Readonly<Record<EmblemShape, number>> = {
  shield: -5,
  circle: 0,
  diamond: 0,
  banner: -7,
  hexagon: 0,
  square: 0,
};

/** 상징 크기(틀마다 안에 들게) */
const CHARGE_SCALE: Readonly<Record<EmblemShape, number>> = {
  shield: 1,
  circle: 1,
  diamond: 0.78,
  banner: 0.95,
  hexagon: 0.95,
  square: 1.05,
};

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/** #rrggbb → [r, g, b](틀리면 회색) */
export function rgbOf(color: string): [number, number, number] {
  const match = HEX.exec(color);
  if (!match) return [136, 136, 136];
  return [
    Number.parseInt(match[1] ?? "88", 16),
    Number.parseInt(match[2] ?? "88", 16),
    Number.parseInt(match[3] ?? "88", 16),
  ];
}

const hexOf = (rgb: readonly [number, number, number]): string =>
  `#${rgb
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

/** 두 색을 섞는다(t = 0이면 a, 1이면 b) */
export function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return hexOf([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/** sRGB 한 칸 → 선형 값(WCAG 식의 꺾은 근사: 지수 2.4 대신 제곱 — 그림 색 고르기에만 쓴다, 판정 아님) */
const linear = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045
    ? c / 12.92
    : ((c + 0.055) / 1.055) * ((c + 0.055) / 1.055) * Math.sqrt((c + 0.055) / 1.055);
};

/** 상대 밝기 0~1(WCAG 식, 지수 2.4를 2.5로 근사) */
export function luminanceOf(color: string): number {
  const [r, g, b] = rgbOf(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** 두 색의 대비(1~21) */
export function contrastOf(a: string, b: string): number {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 마크의 밝은 쇠붙이 색·어두운 먹색 */
export const EMBLEM_LIGHT = "#f6efdc";
export const EMBLEM_DARK = "#1d2433";

export interface EmblemColors {
  readonly field: string;
  readonly accent: string;
  readonly charge: string;
  readonly outline: string;
}

/** 상징이 바탕과 구별되는 가장 낮은 대비 */
export const EMBLEM_MIN_CONTRAST = 3;

/** 밝은 쇠붙이 색·어두운 먹색 가운데 그 바탕과 더 대비되는 쪽 */
const metalOn = (field: string): string =>
  contrastOf(field, EMBLEM_LIGHT) >= contrastOf(field, EMBLEM_DARK) ? EMBLEM_LIGHT : EMBLEM_DARK;

/** 색을 바탕과 대비가 날 때까지 바탕 반대쪽(어둡게 또는 밝게)으로 조금씩 옮긴다 */
function awayFrom(color: string, field: string): string {
  const toward = luminanceOf(field) > 0.4 ? EMBLEM_DARK : EMBLEM_LIGHT;
  let out = color;
  for (let step = 1; step <= 10 && contrastOf(out, field) < EMBLEM_MIN_CONTRAST; step++)
    out = mixColor(color, toward, step / 10);
  return out;
}

/** 시그니처 컬러 → 마크 색(바탕·나눔·상징·테두리). 상징은 바탕과 대비 3 이상이다 */
export function emblemColors(color: string, scheme: number): EmblemColors {
  const base = HEX.test(color) ? color.toLowerCase() : "#888888";
  const outline = mixColor(base, EMBLEM_DARK, 0.6);
  const pick = ((Math.trunc(scheme) % EMBLEM_SCHEME_COUNT) + EMBLEM_SCHEME_COUNT) % EMBLEM_SCHEME_COUNT;
  if (pick === 1) {
    // 밝은 바탕(시그니처 컬러가 밝으면 어두운 바탕)에 시그니처 컬러 상징
    const field = luminanceOf(base) > 0.45 ? EMBLEM_DARK : EMBLEM_LIGHT;
    return { field, accent: mixColor(field, base, 0.28), charge: awayFrom(base, field), outline };
  }
  if (pick === 2) {
    // 짙은 바탕 + 시그니처 컬러 나눔
    const field = mixColor(base, EMBLEM_DARK, 0.62);
    return { field, accent: mixColor(base, EMBLEM_DARK, 0.25), charge: metalOn(field), outline };
  }
  const charge = metalOn(base);
  return {
    field: base,
    // 나눔은 상징과 대비가 줄지 않는 쪽으로(상징이 밝으면 더 어둡게, 어두우면 더 밝게)
    accent: charge === EMBLEM_LIGHT ? mixColor(base, EMBLEM_DARK, 0.34) : mixColor(base, EMBLEM_LIGHT, 0.38),
    charge,
    outline,
  };
}

export interface EmblemLayer {
  readonly d: string;
  readonly fill: string;
  /** 있으면 그 조각에만 거는 변환(SVG transform) */
  readonly transform?: string | undefined;
  /** 채움 규칙(상징의 구멍) */
  readonly evenodd?: boolean | undefined;
}

export interface EmblemParts {
  readonly viewBox: string;
  /** 틀(자르는 길이자 테두리) */
  readonly shape: string;
  /** 틀 안에 차례로 그리는 조각(바탕 → 나눔 → 상징) */
  readonly layers: readonly EmblemLayer[];
  readonly outline: string;
}

const isMember = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** 사양을 고친다(모르는 값은 첫 값, 색 짜임은 범위 안으로) */
export function normalizeEmblem(spec: Partial<NationEmblemSpec> | undefined): NationEmblemSpec {
  const scheme = Number.isInteger(spec?.scheme) ? Number(spec?.scheme) : 0;
  return {
    shape: isMember(EMBLEM_SHAPES, spec?.shape) ? spec.shape : "shield",
    division: isMember(EMBLEM_DIVISIONS, spec?.division) ? spec.division : "plain",
    charge: isMember(EMBLEM_CHARGES, spec?.charge) ? spec.charge : "star",
    scheme: ((scheme % EMBLEM_SCHEME_COUNT) + EMBLEM_SCHEME_COUNT) % EMBLEM_SCHEME_COUNT,
  };
}

/** 사양·시그니처 컬러 → 그릴 조각 */
export function emblemParts(input: Partial<NationEmblemSpec> | undefined, color: string): EmblemParts {
  const spec = normalizeEmblem(input);
  const colors = emblemColors(color, spec.scheme);
  const shape = SHAPE_PATHS[spec.shape];
  const layers: EmblemLayer[] = [];
  if (spec.division === "border") {
    layers.push({ d: "M0 0H100V100H0Z", fill: colors.accent });
    // 틀을 가운데로 줄여 안쪽 바탕을 그린다
    layers.push({
      d: shape,
      fill: colors.field,
      transform: "translate(50 50) scale(0.8) translate(-50 -50)",
    });
  } else {
    layers.push({ d: "M0 0H100V100H0Z", fill: colors.field });
    if (spec.division !== "plain") layers.push({ d: DIVISION_PATHS[spec.division], fill: colors.accent });
  }
  const scale = CHARGE_SCALE[spec.shape] * (spec.division === "border" ? 0.82 : 1);
  const lift = CHARGE_LIFT[spec.shape];
  layers.push({
    d: CHARGE_PATHS[spec.charge],
    fill: colors.charge,
    evenodd: true,
    transform: `translate(50 ${50 + lift}) scale(${scale}) translate(-50 -50)`,
  });
  return { viewBox: EMBLEM_VIEW_BOX, shape, layers, outline: colors.outline };
}

/** 사양·색 → SVG 글(내려받기·시험). clipId는 한 문서 안에서 하나여야 한다 */
export function emblemSvg(
  input: Partial<NationEmblemSpec> | undefined,
  color: string,
  clipId = "emblem-clip",
): string {
  const parts = emblemParts(input, color);
  const layers = parts.layers
    .map(
      (layer) =>
        `<path d="${layer.d}" fill="${layer.fill}"${layer.transform ? ` transform="${layer.transform}"` : ""}${layer.evenodd ? ' fill-rule="evenodd"' : ""}/>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${parts.viewBox}">` +
    `<clipPath id="${clipId}"><path d="${parts.shape}"/></clipPath>` +
    `<g clip-path="url(#${clipId})">${layers}</g>` +
    `<path d="${parts.shape}" fill="none" stroke="${parts.outline}" stroke-width="3" stroke-linejoin="round"/>` +
    "</svg>"
  );
}

/** 시드 → 사양(편집기 [다시 만들기]가 시드를 하나씩 올린다) */
export function emblemFromSeed(seed: number): NationEmblemSpec {
  const rng = createRng(seed >>> 0);
  const shape = EMBLEM_SHAPES[rng.nextInt(EMBLEM_SHAPES.length)] ?? "shield";
  const division = EMBLEM_DIVISIONS[rng.nextInt(EMBLEM_DIVISIONS.length)] ?? "plain";
  const charge = EMBLEM_CHARGES[rng.nextInt(EMBLEM_CHARGES.length)] ?? "star";
  return { shape, division, charge, scheme: rng.nextInt(EMBLEM_SCHEME_COUNT) };
}

/** 글(프리셋 ID·세력 코드) → 시드(FNV-1a 32비트) */
export function emblemSeedOf(text: string): number {
  let hash = 0x811c_9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}

/** 사양이 없는 나라의 기본 마크(ID로 정해진다) */
export const emblemOfId = (id: string): NationEmblemSpec => emblemFromSeed(emblemSeedOf(id));
