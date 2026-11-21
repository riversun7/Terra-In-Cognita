// 무손실·양극 7축 유닛·조직 성향 모델, 체제별 합성기, 충성도 연동 작전 변환기 — docs/adr/2026-11-20-npc-autonomous-ai.md
// @terra/shared 최하층 순수 모듈(외부·다른 내부 패키지 import 없음, erasableSyntaxOnly, 정수·결정적 계산만).
// 서버·시뮬레이터·게임 에디터(/dev/npc-ai 판단 실험실)가 모두 이 한 곳의 공식을 공유한다.
import {
  AI_RETREAT_MAX,
  AI_SLIDER_MAX,
  type AiPreset,
  type AiTactics,
  type AiTarget,
  npcPresetOf,
} from "./aiTactics.ts";
import type { Rng } from "./rng.ts";

/** 무손실·양극 7축 차례(DB 배열·굴림 차례가 이것을 따른다) */
export const UNIT_TRAIT_AXES = [
  "belligerence",
  "greed",
  "boldness",
  "communalism",
  "autonomy",
  "openness",
  "discipline",
] as const;

export type TraitAxis = (typeof UNIT_TRAIT_AXES)[number];

/** 대장 결단 비중이 큰 축(전쟁·모험·독립) */
export const DECISION_TRAIT_AXES: readonly TraitAxis[] = ["belligerence", "boldness", "autonomy"];

/** 구성원·문화 비중이 큰 축(이윤·공동체·개방·규율) */
export const CULTURE_TRAIT_AXES: readonly TraitAxis[] = ["greed", "communalism", "openness", "discipline"];

/** 축 기술 안전 범위(0~1000 정수, 가운데 500 = 중립) */
export const UNIT_TRAIT_MIN = 0;
export const UNIT_TRAIT_MAX = 1000;
export const UNIT_TRAIT_MID = 500;

/** 7축 통합 성향(모든 축 0~1000 정수) */
export interface UnitTraits {
  /** 평화·수비(0) ↔ 호전·공격(1000) */
  readonly belligerence: number;
  /** 공공·자급(0) ↔ 이윤·시장(1000) */
  readonly greed: number;
  /** 신중·안전(0) ↔ 과감·모험(1000) */
  readonly boldness: number;
  /** 실리·개인(0) ↔ 공동체·신앙(1000) */
  readonly communalism: number;
  /** 순응·연대(0) ↔ 자치·야망(1000) */
  readonly autonomy: number;
  /** 폐쇄·보수(0) ↔ 개방·교류(1000) */
  readonly openness: number;
  /** 자유·즉흥(0) ↔ 규율·성실(1000) */
  readonly discipline: number;
}

/** 중립 성향(모두 500) */
export const DEFAULT_UNIT_TRAITS: UnitTraits = {
  belligerence: UNIT_TRAIT_MID,
  greed: UNIT_TRAIT_MID,
  boldness: UNIT_TRAIT_MID,
  communalism: UNIT_TRAIT_MID,
  autonomy: UNIT_TRAIT_MID,
  openness: UNIT_TRAIT_MID,
  discipline: UNIT_TRAIT_MID,
};

/** 옛 4축 세력 성향(D-327 호환 입력·투영) */
export interface LegacyFactionTraits {
  readonly aggression: number;
  readonly commerce: number;
  readonly faith: number;
  readonly station: number;
}

/** 축 하나의 생성 범위(양 끝 포함, 0~1000 정수) */
export interface TraitRange {
  readonly min: number;
  readonly max: number;
}

/** 유닛 직군별 성향 생성 프로파일 */
export type TraitRole = "citizen" | "guard" | "leader" | "recruit" | "creature" | "android";

export const TRAIT_ROLES = ["citizen", "guard", "leader", "recruit", "creature", "android"] as const;

export type TraitRangeMap = Readonly<Record<TraitAxis, TraitRange>>;

/** 정권 체제(D-217, packages/sim shares.ts Regime와 같은 문자열) */
export type TraitRegime = "dictatorship" | "democracy" | "capitalism";

/** 조직 합성 3항 비율(합 1000‰: 대장 + 구성원 + 바탕) */
export interface BlendTriplet {
  readonly leaderPm: number;
  readonly membersPm: number;
  readonly basePm: number;
}

/** 축 성격(결단 vs 문화)별 합성 비율 */
export interface AxisGroupBlend {
  readonly decision: BlendTriplet;
  readonly culture: BlendTriplet;
}

/** 체제·가문·도시 전체 조직 합성 규칙(모두 에디터 조작) */
export interface AiBlendRules {
  readonly dictatorship: AxisGroupBlend;
  readonly democracy: AxisGroupBlend;
  readonly capitalism: AxisGroupBlend;
  readonly house: AxisGroupBlend;
  readonly city: AxisGroupBlend;
  /** 조직 평균 충성도(0~100)가 이 값 아래로 내려갈수록 대장 비중을 감쇠한다 */
  readonly orgLoyaltyFloor: number;
  /** 충성도 0일 때 남는 대장 비중 하한(원래 대장 비중의 ‰, 예: 300 = 30%만 유지) */
  readonly orgLoyaltyMinSharePm: number;
}

/** 기본 조직 합성 비율(ADR 2026-11-20 2.1절 출발값) */
export const DEFAULT_AI_BLEND_RULES: AiBlendRules = {
  dictatorship: {
    decision: { leaderPm: 750, membersPm: 50, basePm: 200 },
    culture: { leaderPm: 550, membersPm: 200, basePm: 250 },
  },
  democracy: {
    decision: { leaderPm: 400, membersPm: 400, basePm: 200 },
    culture: { leaderPm: 200, membersPm: 550, basePm: 250 },
  },
  capitalism: {
    decision: { leaderPm: 350, membersPm: 450, basePm: 200 },
    culture: { leaderPm: 200, membersPm: 550, basePm: 250 },
  },
  house: {
    decision: { leaderPm: 800, membersPm: 200, basePm: 0 },
    culture: { leaderPm: 600, membersPm: 400, basePm: 0 },
  },
  city: {
    decision: { leaderPm: 650, membersPm: 0, basePm: 350 },
    culture: { leaderPm: 500, membersPm: 200, basePm: 300 },
  },
  orgLoyaltyFloor: 50,
  orgLoyaltyMinSharePm: 300,
};

/** 충성도(=만족도, D-253) 연동 개성 개입률 규칙(모두 ‰ 정수, 에디터 조작) */
export interface LoyaltyOverrideRules {
  /** 충성도 100·80·50·20·0 지점의 기본 개성 개입률(‰) */
  readonly at100Pm: number;
  readonly at80Pm: number;
  readonly at50Pm: number;
  readonly at20Pm: number;
  readonly at0Pm: number;
  /** 최종 개입률 하한·상한(‰, 0~1000) */
  readonly minPm: number;
  readonly maxPm: number;
  /** 성향 보정 세기(‰, 축 끝 ±500에서 적용): 자치(+) · 규율(−) · 공동체(−) */
  readonly autonomyWeightPm: number;
  readonly disciplineWeightPm: number;
  readonly communalismWeightPm: number;
  /** 만족도가 없는 크리쳐(D-127)의 고정 야생 본능 개입률(‰) */
  readonly creatureInstinctPm: number;
}

/** 기본 충성도 개입 곡선(ADR 2026-11-20 2.2절) */
export const DEFAULT_LOYALTY_OVERRIDE_RULES: LoyaltyOverrideRules = {
  at100Pm: 0,
  at80Pm: 50,
  at50Pm: 250,
  at20Pm: 600,
  at0Pm: 800,
  minPm: 0,
  maxPm: 800,
  autonomyWeightPm: 300,
  disciplineWeightPm: 300,
  communalismWeightPm: 150,
  creatureInstinctPm: 350,
};

/** 충성도 개입 판정 시 유닛 종류(D-127 구분) */
export type LoyaltyUnitKind = "cyborg_main" | "human" | "android" | "creature";

/** 직군별 기본 성향 생성 구간 */
export const DEFAULT_ROLE_TRAIT_RANGES: Readonly<Record<TraitRole, TraitRangeMap>> = {
  citizen: {
    belligerence: { min: 150, max: 750 },
    greed: { min: 200, max: 850 },
    boldness: { min: 150, max: 800 },
    communalism: { min: 200, max: 850 },
    autonomy: { min: 150, max: 800 },
    openness: { min: 150, max: 850 },
    discipline: { min: 200, max: 850 },
  },
  guard: {
    belligerence: { min: 450, max: 950 },
    greed: { min: 150, max: 700 },
    boldness: { min: 500, max: 950 },
    communalism: { min: 350, max: 900 },
    autonomy: { min: 100, max: 650 },
    openness: { min: 150, max: 700 },
    discipline: { min: 450, max: 950 },
  },
  leader: {
    belligerence: { min: 100, max: 950 },
    greed: { min: 100, max: 950 },
    boldness: { min: 300, max: 950 },
    communalism: { min: 100, max: 950 },
    autonomy: { min: 400, max: 950 },
    openness: { min: 100, max: 950 },
    discipline: { min: 250, max: 950 },
  },
  recruit: {
    belligerence: { min: 100, max: 900 },
    greed: { min: 100, max: 900 },
    boldness: { min: 100, max: 900 },
    communalism: { min: 100, max: 900 },
    autonomy: { min: 100, max: 900 },
    openness: { min: 100, max: 900 },
    discipline: { min: 100, max: 900 },
  },
  creature: {
    belligerence: { min: 300, max: 1000 },
    greed: { min: 0, max: 300 },
    boldness: { min: 250, max: 1000 },
    communalism: { min: 100, max: 700 },
    autonomy: { min: 500, max: 1000 },
    openness: { min: 0, max: 400 },
    discipline: { min: 50, max: 500 },
  },
  android: {
    belligerence: { min: 300, max: 700 },
    greed: { min: 300, max: 700 },
    boldness: { min: 400, max: 700 },
    communalism: { min: 400, max: 700 },
    autonomy: { min: 0, max: 200 },
    openness: { min: 400, max: 700 },
    discipline: { min: 800, max: 1000 },
  },
};

const clampInt = (value: number, min: number, max: number): number => {
  const n = Math.trunc(value);
  return n < min ? min : n > max ? max : n;
};

const clampTrait = (value: number): number => clampInt(value, UNIT_TRAIT_MIN, UNIT_TRAIT_MAX);

const isDecisionAxis = (axis: TraitAxis): boolean =>
  axis === "belligerence" || axis === "boldness" || axis === "autonomy";

/** 7축 성향 모양·범위 검사 */
export function isUnitTraits(value: unknown): value is UnitTraits {
  if (typeof value !== "object" || value === null) return false;
  return UNIT_TRAIT_AXES.every((axis) => {
    const v = Reflect.get(value, axis);
    return typeof v === "number" && Number.isInteger(v) && v >= UNIT_TRAIT_MIN && v <= UNIT_TRAIT_MAX;
  });
}

/** 성향 → 저장 배열(UNIT_TRAIT_AXES 차례, 길이 7) */
export function unitTraitsToArray(traits: UnitTraits): number[] {
  return UNIT_TRAIT_AXES.map((axis) => clampTrait(traits[axis]));
}

/** 저장 배열(길이 7, 각 0~1000 정수) → 성향. 틀리면 undefined */
export function unitTraitsFromArray(values: readonly number[] | null | undefined): UnitTraits | undefined {
  if (!values || values.length !== UNIT_TRAIT_AXES.length) return undefined;
  for (const v of values) {
    if (!Number.isInteger(v) || v < UNIT_TRAIT_MIN || v > UNIT_TRAIT_MAX) return undefined;
  }
  return {
    belligerence: values[0] ?? UNIT_TRAIT_MID,
    greed: values[1] ?? UNIT_TRAIT_MID,
    boldness: values[2] ?? UNIT_TRAIT_MID,
    communalism: values[3] ?? UNIT_TRAIT_MID,
    autonomy: values[4] ?? UNIT_TRAIT_MID,
    openness: values[5] ?? UNIT_TRAIT_MID,
    discipline: values[6] ?? UNIT_TRAIT_MID,
  };
}

/**
 * 옛 4축 세력 성향(D-327) + 선택 지도자 기질(leaderPm, −1000~1000‰) → 7축 통합 성향으로 변환.
 * - aggression → belligerence, commerce → greed, faith → communalism, station → openness
 * - boldness = leaderPm이 있으면 500 + leaderPm / 2, 없으면 (aggression + commerce) / 2
 * - autonomy = (aggression * 6 + commerce * 4) / 10 (기존 독립·봉신 규칙과 부드럽게 연결)
 * - discipline = (faith * 6 + (1000 - aggression) * 4) / 10
 */
export function upgradeLegacyTraits(legacy: LegacyFactionTraits, leaderPm?: number): UnitTraits {
  const agg = clampTrait(legacy.aggression);
  const com = clampTrait(legacy.commerce);
  const fai = clampTrait(legacy.faith);
  const sta = clampTrait(legacy.station);
  const boldness =
    leaderPm === undefined
      ? Math.floor((agg + com) / 2)
      : clampTrait(UNIT_TRAIT_MID + Math.trunc(clampInt(leaderPm, -1000, 1000) / 2));
  const autonomy = clampTrait(Math.floor((agg * 6 + com * 4) / 10));
  const discipline = clampTrait(Math.floor((fai * 6 + (UNIT_TRAIT_MAX - agg) * 4) / 10));
  return {
    belligerence: agg,
    greed: com,
    boldness,
    communalism: fai,
    autonomy,
    openness: sta,
    discipline,
  };
}

/** 7축 통합 성향 → 옛 4축 투영(하위 호환 읽기용) */
export function toLegacyTraits(traits: UnitTraits): LegacyFactionTraits {
  return {
    aggression: clampTrait(traits.belligerence),
    commerce: clampTrait(traits.greed),
    faith: clampTrait(traits.communalism),
    station: clampTrait(traits.openness),
  };
}

/** 직군별 구간 안에서 시드 난수로 7축 성향 생성(축당 1회 굴림, 총 7회) */
export function rollUnitTraits(rng: Rng, ranges: TraitRangeMap): UnitTraits {
  const rollAxis = (range: TraitRange): number => {
    const low = clampTrait(Math.min(range.min, range.max));
    const high = clampTrait(Math.max(range.min, range.max));
    return low + rng.nextInt(high - low + 1);
  };
  return {
    belligerence: rollAxis(ranges.belligerence),
    greed: rollAxis(ranges.greed),
    boldness: rollAxis(ranges.boldness),
    communalism: rollAxis(ranges.communalism),
    autonomy: rollAxis(ranges.autonomy),
    openness: rollAxis(ranges.openness),
    discipline: rollAxis(ranges.discipline),
  };
}

/**
 * 소속 국가/가문 바탕 성향 ± spread 안에서 직군 구간으로 자른 뒤 시드 굴림(축당 1회, 총 7회).
 * 같은 나라 안에서도 개성 있는 유닛이 나오되 문화 평균이 유지된다.
 */
export function driftUnitTraits(
  anchor: UnitTraits,
  spread: number,
  rng: Rng,
  bounds?: TraitRangeMap,
): UnitTraits {
  const s = Math.max(0, Math.trunc(spread));
  const pick = (axis: TraitAxis): number => {
    const bound = bounds?.[axis] ?? { min: UNIT_TRAIT_MIN, max: UNIT_TRAIT_MAX };
    const bMin = clampTrait(Math.min(bound.min, bound.max));
    const bMax = clampTrait(Math.max(bound.min, bound.max));
    const center = clampInt(anchor[axis], bMin, bMax);
    const low = Math.max(bMin, center - s);
    const high = Math.min(bMax, center + s);
    return low + rng.nextInt(high - low + 1);
  };
  return {
    belligerence: pick("belligerence"),
    greed: pick("greed"),
    boldness: pick("boldness"),
    communalism: pick("communalism"),
    autonomy: pick("autonomy"),
    openness: pick("openness"),
    discipline: pick("discipline"),
  };
}

/** 가중 평균 성향(구성원·지분 집계용). 빈 목록이면 undefined */
export function weightedAverageTraits(
  entries: readonly { readonly traits: UnitTraits; readonly weight: number }[],
): UnitTraits | undefined {
  let weightSum = 0;
  const sums = [0, 0, 0, 0, 0, 0, 0];
  for (const entry of entries) {
    const w = Math.max(0, Math.trunc(entry.weight));
    if (w <= 0) continue;
    weightSum += w;
    sums[0] = (sums[0] ?? 0) + entry.traits.belligerence * w;
    sums[1] = (sums[1] ?? 0) + entry.traits.greed * w;
    sums[2] = (sums[2] ?? 0) + entry.traits.boldness * w;
    sums[3] = (sums[3] ?? 0) + entry.traits.communalism * w;
    sums[4] = (sums[4] ?? 0) + entry.traits.autonomy * w;
    sums[5] = (sums[5] ?? 0) + entry.traits.openness * w;
    sums[6] = (sums[6] ?? 0) + entry.traits.discipline * w;
  }
  if (weightSum <= 0) return undefined;
  const half = Math.floor(weightSum / 2);
  return {
    belligerence: clampTrait(Math.floor(((sums[0] ?? 0) + half) / weightSum)),
    greed: clampTrait(Math.floor(((sums[1] ?? 0) + half) / weightSum)),
    boldness: clampTrait(Math.floor(((sums[2] ?? 0) + half) / weightSum)),
    communalism: clampTrait(Math.floor(((sums[3] ?? 0) + half) / weightSum)),
    autonomy: clampTrait(Math.floor(((sums[4] ?? 0) + half) / weightSum)),
    openness: clampTrait(Math.floor(((sums[5] ?? 0) + half) / weightSum)),
    discipline: clampTrait(Math.floor(((sums[6] ?? 0) + half) / weightSum)),
  };
}

/** 조직 평균 충성도(0~100)에 따른 대장 비중 조정(충성도 낮으면 대장 비중을 줄여 구성원 쪽으로 넘긴다) */
function loyaltyAdjustedTriplet(
  triplet: BlendTriplet,
  avgLoyalty: number | undefined,
  loyaltyFloor: number,
  minSharePm: number,
): BlendTriplet {
  const floor = clampInt(loyaltyFloor, 0, 100);
  if (avgLoyalty === undefined || floor <= 0 || avgLoyalty >= floor) return triplet;
  const clamped = clampInt(avgLoyalty, 0, floor);
  const minShare = clampInt(minSharePm, 0, 1000);
  // 충성도 0 → minSharePm, loyaltyFloor → 1000‰
  const scalePm = minShare + Math.floor(((1000 - minShare) * clamped) / floor);
  const nextLeader = Math.floor((triplet.leaderPm * scalePm) / 1000);
  const lost = triplet.leaderPm - nextLeader;
  return {
    leaderPm: nextLeader,
    membersPm: triplet.membersPm + lost,
    basePm: triplet.basePm,
  };
}

/**
 * 조직 실효 성향 합성(순수 정수): 축 성격(결단 vs 문화)별로 (대장 · 구성원 · 바탕) 가중 합.
 * 없는 입력(예: 대장 부재 또는 빈 구성원)의 비중은 남은 항목에 비례 분배한다. 모두 없으면 DEFAULT_UNIT_TRAITS.
 */
export function blendOrgTraits(input: {
  readonly leader?: UnitTraits | undefined;
  readonly members?: UnitTraits | undefined;
  readonly base?: UnitTraits | undefined;
  readonly blend: AxisGroupBlend;
  /** 조직 평균 충성도(0~100). 있으면 floor 아래에서 대장 비중을 감쇠한다 */
  readonly avgLoyalty?: number | undefined;
  readonly loyaltyFloor?: number | undefined;
  readonly minLeaderSharePm?: number | undefined;
}): UnitTraits {
  const floor = input.loyaltyFloor ?? DEFAULT_AI_BLEND_RULES.orgLoyaltyFloor;
  const minShare = input.minLeaderSharePm ?? DEFAULT_AI_BLEND_RULES.orgLoyaltyMinSharePm;
  const dec = loyaltyAdjustedTriplet(input.blend.decision, input.avgLoyalty, floor, minShare);
  const cul = loyaltyAdjustedTriplet(input.blend.culture, input.avgLoyalty, floor, minShare);
  const mixAxis = (axis: TraitAxis): number => {
    const t = isDecisionAxis(axis) ? dec : cul;
    let num = 0;
    let den = 0;
    if (input.leader && t.leaderPm > 0) {
      num += input.leader[axis] * t.leaderPm;
      den += t.leaderPm;
    }
    if (input.members && t.membersPm > 0) {
      num += input.members[axis] * t.membersPm;
      den += t.membersPm;
    }
    if (input.base && t.basePm > 0) {
      num += input.base[axis] * t.basePm;
      den += t.basePm;
    }
    if (den <= 0) {
      const fallback = input.leader ?? input.members ?? input.base;
      return fallback ? clampTrait(fallback[axis]) : UNIT_TRAIT_MID;
    }
    return clampTrait(Math.floor((num + Math.floor(den / 2)) / den));
  };
  return {
    belligerence: mixAxis("belligerence"),
    greed: mixAxis("greed"),
    boldness: mixAxis("boldness"),
    communalism: mixAxis("communalism"),
    autonomy: mixAxis("autonomy"),
    openness: mixAxis("openness"),
    discipline: mixAxis("discipline"),
  };
}

/** 국가 실효 성향(체제별 합성 규칙 적용) */
export function blendFactionTraits(input: {
  readonly regime: TraitRegime;
  readonly leader?: UnitTraits | undefined;
  readonly houses?: readonly { readonly traits: UnitTraits; readonly weight: number }[] | undefined;
  readonly base?: UnitTraits | undefined;
  readonly avgLoyalty?: number | undefined;
  readonly rules?: AiBlendRules | undefined;
}): UnitTraits {
  const rules = input.rules ?? DEFAULT_AI_BLEND_RULES;
  return blendOrgTraits({
    leader: input.leader,
    members: input.houses ? weightedAverageTraits(input.houses) : undefined,
    base: input.base,
    blend: rules[input.regime],
    avgLoyalty: input.avgLoyalty,
    loyaltyFloor: rules.orgLoyaltyFloor,
    minLeaderSharePm: rules.orgLoyaltyMinSharePm,
  });
}

/** 가문 실효 성향 */
export function blendHouseTraits(input: {
  readonly leader?: UnitTraits | undefined;
  readonly members?: readonly UnitTraits[] | undefined;
  readonly override?: UnitTraits | undefined;
  readonly avgLoyalty?: number | undefined;
  readonly rules?: AiBlendRules | undefined;
}): UnitTraits {
  if (input.override) return input.override;
  const rules = input.rules ?? DEFAULT_AI_BLEND_RULES;
  const membersAvg = input.members
    ? weightedAverageTraits(input.members.map((traits) => ({ traits, weight: 1 })))
    : undefined;
  return blendOrgTraits({
    leader: input.leader,
    members: membersAvg,
    blend: rules.house,
    avgLoyalty: input.avgLoyalty,
    loyaltyFloor: rules.orgLoyaltyFloor,
    minLeaderSharePm: rules.orgLoyaltyMinSharePm,
  });
}

/** 도시 내정 실효 성향(시장 + 시민 + 소속 국가) */
export function blendCityTraits(input: {
  readonly mayor?: UnitTraits | undefined;
  readonly citizens?: readonly UnitTraits[] | undefined;
  readonly nation?: UnitTraits | undefined;
  readonly avgLoyalty?: number | undefined;
  readonly rules?: AiBlendRules | undefined;
}): UnitTraits {
  const rules = input.rules ?? DEFAULT_AI_BLEND_RULES;
  const citizensAvg = input.citizens
    ? weightedAverageTraits(input.citizens.map((traits) => ({ traits, weight: 1 })))
    : undefined;
  return blendOrgTraits({
    leader: input.mayor,
    members: citizensAvg,
    base: input.nation,
    blend: rules.city,
    avgLoyalty: input.avgLoyalty,
    loyaltyFloor: rules.orgLoyaltyFloor,
    minLeaderSharePm: rules.orgLoyaltyMinSharePm,
  });
}

/** 정수 선형 보간 */
function lerpInt(x: number, x0: number, y0: number, x1: number, y1: number): number {
  return y0 + Math.trunc(((y1 - y0) * (x - x0)) / Math.max(1, x1 - x0));
}

/** 축 값(0~1000, 중립 500) → 가중치(‰) 편향 */
function axisTiltPm(axisVal: number, weightPm: number): number {
  return Math.trunc(((clampTrait(axisVal) - UNIT_TRAIT_MID) * Math.trunc(weightPm)) / UNIT_TRAIT_MID);
}

/** 충성도 구간 선형 보간(loyaltyMilli: 0~100,000 → 기본 개입률 ‰) */
function baseLoyaltyCurvePm(loyaltyMilli: number, rules: LoyaltyOverrideRules): number {
  const m = clampInt(loyaltyMilli, 0, 100_000);
  if (m >= 80_000) return lerpInt(m, 80_000, rules.at80Pm, 100_000, rules.at100Pm);
  if (m >= 50_000) return lerpInt(m, 50_000, rules.at50Pm, 80_000, rules.at80Pm);
  if (m >= 20_000) return lerpInt(m, 20_000, rules.at20Pm, 50_000, rules.at50Pm);
  return lerpInt(m, 0, rules.at0Pm, 20_000, rules.at20Pm);
}

/**
 * 충성도(=만족도, D-253) 기반 플레이어 명령 대비 유닛 개성 개입률(0~1000‰).
 * - 사이보그 본체·안드로이드(D-127)·만족도 미집계(null) = 0‰(명령 100% 순종)
 * - 크리쳐(D-127) = 고정 야생 본능 개입률(creatureInstinctPm)
 * - 휴먼 = 충성도 곡선 × (1000 + autonomy 보정 − discipline 보정 − communalism 보정) ÷ 1000, [minPm, maxPm]
 */
export function loyaltyOverridePm(input: {
  readonly kind: LoyaltyUnitKind;
  /** 만족도 밀리점(0~100,000). null/undefined면 미집계 → 0‰ */
  readonly loyaltyMilli: number | null | undefined;
  readonly traits: UnitTraits;
  readonly rules?: LoyaltyOverrideRules | undefined;
}): number {
  const rules = input.rules ?? DEFAULT_LOYALTY_OVERRIDE_RULES;
  const lo = clampInt(Math.min(rules.minPm, rules.maxPm), 0, 1000);
  const hi = clampInt(Math.max(rules.minPm, rules.maxPm), 0, 1000);
  if (input.kind === "cyborg_main" || input.kind === "android") return 0;
  if (input.kind === "creature") return clampInt(rules.creatureInstinctPm, lo, hi);
  if (input.loyaltyMilli === null || input.loyaltyMilli === undefined) return 0;
  const basePm = baseLoyaltyCurvePm(input.loyaltyMilli, rules);
  if (basePm <= 0) return lo;
  const factorPm = Math.max(
    0,
    1000 +
      axisTiltPm(input.traits.autonomy, rules.autonomyWeightPm) -
      axisTiltPm(input.traits.discipline, rules.disciplineWeightPm) -
      axisTiltPm(input.traits.communalism, rules.communalismWeightPm),
  );
  const raw = Math.floor((basePm * factorPm + 500) / 1000);
  return clampInt(raw, lo, hi);
}

/** 0~1000 값 → 0~10 슬라이더 정수(반올림) */
const toSlider = (pm: number): number =>
  clampInt(Math.floor((clampTrait(pm) * AI_SLIDER_MAX + 500) / 1000), 0, AI_SLIDER_MAX);

/**
 * 7축 성향 → AI 작전 7슬라이더·목표 우선순위·대표 프리셋(D-5040 · ADR 2026-11-20).
 * 지휘관 성향과 지휘 비중(commanderSharePm)을 주면 유닛·지휘관 성향을 먼저 섞는다.
 */
export function tacticsFromUnitTraits(
  traits: UnitTraits,
  commander?: { readonly traits: UnitTraits; readonly sharePm: number },
): AiTactics {
  let eff = traits;
  if (commander && commander.sharePm > 0) {
    const share = clampInt(commander.sharePm, 0, 1000);
    const keep = 1000 - share;
    const mix = (a: number, b: number): number => clampTrait(Math.floor((a * keep + b * share + 500) / 1000));
    eff = {
      belligerence: mix(traits.belligerence, commander.traits.belligerence),
      greed: mix(traits.greed, commander.traits.greed),
      boldness: mix(traits.boldness, commander.traits.boldness),
      communalism: mix(traits.communalism, commander.traits.communalism),
      autonomy: mix(traits.autonomy, commander.traits.autonomy),
      openness: mix(traits.openness, commander.traits.openness),
      discipline: mix(traits.discipline, commander.traits.discipline),
    };
  }
  const engage = toSlider(Math.floor((eff.belligerence * 6 + eff.boldness * 4) / 10));
  const pursue = toSlider(Math.floor((eff.belligerence * 6 + eff.autonomy * 4) / 10));
  const cover = toSlider(Math.floor(((1000 - eff.boldness) * 6 + (1000 - eff.belligerence) * 4) / 10));
  const escort = toSlider(Math.floor((eff.communalism * 7 + (1000 - eff.autonomy) * 3) / 10));
  const saveSkill = toSlider(Math.floor((eff.discipline * 6 + (1000 - eff.belligerence) * 4) / 10));
  const spread = toSlider(Math.floor((eff.discipline * 5 + (1000 - eff.communalism) * 5) / 10));
  // ⑦ 퇴각 기준(0~80%, 10% 단위): boldness 1000 → 0%, 0 → 80%
  const retreatPct = clampInt(Math.round(((1000 - eff.boldness) * 8) / 1000) * 10, 0, AI_RETREAT_MAX);
  const target: AiTarget =
    eff.belligerence >= 650 ? "weakest" : eff.communalism >= 650 ? "threat" : "nearest";
  const preset: AiPreset = npcPresetOf(Math.floor((eff.belligerence * 7 + eff.boldness * 3) / 10));
  return { preset, engage, pursue, cover, escort, saveSkill, spread, retreatPct, target };
}

/**
 * 플레이어 작전 슬라이더 + 유닛 본능 작전을 충성도 개입률(overridePm, 0~1000‰)로 합성.
 * overridePm = 0이면 플레이어 작전 그대로, 1000이면 유닛 본능 그대로.
 */
export function blendTacticsByLoyalty(player: AiTactics, instinct: AiTactics, overridePm: number): AiTactics {
  const ov = clampInt(overridePm, 0, 1000);
  if (ov <= 0) return player;
  if (ov >= 1000) return instinct;
  const keep = 1000 - ov;
  const mixSlider = (p: number, u: number): number =>
    clampInt(Math.floor((p * keep + u * ov + 500) / 1000), 0, AI_SLIDER_MAX);
  const retreatRaw = Math.floor((player.retreatPct * keep + instinct.retreatPct * ov + 500) / 1000);
  const retreatPct = clampInt(Math.round(retreatRaw / 10) * 10, 0, AI_RETREAT_MAX);
  return {
    preset: ov > 500 ? instinct.preset : player.preset,
    engage: mixSlider(player.engage, instinct.engage),
    pursue: mixSlider(player.pursue, instinct.pursue),
    cover: mixSlider(player.cover, instinct.cover),
    escort: mixSlider(player.escort, instinct.escort),
    saveSkill: mixSlider(player.saveSkill, instinct.saveSkill),
    spread: mixSlider(player.spread, instinct.spread),
    retreatPct,
    target: ov >= 500 ? instinct.target : player.target,
  };
}
