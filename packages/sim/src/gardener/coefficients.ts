// 정원사·오염 계수 — docs/adr/2026-11-01-gardener-r5b.md, 기획 D-460(질문 199~202 가), 질문 214~225(docs/questions/2026-11-01-r5b.md)
// 세력·사회 계수표의 gardener 칸이다(팩 tuning 경로 "gardener.*"). 49 P15·C14~C18·S16·S17에 출발값이 없어 D-460 표의 값이
// 설정값 출발값(D-5032)이고, D-460에 없는 자리는 질문 214~225 가(기술 기본안)다. 오염 값은 칸마다 0~cellMax 정수,
// 시각은 실제 시간 ms, 비율은 ‰ 또는 만분율(bp).
// 정원사 2(docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)"): 정원 세력 관계도(49 N52, D-500·D-510), 세력 오염(D-509),
// 전쟁 칸 오염(D-509), 보호 레이드(D-500), 막아 낸 웨이브 보상(D-499). 수치는 모두 [임시] 출발값(D-515).

export interface GardenerCoefficients {
  /** 칸 하나의 오염 상한(D-460 200: 0~10,000) */
  readonly cellMax: number;
  /** 전투 한 번이 그 칸에 더하는 오염(D-460 200: +200) */
  readonly battle: number;
  /** 휴먼 오염: humansPerStep명당 하루 humanStep(D-460 200: 100명당 +10) */
  readonly humansPerStep: number;
  readonly humanStep: number;
  /** 숲 칸 하루 감소(D-460 200: −20) */
  readonly forestDaily: number;
  /** 정화 한 번 줄이는 양(D-460 200 "정화는 설정값만큼", [임시] 50. 정화 직무 D-310이 생기면 부른다) */
  readonly purifyAmount: number;
  /** 하루 자연 감소(만분율, D-460 200: 1%, 올림 — 최소 1) */
  readonly decayBp: number;
  /** 하루 퍼짐(만분율, D-460 200: 2%가 이웃 칸으로 고르게) */
  readonly spreadBp: number;
  /** 도시 영향권 반경(1차맵 칸, 질문 216 가: 1 = 도시 칸 + 이웃 8칸) */
  readonly influenceRadius: number;
  /** 웨이브 확률 ‰ = min(chanceMaxPm, 영향권 오염 합 ÷ chanceDivisor) (C14, D-460 201) */
  readonly chanceDivisor: number;
  readonly chanceMaxPm: number;
  /**
   * 웨이브 세기 = strengthBase × (1 + ⌊log2(1 + 도시 수 + 휴먼 ÷ strengthHumansPer + 국고 ÷ strengthTreasuryUnit)⌋) (C16).
   * strengthBase 출발값 5 = D-468 목표(C16a)로 맞춘 값(D-460 4 → 5, cli/gardener-cal.ts)
   */
  readonly strengthBase: number;
  readonly strengthHumansPer: number;
  readonly strengthTreasuryUnit: number;
  /**
   * 웨이브 결과 목표(49 C16a, D-468): 영향권 오염 합 ≥ targetSum인 도시에 오는 웨이브의 승률 ‰(출발값 약 1/3). 판정에는 쓰지 않고
   * 맞추기 도구(cli/gardener-cal.ts)와 시뮬 요약(gardener.target)이 읽는다
   */
  readonly targetWinPm: number;
  readonly targetSum: number;
  /** 웨이브 최소 예고(C15, D-460 201: 실제 8시간) */
  readonly noticeMs: number;
  /** 실패한 웨이브 뒤 그 도시 확률 감소 기간·남는 몫(C18, D-460 201: 7일 절반) */
  readonly cooldownMs: number;
  readonly cooldownChanceBp: number;
  /**
   * 물리형 공성 크리쳐 ‰ = min(physicalMaxPm, 영향권 오염 합 ÷ physicalDivisor) (C17, 질문 214 가). physicalDivisor 출발값 100 =
   * D-468 목표로 맞춘 값(200 → 100)
   */
  readonly physicalDivisor: number;
  readonly physicalMaxPm: number;
  /** 서버 유닛 예산과 모함 몫(만분율, S16, D-460 202: 10만의 5%, 행성 하나) */
  readonly unitBudget: number;
  readonly mothershipBp: number;
  /** 유목 부대: 탐지 거리(1차맵 칸), 예고, 목표 문턱, 실패 목표 제외 기간(S17·C18, D-460 202) */
  readonly nomadDetect: number;
  readonly nomadNoticeMs: number;
  readonly nomadThreshold: number;
  readonly nomadExcludeMs: number;
  /** 유목 부대 수(행성마다, 질문 221 가: 정찰대 2·정화 군단 1)와 규모 */
  readonly nomadScouts: number;
  readonly nomadLegions: number;
  readonly nomadScoutSize: number;
  /** 정화 군단만 고르는 목표 오염 문턱(이 값 이상), 정화 군단 규모의 오염 한 걸음 */
  readonly nomadLegionAt: number;
  readonly nomadLegionStep: number;
  /** 정원 세력 관계도 범위·시작값(49 N52, D-510: 옛 NpcDiplomacyAI.js 우호도 −100~+100, 시작 0) */
  readonly relationMin: number;
  readonly relationMax: number;
  readonly relationStart: number;
  /** 관계도 단계 문턱(이 값 이상): 동맹 70·우호 30·중립 −20·경계 −50, 그 아래 적대(D-510) */
  readonly relationAllied: number;
  readonly relationFriendly: number;
  readonly relationNeutral: number;
  readonly relationWary: number;
  /** 필수 NPC 세력(고정 국가)이 아닌 세력의 관계도 상한(D-500 "필수 NPC 세력은 양수가 될 수 있다", [임시] 0) */
  readonly relationOthersMax: number;
  /**
   * 하루 관계도 바뀜(D-510 "세력 오염이 쌓이면 내려가고 정화·평화로 올라간다", 양은 [임시]): 세력 오염 relationPollutionStep마다 −1
   * (하루 최대 relationDropMax), 전쟁이 없는 날 +relationPeaceDaily, 그 세력 칸 정화 한 번 +relationPurifyGain
   */
  readonly relationPollutionStep: number;
  readonly relationDropMax: number;
  readonly relationPeaceDaily: number;
  readonly relationPurifyGain: number;
  /** 단계별 도시 웨이브 확률 배율(‰, 동맹·우호·중립·경계·적대 차례). 동맹 0 = 웨이브 없음(협력, D-500) [임시] */
  readonly stageChancePm: readonly number[];
  /** 세기 로그 안 세력 오염 항의 나눗수(C16 보완, D-509 "세력 오염이 세기를 정한다") [임시] */
  readonly strengthPollutionUnit: number;
  /** 전쟁 중인 세력의 도시 칸에 하루마다 더하는 오염(P15 보완, D-509 "전쟁이면 훨씬 크게") [임시] */
  readonly warDaily: number;
  /** 보호 레이드(D-500): 세기 = 공격자 웨이브 세기 × raidStrengthPm ÷ 1000, 물리형 ‰ = raidPhysicalPm [임시] */
  readonly raidStrengthPm: number;
  readonly raidPhysicalPm: number;
  /**
   * 막아 낸 도시 웨이브 보상(D-499, 보호 레이드는 없음 D-500): 명성 = 마리당 rewardRenownPer, 유전자 조각 = 웨이브마다 조각 아이템
   * (gene.drops에 wave)마다 rewardGenes개, 크리쳐 재료 = 재료 아이템마다 ⌊마리 × rewardMaterialsPm ÷ 1000⌋개 [임시]
   */
  readonly rewardRenownPer: number;
  readonly rewardGenes: number;
  readonly rewardMaterialsPm: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const TEST_GARDENER_COEFFICIENTS: GardenerCoefficients = {
  cellMax: 10_000,
  battle: 200,
  humansPerStep: 100,
  humanStep: 10,
  forestDaily: 20,
  purifyAmount: 50,
  decayBp: 100,
  spreadBp: 200,
  influenceRadius: 1,
  chanceDivisor: 100,
  chanceMaxPm: 300,
  strengthBase: 5,
  strengthHumansPer: 50,
  strengthTreasuryUnit: 1_000_000,
  targetWinPm: 333,
  targetSum: 30_000,
  noticeMs: 8 * HOUR_MS,
  cooldownMs: 7 * DAY_MS,
  cooldownChanceBp: 5000,
  physicalDivisor: 250,
  physicalMaxPm: 500,
  unitBudget: 100_000,
  mothershipBp: 500,
  nomadDetect: 8,
  nomadNoticeMs: 3 * HOUR_MS,
  nomadThreshold: 2000,
  nomadExcludeMs: 7 * DAY_MS,
  nomadScouts: 2,
  nomadLegions: 1,
  nomadScoutSize: 4,
  nomadLegionAt: 5000,
  nomadLegionStep: 1000,
  relationMin: -100,
  relationMax: 100,
  relationStart: 0,
  relationAllied: 70,
  relationFriendly: 30,
  relationNeutral: -20,
  relationWary: -50,
  relationOthersMax: 0,
  relationPollutionStep: 30_000,
  relationDropMax: 10,
  relationPeaceDaily: 2,
  relationPurifyGain: 1,
  stageChancePm: [0, 500, 1000, 1250, 1500],
  strengthPollutionUnit: 100_000,
  warDaily: 100,
  raidStrengthPm: 2000,
  raidPhysicalPm: 500,
  rewardRenownPer: 10,
  rewardGenes: 1,
  rewardMaterialsPm: 500,
};
