// 채집·들어가기 조회(tRPC gather.*) — docs/adr/2026-11-07-gather-objects.md 6절. 응답 모양은 @terra/shared/gather. 읽기만 한다.
// - objects: 그 2차맵 오브젝트 자리·종류·남은 번수·다시 자라는 시각(로그인한 사용자, 띄운 2차맵).
// - loops: 내 유닛의 채집·들어가기(진행 중 + 최근 끝난 것).
// - building: 2차맵 건물 판(시설 이름·레벨·내 것인가·화물을 넣을 수 있나·직무를 받을 수 있나·안에 있는 유닛).
// - station: 채집소 판(사용자 지적 2026-11-08 "원자재채집소의 기능도 필요", stationReads.ts).
import type { GatherStationResponse } from "@terra/shared/gatherStation";
import {
  GATHER_OBJECT_STRIDE,
  type GatherBuildingResponse,
  type GatherName,
  type GatherInsideResponse,
  type GatherInsideUnit,
  type GatherLoopsResponse,
  type GatherObjectsResponse,
  type GatherSchoolView,
} from "@terra/shared/gather";
import type { HarborPanel } from "@terra/shared/harbor";
import type { HarborPanelSource } from "../boats/service.ts";
import type { Viewer } from "../trpc/context.ts";
import type { GatherKind } from "./kinds.ts";
import { buildingPlace } from "../facilities/places.ts";
import { entryOptions } from "./enter.ts";
import { emptyStation, stationView } from "./stationReads.ts";
import type { GatherWorld } from "./world.ts";

export interface GatherReads {
  objects(viewer: Viewer, mapKey: number, nowMs: number): GatherObjectsResponse;
  loops(viewer: Viewer, nowMs: number): GatherLoopsResponse;
  building(viewer: Viewer, buildingId: number, nowMs: number): GatherBuildingResponse;
  inside(viewer: Viewer, mapKey: number, nowMs: number): GatherInsideResponse;
  station(viewer: Viewer, buildingId: number, nowMs: number): GatherStationResponse;
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

/** 배 시설 판(보는 사람 owner에 맞춰 내 것·금고를 거른다 — docs/adr/2026-11-15-shipyard-harbor.md). 조선소 첫 만들기 작업은 옛 boatJob 칸으로도 */
function harborOf(source: HarborPanelSource | undefined, ownerId: number | undefined) {
  if (!source) return {};
  const own = (id: number): boolean => ownerId !== undefined && id === ownerId;
  const mine = source.ownerId !== null && own(source.ownerId);
  const strip = <T extends { readonly ownerId: number }>(
    row: T,
  ): Omit<T, "ownerId"> & { readonly own: boolean } => {
    const { ownerId: rowOwner, ...rest } = row;
    return { ...rest, own: own(rowOwner) };
  };
  const harbor: HarborPanel = {
    role: source.role,
    closed: source.closed,
    access: source.access,
    fee: source.fee,
    ...(source.orderFee === undefined ? {} : { orderFee: source.orderFee }),
    module: source.module,
    modules: source.modules,
    moduleSlots: source.moduleSlots,
    currency: source.currency,
    storageFee: source.storageFee,
    storageFreeMs: source.storageFreeMs,
    capacity: source.capacity,
    used: source.used,
    docked: source.docked.map(strip),
    jobs: source.jobs.map(strip),
    types: source.types,
    boats: source.boats.map(strip),
    visits: source.visits.map(strip),
    mine: source.nearby.filter((row) => own(row.ownerId)).map(strip),
    cash: mine ? source.cash : null,
    overstayMul: source.overstayMul,
    maxHours: source.maxHours,
  };
  return {
    harbor,
    ...(source.startedAtMs !== undefined && source.readyAtMs !== undefined
      ? { boatJob: { startedAt: source.startedAtMs, readyAt: source.readyAtMs } }
      : {}),
  };
}

export function gatherReadsOf(
  source: () => GatherWorld | undefined,
  /** 배 시설 판 원본(배 서비스 dockJob — 이름은 옛 부두 판 고리). 없으면 싣지 않는다 */
  dockBoat?: (buildingId: number) => HarborPanelSource | undefined,
): GatherReads {
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
      const schools: GatherSchoolView[] = [];
      for (const object of list) {
        const kind = kinds[object.kind];
        const state = gather.store.read(mapKey, object.id, kind?.uses ?? 1, nowMs);
        objects.push(object.id, object.kind, state.usesLeft, state.regrowAtMs);
        // 움직이는 어군(기획 D-536): 길·한 바퀴 시간·어긋남 — 기기가 같은 함수로 자리를 낸다
        if (object.route)
          schools.push({
            id: object.id,
            points: [...object.route.points],
            periodMs: object.route.periodMs,
            phaseMs: object.route.phaseMs,
          });
      }
      const ladderOf = (target: GatherKind): GatherName | undefined => {
        const range = target.tierRange;
        if (!range || range.max <= range.min || (target.table && target.table.length > 0)) return undefined;
        const sub = catalog?.subcategoryOf(target.item);
        if (sub === undefined) return undefined;
        return catalog?.subcategoryName(sub) ?? { ko: sub, en: sub };
      };
      return {
        status: "ok",
        mapKey,
        kinds: kinds.map((kind) => {
          const ladderName = ladderOf(kind);
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
            ...(kind.direct ? {} : { direct: false }),
            ...(kind.art > 0 ? { art: kind.art } : {}),
            ...(kind.boat === true ? { boat: true } : {}),
            // 굴림표·사다리 굴림(기획 D-540 1222): 판이 "여러 가지 가운데 하나"·"스탯 띠 티어"를 보인다
            ...(kind.table && kind.table.length > 0
              ? {
                  table: kind.table.map((row) => ({
                    item: row.item,
                    itemName: catalog?.itemName(row.item) ?? null,
                    weightPm: row.weightPm,
                  })),
                }
              : {}),
            // 티어 범위가 두 티어 이상이면(기획 D-552) 사다리 이름과 범위 — 판이 "… 사다리 T0~T2"를 보인다. 한 티어면 대표 아이템만
            ...(ladderName
              ? {
                  ladderName,
                  ladderTiers: { min: kind.tierRange?.min ?? 0, max: kind.tierRange?.max ?? 0 },
                }
              : {}),
          };
        }),
        objects: objects.length % GATHER_OBJECT_STRIDE === 0 ? objects : [],
        ...(schools.length > 0 ? { schools } : {}),
        generatedAt: nowMs,
      };
    },
    loops(viewer, nowMs) {
      const gather = source();
      if (!gather) return { status: "not_ready", loops: [], generatedAt: nowMs };
      return { status: "ok", loops: gather.service.loops(viewer.id), generatedAt: nowMs };
    },
    inside(viewer, mapKey, nowMs) {
      const gather = source();
      if (!gather) return { status: "not_ready", mapKey, units: [], generatedAt: nowMs };
      const ownerId = gather.ownerOf(viewer.id);
      return {
        status: "ok",
        mapKey,
        units: gather.service.insideOn(mapKey).map((entry) => ({
          unitId: entry.unitId,
          buildingId: entry.buildingId,
          own: ownerId !== undefined && entry.ownerId === ownerId,
        })),
        generatedAt: nowMs,
      };
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
        ...(def ? { category: def.category } : {}),
        level: record?.level ?? 0,
        mine: ownerId !== undefined && place.ownerId === ownerId,
        accepts: options?.deposit !== null && options !== undefined,
        hires: options?.workplace === true,
        inside: inside.toSorted((a, b) => a.unitId - b.unitId),
        ...harborOf(dockBoat?.(buildingId), ownerId),
        generatedAt: nowMs,
      };
    },
    station(viewer, buildingId, nowMs) {
      const gather = source();
      return gather
        ? stationView(gather, viewer, buildingId, nowMs)
        : emptyStation("not_ready", buildingId, nowMs);
    },
  };
}
