// NPC 자율행동·AI 에디터(/dev/npc-ai) 순수 모델 — docs/adr/2026-11-20-npc-autonomous-ai.md
// 튜닝 목록(TuningEntryView) + 담은 변경(Pending) 읽기·합성, 프리셋, 200명 성향 분포 샘플링, 충성도 곡선 계산, 오류 파싱.
import { createRng } from "@terra/shared";
import {
  type TuningEntryView,
  type TuningProblem,
  type TuningReason,
  TUNING_REASONS,
  isTuningProblem,
} from "@terra/shared/tuning";
import {
  DEFAULT_LOYALTY_OVERRIDE_RULES,
  DEFAULT_ROLE_TRAIT_RANGES,
  DEFAULT_UNIT_TRAITS,
  type LoyaltyOverrideRules,
  type TraitAxis,
  type TraitRangeMap,
  type TraitRole,
  UNIT_TRAIT_AXES,
  UNIT_TRAIT_MAX,
  UNIT_TRAIT_MIN,
  type UnitTraits,
  driftUnitTraits,
  loyaltyOverridePm,
  rollUnitTraits,
} from "@terra/shared/unitTraits";
import { field } from "../../net/json.ts";

/** 담은 변경: 설정 칸 ID → 새 정수 값(null = 팩 기본값으로 되돌리기) */
export type NpcAiPending = ReadonlyMap<string, number | null>;

export const NPC_AI_TABS = ["blend", "unit", "strategy", "combat", "lab"] as const;
export type NpcAiTabId = (typeof NPC_AI_TABS)[number];

/** 7축 성향 표시 메타(한국어·영어 이름과 양극 이름) */
export interface TraitAxisMeta {
  readonly axis: TraitAxis;
  readonly group: "decision" | "culture";
  readonly ko: string;
  readonly en: string;
  readonly lowKo: string;
  readonly highKo: string;
  readonly lowEn: string;
  readonly highEn: string;
}

export const TRAIT_AXIS_META: readonly TraitAxisMeta[] = [
  {
    axis: "belligerence",
    group: "decision",
    ko: "호전성",
    en: "Belligerence",
    lowKo: "평화·수비",
    highKo: "호전·공격",
    lowEn: "Peaceful",
    highEn: "Belligerent",
  },
  {
    axis: "greed",
    group: "culture",
    ko: "이윤욕",
    en: "Greed",
    lowKo: "공공·자급",
    highKo: "이윤·시장",
    lowEn: "Public",
    highEn: "Profit",
  },
  {
    axis: "boldness",
    group: "decision",
    ko: "과감성",
    en: "Boldness",
    lowKo: "신중·안전",
    highKo: "과감·모험",
    lowEn: "Cautious",
    highEn: "Bold",
  },
  {
    axis: "communalism",
    group: "culture",
    ko: "공동체",
    en: "Communalism",
    lowKo: "실리·개인",
    highKo: "공동체·신앙",
    lowEn: "Individual",
    highEn: "Communal",
  },
  {
    axis: "autonomy",
    group: "decision",
    ko: "자치성",
    en: "Autonomy",
    lowKo: "순응·연대",
    highKo: "자치·야망",
    lowEn: "Compliant",
    highEn: "Autonomous",
  },
  {
    axis: "openness",
    group: "culture",
    ko: "개방성",
    en: "Openness",
    lowKo: "폐쇄·보수",
    highKo: "개방·교류",
    lowEn: "Closed",
    highEn: "Open",
  },
  {
    axis: "discipline",
    group: "culture",
    ko: "규율성",
    en: "Discipline",
    lowKo: "자유·즉흥",
    highKo: "규율·성실",
    lowEn: "Improvised",
    highEn: "Disciplined",
  },
];

/** ID → TuningEntryView 빠른 조회 맵 */
export function indexEntries(entries: readonly TuningEntryView[]): ReadonlyMap<string, TuningEntryView> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

/** 현재 실효값(담은 변경 우선, null이면 팩 값, 없으면 목록 값, 목록에도 없으면 fallback) */
export function effectiveValue(
  byId: ReadonlyMap<string, TuningEntryView>,
  pending: NpcAiPending,
  id: string,
  fallback = 0,
): number {
  const entry = byId.get(id);
  if (pending.has(id)) {
    const staged = pending.get(id);
    if (staged === null || staged === undefined) return entry?.packValue ?? fallback;
    return staged;
  }
  return entry?.value ?? fallback;
}

/** 팩 기본값 */
export function packValueOf(byId: ReadonlyMap<string, TuningEntryView>, id: string, fallback = 0): number {
  return byId.get(id)?.packValue ?? fallback;
}

/** 여러 칸을 한 번에 담기(현재 서버 값과 같아지면 pending에서 뺀다) */
export function stagePatch(
  previous: NpcAiPending,
  byId: ReadonlyMap<string, TuningEntryView>,
  patch: Readonly<Record<string, number | null>>,
): NpcAiPending {
  const next = new Map(previous);
  for (const [id, value] of Object.entries(patch)) {
    const entry = byId.get(id);
    if (!entry) continue;
    if (value !== null && value === entry.value) next.delete(id);
    else if (value === null && entry.override === null) next.delete(id);
    else next.set(id, value);
  }
  return next;
}

/** 새 서버 목록에 맞춰 바뀔 것이 없는 담은 변경 제거 */
export function pruneNpcAiPending(previous: NpcAiPending, entries: readonly TuningEntryView[]): NpcAiPending {
  const byId = indexEntries(entries);
  const next = new Map<string, number | null>();
  for (const [id, value] of previous) {
    const entry = byId.get(id);
    if (!entry) continue;
    if (value === null ? entry.override !== null : value !== entry.value) next.set(id, value);
  }
  return next;
}

/** 서버 previewDecision에 넘길 실효 튜닝 맵(전체 팩 값 + 오버라이드 + 담은 변경) */
export function buildTuningValuesRecord(
  entries: readonly TuningEntryView[],
  pending: NpcAiPending,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    if (pending.has(entry.id)) {
      const staged = pending.get(entry.id);
      result[entry.id] = staged === null || staged === undefined ? entry.packValue : staged;
    } else {
      result[entry.id] = entry.value;
    }
  }
  return result;
}

/** 조직 합성 원클릭 프리셋 3종(모든 3항·2항 합 = 1000‰) */
export type BlendPresetId = "leader_only" | "balanced" | "tradition_stable";

export const BLEND_PRESETS: Readonly<Record<BlendPresetId, Readonly<Record<string, number>>>> = {
  leader_only: {
    npc_ai_dict_dec_leader_pm: 1000,
    npc_ai_dict_dec_members_pm: 0,
    npc_ai_dict_dec_base_pm: 0,
    npc_ai_dict_cul_leader_pm: 1000,
    npc_ai_dict_cul_members_pm: 0,
    npc_ai_dict_cul_base_pm: 0,
    npc_ai_demo_dec_leader_pm: 1000,
    npc_ai_demo_dec_members_pm: 0,
    npc_ai_demo_dec_base_pm: 0,
    npc_ai_demo_cul_leader_pm: 1000,
    npc_ai_demo_cul_members_pm: 0,
    npc_ai_demo_cul_base_pm: 0,
    npc_ai_cap_dec_leader_pm: 1000,
    npc_ai_cap_dec_members_pm: 0,
    npc_ai_cap_dec_base_pm: 0,
    npc_ai_cap_cul_leader_pm: 1000,
    npc_ai_cap_cul_members_pm: 0,
    npc_ai_cap_cul_base_pm: 0,
    npc_ai_house_dec_leader_pm: 1000,
    npc_ai_house_dec_members_pm: 0,
    npc_ai_house_cul_leader_pm: 1000,
    npc_ai_house_cul_members_pm: 0,
    npc_ai_city_dec_mayor_pm: 1000,
    npc_ai_city_dec_nation_pm: 0,
    npc_ai_city_cul_mayor_pm: 1000,
    npc_ai_city_cul_citizens_pm: 0,
    npc_ai_city_cul_nation_pm: 0,
  },
  balanced: {
    npc_ai_dict_dec_leader_pm: 800,
    npc_ai_dict_dec_members_pm: 100,
    npc_ai_dict_dec_base_pm: 100,
    npc_ai_dict_cul_leader_pm: 450,
    npc_ai_dict_cul_members_pm: 300,
    npc_ai_dict_cul_base_pm: 250,
    npc_ai_demo_dec_leader_pm: 350,
    npc_ai_demo_dec_members_pm: 450,
    npc_ai_demo_dec_base_pm: 200,
    npc_ai_demo_cul_leader_pm: 200,
    npc_ai_demo_cul_members_pm: 600,
    npc_ai_demo_cul_base_pm: 200,
    npc_ai_cap_dec_leader_pm: 300,
    npc_ai_cap_dec_members_pm: 550,
    npc_ai_cap_dec_base_pm: 150,
    npc_ai_cap_cul_leader_pm: 150,
    npc_ai_cap_cul_members_pm: 650,
    npc_ai_cap_cul_base_pm: 200,
    npc_ai_house_dec_leader_pm: 700,
    npc_ai_house_dec_members_pm: 300,
    npc_ai_house_cul_leader_pm: 450,
    npc_ai_house_cul_members_pm: 550,
    npc_ai_city_dec_mayor_pm: 600,
    npc_ai_city_dec_nation_pm: 400,
    npc_ai_city_cul_mayor_pm: 350,
    npc_ai_city_cul_citizens_pm: 400,
    npc_ai_city_cul_nation_pm: 250,
  },
  tradition_stable: {
    npc_ai_dict_dec_leader_pm: 400,
    npc_ai_dict_dec_members_pm: 200,
    npc_ai_dict_dec_base_pm: 400,
    npc_ai_dict_cul_leader_pm: 200,
    npc_ai_dict_cul_members_pm: 300,
    npc_ai_dict_cul_base_pm: 500,
    npc_ai_demo_dec_leader_pm: 200,
    npc_ai_demo_dec_members_pm: 400,
    npc_ai_demo_dec_base_pm: 400,
    npc_ai_demo_cul_leader_pm: 100,
    npc_ai_demo_cul_members_pm: 450,
    npc_ai_demo_cul_base_pm: 450,
    npc_ai_cap_dec_leader_pm: 150,
    npc_ai_cap_dec_members_pm: 450,
    npc_ai_cap_dec_base_pm: 400,
    npc_ai_cap_cul_leader_pm: 100,
    npc_ai_cap_cul_members_pm: 450,
    npc_ai_cap_cul_base_pm: 450,
    npc_ai_house_dec_leader_pm: 400,
    npc_ai_house_dec_members_pm: 600,
    npc_ai_house_cul_leader_pm: 250,
    npc_ai_house_cul_members_pm: 750,
    npc_ai_city_dec_mayor_pm: 300,
    npc_ai_city_dec_nation_pm: 700,
    npc_ai_city_cul_mayor_pm: 150,
    npc_ai_city_cul_citizens_pm: 400,
    npc_ai_city_cul_nation_pm: 450,
  },
};

function clipRange(min: number, max: number): { readonly min: number; readonly max: number } {
  const lo = Math.max(UNIT_TRAIT_MIN, Math.min(UNIT_TRAIT_MAX, Math.min(min, max)));
  const hi = Math.max(lo, Math.min(UNIT_TRAIT_MAX, Math.max(min, max)));
  return { min: lo, max: hi };
}

/** 현재 튜닝 값으로 직군별 성향 생성 범위표 조립 */
export function buildRoleRanges(
  byId: ReadonlyMap<string, TuningEntryView>,
  pending: NpcAiPending,
): Record<TraitRole, TraitRangeMap> {
  const gMin = effectiveValue(byId, pending, "npc_ai_unit_trait_min", 100);
  const gMax = effectiveValue(byId, pending, "npc_ai_unit_trait_max", 900);
  const globalRange = clipRange(gMin, gMax);
  const fillGlobal = (): TraitRangeMap => ({
    belligerence: globalRange,
    greed: globalRange,
    boldness: globalRange,
    communalism: globalRange,
    autonomy: globalRange,
    openness: globalRange,
    discipline: globalRange,
  });
  return {
    citizen: fillGlobal(),
    recruit: fillGlobal(),
    guard: {
      ...fillGlobal(),
      belligerence: clipRange(
        effectiveValue(byId, pending, "npc_ai_guard_belligerence_min", 400),
        effectiveValue(byId, pending, "npc_ai_guard_belligerence_max", 950),
      ),
      boldness: clipRange(
        effectiveValue(byId, pending, "npc_ai_guard_boldness_min", 400),
        effectiveValue(byId, pending, "npc_ai_guard_boldness_max", 900),
      ),
      discipline: clipRange(
        effectiveValue(byId, pending, "npc_ai_guard_discipline_min", 550),
        effectiveValue(byId, pending, "npc_ai_guard_discipline_max", 950),
      ),
    },
    leader: {
      ...fillGlobal(),
      boldness: clipRange(
        effectiveValue(byId, pending, "npc_ai_leader_boldness_min", 300),
        effectiveValue(byId, pending, "npc_ai_leader_boldness_max", 950),
      ),
      autonomy: clipRange(
        effectiveValue(byId, pending, "npc_ai_leader_autonomy_min", 400),
        effectiveValue(byId, pending, "npc_ai_leader_autonomy_max", 950),
      ),
    },
    creature: DEFAULT_ROLE_TRAIT_RANGES.creature,
    android: DEFAULT_ROLE_TRAIT_RANGES.android,
  };
}

/** 200명 가상 유닛 성향 분포 히스토그램(10구간: 0~99, ..., 900~1000) */
export interface TraitHistogram {
  readonly bins: readonly number[];
  readonly maxBin: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export function sampleTraitHistogram(input: {
  readonly role: TraitRole;
  readonly axis: TraitAxis;
  readonly ranges: TraitRangeMap;
  readonly spread: number;
  readonly useAnchor: boolean;
  readonly count?: number;
  readonly seed?: number;
}): TraitHistogram {
  const count = input.count ?? 200;
  const rng = createRng(input.seed ?? 20261120);
  const bins = Array.from({ length: 10 }, () => 0);
  let sum = 0;
  let min = UNIT_TRAIT_MAX;
  let max = UNIT_TRAIT_MIN;
  for (let i = 0; i < count; i += 1) {
    const traits = input.useAnchor
      ? driftUnitTraits(DEFAULT_UNIT_TRAITS, input.spread, rng, input.ranges)
      : rollUnitTraits(rng, input.ranges);
    const val = traits[input.axis];
    const idx = Math.min(9, Math.max(0, Math.floor(val / 100)));
    bins[idx] = (bins[idx] ?? 0) + 1;
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  const maxBin = Math.max(1, ...bins);
  return {
    bins,
    maxBin,
    mean: Math.round(sum / Math.max(1, count)),
    min,
    max,
  };
}

/** 현재 튜닝 값으로 충성도 개입 규칙 조립 */
export function buildLoyaltyRules(
  byId: ReadonlyMap<string, TuningEntryView>,
  pending: NpcAiPending,
): LoyaltyOverrideRules {
  const d = DEFAULT_LOYALTY_OVERRIDE_RULES;
  return {
    at100Pm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_100_pm", d.at100Pm),
    at80Pm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_80_pm", d.at80Pm),
    at50Pm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_50_pm", d.at50Pm),
    at20Pm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_20_pm", d.at20Pm),
    at0Pm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_0_pm", d.at0Pm),
    minPm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_min_pm", d.minPm),
    maxPm: effectiveValue(byId, pending, "npc_ai_loyalty_ov_max_pm", d.maxPm),
    autonomyWeightPm: effectiveValue(byId, pending, "npc_ai_loyalty_autonomy_pm", d.autonomyWeightPm),
    disciplineWeightPm: effectiveValue(byId, pending, "npc_ai_loyalty_discipline_pm", d.disciplineWeightPm),
    communalismWeightPm: effectiveValue(
      byId,
      pending,
      "npc_ai_loyalty_communalism_pm",
      d.communalismWeightPm,
    ),
    creatureInstinctPm: effectiveValue(byId, pending, "npc_ai_creature_instinct_pm", d.creatureInstinctPm),
  };
}

export interface LoyaltyCurvePoint {
  readonly loyalty: number;
  readonly neutralPm: number;
  readonly rebelliousPm: number;
  readonly loyalistPm: number;
}

const REBELLIOUS_SAMPLE: UnitTraits = {
  ...DEFAULT_UNIT_TRAITS,
  autonomy: 900,
  discipline: 150,
  communalism: 200,
};

const LOYALIST_SAMPLE: UnitTraits = {
  ...DEFAULT_UNIT_TRAITS,
  autonomy: 150,
  discipline: 900,
  communalism: 850,
};

/** 충성도 100 → 0(10점 간격 11점) 개입률 곡선 점 계산 */
export function sampleLoyaltyCurve(rules: LoyaltyOverrideRules): readonly LoyaltyCurvePoint[] {
  const points: LoyaltyCurvePoint[] = [];
  for (let loyalty = 100; loyalty >= 0; loyalty -= 10) {
    const loyaltyMilli = loyalty * 1000;
    points.push({
      loyalty,
      neutralPm: loyaltyOverridePm({ kind: "human", loyaltyMilli, traits: DEFAULT_UNIT_TRAITS, rules }),
      rebelliousPm: loyaltyOverridePm({ kind: "human", loyaltyMilli, traits: REBELLIOUS_SAMPLE, rules }),
      loyalistPm: loyaltyOverridePm({ kind: "human", loyaltyMilli, traits: LOYALIST_SAMPLE, rules }),
    });
  }
  return points;
}

/** 탭 3 전략 판단 묶음(기존 npc_* · s19_* · d323_* 튜닝 키) */
export interface StrategyCardGroup {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly keys: readonly string[];
}

export const STRATEGY_CARD_GROUPS: readonly StrategyCardGroup[] = [
  {
    id: "war_peace",
    titleKo: "전쟁 · 강화 · 반란",
    titleEn: "War, Peace & Rebellion",
    keys: [
      "d323_decide_every",
      "npc_idle_score",
      "npc_attack_ratio",
      "npc_attack_satisfaction",
      "npc_attack_war_bonus",
      "npc_attack_declare_penalty",
      "npc_attack_comfort_cities",
      "npc_attack_city_penalty",
      "npc_suppress_bonus",
      "npc_peace_weary_score",
      "npc_peace_weaker_score",
      "npc_peace_winning_penalty",
      "npc_peace_accept_base",
      "npc_break_ratio_pm",
    ],
  },
  {
    id: "towns_ruins",
    titleKo: "개척 · 폐허 복구 · 점령",
    titleEn: "Founding, Ruins & Occupation",
    keys: [
      "npc_reserve_pm",
      "npc_found_score",
      "npc_found_vassal_penalty",
      "npc_restore_claim_score",
      "npc_restore_former_bonus",
      "npc_restore_city_penalty",
      "npc_delist_aggression",
      "npc_independent_aggression",
      "npc_refuse_aggression",
      "npc_vote_commerce",
      "npc_capital_switch_dev",
    ],
  },
  {
    id: "research_shares",
    titleKo: "연구 · 지분 · 성향 물려받기",
    titleEn: "Research, Shares & Inheritance",
    keys: [
      "npc_research_blocked_score",
      "npc_research_score",
      "npc_invest_cost_weight_pm",
      "npc_invest_challenge_step_pm",
      "npc_invest_challenge_max_pm",
      "npc_share_sale_score",
      "npc_share_keep_pm",
      "s19_trait_min",
      "s19_trait_max",
      "s19_trait_drift",
    ],
  },
  {
    id: "tax_trade",
    titleKo: "세율 · 교역 · 중앙은행",
    titleEn: "Tax, Trade & Central Bank",
    keys: [
      "d323_tax_step",
      "d323_tax_max",
      "d323_tax_floor",
      "npc_trade_markup",
      "npc_spend_divisor_short",
      "npc_spend_divisor",
      "npc_stall_food_pm",
      "npc_bank_target",
      "npc_bank_gain",
      "npc_bank_daily_cap",
      "npc_bank_interest",
    ],
  },
  {
    id: "city_build",
    titleKo: "도시 건설 · 수리 · 일과",
    titleEn: "City Building, Repair & Schedule",
    keys: [
      "npc_work_start_pm",
      "npc_work_end_pm",
      "npc_build_max_buildings",
      "npc_build_gather_max",
      "npc_build_farm_humans",
      "npc_build_builders_max",
      "npc_build_repair_below_pm",
      "npc_build_cap_temper",
      "npc_build_cap_commerce",
      "npc_build_cap_leader",
      "npc_build_lodging_faith",
      "npc_build_lodging_commerce",
    ],
  },
  {
    id: "recruit_gather",
    titleKo: "구인 · 채집 티어 · 선박",
    titleEn: "Recruit, Gather Tier & Boats",
    keys: [
      "npc_recruit_target",
      "npc_recruit_reserve",
      "npc_gather_tier_commerce",
      "npc_gather_tier_aggression",
      "npc_gather_tier_faith",
      "npc_gather_tier_leader",
      "npc_gather_tier_floor",
      "npc_boats_per_dock",
      "npc_boat_fishers",
    ],
  },
];

/** 탭 4 전투·조우 튜닝 키 */
export const ENCOUNTER_TUNING_KEYS: readonly string[] = [
  "npc_ai_commander_share_pm",
  "encounter_scan_ms",
  "encounter_cooldown_ms",
  "encounter_max_per_scan",
  "encounter_map_size",
  "encounter_radius_cells",
  "encounter_max_side_units",
  "encounter_war_ratio_pm",
  "encounter_loot_ratio_pm",
  "encounter_aggression_pm",
  "encounter_player_policy",
  "encounter_full_pm",
  "encounter_regroup_hp_pm",
];

/** tRPC 오류 파싱 */
export interface NpcAiErrorInfo {
  readonly key: TuningReason | "session_expired" | "no_permission" | "network" | "unknown";
  readonly problems: readonly TuningProblem[];
  readonly sessionEnded: boolean;
}

const isReason = (value: unknown): value is TuningReason =>
  typeof value === "string" && (TUNING_REASONS as readonly string[]).includes(value);

export function npcAiErrorOf(error: unknown): NpcAiErrorInfo {
  const data = field(error, "data");
  const code = field(data, "code");
  if (code === "UNAUTHORIZED") return { key: "session_expired", problems: [], sessionEnded: true };
  if (code === "FORBIDDEN") return { key: "no_permission", problems: [], sessionEnded: false };
  const reason = field(data, "reason");
  const rawProblems = field(data, "details") ?? field(data, "problems");
  const problems = Array.isArray(rawProblems) ? rawProblems.filter(isTuningProblem) : [];
  if (isReason(reason)) return { key: reason, problems, sessionEnded: false };
  if (error instanceof TypeError) return { key: "network", problems: [], sessionEnded: false };
  return { key: "unknown", problems, sessionEnded: false };
}

/** 7축 모두 중립 500인지 점검 */
export function isAllAxisCount(): number {
  return UNIT_TRAIT_AXES.length;
}
