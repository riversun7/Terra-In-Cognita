// 월드 → NPC 도시 경제 입력 — docs/adr/2026-11-07-play-flow.md WP4. world.ts가 NPC 사회 런타임을 켤 때 한 줄로 넘긴다.
// 도시 시설 = 건물 서비스의 시설 줄 가운데 그 도시에 선 것(다 지었고 일하는 상태 — 상태 30% 미만·짓는 중은 빼기, 건물 서비스 works),
// 주인 = 2차맵 건물 주인. 국가 프리셋(나라 성격: 도시 직무·처음 창고, 기획 답 531 다·533 다)도 함께 넘긴다.
import type { CatchmentLand } from "@terra/shared/catchment";
import { haulMs } from "@terra/sim";
import { assetWeightG } from "../facilities/places.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { type RestLodging, planCityRest } from "../npc/cityRest.ts";
import type { CityFacility, NpcEconomyInput } from "../npc/economy.ts";
import { workAreaOf } from "../npc/humanPlaces.ts";
import type { TripArea } from "../world/bots.ts";
import type { NationPreset } from "../npc/nations.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { ServerEconomyCatalog } from "./catalog.ts";
import { buildingCenterOf, createExchangeDirectory } from "./exchangeBuildings.ts";
import { exchangeFeeOf, fxFeeOf } from "./fxFee.ts";

export function npcEconomyInputOf(
  catalog: (() => ServerEconomyCatalog) | undefined,
  facilities: WorldFacilities,
  maps: ReadonlyMap<number, SecondMap>,
  presets?: readonly NationPreset[],
  /** 1차맵 칸 행성 값(배후지 채집 다툼, docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)"). 없으면 옛 경제 */
  land?: (mapKey: number) => CatchmentLand | undefined,
): NpcEconomyInput | undefined {
  if (!catalog) return undefined;
  const ownerOf = (buildingId: number): number | null => {
    for (const map of maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return null;
  };
  const places = cityRestPlacesOf(facilities, maps);
  const exchanges = createExchangeDirectory({
    records: () => facilities.service.facilities.values(),
    catalog: facilities.catalog,
    works: (buildingId) => facilities.service.works(buildingId),
  });
  return {
    catalog,
    presets,
    land,
    // 사업장 장부(D-548): 남의 숙소 요금 → 그 숙소 금고
    business: facilities.business,
    // 유저 거래소 물건 자리 = 그 도시 물자 거래소 건물 창고(기획 D-561·D-564 1628, exchangeStock.ts)
    exchangeOf: (cityId) => exchanges.cityExchange(cityId, "goods"),
    // NPC 운반 시간(질문 1945 답 — D-564 1626): 도시 칸 ↔ 거래소 건물 가운데(체비셰프 칸), 유저 반입과 같은 셈(운반꾼 하나)
    exchangeHaulMs(cityId, buildingId, grams) {
      const city = facilities.service.places.cities().find((entry) => entry.id === cityId);
      const center = buildingCenterOf(maps, buildingId);
      if (!city || !center) return 0;
      const cells = Math.max(Math.abs(center.x - city.x), Math.abs(center.y - city.y));
      return haulMs(grams, cells, 1, facilities.rules());
    },
    weightOf: (asset) => assetWeightG(facilities.catalog(), asset),
    // 보이는 NPC 거래소 운반꾼이 내려놓는 곳(기획 대조 2088)
    exchangeCenter: (buildingId) => buildingCenterOf(maps, buildingId),
    // 환전 이용료(질문 2086 — fxFee.ts): 일하는 외환 거래소와 그 주인이 정한 요율(없으면 적정 요율)
    fxExchanges: () => exchanges.citiesWith("fx"),
    fxFeeBp: (buildingId) =>
      fxFeeOf((id, item) => facilities.business.price(id, item), facilities.rules().business, buildingId)
        .charged,
    // 물자 거래소 이용료(D-574 질문 2085): 그 건물 주인이 정한 요율(없으면 적정 요율, 한도 안)
    exchangeFeeBp: (buildingId) =>
      exchangeFeeOf(
        (id, item) => facilities.business.price(id, item),
        facilities.rules().business,
        buildingId,
      ).charged,
    // NPC 증축(질문 1101 나): 건물 서비스로 짓고 전략 배치로 자리를 고른다
    build: {
      service: facilities.service,
      catalog: facilities.catalog,
      maps,
      gatherKinds: facilities.gatherKinds,
      landOf: land,
    },
    facilitiesIn(cityId) {
      const out: CityFacility[] = [];
      for (const record of facilities.service.facilities.values()) {
        if (record.cityId !== cityId || record.level < 1 || !facilities.service.works(record.buildingId))
          continue;
        out.push({
          buildingId: record.buildingId,
          facility: record.facilityId,
          level: record.level,
          ownerId: ownerOf(record.buildingId),
          // 면적 모듈(건물 채집소, 기획 D-569 1768 — NPC도 붙인다)
          ...(record.plots ? { plots: record.plots } : {}),
        });
      }
      return out;
    },
    // 일꾼 쉼터·채집소 옮김(질문 1047 다·1050 가): 그 도시 2차맵의 건물 자리로 npc/cityRest.ts planCityRest
    cityRest(cityId, city, list, rules) {
      const found = places(cityId, city.ownerId);
      if (!found) return undefined;
      return planCityRest({ facilities: list, housing: city.housing, rules, ...found });
    },
    lodgingsIn(cityId) {
      const facilityCatalog = facilities.catalog();
      const out: number[] = [];
      for (const record of facilities.service.facilities.values())
        if (
          record.cityId === cityId &&
          record.level >= 1 &&
          facilityCatalog.facility(record.facilityId)?.stage === "living"
        )
          out.push(record.buildingId);
      return out.toSorted((a, b) => a - b);
    },
  };
}

/** 도시 하나의 쉼터·옮김 자리(npc/cityRest.ts 입력 몫): 건물 일터 네모, 숙소(다 지은·일하는 생활 단계), 도시 주인의 창고, 시청 칸 */
export interface CityRestPlaces {
  readonly areas: ReadonlyMap<number, TripArea>;
  readonly lodgings: readonly RestLodging[];
  readonly stores: readonly { readonly x: number; readonly y: number }[];
  readonly home: { readonly x: number; readonly y: number };
}

/**
 * 그 도시 2차맵의 건물 자리로 쉼터·옮김 자리를 모은다(NPC 도시 경제 planCityRest와 플레이어 일꾼 쉼터 labor/workerRest.ts planPlayerRest가 같이
 * 쓴다 — 질문 1047 다·1088 가). storeOwner = 창고로 칠 건물 주인(도시 주인)
 */
export function cityRestPlacesOf(
  facilities: WorldFacilities,
  maps: ReadonlyMap<number, SecondMap>,
): (cityId: number, storeOwner: number | null) => CityRestPlaces | undefined {
  return (cityId, storeOwner) => {
    const places = facilities.service.places;
    const cell = places.cities().find((entry) => entry.id === cityId);
    const map = cell ? maps.get(cell.mapKey) : undefined;
    if (!cell || !map) return undefined;
    const areas = new Map<number, TripArea>();
    const owners = new Map<number, number | null>();
    map.forEachBuilding((building) => {
      areas.set(building.id, workAreaOf(building.placement));
      owners.set(building.id, building.ownerId);
    });
    const facilityCatalog = facilities.catalog();
    const lodgings: RestLodging[] = [];
    const stores: { x: number; y: number }[] = [];
    for (const record of facilities.service.facilities.values()) {
      if (record.cityId !== cityId || record.level < 1 || !facilities.service.works(record.buildingId))
        continue;
      const area = areas.get(record.buildingId);
      if (!area) continue;
      const stage = facilityCatalog.facility(record.facilityId)?.stage;
      if (stage === "living")
        lodgings.push({
          id: record.buildingId,
          area,
          level: record.level,
          ownerId: owners.get(record.buildingId) ?? null,
          ...(record.seeded === true ? { seeded: true } : {}),
        });
      else if (stage === "storage" && owners.get(record.buildingId) === storeOwner)
        stores.push({ x: area.x, y: area.y });
    }
    return { areas, lodgings, stores, home: { x: cell.x, y: cell.y } };
  };
}
