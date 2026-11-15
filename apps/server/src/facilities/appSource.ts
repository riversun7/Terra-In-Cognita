// 건물 화면 자료의 월드 쪽(app.ts → tRPC 맥락) — docs/adr/2026-11-07-buildings-runtime.md
// 세계가 준비되고 DB가 있을 때만 자료를 준다(아니면 화면은 not_ready).
import { CONDITION_FULL } from "@terra/shared/facilityRuntime";
import { nearestFactionCity } from "@terra/shared/territory";
import { nationLookupOf } from "../world/nationVision.ts";
import { canObserve } from "../world/visibility.ts";
import { TEST_PLANET_ID, type World } from "../world/world.ts";
import { mapBuildingLooks, mapOwnerIds } from "./mapLooks.ts";
import type { FacilityScreenSource } from "./screen.ts";
import { readBuildingOwner, readBusinessBooks } from "../business/books.ts";
import { type OwnerNames, createOwnerNames } from "../business/names.ts";
import type { QueryPool } from "../world/persist/load.ts";
import { buildingPlace } from "./places.ts";
import { attackTargetsOf, ownerFactionsOf } from "./targets.ts";

/** 주인 이름 기억(DB 연결마다 하나 — 조회마다 새로 만들지 않는다) */
const namesByPool = new WeakMap<QueryPool, OwnerNames>();

export function facilityScreenSourceOf(world: World): FacilityScreenSource | undefined {
  const persistence = world.persistence;
  if (world.status().state !== "ready" || !persistence) return undefined;
  const { facilities, settlement, ledger, holdings, territory, labor, owners, pool } = persistence;
  let names = namesByPool.get(pool);
  if (!names) {
    names = createOwnerNames({
      pool,
      factionName: (code) => territory.factionNameOf?.(code),
      now: () => Date.now(),
    });
    namesByPool.set(pool, names);
  }
  const isNpc = (ownerId: number): boolean => {
    const row = owners.get(ownerId);
    return row !== undefined && row.userId === null && row.factionId !== null;
  };
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
      workersOf: (buildingId) => labor.workersAt(buildingId),
      // 채집소 반경 고리(건축 모드 — docs/adr/2026-11-15-building-screen.md): 원자재 오브젝트를 맡는 시설
      objectFacilities: () =>
        new Set(facilities.gatherKinds().flatMap((kind) => (kind.facility === null ? [] : [kind.facility]))),
      // 숙소를 쓰는 NPC 일꾼(도시 경제 쉼터 계획, 질문 1047 다)
      lodgingOccupants: (buildingId, cityId) => {
        if (cityId === null) return undefined;
        const plan = world.npc?.economy?.restPlan(cityId);
        return plan ? (plan.occupancy.get(buildingId) ?? 0) : undefined;
      },
    },
    ownerOf: (userId) => settlement.findOwnerOfUser(userId),
    map: (mapKey) => world.maps.get(mapKey),
    // 사업장 장부(D-555 1513 — 누구나 본다)
    books: (userId, buildingId, days, nowMs) =>
      readBusinessBooks(
        {
          pool,
          ledger,
          core: facilities.business,
          commands: facilities.businessCommands,
          catalog: facilities.catalog,
          durable: () => persistence.writer.durable(),
          place: (id) => buildingPlace(facilities.service.places, id),
          facilityOf: (id) => facilities.service.facilities.get(id)?.facilityId,
          isNpc,
          shares: facilities.shares,
          names,
        },
        settlement.findOwnerOfUser(userId),
        buildingId,
        days,
        nowMs,
      ),
    // 건물 판 머리 이름표(주인·대주주 이름 — docs/adr/2026-11-15-building-screen.md)
    owner: (userId, buildingId) =>
      readBuildingOwner(
        {
          core: facilities.business,
          names,
          place: (id) => buildingPlace(facilities.service.places, id),
          isBusiness: (id) => facilities.service.facilities.has(id),
          isNpc,
        },
        settlement.findOwnerOfUser(userId),
        buildingId,
      ),
    land: facilities.land,
    async mapLooks(viewer, mapKey, nowMs) {
      // 보는 건물만(시야 전송과 같은 규칙): 전체 보기, 내 건물, 아는 시야 칸
      const observer = canObserve(viewer);
      const ownerId = settlement.findOwnerOfUser(viewer.id);
      const sighted = observer
        ? undefined
        : await world.maps
            .get(mapKey)
            ?.vision.sighted({ userId: viewer.id, ownerId, nations: nationLookupOf(world) });
      // 건물 주인 → 국가(NPC 세력 주체는 메모리, 플레이어는 가입한 국가를 DB에서 한 번에)
      const factions = await ownerFactionsOf(pool, owners, mapOwnerIds(world.maps, mapKey));
      return mapBuildingLooks(
        {
          maps: world.maps,
          service: facilities.service,
          rules: facilities.rules,
          facilityName: (id) => facilities.catalog().facility(id)?.name,
          facilityArt: (id) => facilities.catalog().facility(id)?.look,
          facilityCategory: (id) => facilities.catalog().facility(id)?.category,
        },
        mapKey,
        nowMs,
        { observer, ownerId, sighted },
        factions,
      );
    },
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
