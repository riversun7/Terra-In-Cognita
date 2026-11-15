// 옛 2D 사이보그 외형(1판) — 부위 ID 묶음 + 색(기획 D-6040). ADR 2026-11-01-first-login-cyborg 1·2절.
// 기획 D-560 1421 "옛 2D 자료 바로 정리"(docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-15, D-560 1421)"): 2D 그림·프리셋·넘기기·무작위는 뺐다.
// 남은 것은 옛 값을 3D 외형으로 넘기는 데 필요한 것뿐이다(서버가 켤 때 남은 옛 칸을 옮기고, 35판 기기의 만들기가 옛 칸만 보낼 때 — isCyborgAppearance·
// characterLook.ts characterLookFromLegacy). 3D 칠 색 앞 8개(CYBORG_COLORS)는 3D 색 목록이 그대로 쓴다. 옛 칸이 DB에서 사라지면(다음 배포) 색만 남긴다.

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

/** 옛 값이 맞지 않을 때 쓰는 2D 외형(옛 첫 프리셋 "scout") */
export const DEFAULT_CYBORG_APPEARANCE: CyborgAppearance = {
  head: "antenna",
  face: "visor",
  body: "slim",
  limbs: "piston",
  primary: "mint",
  accent: "lemon",
};

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
