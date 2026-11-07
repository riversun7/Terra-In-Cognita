// 건물 화면 자료의 월드 쪽(app.ts → tRPC 맥락) — docs/adr/2026-11-07-buildings-runtime.md
// 세계가 준비되고 DB가 있을 때만 자료를 준다(아니면 화면은 not_ready).
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { nearestFactionCity } from "@terra/shared/territory";
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import type { FacilityScreenSource } from "./screen.ts";
import { attackTargetsOf, ownerFactionsOf } from "./targets.ts";

export function facilityScreenSourceOf(world: World): FacilityScreenSource | undefined {
  const persistence = world.persistence;
  if (world.status().state !== "ready" || !persistence) return undefined;
  const { facilities, settlement, ledger, holdings, territory, labor, owners, pool } = persistence;
  return {
    view: {
      service: facilities.service,
      maps: world.maps,
      ledger,
      holdings,
      territory: () => territory,
      rules: facilities.rules,
      catalog: facilities.catalog,
      unitBusy: (unitId) => labor.unitBusy(unitId),
    },
    ownerOf: (userId) => settlement.findOwnerOfUser(userId),
    async beaconsOf(userId) {
      const view = await territory.mineView(TEST_PLANET_ID, userId);
      // 재료를 꺼내는 도시(질문 410 ①): 그 세력에서 비콘 칸과 가장 가까운 도시(서버 판정과 같은 함수)
      const cities = (view?.cities ?? []).map((city) => ({
        id: city.id,
        faction: city.factionId,
        point: city.point,
      }));
      return (view?.beacons ?? []).map((beacon) => ({
        id: beacon.id,
        planetId: TEST_PLANET_ID,
        cellKey: beacon.cellKey,
        supplyCityId: nearestFactionCity(cities, beacon.factionId, beacon.point),
      }));
    },
    async targetsOf(userId, nowMs) {
      const ownerId = settlement.findOwnerOfUser(userId);
      if (ownerId === undefined) return [];
      // 모든 세력 비콘과 내 세력(시야로 거르지 않는다 — 2차맵에 내 유닛이 있는 칸만 남는다)
      const planet = await territory.planetView(TEST_PLANET_ID, userId);
      const buildingOwners: number[] = [];
      for (const map of world.maps.values())
        map.forEachBuilding((building) => {
          if (building.ownerId !== null) buildingOwners.push(building.ownerId);
        });
      const listed = attackTargetsOf(
        {
          maps: world.maps,
          service: facilities.service,
          catalog: facilities.catalog,
          rules: facilities.rules,
          unitBusy: (unitId) => labor.unitBusy(unitId),
        },
        {
          ownerId,
          myFaction: planet?.myFactionId ?? null,
          ownerFactions: await ownerFactionsOf(pool, owners, buildingOwners),
          beacons: (planet?.beacons ?? []).map((beacon) => ({
            id: beacon.id,
            factionId: beacon.factionId,
            planetId: TEST_PLANET_ID,
            cellKey: beacon.cellKey,
            conditionPpm: beacon.conditionPpm ?? CONDITION_FULL,
          })),
          nowMs,
        },
      );
      // 도시 시가지(안전지대, D-146) 안은 공성 시간에만 칠 수 있어 뺀다(공격 명령도 safe_zone)
      const open = [];
      for (const target of listed) {
        const urban = await territory.urbanCity(
          TEST_PLANET_ID,
          target.x === null || target.y === null
            ? { cellKey: target.mapKey }
            : { mapKey: target.mapKey, x: target.x, y: target.y },
        );
        if (urban === null) open.push(target);
      }
      return open;
    },
  };
}
