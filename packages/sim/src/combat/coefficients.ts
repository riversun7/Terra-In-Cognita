// 전투 계수표 — docs/adr/2026-10-31-combat-core.md "공식 한 곳"
// 전투 수치를 이 표 하나에 모은다. 공식이 바뀌면 이 표와 formula.ts만 바꾼다(기획 Step 9의 스탯 가중치 표는 stats.ts·콘텐츠 팩).
// 시각은 모두 ms다(D-418: 0.2초 단위 제한 해제). 판정 틱(tickMs)마다 그 틱까지 된 행동을 처리한다(행동 시각은 ms로 들고 틱 경계에서 본다).
// 출발값: 기획 설정 칸(49 5장·6.5 N1~N33)에 있는 값은 그대로, 없는 값은 [임시]. 배율은 ‰, 확률 굴림은 0~9999.
// 정본은 기획 48(수치·공식)이다. 콘텐츠 팩 `tuning`(N 칸 값)이 있으면 실행 도구가 이 표를 그 값으로 바꾼다(tuning.ts).
// 게임 상한은 없다(D-421: 하드캡·속성 하한 거둠).

export interface CombatCoefficients {
  /** 판정 틱(ms). 기술 결정(ADR combat-core "틱"): 100ms */
  readonly tickMs: number;
  /** 같은 유닛 명령 다시 넣기 막는 시간(C5 "약 1초") */
  readonly commandLockMs: number;
  /** 제한 시간(C2: 일반 10분, 공성 30분 = 상한) */
  readonly limitMs: { readonly normal: number; readonly siege: number; readonly max: number };
  /** 퇴각 구역 폭(칸, C21)·머무는 시간(C23 출발값 없음 → 기술 0)·시작 줄(C22 3칸째) */
  readonly retreatBand: number;
  readonly retreatDwellMs: number;
  readonly entryRow: number;
  /** 스냅숏 간격(ADR 35 30초) */
  readonly snapshotMs: number;
  /** 이동 흐름장을 다시 세는 간격. 스냅숏 간격의 약수, 틱의 배수여야 한다 */
  readonly fieldMs: number;
  /**
   * 계열 상성 rate(C10·D-5013·D-459, ‰, 부호 포함): 유리·불리·같은 계열(내성). 어느 짝이 유리·불리인지는 AFFINITY_RELATION(구조 값)
   */
  readonly affinity: { readonly favorPm: number; readonly unfavorPm: number; readonly samePm: number };
  /** 높이 시야 보너스(C27 출발값 없음 → [임시]): min(heightCap, ⌊높이차 ÷ heightUnit⌋), 높이 단위 16배 cm */
  readonly sight: { readonly heightUnit: number; readonly heightCap: number };
  /** 수풀 속 적이 보이는 거리(칸, C24)·수풀에서 공격하면 드러나는 시간(C25 출발값 없음 → [임시]) */
  readonly bushSenseCells: number;
  readonly bushRevealMs: number;
  /** [임시] 패배 화물 탈취(C19 기존 "최대 50%", 만분율) */
  readonly lootBp: number;
  /** 적정 스탯 비율 상한(N10 구조 값, 2000‰) */
  readonly appropriateCapPm: number;
  /** 회피 상대 보정(N11): 유리 기울기·끝값, 불리 기울기·끝값(‰) */
  readonly evadeRelative: {
    readonly favorSlopePm: number;
    readonly favorCapPm: number;
    readonly unfavorSlopePm: number;
    readonly unfavorCapPm: number;
  };
  /** 크리 배율 범위 폭(N12: 최대 − 최소 = 2000 − 1500 = 500‰) */
  readonly critSpreadPm: number;
  /**
   * 스태미나 소모(N13, 48 §4.1): STA 점수 = 1차 가중합(AGI 700·VIT 300‰), 소모 = 기본 × max(최소 소모‰, 적정 × 1000 ÷ 점수) ÷ 1000.
   * 회복은 2차 스탯 "스태미나 회복"(D-458, 가중치 표 행 stamina_regen, 분당)이다. MP 회복·쉴드 재생도 같다(mp_regen·shield_regen)
   */
  readonly stamina: {
    readonly scoreWeightsPm: readonly number[];
    readonly appropriateScore: number;
    readonly minConsumePm: number;
  };
}

/**
 * 계열 상성 관계(50_Content_Rules §2.1, 구조 값): [공격 계열][방어 계열] = 1 유리, −1 불리, 0 보통. 대각(같은 계열)은 samePm.
 * 4원소 순환 물 > 불 > 바람 > 땅 > 물, 큰 고리 어둠 > 4원소 > 빛 > 어둠
 */
export const AFFINITY_RELATION: readonly (readonly (-1 | 0 | 1)[])[] = [
  [0, 1, 0, -1, 1, -1],
  [-1, 0, 1, 0, 1, -1],
  [0, -1, 0, 1, 1, -1],
  [1, 0, -1, 0, 1, -1],
  [-1, -1, -1, -1, 0, 1],
  [1, 1, 1, 1, -1, 0],
];

/** 계열 상성 rate(‰): 같은 계열이면 samePm, 아니면 관계에 따라 유리·불리·0 */
export function affinityRatePm(attackFamily: number, defenseFamily: number, c: CombatCoefficients): number {
  if (attackFamily === defenseFamily) return c.affinity.samePm;
  const relation = AFFINITY_RELATION[attackFamily]?.[defenseFamily] ?? 0;
  return relation > 0 ? c.affinity.favorPm : relation < 0 ? c.affinity.unfavorPm : 0;
}

export const TEST_COMBAT_COEFFICIENTS: CombatCoefficients = {
  tickMs: 100,
  commandLockMs: 1_000,
  limitMs: { normal: 600_000, siege: 1_800_000, max: 1_800_000 },
  retreatBand: 2,
  retreatDwellMs: 0,
  entryRow: 3,
  snapshotMs: 30_000,
  fieldMs: 500,
  // C10: 유리 +50, 불리 −50, 같은 계열 −30(내성, D-459. D-5013의 −20을 바꿈)
  affinity: { favorPm: 50, unfavorPm: -50, samePm: -30 },
  sight: { heightUnit: 4_800, heightCap: 4 },
  bushSenseCells: 1,
  bushRevealMs: 2_000,
  lootBp: 5_000,
  appropriateCapPm: 2_000,
  evadeRelative: { favorSlopePm: 300, favorCapPm: 400, unfavorSlopePm: 400, unfavorCapPm: 300 },
  critSpreadPm: 500,
  stamina: {
    scoreWeightsPm: [0, 0, 700, 300, 0, 0],
    appropriateScore: 80,
    minConsumePm: 500,
  },
};

/** STA 점수(N13) = Σ 1차 × 가중치‰ ÷ 1000 */
export function staminaScore(primaries: readonly number[], c: CombatCoefficients): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += (primaries[i] ?? 0) * (c.stamina.scoreWeightsPm[i] ?? 0);
  return Math.floor(sum / 1000);
}

/** 행동 한 번의 스태미나 소모(밀리점, N13): 기본 × max(최소 소모, 적정 ÷ 점수) */
export function staminaCostMilli(baseCost: number, score: number, c: CombatCoefficients): number {
  const factor =
    score <= 0
      ? c.stamina.appropriateScore * 1000
      : Math.max(c.stamina.minConsumePm, Math.floor((c.stamina.appropriateScore * 1000) / score));
  return baseCost * factor;
}

const MINUTE_MS = 60_000;
const SAFE = Number.MAX_SAFE_INTEGER;

/**
 * 분당 회복(2차 스탯 스태미나 회복·MP 회복·쉴드 재생, D-458)을 틱 tick(0부터)에 나눠 준 몫(scale배 단위, 예: 밀리점이면 1000).
 * 틱 0..t의 합 = ⌊분당 × scale × (t + 1) × tickMs ÷ 60,000⌋ 이라 몫을 모으면 버림 손실이 없다(남은 값을 상태로 들지 않는다).
 * 음수는 0. 큰 값은 BigInt로 센다(결과는 안전 정수에서 자른다)
 */
export function regenOnTick(perMinute: number, tick: number, scale: number, c: CombatCoefficients): number {
  if (perMinute <= 0 || tick < 0) return 0;
  const product = perMinute * scale * c.tickMs * (tick + 1);
  if (Number.isSafeInteger(product))
    return Math.floor(product / MINUTE_MS) - Math.floor((perMinute * scale * c.tickMs * tick) / MINUTE_MS);
  const unit = BigInt(Math.trunc(perMinute)) * BigInt(Math.trunc(scale)) * BigInt(c.tickMs);
  const minute = BigInt(MINUTE_MS);
  const share = (unit * BigInt(tick + 1)) / minute - (unit * BigInt(tick)) / minute;
  return share > BigInt(SAFE) ? SAFE : Number(share);
}

/** ms → 틱(올림: 그 시각이 된 첫 틱 경계) */
export function msToTicks(ms: number, c: CombatCoefficients): number {
  return Math.ceil(ms / c.tickMs);
}
