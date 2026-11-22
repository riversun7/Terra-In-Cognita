// 나라 의결(governance) 계수(팩 tuning 경로 "governance.*") — 기획 D-5057("정족수·투표 기간은 설정값, 급한 전쟁·강화 안건은 짧게" — 49 S34)·
// D-131(체제 전환 7일 유예)·질문 2351~2365 답(D-580·기획 대조), docs/adr/2026-11-21-governance.md. 서버 의결(apps/server/src/governance)만 읽는다.
// 시뮬은 의결 층이 없어(체제는 세울 때 정하고 바뀌지 않는다) 시뮬 판정·출력은 그대로다(SIM_VERSION 그대로). 수치는 모두 [임시] 출발값이다.

export interface GovernanceCoefficients {
  /** 투표 기간(ms, 실제 시간 D-5030): 지도자 묶음(선출·해임·체제 전환)·전쟁 묶음(선전포고 — 짧게, D-5057). S34 */
  readonly periodLeaderMs: number;
  readonly periodWarMs: number;
  /** 정족수(‰ — 던진 표(기권 포함) ÷ 투표권 전체, 2353): 지도자 묶음·전쟁 묶음. S34 */
  readonly quorumLeaderPm: number;
  readonly quorumWarPm: number;
  /** 가결 문턱(‰ — 찬성 × 1000 > 문턱 × (찬성 + 반대), 2354 출발값 나): 기본(선전포고)·체제 전환·지도자 해임 */
  readonly thresholdPm: number;
  readonly thresholdRegimePm: number;
  readonly thresholdRemovalPm: number;
  /** 지도자 임기(ms, 2357 — 민주주의·자본주의, 2주~1달). 독재는 임기가 없다 */
  readonly termMs: number;
  /** 선출 안건의 후보 등록 기간(ms, 2358 가 — 그 뒤 NPC가 표를 낸다. 투표 기간보다 길면 투표 기간 끝까지) */
  readonly registerMs: number;
  /** 체제 전환 유예(ms, D-131 "7일 유예" — 가결·직권 결정 뒤 이만큼 지나 집행) */
  readonly graceRegimeMs: number;
  /** 자본주의에서 안건을 올리고 후보로 나설 수 있는 의결권 몫 하한(‰ — 2351 가 "의결권 ≥ 설정값") */
  readonly proposeSharePm: number;
  /** 한 가문·주주가 동시에 열어 둘 수 있는 안건 수(2351 기술 기본값) */
  readonly openPerProposer: number;
  /** 임기 끝 자동 선출(1 = 켬): 임기가 끝나기 투표 기간 전에 선출 안건을 저절로 연다 */
  readonly autoElections: number;
  /** 선전포고 안건(1 = 켬): 가결되면 바로 전쟁(세력·사회 선전포고 — 무명분 비용 포함) */
  readonly warAgenda: number;
  /** NPC 투표 규칙식(D-323·D-554): 만족도(0~100)가 이 값 이상이면 현직 편, 아래면 바꾸는 쪽 */
  readonly npcKeepSatisfaction: number;
  /** NPC 투표 규칙식: 공격 성향(‰)이 이 값 이상이면 선전포고 찬성 */
  readonly npcWarTraitPm: number;
  /** NPC 후보 규칙식(질문 2404 나 — D-323 점수 + 성향): 현직이 아닌 NPC 가문의 출마 점수가 이 값 이상이면 선출에 나선다(줄기 governance-2) */
  readonly npcRunScore: number;
  /** 한 선출에 스스로 나서는 도전자 NPC 가문 수 상한(점수 높은 차례, 0 = 도전자 없음) */
  readonly npcRunMax: number;
  /**
   * 지도자 빈자리 자동 선출 기간(ms, 사용자 결정 D-584 — D-583 3 "빈자리 → 도시 독립 투표"를 대신한다): 빈자리가 되면 누구나 나설 수 있는 선출을 저절로 열고 이 기간
   * 뒤 닫는다. 후임자(국가 지도자 가문에서 대행·계승)를 고르는 방법은 정해지지 않았다(질문 2491) [임시]
   */
  readonly vacancyElectionMs: number;
  /** 군사 쿠데타 충성도 벌칙(만족도 점, 질문 2401 답 D-582 "충성도 크게 떨어짐"). 쿠데타 길은 아직 없다(도우미만, 질문 2433) */
  readonly coupSatisfactionDrop: number;
  /** 세율 안건 폭(‰, 질문 2407 가): 민주주의·자본주의에서 지도자가 나라 세율 칸 하나라도 이만큼 이상 바꾸면 안건(투표), 아래는 바로. 소득세는 bp ÷ 10 */
  readonly taxAgendaWidthPm: number;
  /** 군사 쿠데타(질문 2433 답·D-583, 줄기 governance-3 — 서버만): 켬(1)·쿨타임(ms)·참가 받기(ms)·실패 비용(나라 화폐)·실패 만족도(점)·NPC 성향 점수 문턱·NPC 힘 비(‰)·편마다 전투 유닛·이긴 편 명성·신용 보상 */
  readonly coupEnabled: number;
  readonly coupCooldownMs: number;
  readonly coupGatherMs: number;
  readonly coupFailCost: number;
  readonly coupFailSatisfactionDrop: number;
  readonly coupNpcScore: number;
  readonly coupNpcPowerPm: number;
  readonly coupBattleUnits: number;
  readonly coupMeritRenown: number;
  readonly coupCreditReward: number;
  /**
   * 줄기 governance-5(질문 2451~2460 답 — 서버만): 지배 가문이 바뀐 뒤 쿠데타를 막는 기간(ms, 2457 — 출발값 0 = 막지 않음)·화폐 단계 전환 가결 문턱(‰, D-131 2/3)·
   * 강화 제안이 상대 지도자의 수락을 기다리는 기간(ms, 2452)·NPC 가문 독립 선언 성향 점수 문턱(2454 — D-323)
   */
  readonly coupProtectMs: number;
  readonly thresholdCurrencyPm: number;
  readonly peaceOfferMs: number;
  readonly houseIndependenceNpcScore: number;
  /** NPC 가문 독립 선언의 힘 비 문턱(‰ — 가문 힘 × 1000 ≥ 옛 나라 힘 × 이 값, 사용자 답 D-585 "독립하면 옛 나라가 적이 되니 전력 비교") [임시] */
  readonly houseIndependencePowerPm: number;
  /**
   * 지도자 신임도(사용자 답 D-585 — 신용과 다른 새 값, governance/approval.ts): 플레이어 지도자·NPC 지도자 시작값(0~1000), 낮은 신임도가 해임 문턱을 낮추는 폭(‰)·반란 문턱을
   * 올리는 폭(만족도 점). 바뀜(줄기 gov-coup — D-588 2493): 두 폭 출발값 300‰·15점(기준점 아래에서만 — approvalNeutralPm), 오르내림은 아래 칸들
   */
  readonly approvalPlayerStart: number;
  readonly approvalNpcStart: number;
  readonly approvalRemovalEasePm: number;
  readonly approvalRebellionEase: number;
  /**
   * 줄기 gov-coup(사용자 결정 D-588 2493 "알아서" — 기술 기본값, governance/approvalFactors.ts): 신임도 오르내림. 보정 기준점(‰ — 이 값 아래에서만 해임·반란 문턱이 쉬워진다),
   * 세금 수준 1‰ 바뀜마다 점(올리면 −, 내리면 +), 새 전쟁 하나마다 −, 전쟁 하루마다(전쟁 하나당) −, 끝난 전쟁(강화) 하나마다 +, 얻은 도시 하나마다 +, 잃은 도시 하나마다 −,
   * 하루마다 주민 만족도(×10) 쪽으로 다가가는 몫(‰). 모두 [임시] 출발값
   */
  readonly approvalNeutralPm: number;
  readonly approvalTaxPerPm: number;
  readonly approvalWarStart: number;
  readonly approvalWarDaily: number;
  readonly approvalPeace: number;
  readonly approvalCityWon: number;
  readonly approvalCityLost: number;
  readonly approvalSatisfactionPullPm: number;
  /**
   * 지도자 손 조절의 목표 물가 상한(D-588 2499·D-131 — 물가 지수 천분율): 출발값·지도자가 고를 수 있는 아래·위 끝. 물가 지수가 상한 이상이면 손 조절 발행을 막는다(소각은 그대로)
   */
  readonly monetaryCapMilli: number;
  readonly monetaryCapMinMilli: number;
  readonly monetaryCapMaxMilli: number;
  /**
   * 지도자끼리 조약(사용자 결정 D-588 — 질문 2497·2498, docs/adr/2026-11-21-diplomacy-treaties.md, 서버 diplomacy/만 읽는다): 조약 기간 상한(날)·보호 조약 공물 상한(‰ —
   * D-444 [임시] 공물 5%)·참전 요청 답 기한(ms — D-291 해석 "선포부터 공성 시각까지(실제 1일 안)")·NPC가 불가침·동맹·보호를 받는 차분함 문턱(‰ — 1000 − 공격 성향) [임시]
   */
  readonly treatyMaxDays: number;
  readonly tributeMaxPm: number;
  readonly warRequestMs: number;
  readonly npcTreatyCalmPm: number;
  /**
   * 조약 위반(줄기 fixes-1117c — 기획 D-255 "조약을 어기면 모두가 보는 신뢰가 떨어진다"·D-290 명분 "제재"): 위반 한 번마다 그 나라 세력 신뢰(−100~100, 시작 0)에서 빼는 몫,
   * 위반 기록이 제재 명분이 되는 기간(ms), 제재 명분이 NPC 치기 점수의 무명분 선포 몫에서 덜어 내는 몫(무명분 몫까지만) — 모두 [임시]
   */
  readonly breachTrustPenalty: number;
  readonly sanctionWindowMs: number;
  readonly sanctionCauseBonus: number;
  /**
   * 세력 쌍 호감(줄기 gov-fix-4 — 사용자 결정 D-591 2531, 기획 D-255 "관계 점수: 호감·신뢰"·D-290 "명분 없이 선포하면 모든 세력과의 관계 점수가 크게 떨어진다"·
   * D-291 "참전 요청을 거절하면 그 동맹과의 관계 점수가 떨어진다"): 가문 독립 때 옛 나라와, 무명분 선포 때 모든 나라와, 참전 거절 때 그 동맹과 내리는 몫 — 모두 [임시]
   */
  readonly independenceAffinity: number;
  readonly noCauseAffinity: number;
  readonly joinRefuseAffinity: number;
  /** 국고 지분 사기·팔기 안건의 집행 기간(ms — D-591 2526 "주-월 단위 기간", 기간이 지나면 이어 할지 재투표) [임시 14일] */
  readonly shareExecMs: number;
  /**
   * 위반 기록을 잊는 기간(ms, 0 = 잊지 않음 — 줄기 fixes-d592, 사용자 결정 D-592 2583 다 "기간이 지나면 위반을 잊고 신뢰가 돌아온다") [임시 출발값]. 신뢰·제재 명분은 남은 기록에서 셈한다
   */
  readonly breachExpireMs: number;
  /**
   * 호감이 오르는 길(줄기 npc-diplo — 질문 2662, 기술 출발값 [임시] — 모양은 질문 2722): 하루마다 0 쪽으로 돌아오는 몫, 그날 맺은 채 지킨 불가침·동맹·보호 조약이 있는 쌍이
   * 0 쪽으로 돌아오는 대신 받는 몫, 강화(두 나라 전쟁이 끝남)마다 몫, 참전 요청을 받아 들어간 두 나라 몫
   */
  readonly affinityDriftPerDay: number;
  readonly treatyKeptAffinity: number;
  readonly peaceAffinity: number;
  readonly joinAcceptAffinity: number;
  /**
   * 기본(시작) NPC 국가 지키기(줄기 d593 — 사용자 결정 D-593 2621 "쿠데타가 일어나지않게 최적화 되게 관리한다. 유저보다는 npc유닛들의 국가내 서열을 확보한다") [임시 출발값]:
   * 그 나라 NPC 가문의 쿠데타 점수 낮춤(충성 — 성향 보정, 막기가 아니다: fixes-1117j 2713), 쿠데타를 여는 힘 비(‰ — 그 도시에 와 있는 내 병력 ≥ 정부군 × 이 값 ÷ 1000, NPC 가문도
   * 같은 배율 — fixes-1117j, 0 = 보지 않음),
   * NPC 서열 지키기(1 = 플레이어 가문은 지도자 선출에 나서지 못하고 NPC 표는 NPC 가문 후보 먼저, 0 = 끔)
   */
  readonly fixedCoupLoyalty?: number | undefined;
  readonly fixedCoupPowerPm?: number | undefined;
  readonly fixedNpcRank?: number | undefined;
}

export const START_GOVERNANCE: GovernanceCoefficients = {
  periodLeaderMs: 72 * 3_600_000,
  periodWarMs: 6 * 3_600_000,
  quorumLeaderPm: 500,
  quorumWarPm: 300,
  thresholdPm: 500,
  thresholdRegimePm: 666,
  thresholdRemovalPm: 666,
  termMs: 14 * 86_400_000,
  registerMs: 24 * 3_600_000,
  graceRegimeMs: 7 * 86_400_000,
  proposeSharePm: 50,
  openPerProposer: 1,
  autoElections: 1,
  warAgenda: 1,
  npcKeepSatisfaction: 50,
  npcWarTraitPm: 600,
  npcRunScore: 20,
  npcRunMax: 1,
  vacancyElectionMs: 72 * 3_600_000,
  coupSatisfactionDrop: 30,
  taxAgendaWidthPm: 50,
  coupEnabled: 0,
  coupCooldownMs: 604800000,
  coupGatherMs: 21600000,
  coupFailCost: 50000,
  coupFailSatisfactionDrop: 20,
  coupNpcScore: 40,
  coupNpcPowerPm: 1000,
  coupBattleUnits: 30,
  coupMeritRenown: 50,
  coupCreditReward: 10,
  coupProtectMs: 0,
  thresholdCurrencyPm: 666,
  peaceOfferMs: 3 * 86_400_000,
  houseIndependenceNpcScore: 40,
  houseIndependencePowerPm: 1000,
  approvalPlayerStart: 300,
  approvalNpcStart: 500,
  approvalRemovalEasePm: 300,
  approvalRebellionEase: 15,
  approvalNeutralPm: 500,
  approvalTaxPerPm: 3,
  approvalWarStart: 30,
  approvalWarDaily: 10,
  approvalPeace: 40,
  approvalCityWon: 50,
  approvalCityLost: 80,
  approvalSatisfactionPullPm: 100,
  monetaryCapMilli: 1300,
  monetaryCapMinMilli: 1000,
  monetaryCapMaxMilli: 3000,
  treatyMaxDays: 30,
  tributeMaxPm: 50,
  warRequestMs: 86_400_000,
  npcTreatyCalmPm: 500,
  breachTrustPenalty: 30,
  sanctionWindowMs: 30 * 86_400_000,
  sanctionCauseBonus: 150,
  independenceAffinity: 80,
  noCauseAffinity: 30,
  joinRefuseAffinity: 20,
  shareExecMs: 14 * 86_400_000,
  breachExpireMs: 90 * 86_400_000,
  affinityDriftPerDay: 1,
  treatyKeptAffinity: 1,
  peaceAffinity: 10,
  joinAcceptAffinity: 10,
  fixedCoupLoyalty: 40,
  fixedCoupPowerPm: 3000,
  fixedNpcRank: 1,
};
