// 2차맵 사이 이동의 확인 단계 몫(읽기만) — service.ts에서 나눔(그 파일 1,000줄 상한). docs/adr/2026-11-07-play-flow.md "WP9"·"WP11",
// docs/adr/2026-11-15-unloaded-second-maps.md 4절(좌표 유닛도 보낼 수 있고, 띄우지 않은 목적지는 좌표 이동으로 간다 — map_full 없음).
// - 유닛 찾기(locate·ownUnit): 띄운 2차맵 위 유닛, 아니면 좌표 유닛 장부(서 있음). 승객에게 보낸 길은 그 배의 길(D-541 1279 나).
// - 길(planFor): 지나는 2차맵 줄과 곧은 거리. 띄우지 않은 2차맵은 설 수 있다고 본다(좌표 구간 — 띄울 때 실제 지형으로 다시 고른다).
import { AVERAGE_CELL_EDGE_METERS } from "@terra/planet/territory";
import type { WorldTravelProblem, WorldTravelRoute } from "@terra/shared/worldMap";
import { JOB_NONE, positionAt } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_BOT, isGuardianUnit } from "../world/unitKinds.ts";
import type { ParkedBook } from "./parked.ts";
import { type Standable, distanceMeters, mapRoute, planLegs, routeContext, travelMs } from "./route.ts";
import { type UnitInfo, infoOfRow, standsOn } from "./serviceParts.ts";
import type { Journey, TravelDeps, TravelTarget } from "./serviceTypes.ts";

export interface PlannerParts {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly parked: ParkedBook;
  readonly journeys: ReadonlyMap<number, Journey>;
  readonly deps: Pick<TravelDeps, "ownerOf" | "cyborgUnitOf">;
  readonly now: () => number;
  /** 보낼 수 있는 목적지(띄운 2차맵이거나 이 행성의 2차맵 키) */
  readonly isTarget: (mapKey: number) => boolean;
  /** 배가 지날 수 있는 2차맵(띄웠거나 행성 값이 바다) */
  readonly seaPassable: (mapKey: number) => boolean;
}

export function createPlanner(parts: PlannerParts) {
  const { maps, parked, journeys, deps, now, isTarget, seaPassable } = parts;
  /** 길 찾기의 띄운 2차맵: 출발·목적은 띄우지 않았어도 넣는다(mapRoute는 두 끝이 띄운 것이어야 한다) */
  const routeLoaded =
    (from: number, to: number) =>
    (mapKey: number): boolean =>
      maps.has(mapKey) || mapKey === from || mapKey === to;
  /** 길 고르기의 설 칸: 띄우지 않은 2차맵은 설 수 있다고 본다(좌표 구간 — 띄울 때 실제 지형으로 다시 고른다). sea = 배(물 칸) */
  const planStandable =
    (sea = false): Standable =>
    (mapKey, cell, size) => {
      const map = maps.get(mapKey);
      return map ? standsOn(map, cell, size, sea) : true;
    };
  /** 유닛이 선 2차맵과 유닛 정보 */
  /** fresh = 걷기 빠르기를 몸에서 다시 읽고 본다(길 예상 시간 — D-540 실효 AGI, 장비를 바꾼 뒤 첫 길도 맞게) */
  const locate = (unitId: number, fresh = false) => {
    for (const map of maps.values()) {
      if (fresh && map.unitInfo(unitId)) map.refreshSpeed(unitId);
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
  };

  /** 내가 옮길 수 있는 유닛(내 소유, 수호신·봇 아님)과 그 자리. 건너뛰는 중이면 in_transit */
  const ownUnit = (userId: string, unitId: number | undefined) => {
    const asked = unitId ?? deps.cyborgUnitOf?.(userId) ?? null;
    if (asked === null) return { problem: "no_cyborg" as const };
    const ownerId = deps.ownerOf(userId);
    // 승객에게 보낸 길은 그 배의 길(D-541 1279 나·1283 나)
    const id = locate(asked)?.info.aboard ?? parked.get(asked)?.row.aboardId ?? asked;
    const found = locate(id, true);
    // 좌표 유닛(서 있음)도 보낼 수 있다(그 자리에서 좌표 이동 — ADR 2026-11-15 4절)
    const spot = found ? undefined : parked.get(id);
    const where = found
      ? { mapKey: found.map.mapKey, info: found.info, map: found.map }
      : spot
        ? { mapKey: spot.row.mapKey, info: infoOfRow(spot.row), map: undefined as SecondMap | undefined }
        : undefined;
    if (!where) {
      const journey = journeys.get(id);
      return journey?.hidden && journey.ownerId === ownerId
        ? { problem: "in_transit" as const }
        : { problem: "unknown_unit" as const };
    }
    if (
      ownerId === undefined ||
      where.info.ownerId !== ownerId ||
      isGuardianUnit(where.info) ||
      where.info.kind === UNIT_KIND_BOT
    )
      return { problem: "forbidden" as const };
    return { id, ownerId, ...where };
  };

  /** 지나는 2차맵 줄과 곧은 거리(목적지가 띄우지 않은 것이면 마지막 구간은 목표 칸까지 좌표 이동 — 2차맵을 띄우지 않는다) */
  const planFor = (
    where: { readonly mapKey: number; readonly info: UnitInfo },
    target: TravelTarget,
  ): { route: number[]; distance: number } | { problem: WorldTravelProblem } => {
    if (!isTarget(target.mapKey)) return { problem: "unknown_map" };
    if (unavailable(where.info.condition, now())) return { problem: "unavailable" };
    const route = mapRoute(where.mapKey, target.mapKey, routeLoaded(where.mapKey, target.mapKey));
    if (!route) return { problem: "no_route" };
    const sea = where.info.domain === "sea";
    // 배는 행성 값이 바다인 띄우지 않은 2차맵만 길에 넣는다(좌표로 항해한다 — D-553 1329·D-559 1619)
    if (sea && !route.slice(1, -1).every(seaPassable)) return { problem: "no_route" };
    const cell = { x: target.x, y: target.y };
    const legs = planLegs(
      routeContext(route, cell, where.info.size, planStandable(sea), (key) => maps.has(key)),
      positionAt(where.info.motion, now()),
    );
    if (!legs.ok) return { problem: legs.problem };
    return { route, distance: legs.distance };
  };

  return { locate, ownUnit, planFor, planStandable, routeLoaded };
}

/** 확인 단계 한 줄(보내지 않는다): 지나는 2차맵·곧은 거리(m)·걸리는 시간·도착 예상·일하는 중인가·건너뛸 2차맵 수 */
export function routePlan(
  found: { readonly id: number; readonly info: UnitInfo },
  planned: { readonly route: number[]; readonly distance: number },
  targetMapKey: number,
  loaded: (mapKey: number) => boolean,
  nowMs: number,
): WorldTravelRoute {
  const durationMs = travelMs(planned.distance, found.info.speed);
  return {
    unitId: found.id,
    route: planned.route,
    distanceM: distanceMeters(planned.distance, AVERAGE_CELL_EDGE_METERS),
    durationMs,
    arriveAt: nowMs + durationMs,
    working: found.info.job.job !== JOB_NONE,
    hiddenMaps: planned.route.filter((key) => !loaded(key) && key !== targetMapKey).length,
    cost: "walk",
  };
}
