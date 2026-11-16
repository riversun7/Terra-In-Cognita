// 전투 계수 곡선 — docs/adr/2026-11-15-combat-moves.md 3절. 판정·스킬 생성기(3단계)·밸런스 화면이 같은 함수를 쓴다.
// 모두 ‰ 정수(버림)다. 값은 설정 칸(`moves.*`, tuningMoves.ts) [임시]이고 기획 결정 번호가 붙으면 바꾼다(질문 1589~1595).
// 곡선은 스킬이 고른 것만 걸린다(스킬 칸 curves·shots). 사거리 예산(range_interval)만 칸이 없을 때 기본으로 켠다 — 무기(unitSpec.ts
// DEFAULT_WEAPON_CURVES)와 공격 스킬(skills.ts DEFAULT_ATTACK_SKILL_CURVES), D-573 2009.

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
  /** 사거리 ↔ 공격 간격 예산(물리·속성 가리지 않음, D-573): 사거리 1을 넘는 칸마다 간격 + perCellPm, 위 끝 maxPm */
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
  /**
   * 밀치기 부딪힘 피해(D-564 1587, D-570 1801 "밀어낸 공격 피해의 10~20%"·1803): 밀려 가다 벽(못 지나가는 칸)에 막히면 밀린 대상이
   * 밀어낸 한 방 피해 × wallPm, 건물에 막히면 밀린 대상과 그 건물(시전자 편 건물 빼고)이 × wallPm, 다른 유닛에 막히면 밀린 대상과 막은
   * 유닛(시전자 편이 아니면 누구나 — 중립 포함)이 × unitPm을 받는다(유닛은 방어를 거치지 않고 체력에서, 건물은 내구도에서)
   */
  readonly knockback: { readonly wallPm: number; readonly unitPm: number };
  /**
   * 몸 크기가 밀리는 거리에 곱하는 배율(‰, D-570 "크기 M을 기준으로 S는 더 강하게, L은 더 적게, XL은 훨씬 적게"). M = 1000(칸 없음)
   */
  readonly size: { readonly smallPm: number; readonly largePm: number; readonly hugePm: number };
  /** 보스 등급(boss 이상)이 더하는 밀림 저항(‰, D-564 1588·1807 "보스는 덜 밀림") */
  readonly body: { readonly bossPm: number };
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
  knockback: { wallPm: 200, unitPm: 150 },
  size: { smallPm: 1500, largePm: 600, hugePm: 300 },
  body: { bossPm: 300 },
};

/** 계수표에 moves가 없으면(옛 계수표) 출발값 */
export function moveCoefficientsOf(c: { readonly moves?: MoveCoefficients | undefined }): MoveCoefficients {
  return c.moves ?? DEFAULT_MOVE_COEFFICIENTS;
}

/** 사거리 ↔ 공격 간격 예산(‰, 무기·공격 스킬, D-573): min(maxPm, 1000 + max(0, 사거리 − 1) × perCellPm), 아래 끝 1000 */
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

/** 몸 크기(크리쳐 D-5023). 사람형은 M */
export type BodySize = "S" | "M" | "L" | "XL";

/** 보스 몸 저항(‰, D-564 1588·1807): 보스 등급(boss 이상)이면 bossPm, 아니면 0 */
export function bodyDisplaceResistPm(boss: boolean, m: MoveCoefficients): number {
  return boss ? Math.max(0, Math.min(1000, m.body.bossPm)) : 0;
}

/** 몸 크기 거리 배율(‰, D-570): S·L·XL은 설정 칸, M(과 크기 없음)은 1000 */
export function bodyDisplaceSizePm(size: BodySize | undefined, m: MoveCoefficients): number {
  const pm =
    size === "S" ? m.size.smallPm : size === "L" ? m.size.largePm : size === "XL" ? m.size.hugePm : 1000;
  return Math.max(0, pm);
}

/**
 * 밀림 상태이상 항목이 없을 때(항목을 싣기 전 시작 자료·항목 없는 계열표)의 저항 칸. 팩 core@115 move_knockback·move_pull과 같은 값
 * (D-570 "스탯 기여도는 VIT", D-429 모양)
 */
export const DEFAULT_DISPLACE_RESIST: {
  readonly cap: number;
  readonly halfConstant: number;
  readonly weights: readonly number[];
} = { cap: 600, halfConstant: 100, weights: [0, 0, 0, 1000, 0, 0] };

/**
 * 밀리는 칸 수(D-570 "넉백 저항은 거리만 줄임"): ⌊칸 × 크기 배율 × (1000 − 저항) ÷ 1000000⌋. 저항 = 스탯 몫(효과 사전 밀림 상태이상
 * 항목의 resist) + 보스 몸 저항, 0~1000에서 자른다.
 * 기획 D-572(질문 2005 — D-570 "xl 훨씬 적게"는 0칸이 아니라 적어도 1칸): 원래 칸이 1 이상이면 적어도 1칸 민다. 다만 저항이 1000(완전히
 * 버팀 — 데이터가 정한 면역, 효과 사전 항목 상한)이거나 크기 배율이 0이면 밀리지 않는다. 보스 몫으로는 1000이 되지 않는다(moves.ts
 * unitDisplaceResistPm — 질문 2121 답: 보스도 덜 밀릴 뿐 0칸이 아니다)
 */
export function displacedCells(cells: number, sizePm: number, resistPm: number): number {
  const resist = Math.max(0, Math.min(1000, resistPm));
  const base = Math.max(0, Math.trunc(cells));
  const size = Math.max(0, sizePm);
  if (base === 0 || size === 0 || resist >= 1000) return 0;
  return Math.max(1, Math.floor((base * size * (1000 - resist)) / 1_000_000));
}

/** 배율 곱(버림): value × pm ÷ 1000 */
export function scalePm(value: number, pm: number): number {
  return Math.floor((value * pm) / 1000);
}
