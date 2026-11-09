// 2차맵 건물 겉모습 조회(tRPC facilities.mapLooks) — ADR 2026-11-08-building-art. 읽기만 한다(게임 상태를 바꾸지 않는다).
// 띄운 2차맵의 건물마다 시설 ID·레벨·상태(짓는 중·정상·손상·멈춤·폐허)·레벨 올리는 중·주인의 국가를 준다. 화면은 이것으로 건물 모델을 고른다.
// 상태 셈은 건물 화면(views.ts)과 같다: 다 지은 시설은 지금 시각까지 상태를 흐르게 한 값(advanceCondition), 처음 짓는 중은 "building".
// 보이는 건물만 준다: 시야 전송(world/vision.ts)이 건물을 보내는 규칙과 같다 — 전체 보기 권한, 내 건물, 아는 시야 칸(탐사 ∪ 지금 시야)에 든 건물.
// 시설 겉모습 자료(실효 팩 look, 건물 편집기가 바로 바꾼다 — ADR "바뀜 (2026-11-09)")도 싣는다.
// 시설 이름·내 건물인가도 준다(2차맵 근처 목록 건물 탭, docs/adr/2026-11-08-seamless-second-map.md WP-2).
import { advanceCondition, conditionStateOf } from "@terra/shared/facilityRuntime";
import type { FacilityLookJson } from "@terra/shared/facilityLook";
import type { MapBuildingLook, MapLooksResponse } from "@terra/shared/mapLooks";
import type { LocalizedName } from "@terra/shared/roster";
import { type SocietyCoefficients, hasBit } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import { buildingCell } from "../world/vision.ts";
import type { FacilityRecord, JobRecord } from "./state.ts";

/** 묻는 사람: 전체 보기 권한, 소유 주체(없으면 내 건물 없음), 아는 시야 칸 비트(전체 보기면 없어도 된다) */
export interface LooksViewer {
  readonly observer: boolean;
  readonly ownerId: number | undefined;
  readonly sighted: Uint8Array | undefined;
}

export interface MapLooksSource {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly service: {
    readonly facilities: ReadonlyMap<number, FacilityRecord>;
    readonly jobs: ReadonlyMap<number, JobRecord>;
  };
  readonly rules: () => SocietyCoefficients;
  /** 시설 이름(팩). 없으면 이름을 싣지 않는다 */
  readonly facilityName?: (facilityId: string) => LocalizedName | undefined;
  /** 시설 겉모습 자료(실효 팩 look). 없으면 싣지 않는다(화면이 시설 ID로 모델을 고른다) */
  readonly facilityArt?: (facilityId: string) => FacilityLookJson | undefined;
}

/** 그 2차맵 건물들의 주인 주체 ID(중복 없음) — 국가를 한 번에 찾는다 */
export function mapOwnerIds(maps: ReadonlyMap<number, SecondMap>, mapKey: number): number[] {
  const owners = new Set<number>();
  maps.get(mapKey)?.forEachBuilding((building) => {
    if (building.ownerId !== null) owners.add(building.ownerId);
  });
  return [...owners];
}

/** 띄운 2차맵의 건물 가운데 그 사람이 보는 것의 겉모습. 주인 → 국가(ownerFactions, 없으면 null) */
export function mapBuildingLooks(
  source: MapLooksSource,
  mapKey: number,
  nowMs: number,
  viewer: LooksViewer,
  ownerFactions: ReadonlyMap<number, number | null>,
): MapLooksResponse {
  const map = source.maps.get(mapKey);
  if (!map) return { status: "unknown_map", mapKey, buildings: [], generatedAt: nowMs };
  const rt = source.rules().facilityRuntime;
  const upgrading = new Set<number>();
  for (const job of source.service.jobs.values())
    if (job.kind === "upgrade" && job.buildingId !== null) upgrading.add(job.buildingId);
  const buildings: MapBuildingLook[] = [];
  map.forEachBuilding((building) => {
    const visible =
      viewer.observer ||
      (viewer.ownerId !== undefined && building.ownerId === viewer.ownerId) ||
      (viewer.sighted !== undefined && hasBit(viewer.sighted, buildingCell(building.placement)));
    if (!visible) return;
    const record = source.service.facilities.get(building.id);
    const factionId = building.ownerId === null ? null : (ownerFactions.get(building.ownerId) ?? null);
    const mine = viewer.ownerId !== undefined && building.ownerId === viewer.ownerId;
    if (!record) {
      buildings.push({
        buildingId: building.id,
        facilityId: null,
        level: 1,
        state: "ok",
        upgrading: false,
        factionId,
        mine,
      });
      return;
    }
    const name = source.facilityName?.(record.facilityId);
    const art = source.facilityArt?.(record.facilityId);
    const condition =
      record.level >= 1 && nowMs > record.conditionAtMs
        ? advanceCondition(record.conditionPpm, nowMs - record.conditionAtMs, false, rt)
        : record.conditionPpm;
    buildings.push({
      buildingId: building.id,
      facilityId: record.facilityId,
      level: record.level,
      state: record.level < 1 ? "building" : conditionStateOf(condition, rt),
      upgrading: record.level >= 1 && upgrading.has(building.id),
      factionId,
      ...(name ? { name } : {}),
      mine,
      ...(art ? { art } : {}),
    });
  });
  buildings.sort((a, b) => a.buildingId - b.buildingId);
  return { status: "ok", mapKey, buildings, generatedAt: nowMs };
}
