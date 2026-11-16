// 이동 부품 자료 모양 — 팩 스킬 칸 move(자기 몸)·displace(맞은 대상). docs/adr/2026-11-15-combat-moves.md 2절.
// 칸 단위 정수만. 판정은 moves.ts, 스킬에 싣는 것은 skills.ts skillFromData.
import type { EffectDef } from "./effects.ts";

/** 자기 몸을 옮기는 부품(목표 = 적, 방향 기준) */
export type SkillMotionMove =
  /** 돌진: 목표 쪽 곧은 줄로 cells칸까지, 막히면 멈춤. 끝에서 목표가 hitRange 안이면 스킬이 붙는다 */
  | { readonly kind: "dash"; readonly cells: number; readonly hitRange?: number | undefined }
  /** 도약: 길을 보지 않고(건물은 넘지 않음) cells칸 안에서 목표에 가장 가까운 빈 칸에 내린다 */
  | { readonly kind: "leap"; readonly cells: number }
  /** 점멸: 자기 시야·시선 안 cells칸 안의 빈 칸으로 순간이동. toward = 목표에 가장 가까이, away = 가장 멀리 */
  | { readonly kind: "blink"; readonly cells: number; readonly dir: "toward" | "away" }
  /** 뒷걸음: 목표 반대쪽 곧은 줄로 cells칸까지, 막히면 멈춤 */
  | { readonly kind: "backstep"; readonly cells: number };

/** 자기에게 거는 부품(대상 = 자기) */
export type SkillSelfMove =
  /** 은신: durationMs 동안 적 편 시야에 들지 않는다. 공격·들킴으로 깨진다 */
  | { readonly kind: "stealth"; readonly durationMs: number }
  /** 감지: durationMs 동안 감지 반지름 = max(기본, cells) */
  | { readonly kind: "detect"; readonly cells: number; readonly durationMs: number };

export type SkillMove = SkillMotionMove | SkillSelfMove;

/**
 * 맞은(명중) 대상마다 거는 부품. effect = 밀림 저항(D-429 모양 resist)을 읽는 효과 사전 항목 ID(질문 1806 답). 없으면 종류마다
 * 기본 항목(DISPLACE_EFFECT_IDS). 항목은 같은 종류의 상태이상이어야 한다(밀치기 = status knockback, 끌어오기 = pull, 묶기 = root)
 */
export type SkillDisplace =
  /** 밀치기: 시전자 반대쪽 곧은 줄로 cells칸까지, 막히면 멈춤 */
  (
    | { readonly kind: "knockback"; readonly cells: number }
    /** 끌어오기: 시전자 쪽으로 cells칸까지, 시전자 옆 칸에서 멈춤 */
    | { readonly kind: "pull"; readonly cells: number }
    /** 묶기: durationMs 동안 상태이상 묶임(효과 사전 항목, 없으면 판정 기본 move_root) */
    | { readonly kind: "root"; readonly durationMs: number }
  ) & { readonly effect?: string | undefined };

/** 대상 옮김 종류마다 기본 효과 사전 항목(팩 effects, 밀림 상태이상) */
export const DISPLACE_EFFECT_IDS: Readonly<Record<SkillDisplace["kind"], string>> = {
  knockback: "move_knockback",
  pull: "move_pull",
  root: "move_root",
};

/** 밀림 저항 칸(D-429 모양, D-570 "스탯 기여도는 VIT"): 팩 core@118 move_knockback·move_pull과 같은 값 */
const VIT_RESIST = { cap: 600, halfConstant: 100, weights: [0, 0, 0, 1000, 0, 0] } as const;

/**
 * 밀림 상태이상 항목(시험 계열표, 팩 효과 사전 move_knockback·move_pull·move_root와 같은 값 — 서버 시험이 맞춰 본다).
 * 묶기 항목은 저항 칸이 없다(D-570: 밀림 저항은 거리만 줄인다)
 */
export const DISPLACE_EFFECTS: readonly EffectDef[] = [
  {
    id: "move_knockback",
    durationMs: 0,
    kind: "status",
    status: "knockback",
    valueMode: "flat",
    tickMs: 0,
    stacking: "refresh",
    maxStacks: 1,
    resist: VIT_RESIST,
  },
  {
    id: "move_pull",
    durationMs: 0,
    kind: "status",
    status: "pull",
    valueMode: "flat",
    tickMs: 0,
    stacking: "refresh",
    maxStacks: 1,
    resist: VIT_RESIST,
  },
  {
    id: "move_root",
    durationMs: 2000,
    kind: "status",
    status: "root",
    valueMode: "flat",
    tickMs: 0,
    stacking: "refresh",
    maxStacks: 1,
  },
];

/**
 * 전투용 스킬에 실린 대상 옮김 부품: 효과 사전 항목을 찾았으면 def(저항 = def.resist, 묶기는 이 효과를 건다). def가 없으면(항목을 싣기 전
 * 시작 자료·항목 없음) 계수표의 옛 STR·VIT 저항(curves.ts displaceResistPm)으로 셈한다 → 진행 중 전투가 옛 결과 그대로 이어진다
 */
export type CombatDisplace = SkillDisplace & { readonly def?: EffectDef | undefined };

/** 리플레이 움직임 사건 종류(자기 이동 넷 + 대상 옮김 둘) */
export type MotionKind = SkillMotionMove["kind"] | "knockback" | "pull";

export const MOTION_MOVE_KINDS: readonly SkillMotionMove["kind"][] = ["dash", "leap", "blink", "backstep"];

/** 자기 몸을 옮기는 부품인가(목표가 적이어야 한다) */
export function isMotionMove(move: SkillMove): move is SkillMotionMove {
  return move.kind === "dash" || move.kind === "leap" || move.kind === "blink" || move.kind === "backstep";
}

/** 은신을 깨는 까닭(리플레이 stealth 사건) */
export type StealthCause = "skill" | "attack" | "detected" | "expired";
