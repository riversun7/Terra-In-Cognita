// 채집·들어가기 조회(tRPC gather.*) — docs/adr/2026-11-07-gather-objects.md 6절. 응답 모양은 @terra/shared/gather. 읽기만 한다.
// - objects: 그 2차맵 오브젝트 자리·종류·남은 번수·다시 자라는 시각(로그인한 사용자, 띄운 2차맵).
// - loops: 내 유닛의 채집·들어가기(진행 중 + 최근 끝난 것).
// - building: 2차맵 건물 판(시설 이름·레벨·내 것인가·화물을 넣을 수 있나·직무를 받을 수 있나·안에 있는 유닛).
import {
  GATHER_OBJECT_STRIDE,
  type GatherBuildingResponse,
  type GatherInsideUnit,
  type GatherLoopsResponse,
  type GatherObjectsResponse,
} from "@terra/shared/gather";
import type { Viewer } from "../trpc/context.ts";
import { buildingPlace } from "../facilities/places.ts";
import { entryOptions } from "./enter.ts";
import type { GatherWorld } from "./world.ts";

export interface GatherReads {
  objects(viewer: Viewer, mapKey: number, nowMs: number): GatherObjectsResponse;
  loops(viewer: Viewer, nowMs: number): GatherLoopsResponse;
  building(viewer: Viewer, buildingId: number, nowMs: number): GatherBuildingResponse;
}

const emptyBuilding = (
  status: GatherBuildingResponse["status"],
  buildingId: number,
  nowMs: number,
): GatherBuildingResponse => ({
  status,
  buildingId,
  facilityId: null,
  name: null,
  stage: null,
  level: 0,
  mine: false,
  accepts: false,
  hires: false,
  inside: [],
  generatedAt: nowMs,
});

export function gatherReadsOf(source: () => GatherWorld | undefined): GatherReads {
  return {
    objects(_viewer, mapKey, nowMs) {
      const gather = source();
      const list = gather?.service.objects(mapKey);
      if (!gather || !list)
        return {
          status: gather ? "unknown_map" : "not_ready",
          mapKey,
          kinds: [],
          objects: [],
          generatedAt: nowMs,
        };
      const kinds = gather.kinds();
      const catalog = gather.places()?.catalog();
      const objects: number[] = [];
      for (const object of list) {
        const kind = kinds[object.kind];
        const state = gather.store.read(mapKey, object.id, kind?.uses ?? 1, nowMs);
        objects.push(object.id, object.kind, state.usesLeft, state.regrowAtMs);
      }
      return {
        status: "ok",
        mapKey,
        kinds: kinds.map((kind) => {
          const facility = kind.facility === null ? undefined : catalog?.facility(kind.facility);
          return {
            id: kind.id,
            name: kind.name,
            item: kind.item,
            itemName: catalog?.itemName(kind.item) ?? null,
            uses: kind.uses,
            lots: kind.lots,
            workMs: kind.workMs,
            regrowMs: kind.regrowMs,
            facility: kind.facility,
            facilityName: facility ? facility.name : null,
          };
        }),
        objects: objects.length % GATHER_OBJECT_STRIDE === 0 ? objects : [],
        generatedAt: nowMs,
      };
    },
    loops(viewer, nowMs) {
      const gather = source();
      if (!gather) return { status: "not_ready", loops: [], generatedAt: nowMs };
      return { status: "ok", loops: gather.service.loops(viewer.id), generatedAt: nowMs };
    },
    building(viewer, buildingId, nowMs) {
      const gather = source();
      const world = gather?.places();
      if (!gather || !world) return emptyBuilding("not_ready", buildingId, nowMs);
      const place = buildingPlace(world, buildingId);
      if (!place) return emptyBuilding("unknown_building", buildingId, nowMs);
      const ownerId = gather.ownerOf(viewer.id);
      const record = world.facilities.get(buildingId);
      const def = record ? world.catalog().facility(record.facilityId) : undefined;
      const ctx = gather.storage();
      const options =
        ctx && ownerId !== undefined
          ? entryOptions(ctx, gather.kinds(), ownerId, buildingId, (id) => gather.works(id))
          : undefined;
      const inside: GatherInsideUnit[] = [];
      for (const entry of gather.service.insideOf(buildingId))
        inside.push({ unitId: entry.unitId, own: entry.ownerId === ownerId, via: "inside" });
      const map = world.maps.get(place.mapKey);
      for (const worker of gather.workersAt(buildingId))
        if (!inside.some((entry) => entry.unitId === worker.unitId))
          inside.push({
            unitId: worker.unitId,
            own: map?.unitInfo(worker.unitId)?.ownerId === ownerId,
            via: "work",
          });
      return {
        status: "ok",
        buildingId,
        facilityId: record?.facilityId ?? null,
        name: def ? def.name : null,
        stage: def?.stage ?? null,
        level: record?.level ?? 0,
        mine: ownerId !== undefined && place.ownerId === ownerId,
        accepts: options?.deposit !== null && options !== undefined,
        hires: options?.workplace === true,
        inside: inside.toSorted((a, b) => a.unitId - b.unitId),
        generatedAt: nowMs,
      };
    },
  };
}
