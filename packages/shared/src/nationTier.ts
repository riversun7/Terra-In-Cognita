// 국력 등급(고정 NPC 국가의 고르지 않은 힘 분포) — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)".
// 사용자 답(2026-11-11, 질문 903 원문): "답1. 현재 테스트 맵에 실제 강대국 분포처럼 알아서 배치해달라."
// 팩 분류 nation_tiers(등급 표, 등급마다 한 줄)와 국가 프리셋 칸 powerTier가 쓰는 공용 모양·범위·푸는 차례.
// 푸는 차례(칸마다): 국가 프리셋 성격 칸(국가마다 값) → 등급 표 값 → 설정 칸(49 worldSeed) 값. 등급이 없는 프리셋은 옛 규칙 그대로다.
// 서버(apps/server/src/npc/nations.ts)·팩 스키마(@terra/content)·편집기(/dev/nations)가 같이 쓴다. 판정 코드가 아니다(세계 씨앗 값만).
import type { LocalizedName } from "./contentEdit.ts";

/** 국력 등급(강한 차례). 등급 표의 ID이자 프리셋 칸 powerTier의 값. 저장된 값이라 이름을 바꾸지 않는다 */
export const POWER_TIERS = [
  "superpower",
  "great_power",
  "middle_power",
  "small_state",
  "city_state",
] as const;
export type PowerTier = (typeof POWER_TIERS)[number];

export function isPowerTier(value: unknown): value is PowerTier {
  return typeof value === "string" && (POWER_TIERS as readonly string[]).includes(value);
}

/** 등급의 차례(0 = 가장 강함). 등급이 없으면 가운데(중견국) 자리로 친다 */
export function tierRank(tier: PowerTier | undefined): number {
  const index = tier === undefined ? -1 : POWER_TIERS.indexOf(tier);
  return index < 0 ? POWER_TIERS.indexOf("middle_power") : index;
}

/** 등급 표 칸의 범위(팩 스키마·편집기 입력이 같이 쓴다) */
export const NATION_TIER_LIMITS = {
  startCities: { min: 1, max: 8 },
  housing: { min: 4, max: 1000 },
  populationPm: { min: 0, max: 1000 },
  facilityCount: { min: 0, max: 8 },
  /** 등급 한 줄의 시설 줄 수 */
  facilities: 16,
  guardsPerCity: { min: 0, max: 12 },
  startTech: { min: 1, max: 5 },
  /** 처음 국고 = 고정 국가 처음 화폐 × 이 천분율 */
  startCreditPm: { min: 100, max: 10_000 },
  /** 한 국가 시작 도시 사이 칸(1 = 붙은 2차맵) */
  cityStepCells: { min: 1, max: 4 },
  /** 다른 국가 수도와 띄우는 거리 = 국가 간격(설정 칸) × 이 천분율 */
  homeGapPm: { min: 250, max: 4000 },
} as const;

/** 등급 표 한 줄(팩 nation_tiers 항목의 JSON 모양 — 시설 참조는 ID 글) */
export interface NationTierJson {
  readonly id: PowerTier;
  readonly name: LocalizedName;
  /** 시작 도시 수 */
  readonly startCities: number;
  /** 새 시작 도시의 주거 */
  readonly startHousing: number;
  /** 처음 인구 = floor(주거 × 천분율 ÷ 1000) */
  readonly startPopulationPm: number;
  /** 시작 도시 하나의 기본 시설 수(시설 ID마다 — 둘레 땅에 맞는 것만 선다). 줄이 없는 시설은 설정 칸 값 */
  readonly facilities: readonly { readonly facility: string; readonly count: number }[];
  /** 시작 도시 하나의 경비대(전투 유닛) 수 */
  readonly guardsPerCity: number;
  /** 처음 기술 단계 */
  readonly startTech: number;
  readonly startCreditPm: number;
  readonly cityStepCells: number;
  readonly homeGapPm: number;
}

/** 설정 칸(49 worldSeed)에서 오는 바닥 값 */
export interface NationStartDefaults {
  /** 옛 규칙의 시작 도시 수 아래 끝·위 끝(등급이 없는 프리셋만 이 범위로 자른다) */
  readonly startCitiesMin: number;
  readonly startCitiesMax: number;
  readonly housing: number;
  readonly populationPm: number;
  /** 시설 ID → 시작 도시 하나의 수 */
  readonly facilities: Readonly<Record<string, number>>;
  /** 한 국가 시작 도시 사이 칸(설정 칸 world_layout_city_step_cells) */
  readonly cityStepCells: number;
}

/** 국가 프리셋 성격 칸의 국가마다 값(있는 칸만) */
export interface NationStartOverrides {
  readonly startCities?: number | undefined;
  readonly startHousing?: number | undefined;
  readonly startPopulationPm?: number | undefined;
  readonly startFarms?: number | undefined;
  readonly startLumberCamps?: number | undefined;
  readonly startMines?: number | undefined;
  readonly startStorehouses?: number | undefined;
  readonly startGuards?: number | undefined;
  readonly startTech?: number | undefined;
}

/** 옛 성격 칸(시설 넷) ↔ 시설 ID */
export const LEGACY_FACILITY_FIELDS = {
  startFarms: "farm",
  startLumberCamps: "lumber_camp",
  startMines: "mine",
  startStorehouses: "storehouse",
} as const;

/** 값이 어디서 왔나(편집기가 "등급 기본값 N"·"기본값 N"으로 보인다) */
export type NationStartSource = "nation" | "tier" | "default";

/** 국가 하나의 시작 값(푼 결과) */
export interface NationStart {
  readonly tier: PowerTier | null;
  readonly startCities: number;
  readonly housing: number;
  readonly populationPm: number;
  /** 시작 도시 하나의 처음 인구(주거 × 천분율) */
  readonly populationPerCity: number;
  /** 시설 ID → 시작 도시 하나의 수(바닥 값 + 등급 + 국가 칸) */
  readonly facilities: Readonly<Record<string, number>>;
  readonly guardsPerCity: number;
  /** 처음 기술 단계(등급이 없으면 1) */
  readonly tech: number;
  readonly creditPm: number;
  readonly cityStepCells: number;
  readonly homeGapPm: number;
  readonly from: {
    readonly startCities: NationStartSource;
    readonly housing: NationStartSource;
    readonly populationPm: NationStartSource;
    readonly guardsPerCity: NationStartSource;
    readonly tech: NationStartSource;
    readonly facilities: Readonly<Record<string, NationStartSource>>;
  };
}

const int = (value: number): number => Math.trunc(value);
const has = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, int(value)));

/** 처음 인구(주거 × 천분율, 내림) — 서버 npc/cityPeople.ts seedPopulationOf와 같은 셈 */
export function tierPopulation(housing: number, populationPm: number): number {
  return Math.max(0, Math.floor((int(housing) * clamp(populationPm, 0, 1000)) / 1000));
}

/**
 * 국가 하나의 시작 값을 푼다(순수 함수). 칸마다 국가 칸 → 등급 표 → 설정 칸.
 * - 시작 도시 수: 등급이 있으면 1 ~ 설정 칸 위 끝(최대 8) 안의 값(국가 칸이 있으면 그 값). 등급이 없으면 옛 규칙(국가 칸을 설정 칸
 *   아래 끝~위 끝 안으로, 칸이 없으면 아래 끝).
 * - 경비대·기술·국고·도시 간격·국가 간격: 등급이 없으면 0·1·1000‰·설정 칸·1000‰(옛 세계와 같다).
 */
export function resolveNationStart(
  defaults: NationStartDefaults,
  tier: NationTierJson | undefined,
  overrides: NationStartOverrides | undefined,
): NationStart {
  const o = overrides ?? {};
  const limits = NATION_TIER_LIMITS;
  const low = Math.min(defaults.startCitiesMin, defaults.startCitiesMax);
  const high = Math.max(defaults.startCitiesMin, defaults.startCitiesMax);
  let startCities: number;
  let citiesFrom: NationStartSource;
  if (tier) {
    // 설정 칸 위 끝이 등급 값도 막는다(아래 끝은 막지 않는다 — 도시국가는 한 곳)
    startCities = clamp(
      has(o.startCities) ? o.startCities : tier.startCities,
      limits.startCities.min,
      Math.max(limits.startCities.min, Math.min(limits.startCities.max, int(high))),
    );
    citiesFrom = has(o.startCities) ? "nation" : "tier";
  } else if (has(o.startCities)) {
    startCities = clamp(o.startCities, low, high);
    citiesFrom = "nation";
  } else {
    startCities = int(low);
    citiesFrom = "default";
  }
  const pick = (
    nation: number | undefined,
    tierValue: number | undefined,
    fallback: number,
  ): [number, NationStartSource] =>
    has(nation)
      ? [int(nation), "nation"]
      : has(tierValue)
        ? [int(tierValue), "tier"]
        : [int(fallback), "default"];
  const [housing, housingFrom] = pick(o.startHousing, tier?.startHousing, defaults.housing);
  const [populationPm, populationFrom] = pick(
    o.startPopulationPm,
    tier?.startPopulationPm,
    defaults.populationPm,
  );
  const [guardsPerCity, guardsFrom] = pick(o.startGuards, tier?.guardsPerCity, 0);
  const [tech, techFrom] = pick(o.startTech, tier?.startTech, 1);
  const facilities: Record<string, number> = { ...defaults.facilities };
  const facilitiesFrom: Record<string, NationStartSource> = {};
  for (const id of Object.keys(facilities)) facilitiesFrom[id] = "default";
  for (const row of tier?.facilities ?? []) {
    facilities[row.facility] = int(row.count);
    facilitiesFrom[row.facility] = "tier";
  }
  const legacy: readonly (readonly [number | undefined, string])[] = [
    [o.startFarms, LEGACY_FACILITY_FIELDS.startFarms],
    [o.startLumberCamps, LEGACY_FACILITY_FIELDS.startLumberCamps],
    [o.startMines, LEGACY_FACILITY_FIELDS.startMines],
    [o.startStorehouses, LEGACY_FACILITY_FIELDS.startStorehouses],
  ];
  for (const [value, id] of legacy) {
    if (!has(value)) continue;
    facilities[id] = int(value);
    facilitiesFrom[id] = "nation";
  }
  return {
    tier: tier?.id ?? null,
    startCities,
    housing,
    populationPm,
    populationPerCity: tierPopulation(housing, populationPm),
    facilities,
    guardsPerCity: clamp(guardsPerCity, limits.guardsPerCity.min, limits.guardsPerCity.max),
    tech: clamp(tech, limits.startTech.min, limits.startTech.max),
    creditPm: tier ? clamp(tier.startCreditPm, limits.startCreditPm.min, limits.startCreditPm.max) : 1000,
    cityStepCells: tier
      ? clamp(tier.cityStepCells, limits.cityStepCells.min, limits.cityStepCells.max)
      : Math.max(1, int(defaults.cityStepCells)),
    homeGapPm: tier ? clamp(tier.homeGapPm, limits.homeGapPm.min, limits.homeGapPm.max) : 1000,
    from: {
      startCities: citiesFrom,
      housing: housingFrom,
      populationPm: populationFrom,
      guardsPerCity: guardsFrom,
      tech: techFrom,
      facilities: facilitiesFrom,
    },
  };
}

/** 국가 하나의 시작 합계(편집기 요약 막대 — 도시·인구·경비대) */
export interface NationStartTotals {
  readonly cities: number;
  readonly population: number;
  readonly guards: number;
}

export function nationStartTotals(start: NationStart): NationStartTotals {
  return {
    cities: start.startCities,
    population: start.startCities * start.populationPerCity,
    guards: start.startCities * start.guardsPerCity,
  };
}
