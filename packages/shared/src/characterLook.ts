// 캐릭터 3D 외형(2판) — 부위 ID·몸 값·색 ID 묶음. docs/adr/2026-11-11-character-3d.md 1절(사용자 요청 2026-11-11 "캐릭터 생성을 더 다양한
// 프리셋과 폴리곤 3d로 구성할 수 있게, 2차맵에서도 사용가능하게").
// - 값은 목록 ID(글자)와 정수뿐이다. 그림(로우폴리 모델)은 엔진이 이 값으로 만든다(packages/engine characters/). 꾸밈이라 게임 규칙에 쓰지 않는다.
// - 서버는 목록에 있는 ID·범위 안 정수인지만 본다(isCharacterLook). 저장된 ID는 바꾸거나 다시 쓰지 않는다(cyborgs.look).
// - 옛 2D 외형(1판, cyborgLooks.ts CyborgAppearance)과 오간다: 옛 사이보그는 고른 부위·색을 가까운 3D 부위로 넘기고(characterLookFromLegacy),
//   2D 얼굴 그림(위 띠 등)은 3D 외형에서 가까운 옛 부위로 그린다(legacyAppearanceOf).
// - 색 값은 세계의 칠(다른 사람에게도 같은 색)이라 테마 값(tokens.css)이 아니다. 옛 색 8개는 ID·값이 그대로다.
// - 무작위·기본 외형은 씨앗 난수(rng.ts)라 같은 씨앗이면 어느 기기·서버에서나 같다.
import {
  CYBORG_COLORS,
  CYBORG_COLOR_IDS,
  CYBORG_LOOK_PARTS,
  type CyborgAppearance,
  type CyborgColorId,
} from "./cyborgLooks.ts";
import { createRng } from "./rng.ts";

/** 외형 판 번호(저장 값의 v) */
export const CHARACTER_LOOK_VERSION = 2;

/** 부위 칸 — 차례가 화면의 부위 고르기 차례다 */
export const CHARACTER_PART_SLOTS = [
  "build",
  "head",
  "face",
  "top",
  "torso",
  "arms",
  "legs",
  "back",
  "extra",
] as const;
export type CharacterPartSlot = (typeof CHARACTER_PART_SLOTS)[number];

/** 칸마다 부위 ID(차례 = 넘기기 차례). 뒤에 더하기만 한다 */
export const CHARACTER_PARTS = {
  /** 체형 */
  build: ["standard", "compact", "sturdy", "slender"],
  /** 머리 모양 */
  head: ["round", "block", "tall", "wide", "egg", "dome", "hex", "jaw"],
  /** 얼굴·바이저 */
  face: ["visor", "eyes", "mono", "grill", "goggles", "mask", "screen", "slit"],
  /** 머리카락·머리 장비 */
  top: [
    "none",
    "short",
    "bob",
    "spiky",
    "ponytail",
    "mohawk",
    "bun",
    "cap",
    "helm",
    "hood",
    "antenna",
    "crest",
    "horns",
  ],
  torso: ["tunic", "plate", "jacket", "robe", "vest", "core", "suit", "poncho"],
  arms: ["plain", "sleeve", "piston", "gauntlet", "claw"],
  legs: ["plain", "boots", "piston", "greaves", "skirt"],
  /** 등 장식 */
  back: ["none", "pack", "tank", "cape", "wings", "array", "shield", "jet"],
  /** 덧장식(목·어깨·허리·가슴) */
  extra: ["none", "scarf", "pads", "belt", "collar", "badge", "sash", "lamp"],
} as const satisfies { readonly [S in CharacterPartSlot]: readonly string[] };

export type CharacterPartId<S extends CharacterPartSlot> = (typeof CHARACTER_PARTS)[S][number];

/** 색 칸: 살(머리·손)·주색(윗옷)·보조(아래옷·머리카락)·포인트(띠·장식)·빛(눈·등불) */
export const CHARACTER_COLOR_SLOTS = ["skin", "primary", "secondary", "accent", "glow"] as const;
export type CharacterColorSlot = (typeof CHARACTER_COLOR_SLOTS)[number];

/**
 * 칠 색 20개(ID → sRGB). 앞 8개는 옛 2D 외형 색 그대로(CYBORG_COLORS). 낮·밤 2차맵 빛과 풀·모래·눈 땅 위에서 읽히게 가운데 밝기의
 * 파스텔·또렷한 색만 둔다(아주 어둡거나 흰색에 가까운 색은 없다)
 */
export const CHARACTER_COLORS = {
  ...CYBORG_COLORS,
  leaf: "#86c96b",
  teal: "#45b5ad",
  azure: "#5b93e8",
  indigo: "#6c6fd6",
  plum: "#a565c2",
  rose: "#f490bd",
  crimson: "#d9544f",
  orange: "#f6a352",
  clay: "#cf9466",
  cocoa: "#8c5c40",
  silver: "#c3cbd6",
  charcoal: "#414b5e",
} as const;
export type CharacterColorId = keyof typeof CHARACTER_COLORS;
/** 색 ID 차례(고르기 칸 차례). CHARACTER_COLORS의 열쇠와 같아야 한다(시험이 본다) */
export const CHARACTER_COLOR_IDS = [
  ...CYBORG_COLOR_IDS,
  "leaf",
  "teal",
  "azure",
  "indigo",
  "plum",
  "rose",
  "crimson",
  "orange",
  "clay",
  "cocoa",
  "silver",
  "charcoal",
] as const satisfies readonly CharacterColorId[];

/** 키 배율(%): 90~110, 화면은 5씩 */
export const CHARACTER_HEIGHT = { min: 90, max: 110, step: 5, base: 100 } as const;
/** 겉 장갑(사이보그 판금) 단계: 0 없음 ~ 3 온몸 */
export const CHARACTER_PLATING_MAX = 3;

export interface CharacterLook {
  readonly v: 2;
  readonly build: CharacterPartId<"build">;
  /** 키 배율(%) */
  readonly height: number;
  readonly head: CharacterPartId<"head">;
  readonly face: CharacterPartId<"face">;
  readonly top: CharacterPartId<"top">;
  readonly torso: CharacterPartId<"torso">;
  readonly arms: CharacterPartId<"arms">;
  readonly legs: CharacterPartId<"legs">;
  readonly back: CharacterPartId<"back">;
  readonly extra: CharacterPartId<"extra">;
  /** 겉 장갑 단계(0~3) */
  readonly plating: number;
  readonly skin: CharacterColorId;
  readonly primary: CharacterColorId;
  readonly secondary: CharacterColorId;
  readonly accent: CharacterColorId;
  readonly glow: CharacterColorId;
}

/** 화면에서 잠그거나 따로 굴릴 수 있는 칸(부위·키·장갑·색) */
export const CHARACTER_LOOK_KEYS = [
  ...CHARACTER_PART_SLOTS,
  "height",
  "plating",
  ...CHARACTER_COLOR_SLOTS,
] as const;
export type CharacterLookKey = (typeof CHARACTER_LOOK_KEYS)[number];

type PresetTuple = readonly [
  id: string,
  build: CharacterPartId<"build">,
  height: number,
  head: CharacterPartId<"head">,
  face: CharacterPartId<"face">,
  top: CharacterPartId<"top">,
  torso: CharacterPartId<"torso">,
  arms: CharacterPartId<"arms">,
  legs: CharacterPartId<"legs">,
  back: CharacterPartId<"back">,
  extra: CharacterPartId<"extra">,
  plating: number,
  skin: CharacterColorId,
  primary: CharacterColorId,
  secondary: CharacterColorId,
  accent: CharacterColorId,
  glow: CharacterColorId,
];

// 프리셋 24개(이름은 화면 문구 start_preset_<id>). 앞 넷은 옛 2D 프리셋과 같은 ID다. 한 줄 = ID·체형·키·머리·얼굴·머리 장식·몸통·팔·다리·등·
// 덧장식·장갑·살·주색·보조·포인트·빛
// biome-ignore format: 한 줄에 프리셋 하나(표처럼 읽는다)
const PRESET_ROWS: readonly PresetTuple[] = [
  ["scout", "slender", 100, "round", "visor", "antenna", "suit", "plain", "boots", "pack", "scarf", 1, "mint", "teal", "charcoal", "lemon", "lemon"],
  ["guard", "sturdy", 105, "block", "grill", "helm", "plate", "gauntlet", "greaves", "shield", "pads", 3, "slate", "silver", "charcoal", "coral", "coral"],
  ["tinker", "compact", 95, "dome", "mono", "cap", "core", "claw", "piston", "tank", "belt", 2, "peach", "orange", "cocoa", "sky", "sky"],
  ["drifter", "standard", 100, "egg", "eyes", "hood", "poncho", "sleeve", "boots", "none", "sash", 0, "cream", "lilac", "slate", "cream", "mint"],
  ["ranger", "slender", 105, "round", "eyes", "ponytail", "jacket", "sleeve", "boots", "pack", "belt", 0, "peach", "leaf", "cocoa", "lemon", "leaf"],
  ["medic", "standard", 100, "round", "goggles", "bob", "tunic", "sleeve", "plain", "pack", "badge", 1, "cream", "cream", "sky", "crimson", "mint"],
  ["pilot", "standard", 100, "wide", "goggles", "cap", "jacket", "gauntlet", "boots", "jet", "collar", 1, "clay", "azure", "charcoal", "orange", "sky"],
  ["miner", "sturdy", 95, "block", "mono", "helm", "vest", "piston", "greaves", "tank", "lamp", 2, "clay", "orange", "cocoa", "lemon", "lemon"],
  ["farmer", "standard", 100, "egg", "eyes", "bun", "tunic", "plain", "skirt", "none", "scarf", 0, "peach", "leaf", "cream", "coral", "lemon"],
  ["merchant", "compact", 95, "wide", "eyes", "cap", "robe", "sleeve", "skirt", "pack", "sash", 0, "cream", "plum", "lemon", "orange", "lemon"],
  ["scholar", "slender", 100, "tall", "goggles", "bob", "robe", "sleeve", "skirt", "none", "collar", 0, "cream", "indigo", "silver", "sky", "sky"],
  ["mystic", "slender", 105, "egg", "mask", "hood", "robe", "sleeve", "skirt", "cape", "collar", 0, "lilac", "plum", "indigo", "lemon", "lilac"],
  ["knight", "sturdy", 110, "jaw", "slit", "crest", "plate", "gauntlet", "greaves", "cape", "pads", 3, "silver", "azure", "silver", "lemon", "sky"],
  ["raider", "sturdy", 105, "jaw", "mask", "mohawk", "vest", "claw", "boots", "shield", "sash", 2, "clay", "crimson", "charcoal", "orange", "crimson"],
  ["diver", "standard", 100, "dome", "screen", "none", "suit", "plain", "boots", "tank", "collar", 2, "sky", "azure", "teal", "lemon", "mint"],
  ["courier", "compact", 95, "round", "visor", "cap", "jacket", "plain", "piston", "pack", "badge", 1, "peach", "lemon", "slate", "azure", "sky"],
  ["engineer", "standard", 100, "hex", "screen", "antenna", "vest", "piston", "piston", "array", "belt", 2, "slate", "teal", "charcoal", "orange", "mint"],
  ["sentinel", "sturdy", 110, "hex", "slit", "horns", "core", "gauntlet", "greaves", "wings", "pads", 3, "charcoal", "indigo", "silver", "rose", "rose"],
  ["nomad", "standard", 105, "tall", "eyes", "hood", "poncho", "sleeve", "boots", "pack", "scarf", 0, "cocoa", "orange", "clay", "teal", "lemon"],
  ["envoy", "slender", 105, "tall", "eyes", "bun", "suit", "sleeve", "plain", "cape", "badge", 0, "peach", "rose", "cream", "lemon", "lemon"],
  ["smith", "sturdy", 100, "wide", "grill", "short", "vest", "gauntlet", "greaves", "tank", "belt", 2, "cocoa", "slate", "cocoa", "orange", "orange"],
  ["hunter", "standard", 100, "jaw", "mono", "spiky", "jacket", "claw", "boots", "shield", "sash", 1, "clay", "cocoa", "leaf", "crimson", "lemon"],
  ["bard", "compact", 95, "egg", "eyes", "spiky", "tunic", "sleeve", "plain", "none", "scarf", 0, "cream", "rose", "azure", "lemon", "rose"],
  ["warden", "standard", 105, "dome", "visor", "crest", "plate", "plain", "greaves", "array", "lamp", 3, "mint", "leaf", "silver", "lemon", "lemon"],
];

export interface CharacterPreset {
  readonly id: string;
  readonly look: CharacterLook;
}

/** 프리셋 24개. 처음 고른 것은 첫 프리셋 */
export const CHARACTER_PRESETS: readonly CharacterPreset[] = PRESET_ROWS.map((row) => ({
  id: row[0],
  look: {
    v: 2,
    build: row[1],
    height: row[2],
    head: row[3],
    face: row[4],
    top: row[5],
    torso: row[6],
    arms: row[7],
    legs: row[8],
    back: row[9],
    extra: row[10],
    plating: row[11],
    skin: row[12],
    primary: row[13],
    secondary: row[14],
    accent: row[15],
    glow: row[16],
  },
}));

function firstPresetLook(): CharacterLook {
  const first = CHARACTER_PRESETS[0];
  if (!first) throw new Error("no character presets");
  return first.look;
}

export const DEFAULT_CHARACTER_LOOK: CharacterLook = firstPresetLook();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inList(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

function intIn(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/** 칸 수: 판 번호 + 부위 + 키 + 장갑 + 색 */
const LOOK_KEY_COUNT = 1 + CHARACTER_LOOK_KEYS.length;

/** 받은 값이 3D 외형인지(칸이 모두 있고 목록 ID·범위 안 정수, 다른 칸 없음). 서버가 만들 때·DB에서 읽을 때, 기기가 받은 답을 쓸 때 본다 */
export function isCharacterLook(value: unknown): value is CharacterLook {
  if (!isRecord(value)) return false;
  if (Object.keys(value).length !== LOOK_KEY_COUNT) return false;
  return (
    value["v"] === CHARACTER_LOOK_VERSION &&
    CHARACTER_PART_SLOTS.every((slot) => inList(CHARACTER_PARTS[slot], value[slot])) &&
    intIn(value["height"], CHARACTER_HEIGHT.min, CHARACTER_HEIGHT.max) &&
    intIn(value["plating"], 0, CHARACTER_PLATING_MAX) &&
    CHARACTER_COLOR_SLOTS.every((slot) => inList(CHARACTER_COLOR_IDS, value[slot]))
  );
}

/** 같은 외형인가(칸마다 같은 값) */
export function sameCharacterLook(a: CharacterLook, b: CharacterLook): boolean {
  return CHARACTER_LOOK_KEYS.every((key) => a[key] === b[key]);
}

/** 외형 하나의 짧은 표지(모델 캐시·썸네일 캐시 열쇠) */
export function characterLookKey(look: CharacterLook): string {
  return CHARACTER_LOOK_KEYS.map((key) => look[key]).join(".");
}

/** 칸 하나에서 고를 수 있는 값(부위·색 = ID, 키 = 90·95·…·110, 장갑 = 0~3) */
export function characterLookChoices(key: CharacterLookKey): readonly (string | number)[] {
  if (key === "height") {
    const out: number[] = [];
    for (let h = CHARACTER_HEIGHT.min; h <= CHARACTER_HEIGHT.max; h += CHARACTER_HEIGHT.step) out.push(h);
    return out;
  }
  if (key === "plating") return Array.from({ length: CHARACTER_PLATING_MAX + 1 }, (_, index) => index);
  if (key === "skin" || key === "primary" || key === "secondary" || key === "accent" || key === "glow")
    return CHARACTER_COLOR_IDS;
  return CHARACTER_PARTS[key];
}

/** 칸 하나를 앞(−1)·뒤(+1)로 넘긴다(끝에서 처음으로 돈다). 목록에 없는 값(키가 5 단위가 아님 등)이면 처음 값에서 센다 */
export function stepCharacterLook(look: CharacterLook, key: CharacterLookKey, step: 1 | -1): CharacterLook {
  const list = characterLookChoices(key);
  const index = Math.max(0, list.indexOf(look[key]));
  const next = list[(index + step + list.length) % list.length];
  return { ...look, [key]: next };
}

/** 살색으로 쓰는 색(무작위·기본 외형이 고른다 — 손으로는 어느 색이든 고를 수 있다) */
const SKIN_TONES: readonly CharacterColorId[] = ["cream", "peach", "clay", "cocoa"];
/** 사이보그 껍데기 색(무작위가 살색 대신 가끔 고른다) */
const SHELL_TONES: readonly CharacterColorId[] = ["mint", "sky", "lilac", "silver", "slate", "lemon"];
/** 빛 색으로 잘 보이는 색 */
const GLOW_TONES: readonly CharacterColorId[] = ["lemon", "mint", "sky", "coral", "rose", "lilac", "orange"];

function chooseFrom<T>(list: readonly T[], pick: (count: number) => number): T {
  const value = list[Math.min(list.length - 1, Math.max(0, pick(list.length)))];
  if (value === undefined) throw new Error("empty look list");
  return value;
}

/** 무작위 외형(pick(n) = 0 이상 n 미만 정수). 모든 칸을 고르게 뽑되 살색은 살·껍데기 색에서, 빛은 밝은 색에서 */
function rollCharacterLook(pick: (count: number) => number): CharacterLook {
  const heights = characterLookChoices("height");
  const height = chooseFrom(heights, pick);
  return {
    v: 2,
    build: chooseFrom(CHARACTER_PARTS.build, pick),
    height: typeof height === "number" ? height : CHARACTER_HEIGHT.base,
    head: chooseFrom(CHARACTER_PARTS.head, pick),
    face: chooseFrom(CHARACTER_PARTS.face, pick),
    top: chooseFrom(CHARACTER_PARTS.top, pick),
    torso: chooseFrom(CHARACTER_PARTS.torso, pick),
    arms: chooseFrom(CHARACTER_PARTS.arms, pick),
    legs: chooseFrom(CHARACTER_PARTS.legs, pick),
    back: chooseFrom(CHARACTER_PARTS.back, pick),
    extra: chooseFrom(CHARACTER_PARTS.extra, pick),
    plating: pick(CHARACTER_PLATING_MAX + 1),
    skin: pick(3) === 0 ? chooseFrom(SHELL_TONES, pick) : chooseFrom(SKIN_TONES, pick),
    primary: chooseFrom(CHARACTER_COLOR_IDS, pick),
    secondary: chooseFrom(CHARACTER_COLOR_IDS, pick),
    accent: chooseFrom(CHARACTER_COLOR_IDS, pick),
    glow: chooseFrom(GLOW_TONES, pick),
  };
}

/** 씨앗 하나 → 무작위 외형(같은 씨앗이면 같은 외형) */
export function randomCharacterLook(seed: number): CharacterLook {
  const rng = createRng(seed);
  return rollCharacterLook((count) => rng.nextInt(count));
}

/** 잠근 칸(locked)은 그대로 두고 나머지를 씨앗으로 다시 뽑는다. only를 주면 그 칸만 다시 뽑는다 */
export function rerollCharacterLook(
  look: CharacterLook,
  seed: number,
  locked: ReadonlySet<CharacterLookKey>,
  only?: CharacterLookKey,
): CharacterLook {
  const rolled = randomCharacterLook(seed);
  const out: Record<string, string | number> = { ...look };
  for (const key of CHARACTER_LOOK_KEYS) {
    if (only !== undefined ? key !== only : locked.has(key)) continue;
    out[key] = rolled[key];
  }
  // 칸 하나만 다시 뽑았는데 같은 값이면 다음 값으로 넘긴다(누른 것이 보이게)
  if (only !== undefined && out[only] === look[only]) return stepCharacterLook(look, only, 1);
  return isCharacterLook(out) ? out : look;
}

/** 유닛 ID → 씨앗(이웃한 ID가 비슷한 외형이 되지 않게 섞는다) */
function unitSeed(unitId: number, salt: number): number {
  return (Math.imul(unitId | 0, 0x9e3779b1) ^ salt) >>> 0;
}

/**
 * 외형이 없는 유닛의 기본 외형(유닛 ID로 정한다 — 서버·기기 어디서나 같다).
 * - commoner(휴먼·보통 유닛): 장갑·등 장식이 없는 수수한 차림, 살색 얼굴
 * - leader(NPC 국가 지도자): 망토·볏·온몸 장갑
 * - android(사람이 아닌 큰 걷는 유닛의 임시 모습 — 2차맵 크기 등급 2, docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)"):
 *   바이저·피스톤 팔다리·온몸 장갑의 기계 몸
 */
export function characterLookForUnit(
  unitId: number,
  style: "commoner" | "leader" | "android",
): CharacterLook {
  const salt = style === "leader" ? 0x51ed_270b : style === "android" ? 0x6a09_e667 : 0x2545_f491;
  const rng = createRng(unitSeed(unitId, salt));
  const pick = (count: number): number => rng.nextInt(count);
  const base = rollCharacterLook(pick);
  if (style === "android") {
    return {
      ...base,
      build: chooseFrom(["sturdy", "standard"] as const, pick),
      head: chooseFrom(["block", "hex", "dome", "jaw"] as const, pick),
      face: chooseFrom(["visor", "mono", "grill", "screen", "slit"] as const, pick),
      top: chooseFrom(["none", "antenna", "helm", "crest"] as const, pick),
      torso: chooseFrom(["plate", "core", "suit"] as const, pick),
      arms: chooseFrom(["piston", "gauntlet", "claw"] as const, pick),
      legs: chooseFrom(["piston", "greaves"] as const, pick),
      back: chooseFrom(["pack", "tank", "array", "jet"] as const, pick),
      extra: chooseFrom(["none", "pads", "lamp"] as const, pick),
      plating: CHARACTER_PLATING_MAX,
      skin: chooseFrom(SHELL_TONES, pick),
    };
  }
  if (style === "leader") {
    return {
      ...base,
      build: chooseFrom(["sturdy", "standard"] as const, pick),
      height: CHARACTER_HEIGHT.max,
      top: chooseFrom(["crest", "horns", "helm"] as const, pick),
      torso: chooseFrom(["plate", "core", "robe"] as const, pick),
      back: "cape",
      extra: chooseFrom(["pads", "collar", "badge"] as const, pick),
      plating: CHARACTER_PLATING_MAX,
      skin: chooseFrom(SHELL_TONES, pick),
    };
  }
  return {
    ...base,
    face: "eyes",
    top: chooseFrom(["none", "short", "bob", "spiky", "ponytail", "bun", "cap", "hood"] as const, pick),
    torso: chooseFrom(["tunic", "jacket", "vest", "robe", "poncho"] as const, pick),
    arms: chooseFrom(["plain", "sleeve"] as const, pick),
    legs: chooseFrom(["plain", "boots", "skirt"] as const, pick),
    back: chooseFrom(["none", "none", "pack"] as const, pick),
    extra: chooseFrom(["none", "none", "scarf", "belt", "sash"] as const, pick),
    plating: 0,
    skin: chooseFrom(SKIN_TONES, pick),
    secondary: chooseFrom(["cocoa", "charcoal", "slate", "clay", "cream", "orange"] as const, pick),
  };
}

const LEGACY_HEAD_TOP: Record<CyborgAppearance["head"], CharacterPartId<"top">> = {
  dome: "none",
  antenna: "antenna",
  crest: "crest",
  helm: "helm",
};
const LEGACY_BODY_TORSO: Record<CyborgAppearance["body"], CharacterPartId<"torso">> = {
  round: "tunic",
  plate: "plate",
  slim: "suit",
  core: "core",
};
const LEGACY_LIMBS: Record<
  CyborgAppearance["limbs"],
  readonly [CharacterPartId<"arms">, CharacterPartId<"legs">]
> = {
  stub: ["plain", "plain"],
  piston: ["piston", "piston"],
  claw: ["claw", "boots"],
  wheel: ["gauntlet", "greaves"],
};

/**
 * 옛 2D 외형 → 3D 외형(3D 외형을 고르기 전에 만든 사이보그). 고른 부위·색은 가까운 3D 부위로, 옛 외형에 없던 칸(체형·등·덧장식 등)은
 * 씨앗(사용자 ID에서 만든 수)으로 정한다. 같은 입력이면 같은 답이다
 */
export function characterLookFromLegacy(appearance: CyborgAppearance, seed: number): CharacterLook {
  const rng = createRng((seed ^ 0x7f4a_7c15) >>> 0);
  const pick = (count: number): number => rng.nextInt(count);
  const [arms, legs] = LEGACY_LIMBS[appearance.limbs];
  return {
    v: 2,
    build: chooseFrom(CHARACTER_PARTS.build, pick),
    height: CHARACTER_HEIGHT.base,
    head: chooseFrom(["round", "dome", "egg", "block"] as const, pick),
    face: appearance.face,
    top: LEGACY_HEAD_TOP[appearance.head],
    torso: LEGACY_BODY_TORSO[appearance.body],
    arms,
    legs,
    back: chooseFrom(["none", "pack", "tank"] as const, pick),
    extra: chooseFrom(["none", "collar", "belt"] as const, pick),
    plating: 2,
    skin: appearance.primary,
    primary: appearance.primary,
    secondary: "slate",
    accent: appearance.accent,
    glow: appearance.accent,
  };
}

const TOP_LEGACY_HEAD: Partial<Record<CharacterPartId<"top">, CyborgAppearance["head"]>> = {
  antenna: "antenna",
  crest: "crest",
  mohawk: "crest",
  spiky: "crest",
  horns: "crest",
  helm: "helm",
  cap: "helm",
  hood: "helm",
};
const FACE_LEGACY: Record<CharacterPartId<"face">, CyborgAppearance["face"]> = {
  visor: "visor",
  goggles: "visor",
  screen: "visor",
  eyes: "eyes",
  mask: "eyes",
  mono: "mono",
  grill: "grill",
  slit: "grill",
};
const TORSO_LEGACY: Partial<Record<CharacterPartId<"torso">, CyborgAppearance["body"]>> = {
  plate: "plate",
  core: "core",
  suit: "slim",
  vest: "slim",
  jacket: "slim",
};

const isLegacyColor = (id: CharacterColorId): id is CyborgColorId =>
  (CYBORG_COLOR_IDS as readonly string[]).includes(id);

/** 새 색 → 가장 가까운 옛 색(2D 그림용) */
const COLOR_LEGACY: Record<Exclude<CharacterColorId, CyborgColorId>, CyborgColorId> = {
  leaf: "mint",
  teal: "mint",
  azure: "sky",
  indigo: "lilac",
  plum: "lilac",
  rose: "coral",
  crimson: "coral",
  orange: "peach",
  clay: "peach",
  cocoa: "slate",
  silver: "cream",
  charcoal: "slate",
};

const legacyColor = (id: CharacterColorId): CyborgColorId => (isLegacyColor(id) ? id : COLOR_LEGACY[id]);

/** 3D 외형 → 옛 2D 외형(2D 얼굴 그림과 옛 조회 칸 appearance). 가까운 부위·색으로 넘긴다 */
export function legacyAppearanceOf(look: CharacterLook): CyborgAppearance {
  const limbs: CyborgAppearance["limbs"] =
    look.arms === "piston" || look.legs === "piston"
      ? "piston"
      : look.arms === "claw"
        ? "claw"
        : CYBORG_LOOK_PARTS.limbs[0];
  return {
    head: TOP_LEGACY_HEAD[look.top] ?? "dome",
    face: FACE_LEGACY[look.face],
    body: TORSO_LEGACY[look.torso] ?? "round",
    limbs,
    primary: legacyColor(look.primary),
    accent: legacyColor(look.glow),
  };
}

/** 글자(사용자 ID 등) → 씨앗(FNV-1a 32비트) */
export function characterSeedOf(text: string): number {
  let hash = 0x811c_9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return hash >>> 0;
}
