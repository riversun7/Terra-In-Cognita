// AI 작전(기획 D-5039·D-5040, 45 §4·50 §6.4, 49 C39·C40) — 파티마다 7항목 슬라이더(0~10)와 목표 우선순위, 4성향은 슬라이더 값 묶음(프리셋).
// 값 n은 기회(새 적이 들어옴·HP가 기준선을 지남·행동이 끝남)가 올 때 n × 10% 확률로 그 행동을 한다는 뜻이고(C40), ⑦ 퇴각 기준만 확률이 아닌
// 기준선(파티 HP %)이다. NPC도 같은 슬라이더와 성격별 프리셋을 쓴다.
// 이 모듈은 값의 모양·프리셋 출발값·검사만 둔다. 쓰는 곳:
// - 서버 조우 판단(apps/server/src/travel/clashDecide.ts — 기획 질문 2021·2023 답: 플레이어 유닛의 조우 판단 입력 = 이 작전),
//   세계 전투 파티 퇴각 기준(⑦, 조우 전투 시작 자료).
// - 유닛 화면 [AI 작전] 판(apps/game/src/units/TacticsPanel.tsx), 저장 = 세계 유닛마다 한 줄(unit_tactics, 프로토콜 50 unit_tactics).
// [임시] 세계에는 아직 파티(분대) 묶음이 없어 유닛마다 저장하고, 조우 한 편 = 한 파티로 보아 편의 판단 유닛 값을 평균한다(질문 2131).
// 전투 안 움직임(② 추격·③ 엄폐·④ 호위·⑤ 스킬 아끼기·⑥ 대형 간격·목표 우선순위)은 전투 AI 줄기(sim combat/moveAi.ts WP-4)가 읽는다 — 아직 없다.

/** 4성향 프리셋(D-5040): 공격적·균형·방어적·숨어 버티기 */
export const AI_PRESETS = ["aggressive", "balanced", "defensive", "hold"] as const;
export type AiPreset = (typeof AI_PRESETS)[number];

/** 목표 우선순위(고르기): 가까운 적·약한 적·위협이 큰 적 */
export const AI_TARGETS = ["nearest", "weakest", "threat"] as const;
export type AiTarget = (typeof AI_TARGETS)[number];

/** 확률 슬라이더 ①~⑥(0~10) — 교전·추격·엄폐와 은신·호위·스킬 아끼기·대형 간격 */
export const AI_SLIDERS = ["engage", "pursue", "cover", "escort", "saveSkill", "spread"] as const;
export type AiSlider = (typeof AI_SLIDERS)[number];

/** 슬라이더 상한(0~10) */
export const AI_SLIDER_MAX = 10;
/** ⑦ 퇴각 기준 상한(파티 HP %) */
export const AI_RETREAT_MAX = 100;
/** C40: 슬라이더 한 칸 = 10% 확률(‰로 100) */
export const AI_SLIDER_STEP_PM = 100;

/** AI 작전 한 묶음. preset = 마지막으로 고른 프리셋(그 뒤 값을 고쳤을 수 있다 — tacticsMatchPreset) */
export interface AiTactics {
  readonly preset: AiPreset;
  readonly engage: number;
  readonly pursue: number;
  readonly cover: number;
  readonly escort: number;
  readonly saveSkill: number;
  readonly spread: number;
  /** ⑦ 퇴각 기준(파티 HP %, 0 = 퇴각 안 함) */
  readonly retreatPct: number;
  readonly target: AiTarget;
}

/**
 * 프리셋 출발값(49 C39, 50 §6.4 — ⑤ 스킬 아끼기·⑥ 대형 간격·목표 우선순위는 49 X15 기획자 잠정값):
 * 공격적 9·8·3·2·2·3·0%·약한 적 / 균형 6·5·6·5·5·5·30%·가까운 적 / 방어적 4·1·7·9·6·6·50%·위협이 큰 적 / 숨어 버티기 1·0·10·8·8·7·0%·가까운 적
 */
export const AI_PRESET_VALUES: Readonly<Record<AiPreset, AiTactics>> = {
  aggressive: {
    preset: "aggressive",
    engage: 9,
    pursue: 8,
    cover: 3,
    escort: 2,
    saveSkill: 2,
    spread: 3,
    retreatPct: 0,
    target: "weakest",
  },
  balanced: {
    preset: "balanced",
    engage: 6,
    pursue: 5,
    cover: 6,
    escort: 5,
    saveSkill: 5,
    spread: 5,
    retreatPct: 30,
    target: "nearest",
  },
  defensive: {
    preset: "defensive",
    engage: 4,
    pursue: 1,
    cover: 7,
    escort: 9,
    saveSkill: 6,
    spread: 6,
    retreatPct: 50,
    target: "threat",
  },
  hold: {
    preset: "hold",
    engage: 1,
    pursue: 0,
    cover: 10,
    escort: 8,
    saveSkill: 8,
    spread: 7,
    retreatPct: 0,
    target: "nearest",
  },
};

/** [임시] 저장한 작전이 없는 플레이어 유닛의 프리셋(질문 2132) */
export const DEFAULT_PLAYER_PRESET: AiPreset = "balanced";

/**
 * [임시] NPC 성격(공격 성향 D-327, 0~1000) → 프리셋(D-5040 "프리셋은 데이터이고 NPC 성격과 연결한다", 질문 2133):
 * 700 이상 공격적, 450 이상 균형, 200 이상 방어적, 그 아래 숨어 버티기
 */
export const NPC_PRESET_FLOORS: readonly (readonly [number, AiPreset])[] = [
  [700, "aggressive"],
  [450, "balanced"],
  [200, "defensive"],
  [0, "hold"],
];

export const isAiPreset = (value: unknown): value is AiPreset =>
  typeof value === "string" && (AI_PRESETS as readonly string[]).includes(value);

export const isAiTarget = (value: unknown): value is AiTarget =>
  typeof value === "string" && (AI_TARGETS as readonly string[]).includes(value);

const sliderOk = (value: unknown): boolean =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= AI_SLIDER_MAX;

/** 모양·범위가 맞는 작전인가(정수 슬라이더 0~10, 퇴각 0~100, 프리셋·목표는 목록 안) */
export function isAiTactics(value: unknown): value is AiTactics {
  if (typeof value !== "object" || value === null) return false;
  if (!isAiPreset(Reflect.get(value, "preset")) || !isAiTarget(Reflect.get(value, "target"))) return false;
  const retreat: unknown = Reflect.get(value, "retreatPct");
  if (!Number.isInteger(retreat) || Number(retreat) < 0 || Number(retreat) > AI_RETREAT_MAX) return false;
  return AI_SLIDERS.every((key) => sliderOk(Reflect.get(value, key)));
}

/** 프리셋 출발값 */
export function presetTactics(preset: AiPreset): AiTactics {
  return AI_PRESET_VALUES[preset];
}

/** 값이 고른 프리셋 출발값 그대로인가(아니면 화면이 "고침"을 보인다) */
export function tacticsMatchPreset(tactics: AiTactics): boolean {
  const base = AI_PRESET_VALUES[tactics.preset];
  return (
    AI_SLIDERS.every((key) => base[key] === tactics[key]) &&
    base.retreatPct === tactics.retreatPct &&
    base.target === tactics.target
  );
}

/** NPC 공격 성향 → 프리셋(NPC_PRESET_FLOORS) */
export function npcPresetOf(aggression: number): AiPreset {
  for (const [floor, preset] of NPC_PRESET_FLOORS) if (aggression >= floor) return preset;
  return "hold";
}

/** 슬라이더 값 n의 행동 확률(‰, C40 n × 10%) */
export function sliderChancePm(value: number): number {
  return Math.min(AI_SLIDER_MAX, Math.max(0, Math.floor(value))) * AI_SLIDER_STEP_PM;
}
