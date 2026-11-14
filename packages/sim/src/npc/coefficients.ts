// NPC 판단 계수 — docs/adr/2026-11-01-npc-brain-r5.md 3~5절
// 세력·사회 계수표의 npc 칸이다(팩 tuning 경로 "npc.*"). 기획 설정 칸(49 S3·S5·S19)에 출발값이 없어 모두 기술 출발값이고
// 질문 192~198(docs/questions/2026-11-01-r5.md) 가를 따른다. 점수는 정수(대개 0~1000), 배율은 ‰, 시각은 실제 시간 ms.

export interface NpcCoefficients {
  /** 판단 간격(질문 193 가: 실제 6시간). 실제 판단 시각은 ± 25% */
  readonly decideEveryMs: number;
  /** 성향 축 범위(S19, 질문 192 가: 0~1000)와 유동 세력이 부모에서 벗어나는 폭 */
  readonly traitMin: number;
  readonly traitMax: number;
  readonly traitDrift: number;
  /** 쉬기 점수: 다른 후보가 이보다 낮으면 아무것도 하지 않는다 */
  readonly idleScore: number;
  /** 칠 수 있는 힘 비(‰): 내 휴먼 수 ≥ 상대 × 이 값 ÷ 1000 */
  readonly attackRatioPm: number;
  /** 평균 만족도가 이보다 낮으면 치지 않는다(전쟁은 만족도를 낮춘다, N29 전쟁) */
  readonly attackMinSatisfaction: number;
  /** 이미 전쟁 중인 상대를 칠 때 더하는 점수, 새로 선포할 때 빼는 점수(무명분 비용 몫) */
  readonly attackWarBonus: number;
  readonly attackDeclarePenalty: number;
  /** 가진 도시가 이 수를 넘으면 넘는 도시마다 치기 점수를 뺀다(넓은 나라는 내정에 힘쓴다, 독점 견제 D-295 해석) */
  readonly attackComfortCities: number;
  /** 나에게서 반란으로 떨어져 나간 세력을 칠 때 더하는 점수(소탕, 46 §2.4) */
  readonly suppressBonus: number;
  readonly attackCityPenalty: number;
  /** 행동 값 대비 국고가 이만큼(‰) 있어야 짓는다(예비금) */
  readonly reservePm: number;
  /** 마을 세우기 기본 점수, 이미 둔 봉신마다 빼는 점수(나라가 얇게 퍼지지 않게) */
  readonly foundScore: number;
  readonly foundVassalPenalty: number;
  /** 연구 시설: 다음 기술 단계가 연구 시설에 막혔을 때 / 아닐 때 기본 점수 */
  readonly researchBlockedScore: number;
  readonly researchScore: number;
  /** 지분 팔기 기본 점수(국고가 모자랄 때만) */
  readonly shareSaleScore: number;
  /** 지분을 판 뒤에도 쥐고 있을 몫(‰) = 이 값 − 상업 성향 ÷ 10(독립 투표로 도시를 잃지 않게, D-300) */
  readonly shareKeepPm: number;
  /** 강화 제안: 만족도가 반란 예고 아래일 때·상대가 더 셀 때 더하는 점수, 이기고 있을 때 빼는 점수 */
  readonly peaceWearyScore: number;
  readonly peaceWeakerScore: number;
  readonly peaceWinningPenalty: number;
  /** 강화를 받는 쪽 기준값(점수 > 0이면 받음) */
  readonly peaceAcceptBase: number;
  /** 봉신 독립 힘 비(‰): 내 힘 ≥ 상위 × 이 값 ÷ 1000 */
  readonly breakRatioPm: number;
  /** 무명분 선포 비용(국고 만분율, S3, 질문 196 가 5%) */
  readonly warCostBp: number;
  /** 교전이 없으면 저절로 끝나는 기간(S5, 질문 194 가 7일) */
  readonly whitePeaceMs: number;
  /** 강화 조약의 불가침 기간(D-292·D-255 예, 질문 195 가 14일) */
  readonly truceMs: number;
  /** 세율 규칙(D-323, 질문 197 가): 한 번에 바꾸는 폭, NPC 규칙식 상한, 올리지 않는 만족도 하한 */
  readonly taxStepBp: number;
  readonly taxMaxBp: number;
  readonly taxSatisfactionFloor: number;
  /**
   * 규칙식 문턱(질문 198 가): 상장폐지·독립 마을·편입 거부의 공격 성향, 독립 찬성의 상업 성향. 공성 결과(약탈·점령·귀속·점령 상태)는 성향 가중
   * 고르기(D-520, npc/policy.ts occupationChoice — 가중치는 war.npcAnnexWeight)라 문턱이 없다
   */
  readonly delistAggression: number;
  readonly independentAggression: number;
  readonly refuseAggression: number;
  readonly voteCommerce: number;
  /** 거래: 상업 성향 이 값마다 매도 값 +1%, 생필품이 모자랄 때·평소 판단 한 번에 쓰는 국고 몫(분모) */
  readonly tradeMarkupPerPct: number;
  readonly spendDivisorShort: number;
  readonly spendDivisor: number;
  /**
   * [임시] 도시 매입 호가(기획 답 530 가, D-518): 거래 판단 끝에 자기 도시의 모자란 물건(목표 재고 − 재고 − 오는 중)을 지난 값의 이 %로
   * 상시 매수 주문한다(시뮬·서버 같은 규칙, simulator/npcTrade.ts placeCityBids)
   */
  readonly cityBidPct: number;
  /**
   * [임시] 구인 규칙식(D-469 "NPC도 이런 경로를 통해 인구를 늘리며 생산발전", 기술 출발값): 도시 휴먼이 주거 × 목표 ‰보다 적으면 구인 카드를
   * 산다. 카드 값 × 예비 ‰만큼 국고가 남을 때만 산다(국고를 다 쓰지 않게)
   */
  readonly recruitTargetPm: number;
  readonly recruitReservePm: number;
  /**
   * [임시] 폐허 정부 짓기 행동 점수(기획 답 484 다, 성향 가중 — 상업 성향 ÷ 4를 더한다): 기본 점수·옛 내 도시 더하기·가진 도시마다 빼기(확장 —
   * 도시가 적을수록). 복원 사업에 넣기·투자는 하루 끝 규칙식이라 점수가 없다
   */
  readonly restoreClaimScore: number;
  readonly restoreFormerBonus: number;
  readonly restoreCityPenalty: number;
  /**
   * [임시] NPC 도시 증축(기획 D-534 — 질문 1101 나, npc/build.ts·simulator/npcBuild.ts, 질문 1141~1144): 도시 하나의 건물 수 상한(행정 건물·
   * 성벽 빼고, 0 = 증축 끔), 채집 시설 한 종류의 목표 수 상한, 농장 하나가 먹이는 휴먼 수, 짓기를 돕는 일 없는 휴먼 수 상한
   */
  readonly buildMaxBuildings: number;
  readonly buildGatherMax: number;
  readonly buildFarmHumans: number;
  readonly buildBuildersMax: number;
  /**
   * [임시] 도시 등급(1~6, D-137)마다 건물 수 상한(질문 1143 나, 설정 칸 npc_build_cap_l1~l6). buildMaxBuildings가 전체 끝(0 = 끔). 없으면 전체 끝
   */
  readonly buildCapByGrade?: readonly number[] | undefined;
  /** [임시] 이 상태(‰) 아래인 시설을 NPC가 고친다(질문 1114 가, 설정 칸 npc_build_repair_below_pm). 0 = 고치지 않는다 */
  readonly buildRepairBelowPm?: number | undefined;
  /**
   * [임시] 상한에 닿기 전 나라 목표에 더하는 레벨 재료 가공 시설 수(질문 1186 나, 기획 D-540, 설정 칸 npc_build_level_supply): 레벨 2 짓기 재료
   * (판자·벽돌)를 내는 시설(제재소·가마)마다 도시 목표가 적어도 이 값이다. 0 = 더하지 않는다(나라 특산만). 없으면 0
   */
  readonly buildLevelSupply?: number | undefined;
  /**
   * [임시] 레벨 재료 가공 시설이 목표에 드는 때(질문 1291 나, 기획 D-541, 설정 칸 npc_build_level_supply_lead): 도시 건물 수가 상한 − 이 값에
   * 닿았을 때부터. 1 이상(상한에서는 새로 짓지 않는다)이고 아직 짓지 않은 가공 시설 수(지금 팩 = 제재소·가마·제련소 셋)보다 짧지 않다.
   * 상한보다 크면 처음부터(예전 판). 없으면 2
   */
  readonly buildLevelSupplyLead?: number | undefined;
  /** 굶어 멈춤(D-220, 기술 정의): 국고 0 + 생필품 충족 이 ‰ 미만이 이 날 수 이어짐 */
  readonly stallFoodPm: number;
  readonly stallDays: number;
  /**
   * NPC 중앙은행 공식(D-131 "기본 NPC 국가 = 공식대로 움직이는 중앙은행", economy/centralBank.ts): 목표 물가 지수(천분율)·이득(만분율)·
   * 하루 조절 상한(E5, 시중 통화량 만분율)·하루 발행 이율(S1·D-303, 만분율). [임시] 49 E5·S1에 출발값이 없어 시험값(2026-11-08 설정 칸)
   */
  readonly bankTargetMilli: number;
  readonly bankGainBp: number;
  readonly bankDailyCapBp: number;
  readonly bankInterestBpPerDay: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const TEST_NPC_COEFFICIENTS: NpcCoefficients = {
  decideEveryMs: 6 * HOUR_MS,
  traitMin: 0,
  traitMax: 1000,
  traitDrift: 150,
  idleScore: 250,
  attackRatioPm: 1200,
  attackMinSatisfaction: 55,
  attackWarBonus: 200,
  attackDeclarePenalty: 150,
  attackComfortCities: 4,
  suppressBonus: 300,
  attackCityPenalty: 80,
  reservePm: 2000,
  foundScore: 100,
  foundVassalPenalty: 150,
  researchBlockedScore: 700,
  researchScore: 150,
  shareSaleScore: 200,
  shareKeepPm: 600,
  peaceWearyScore: 400,
  peaceWeakerScore: 300,
  peaceWinningPenalty: 300,
  peaceAcceptBase: 200,
  breakRatioPm: 800,
  warCostBp: 500,
  whitePeaceMs: 7 * DAY_MS,
  truceMs: 14 * DAY_MS,
  taxStepBp: 100,
  taxMaxBp: 2000,
  taxSatisfactionFloor: 50,
  delistAggression: 800,
  independentAggression: 600,
  refuseAggression: 500,
  voteCommerce: 500,
  tradeMarkupPerPct: 250,
  spendDivisorShort: 2,
  spendDivisor: 4,
  cityBidPct: 90,
  buildMaxBuildings: 32,
  buildGatherMax: 3,
  buildFarmHumans: 12,
  buildBuildersMax: 4,
  buildCapByGrade: [8, 10, 12, 16, 20, 24],
  buildRepairBelowPm: 700,
  buildLevelSupply: 1,
  buildLevelSupplyLead: 2,
  recruitTargetPm: 1000,
  recruitReservePm: 2000,
  restoreClaimScore: 400,
  restoreFormerBonus: 150,
  restoreCityPenalty: 40,
  stallFoodPm: 500,
  stallDays: 7,
  bankTargetMilli: 1000,
  bankGainBp: 2000,
  bankDailyCapBp: 300,
  bankInterestBpPerDay: 1,
};
