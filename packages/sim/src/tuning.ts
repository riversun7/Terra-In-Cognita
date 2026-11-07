// 설정 칸 값 → 계수표 — docs/adr/2026-10-31-faction-society-core.md "설정 칸 대응"
// 기획 설정 칸(49: N·S·C·T 코드)의 값은 개발자 패널 설정(D1)이 생기기 전까지 콘텐츠 팩 `tuning`에 둔다.
// 이 표가 팩 항목 ID ↔ 계수표 칸(경로)을 잇는다. 실행 도구·서버는 팩 값으로 계수표를 만든다(없는 칸은 기본값 그대로).
// 팩의 임시 값 = TEST_* 계수표(서버 시험이 맞춰 본다). 표에 없는 계수는 아직 설정 칸이 없거나 기술 상수다.
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "./combat/coefficients.ts";
import type { CombatFormulaSet } from "./combat/formulas.ts";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "./society/coefficients.ts";
import { BUILD_TUNING_KEYS } from "./tuningBuild.ts";
import { FUSION_TUNING_KEYS } from "./tuningFusion.ts";
import { TEMPLE_TUNING_KEYS } from "./tuningTemple.ts";
import { RESTORATION_TUNING_KEYS } from "./tuningRestoration.ts";
import { RECRUIT_TUNING_KEYS } from "./tuningRecruit.ts";
import { CYBORG_TUNING_KEYS } from "./tuningCyborg.ts";
import { GARDENER_TUNING_KEYS } from "./tuningGardener.ts";
import { LABOR_TUNING_KEYS } from "./tuningLabor.ts";
import { NPC_TUNING_KEYS } from "./tuningNpc.ts";
import { RANKING_TUNING_KEYS } from "./tuningRanking.ts";
import { SWITCH_TUNING_KEYS } from "./tuningSwitches.ts";
import { TERRITORY_TUNING_KEYS } from "./tuningTerritory.ts";
import { VITALS_TUNING_KEYS } from "./tuningVitals.ts";
import { INJURY_TUNING_KEYS } from "./tuningInjury.ts";
import { WORLD_SEED_TUNING_KEYS } from "./tuningWorldSeed.ts";

export interface TuningKey {
  /** 팩 항목 ID */
  readonly id: string;
  /** 기획 설정 칸 코드(49). 칸이 없으면 "" */
  readonly code: string;
  readonly target: "combat" | "society";
  /** 계수표 안 경로(점으로 잇는다, 배열은 번호) */
  readonly path: string;
  /** 구조 값(D-5054) */
  readonly structural: boolean;
  readonly ko: string;
  readonly en: string;
}

const k = (
  id: string,
  code: string,
  target: TuningKey["target"],
  path: string,
  ko: string,
  en: string,
  structural = false,
): TuningKey => ({ id, code, target, path, structural, ko, en });

export const TUNING_KEYS: readonly TuningKey[] = [
  // 전투 (49 §5 C, §6.5 N)
  k(
    "c5_command_lock",
    "C5",
    "combat",
    "commandLockMs",
    "명령 다시 넣기 막는 시간(ms)",
    "Command re-entry lock (ms)",
  ),
  k(
    "c2_limit_normal",
    "C2",
    "combat",
    "limitMs.normal",
    "일반 전투 제한 시간(ms)",
    "Normal battle time limit (ms)",
  ),
  k("c2_limit_siege", "C2", "combat", "limitMs.siege", "공성 제한 시간(ms)", "Siege time limit (ms)"),
  k("c19_loot", "C19", "combat", "lootBp", "패배 화물 탈취(만분율)", "Defeat cargo loot (bp)"),
  k("c21_retreat_band", "C21", "combat", "retreatBand", "퇴각 구역 폭(칸)", "Retreat band width (cells)"),
  k(
    "c23_retreat_dwell",
    "C23",
    "combat",
    "retreatDwellMs",
    "퇴각 구역 머무는 시간(ms)",
    "Retreat dwell (ms)",
  ),
  k(
    "c24_bush_sense",
    "C24",
    "combat",
    "bushSenseCells",
    "수풀 속 적이 보이는 거리(칸)",
    "Bush sense range (cells)",
  ),
  k(
    "c25_bush_reveal",
    "C25",
    "combat",
    "bushRevealMs",
    "수풀에서 공격하면 드러나는 시간(ms)",
    "Bush reveal (ms)",
  ),
  k("c27_height_unit", "C27", "combat", "sight.heightUnit", "높이 시야 보너스 단위", "Height sight unit"),
  k(
    "c27_height_cap",
    "C27",
    "combat",
    "sight.heightCap",
    "높이 시야 보너스 상한(칸)",
    "Height sight cap (cells)",
  ),
  k(
    "c10_affinity_favor",
    "C10",
    "combat",
    "affinity.favorPm",
    "속성 상성 유리 rate(‰)",
    "Element affinity: favoured rate (‰)",
  ),
  k(
    "c10_affinity_unfavor",
    "C10",
    "combat",
    "affinity.unfavorPm",
    "속성 상성 불리 rate(‰)",
    "Element affinity: unfavoured rate (‰)",
  ),
  k(
    "c10_affinity_same",
    "C10",
    "combat",
    "affinity.samePm",
    "속성 상성 같은 계열 rate(‰)",
    "Element affinity: same family rate (‰)",
  ),
  k(
    "n10_appropriate_cap",
    "N10",
    "combat",
    "appropriateCapPm",
    "적정 스탯 비율 상한(‰)",
    "Appropriate ratio cap (‰)",
    true,
  ),
  k(
    "n11_favor_slope",
    "N11",
    "combat",
    "evadeRelative.favorSlopePm",
    "회피 유리 기울기(‰)",
    "Evade favour slope (‰)",
  ),
  k(
    "n11_favor_cap",
    "N11",
    "combat",
    "evadeRelative.favorCapPm",
    "회피 유리 끝값(‰)",
    "Evade favour cap (‰)",
  ),
  k(
    "n11_unfavor_slope",
    "N11",
    "combat",
    "evadeRelative.unfavorSlopePm",
    "회피 불리 기울기(‰)",
    "Evade disfavour slope (‰)",
  ),
  k(
    "n11_unfavor_cap",
    "N11",
    "combat",
    "evadeRelative.unfavorCapPm",
    "회피 불리 끝값(‰)",
    "Evade disfavour cap (‰)",
  ),
  k("n12_crit_spread", "N12", "combat", "critSpreadPm", "크리 배율 범위 폭(‰)", "Crit multiplier spread (‰)"),
  k(
    "n13_weight_agi",
    "N13",
    "combat",
    "stamina.scoreWeightsPm.2",
    "STA 점수 AGI 가중치(‰)",
    "STA score AGI weight (‰)",
  ),
  k(
    "n13_weight_vit",
    "N13",
    "combat",
    "stamina.scoreWeightsPm.3",
    "STA 점수 VIT 가중치(‰)",
    "STA score VIT weight (‰)",
  ),
  k(
    "n13_min_consume",
    "N13",
    "combat",
    "stamina.minConsumePm",
    "최소 소모 비율(‰)",
    "Minimum consumption (‰)",
  ),
  // N13 회복(기본 회복/초·회복 배수 상한)·N15 MP 회복은 D-458 2차 스탯 행(stamina_regen·mp_regen, N40)으로 옮겼다(팩 stat_rows)
  // N13 적정 STA 점수(80 고정)는 D-511로 레벨 계산식 stamina_appropriate가 됐다(팩 formulas, id-changes core@34)
  // N40 피격 뒤 쉴드 재생 지연은 D-490(쉴드 재생은 맞는 중에도 일정하게 계속)으로 없앴다(팩 id-changes core@21)
  // 노동 (49 §6.5 N21~N33, §7 S25)
  k("n21_fatigue_max", "N21", "society", "fatigueMax", "피로 상한", "Fatigue max", true),
  ...[1, 2, 3].flatMap((band) => [
    k(
      `n23_band${band}_from`,
      "N23",
      "society",
      `fatigueBands.${band}.from`,
      `피로 구간 ${band} 시작`,
      `Fatigue band ${band} start`,
    ),
    k(
      `n23_band${band}_ability`,
      "N23",
      "society",
      `fatigueBands.${band}.abilityPm`,
      `피로 구간 ${band} 능력(‰)`,
      `Fatigue band ${band} ability (‰)`,
    ),
    k(
      `n23_band${band}_move`,
      "N23",
      "society",
      `fatigueBands.${band}.movePm`,
      `피로 구간 ${band} 이동(‰)`,
      `Fatigue band ${band} move (‰)`,
    ),
  ]),
  k(
    "n24_recover_step",
    "N24",
    "society",
    "fatigueRecoverStepMs",
    "피로 1점 회복 시간(ms)",
    "Fatigue recovery step (ms)",
  ),
  ...[1, 2, 3].map((grade) =>
    k(
      `n24_housing_${grade}`,
      "N24",
      "society",
      `housingRecoveryPm.${grade}`,
      `주거 ${grade}등급 회복 배율(‰)`,
      `Housing grade ${grade} recovery (‰)`,
    ),
  ),
  k(
    "s25_homeless_recovery",
    "S25",
    "society",
    "homelessRecoveryPm",
    "노숙 회복 배율(‰)",
    "Homeless recovery (‰)",
  ),
  k(
    "n25_low_satisfaction",
    "N25",
    "society",
    "lowSatisfactionRecoveryPm",
    "만족도 0일 때 회복 배율(‰)",
    "Recovery at satisfaction 0 (‰)",
  ),
  k(
    "n27_wage_rate",
    "N27",
    "society",
    "wageRateMilli",
    "기준 단가(효율 1점당 밀리)",
    "Base wage rate (milli per point)",
  ),
  k("n27_elasticity", "N27", "society", "wageElasticityPm", "단가 수급 탄력(‰)", "Wage elasticity (‰)"),
  k("n27_rate_min", "N27", "society", "wageRateMinPm", "단가 하한(‰)", "Wage rate floor (‰)"),
  k("n27_rate_max", "N27", "society", "wageRateMaxPm", "단가 상한(‰)", "Wage rate ceiling (‰)"),
  k("n27_recalc", "N27", "society", "wageRecalcMs", "단가 재계산 주기(ms)", "Wage recalculation (ms)"),
  k(
    "n28_adjust_min",
    "N28",
    "society",
    "employerAdjustMinPm",
    "고용주 조정 하한(‰)",
    "Employer adjust floor (‰)",
  ),
  k(
    "n28_adjust_max",
    "N28",
    "society",
    "employerAdjustMaxPm",
    "고용주 조정 상한(‰)",
    "Employer adjust ceiling (‰)",
  ),
  k(
    "n29_restore",
    "N29",
    "society",
    "satisfactionRestorePmPerDay",
    "만족도 복원 속도(하루 ‰)",
    "Satisfaction restore (‰/day)",
  ),
  k("n29_base", "N29", "society", "satisfactionTarget.base", "만족도 기본 목표", "Satisfaction base target"),
  k("n29_food", "N29", "society", "satisfactionTarget.food", "포만감 목표 기여", "Food target"),
  ...[1, 2, 3].map((grade) =>
    k(
      `n29_housing_${grade}`,
      "N29",
      "society",
      `satisfactionTarget.housing.${grade}`,
      `주거 ${grade}등급 목표 기여`,
      `Housing grade ${grade} target`,
    ),
  ),
  k("n29_homeless", "N29", "society", "satisfactionTarget.homeless", "노숙 목표 기여", "Homeless target"),
  k("n29_wage", "N29", "society", "satisfactionTarget.wage", "임금 목표 기여", "Wage target"),
  k("n29_wage_gap", "N29", "society", "satisfactionTarget.wageGap", "임금 격차 불만", "Wage gap penalty"),
  k("n29_faith", "N29", "society", "satisfactionTarget.faith", "신앙 목표 기여", "Faith target"),
  k("n29_war", "N29", "society", "satisfactionTarget.war", "전쟁 목표 기여", "War target"),
  k("n29_injury", "N29", "society", "satisfactionTarget.injury", "부상 목표 기여", "Injury target"),
  k(
    "n30_gap_floor",
    "N30",
    "society",
    "satisfactionTarget.wageGapFloorPm",
    "임금 격차 문턱(‰)",
    "Wage gap floor (‰)",
  ),
  k(
    "n30_top_share",
    "N30",
    "society",
    "wageTopSharePm",
    "임금 비교 상위 몫(‰)",
    "Wage comparison top share (‰)",
  ),
  k(
    "n31_life_skill",
    "N31",
    "society",
    "lifeSkillBonusPerGrade",
    "생활 스킬 등급당 효율",
    "Life skill bonus per grade",
  ),
  k(
    "n32_main_divisor",
    "N32",
    "society",
    "productionMainDivisor",
    "생산 진행 나눔(주 스탯)",
    "Production main divisor",
  ),
  k(
    "n32_sub_yield",
    "N32",
    "society",
    "productionSubYieldPm",
    "추가 수확(보조 스탯 ‰)",
    "Extra yield (sub stat ‰)",
  ),
  k(
    "n43_level_bonus",
    "N43",
    "society",
    "gatherLevelBonus",
    "채집 시설 레벨당 티어 보너스(유효 스탯)",
    "Gathering facility tier bonus per level (effective stat)",
  ),
  k(
    "n44_tier_progress_base",
    "N44",
    "society",
    "gatherTierProgressBase",
    "1차 생산 필요 진행 기본(T0)",
    "Primary production required progress base (T0)",
  ),
  k(
    "n44_tier_progress_step",
    "N44",
    "society",
    "gatherTierProgressStep",
    "1차 생산 필요 진행 티어당",
    "Primary production required progress per tier",
  ),
  k(
    "n44_tick_ms",
    "N44",
    "society",
    "gatherTickMs",
    "1차 생산 진행 1의 시간(ms)",
    "Primary production progress tick (ms)",
  ),
  k("n44_ore_grams", "N44", "society", "gatherOreGrams", "광석 한 번 캘 때 무게(g)", "Ore per harvest (g)"),
  k(
    "n33_food_zero_at",
    "N33",
    "society",
    "foodEfficiency.0.atMost",
    "포만감 효율 0 구간",
    "Food efficiency zero at",
  ),
  k(
    "n33_food_low_at",
    "N33",
    "society",
    "foodEfficiency.1.atMost",
    "포만감 효율 낮음 구간",
    "Food efficiency low at",
  ),
  k(
    "n33_food_low",
    "N33",
    "society",
    "foodEfficiency.1.pm",
    "포만감 낮을 때 효율(‰)",
    "Low food efficiency (‰)",
  ),
  // 세력·사회 (49 §7 S, §2 T, §6.5 N35, 질문 120·121, D-298·D-443)
  k(
    "d130_shares_per_city",
    "",
    "society",
    "sharesPerCity",
    "도시 지분 수(D-130)",
    "Shares per city (D-130)",
    true,
  ),
  k("d130_dividend_every", "", "society", "dividendEveryMs", "배당 주기(ms)", "Dividend period (ms)"),
  k(
    "d298_delist_reissue",
    "",
    "society",
    "delistReissueShares",
    "상장폐지 뒤 재발행 주식 수(D-298)",
    "Shares reissued after delisting (D-298)",
  ),
  k(
    "d444_delist_loyalty",
    "",
    "society",
    "delistLoyaltyPm",
    "독재 재발행 충성 보상 몫(‰, D-444)",
    "Dictatorship reissue loyalty share (‰, D-444)",
  ),
  k(
    "s33_tribute_rate",
    "S33",
    "society",
    "tributePm",
    "속국·봉신 공물(국고 ‰, 주기마다)",
    "Vassal tribute (treasury ‰ per period)",
  ),
  k("d443_tribute_every", "", "society", "tributeEveryMs", "공물 주기(ms)", "Tribute period (ms)"),
  k("s22_inheritance_tax", "S22", "society", "inheritanceTaxBp", "상속세(만분율)", "Inheritance tax (bp)"),
  k(
    "s23_dictatorship_drop",
    "S23",
    "society",
    "dictatorshipSatisfactionDrop",
    "독재 점령 만족도 감소",
    "Dictatorship occupation drop",
  ),
  k(
    "s26_rebellion",
    "S26",
    "society",
    "rebellionThreshold",
    "반란 문턱(도시 평균 만족도)",
    "Rebellion threshold",
  ),
  k(
    "n35_rebellion_warning",
    "N35",
    "society",
    "rebellionWarningAt",
    "민심 표 반란 예고 문턱(이하)",
    "Unrest: rebellion warning at or below",
  ),
  k(
    "n35_sabotage",
    "N35",
    "society",
    "sabotageAt",
    "민심 표 태업 조짐 문턱(이하)",
    "Unrest: sabotage signs at or below",
  ),
  k(
    "s27_independence",
    "S27",
    "society",
    "independencePassPm",
    "독립 통과 문턱(‰)",
    "Independence pass (‰)",
    true,
  ),
  k(
    "s30_offer_deadline",
    "S30",
    "society",
    "offerDeadlineMs",
    "편입 제안 기한(ms)",
    "Incorporation offer deadline (ms)",
  ),
  k(
    "s31_delist_satisfaction",
    "S31",
    "society",
    "delistSatisfactionDrop",
    "상장폐지 만족도 감소",
    "Delisting satisfaction drop",
  ),
  k(
    "s31_delist_relation",
    "S31",
    "society",
    "delistRelationDrop",
    "상장폐지 관계 점수 감소",
    "Delisting relation drop",
  ),
  k("d186_loot_drop", "", "society", "lootSatisfactionDrop", "약탈 만족도 감소", "Loot satisfaction drop"),
  k(
    "d186_integrate_drop",
    "",
    "society",
    "integrateSatisfactionDrop",
    "통합 만족도 감소",
    "Integration satisfaction drop",
  ),
  k("d186_loot_take", "", "society", "lootTakeBp", "약탈이 가져가는 금고 몫(만분율)", "Loot take (bp)"),
  k("t4_lifespan_min", "T4", "society", "lifespanMinMs", "휴먼 수명 최소(ms)", "Human lifespan min (ms)"),
  k("t4_lifespan_max", "T4", "society", "lifespanMaxMs", "휴먼 수명 최대(ms)", "Human lifespan max (ms)"),
  k("d395_rebirth", "", "society", "rebirthPm", "수명 끝 환생 확률(‰)", "Rebirth chance at end of life (‰)"),
  k(
    "d395_deify",
    "",
    "society",
    "deifyPm",
    "수명 끝 신격화 확률(‰)",
    "Deification chance at end of life (‰)",
  ),
  k("q121_tech_max", "", "society", "techGroundMax", "지상 기술 단계 상한", "Ground tech max", true),
  k("q121_research_work", "", "society", "researchWorkBase", "단계당 연구 작업량", "Research work per level"),
  k(
    "q121_development",
    "",
    "society",
    "developmentPerTech",
    "단계당 발전도 문턱",
    "Development per tech level",
  ),
  k("d396_blueprint", "", "society", "blueprintDiscountBp", "설계도 할인(만분율)", "Blueprint discount (bp)"),
  // 사이보그 성장·환생·속성·유지와 장비 수리(49 N6·N7·N9·N34·N36~N38·F11·F12): tuningCyborg.ts
  ...CYBORG_TUNING_KEYS,
  // NPC 판단(49 S3·S5·S19, D-323·D-292·D-220): tuningNpc.ts
  ...NPC_TUNING_KEYS,
  // 오염·정원사 웨이브(49 P15·S14·M3·C14~C18·S16·S17, D-460·D-464): tuningGardener.ts
  ...GARDENER_TUNING_KEYS,
  // 시설 건설 시간·유지비(49 M14, D-508): tuningBuild.ts
  ...BUILD_TUNING_KEYS,
  // 영토 층(49 M2·M3·N42·N51, D-104·D-485·D-486): tuningTerritory.ts
  ...TERRITORY_TUNING_KEYS,
  // 랭킹(20 §8, D-037·D-041·D-042, 49에 칸 없음 [임시]): tuningRanking.ts
  ...RANKING_TUNING_KEYS,
  ...VITALS_TUNING_KEYS,
  // 부상 단계·작업 중 부상·자연 치유·병원(49 N55, D-521): tuningInjury.ts
  ...INJURY_TUNING_KEYS,
  // 구인 카드(49 N45, D-469 — S39 출생 칸을 대신함): tuningRecruit.ts
  ...RECRUIT_TUNING_KEYS,
  ...LABOR_TUNING_KEYS,
  // 사이보그 유닛 융합·유전자 조각(49 N46·N47, D-470·D-478·D-481): tuningFusion.ts
  ...FUSION_TUNING_KEYS,
  // 신전·종교(49 S15, D-311·D-441·D-451·기획 정리 395 나): tuningTemple.ts
  ...TEMPLE_TUNING_KEYS,
  // 폐허 복원(D-510·D-339·D-343·D-344, 49에 칸 없음 [임시]): tuningRestoration.ts
  ...RESTORATION_TUNING_KEYS,
  // 세계 씨앗(D-6041·46 §9.2, 49에 칸 없음 [임시]): tuningWorldSeed.ts
  ...WORLD_SEED_TUNING_KEYS,
  // 운영자 시스템 온/오프 스위치(49 N53, D-513): tuningSwitches.ts
  ...SWITCH_TUNING_KEYS,
];

function getPath(root: unknown, path: string): number {
  let node: unknown = root;
  for (const part of path.split("."))
    node = typeof node === "object" && node !== null ? Reflect.get(node, part) : undefined;
  if (typeof node !== "number") throw new Error(`tuning path ${path} is not a number`);
  return node;
}

function setPath(root: object, path: string, value: number): void {
  const parts = path.split(".");
  let node: unknown = root;
  for (const part of parts.slice(0, -1))
    node = typeof node === "object" && node !== null ? Reflect.get(node, part) : undefined;
  const last = parts.at(-1);
  if (
    typeof node !== "object" ||
    node === null ||
    last === undefined ||
    typeof Reflect.get(node, last) !== "number"
  )
    throw new Error(`tuning path ${path} is not a number`);
  Reflect.set(node, last, value);
}

/** 계수표의 지금 값(팩 `tuning` 임시 자료를 만들 때) */
export function tuningValue(key: TuningKey): number {
  return getPath(key.target === "combat" ? TEST_COMBAT_COEFFICIENTS : TEST_SOCIETY_COEFFICIENTS, key.path);
}

function apply<T extends object>(
  base: T,
  target: TuningKey["target"],
  values: ReadonlyMap<string, number>,
): T {
  // 계수표는 숫자·배열·객체뿐이라 JSON으로 깊게 복사한다
  const copy: T = JSON.parse(JSON.stringify(base));
  for (const key of TUNING_KEYS) {
    if (key.target !== target) continue;
    const value = values.get(key.id);
    if (value !== undefined) setPath(copy, key.path, value);
  }
  return copy;
}

/**
 * 팩 값(ID → 정수)을 얹은 전투 계수표. 표에 없는 ID는 무시한다. formulas(전투 계산식 묶음, docs/adr/2026-11-01-formula-editor.md)를
 * 주면 그 묶음을 싣고, 아니면 base의 묶음(없으면 기본 식)을 그대로 둔다. 식 나무는 깊게 복사하지 않는다(같은 객체 = 같은 캐시)
 */
export function combatCoefficientsFrom(
  values: ReadonlyMap<string, number>,
  base: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
  formulas?: CombatFormulaSet,
): CombatCoefficients {
  const { formulas: baseFormulas, ...numbers } = base;
  const copy = apply(numbers, "combat", values);
  const set = formulas ?? baseFormulas;
  return set ? { ...copy, formulas: set } : copy;
}

/** 팩 값을 얹은 세력·사회 계수표 */
export function societyCoefficientsFrom(
  values: ReadonlyMap<string, number>,
  base: SocietyCoefficients = TEST_SOCIETY_COEFFICIENTS,
): SocietyCoefficients {
  return apply(base, "society", values);
}
