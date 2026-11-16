// 2차맵 사이 이동 서비스의 순수 도우미 — service.ts가 쓴다(그 파일 1,000줄 상한, docs/adr/2026-11-07-play-flow.md "WP9"·"WP11",
// docs/adr/2026-11-15-unloaded-second-maps.md). 걷기 빠르기, 설 칸, 좌표 유닛 줄 → 유닛 정보, 화면 한 줄·도착 예상.
import { MAX_UNIT_SPEED } from "@terra/protocol";
import {
  type CellPoint,
  PLACEMENT_SIZE,
  type SizeClass,
  anchorCenter,
  arrivalAt,
  createMotion,
  positionAt,
} from "@terra/sim";
import type { WorldTravelStop } from "@terra/shared/worldMap";
import { lastPoint } from "../world/mapGeometry.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { type UnitRow, motionOfRow } from "../world/secondMapRows.ts";
import { type RouteContext, planLegs, travelMs } from "./route.ts";
import {
  type CoordinateUnit,
  type HaltedTrip,
  type Journey,
  type TravelView,
  cellOf,
} from "./serviceTypes.ts";

/**
 * 걷는 빠르기 × 배수(운영자 모드 길, 사용자 지적 2026-11-09 "운영자모드에서 인접 2차맵을 목적지로 선택시 원래 속도로 느려진다").
 * 2차맵 이동 명령(secondMap.ts onRoute)과 같은 식이다
 */
export function walkSpeed(speed: number, factor: number): number {
  if (factor === 1) return speed;
  return Math.min(MAX_UNIT_SPEED, Math.max(1, Math.round(speed * factor)));
}

/** 설 수 있나: 걷는 유닛 = 땅, 배 = 물 칸(D-541 1283 나) */
export function standsOn(map: SecondMap, cell: CellPoint, size: SizeClass, sea: boolean): boolean {
  return sea ? map.isNavigable(cell.x, cell.y, size) : map.isStandable(cell.x, cell.y, size);
}

export type UnitInfo = NonNullable<ReturnType<SecondMap["unitInfo"]>>;

/** 몸이 2차맵 안에 들어가는 기준 칸 좌표 */
export const fitCell = (value: number, size: SizeClass): number =>
  Math.max(0, Math.min(PLACEMENT_SIZE - size, value));

/** 좌표 유닛 저장 줄 → 유닛 정보 모양(서 있는 움직임, 승객 아님) */
export function infoOfRow(row: UnitRow): UnitInfo {
  return {
    size: row.size,
    speed: row.speed,
    motion:
      motionOfRow(row) ?? createMotion({ waypoints: [{ x: 0, y: 0 }], departAtMs: 0, speed: row.speed }),
    ownerId: row.ownerId,
    condition: row.condition,
    kind: row.kind,
    job: row.job,
    domain: row.domain,
    aboard: undefined,
  };
}

/** 좌표 유닛 한 줄(보기 값) */
export function coordinateOf(row: UnitRow, mapKey: number, cell: CellPoint, moving: boolean): CoordinateUnit {
  return {
    unitId: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    mapKey,
    cellX: cell.x,
    cellY: cell.y,
    moving,
    aboard: row.aboardId ?? null,
    sea: row.domain === "sea",
  };
}

/** 화면 한 줄: 2차맵 위면 지금 자리(info), 좌표로 가는 중·좌표 유닛이면 그 자리(place), 아니면 목표 칸 */
export function travelView(
  journey: Journey,
  state: TravelView["state"],
  stop: WorldTravelStop | null,
  arriveAt: number,
  place: { readonly mapKey: number; readonly cell: CellPoint } | null,
  info: UnitInfo | undefined,
  at: number,
): TravelView {
  let mapKey = journey.route[journey.leg] ?? journey.route[0] ?? 0;
  let cell: CellPoint = journey.target;
  if (info) cell = cellOf(positionAt(info.motion, at));
  else if (place) {
    mapKey = place.mapKey;
    cell = place.cell;
  }
  return {
    unitId: journey.unitId,
    kind: journey.kind,
    route: [...journey.route],
    leg: journey.leg,
    mapKey,
    cellX: cell.x,
    cellY: cell.y,
    targetX: journey.target.x,
    targetY: journey.target.y,
    startedAt: journey.startedAtMs,
    arriveAt,
    state,
    stop,
    returning: journey.scoutedMapKey !== null,
    scoutedMapKey: journey.scoutedMapKey,
    hidden: journey.hidden !== null,
  };
}

/**
 * 가는 중인 길의 도착 예상: 지금 2차맵 다리는 움직임의 실제 도착(구간 빠르기 — 지형을 따른다, docs/adr/2026-11-14-segment-speed.md 8절),
 * 그 끝에서 남은 줄은 곧은 거리 ÷ 속도(못 재면 보낼 때 잰 값). 좌표 구간은 지형이 없어 곧은 거리 ÷ 속도. context(from) = route[from..] 문맥
 */
export function travelEta(
  journey: Journey,
  at: number,
  context: (from: number) => RouteContext,
  info: UnitInfo | undefined,
): number {
  const hidden = journey.hidden;
  if (hidden) {
    const rest = planLegs(
      context(hidden.hop.to),
      anchorCenter(hidden.hop.entry.x, hidden.hop.entry.y, hidden.size),
    );
    return rest.ok
      ? Math.max(at, hidden.untilMs) + travelMs(rest.distance, hidden.speed)
      : journey.arriveAtMs;
  }
  if (!info) return journey.arriveAtMs;
  const rest = planLegs(context(journey.leg), lastPoint(info.motion));
  return rest.ok
    ? Math.max(at, arrivalAt(info.motion)) +
        travelMs(rest.distance, walkSpeed(info.speed, journey.speedFactor))
    : journey.arriveAtMs;
}

/** 조우로 멈춘 길의 다시 판단 자료(D-570 1908): 목표 = 지금 길의 마지막 2차맵 칸(정찰이 돌아오는 중이면 돌아오는 곳) */
export function haltedTrip(journey: Journey): HaltedTrip {
  return {
    unitId: journey.unitId,
    ownerId: journey.ownerId,
    userId: journey.userId,
    kind: journey.kind,
    origin: journey.origin,
    target: { mapKey: journey.route.at(-1) ?? -1, x: journey.target.x, y: journey.target.y },
  };
}
