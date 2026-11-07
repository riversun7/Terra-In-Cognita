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
  /** 규칙식 문턱(질문 198 가): 약탈·상장폐지·독립 마을·편입 거부의 공격 성향, 독립 찬성의 상업 성향, 약탈 여유 만족도 */
  readonly lootAggression: number;
  readonly delistAggression: number;
  readonly independentAggression: number;
  readonly refuseAggression: number;
  readonly voteCommerce: number;
  readonly lootMargin: number;
  /** 거래: 상업 성향 이 값마다 매도 값 +1%, 생필품이 모자랄 때·평소 판단 한 번에 쓰는 국고 몫(분모) */
  readonly tradeMarkupPerPct: number;
  readonly spendDivisorShort: number;
  readonly spendDivisor: number;
  /**
   * [임시] 구인 규칙식(D-469 "NPC도 이런 경로를 통해 인구를 늘리며 생산발전", 기술 출발값): 도시 휴먼이 주거 × 목표 ‰보다 적으면 구인 카드를
   * 산다. 카드 값 × 예비 ‰만큼 국고가 남을 때만 산다(국고를 다 쓰지 않게)
   */
  readonly recruitTargetPm: number;
  readonly recruitReservePm: number;
  /**
   * [임시] 폐허 복원 행동 점수(기획 답 484 다, 성향 가중 — 상업 성향 ÷ 4를 더한다): 정부 짓기 기본 점수·옛 내 도시 더하기·가진 도시마다
   * 빼기(확장 — 도시가 적을수록), 내 사업에 넣기 기본 점수, 남의 열린 모금 투자 기본 점수
   */
  readonly restoreClaimScore: number;
  readonly restoreFormerBonus: number;
  readonly restoreCityPenalty: number;
  readonly restoreFundScore: number;
  readonly restoreInvestScore: number;
  /** [임시] 공성에서 이겨 약탈하고 폐허로 두는 공격 성향 문턱(기획 답 486 나, 약탈 문턱보다 높게) */
  readonly razeAggression: number;
  /** 굶어 멈춤(D-220, 기술 정의): 국고 0 + 생필품 충족 이 ‰ 미만이 이 날 수 이어짐 */
  readonly stallFoodPm: number;
  readonly stallDays: number;
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
  lootAggression: 600,
  delistAggression: 800,
  independentAggression: 600,
  refuseAggression: 500,
  voteCommerce: 500,
  lootMargin: 10,
  tradeMarkupPerPct: 250,
  spendDivisorShort: 2,
  spendDivisor: 4,
  recruitTargetPm: 1000,
  recruitReservePm: 2000,
  restoreClaimScore: 250,
  restoreFormerBonus: 150,
  restoreCityPenalty: 40,
  // 넣기·투자는 판단마다 되풀이되므로 연구(150 + 성향 ÷ 8)를 밀어내지 않게 낮게 둔다(econ16 D-391 기술 조건, ADR 폐허 2 잰 값)
  restoreFundScore: 100,
  restoreInvestScore: 50,
  razeAggression: 900,
  stallFoodPm: 500,
  stallDays: 7,
};
