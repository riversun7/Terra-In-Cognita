// NPC 자율행동·7축 성향·조직 합성·충성도 개입 설정 칸 — docs/adr/2026-11-20-npc-autonomous-ai.md
// 팩 항목 ID(npc_ai_*) ↔ 세력·사회 계수표 npcAi 칸(경로 "npcAi.*"). 모든 구간은 *_min / *_max 쌍이고,
// 합성 비율은 합 1000‰이며 tuningChecks.ts(ai_range_order·ai_blend_sum)가 교차 검사한다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `npcAi.${path}`,
  structural: false,
  ko,
  en,
});

export const NPC_AI_TUNING_KEYS: readonly TuningKey[] = [
  // 1. 유닛 개별 성향 생성 범위·편차
  k("npc_ai_unit_trait_min", "unitTraitMin", "유닛 7축 성향 생성 전역 최소", "Unit 7-axis trait global min"),
  k("npc_ai_unit_trait_max", "unitTraitMax", "유닛 7축 성향 생성 전역 최대", "Unit 7-axis trait global max"),
  k(
    "npc_ai_unit_trait_spread",
    "unitTraitSpread",
    "소속 바탕 기준 유닛 성향 편차(±)",
    "Unit trait spread around home anchor (±)",
  ),
  k(
    "npc_ai_guard_belligerence_min",
    "guardBelligerenceMin",
    "경비대 호전성 생성 최소",
    "Guard belligerence min",
  ),
  k(
    "npc_ai_guard_belligerence_max",
    "guardBelligerenceMax",
    "경비대 호전성 생성 최대",
    "Guard belligerence max",
  ),
  k("npc_ai_guard_boldness_min", "guardBoldnessMin", "경비대 과감성 생성 최소", "Guard boldness min"),
  k("npc_ai_guard_boldness_max", "guardBoldnessMax", "경비대 과감성 생성 최대", "Guard boldness max"),
  k("npc_ai_guard_discipline_min", "guardDisciplineMin", "경비대 규율성 생성 최소", "Guard discipline min"),
  k("npc_ai_guard_discipline_max", "guardDisciplineMax", "경비대 규율성 생성 최대", "Guard discipline max"),
  k("npc_ai_leader_boldness_min", "leaderBoldnessMin", "지도자 과감성 생성 최소", "Leader boldness min"),
  k("npc_ai_leader_boldness_max", "leaderBoldnessMax", "지도자 과감성 생성 최대", "Leader boldness max"),
  k("npc_ai_leader_autonomy_min", "leaderAutonomyMin", "지도자 자치성 생성 최소", "Leader autonomy min"),
  k("npc_ai_leader_autonomy_max", "leaderAutonomyMax", "지도자 자치성 생성 최대", "Leader autonomy max"),

  // 2. 체제별·축 성격별(결단 vs 문화) 조직 성향 합성 비율(합 1000‰)
  k(
    "npc_ai_dict_dec_leader_pm",
    "dictDecLeaderPm",
    "독재 결단 축: 대장 비중(‰)",
    "Dictatorship decision: leader share (‰)",
  ),
  k(
    "npc_ai_dict_dec_members_pm",
    "dictDecMembersPm",
    "독재 결단 축: 가문장 비중(‰)",
    "Dictatorship decision: houses share (‰)",
  ),
  k(
    "npc_ai_dict_dec_base_pm",
    "dictDecBasePm",
    "독재 결단 축: 국가 바탕 비중(‰)",
    "Dictatorship decision: base share (‰)",
  ),
  k(
    "npc_ai_dict_cul_leader_pm",
    "dictCulLeaderPm",
    "독재 문화 축: 대장 비중(‰)",
    "Dictatorship culture: leader share (‰)",
  ),
  k(
    "npc_ai_dict_cul_members_pm",
    "dictCulMembersPm",
    "독재 문화 축: 가문장 비중(‰)",
    "Dictatorship culture: houses share (‰)",
  ),
  k(
    "npc_ai_dict_cul_base_pm",
    "dictCulBasePm",
    "독재 문화 축: 국가 바탕 비중(‰)",
    "Dictatorship culture: base share (‰)",
  ),

  k(
    "npc_ai_demo_dec_leader_pm",
    "demoDecLeaderPm",
    "민주 결단 축: 지도자 비중(‰)",
    "Democracy decision: leader share (‰)",
  ),
  k(
    "npc_ai_demo_dec_members_pm",
    "demoDecMembersPm",
    "민주 결단 축: 가문장 비중(‰)",
    "Democracy decision: houses share (‰)",
  ),
  k(
    "npc_ai_demo_dec_base_pm",
    "demoDecBasePm",
    "민주 결단 축: 국가 바탕 비중(‰)",
    "Democracy decision: base share (‰)",
  ),
  k(
    "npc_ai_demo_cul_leader_pm",
    "demoCulLeaderPm",
    "민주 문화 축: 지도자 비중(‰)",
    "Democracy culture: leader share (‰)",
  ),
  k(
    "npc_ai_demo_cul_members_pm",
    "demoCulMembersPm",
    "민주 문화 축: 가문장 비중(‰)",
    "Democracy culture: houses share (‰)",
  ),
  k(
    "npc_ai_demo_cul_base_pm",
    "demoCulBasePm",
    "민주 문화 축: 국가 바탕 비중(‰)",
    "Democracy culture: base share (‰)",
  ),

  k(
    "npc_ai_cap_dec_leader_pm",
    "capDecLeaderPm",
    "자본 결단 축: 지도자 비중(‰)",
    "Capitalism decision: leader share (‰)",
  ),
  k(
    "npc_ai_cap_dec_members_pm",
    "capDecMembersPm",
    "자본 결단 축: 지분 가문 비중(‰)",
    "Capitalism decision: share-weighted houses (‰)",
  ),
  k(
    "npc_ai_cap_dec_base_pm",
    "capDecBasePm",
    "자본 결단 축: 국가 바탕 비중(‰)",
    "Capitalism decision: base share (‰)",
  ),
  k(
    "npc_ai_cap_cul_leader_pm",
    "capCulLeaderPm",
    "자본 문화 축: 지도자 비중(‰)",
    "Capitalism culture: leader share (‰)",
  ),
  k(
    "npc_ai_cap_cul_members_pm",
    "capCulMembersPm",
    "자본 문화 축: 지분 가문 비중(‰)",
    "Capitalism culture: share-weighted houses (‰)",
  ),
  k(
    "npc_ai_cap_cul_base_pm",
    "capCulBasePm",
    "자본 문화 축: 국가 바탕 비중(‰)",
    "Capitalism culture: base share (‰)",
  ),

  k(
    "npc_ai_house_dec_leader_pm",
    "houseDecLeaderPm",
    "가문 결단 축: 가문장 비중(‰)",
    "House decision: head share (‰)",
  ),
  k(
    "npc_ai_house_dec_members_pm",
    "houseDecMembersPm",
    "가문 결단 축: 가문원 비중(‰)",
    "House decision: members share (‰)",
  ),
  k(
    "npc_ai_house_cul_leader_pm",
    "houseCulLeaderPm",
    "가문 문화 축: 가문장 비중(‰)",
    "House culture: head share (‰)",
  ),
  k(
    "npc_ai_house_cul_members_pm",
    "houseCulMembersPm",
    "가문 문화 축: 가문원 비중(‰)",
    "House culture: members share (‰)",
  ),

  k(
    "npc_ai_city_dec_mayor_pm",
    "cityDecMayorPm",
    "도시 결단 축: 시장 비중(‰)",
    "City decision: mayor share (‰)",
  ),
  k(
    "npc_ai_city_dec_nation_pm",
    "cityDecNationPm",
    "도시 결단 축: 국가 비중(‰)",
    "City decision: nation share (‰)",
  ),
  k(
    "npc_ai_city_cul_mayor_pm",
    "cityCulMayorPm",
    "도시 문화 축: 시장 비중(‰)",
    "City culture: mayor share (‰)",
  ),
  k(
    "npc_ai_city_cul_citizens_pm",
    "cityCulCitizensPm",
    "도시 문화 축: 시민 비중(‰)",
    "City culture: citizens share (‰)",
  ),
  k(
    "npc_ai_city_cul_nation_pm",
    "cityCulNationPm",
    "도시 문화 축: 국가 비중(‰)",
    "City culture: nation share (‰)",
  ),

  k(
    "npc_ai_org_loyalty_floor",
    "orgLoyaltyFloor",
    "조직 충성도 대장 비중 감쇠 시작점",
    "Org loyalty floor for leader weight decay",
  ),
  k(
    "npc_ai_org_loyalty_min_share_pm",
    "orgLoyaltyMinSharePm",
    "충성도 0일 때 남는 대장 비중 하한(‰)",
    "Min leader weight kept at 0 loyalty (‰)",
  ),

  // 3. 충성도(=만족도) 연동 개성 개입 곡선
  k(
    "npc_ai_loyalty_ov_100_pm",
    "loyaltyOverride100Pm",
    "충성도 100 개성 개입률(‰)",
    "Trait override at loyalty 100 (‰)",
  ),
  k(
    "npc_ai_loyalty_ov_80_pm",
    "loyaltyOverride80Pm",
    "충성도 80 개성 개입률(‰)",
    "Trait override at loyalty 80 (‰)",
  ),
  k(
    "npc_ai_loyalty_ov_50_pm",
    "loyaltyOverride50Pm",
    "충성도 50 개성 개입률(‰)",
    "Trait override at loyalty 50 (‰)",
  ),
  k(
    "npc_ai_loyalty_ov_20_pm",
    "loyaltyOverride20Pm",
    "충성도 20 개성 개입률(‰)",
    "Trait override at loyalty 20 (‰)",
  ),
  k(
    "npc_ai_loyalty_ov_0_pm",
    "loyaltyOverride0Pm",
    "충성도 0 개성 개입률(‰)",
    "Trait override at loyalty 0 (‰)",
  ),
  k(
    "npc_ai_loyalty_ov_min_pm",
    "loyaltyOverrideMinPm",
    "개성 개입률 하한(‰)",
    "Trait override min floor (‰)",
  ),
  k("npc_ai_loyalty_ov_max_pm", "loyaltyOverrideMaxPm", "개성 개입률 상한(‰)", "Trait override max cap (‰)"),
  k(
    "npc_ai_loyalty_autonomy_pm",
    "loyaltyAutonomyWeightPm",
    "개입률 자치성(+) 보정 세기(‰)",
    "Override autonomy (+) weight (‰)",
  ),
  k(
    "npc_ai_loyalty_discipline_pm",
    "loyaltyDisciplineWeightPm",
    "개입률 규율성(−) 보정 세기(‰)",
    "Override discipline (-) weight (‰)",
  ),
  k(
    "npc_ai_loyalty_communalism_pm",
    "loyaltyCommunalismWeightPm",
    "개입률 공동체(−) 보정 세기(‰)",
    "Override communalism (-) weight (‰)",
  ),
  k(
    "npc_ai_creature_instinct_pm",
    "creatureInstinctPm",
    "크리쳐 고정 야생 본능 개입률(‰)",
    "Creature wild instinct override (‰)",
  ),

  // 4. 지휘관·탐색·일상 구간·비상 스위치
  k(
    "npc_ai_commander_share_pm",
    "commanderSharePm",
    "전투·조우 분대 지휘관 성향 비중(‰)",
    "Squad commander trait share (‰)",
  ),
  k(
    "npc_ai_decision_temp_pm",
    "decisionTempPm",
    "전략 판단 탐색 온도(‰, 0=최고점 고정)",
    "Decision temperature (‰, 0=deterministic max)",
  ),
  k(
    "npc_ai_unit_reeval_min_ms",
    "unitReevalMinMs",
    "유닛 자율행동 재평가 주기 최소(ms)",
    "Unit AI re-eval min interval (ms)",
  ),
  k(
    "npc_ai_unit_reeval_max_ms",
    "unitReevalMaxMs",
    "유닛 자율행동 재평가 주기 최대(ms)",
    "Unit AI re-eval max interval (ms)",
  ),
  k(
    "npc_ai_unit_dwell_min_ms",
    "unitDwellMinMs",
    "유닛 상태 최소 체류 시간 하한(ms)",
    "Unit state dwell min (ms)",
  ),
  k(
    "npc_ai_unit_dwell_max_ms",
    "unitDwellMaxMs",
    "유닛 상태 최소 체류 시간 상한(ms)",
    "Unit state dwell max (ms)",
  ),
  k(
    "npc_ai_guard_patrol_min_cells",
    "guardPatrolMinCells",
    "경비대 순찰 반경 최소(칸)",
    "Guard patrol radius min (cells)",
  ),
  k(
    "npc_ai_guard_patrol_max_cells",
    "guardPatrolMaxCells",
    "경비대 순찰 반경 최대(칸)",
    "Guard patrol radius max (cells)",
  ),
  k(
    "npc_ai_leader_roam_cells",
    "leaderRoamRadiusCells",
    "지도자 수도 순회 반경(칸, 0=고정)",
    "Leader capital roam radius (cells, 0=fixed)",
  ),
  k(
    "npc_ai_house_decide_min_ms",
    "houseDecideMinMs",
    "NPC 가문 AI 판단 주기 최소(ms)",
    "NPC house AI decision min interval (ms)",
  ),
  k(
    "npc_ai_house_decide_max_ms",
    "houseDecideMaxMs",
    "NPC 가문 AI 판단 주기 최대(ms)",
    "NPC house AI decision max interval (ms)",
  ),
  k(
    "npc_ai_unit_enabled",
    "unitAiEnabled",
    "유닛 개별 자율행동 AI 스위치(0=끔, 1=켬)",
    "Unit autonomous AI switch (0=off, 1=on)",
  ),
  k(
    "npc_ai_house_enabled",
    "houseAiEnabled",
    "NPC 가문 AI 스위치(0=끔, 1=켬)",
    "NPC house AI switch (0=off, 1=on)",
  ),
  // 8. 2차 지수·가문 일 지시·가문 금고(docs/adr/2026-11-21-npc-needs-drives.md)
  k(
    "npc_ai_drive_work_mood_floor_pm",
    "driveWorkMoodFloorPm",
    "근로 의욕: 만족도 0일 때 배율(‰)",
    "Work drive: multiplier at satisfaction 0 (‰)",
  ),
  k(
    "npc_ai_drive_work_hunger_floor_pm",
    "driveWorkHungerFloorPm",
    "근로 의욕: 식사 몫 0일 때 배율(‰)",
    "Work drive: multiplier at food share 0 (‰)",
  ),
  k("npc_ai_house_check_ms", "houseCheckMs", "가문 상태 점검 주기(ms)", "House status check interval (ms)"),
  k(
    "npc_ai_house_unfed_below_pm",
    "houseUnfedBelowPm",
    "가문 점검: 못 먹음으로 세는 식사 몫 문턱(‰)",
    "House check: food share counted as unfed below (‰)",
  ),
  k(
    "npc_ai_house_food_short_share_pm",
    "houseFoodShortSharePm",
    "가문 점검: 식량 부족 깃발의 못 먹은 가문원 몫(‰)",
    "House check: unfed member share for the food-short flag (‰)",
  ),
  k(
    "npc_ai_house_morale_low_below",
    "houseMoraleLowBelow",
    "가문 점검: 사기 낮음 깃발의 평균 만족도 문턱(점)",
    "House check: average satisfaction below which morale is low",
  ),
  k(
    "npc_ai_house_refuse_below_pm",
    "houseRefuseBelowPm",
    "지시 불복 문턱 복종도(‰, 불복 확률 = 문턱 − 복종도)",
    "Order refusal threshold obedience (‰, refusal chance = threshold − obedience)",
  ),
  k(
    "npc_ai_house_tax_pm",
    "houseTaxPm",
    "NPC 가문세: 가문원 임금에서 가문 금고로 가는 몫(‰)",
    "NPC house tax: share of member wages to the house vault (‰)",
  ),
  k(
    "npc_ai_house_care_min_pm",
    "houseCareMinPm",
    "돌봄 배당에 쓰는 금고 몫 최소(‰)",
    "House care: vault share spent, min (‰)",
  ),
  k(
    "npc_ai_house_care_max_pm",
    "houseCareMaxPm",
    "돌봄 배당에 쓰는 금고 몫 최대(‰)",
    "House care: vault share spent, max (‰)",
  ),
  k(
    "npc_ai_offline_steward_after_ms",
    "offlineStewardAfterMs",
    "비접속 유저 유닛 관리인이 움직이기까지의 비접속 시간(ms)",
    "Time offline before the unit steward acts (ms)",
  ),
];
