// 이동 부품 자료 모양 — 팩 스킬 칸 move(자기 몸)·displace(맞은 대상). docs/adr/2026-11-15-combat-moves.md 2절.
// 칸 단위 정수만. 판정은 moves.ts, 스킬에 싣는 것은 skills.ts skillFromData.

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

/** 맞은(명중) 대상마다 거는 부품 */
export type SkillDisplace =
  /** 밀치기: 시전자 반대쪽 곧은 줄로 cells칸까지, 막히면 멈춤 */
  | { readonly kind: "knockback"; readonly cells: number }
  /** 끌어오기: 시전자 쪽으로 cells칸까지, 시전자 옆 칸에서 멈춤 */
  | { readonly kind: "pull"; readonly cells: number }
  /** 묶기: durationMs 동안 상태이상 묶임(효과 ID move_root) */
  | { readonly kind: "root"; readonly durationMs: number };

/** 리플레이 움직임 사건 종류(자기 이동 넷 + 대상 옮김 둘) */
export type MotionKind = SkillMotionMove["kind"] | "knockback" | "pull";

export const MOTION_MOVE_KINDS: readonly SkillMotionMove["kind"][] = ["dash", "leap", "blink", "backstep"];

/** 자기 몸을 옮기는 부품인가(목표가 적이어야 한다) */
export function isMotionMove(move: SkillMove): move is SkillMotionMove {
  return move.kind === "dash" || move.kind === "leap" || move.kind === "blink" || move.kind === "backstep";
}

/** 은신을 깨는 까닭(리플레이 stealth 사건) */
export type StealthCause = "skill" | "attack" | "detected" | "expired";
