// NPC 도시 경제의 배후지 채집 다툼 — docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)", 질문 1024(추천 나·다를 넣음).
// 사용자 지적(2026-11-11, 원문) "도시는 주변 영역에서 자원을 채집하여 유지해야하는데 인구와 도시등급이 높을 수록 높은자원과 기술을 요구하여
// 요구 영토범위가 넓어지고, 인근 도시와 인접영토를 경쟁하면 두 도시 모두 자원고갈 문제라고."
// - 하루 끝(경제 endOfDay)마다 도시마다: 반경 = 요구 반경(인구 = 그 도시 유닛 수, 등급 = 발전도 → 도시 등급, 기술 = 주인 세력 기술,
//   @terra/shared/catchment), 원자재마다 캐려는 양 = 요구 넓이 × 칸이 버티는 양 × drawPm × (그 원자재 채집 시설 일꾼 ÷ 가장 많은 원자재 일꾼).
//   채집 시설이 하나도 없는 도시는 캐지 않는다(받은 몫 1000).
// - 칸 재고는 도시끼리 함께 쓴다(stepCatchmentSupply): 배후지가 겹친 칸은 둘이 캐서 버티는 양을 넘고 재고가 바닥나 두 도시 모두 덜 받는다.
// - 받은 몫(원자재마다 ‰)이 다음 하루 그 원자재 채집 시설의 빠르기다(걸리는 시간 × 1000 ÷ max(바닥, 몫), economy.ts nextBatch).
//   모든 원자재를 합한 몫이 SimCity.supplyPm — NPC 구인 규칙식이 이 값이 문턱(catchmentGrowthMinPm) 아래면 인구를 늘리지 않는다(성장 멈춤).
// - 칸 자리(geometry)는 부르는 쪽이 준다: 시뮬은 시나리오 catchment 칸의 평면 배치(planeGeometry), 서버는 행성 1차맵 칸·원자재 비트.
// - 바뀜 (2026-11-12, 기획 D-533 — 질문 1020·1064 "석재·구리는 어디서나 조금(고도에 따른 몫), 높은 티어 광석은 산지"): 칸 몫이 0·1000이 아니다
//   (광석 = 고도 몫). 도시마다 땅 몫(원자재마다 배후지 칸 몫 평균 ‰)을 셈해 캐려는 양 = 위 양 × 땅 몫 ÷ 1000(땅이 내는 만큼 캔다 — 가난한
//   땅만으로는 받은 몫이 떨어지지 않는다. 받은 몫은 다툼·고갈만 본다). 채집 시설 빠르기 = 받은 몫 × 땅 몫 ÷ 1000(바닥 위 — 낮은 땅 광산은
//   느리다). 광산이 산지 밖 가장 높은 티어(lowOreTierMax) 위를 뽑으면 배후지 광석 가운데 산지 몫(highOrePm)만큼만 그 티어로 나온다(oreTierCap).
// 정수 셈만 쓰고 난수가 없다(도시 ID·칸 키 차례) — 같은 시드면 같은 결과다.
import {
  CATCHMENT_MATERIALS,
  type CatchmentGrowthRules,
  type CatchmentLand,
  type OreShareRules,
  type CatchmentMaterial,
  type CatchmentSupplyRules,
  type SupplyCity,
  type SupplyStock,
  catchmentAreaMilli,
  catchmentRadiusMilli,
  materialDemand,
  materialOfFacility,
  oreSharePm,
  stepCatchmentSupply,
} from "@terra/shared/catchment";
import { type TerritoryCoefficients, cityGrade } from "@terra/shared/territory";
import {
  type WorldSeedCoefficients,
  catchmentGrowthOf,
  catchmentSupplyOf,
  plannedCityRadiusMilli,
} from "../society/worldSeed.ts";
import type { Scenario } from "./scenario.ts";
import type { SimWorld } from "./world.ts";

/** 배후지 칸 자리(시뮬 평면·서버 행성) */
export interface CatchmentGeometry {
  /** 그 도시 배후지 칸 키(반경 1000분율 칸). 자리를 모르는 도시는 빈 목록 */
  cellsOf(cityId: number, radiusMilli: number): readonly number[];
  /** 칸의 원자재 몫(‰, 0이면 없음) */
  capacityPm(cell: number, material: CatchmentMaterial): number;
  /** 칸 광석 가운데 높은 티어가 나오는 몫(‰ — 산지 칸 1000). 없으면 모든 칸 1000(티어를 막지 않는다) */
  highOrePm?(cell: number): number;
}

/** 배후지 셈에 쓰는 설정 칸 값(부를 때마다 읽는다 — 서버는 설정 칸을 바꾸면 다음 하루부터) */
export interface CatchmentSettings {
  readonly growth: CatchmentGrowthRules;
  readonly supply: CatchmentSupplyRules;
  readonly territory: Pick<TerritoryCoefficients, "gradeAtDevelopment">;
  /** 구인에 필요한 받은 몫(‰) */
  readonly growthMinPm: number;
  /** 채집 시설 빠르기 바닥(‰) */
  readonly yieldFloorPm: number;
  /** 산지 밖 광석의 가장 높은 티어(설정 칸 ore_low_tier_max) */
  readonly lowOreTierMax: number;
}

/** 도시 하나의 지금 배후지 */
export interface CityCatchment {
  readonly radiusMilli: number;
  readonly areaMilli: number;
  readonly cells: number;
  readonly sharedCells: number;
  /** 원자재마다 받은 몫(‰) */
  readonly supplyPm: Readonly<Record<CatchmentMaterial, number>>;
  /** 모든 원자재를 합한 받은 몫(‰) */
  readonly totalPm: number;
  /** 캐려는 양 합(하루) */
  readonly demand: number;
  /** 원자재마다 땅 몫(‰ — 배후지 칸 몫 평균) */
  readonly landPm: Readonly<Record<CatchmentMaterial, number>>;
  /** 배후지 광석 가운데 산지 몫(‰, 광석이 없으면 0) */
  readonly highOrePm: number;
}

export interface CatchmentState {
  readonly geometry: CatchmentGeometry;
  readonly settings: () => CatchmentSettings;
  readonly stock: SupplyStock;
  /** 도시 → 지난 하루 끝 배후지(아직 하루 끝 전이면 없다 = 다 받음) */
  readonly cities: Map<number, CityCatchment>;
  /** 하루 끝을 센 수 */
  days: number;
}

export function createCatchmentState(
  geometry: CatchmentGeometry,
  settings: () => CatchmentSettings,
): CatchmentState {
  return { geometry, settings, stock: new Map(), cities: new Map(), days: 0 };
}

/**
 * 시설 한 번의 빠르기 배율(‰): 그 시설 원자재의 지난 하루 받은 몫 × 땅 몫 ÷ 1000(바닥 위). 배후지가 없거나 채집 시설이 아니면 1000
 */
export function facilitySupplyPm(
  state: CatchmentState | undefined,
  cityId: number,
  facility: string,
): number {
  if (!state) return 1000;
  const material = materialOfFacility(facility);
  const city = state.cities.get(cityId);
  if (!material || !city) return 1000;
  const floor = Math.min(1000, Math.max(1, Math.trunc(state.settings().yieldFloorPm)));
  const supply = Math.min(1000, city.supplyPm[material]);
  return Math.max(floor, Math.floor((supply * Math.min(1000, city.landPm[material])) / 1000));
}

/** 광산 티어 막기: 산지 밖 가장 높은 티어와, 그 위 티어를 그대로 두는 몫(‰) */
export interface OreTierCap {
  readonly maxTier: number;
  readonly keepAbovePm: number;
}

/**
 * 광석 채집 시설(광산)의 티어 막기(모듈 머리 주석 "바뀜 (2026-11-12)"). 배후지가 없거나 광석 시설이 아니거나 아직 하루 끝 전이면 undefined
 * (막지 않는다). 산지 몫이 1000이면 막지 않는다
 */
export function oreTierCap(
  state: CatchmentState | undefined,
  cityId: number,
  facility: string,
): OreTierCap | undefined {
  if (!state || materialOfFacility(facility) !== "ore") return undefined;
  const city = state.cities.get(cityId);
  if (!city || city.highOrePm >= 1000) return undefined;
  return {
    maxTier: Math.max(0, Math.trunc(state.settings().lowOreTierMax)),
    keepAbovePm: Math.max(0, city.highOrePm),
  };
}

/** 경제 자료 가운데 배후지 하루가 읽는 것(Economy의 일부 — 순환 import를 피한다) */
export interface CatchmentEconomyView {
  readonly cityUnits: ReadonlyMap<number, number>;
  readonly facilities: ReadonlyMap<
    number,
    { readonly city: number; readonly workers: number; readonly recipe: { readonly facility: string } }
  >;
}

/**
 * 하루 끝 배후지 다툼(모듈 머리 주석). 도시마다 반경·캐려는 양을 셈하고 칸 재고를 함께 캔 뒤, 받은 몫을 state.cities와 SimCity.supplyPm에 둔다
 */
export function stepCatchment(state: CatchmentState, economy: CatchmentEconomyView, world: SimWorld): void {
  const s = state.settings();
  // 도시 → 원자재 → 그 원자재 채집 시설 일꾼 수
  const workersOf = new Map<number, Partial<Record<CatchmentMaterial, number>>>();
  for (const facility of economy.facilities.values()) {
    const material = materialOfFacility(facility.recipe.facility);
    if (!material || facility.workers <= 0) continue;
    const bag = workersOf.get(facility.city) ?? {};
    bag[material] = (bag[material] ?? 0) + facility.workers;
    workersOf.set(facility.city, bag);
  }
  const plans: {
    city: number;
    radiusMilli: number;
    areaMilli: number;
    supply: SupplyCity;
    demand: number;
    landPm: Record<CatchmentMaterial, number>;
    highOrePm: number;
  }[] = [];
  for (const city of [...world.cities.values()].toSorted((a, b) => a.id - b.id)) {
    const size = {
      population: economy.cityUnits.get(city.id) ?? 0,
      grade: cityGrade(city.development, s.territory),
      tech: world.factions.get(city.owner)?.tech ?? 0,
    };
    const radiusMilli = catchmentRadiusMilli(size, s.growth);
    const cells = state.geometry.cellsOf(city.id, radiusMilli);
    // 캐려는 넓이 = max(요구 넓이, 배후지 칸 수): 칸 격자가 원보다 칸을 더 담아도 칸마다 캐려는 양은 drawPm 아래로 줄지 않고, 위 끝에 걸려
    // 요구 넓이보다 칸이 적으면 칸마다 더 캔다(너무 큰 도시는 제 땅을 고갈시킨다)
    const areaMilli = Math.max(catchmentAreaMilli(size, s.growth), new Set(cells).size * 1000);
    const workers = workersOf.get(city.id) ?? {};
    const maxWorkers = Math.max(0, ...CATCHMENT_MATERIALS.map((material) => workers[material] ?? 0));
    const land = landShares(state.geometry, cells);
    const demand: Partial<Record<CatchmentMaterial, number>> = {};
    let sum = 0;
    for (const material of CATCHMENT_MATERIALS) {
      // 땅이 내는 만큼 캔다(땅 몫 — 모두 1000이면 옛 셈과 같다)
      const want = Math.floor(
        (materialDemand(areaMilli, workers[material] ?? 0, maxWorkers, s.supply) * land.landPm[material]) /
          1000,
      );
      if (want <= 0) continue;
      demand[material] = want;
      sum += want;
    }
    plans.push({
      city: city.id,
      radiusMilli,
      areaMilli,
      supply: { id: city.id, cells, demand },
      demand: sum,
      landPm: land.landPm,
      highOrePm: land.highOrePm,
    });
  }
  const results = stepCatchmentSupply(
    plans.map((plan) => plan.supply),
    state.stock,
    (cell, material) => state.geometry.capacityPm(cell, material),
    s.supply,
  );
  state.cities.clear();
  for (const plan of plans) {
    const result = results.get(plan.city);
    const city = world.cities.get(plan.city);
    if (!result || !city) continue;
    state.cities.set(plan.city, {
      radiusMilli: plan.radiusMilli,
      areaMilli: plan.areaMilli,
      cells: new Set(plan.supply.cells).size,
      sharedCells: result.sharedCells,
      supplyPm: result.supplyPm,
      totalPm: result.totalPm,
      demand: plan.demand,
      landPm: plan.landPm,
      highOrePm: plan.highOrePm,
    });
    city.supplyPm = result.totalPm;
  }
  state.days += 1;
}

/**
 * 배후지 칸들의 땅 몫: 원자재마다 칸 몫 평균(‰, 같은 칸은 한 번), 광석 가운데 산지 몫(‰ = Σ 광석 몫 × 산지 몫 ÷ Σ 광석 몫). 칸이 없으면 모두 0
 */
export function landShares(
  geometry: CatchmentGeometry,
  cells: readonly number[],
): { landPm: Record<CatchmentMaterial, number>; highOrePm: number } {
  const unique = [...new Set(cells)];
  const landPm = { ore: 0, wood: 0, herb: 0, crop: 0, livestock: 0, fish: 0 };
  if (unique.length === 0) return { landPm, highOrePm: 0 };
  let oreSum = 0;
  let highSum = 0;
  for (const material of CATCHMENT_MATERIALS) {
    let sum = 0;
    for (const cell of unique) {
      const cap = Math.min(1000, Math.max(0, Math.trunc(geometry.capacityPm(cell, material))));
      sum += cap;
      if (material === "ore" && cap > 0) {
        oreSum += cap;
        const high = geometry.highOrePm ? geometry.highOrePm(cell) : 1000;
        highSum += cap * Math.min(1000, Math.max(0, Math.trunc(high)));
      }
    }
    landPm[material] = Math.floor(sum / unique.length);
  }
  return { landPm, highOrePm: oreSum === 0 ? 0 : Math.floor(highSum / oreSum) };
}

/** 하루 줄·요약에 쓰는 배후지 모양(도시 ID 차례): 도시마다 [ID, 반경, 받은 몫, 겹친 칸] + 겹친 도시 수·성장 멈춘 도시 수 */
export function catchmentLine(state: CatchmentState): Record<string, unknown> {
  const s = state.settings();
  const rows: number[][] = [];
  let overlapped = 0;
  let stalled = 0;
  let supplySum = 0;
  for (const [id, city] of [...state.cities].toSorted((a, b) => a[0] - b[0])) {
    rows.push([id, city.radiusMilli, city.totalPm, city.sharedCells]);
    if (city.sharedCells > 0) overlapped += 1;
    if (city.totalPm < s.growthMinPm) stalled += 1;
    supplySum += city.totalPm;
  }
  return {
    cities: rows,
    overlapped,
    stalled,
    supplyAvgPm: rows.length === 0 ? 1000 : Math.floor(supplySum / rows.length),
  };
}

/** 시나리오 평면 배치(시뮬 — 행성 없음): 도시 → 칸 자리. 키 = (x + 2^19) × 2^20 + (y + 2^19) */
export interface PlaneLayout {
  /** 도시 → 칸 자리(1차맵 칸 단위 정수) */
  readonly at: ReadonlyMap<number, { readonly x: number; readonly y: number }>;
  /** 원자재마다 칸 몫(‰, 모든 칸 같음). 없으면 1000 */
  readonly richnessPm?: Readonly<Partial<Record<CatchmentMaterial, number>>> | undefined;
  /**
   * 칸 x 자리 → 땅 고도(m). 있고 값이 있으면 광석 몫 = richnessPm.ore × 고도 몫(oreSharePm) ÷ 1000, 산지 몫 = 산지 고도 이상이면 1000.
   * 없으면 고도를 보지 않는다
   */
  readonly elevationAt?: ((x: number) => number | undefined) | undefined;
  /** 고도 몫 규칙(elevationAt이 있을 때) */
  readonly oreRules?: OreShareRules | undefined;
}

const PLANE_HALF = 1 << 19;
const PLANE_ROW = 1 << 20;

/** 평면 칸 키 */
export function planeCell(x: number, y: number): number {
  return (x + PLANE_HALF) * PLANE_ROW + (y + PLANE_HALF);
}

/**
 * 평면 배치 칸 자리: 도시 칸 둘레 (dx² + dy²) × 1000² ≤ 반경²인 칸. 자리를 모르는 도시(실행 중 세운 마을 등)는 그 도시 ID로 정한 먼 칸
 * 하나에 둔다([임시] 다른 도시와 다투지 않는다 — 마을 자리 규칙이 시뮬에 없다)
 */
export function planeGeometry(layout: PlaneLayout): CatchmentGeometry {
  return {
    cellsOf(cityId, radiusMilli) {
      const at = layout.at.get(cityId) ?? { x: 200_000 + cityId * 64, y: 200_000 };
      const radius = Math.max(0, Math.trunc(radiusMilli));
      const reach = Math.floor(radius / 1000);
      const out: number[] = [];
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++)
          if ((dx * dx + dy * dy) * 1_000_000 <= radius * radius) out.push(planeCell(at.x + dx, at.y + dy));
      return out;
    },
    capacityPm(cell, material) {
      const rich = Math.min(1000, Math.max(0, Math.trunc(layout.richnessPm?.[material] ?? 1000)));
      const elevationM = material === "ore" ? planeElevation(layout, cell) : undefined;
      if (elevationM === undefined || !layout.oreRules) return rich;
      return Math.floor((rich * oreSharePm(planeLand(elevationM), layout.oreRules)) / 1000);
    },
    highOrePm(cell) {
      const elevationM = planeElevation(layout, cell);
      if (elevationM === undefined || !layout.oreRules) return 1000;
      return elevationM >= layout.oreRules.mineMinHeightM ? 1000 : 0;
    },
  };
}

/** 평면 칸 키의 x 자리 */
function planeX(cell: number): number {
  return Math.floor(cell / PLANE_ROW) - PLANE_HALF;
}

/** 평면 칸의 땅 고도(모르면 undefined) */
function planeElevation(layout: PlaneLayout, cell: number): number | undefined {
  return layout.elevationAt?.(planeX(cell));
}

/** 고도만 있는 평면 땅(광석 고도 몫 셈 — 물·숲·기후는 보지 않는다) */
function planeLand(elevationM: number): CatchmentLand {
  return { forest: 0, elevationM, temperatureC: 0, precipitationMm: 0, water: 0 };
}

/**
 * 시나리오 → 평면 배치(ScenarioCatchment 머리 주석): 세력 차례 k의 처음 자리 (k × groupGap, 0), 그 세력 도시(ID 차례) j는 (x, j × 묶음 칸).
 * 묶음 칸이 없으면 ⌈처음 기간 요구 반경 × 2⌉(그 묶음 주거·기술, 지방 도시 — 가장자리가 닿는다)
 */
export function scenarioPlaneLayout(
  world: SimWorld,
  scenario: Scenario,
  seed: WorldSeedCoefficients,
): PlaneLayout | undefined {
  const config = scenario.catchment;
  if (!config) return undefined;
  const at = new Map<number, { x: number; y: number }>();
  // 세력 차례 → 땅 고도(묶음 칸 catchmentElevationM, 없으면 시나리오 elevationM)
  const elevations: (number | undefined)[] = [];
  let index = 0;
  for (const faction of world.factions.values()) {
    const group = scenario.factions.find(
      (entry) => faction.code === entry.code || faction.code.startsWith(`${entry.code}_`),
    );
    const step =
      group?.catchmentStep ??
      Math.ceil(
        (2 *
          plannedCityRadiusMilli(seed, {
            housing: group?.housing ?? 0,
            tech: group?.tech ?? 1,
            capital: false,
          })) /
          1000,
      );
    const x = index * config.groupGap;
    [...faction.cities].toSorted((a, b) => a - b).forEach((cityId, j) => at.set(cityId, { x, y: j * step }));
    elevations.push(group?.catchmentElevationM ?? config.elevationM);
    index += 1;
  }
  const hasElevation = elevations.some((value) => value !== undefined);
  return {
    at,
    richnessPm: config.richnessPm,
    ...(hasElevation
      ? {
          // 칸 x에서 가장 가까운 세력 처음 자리의 고도(먼 칸 — 실행 중 세운 마을 — 은 시나리오 고도)
          elevationAt: (x: number) => {
            const k = Math.floor((x + Math.floor(config.groupGap / 2)) / config.groupGap);
            return k >= 0 && k < elevations.length ? elevations[k] : config.elevationM;
          },
          oreRules: seed,
        }
      : {}),
  };
}

/** 세계 씨앗 설정 칸·영토 계수 → 배후지 셈 설정 */
export function catchmentSettingsOf(
  seed: WorldSeedCoefficients,
  territory: Pick<TerritoryCoefficients, "gradeAtDevelopment">,
): CatchmentSettings {
  return {
    growth: catchmentGrowthOf(seed),
    supply: catchmentSupplyOf(seed),
    territory,
    growthMinPm: seed.catchmentGrowthMinPm,
    yieldFloorPm: seed.catchmentYieldFloorPm,
    lowOreTierMax: seed.oreLowTierMax,
  };
}
