// 전투 계수표 — docs/adr/2026-10-31-combat-core.md "공식 한 곳"
// 피해·시야·명령 같은 전투 수치를 이 표 하나에 모은다. 기획 Step 9(스탯·전투 공식 체계)가 오면 이 표와 formula.ts만 바꾼다.
// 출발값: 기획 설정 칸(49 5장 C1~C41)에 있는 값은 그대로, 없는 값은 [임시](시험값, 밸런스와 상관없음).
// 모든 배율은 천분율(1000 = 1배), 확률은 만분율(굴림 하나 = 0~9999 정수)이다.

export interface CombatCoefficients {
  /** 틱 길이(ms, C1 "약 200ms") */
  readonly tickMs: number;
  /** 같은 유닛 명령 다시 넣기 막는 틱 수(C5 "약 1초" = 5틱) */
  readonly commandLockTicks: number;
  /** 제한 시간(틱, C2: 일반 10분, 공성 30분 = 상한) */
  readonly limitTicks: { readonly normal: number; readonly siege: number; readonly max: number };
  /** 퇴각 구역 폭(칸, C21)·머무는 틱(C23 출발값 없음 → 기술 0)·시작 줄(C22 3칸째) */
  readonly retreatBand: number;
  readonly retreatDwellTicks: number;
  readonly entryRow: number;
  /** 스냅숏 간격(틱, ADR 35 30초) */
  readonly snapshotTicks: number;
  /** 이동 흐름장을 다시 세는 간격(틱). 스냅숏 간격의 약수여야 한다 */
  readonly fieldTicks: number;
  /** [임시] 축마다 배율 상한(C8 하드캡 출발값 없음) */
  readonly caps: {
    readonly critPm: number;
    readonly skillPm: number;
    readonly buffPm: number;
    readonly elementPm: number;
  };
  /** 속성 항 하한(C11 0.25배) */
  readonly elementFloorPm: number;
  /** 계열 상성 rate(C10·D-5013, 천분율): [공격 계열][방어 계열], 계열 = 물·불·바람·땅·빛·어둠 */
  readonly affinityPm: readonly (readonly number[])[];
  /** 시야(C26·C27 출발값 없음 → [임시]): 반지름 = base + ⌊(WIS × wisPm + AGI × agiPm) ÷ 1000⌋ + min(heightCap, ⌊높이차 ÷ heightUnit⌋) */
  readonly sight: {
    readonly base: number;
    readonly wisPm: number;
    readonly agiPm: number;
    /** 높이 단위(16배 cm) */
    readonly heightUnit: number;
    readonly heightCap: number;
  };
  /** 수풀 속 적이 보이는 거리(칸, C24)·수풀에서 공격하면 드러나는 틱(C25 출발값 없음 → [임시]) */
  readonly bushSenseCells: number;
  readonly bushRevealTicks: number;
  /** [임시] 패배 화물 탈취(C19 기존 "최대 50%", 만분율) */
  readonly lootBp: number;
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
  tickMs: 200,
  commandLockTicks: 5,
  limitTicks: { normal: 3_000, siege: 9_000, max: 9_000 },
  retreatBand: 2,
  retreatDwellTicks: 0,
  entryRow: 3,
  snapshotTicks: 150,
  fieldTicks: 5,
  caps: { critPm: 3_000, skillPm: 5_000, buffPm: 3_000, elementPm: 4_000 },
  elementFloorPm: 250,
  affinityPm: AFFINITY,
  sight: { base: 10, wisPm: 100, agiPm: 50, heightUnit: 4_800, heightCap: 4 },
  bushSenseCells: 1,
  bushRevealTicks: 10,
  lootBp: 5_000,
};
