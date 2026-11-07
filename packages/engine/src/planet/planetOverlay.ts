// 1차맵 덧그림 투영 — 화면이 도시 표시·영토 경계 같은 DOM·SVG 덧그림을 땅 위에 놓을 때 쓰는 순수 계산(시험 대상, three.js를 쓰지 않는다).
// docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름". 엔진은 그린 프레임마다 투영기(PlanetProjector)를 onOverlay로 넘긴다:
// 화면은 그 자리에서 DOM 위치만 바꾼다(React 상태를 바꾸지 않는다, PLAN 5.7 고빈도 상태는 엔진 안).
// 보임: 카메라 앞이고, 카메라에서 그 점까지 가는 시선이 행성 몸(가리는 구)에 먼저 닿지 않을 때(지평선 너머는 숨긴다).
import { type CellKey, PLACEMENT_SUBLEVELS, isCellKey, offsetInAncestor } from "@terra/planet";
import { cellCenter, xyzToCell } from "@terra/planet/projection";
import {
  type GlobePose,
  GLOBE_FOV_RAD,
  type Viewport,
  directionOfLatLon,
  latLonOf,
  projectToScreen,
  raySphere,
} from "./globeCamera.ts";
import { type Vec3, length, normalize, scale, sub } from "./vec3.ts";

/** 화면 점(CSS px)과 보임 */
export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
  /** 지평선 앞(행성 몸에 가리지 않음) */
  readonly visible: boolean;
}

/** 엔진이 그린 프레임마다 넘기는 투영기 */
export interface PlanetProjector {
  /** 덧그림 판 크기(CSS px) = 캔버스 크기 */
  readonly viewport: Viewport;
  /** 목표점에서 카메라까지(m) — 덧그림 크기(가까우면 이름표 등)를 고를 때 */
  readonly distanceM: number;
  /** 행성 해수면 반지름(m) */
  readonly radiusM: number;
  /** 위도·경도(°) 땅 위(보이는 높이) 점의 화면 점. 카메라 뒤면 null */
  project(latDeg: number, lonDeg: number): ProjectedPoint | null;
}

/** 시선 C → P가 반지름 occluder 구에 P보다 먼저 닿지 않으면 보인다(P는 구 밖이어야 한다) */
export function pointVisible(camera: Vec3, point: Vec3, occluderRadiusM: number): boolean {
  const toPoint = sub(point, camera);
  const distance = length(toPoint);
  if (distance <= 0) return true;
  const hit = raySphere(camera, normalize(toPoint), occluderRadiusM);
  return hit === null || hit >= distance * (1 - 1e-9);
}

/**
 * 투영기를 만든다. heightAt = 방향 → 보이는 높이(게임 m × 과장, 엔진의 displayedHeightAt). 바다(음수)는 해수면에 놓는다.
 * occluderRadiusM = 가리는 구(가장 거친 메시 활꼴만큼 해수면보다 안쪽)
 */
export function createProjector(options: {
  readonly pose: GlobePose;
  readonly viewport: Viewport;
  readonly radiusM: number;
  readonly occluderRadiusM: number;
  readonly distanceM: number;
  readonly heightAt: (direction: Vec3) => number;
  readonly fov?: number;
}): PlanetProjector {
  const { pose, viewport, radiusM, occluderRadiusM, heightAt } = options;
  const fov = options.fov ?? GLOBE_FOV_RAD;
  return {
    viewport,
    distanceM: options.distanceM,
    radiusM,
    project(latDeg, lonDeg) {
      if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;
      const direction = directionOfLatLon(latDeg, lonDeg);
      const point = scale(direction, radiusM + Math.max(0, heightAt(direction)));
      const screen = projectToScreen(pose, viewport, point, fov);
      if (!screen) return null;
      return { x: screen.x, y: screen.y, visible: pointVisible(pose.position, point, occluderRadiusM) };
    },
  };
}

/** 위도·경도(°) 자리의 1차맵 칸 셀 키(면 레벨 faceLevel) = 그곳 2차맵 키 */
export function mapKeyAtLatLon(latDeg: number, lonDeg: number, faceLevel: number): CellKey {
  return xyzToCell(directionOfLatLon(latDeg, lonDeg), faceLevel);
}

/** 2차맵 키(1차맵 칸 셀 키) 가운데의 위도·경도(°). 셀 키가 아니면 null */
export function latLonOfMapKey(mapKey: number): { latDeg: number; lonDeg: number } | null {
  return isCellKey(mapKey) ? latLonOf(cellCenter(mapKey)) : null;
}

/**
 * 위도·경도(°) 자리의 2차맵 키와 그 안 배치 칸(0 ~ 255) — 1차맵에서 고른 곳을 2차맵 카메라로 넘길 때(docs/adr/2026-11-07-play-flow.md "WP7").
 * 배치 칸 = 2차맵 칸의 PLACEMENT_SUBLEVELS 아래 칸(서버 placementCellKey와 같은 틀)
 */
export function placementAtLatLon(
  latDeg: number,
  lonDeg: number,
  faceLevel: number,
): { mapKey: CellKey; x: number; y: number } {
  const cell = xyzToCell(directionOfLatLon(latDeg, lonDeg), faceLevel + PLACEMENT_SUBLEVELS);
  const { ancestor, x, y } = offsetInAncestor(cell, faceLevel);
  return { mapKey: ancestor, x, y };
}
