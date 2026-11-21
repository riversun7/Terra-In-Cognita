// NPC 자율행동·7축 성향·조직 합성·충성도 개입 계수표 — docs/adr/2026-11-20-npc-autonomous-ai.md
// 세력·사회 계수표의 npcAi 칸(팩 tuning 경로 "npcAi.*"). 모든 수치와 구간(min~max)·합성 비율(합 1000‰)·충성도 곡선은
// 개발자 패널(/dev/npc-ai 및 /dev/tuning npc 페이지)에서 배포 없이 실시간 조절할 수 있다.
import {
  type AiBlendRules,
  DEFAULT_AI_BLEND_RULES,
  DEFAULT_LOYALTY_OVERRIDE_RULES,
  DEFAULT_ROLE_TRAIT_RANGES,
  type LoyaltyOverrideRules,
  type TraitRangeMap,
  type TraitRole,
} from "@terra/shared/unitTraits";

/** NPC AI 통합 계수표(1단계: 생성 구간 · 체제별 합성 · 충성도 개입 · 탐색 온도 · 비상 스위치) */
export interface NpcAiCoefficients {
  /** 1. 유닛 개별 성향 생성 전역 범위(0~1000)와 소속 바탕 편차(±spread) */
  readonly unitTraitMin: number;
  readonly unitTraitMax: number;
  readonly unitTraitSpread: number;
  /** 경비대(guard) 핵심 축 생성 구간 */
  readonly guardBelligerenceMin: number;
  readonly guardBelligerenceMax: number;
  readonly guardBoldnessMin: number;
  readonly guardBoldnessMax: number;
  readonly guardDisciplineMin: number;
  readonly guardDisciplineMax: number;
  /** 지도자(leader) 핵심 축 생성 구간 */
  readonly leaderBoldnessMin: number;
  readonly leaderBoldnessMax: number;
  readonly leaderAutonomyMin: number;
  readonly leaderAutonomyMax: number;

  /** 2. 조직 성향 합성 비율(체제·가문·도시별 결단/문화 축, 합 1000‰) */
  readonly dictDecLeaderPm: number;
  readonly dictDecMembersPm: number;
  readonly dictDecBasePm: number;
  readonly dictCulLeaderPm: number;
  readonly dictCulMembersPm: number;
  readonly dictCulBasePm: number;

  readonly demoDecLeaderPm: number;
  readonly demoDecMembersPm: number;
  readonly demoDecBasePm: number;
  readonly demoCulLeaderPm: number;
  readonly demoCulMembersPm: number;
  readonly demoCulBasePm: number;

  readonly capDecLeaderPm: number;
  readonly capDecMembersPm: number;
  readonly capDecBasePm: number;
  readonly capCulLeaderPm: number;
  readonly capCulMembersPm: number;
  readonly capCulBasePm: number;

  readonly houseDecLeaderPm: number;
  readonly houseDecMembersPm: number;
  readonly houseCulLeaderPm: number;
  readonly houseCulMembersPm: number;

  readonly cityDecMayorPm: number;
  readonly cityDecNationPm: number;
  readonly cityCulMayorPm: number;
  readonly cityCulCitizensPm: number;
  readonly cityCulNationPm: number;

  /** 조직 평균 충성도 감쇠(floor 이하에서 대장 비중을 minSharePm까지 줄여 구성원 쪽으로 넘긴다) */
  readonly orgLoyaltyFloor: number;
  readonly orgLoyaltyMinSharePm: number;

  /** 3. 충성도(=만족도, D-253) 연동 플레이어 유닛 개성 개입 곡선(‰) */
  readonly loyaltyOverride100Pm: number;
  readonly loyaltyOverride80Pm: number;
  readonly loyaltyOverride50Pm: number;
  readonly loyaltyOverride20Pm: number;
  readonly loyaltyOverride0Pm: number;
  readonly loyaltyOverrideMinPm: number;
  readonly loyaltyOverrideMaxPm: number;
  readonly loyaltyAutonomyWeightPm: number;
  readonly loyaltyDisciplineWeightPm: number;
  readonly loyaltyCommunalismWeightPm: number;
  readonly creatureInstinctPm: number;

  /** 4. 분대 지휘관 성향 반영 비중(‰, 0 = 유닛 100%, 1000 = 지휘관 100%) */
  readonly commanderSharePm: number;

  /** 5. 전략 판단 탐색 온도(‰, 0 = 완전 결정적 최고 점수, 1~1000 = 상위 후보 점수차 비례 가중 추첨) */
  readonly decisionTempPm: number;

  /** 6. 유닛 일상·가문 AI 재평가 주기·최소 체류 시간 구간(ms, 3단계 FSM·가문 AI 공용) */
  readonly unitReevalMinMs: number;
  readonly unitReevalMaxMs: number;
  readonly unitDwellMinMs: number;
  readonly unitDwellMaxMs: number;
  readonly guardPatrolMinCells: number;
  readonly guardPatrolMaxCells: number;
  readonly leaderRoamRadiusCells: number;
  readonly houseDecideMinMs: number;
  readonly houseDecideMaxMs: number;

  /** 7. 런타임 비상 스위치(0 = 끔, 1 = 켬) */
  readonly unitAiEnabled: number;
  readonly houseAiEnabled: number;

  /** 8. 2차 지수·가문 일 지시·가문 금고(docs/adr/2026-11-21-npc-needs-drives.md — unitDrives.ts·houseOrders.ts) */
  readonly driveWorkMoodFloorPm: number;
  readonly driveWorkHungerFloorPm: number;
  readonly houseCheckMs: number;
  readonly houseUnfedBelowPm: number;
  readonly houseFoodShortSharePm: number;
  readonly houseMoraleLowBelow: number;
  readonly houseRefuseBelowPm: number;
  readonly houseTaxPm: number;
  readonly houseCareMinPm: number;
  readonly houseCareMaxPm: number;
  /** 가문 연맹(houseLeague.ts·leagueBrain.ts): 분담금 몫(‰)·확장/생산 지원 최소 묶음(최소 단위) */
  readonly leagueDuesPm: number;
  readonly leagueLot: number;
  /** 비접속 유저 유닛 관리인(서버 labor/offlineSteward.ts): 스위치·움직이기까지의 비접속 시간(ms) */
  readonly offlineStewardEnabled: number;
  readonly offlineStewardAfterMs: number;
}

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

export const DEFAULT_NPC_AI_COEFFICIENTS: NpcAiCoefficients = {
  unitTraitMin: 100,
  unitTraitMax: 900,
  unitTraitSpread: 200,
  guardBelligerenceMin: DEFAULT_ROLE_TRAIT_RANGES.guard.belligerence.min,
  guardBelligerenceMax: DEFAULT_ROLE_TRAIT_RANGES.guard.belligerence.max,
  guardBoldnessMin: DEFAULT_ROLE_TRAIT_RANGES.guard.boldness.min,
  guardBoldnessMax: DEFAULT_ROLE_TRAIT_RANGES.guard.boldness.max,
  guardDisciplineMin: DEFAULT_ROLE_TRAIT_RANGES.guard.discipline.min,
  guardDisciplineMax: DEFAULT_ROLE_TRAIT_RANGES.guard.discipline.max,
  leaderBoldnessMin: DEFAULT_ROLE_TRAIT_RANGES.leader.boldness.min,
  leaderBoldnessMax: DEFAULT_ROLE_TRAIT_RANGES.leader.boldness.max,
  leaderAutonomyMin: DEFAULT_ROLE_TRAIT_RANGES.leader.autonomy.min,
  leaderAutonomyMax: DEFAULT_ROLE_TRAIT_RANGES.leader.autonomy.max,

  dictDecLeaderPm: DEFAULT_AI_BLEND_RULES.dictatorship.decision.leaderPm,
  dictDecMembersPm: DEFAULT_AI_BLEND_RULES.dictatorship.decision.membersPm,
  dictDecBasePm: DEFAULT_AI_BLEND_RULES.dictatorship.decision.basePm,
  dictCulLeaderPm: DEFAULT_AI_BLEND_RULES.dictatorship.culture.leaderPm,
  dictCulMembersPm: DEFAULT_AI_BLEND_RULES.dictatorship.culture.membersPm,
  dictCulBasePm: DEFAULT_AI_BLEND_RULES.dictatorship.culture.basePm,

  demoDecLeaderPm: DEFAULT_AI_BLEND_RULES.democracy.decision.leaderPm,
  demoDecMembersPm: DEFAULT_AI_BLEND_RULES.democracy.decision.membersPm,
  demoDecBasePm: DEFAULT_AI_BLEND_RULES.democracy.decision.basePm,
  demoCulLeaderPm: DEFAULT_AI_BLEND_RULES.democracy.culture.leaderPm,
  demoCulMembersPm: DEFAULT_AI_BLEND_RULES.democracy.culture.membersPm,
  demoCulBasePm: DEFAULT_AI_BLEND_RULES.democracy.culture.basePm,

  capDecLeaderPm: DEFAULT_AI_BLEND_RULES.capitalism.decision.leaderPm,
  capDecMembersPm: DEFAULT_AI_BLEND_RULES.capitalism.decision.membersPm,
  capDecBasePm: DEFAULT_AI_BLEND_RULES.capitalism.decision.basePm,
  capCulLeaderPm: DEFAULT_AI_BLEND_RULES.capitalism.culture.leaderPm,
  capCulMembersPm: DEFAULT_AI_BLEND_RULES.capitalism.culture.membersPm,
  capCulBasePm: DEFAULT_AI_BLEND_RULES.capitalism.culture.basePm,

  houseDecLeaderPm: DEFAULT_AI_BLEND_RULES.house.decision.leaderPm,
  houseDecMembersPm: DEFAULT_AI_BLEND_RULES.house.decision.membersPm,
  houseCulLeaderPm: DEFAULT_AI_BLEND_RULES.house.culture.leaderPm,
  houseCulMembersPm: DEFAULT_AI_BLEND_RULES.house.culture.membersPm,

  cityDecMayorPm: DEFAULT_AI_BLEND_RULES.city.decision.leaderPm,
  cityDecNationPm: DEFAULT_AI_BLEND_RULES.city.decision.basePm,
  cityCulMayorPm: DEFAULT_AI_BLEND_RULES.city.culture.leaderPm,
  cityCulCitizensPm: DEFAULT_AI_BLEND_RULES.city.culture.membersPm,
  cityCulNationPm: DEFAULT_AI_BLEND_RULES.city.culture.basePm,

  orgLoyaltyFloor: DEFAULT_AI_BLEND_RULES.orgLoyaltyFloor,
  orgLoyaltyMinSharePm: DEFAULT_AI_BLEND_RULES.orgLoyaltyMinSharePm,

  loyaltyOverride100Pm: DEFAULT_LOYALTY_OVERRIDE_RULES.at100Pm,
  loyaltyOverride80Pm: DEFAULT_LOYALTY_OVERRIDE_RULES.at80Pm,
  loyaltyOverride50Pm: DEFAULT_LOYALTY_OVERRIDE_RULES.at50Pm,
  loyaltyOverride20Pm: DEFAULT_LOYALTY_OVERRIDE_RULES.at20Pm,
  loyaltyOverride0Pm: DEFAULT_LOYALTY_OVERRIDE_RULES.at0Pm,
  loyaltyOverrideMinPm: DEFAULT_LOYALTY_OVERRIDE_RULES.minPm,
  loyaltyOverrideMaxPm: DEFAULT_LOYALTY_OVERRIDE_RULES.maxPm,
  loyaltyAutonomyWeightPm: DEFAULT_LOYALTY_OVERRIDE_RULES.autonomyWeightPm,
  loyaltyDisciplineWeightPm: DEFAULT_LOYALTY_OVERRIDE_RULES.disciplineWeightPm,
  loyaltyCommunalismWeightPm: DEFAULT_LOYALTY_OVERRIDE_RULES.communalismWeightPm,
  creatureInstinctPm: DEFAULT_LOYALTY_OVERRIDE_RULES.creatureInstinctPm,

  commanderSharePm: 400,
  decisionTempPm: 0,

  unitReevalMinMs: 20_000,
  unitReevalMaxMs: 90_000,
  unitDwellMinMs: 45_000,
  unitDwellMaxMs: 3 * MIN_MS,
  guardPatrolMinCells: 8,
  guardPatrolMaxCells: 36,
  leaderRoamRadiusCells: 18,
  houseDecideMinMs: 4 * HOUR_MS,
  houseDecideMaxMs: 8 * HOUR_MS,

  unitAiEnabled: 1,
  houseAiEnabled: 1,

  driveWorkMoodFloorPm: 400,
  driveWorkHungerFloorPm: 500,
  houseCheckMs: 300_000,
  houseUnfedBelowPm: 500,
  houseFoodShortSharePm: 300,
  houseMoraleLowBelow: 45,
  houseRefuseBelowPm: 600,
  houseTaxPm: 100,
  houseCareMinPm: 100,
  houseCareMaxPm: 900,
  leagueDuesPm: 200,
  leagueLot: 500,
  offlineStewardEnabled: 1,
  offlineStewardAfterMs: 10 * MIN_MS,
};

/** 계수표 → 조직 합성 규칙 */
export function blendRulesFromAi(c: NpcAiCoefficients): AiBlendRules {
  return {
    dictatorship: {
      decision: { leaderPm: c.dictDecLeaderPm, membersPm: c.dictDecMembersPm, basePm: c.dictDecBasePm },
      culture: { leaderPm: c.dictCulLeaderPm, membersPm: c.dictCulMembersPm, basePm: c.dictCulBasePm },
    },
    democracy: {
      decision: { leaderPm: c.demoDecLeaderPm, membersPm: c.demoDecMembersPm, basePm: c.demoDecBasePm },
      culture: { leaderPm: c.demoCulLeaderPm, membersPm: c.demoCulMembersPm, basePm: c.demoCulBasePm },
    },
    capitalism: {
      decision: { leaderPm: c.capDecLeaderPm, membersPm: c.capDecMembersPm, basePm: c.capDecBasePm },
      culture: { leaderPm: c.capCulLeaderPm, membersPm: c.capCulMembersPm, basePm: c.capCulBasePm },
    },
    house: {
      decision: { leaderPm: c.houseDecLeaderPm, membersPm: c.houseDecMembersPm, basePm: 0 },
      culture: { leaderPm: c.houseCulLeaderPm, membersPm: c.houseCulMembersPm, basePm: 0 },
    },
    city: {
      decision: { leaderPm: c.cityDecMayorPm, membersPm: 0, basePm: c.cityDecNationPm },
      culture: { leaderPm: c.cityCulMayorPm, membersPm: c.cityCulCitizensPm, basePm: c.cityCulNationPm },
    },
    orgLoyaltyFloor: c.orgLoyaltyFloor,
    orgLoyaltyMinSharePm: c.orgLoyaltyMinSharePm,
  };
}

/** 계수표 → 충성도 개입 규칙 */
export function loyaltyRulesFromAi(c: NpcAiCoefficients): LoyaltyOverrideRules {
  return {
    at100Pm: c.loyaltyOverride100Pm,
    at80Pm: c.loyaltyOverride80Pm,
    at50Pm: c.loyaltyOverride50Pm,
    at20Pm: c.loyaltyOverride20Pm,
    at0Pm: c.loyaltyOverride0Pm,
    minPm: c.loyaltyOverrideMinPm,
    maxPm: c.loyaltyOverrideMaxPm,
    autonomyWeightPm: c.loyaltyAutonomyWeightPm,
    disciplineWeightPm: c.loyaltyDisciplineWeightPm,
    communalismWeightPm: c.loyaltyCommunalismWeightPm,
    creatureInstinctPm: c.creatureInstinctPm,
  };
}

/** 계수표 → 직군별 7축 생성 범위 */
export function roleRangesFromAi(role: TraitRole, c: NpcAiCoefficients): TraitRangeMap {
  const base = DEFAULT_ROLE_TRAIT_RANGES[role];
  const clampPair = (min: number, max: number) => ({
    min: Math.max(c.unitTraitMin, Math.min(c.unitTraitMax, min)),
    max: Math.max(c.unitTraitMin, Math.min(c.unitTraitMax, max)),
  });
  if (role === "guard") {
    return {
      ...base,
      belligerence: { min: c.guardBelligerenceMin, max: c.guardBelligerenceMax },
      boldness: { min: c.guardBoldnessMin, max: c.guardBoldnessMax },
      discipline: { min: c.guardDisciplineMin, max: c.guardDisciplineMax },
    };
  }
  if (role === "leader") {
    return {
      ...base,
      boldness: { min: c.leaderBoldnessMin, max: c.leaderBoldnessMax },
      autonomy: { min: c.leaderAutonomyMin, max: c.leaderAutonomyMax },
    };
  }
  return {
    belligerence: clampPair(base.belligerence.min, base.belligerence.max),
    greed: clampPair(base.greed.min, base.greed.max),
    boldness: clampPair(base.boldness.min, base.boldness.max),
    communalism: clampPair(base.communalism.min, base.communalism.max),
    autonomy: clampPair(base.autonomy.min, base.autonomy.max),
    openness: clampPair(base.openness.min, base.openness.max),
    discipline: clampPair(base.discipline.min, base.discipline.max),
  };
}
