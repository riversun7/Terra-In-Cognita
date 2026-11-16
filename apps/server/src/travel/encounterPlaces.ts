// 조우 뒤 돌아갈 곳을 세계에서 고르기 — 질문 2033 답(encounter-4), encounterHome.ts(가까움 셈)의 후보를 세계 상태에서 모은다.
// - 창고: 띄운 2차맵의 그 주체 창고 시설(단계 storage, 레벨 1 이상, 일함, 상태가 기능 문턱 이상, 자리가 남음 — gather/deposit.ts nearestStore와 같은
//   조건이고 도시는 빼고 시설만).
// - 거점: 그 주체 나라의 도시(NPC 런타임 도시 주인 = 나라, 폐허 빼고) + 플레이어 사이보그의 시작 도시. 자리는 NPC 런타임 도시 자리(places).
import { conditionWorks } from "@terra/shared/facilityRuntime";
import type { FacilityRuntimeRules } from "@terra/shared/facilityRuntime";
import type { Ledger } from "../economy/ledger.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import { roomGrams } from "../facilities/storage.ts";
import type { Spot } from "./afterEncounter.ts";
import { type HomeCandidate, nearestHome } from "./encounterHome.ts";

export interface HomeSources {
  /** 건물 서비스의 자리 세계(없으면 창고 없음) */
  readonly places: () => PlaceWorld | undefined;
  readonly works: (buildingId: number) => boolean;
  readonly ledger: Ledger;
  readonly catalog: () => FacilityCatalog | undefined;
  readonly runtime: () => FacilityRuntimeRules | undefined;
  /** 그 주체의 나라(없으면 undefined) */
  readonly nationOf: (ownerId: number) => number | undefined;
  /** 그 주체가 플레이어면 사이보그 시작 도시 ID */
  readonly startCityOf: (ownerId: number) => number | undefined;
  /** 도시 ID → 주인 세력·자리(NPC 런타임). 폐허는 빼고 준다 */
  readonly cities: () => Iterable<{ readonly id: number; readonly owner: number; readonly spot: Spot }>;
}

/** 가장 가까운 내 창고 시설 */
export function nearestWarehouse(
  sources: HomeSources,
  ownerId: number,
  from: Spot,
): (Spot & { readonly buildingId: number }) | undefined {
  const world = sources.places();
  const catalog = sources.catalog();
  const runtime = sources.runtime();
  if (!world || !catalog || !runtime) return undefined;
  const ctx = { world, ledger: sources.ledger, catalog, rules: runtime };
  const candidates: (HomeCandidate & { buildingId: number })[] = [];
  for (const map of world.maps.values())
    map.forEachBuilding((building) => {
      if (building.ownerId !== ownerId) return;
      const record = world.facilities.get(building.id);
      const def = record ? catalog.facility(record.facilityId) : undefined;
      if (!record || def?.stage !== "storage" || record.level < 1 || !sources.works(building.id)) return;
      if (!conditionWorks(record.conditionPpm, runtime)) return;
      const room = roomGrams(ctx, building.id);
      if (room !== undefined && room <= 0n) return;
      candidates.push({
        id: building.id,
        buildingId: building.id,
        mapKey: map.mapKey,
        x: building.x,
        y: building.y,
      });
    });
  const best = nearestHome(candidates, from);
  return best ? { buildingId: best.buildingId, mapKey: best.mapKey, x: best.x, y: best.y } : undefined;
}

/** 가장 가까운 거점(내 나라 도시·시작 도시) */
export function nearestBase(sources: HomeSources, ownerId: number, from: Spot): Spot | undefined {
  const nation = sources.nationOf(ownerId);
  const start = sources.startCityOf(ownerId);
  const candidates: HomeCandidate[] = [];
  for (const city of sources.cities())
    if ((nation !== undefined && city.owner === nation) || city.id === start)
      candidates.push({ id: city.id, ...city.spot });
  const best = nearestHome(candidates, from);
  return best ? { mapKey: best.mapKey, x: best.x, y: best.y } : undefined;
}
