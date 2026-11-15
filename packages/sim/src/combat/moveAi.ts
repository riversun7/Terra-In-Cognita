// 움직임 AI 고리 — docs/adr/2026-11-15-combat-moves.md 6절. 사용자 답 2: 돌진·회피·은신은 작전 슬라이더(D-5039·D-5040)대로 AI가 정한다.
// 1단계(판정 토대)는 고리 자리와 지금 기본값만 둔다. 4단계(AI 슬라이더 통합, 뒤 작업 WP-4)가 몸통을 바꾼다:
// - wantsRun: ② 추격·⑦ 퇴각·① 교전과 남은 스태미나로 달릴지
// - moveSkillAllowed: 돌진 = ① 교전, 회피(뒷걸음·점멸 away) = HP·위협, 은신 = ③ 엄폐·은신, ⑤ 스킬 아끼기 — 기회마다 시드 굴림 한 번
// 고리는 판정 안에서 불리므로 상태·시드에서만 값을 낸다(바깥 함수를 받지 않는다 — 결정성).
import type { UnitState } from "./battleTypes.ts";

/** 이 유닛이 지금 달리고 싶은가. 지금 = 대기 명령(이동·공격)의 run 칸 */
export function wantsRun(unit: UnitState): boolean {
  const command = unit.command;
  return (command?.kind === "move" || command?.kind === "attack") && command.run === true;
}

/**
 * 이 이동 부품 스킬을 지금 써도 되나(목록 차례 고르기 pickSkill이 부른다). 지금 = 늘 참(다른 스킬처럼 목록 차례·조건·사거리로만).
 * unit·skill·enemy·nowMs는 4단계가 슬라이더 판단에 쓴다
 */
export function moveSkillAllowed(
  _unit: UnitState,
  _skill: { readonly id: string },
  _enemy: UnitState,
  _nowMs: number,
): boolean {
  return true;
}

/** 맞으면 은신이 깨지나(질문 1583 — 추천 거짓: 공격·들킴으로만 깨진다, 범위 스킬은 보이지 않아도 맞는다 D-227) */
export const STEALTH_BREAKS_ON_DAMAGE = false;
