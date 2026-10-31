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
  /** 계열 상성 rate(C10·D-5013, ‰): [공격 계열][방어 계열], 계열 = 물·불·바람·땅·빛·어둠 */
  readonly affinityPm: readonly (readonly number[])[];
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
   * 스태미나(N13, 48 §4.1): STA 점수 = 1차 가중합(AGI 700·VIT 300‰), 소모 = 기본 × max(최소 소모‰, 적정 × 1000 ÷ 점수) ÷ 1000,
   * 초당 회복 = 기본 회복 × min(회복 배수 상한, 점수 ÷ 적정)
   */
  readonly stamina: {
    readonly scoreWeightsPm: readonly number[];
    readonly appropriateScore: number;
    readonly minConsumePm: number;
    readonly regenPerSec: number;
    readonly regenCapPm: number;
  };
  /** [임시] MP 회복(N15 출발값 없음, D-438 3 WIS 비례): WIS 1점당 초당 밀리점 */
  readonly mpRegenMilliPerWisPerSec: number;
}

/** 계열 상성표(D-5013, 50_Content_Rules 2.1): 유리 +50, 불리 −50, 같은 계열 −20 */
const AFFINITY = [
  [-20, 50, 0, -50, 50, -50],
  [-50, -20, 50, 0, 50, -50],
  [0, -50, -20, 50, 50, -50],
  [50, 0, -50, -20, 50, -50],
  [-50, -50, -50, -50, -20, 50],
  [50, 50, 50, 50, -50, -20],
];

export const TEST_COMBAT_COEFFICIENTS: CombatCoefficients = {
  tickMs: 100,
  commandLockMs: 1_000,
  limitMs: { normal: 600_000, siege: 1_800_000, max: 1_800_000 },
  retreatBand: 2,
  retreatDwellMs: 0,
  entryRow: 3,
  snapshotMs: 30_000,
  fieldMs: 500,
  affinityPm: AFFINITY,
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
    regenPerSec: 3,
    regenCapPm: 2_000,
  },
  mpRegenMilliPerWisPerSec: 50,
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

/** 틱 하나의 스태미나 회복(밀리점, N13): 기본 회복/초 × min(상한, 점수 ÷ 적정) */
export function staminaRegenMilli(score: number, c: CombatCoefficients): number {
  const ratio = Math.min(
    c.stamina.regenCapPm,
    Math.floor((Math.max(0, score) * 1000) / c.stamina.appropriateScore),
  );
  return Math.floor((c.stamina.regenPerSec * ratio * c.tickMs) / 1000);
}

/** ms → 틱(올림: 그 시각이 된 첫 틱 경계) */
export function msToTicks(ms: number, c: CombatCoefficients): number {
  return Math.ceil(ms / c.tickMs);
}
