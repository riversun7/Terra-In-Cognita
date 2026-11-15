// 전투 계수 곡선 — docs/adr/2026-11-15-combat-moves.md 3절. 판정·스킬 생성기(3단계)·밸런스 화면이 같은 함수를 쓴다.
// 모두 ‰ 정수(버림)다. 값은 설정 칸(`moves.*`, tuningMoves.ts) [임시]이고 기획 결정 번호가 붙으면 바꾼다(질문 1589~1595).
// 곡선은 스킬이 고른 것만 걸린다(스킬 칸 curves·shots). 고르지 않은 스킬·기본 공격은 옛 판정 그대로다.

/** 스킬이 고르는 곡선 이름(팩 스킬 칸 curves) */
export const SKILL_CURVES = [
  "range_interval",
  "magic_distance",
  "magic_targets",
  "dot_total",
  "close_shot",
] as const;
export type SkillCurve = (typeof SKILL_CURVES)[number];

/** 움직임·곡선 설정 칸(계수표 moves). 모두 [임시] */
export interface MoveCoefficients {
  /**
   * 달리기: 한 칸 가는 시간 배율(‰, 작을수록 빠름)·초당 기본 스태미나 소모(STA 배율 N13을 거친다)·지쳐 꺼진 뒤 다시 켜려면 있어야 할
   * 스태미나(초당 소모 × 초)
   */
  readonly run: { readonly intervalPm: number; readonly staminaPerSec: number; readonly resumeSec: number };
  /** 은신을 들키는 기본 감지 반지름(칸, 체비쇼프 + 시선) */
  readonly detectCells: number;
  /** 물리 사거리 ↔ 공격 간격 예산: 사거리 1을 넘는 칸마다 간격 + perCellPm, 위 끝 maxPm */
  readonly rangeInterval: { readonly perCellPm: number; readonly maxPm: number };
  /** 마법 거리: 거리 1에서 nearPm, 칸마다 − slopePm, 아래 끝 minPm */
  readonly magicDistance: { readonly nearPm: number; readonly slopePm: number; readonly minPm: number };
  /** 마법 대상 수: 하나면 1000, 둘부터 areaPm − (n − 2) × stepPm, 아래 끝 minPm */
  readonly magicTargets: { readonly areaPm: number; readonly stepPm: number; readonly minPm: number };
  /** 지속 피해 합: 무료 freeMs를 넘는 초마다 − stepPm, 아래 끝 minPm(지속 0 = 전투 내내 = minPm) */
  readonly dotTotal: { readonly freeMs: number; readonly stepPm: number; readonly minPm: number };
  /** 연사: 한 발 = 1000 − (발 수 − 1) × stepPm, 아래 끝 minPm */
  readonly multishot: { readonly stepPm: number; readonly minPm: number };
  /** 가까이 쏘기: 사거리 2 이상 스킬이 거리 ≤ cells인 대상에 + bonusPm */
  readonly closeShot: { readonly cells: number; readonly bonusPm: number };
}

/** [임시] 출발값(ADR 3절 표). 팩 tuning `moves_*`가 같은 값이다 */
export const DEFAULT_MOVE_COEFFICIENTS: MoveCoefficients = {
  run: { intervalPm: 600, staminaPerSec: 15, resumeSec: 3 },
  detectCells: 1,
  rangeInterval: { perCellPm: 100, maxPm: 2500 },
  magicDistance: { nearPm: 1200, slopePm: 50, minPm: 800 },
  magicTargets: { areaPm: 550, stepPm: 25, minPm: 300 },
  dotTotal: { freeMs: 3000, stepPm: 50, minPm: 500 },
  multishot: { stepPm: 150, minPm: 300 },
  closeShot: { cells: 2, bonusPm: 200 },
};

/** 계수표에 moves가 없으면(옛 계수표) 출발값 */
export function moveCoefficientsOf(c: { readonly moves?: MoveCoefficients | undefined }): MoveCoefficients {
  return c.moves ?? DEFAULT_MOVE_COEFFICIENTS;
}

/** 물리 사거리 ↔ 공격 간격 예산(‰): min(maxPm, 1000 + max(0, 사거리 − 1) × perCellPm), 아래 끝 1000 */
export function rangeIntervalPm(range: number, m: MoveCoefficients): number {
  const extra = Math.max(0, Math.trunc(range) - 1) * m.rangeInterval.perCellPm;
  return Math.max(1000, Math.min(m.rangeInterval.maxPm, 1000 + extra));
}

/** 마법 거리 배율(‰): max(minPm, nearPm − max(0, 거리 − 1) × slopePm) */
export function magicDistancePm(distance: number, m: MoveCoefficients): number {
  const d = m.magicDistance;
  return Math.max(d.minPm, d.nearPm - Math.max(0, Math.trunc(distance) - 1) * d.slopePm);
}

/** 마법 대상 수 배율(‰): 대상 하나 이하면 1000, 둘부터 max(minPm, areaPm − (n − 2) × stepPm) */
export function magicTargetsPm(targets: number, m: MoveCoefficients): number {
  if (targets <= 1) return 1000;
  const t = m.magicTargets;
  return Math.max(t.minPm, t.areaPm - (Math.trunc(targets) - 2) * t.stepPm);
}

/** 지속 피해 합 배율(‰): 지속 0(전투 내내)은 minPm, 그 밖은 max(minPm, 1000 − ⌊(지속 − freeMs) ÷ 1000⌋ × stepPm) */
export function dotTotalPm(durationMs: number, m: MoveCoefficients): number {
  const d = m.dotTotal;
  if (durationMs <= 0) return d.minPm;
  const overSec = Math.floor(Math.max(0, durationMs - d.freeMs) / 1000);
  return Math.max(d.minPm, Math.min(1000, 1000 - overSec * d.stepPm));
}

/** 연사 한 발 배율(‰): max(minPm, 1000 − (발 수 − 1) × stepPm). 한 발이면 1000 */
export function multishotPm(shots: number, m: MoveCoefficients): number {
  if (shots <= 1) return 1000;
  return Math.max(m.multishot.minPm, 1000 - (Math.trunc(shots) - 1) * m.multishot.stepPm);
}

/** 가까이 쏘기 배율(‰): 사거리 2 이상이고 거리 ≤ cells면 1000 + bonusPm, 아니면 1000 */
export function closeShotPm(skillRange: number, distance: number, m: MoveCoefficients): number {
  return skillRange >= 2 && distance <= m.closeShot.cells ? 1000 + m.closeShot.bonusPm : 1000;
}

/** 배율 곱(버림): value × pm ÷ 1000 */
export function scalePm(value: number, pm: number): number {
  return Math.floor((value * pm) / 1000);
}
