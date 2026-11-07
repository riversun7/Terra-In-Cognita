// 1차맵 덧그림 투영 시험 — 화면 가운데 땅은 화면 가운데에 보이고, 지평선 너머(반대쪽)는 숨기고, 셀 키 찾기는 투영과 같은 칸을 준다
import { cellKey, decodeCellKey, descendantAt, PLACEMENT_SUBLEVELS } from "@terra/planet";
import { averageCellEdgeMeters, cellCenter } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { type Viewport, globeLimits, globePose, initialGlobe, latLonOf } from "./globeCamera.ts";
import {
  createProjector,
  latLonOfMapKey,
  mapKeyAtLatLon,
  placementAtLatLon,
  pointVisible,
} from "./planetOverlay.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";

const R = EARTH_RADIUS_M;
const PHONE: Viewport = { width: 390, height: 844 };
const limits = globeLimits(R, averageCellEdgeMeters(9, R), PHONE);

function projectorAt(latDeg: number, lonDeg: number, distance: number, height = 0) {
  const state = initialGlobe(latDeg, lonDeg, distance, limits);
  return createProjector({
    pose: globePose(state, R, limits),
    viewport: PHONE,
    radiusM: R,
    occluderRadiusM: R * 0.999,
    distanceM: state.distance,
    heightAt: () => height,
  });
}

describe("덧그림 투영", () => {
  it("화면 가운데 땅은 화면 가운데, 보인다", () => {
    const projector = projectorAt(20, 30, limits.maxDistance * 0.9);
    const point = projector.project(20, 30);
    expect(point?.visible).toBe(true);
    expect(point?.x).toBeCloseTo(PHONE.width / 2, 3);
    expect(point?.y).toBeCloseTo(PHONE.height / 2, 3);
  });

  it("반대쪽(지평선 너머)은 숨긴다, 가까운 옆 땅은 보인다", () => {
    const projector = projectorAt(20, 30, limits.maxDistance * 0.9);
    expect(projector.project(-20, -150)?.visible ?? false).toBe(false);
    expect(projector.project(25, 35)?.visible).toBe(true);
  });

  it("높이가 있으면 그만큼 위에 놓고, 바다(음수)는 해수면에 놓는다", () => {
    const flat = projectorAt(0, 0, limits.minDistance * 4).project(0.05, 0);
    const high = projectorAt(0, 0, limits.minDistance * 4, 3000).project(0.05, 0);
    const sea = projectorAt(0, 0, limits.minDistance * 4, -3000).project(0.05, 0);
    expect(flat && high && sea).toBeTruthy();
    expect(high?.y).not.toBeCloseTo(flat?.y ?? 0, 1);
    expect(sea?.y).toBeCloseTo(flat?.y ?? 0, 6);
  });

  it("숫자가 아니면 null", () => {
    expect(projectorAt(0, 0, limits.maxDistance).project(Number.NaN, 0)).toBeNull();
  });

  it("pointVisible: 카메라와 점 사이에 구가 있으면 숨김", () => {
    expect(pointVisible([3 * R, 0, 0], [R, 0, 0], R * 0.99)).toBe(true);
    expect(pointVisible([3 * R, 0, 0], [-R, 0, 0], R * 0.99)).toBe(false);
  });
});

describe("위도·경도 → 2차맵 키", () => {
  it("칸 가운데의 위도·경도는 그 칸 키로 돌아온다", () => {
    for (const [face, i, j] of [
      [0, 282, 328],
      [3, 10, 500],
      [5, 511, 0],
    ] as const) {
      const key = cellKey(face, 9, i, j);
      const { latDeg, lonDeg } = latLonOf(cellCenter(key));
      const found = mapKeyAtLatLon(latDeg, lonDeg, 9);
      expect(decodeCellKey(found)).toEqual({ face, level: 9, i, j });
      expect(latLonOfMapKey(key)).toEqual({ latDeg, lonDeg });
    }
  });

  it("배치 칸 가운데의 위도·경도는 그 2차맵 키·배치 칸으로 돌아온다(서버 placementCellKey와 같은 틀)", () => {
    const mapKey = cellKey(2, 9, 140, 77);
    for (const [x, y] of [
      [0, 0],
      [128, 64],
      [255, 255],
      [17, 230],
    ] as const) {
      const { latDeg, lonDeg } = latLonOf(cellCenter(descendantAt(mapKey, PLACEMENT_SUBLEVELS, x, y)));
      expect(placementAtLatLon(latDeg, lonDeg, 9)).toEqual({ mapKey, x, y });
    }
  });

  it("셀 키가 아니면 null", () => {
    expect(latLonOfMapKey(-1)).toBeNull();
    expect(latLonOfMapKey(0.5)).toBeNull();
  });
});
