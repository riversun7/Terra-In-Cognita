// 시뮬레이터 도시의 공성 전투맵 입력 — 질문 1068 가(기획 D-534 "기술 추천"): 시뮬레이터 도시도 서버 NPC 시작 도시처럼 전략 배치(cityLayout.ts) +
// 성벽 고리(cityWalls.ts)를 평지에 세워 같은 공성 전투맵(combat/siegeArena.ts)으로 싸운다. ADR combat-core "서버와 시뮬이 같은 판정".
// 서버와 다른 것(시뮬 도시에는 2차맵·행성 값이 없다):
// - 땅 = 평지 256² 배치 칸, 도시 칸 = 가운데(128, 128), 원자재 오브젝트 없음(채집소는 방향만 흩는다), 물 없음(낚시터는 세우지 않는다).
// - 건물 차례 = 서버 씨앗(apps/server/src/facilities/npcSeed.ts seedPlan)의 땅 모름(채집 시설 모두) 차례: 시작 도시는 행정 건물 + 창고 + 숙소
//   (⌈주거 ÷ Lv1 침대⌉, 설정 칸 npc_seed_lodgings까지) + 채집 시설(설정 칸 수) + 성벽 고리(설정 칸 city_wall_mode), 마을은 행정 건물 + 숙소
//   (설정 칸 npc_village_lodgings). 이웃 도시 건물은 없다(도시 하나만).
// - 내구도 = 팩 시설 내구도 × 레벨(@terra/shared/facilityRuntime maxDurabilityAt, 상태 가득). 행정 건물 레벨 = 도시 행정 레벨, 나머지 1.
// - 시설 발자국·내구도는 실행 도구가 팩에서 읽어 준다(SiegeCityKit). 없으면 TEST_SIEGE_KIT(팩 core 값을 옮겨 둔 것).
// 같은 입력이면 같은 결과(정수 격자·시드 난수·det 함수).
import {
  CONDITION_FULL,
  type FacilityRuntimeRules,
  durabilityPoints,
  maxDurabilityAt,
} from "@terra/shared/facilityRuntime";
import type { SiegeLayout, SiegeLayoutBuilding, SiegeRect } from "../combat/siegeArena.ts";
import { createPlacementGrid } from "../grid/placementGrid.ts";
import { applyPlacement, footprintRect, validatePlacement } from "../placement/placement.ts";
import type { WorldSeedCoefficients } from "../society/worldSeed.ts";
import { PLACEMENT_SIZE } from "../units.ts";
import { type LayoutGround, type LayoutItem, type LayoutRect, planCityLayout } from "./cityLayout.ts";
import { CITY_WALL_FACILITY, cityGates, cityWallRulesOf, planCityWalls } from "./cityWalls.ts";
import { cityLayoutRulesOf, layoutRoleOf, strategicLayout } from "./layoutRules.ts";

/** 공성 전투맵이 읽는 시설 하나(팩 facilities: 단계·발자국·내구도) */
export interface SiegeFacilityDef {
  readonly id: string;
  readonly stage: string;
  readonly width: number;
  readonly height: number;
  readonly durability: number;
}

/** 시뮬 도시 배치에 쓰는 시설 목록 */
export interface SiegeCityKit {
  readonly facilities: readonly SiegeFacilityDef[];
}

/** 팩 core 값(2026-11-12 content/core/facilities.json core@75)을 옮겨 둔 시험 목록 — 실행 도구는 팩에서 다시 읽는다(siegeKitFrom) */
export const TEST_SIEGE_KIT: SiegeCityKit = {
  facilities: [
    { id: "government_hall", stage: "government", width: 3, height: 3, durability: 500 },
    { id: "storehouse", stage: "storage", width: 3, height: 3, durability: 400 },
    { id: "lodging", stage: "living", width: 3, height: 2, durability: 200 },
    { id: "farm", stage: "gather", width: 4, height: 4, durability: 150 },
    { id: "lumber_camp", stage: "gather", width: 3, height: 3, durability: 200 },
    { id: "mine", stage: "gather", width: 3, height: 3, durability: 300 },
    { id: "herb_field", stage: "gather", width: 3, height: 3, durability: 100 },
    { id: "ranch", stage: "gather", width: 4, height: 4, durability: 150 },
    { id: CITY_WALL_FACILITY, stage: "defense", width: 4, height: 1, durability: 20_000 },
  ],
};

/** 레벨 1 최대 내구도가 팩에 없을 때(서버 facilities/catalog.ts와 같은 옛 기본 100) */
const DEFAULT_FACILITY_DURABILITY = 100;

/** 팩 시설 줄 → 목록(발자국이 없는 시설은 뺀다) */
export function siegeKitFrom(
  facilities: readonly {
    readonly id: string;
    readonly stage: string;
    readonly durability?: number | undefined;
    readonly footprint?: { readonly width: number; readonly height: number } | undefined;
  }[],
): SiegeCityKit {
  const out: SiegeFacilityDef[] = [];
  for (const facility of facilities)
    if (facility.footprint)
      out.push({
        id: facility.id,
        stage: facility.stage,
        width: facility.footprint.width,
        height: facility.footprint.height,
        durability: facility.durability ?? DEFAULT_FACILITY_DURABILITY,
      });
  return { facilities: out };
}

export interface SimCitySiegeInput {
  readonly cityId: number;
  /** 기본 NPC 국가의 시작 도시(성벽 고리·채집 시설은 시작 도시만 — 서버 씨앗과 같다) */
  readonly start: boolean;
  readonly housing: number;
  /** 행정 건물 레벨(1~5) */
  readonly adminLevel: number;
  readonly seed: WorldSeedCoefficients;
  readonly kit: SiegeCityKit;
  readonly runtime: FacilityRuntimeRules;
  /** 숙소 Lv1 침대 수(설정 칸 lodging_beds_per_level) */
  readonly bedsPerLevel: number;
  /** 도시 배치 시드(같은 도시는 늘 같은 모양) */
  readonly layoutSeed: number;
}

/** 시뮬 도시 칸(평지 배치 칸 가운데) */
export const SIM_CITY_CELL = { x: PLACEMENT_SIZE >> 1, y: PLACEMENT_SIZE >> 1 } as const;

/** 0 이상 정수 수 */
const count = (value: number) => Math.max(0, Math.trunc(value));

/** 시뮬 도시의 건물 차례(위 머리 주석 — 서버 seedPlan·villagePlan의 땅 모름 차례) */
export function simCityFacilities(
  input: Pick<SimCitySiegeInput, "start" | "housing" | "seed" | "bedsPerLevel">,
): string[] {
  const { seed } = input;
  if (!input.start)
    return ["government_hall", ...Array.from({ length: count(seed.villageLodgings) }, () => "lodging")];
  const lodgings = Math.min(
    count(seed.lodgings),
    Math.ceil(count(input.housing) / Math.max(1, Math.trunc(input.bedsPerLevel))),
  );
  const plan: [string, number][] = [
    ["government_hall", 1],
    ["storehouse", count(seed.storehouses)],
    ["lodging", lodgings],
    ["farm", count(seed.farms)],
    ["lumber_camp", count(seed.lumberCamps)],
    ["mine", count(seed.mines)],
    ["herb_field", count(seed.herbFields)],
    ["ranch", count(seed.ranches)],
  ];
  return plan.flatMap(([facility, n]) => Array.from({ length: n }, () => facility));
}

/** 평지 땅: 배치 격자(지형 비용 모두 기본), 오브젝트 없음, 모든 칸이 이 도시 자리 */
function flatGround(): LayoutGround & { readonly grid: ReturnType<typeof createPlacementGrid> } {
  const grid = createPlacementGrid();
  let nextId = 0;
  return {
    grid,
    objects: [],
    canPlace: (rect) => validatePlacement(grid, { ...rect, rotation: 0 }).ok,
    place: (rect) => {
      nextId += 1;
      applyPlacement(grid, nextId, { ...rect, rotation: 0 });
    },
    owns: () => true,
  };
}

/**
 * 시뮬 도시 공성 입력: 전략 배치(설정 칸 city_layout_mode = 1)일 때 평지 위 배치 + 성벽 고리 + 공성 성문. 옛 배치(0)거나 행정 건물을 못 세우면
 * undefined → 부르는 쪽이 옛 열린 맵을 쓴다
 */
export function simCitySiegeLayout(input: SimCitySiegeInput): SiegeLayout | undefined {
  if (!strategicLayout(input.seed)) return undefined;
  const defs = new Map(input.kit.facilities.map((def) => [def.id, def]));
  const items: LayoutItem[] = [];
  for (const facility of simCityFacilities(input)) {
    const def = defs.get(facility);
    if (def) items.push({ facility, role: layoutRoleOf(def.stage), width: def.width, height: def.height });
  }
  const ground = flatGround();
  const plan = planCityLayout({
    center: SIM_CITY_CELL,
    items,
    existing: [],
    ground,
    rules: cityLayoutRulesOf(input.seed),
    seed: input.layoutSeed,
    size: PLACEMENT_SIZE,
  });
  const points = (def: SiegeFacilityDef, level: number) =>
    durabilityPoints(CONDITION_FULL, maxDurabilityAt(def.durability, Math.max(1, level), input.runtime));
  const buildings: SiegeLayoutBuilding[] = [];
  let hall: { readonly id: number; readonly rect: SiegeRect } | undefined;
  for (const building of plan.placed) {
    const def = defs.get(building.facility);
    if (!def) continue;
    const id = buildings.length + 1;
    const rect = { x: building.x, y: building.y, width: building.width, height: building.height };
    const level = building.role === "core" ? input.adminLevel : 1;
    buildings.push({ sourceId: id, ...rect, durability: points(def, level) });
    if (building.role === "core" && !hall) hall = { id, rect };
  }
  if (!hall) return undefined;
  const layout: SiegeLayout = {
    mapCells: PLACEMENT_SIZE,
    nexus: hall.rect,
    nexusSourceId: hall.id,
    buildings,
    terrain: null,
  };
  // 성벽 고리(시작 도시만, 서버 씨앗 seedCityWalls와 같다)
  const wall = defs.get(CITY_WALL_FACILITY);
  const rules = cityWallRulesOf(input.seed);
  if (!input.start || !wall || !rules.enabled) return layout;
  const placements = planCityWalls(
    hall.rect,
    rules,
    Math.max(wall.width, wall.height),
    (placement) => validatePlacement(ground.grid, placement).ok,
  );
  const walls: (SiegeLayoutBuilding & { readonly wall: true })[] = [];
  for (const placement of placements) {
    ground.place(footprintRect(placement));
    const id = buildings.length + walls.length + 1;
    walls.push({ sourceId: id, ...footprintRect(placement), durability: points(wall, 1), wall: true });
  }
  if (walls.length === 0) return layout;
  const all = [...buildings, ...walls];
  const taken = new Set<number>();
  for (const building of all)
    for (let y = building.y; y < building.y + building.height; y++)
      for (let x = building.x; x < building.x + building.width; x++) taken.add(y * PLACEMENT_SIZE + x);
  const gates = cityGates(hall.rect, walls, (x, y) => taken.has(y * PLACEMENT_SIZE + x));
  return { ...layout, buildings: all, gates };
}

/** 배치 네모(계획 결과) — 시험용 */
export type SimCityRect = LayoutRect;
