// 세력·사회 계수표 — docs/adr/2026-10-31-faction-society-core.md "계수 한 곳"
// 세력·도시·인구·기술·노동 규칙의 수치를 이 표 하나에 모은다. 기획 설정 칸(49 §6.5 N·§7 S·T)에 출발값이 있으면 그 값, 없으면 [임시].
// 노동 공식(labor.ts)의 정본은 기획 48 §7이다. 시각은 실제 시간 ms, 배율은 ‰. N·S 코드 ↔ 칸 대응은 ADR faction-society-core.

export interface SocietyCoefficients {
  /** 도시 주식 수(D-130) */
  readonly sharesPerCity: number;
  /** 배당(도시 세금 정산) 주기(D-130 7일, D-443 설정값). 시뮬은 하루 끝에서 날 수로 내림해 돈다 */
  readonly dividendEveryMs: number;
  /** 상장폐지 뒤 점령 세력 국고에 다시 내는 주식 수(D-298·D-443 설정값, 출발값 = 도시 주식 수) */
  readonly delistReissueShares: number;
  /** 반란 문턱: 도시 평균 만족도(S26 예시 40). 이하면 반란 중(D-253) */
  readonly rebellionThreshold: number;
  /** [임시] 민심 표 반란 예고 문턱(N35 출발값 없음): 반란 문턱 위 ~ 이 값 이하 = 반란 예고(D-443 155) */
  readonly rebellionWarningAt: number;
  /** [임시] 민심 표 태업 조짐 문턱(N35 출발값 = 기술 [임시] 60): 반란 예고 위 ~ 이 값 이하 = 태업 조짐 */
  readonly sabotageAt: number;
  /** 독립 통과 문턱(S27 구조 값): 자본주의 찬성 지분 ‰ 이상, 민주주의 가문 과반 */
  readonly independencePassPm: number;
  /** [임시] 편입 제안 기한(S30 출발값 없음) */
  readonly offerDeadlineMs: number;
  /** [임시] 점령 만족도 하락: 약탈·통합(D-186 Step 5), 상장폐지(S31), 독재로 바뀜(S23) */
  readonly lootSatisfactionDrop: number;
  readonly integrateSatisfactionDrop: number;
  readonly delistSatisfactionDrop: number;
  readonly dictatorshipSatisfactionDrop: number;
  /** [임시] 상장폐지 때 다른 세력과의 관계 점수 하락(S31) */
  readonly delistRelationDrop: number;
  /** [임시] 약탈이 가져가는 도시 금고·공공 창고 몫(만분율) */
  readonly lootTakeBp: number;
  /** 상속세(S22 기존 50%, 만분율) */
  readonly inheritanceTaxBp: number;
  /** 휴먼 수명(T4 참고값 실제 2~3개월) */
  readonly lifespanMinMs: number;
  readonly lifespanMaxMs: number;
  /** [임시] 수명이 다했을 때 환생·신격화 확률(‰, D-395 시설 서비스 전 단계) */
  readonly rebirthPm: number;
  readonly deifyPm: number;
  /** [임시] 도시 출생(S39 출발값 없음): 판정 주기, 판정마다 확률 ‰, 만족도 문턱(질문 120 기본안) */
  readonly birthEveryMs: number;
  readonly birthPm: number;
  readonly birthSatisfactionMin: number;
  /** 지상 기술 단계 상한(질문 121 기본안: 시설 Lv1~5 사다리) */
  readonly techGroundMax: number;
  /** [임시] 단계 n으로 오르는 연구 작업량(효율 1000인 연구 일꾼 한 시간 = 1000) = researchWorkBase × n */
  readonly researchWorkBase: number;
  /** [임시] 단계 n의 도시 발전도 하한 = developmentPerTech × (n − 1) */
  readonly developmentPerTech: number;
  /** 설계도 할인(D-396 출발값 50%, 만분율) */
  readonly blueprintDiscountBp: number;
  /** 피로 상한(N21 구조 값 120) */
  readonly fatigueMax: number;
  /** 피로 구간 불이익(N23): 구간 하한(포함) → 능력 ‰, 이동 ‰ */
  readonly fatigueBands: readonly {
    readonly from: number;
    readonly abilityPm: number;
    readonly movePm: number;
  }[];
  /** 피로 회복 기본(N24 +1/3분 = 1점 푸는 데 180,000ms) */
  readonly fatigueRecoverStepMs: number;
  /** 주거 등급 1~3 회복 배율(N24 ×1.5·×2·×3, ‰). 0번은 쓰지 않는다(주거 없음 = 노숙) */
  readonly housingRecoveryPm: readonly number[];
  /** [임시] 노숙 회복 배율(S25 "아주 크게", 출발값 없음) */
  readonly homelessRecoveryPm: number;
  /** [임시] 만족도 → 회복 배율(N25 출발값 없음): 만족도 0이면 이 ‰, 100이면 1000 */
  readonly lowSatisfactionRecoveryPm: number;
  /** 기준 단가(N27 기존 고정 2.0 = 효율 1점당 2,000밀리 화폐) */
  readonly wageRateMilli: number;
  /** [임시] 기준 단가 수급(N27 모양 기술 기본안): 수요/공급 비가 1을 벗어난 만큼 이 ‰로 움직이고 [min, max]‰ 안 */
  readonly wageElasticityPm: number;
  readonly wageRateMinPm: number;
  readonly wageRateMaxPm: number;
  /** [임시] 기준 단가 재계산 주기(N27) */
  readonly wageRecalcMs: number;
  /** [임시] 고용주 조정 범위(N28 출발값 없음, ‰) */
  readonly employerAdjustMinPm: number;
  readonly employerAdjustMaxPm: number;
  /** 직무 스킬 보너스(N31 기존 레벨 × 2.0 → "생활" 태그 스킬 등급당 2점) */
  readonly lifeSkillBonusPerGrade: number;
  /** 생산(N32): 진행 = max(1, ⌊주 ÷ 나눔⌋)/틱, 추가 수확 = ⌊보조 × ‰⌋ */
  readonly productionMainDivisor: number;
  readonly productionSubYieldPm: number;
  /** 포만감 효율 배율(N33): 포만감 이하 → 효율 ‰ (기존 50 이하 0.7, 30 이하 0) */
  readonly foodEfficiency: readonly { readonly atMost: number; readonly pm: number }[];
  /** 임금 비교 범위(N30 같은 도시 같은 직무 상위 25%, ‰) */
  readonly wageTopSharePm: number;
  /**
   * [임시] 만족도 요소의 목표 기여(N29 출발값 없음, 점): 기본, 포만감(충족도 1000‰일 때), 주거(등급 1·2·3), 노숙,
   * 임금(상위 평균과 같을 때), 임금 격차 불만(비율이 문턱 아래), 신앙, 전쟁, 부상
   */
  readonly satisfactionTarget: {
    readonly base: number;
    readonly food: number;
    readonly housing: readonly number[];
    readonly homeless: number;
    readonly wage: number;
    readonly wageGap: number;
    readonly wageGapFloorPm: number;
    readonly faith: number;
    readonly war: number;
    readonly injury: number;
  };
  /** [임시] 목표값으로 다가가는 속도(N29 복원 속도, 하루에 차이의 ‰) */
  readonly satisfactionRestorePmPerDay: number;
  /** [임시] 속국·봉신 공물(기획 값 없음, D-443: 출발값 기술 [임시] 주 5%, ‰): 상위 세력에 내는 국고 몫. 세력 화면도 이 값을 보인다 */
  readonly tributePm: number;
  /** 공물 주기(주마다). 시뮬은 하루 끝에서 날 수로 내림해 돈다 */
  readonly tributeEveryMs: number;
  /** 사이보그 성장·환생(48 §2, D-417·D-440·D-441, 49 N6·N7·N9·N34) */
  readonly cyborg: {
    /** 만렙(N7 기본 50, 구조 값). 특수 만렙 60은 누가 받는지 정해지지 않아 두지 않는다 */
    readonly maxLevel: number;
    /** K 범위(N6 800~1200‰, 생성·환생 리롤 때 균등) */
    readonly kMinPm: number;
    readonly kMaxPm: number;
    /** 초기 스탯 합·칸 범위(N9 합 60, 칸 1~20). 환생 분포 변경도 이 안 */
    readonly initialSum: number;
    readonly initialMin: number;
    readonly initialMax: number;
    /** 스킬 최대 등급 = min(기본 + 환생 횟수, 상한)(D-031 기본 3, D-5001 상한 10) */
    readonly skillGradeBase: number;
    readonly skillGradeMax: number;
    /** [임시] 환생 비용(N34 출발값 없음): 신앙도(0~100 척도), 화폐(신전 도시 화폐 최소 단위) */
    readonly rebirthFaith: number;
    readonly rebirthCurrency: number;
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const TEST_SOCIETY_COEFFICIENTS: SocietyCoefficients = {
  sharesPerCity: 1000,
  dividendEveryMs: 7 * DAY,
  delistReissueShares: 1000,
  rebellionThreshold: 40,
  rebellionWarningAt: 50,
  sabotageAt: 60,
  independencePassPm: 500,
  offerDeadlineMs: 3 * DAY,
  lootSatisfactionDrop: 25,
  integrateSatisfactionDrop: 5,
  delistSatisfactionDrop: 15,
  dictatorshipSatisfactionDrop: 20,
  delistRelationDrop: 20,
  lootTakeBp: 5000,
  inheritanceTaxBp: 5000,
  lifespanMinMs: 60 * DAY,
  lifespanMaxMs: 90 * DAY,
  rebirthPm: 100,
  deifyPm: 10,
  birthEveryMs: 6 * HOUR,
  birthPm: 250,
  birthSatisfactionMin: 50,
  techGroundMax: 5,
  researchWorkBase: 48_000,
  developmentPerTech: 20,
  blueprintDiscountBp: 5000,
  fatigueMax: 120,
  fatigueBands: [
    { from: 0, abilityPm: 1000, movePm: 1000 },
    { from: 31, abilityPm: 900, movePm: 1000 },
    { from: 61, abilityPm: 750, movePm: 850 },
    { from: 91, abilityPm: 500, movePm: 700 },
  ],
  fatigueRecoverStepMs: 180_000,
  housingRecoveryPm: [1000, 1500, 2000, 3000],
  homelessRecoveryPm: 100,
  lowSatisfactionRecoveryPm: 500,
  wageRateMilli: 2000,
  wageElasticityPm: 500,
  wageRateMinPm: 500,
  wageRateMaxPm: 2000,
  wageRecalcMs: 6 * HOUR,
  employerAdjustMinPm: 800,
  employerAdjustMaxPm: 1500,
  lifeSkillBonusPerGrade: 2,
  productionMainDivisor: 20,
  productionSubYieldPm: 80,
  foodEfficiency: [
    { atMost: 30, pm: 0 },
    { atMost: 50, pm: 700 },
  ],
  wageTopSharePm: 250,
  satisfactionTarget: {
    base: 20,
    food: 40,
    housing: [0, 15, 20, 25],
    homeless: -20,
    wage: 20,
    wageGap: -10,
    wageGapFloorPm: 600,
    faith: 10,
    war: -15,
    injury: -10,
  },
  satisfactionRestorePmPerDay: 300,
  tributePm: 50,
  tributeEveryMs: 7 * DAY,
  cyborg: {
    maxLevel: 50,
    kMinPm: 800,
    kMaxPm: 1200,
    initialSum: 60,
    initialMin: 1,
    initialMax: 20,
    skillGradeBase: 3,
    skillGradeMax: 10,
    rebirthFaith: 50,
    rebirthCurrency: 10_000,
  },
};
