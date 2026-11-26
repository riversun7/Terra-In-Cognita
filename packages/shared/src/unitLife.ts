// 유닛 생활 규칙(쉬러 가는 때) — 사용자 결정 2026-11-26("120 다 채우고 휴식으로 가는게 아니다 … 패널티 고려해서 자율적인 판단", 물음 답 "유닛 성향,
// 주인유저가 규칙 설정 가능. 유닛페이지에서 … 설정가능하게"), docs/adr/2026-11-26-unit-life-rules.md.
// - restAt: 일하다 피로가 이 값에 닿으면 쉬러 간다. resumeAt: 쉬다 피로가 이 값까지 풀리면 다시 일한다.
// - 주인이 유닛마다 정한다(유닛 화면 [생활 규칙], 프로토콜 unit_life). 정하지 않은 유닛은 성향 기본값: 첫 불이익 구간 시작(피로 스탯 감소가 걸리는
//   피로)에서 규율 성향만큼 앞뒤로 — 규율이 높으면 더 버티고 낮으면 일찍 쉰다.
// - 포만감(음식 섭취) 규칙은 플레이어 유닛에 포만감 값이 서버에 생기면 여기에 칸을 더한다(지금은 없다).
// @terra/shared 최하층 순수 모듈(다른 내부 패키지 import 없음, erasableSyntaxOnly, 정수만).

/** 유닛 하나의 생활 규칙 */
export interface UnitLifeRules {
  /** 쉬러 가는 피로(1 ~ 피로 상한) */
  readonly restAt: number;
  /** 다시 일하는 피로(0 ~ restAt − 1) */
  readonly resumeAt: number;
}

/** 피로 상한의 구조 값(49 N21 — 프로토콜 범위가 이것을 쓴다. 실효 상한은 설정 칸) */
export const LIFE_FATIGUE_LIMIT = 120;
/** 규율 성향이 기본 쉬는 때를 옮기는 폭(점, 양쪽으로) [임시] */
export const LIFE_TEMPER_SPREAD = 20;
/** 성향 축 가운데·끝(@terra/shared/unitTraits UNIT_TRAIT_MID·MAX와 같다) */
const TRAIT_MID = 500;
const TRAIT_MAX = 1000;

/** 규칙 모양이 맞는가(정수, 1 ≤ restAt ≤ fatigueMax, 0 ≤ resumeAt < restAt) */
export function isUnitLifeRules(
  value: unknown,
  fatigueMax: number = LIFE_FATIGUE_LIMIT,
): value is UnitLifeRules {
  if (typeof value !== "object" || value === null) return false;
  const restAt: unknown = Reflect.get(value, "restAt");
  const resumeAt: unknown = Reflect.get(value, "resumeAt");
  return (
    typeof restAt === "number" &&
    typeof resumeAt === "number" &&
    Number.isInteger(restAt) &&
    Number.isInteger(resumeAt) &&
    restAt >= 1 &&
    restAt <= fatigueMax &&
    resumeAt >= 0 &&
    resumeAt < restAt
  );
}

/**
 * 성향 기본값: 쉬러 가는 피로 = 첫 불이익 구간 시작(penaltyFrom) + (규율 − 가운데) × 폭 ÷ 가운데(내림 쪽 정수), 1 ~ 피로 상한으로 자른다.
 * 규율을 모르면(성향 없는 유닛) 구간 시작 그대로. 다시 일하는 피로 = 0(다 풀고 온다)
 */
export function defaultLifeRules(input: {
  readonly penaltyFrom: number;
  readonly fatigueMax: number;
  /** 규율 성향(0 ~ 1000, 없으면 가운데) */
  readonly discipline?: number | undefined;
}): UnitLifeRules {
  const max = Math.max(1, Math.trunc(input.fatigueMax));
  const raw = input.discipline;
  const discipline =
    raw === undefined || !Number.isFinite(raw)
      ? TRAIT_MID
      : Math.min(TRAIT_MAX, Math.max(0, Math.trunc(raw)));
  const shift = Math.trunc(((discipline - TRAIT_MID) * LIFE_TEMPER_SPREAD) / TRAIT_MID);
  const restAt = Math.min(max, Math.max(1, Math.trunc(input.penaltyFrom) + shift));
  return { restAt, resumeAt: 0 };
}

/** 실효 상한에 맞게 자른 규칙(설정 칸 상한이 줄었을 때 — restAt ≤ 상한, resumeAt < restAt) */
export function clampLifeRules(rules: UnitLifeRules, fatigueMax: number): UnitLifeRules {
  const restAt = Math.min(Math.max(1, Math.trunc(fatigueMax)), Math.max(1, Math.trunc(rules.restAt)));
  const resumeAt = Math.min(restAt - 1, Math.max(0, Math.trunc(rules.resumeAt)));
  return { restAt, resumeAt };
}
