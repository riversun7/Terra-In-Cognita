// 사이보그 외형 — 부위 ID 묶음 + 색(기획 D-6040 기술 전달). ADR 2026-11-01-first-login-cyborg 1·2절, 질문 172 기술 추천(가).
// [임시] 3D 모델이 아직 없어 기기가 2D 그림(SVG)으로 그린다. 그래서 목록이 그림 코드와 묶여 여기(공용)에 있다.
// 3D 부위가 생기면 같은 칸(머리·얼굴·몸통·팔다리)에 모델을 붙이고 목록을 콘텐츠 팩으로 옮긴다. 옛 ID는 가까운 부위로 넘긴다.
// - 서버는 만들 때 ID가 목록에 있는지만 본다(isCyborgAppearance). 무작위는 꾸밈이라 기기 난수로 뽑는다(판정이 아니다).
// - 색 값은 세계의 칠(다른 사람에게도 같은 색)이라 테마 값(tokens.css)이 아니다. 그리는 쪽이 테두리만 테마 색으로 둔다.
// 저장된 ID는 바꾸거나 다시 쓰지 않는다(cyborgs.appearance).

/** 부위 칸 — 차례가 화면의 부위 고르기 차례다 */
export const CYBORG_LOOK_SLOTS = ["head", "face", "body", "limbs"] as const;
export type CyborgLookSlot = (typeof CYBORG_LOOK_SLOTS)[number];

/** 칸마다 부위 ID(차례 = 넘기기 차례) */
export const CYBORG_LOOK_PARTS = {
  head: ["dome", "antenna", "crest", "helm"],
  face: ["visor", "eyes", "mono", "grill"],
  body: ["round", "plate", "slim", "core"],
  limbs: ["stub", "piston", "claw", "wheel"],
} as const satisfies { readonly [S in CyborgLookSlot]: readonly string[] };

/** 색 칸: 주색(껍데기)·포인트(빛·눈) */
export const CYBORG_COLOR_SLOTS = ["primary", "accent"] as const;
export type CyborgColorSlot = (typeof CYBORG_COLOR_SLOTS)[number];

/** [임시] 칠 색(파스텔, D-064 화풍). ID → sRGB 값 */
export const CYBORG_COLORS = {
  mint: "#9fe3c8",
  peach: "#ffc7a8",
  sky: "#a9d4ff",
  lilac: "#cdb8f5",
  lemon: "#fbe58f",
  coral: "#ff9a9a",
  slate: "#8a94a8",
  cream: "#f6eedc",
} as const;
export type CyborgColorId = keyof typeof CYBORG_COLORS;
/** 색 ID 차례(고르기 칸 차례). CYBORG_COLORS의 열쇠와 같아야 한다(시험이 본다) */
export const CYBORG_COLOR_IDS = [
  "mint",
  "peach",
  "sky",
  "lilac",
  "lemon",
  "coral",
  "slate",
  "cream",
] as const satisfies readonly CyborgColorId[];

export interface CyborgAppearance {
  readonly head: (typeof CYBORG_LOOK_PARTS.head)[number];
  readonly face: (typeof CYBORG_LOOK_PARTS.face)[number];
  readonly body: (typeof CYBORG_LOOK_PARTS.body)[number];
  readonly limbs: (typeof CYBORG_LOOK_PARTS.limbs)[number];
  readonly primary: CyborgColorId;
  readonly accent: CyborgColorId;
}

/** [임시] 프리셋 4개(부위 묶음 데이터, D-6040). 처음 고른 것은 첫 프리셋 */
export const CYBORG_PRESETS = [
  {
    id: "scout",
    look: { head: "antenna", face: "visor", body: "slim", limbs: "piston", primary: "mint", accent: "lemon" },
  },
  {
    id: "guard",
    look: { head: "helm", face: "grill", body: "plate", limbs: "stub", primary: "slate", accent: "coral" },
  },
  {
    id: "tinker",
    look: { head: "dome", face: "mono", body: "core", limbs: "claw", primary: "peach", accent: "sky" },
  },
  {
    id: "drifter",
    look: { head: "crest", face: "eyes", body: "round", limbs: "wheel", primary: "lilac", accent: "cream" },
  },
] as const satisfies readonly { readonly id: string; readonly look: CyborgAppearance }[];
export type CyborgPresetId = (typeof CYBORG_PRESETS)[number]["id"];

export const DEFAULT_CYBORG_APPEARANCE: CyborgAppearance = CYBORG_PRESETS[0].look;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inList(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

/** 받은 값이 외형 묶음인지(칸이 모두 있고 목록에 있는 ID, 다른 칸 없음). 서버가 만들 때·DB에서 읽을 때 본다 */
export function isCyborgAppearance(value: unknown): value is CyborgAppearance {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== CYBORG_LOOK_SLOTS.length + CYBORG_COLOR_SLOTS.length) return false;
  return (
    CYBORG_LOOK_SLOTS.every((slot) => inList(CYBORG_LOOK_PARTS[slot], value[slot])) &&
    CYBORG_COLOR_SLOTS.every((slot) => inList(CYBORG_COLOR_IDS, value[slot]))
  );
}

/** 칸 하나를 앞(−1)·뒤(+1)로 넘긴다(끝에서 처음으로 돈다) */
export function stepCyborgPart(look: CyborgAppearance, slot: CyborgLookSlot, step: 1 | -1): CyborgAppearance {
  const list: readonly string[] = CYBORG_LOOK_PARTS[slot];
  const index = list.indexOf(look[slot]);
  const next = list[(index + step + list.length) % list.length];
  return { ...look, [slot]: next };
}

/** 무작위 외형. pick(n)은 0 이상 n 미만의 정수를 준다(기기는 Math.random, 시험은 고정 수열) */
export function randomCyborgAppearance(pick: (count: number) => number): CyborgAppearance {
  const choose = <T>(list: readonly T[]): T => {
    const value = list[Math.min(list.length - 1, Math.max(0, pick(list.length)))];
    if (value === undefined) throw new Error("empty look list");
    return value;
  };
  return {
    head: choose(CYBORG_LOOK_PARTS.head),
    face: choose(CYBORG_LOOK_PARTS.face),
    body: choose(CYBORG_LOOK_PARTS.body),
    limbs: choose(CYBORG_LOOK_PARTS.limbs),
    primary: choose(CYBORG_COLOR_IDS),
    accent: choose(CYBORG_COLOR_IDS),
  };
}
