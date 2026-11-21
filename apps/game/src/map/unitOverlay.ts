// 1차맵 내 본캐릭 사이보그·내 유닛 위치 및 이동 경로 투영 도우미 — CityOverlay와 PlanetUnitsPanel이 같이 쓴다.
// - mergeMyUnits: 새 서버(travels.units)·옛 서버(travels.parked + myPosition) 자료를 내 유닛 목록 하나로 합친다.
// - projectMyRoutes: 이동 중인 본체·유닛의 남은 경로(routePoints)를 1차맵 SVG 경로와 목적지 표적으로 투영한다.
// - groupVisibleUnits: 같은 자리·가까운 픽셀에 모인 내 유닛을 깔끔한 부대 핀(×N)으로 묶고, 사이보그 본체와 겹치면 살짝 옆으로 비켜 둘 다 보이게 한다.
import type { PlanetProjector, ProjectedPoint } from "@terra/engine/planet";
import type { WorldMyUnit, WorldParkedUnit, WorldPosition, WorldTravel } from "@terra/shared/worldMap";

/** 내 유닛 묶음 거리(CSS px) */
const MY_UNIT_CLUSTER_PX = 24;
/** 본캐 사이보그와 같은 자리에 선 내 유닛을 살짝 비켜 놓을 간격(CSS px) */
const CYBORG_SEPARATE_PX = 20;
const CYBORG_OFFSET_X = 24;
const CYBORG_OFFSET_Y = 14;

/** 새 서버 units + 옛 서버 parked + 내 사이보그 자리(me)를 내 유닛 목록 하나로 합친다 */
export function mergeMyUnits(
  units: readonly WorldMyUnit[] | undefined,
  parked: readonly WorldParkedUnit[] | undefined,
  me: WorldPosition | null,
  travels: readonly WorldTravel[] | undefined,
): WorldMyUnit[] {
  const byId = new Map<number, WorldMyUnit>();
  const goingByUnit = new Map(
    (travels ?? []).filter((entry) => entry.state === "going").map((entry) => [entry.unitId, entry]),
  );
  for (const unit of units ?? []) {
    const going = goingByUnit.get(unit.unitId);
    byId.set(
      unit.unitId,
      going
        ? {
            ...unit,
            mapKey: going.mapKey,
            cellX: going.cellX,
            cellY: going.cellY,
            latDeg: going.latDeg,
            lonDeg: going.lonDeg,
            moving: true,
          }
        : unit,
    );
  }
  for (const entry of parked ?? []) {
    if (byId.has(entry.unitId)) continue;
    const going = goingByUnit.get(entry.unitId);
    byId.set(entry.unitId, {
      unitId: entry.unitId,
      kind: entry.cyborg ? "cyborg" : entry.boat ? "boat" : "other",
      mapKey: going ? going.mapKey : entry.mapKey,
      cellX: going ? going.cellX : entry.cellX,
      cellY: going ? going.cellY : entry.cellY,
      latDeg: going ? going.latDeg : entry.latDeg,
      lonDeg: going ? going.lonDeg : entry.lonDeg,
      loaded: false,
      moving: going !== undefined,
      working: false,
      aboardId: null,
    });
  }
  if (me && !byId.has(me.unitId)) {
    const going = goingByUnit.get(me.unitId);
    byId.set(me.unitId, {
      unitId: me.unitId,
      kind: "cyborg",
      name: me.name ?? null,
      mapKey: going ? going.mapKey : me.mapKey,
      cellX: going ? going.cellX : me.cellX,
      cellY: going ? going.cellY : me.cellY,
      latDeg: going ? going.latDeg : me.latDeg,
      lonDeg: going ? going.lonDeg : me.lonDeg,
      loaded: !me.hidden,
      moving: going !== undefined,
      working: false,
      aboardId: null,
    });
  } else if (me) {
    const existing = byId.get(me.unitId);
    if (existing && !existing.name && me.name) {
      byId.set(me.unitId, { ...existing, name: me.name });
    }
  }
  return [...byId.values()];
}

export interface ProjectedRouteTarget {
  readonly unitId: number;
  readonly cyborg: boolean;
  readonly x: number;
  readonly y: number;
}

export interface ProjectedMyRoutes {
  readonly cyborgRoute: string;
  readonly unitRoute: string;
  readonly targets: readonly ProjectedRouteTarget[];
}

const fmtPt = (point: ProjectedPoint): string => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;

/** 이동 중인 내 사이보그·유닛의 남은 1차맵 경로를 SVG path와 목적지 표적으로 투영한다 */
export function projectMyRoutes(
  projector: PlanetProjector,
  travels: readonly WorldTravel[] | undefined,
  cyborgUnitId: number | null,
): ProjectedMyRoutes {
  const { width, height } = projector.viewport;
  let cyborgRoute = "";
  let unitRoute = "";
  const targets: ProjectedRouteTarget[] = [];
  for (const travel of travels ?? []) {
    if (travel.state !== "going" || !travel.routePoints || travel.routePoints.length < 2) continue;
    let segment = "";
    let lastVisible: ProjectedPoint | null = null;
    for (const [lat, lon] of travel.routePoints) {
      const point = projector.project(lat, lon);
      if (!point) {
        segment = "";
        break;
      }
      segment += `${segment === "" ? "M" : "L"}${fmtPt(point)}`;
      lastVisible = point;
    }
    if (segment === "") continue;
    const isCyborg = cyborgUnitId !== null && travel.unitId === cyborgUnitId;
    if (isCyborg) cyborgRoute += segment;
    else unitRoute += segment;
    if (
      lastVisible?.visible &&
      lastVisible.x >= -24 &&
      lastVisible.x <= width + 24 &&
      lastVisible.y >= -24 &&
      lastVisible.y <= height + 24
    ) {
      targets.push({ unitId: travel.unitId, cyborg: isCyborg, x: lastVisible.x, y: lastVisible.y });
    }
  }
  return { cyborgRoute, unitRoute, targets };
}

export interface PlacedMyUnit {
  readonly unit: WorldMyUnit;
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly anyMoving: boolean;
  readonly anyBoat: boolean;
}

/**
 * 화면 안에 보이는 내 비본체 유닛(승객 제외)을 묶어 핀 자리를 정한다.
 * 본캐 사이보그와 같은 도시에 서 있으면 오른쪽 아래로 살짝 비켜 두 핀이 겹치지 않게 한다.
 */
export function placeMyUnits(
  projector: PlanetProjector,
  units: readonly WorldMyUnit[],
  cyborgPoint: ProjectedPoint | null,
  focusedUnitId: number | null,
): PlacedMyUnit[] {
  const { width, height } = projector.viewport;
  const ordered = units
    .filter((unit) => unit.kind !== "cyborg" && unit.aboardId == null)
    .toSorted(
      (a, b) =>
        Number(b.unitId === focusedUnitId) - Number(a.unitId === focusedUnitId) ||
        Number(b.moving) - Number(a.moving) ||
        Number(b.kind === "boat") - Number(a.kind === "boat") ||
        a.unitId - b.unitId,
    );
  const groups: {
    readonly unit: WorldMyUnit;
    x: number;
    y: number;
    count: number;
    anyMoving: boolean;
    anyBoat: boolean;
  }[] = [];
  for (const unit of ordered) {
    const point = projector.project(unit.latDeg, unit.lonDeg);
    if (!point?.visible || point.x < -48 || point.x > width + 48 || point.y < -48 || point.y > height + 48)
      continue;
    let x = point.x;
    let y = point.y;
    if (cyborgPoint?.visible && Math.hypot(x - cyborgPoint.x, y - cyborgPoint.y) < CYBORG_SEPARATE_PX) {
      x += CYBORG_OFFSET_X;
      y += CYBORG_OFFSET_Y;
    }
    const near = groups.find((entry) => Math.hypot(entry.x - x, entry.y - y) < MY_UNIT_CLUSTER_PX);
    if (near) {
      near.count += 1;
      if (unit.moving) near.anyMoving = true;
      if (unit.kind === "boat") near.anyBoat = true;
      continue;
    }
    groups.push({
      unit,
      x,
      y,
      count: 1,
      anyMoving: unit.moving,
      anyBoat: unit.kind === "boat",
    });
  }
  return groups;
}
