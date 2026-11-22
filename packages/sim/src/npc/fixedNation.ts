// 기본(시작) NPC 국가를 강하게 — 사용자 결정 D-593(2026-11-22, 기획 커밋 38b81e3, 질문 2621 원문 "스타트 npc국가는 함락되지 않게 강하게 설정할것이다 주변 도시도
// 강하고 뺏겨도 되찾을만큼 강하다"). 수치는 기술 출발값(설정 칸 — 팩 tuning "npc.fixed*"), 모양은 있던 규칙을 키우는 것만 [임시 — 질문 2711·2712].
// - 고정 국가(SimFaction.fixed — 기본 NPC 국가)만 바뀐다. 반란·마을·쿠데타로 생긴 세력, 플레이어 가문은 그대로.
// 1. 경비대(도시 방어): 도시마다 경비대 목표 = 등급 값 × fixedGuardPm ÷ 1000(내림). 구인 규칙식(policy.ts recruitPicks)이 그 수까지 다시 채운다(시작 도시·둘레 도시 모두 —
//    등급 값은 그 나라 모든 도시에 걸린다). 국방 투자 상한(invest.ts)도 이 목표 위에 선다.
// 2. 방어 억지: 다른 세력이 고정 국가를 볼 때(rivalView) 힘을 fixedDefensePm ÷ 1000배로 본다 — 공격 힘 비(attackRatioPm)를 넘기 어렵고, 강화 판단도 그 힘으로 본다.
//    내가 잃은 도시를 되찾으러 칠 때(아래 3)는 키우지 않는다(되찾기는 막지 않는다).
// 3. 되찾기: 고정 국가가 잃은 도시(그 도시를 가진 세력이 점령해 가져간 기록 — SimOccupation.owner = 나)가 있는 상대를 칠 때 점수 + fixedRetakeBonus, 칠 도시는 그 도시 먼저.
//    점령 기록이 끝나면(재건 기간 뒤) 잊는다 [임시 — 질문 2712]. 반란으로 떨어져 나간 세력은 원래 소탕 점수(suppressBonus)가 있다.
// 4. 반란: 고정 국가 도시의 반란 문턱(만족도)을 fixedRebellionEase만큼 낮춘다(신임도 보정과 같은 자리 — society.ts).
// 계수가 없으면(옛 계수표·시험) 바뀌지 않는다.
import type { NpcCoefficients } from "./coefficients.ts";

/** 고정 국가 계수 몫 */
export type FixedNationCoefficients = Pick<
  NpcCoefficients,
  "fixedGuardPm" | "fixedDefensePm" | "fixedRetakeBonus" | "fixedRebellionEase"
>;

const pm = (value: number | undefined): number => Math.max(0, Math.trunc(value ?? 1000));

/** 도시마다 경비대 목표(등급 값 × 배율 — 고정 국가만) */
export function fixedGuardTarget(base: number, fixed: boolean, c: FixedNationCoefficients): number {
  if (!fixed || base <= 0) return base;
  return Math.trunc((base * pm(c.fixedGuardPm)) / 1000);
}

/** 다른 세력이 보는 고정 국가의 힘(방어 억지 — 되찾기면 그대로) */
export function fixedDefenseStrength(
  strength: number,
  fixed: boolean,
  retake: boolean,
  c: FixedNationCoefficients,
): number {
  if (!fixed || retake) return strength;
  return Math.trunc((strength * pm(c.fixedDefensePm)) / 1000);
}

/** 되찾기 치기 점수 몫(0 이상) */
export function fixedRetakeBonus(retake: number, c: FixedNationCoefficients): number {
  return retake > 0 ? Math.max(0, Math.trunc(c.fixedRetakeBonus ?? 0)) : 0;
}

/** 반란 문턱 보정(고정 국가는 낮춘다 — 음수) */
export function fixedRebellionShift(fixed: boolean, c: FixedNationCoefficients): number {
  return fixed ? -Math.max(0, Math.trunc(c.fixedRebellionEase ?? 0)) : 0;
}
