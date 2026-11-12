// NPC 시작 도시 기본 시설(세계 씨앗) — docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗", 기획 90 §2.1(기본 NPC 국가·시작 도시 배치)·
// 46 §9.2(고정 국가 시작 도시), 건물 규칙은 docs/adr/2026-11-07-buildings-runtime.md.
// 켤 때 한 번(world.ts 부팅 복구, 2차맵에 건물·유닛을 다시 놓은 뒤·봇을 채우기 전): 띄운 2차맵의 시작 도시마다 기본 시설(행정 건물 하나 +
// 창고 + 채집 시설 — 수는 설정 칸 worldSeed [임시])을 도시 가운데 둘레 빈 칸에 다 지은 상태(레벨 1·상태 가득)로 세운다. 주인 = 그 도시
// 세력의 소유 주체. 맵 건물 칸 + world_facilities 줄(같은 쓰기 묶음).
// 채집 시설 종류는 둘레 땅을 따른다(기획 답 503 다, 60 §7.1 "주변 자원" — docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"): 시작 도시 고르기
// 판이 보이는 그 2차맵 칸의 행성 값으로 숲이 보이면 벌목장, 광석 고도 몫이 있으면(마른 땅 어디나 — 기획 D-533) 광산, 따뜻하고 비가 오면
// 농장(문턱은 설정 칸 [임시]). 농장·벌목장이 맞지 않으면 농장(식량 사슬 — 굶음 먼저, 532). 행성 값을 모르면(지형 서비스 없는 시험·개발) 셋 다(WP1 그대로). 레벨은 1.
// 1차 생산 여섯 가지(docs/adr/2026-11-11-production-six.md): 약초원·목장·낚시터도 같은 표(SEED_GATHER)에 있고 수 출발값은 0이다.
// 물가 조건(팩 needsWaterWithin, 질문 947 나 — 낚시터)이 있는 시설은 둘레에 물이 있는 자리만 고른다(플레이어 짓기와 같은 waterOk).
// 자리(docs/adr/2026-11-11-city-building-layout.md): 설정 칸 city_layout_mode = 1(출발값)이면 전략 배치(cityLayout.ts — 행정 건물 가운데,
// 숙소·창고는 채집소 묶음으로 가는 길 위, 채집소는 맡는 원자재가 많은 바깥 띠), 0이면 옛 배치(가운데 마당 밖 고리마다 처음 맞는 자리).
// 숙소(lodging, 생활 단계) 수(질문 1049 나, D-533): 주거 ÷ 숙소 Lv1 침대(설정 칸 lodging_beds_per_level) 올림, 설정 칸 npc_seed_lodgings가
// 위 끝 — 숙소는 일꾼의 회복 쉼터(npc/cityRest.ts)이자 주거다. 주거를 모르면 npc_seed_housing으로 센다.
// 마을(질문 1052 다, 기획 D-533 "추천대로" — docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)"): 시작 도시가 아닌 도시(NPC 새 마을·
// 가문 마을·되살린 폐허)는 행정 건물 하나(그 도시 자리에 누구 것이든 행정 건물이 이미 있으면 없음) + 숙소(설정 칸 npc_village_lodgings)를 같은
// 배치 함수로 세운다. 부팅 때 모자란 것을 채우고, 실행 중에 새 도시가 처음 저장될 때(npc/persist.ts onCityFounded) 그 도시 하나만 바로 세운다.
// 멱등: 도시마다 그 세력이 가진 같은 시설 줄(도시 ID 같음) 수를 세어 모자란 것만 더한다(있는 것은 그대로 — 관리자가 지운 시설은 다음 켤 때
// 다시 선다). 재료·작업·일꾼 없이 선다(세계를 차리는 일이라 원장을 거치지 않는다 — 확인 대기, docs/questions/2026-11-07-play-seed.md).
import { MATERIAL_BIT, cellMaterials, oreSharePm } from "@terra/shared/catchment";
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { type CityCell, cityOfCell } from "@terra/shared/goodsPlaces";
import { PLACEMENT_SIZE, START_LOGISTICS, type WorldSeedCoefficients } from "@terra/sim";
import type { GatherKind } from "../gather/kinds.ts";
import type { CityRow } from "../world/cities.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import { type LayoutExisting, type LayoutItem, planCityLayout } from "./cityLayout.ts";
import { cityWallRulesOf, seedCityWalls } from "./cityWalls.ts";
import { cityHall } from "./siegeLayout.ts";
import {
  cityLayoutRulesOf,
  cityLayoutSeed,
  layoutGroundOf,
  layoutItemOf,
  layoutObjectsOf,
  layoutRoleOf,
} from "./cityLayoutGround.ts";
import type { FacilityService } from "./service.ts";
import type { FacilityRecord } from "./state.ts";
import { waterOk } from "./water.ts";

/** 도시 가운데 빈 마당 반지름(칸): 이 네모 안에는 짓지 않는다(사이보그가 서고 휴먼이 모이는 곳) */
export const SEED_PLAZA_RADIUS = 5;
/** 자리를 찾는 반지름 상한(칸) */
export const SEED_SEARCH_RADIUS = 48;
/** 건물 둘레에 비워 두는 칸(길). 이웃 건물 사이가 이만큼 이상 빈다 */
export const SEED_MARGIN = 2;

/** 씨앗 시설 한 종류와 도시 하나의 수 */
export interface SeedItem {
  readonly facility: string;
  readonly count: number;
}

/** 시작 도시 둘레 땅: 그 2차맵 칸의 행성 값(시작 도시 고르기 판·1차맵 도시 판과 같은 값, worldMap/reads.ts) 가운데 씨앗이 보는 것 */
export interface SeedLand {
  readonly elevationM: number;
  readonly temperatureC: number;
  readonly precipitationMm: number;
  /** 숲 밀도 0 ~ 255(화면 "숲 N%" = ⌊밀도 × 100 ÷ 255⌉) */
  readonly forest: number;
  /** 물 비트(없으면 0 — 시작 도시 칸은 알맞은 땅이라 물이 없다) */
  readonly water?: number | undefined;
}

/**
 * 씨앗 채집 시설 여섯 가지(1차 생산, docs/adr/2026-11-11-production-six.md): 시설 ID · 수(설정 칸) · 둘레 땅 조건. 차례 = 짓는 차례(앞 것이
 * 가운데에 가깝다). 약초원 = 숲이 보이거나 농사지을 땅, 목장 = 농사지을 땅, 낚시터 = 조건 없음(씨앗이 보는 행성 값에 물이 없다 — 물가 판정은
 * 다음 일). 새 셋의 수 출발값은 0이다
 */
const SEED_GATHER: readonly {
  readonly facility: string;
  readonly count: (seed: WorldSeedCoefficients) => number;
  readonly fits: (land: LandFit) => boolean;
}[] = [
  { facility: "farm", count: (seed) => seed.farms, fits: (land) => land.farm },
  { facility: "lumber_camp", count: (seed) => seed.lumberCamps, fits: (land) => land.lumber },
  { facility: "mine", count: (seed) => seed.mines, fits: (land) => land.mine },
  { facility: "herb_field", count: (seed) => seed.herbFields, fits: (land) => land.lumber || land.farm },
  { facility: "ranch", count: (seed) => seed.ranches, fits: (land) => land.farm },
  { facility: "fishing_spot", count: (seed) => seed.fishingSpots, fits: () => true },
];

/** 둘레 땅이 맞는 것(농사지을 땅·숲·높은 땅) */
interface LandFit {
  readonly farm: boolean;
  readonly lumber: boolean;
  readonly mine: boolean;
}

/**
 * 둘레 땅에 맞는 채집 시설(기획 답 503 다). 원자재 판정은 배후지·밭 자리와 같은 함수(@terra/shared/catchment cellMaterials —
 * docs/adr/2026-11-11-city-catchment.md). 광산은 광석 고도 몫이 있으면(마른 땅 어디나 — 기획 D-533 "석재·구리는 어디서나 조금", 낮은 땅
 * 광산은 배후지 몫만큼 느리다). 농장도 벌목장도 맞지 않으면 농장 하나(식량 사슬 — 광산만 있는 도시는 굶는다)
 */
export function landGather(land: SeedLand, seed: WorldSeedCoefficients): LandFit {
  const value = { ...land, water: land.water ?? 0 };
  const bits = cellMaterials(value, seed);
  const lumber = (bits & MATERIAL_BIT.wood) !== 0;
  const mine = oreSharePm(value, seed) > 0;
  const farm = (bits & MATERIAL_BIT.crop) !== 0;
  if (!farm && !lumber) return { farm: true, lumber: false, mine };
  return { farm, lumber, mine };
}

/**
 * 시작 도시 하나의 기본 시설 차례(앞 것이 가운데에 가깝다). 행정 건물(government_hall)은 도시 하나에 하나(D-510 행정 건물, 수 칸 없음),
 * 나머지 수는 설정 칸. 채집 시설은 둘레 땅에 맞는 것만(land가 없으면 셋 다). 시설 ID는 팩 content/core/facilities.json
 */
/**
 * 시작 도시 숙소 수(질문 1049 나): ⌈주거 ÷ Lv1 침대⌉, 위 끝 = 설정 칸 npc_seed_lodgings. 주거를 모르면 새 시작 도시 주거(설정 칸
 * npc_seed_housing), 침대 수를 모르면 출발값(lodging_beds_per_level)으로 센다
 */
export function seedLodgings(seed: WorldSeedCoefficients, housing?: number, bedsPerLevel?: number): number {
  const cap = Math.max(0, Math.trunc(seed.lodgings));
  const beds = Math.max(1, Math.trunc(bedsPerLevel ?? START_LOGISTICS.lodgingBedsPerLevel));
  const homes = Math.max(0, Math.trunc(housing ?? seed.startHousing));
  return Math.min(cap, Math.ceil(homes / beds));
}

export function seedPlan(
  seed: WorldSeedCoefficients,
  land?: SeedLand,
  rest?: { readonly housing?: number | undefined; readonly bedsPerLevel?: number | undefined },
): SeedItem[] {
  const fit = land ? landGather(land, seed) : { farm: true, lumber: true, mine: true };
  return [
    { facility: "government_hall", count: 1 },
    { facility: "storehouse", count: seed.storehouses },
    { facility: "lodging", count: seedLodgings(seed, rest?.housing, rest?.bedsPerLevel) },
    ...SEED_GATHER.map((kind) => ({ facility: kind.facility, count: kind.fits(fit) ? kind.count(seed) : 0 })),
  ];
}

/** 마을(시작 도시가 아닌 도시)의 건물 차례: 행정 건물 하나 + 숙소(설정 칸). 마을 건물 수·값은 기획 몫이라 이것만 둔다(질문 1052) */
export function villagePlan(seed: WorldSeedCoefficients): SeedItem[] {
  return [
    { facility: "government_hall", count: 1 },
    { facility: "lodging", count: Math.max(0, Math.trunc(seed.villageLodgings)) },
  ];
}

/** 전략 배치를 쓰나(설정 칸 city_layout_mode — 칸이 없는 옛 계수표는 옛 배치) */
export function strategicLayout(seed: WorldSeedCoefficients): boolean {
  return Math.trunc(seed.cityLayoutMode) === 1;
}

/** 가운데 칸 둘레 고리 r(체비셰프 거리 r)의 칸들: 위 → 오른쪽 → 아래 → 왼쪽(r = 0이면 가운데 하나) */
export function* ringCells(cx: number, cy: number, r: number): Generator<{ x: number; y: number }> {
  if (r === 0) {
    yield { x: cx, y: cy };
    return;
  }
  for (let x = cx - r; x <= cx + r; x++) yield { x, y: cy - r };
  for (let y = cy - r + 1; y <= cy + r; y++) yield { x: cx + r, y };
  for (let x = cx + r - 1; x >= cx - r; x--) yield { x, y: cy + r };
  for (let y = cy + r - 1; y > cy - r; y--) yield { x: cx - r, y };
}

/** 두 닫힌 구간 [a0, a1]·[b0, b1]이 겹치나 */
const spans = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;
/** 한 축에서 건물(둘레 길 포함)이 마당 구간에 걸치나 */
const nearPlaza = (from: number, size: number, center: number) =>
  spans(
    from - SEED_MARGIN,
    from + size - 1 + SEED_MARGIN,
    center - SEED_PLAZA_RADIUS,
    center + SEED_PLAZA_RADIUS,
  );

export interface NpcSeedInput {
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 부팅 때 읽은 도시(시작 도시만 씨앗을 받는다) */
  readonly cities: readonly CityRow[];
  readonly planetId: string;
  /** 세력 행 ID → 그 세력의 소유 주체 ID(없으면 그 도시는 건너뛴다) */
  readonly ownerOfFaction: (factionId: number) => number | undefined;
  readonly service: Pick<FacilityService, "facilities" | "seedBuilt">;
  readonly catalog: FacilityCatalog;
  readonly seed: WorldSeedCoefficients;
  /**
   * 세력 행 ID → 그 국가의 씨앗 값(국가 프리셋 성격 칸을 얹은 것 — npc/nations.ts nationSeedOf, docs/adr/2026-11-10-nation-editor.md 2절).
   * 없거나 undefined면 seed(모든 국가 같은 설정 칸 값)
   */
  readonly seedOfFaction?: ((factionId: number) => WorldSeedCoefficients | undefined) | undefined;
  /** 2차맵 키 → 둘레 땅(행성 값). 없거나 undefined면 채집 시설 셋 다 */
  readonly landOf?: ((mapKey: number) => SeedLand | undefined) | undefined;
  /** 원자재 오브젝트 종류(팩 gather_objects). 전략 배치의 채집소 자리가 본다. 없으면 방향만 흩는다 */
  readonly gatherKinds?: readonly GatherKind[] | undefined;
  /** 숙소 Lv1 침대 수(설정 칸 lodging_beds_per_level, 질문 1049 나). 없으면 숙소 수 = npc_seed_lodgings 그대로 */
  readonly bedsPerLevel?: number | undefined;
  readonly nowMs: number;
  /** 이 도시만 세운다(실행 중에 선 새 마을). 없으면 띄운 2차맵의 모든 도시 */
  readonly only?: ReadonlySet<number> | undefined;
}

export interface NpcSeedResult {
  /** 이번에 세운 시설 수 */
  readonly placed: number;
  /** 자리를 못 찾았거나 팩에 없어 못 세운 수 */
  readonly missing: number;
}

/** 띄운 2차맵의 시작 도시마다 모자란 기본 시설을 세운다(위 머리 주석) */
export function seedNpcFacilities(input: NpcSeedInput): NpcSeedResult {
  const { maps, catalog, service } = input;
  const anchorsOf = (mapKey: number): CityCell[] =>
    input.cities
      .filter((city) => city.planetId === input.planetId && city.mapKey === mapKey)
      .map((city) => ({ id: city.id, mapKey, x: city.cellX, y: city.cellY }));
  let placed = 0;
  let missing = 0;
  const targets = input.cities
    .filter(
      (city) =>
        city.planetId === input.planetId &&
        maps.has(city.mapKey) &&
        (input.only === undefined || input.only.has(city.id)),
    )
    .toSorted((a, b) => a.id - b.id);
  for (const city of targets) {
    const map = maps.get(city.mapKey);
    const ownerId = input.ownerOfFaction(city.factionId);
    if (!map || ownerId === undefined) continue;
    const factionSeed = input.seedOfFaction?.(city.factionId) ?? input.seed;
    const plan = city.start
      ? seedPlan(factionSeed, input.landOf?.(city.mapKey), { housing: city.housing, bedsPerLevel: input.bedsPerLevel })
      : villagePlan(factionSeed);
    const anchors = anchorsOf(city.mapKey);
    const have = new Map<string, number>();
    for (const record of service.facilities.values())
      if (record.cityId === city.id && map.buildingOwner(record.buildingId) === ownerId)
        have.set(record.facilityId, (have.get(record.facilityId) ?? 0) + 1);
    // 마을: 그 도시 자리에 누구 것이든 행정 건물이 있으면 더 세우지 않는다(되살린 폐허는 복원한 쪽이 지은 정부가 있다 — 489 다)
    if (!city.start && (have.get("government_hall") ?? 0) === 0 && hasGovernment(map, service, anchors, city))
      have.set("government_hall", 1);

    const citySeed = input.seedOfFaction?.(city.factionId) ?? input.seed;
    const items = plan.flatMap((item) => {
      const need = Math.max(0, item.count - (have.get(item.facility) ?? 0));
      return Array.from({ length: need }, () => item.facility);
    });
    if (items.length === 0) continue;
    const save = (
      facility: string,
      spot: { x: number; y: number; width: number; height: number },
    ): boolean => {
      const def = catalog.facility(facility);
      const result = def ? map.placeBuilding({ ...spot, rotation: 0 }, ownerId) : undefined;
      if (!def || !result?.ok || result.buildingId === undefined) return false;
      const record: FacilityRecord = {
        buildingId: result.buildingId,
        facilityId: def.id,
        level: 1,
        conditionPpm: CONDITION_FULL,
        conditionAtMs: input.nowMs,
        builtAtMs: input.nowMs,
        builtBy: null,
        cityId: city.id,
      };
      service.seedBuilt(record);
      return true;
    };
    if (strategicLayout(citySeed)) {
      const kinds = input.gatherKinds ?? [];
      const layoutItems: LayoutItem[] = [];
      for (const facility of items) {
        const item = layoutItemOf(catalog, facility, kinds);
        if (item) layoutItems.push(item);
        else missing += 1;
      }
      const placements = new Map<number, { x: number; y: number; width: number; height: number }>();
      map.forEachBuilding((building) => placements.set(building.id, building.placement));
      const existing: LayoutExisting[] = [];
      for (const record of service.facilities.values()) {
        const at = placements.get(record.buildingId);
        if (record.cityId !== city.id || !at || map.buildingOwner(record.buildingId) !== ownerId) continue;
        const role = layoutRoleOf(catalog.facility(record.facilityId)?.stage);
        existing.push({
          facility: record.facilityId,
          role,
          x: at.x,
          y: at.y,
          width: at.width,
          height: at.height,
        });
      }
      const ground = layoutGroundOf({
        map,
        catalog,
        anchors,
        cityId: city.id,
        objects: layoutObjectsOf(map, kinds, input.landOf?.(city.mapKey), citySeed),
      });
      const layout = planCityLayout({
        center: { x: city.cellX, y: city.cellY },
        items: layoutItems,
        existing,
        ground,
        rules: cityLayoutRulesOf(citySeed),
        seed: cityLayoutSeed(city.mapKey, city.id),
        size: PLACEMENT_SIZE,
      });
      missing += layout.missing.length;
      for (const building of layout.placed) {
        if (save(building.facility, building)) placed += 1;
        else missing += 1;
      }
      continue;
    }

    /**
     * 옛 배치: 그 크기 건물을 놓을 첫 자리(가까운 고리부터): 마당 밖, 둘레 길까지 놓을 수 있고, 건물 가운데가 이 도시 자리. fits가 있으면 그 자리도
     * 채워야 한다(물가 조건 — 플레이어 짓기와 같은 waterOk, 질문 947 나)
     */
    const spotFor = (
      width: number,
      height: number,
      fits?: (x: number, y: number) => boolean,
    ): { x: number; y: number } | undefined => {
      for (let r = SEED_PLAZA_RADIUS + 1; r <= SEED_SEARCH_RADIUS; r++) {
        for (const cell of ringCells(city.cellX, city.cellY, r)) {
          const x = cell.x - (width >> 1);
          const y = cell.y - (height >> 1);
          if (nearPlaza(x, width, city.cellX) && nearPlaza(y, height, city.cellY)) continue;
          if (cityOfCell(anchors, city.mapKey, cell.x, cell.y)?.id !== city.id) continue;
          const margin = {
            x: x - SEED_MARGIN,
            y: y - SEED_MARGIN,
            width: width + 2 * SEED_MARGIN,
            height: height + 2 * SEED_MARGIN,
            rotation: 0,
          } as const;
          if (map.canPlace(margin) && (!fits || fits(x, y))) return { x, y };
        }
      }
      return undefined;
    };

    for (const facility of items) {
      const def = catalog.facility(facility);
      if (!def?.footprint) {
        missing += 1;
        continue;
      }
      const { width, height } = def.footprint;
      const spot = spotFor(width, height, (x, y) => waterOk(map, def, x, y, 0));
      if (spot && save(facility, { ...spot, width, height })) placed += 1;
      else missing += 1;
    }
  }
  // 성벽 고리(질문 1048 가, cityWalls.ts): 행정 건물이 선 뒤, 그 도시에 성벽이 하나도 없을 때만
  for (const city of targets.filter((target) => target.start)) {
    const map = maps.get(city.mapKey);
    const ownerId = input.ownerOfFaction(city.factionId);
    const hall =
      map &&
      cityHall(map, { records: service.facilities, catalog }, city.id, { x: city.cellX, y: city.cellY });
    if (!map || ownerId === undefined || !hall) continue;
    const rules = cityWallRulesOf(input.seedOfFaction?.(city.factionId) ?? input.seed);
    placed += seedCityWalls({
      map,
      cityId: city.id,
      ownerId,
      hall: hall.rect,
      rules,
      catalog,
      service,
      nowMs: input.nowMs,
    });
  }
  return { placed, missing };
}

/** 그 도시 자리(가장 가까운 도시)에 행정 건물이 있나(주인 상관없음) */
function hasGovernment(
  map: SecondMap,
  service: Pick<FacilityService, "facilities">,
  anchors: readonly CityCell[],
  city: CityRow,
): boolean {
  const placements = new Map<number, { x: number; y: number; width: number; height: number }>();
  map.forEachBuilding((building) => placements.set(building.id, building.placement));
  for (const record of service.facilities.values()) {
    if (record.facilityId !== "government_hall") continue;
    if (record.cityId === city.id && placements.has(record.buildingId)) return true;
    const at = placements.get(record.buildingId);
    if (!at) continue;
    const cx = at.x + (at.width >> 1);
    const cy = at.y + (at.height >> 1);
    if (cityOfCell(anchors, city.mapKey, cx, cy)?.id === city.id) return true;
  }
  return false;
}

/**
 * 부팅 복구 때 한 번(world.ts): 소유 주체 표로 세력 → 주체를 찾고 씨앗을 세운다. 설정 칸은 부를 때의 실효 값(rules).
 * 동기로 끝난다: 2차맵을 다시 놓은 뒤 경로 서비스를 켜기(paths.start) 전에 기다리면 다시 놓은 봇의 예약이 먼저 돌아 아직 모르는 2차맵에
 * 경로를 묻는다. 건물 칸·시설 줄은 쓰기 대기열의 같은 묶음으로 커밋된다
 */
export function seedNpcFacilitiesAtBoot(options: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly cities: readonly CityRow[];
  readonly planetId: string;
  readonly owners: ReadonlyMap<number, { readonly id: number; readonly factionId: number | null }>;
  readonly facilities: {
    readonly service: NpcSeedInput["service"];
    readonly catalog: () => FacilityCatalog;
    /** 원자재 오브젝트 종류(전략 배치의 채집소 자리). 없으면 방향만 흩는다 */
    readonly gatherKinds?: (() => readonly GatherKind[]) | undefined;
  };
  readonly rules: () => {
    readonly worldSeed: WorldSeedCoefficients;
    readonly logistics?: { readonly lodgingBedsPerLevel: number } | undefined;
  };
  /** 세력 행 ID → 그 국가의 씨앗 값(없으면 설정 칸 값) */
  readonly seedOfFaction?: NpcSeedInput["seedOfFaction"];
  /** 2차맵 지형 서비스(cellValues = 2차맵 칸의 행성 값). 없으면 채집 시설 셋 다 */
  readonly terrain?: { cellValues?(mapKey: number): SeedLand | undefined } | undefined;
  readonly log: { info(obj: object, message: string): void };
  readonly nowMs: number;
  /** 이 도시만(실행 중에 선 새 마을 — npc/persist.ts onCityFounded). 없으면 모든 도시 */
  readonly only?: ReadonlySet<number> | undefined;
}): NpcSeedResult {
  const result = seedNpcFacilities({
    maps: options.maps,
    cities: options.cities,
    planetId: options.planetId,
    ownerOfFaction: (factionId) => {
      for (const owner of options.owners.values()) if (owner.factionId === factionId) return owner.id;
      return undefined;
    },
    service: options.facilities.service,
    catalog: options.facilities.catalog(),
    seed: options.rules().worldSeed,
    seedOfFaction: options.seedOfFaction,
    landOf: (mapKey) => options.terrain?.cellValues?.(mapKey),
    gatherKinds: options.facilities.gatherKinds?.(),
    bedsPerLevel: options.rules().logistics?.lodgingBedsPerLevel,
    nowMs: options.nowMs,
    only: options.only,
  });
  if (result.placed > 0 || result.missing > 0)
    options.log.info(
      { ...result, only: options.only ? [...options.only] : undefined },
      options.only ? "npc village: seeded facilities" : "world boot: seeded npc city facilities",
    );
  return result;
}

/** 실행 중에 선 새 마을 하나를 세우는 함수(npc/persist.ts onCityFounded — world.ts가 부팅 씨앗과 같은 입력으로 잇는다) */
export function villageSeeder(
  base: Omit<Parameters<typeof seedNpcFacilitiesAtBoot>[0], "cities" | "only" | "nowMs"> & {
    readonly now: () => number;
  },
): (city: CityRow, cities: readonly CityRow[]) => void {
  return (city, cities) => {
    seedNpcFacilitiesAtBoot({ ...base, cities, only: new Set([city.id]), nowMs: base.now() });
  };
}
