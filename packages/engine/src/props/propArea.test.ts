import { describe, expect, it } from "vitest";
import {
  type CameraState,
  type Viewport,
  cameraLimitsFor,
  clampCamera,
  groundUnder,
} from "../camera/cameraMath.ts";
import { insideDistance, polygonArea, propArea } from "./propArea.ts";

const PHONE: Viewport = { width: 411, height: 784 };
const MAP = 128 * 11.7;
const limits = cameraLimitsFor(MAP, PHONE);

/** 확대 5단계 근처(가장 가까이 × 1.5) 카메라 — 그린 기울기는 clampCamera가 눕힌다 */
function closeCamera(yaw = 0): CameraState {
  return clampCamera(
    { targetX: 700, targetY: 0, targetZ: 700, yaw, pitch: Math.PI / 4, distance: limits.minDistance * 1.5 },
    limits,
  );
}

describe("소품 모델을 세울 땅", () => {
  it("변 거리: 안은 +, 밖은 −, 꼭짓점 차례와 상관없다", () => {
    const square = [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ];
    expect(insideDistance(square, 5, 5)).toBeCloseTo(5, 9);
    expect(insideDistance(square, 12, 5)).toBeCloseTo(-2, 9);
    expect(polygonArea(square)).toBeCloseTo(100, 9);
    expect(polygonArea([...square].reverse())).toBeCloseTo(100, 9);
  });

  it("가시거리가 화면보다 길면 화면이 보는 땅 전체(위 끝까지)를 덮는다", () => {
    const state = closeCamera();
    const area = propArea(state, PHONE, 2_000);
    const top = groundUnder(state, PHONE, { x: PHONE.width / 2, y: 0 });
    const corner = groundUnder(state, PHONE, { x: PHONE.width, y: 0 });
    if (!top || !corner) throw new Error("no ground");
    expect(insideDistance(area.polygon, top.x, top.z)).toBeGreaterThan(-1e-6);
    expect(insideDistance(area.polygon, corner.x * 0.999 + 700 * 0.001, corner.z)).toBeGreaterThan(-1e-3);
    // 화면 위 끝은 목표점에서 200m 넘게 앞이다(눕힌 기울기, 전에는 45°로 약 126m)
    expect(700 - top.z).toBeGreaterThan(200);
  });

  it("가시거리로 자르고, 화면 뒤(아래 끝 너머)와 옆 화면 밖은 넣지 않는다", () => {
    for (const yaw of [0, 0.7, -2.4]) {
      const state = closeCamera(yaw);
      const reach = 180;
      const area = propArea(state, PHONE, reach);
      for (const p of area.polygon) {
        expect(Math.hypot(p.x - state.targetX, p.z - state.targetZ)).toBeLessThanOrEqual(reach * 1.01);
      }
      // 목표점(화면 가운데)은 안
      expect(insideDistance(area.polygon, state.targetX, state.targetZ)).toBeGreaterThan(0);
      // 목표점에서 카메라 쪽으로 150m(화면 아래 끝 너머)는 밖
      const behind = { x: state.targetX + Math.sin(yaw) * 150, z: state.targetZ + Math.cos(yaw) * 150 };
      expect(insideDistance(area.polygon, behind.x, behind.z)).toBeLessThan(0);
      // 화면 오른쪽으로 120m(화면 폭 약 40~80m 밖)는 밖
      const side = { x: state.targetX + Math.cos(yaw) * 120, z: state.targetZ - Math.sin(yaw) * 120 };
      expect(insideDistance(area.polygon, side.x, side.z)).toBeLessThan(0);
      // 기준 점(보는 사람 쪽)은 화면 아래 가운데 땅
      const bottom = groundUnder(state, PHONE, { x: PHONE.width / 2, y: PHONE.height });
      expect(area.nearX).toBeCloseTo(bottom?.x ?? Number.NaN, 6);
    }
  });

  it("같은 가시거리면 전 방식(목표 둘레 원 60m)보다 앞쪽을 훨씬 멀리 덮는다", () => {
    const state = closeCamera();
    const area = propArea(state, PHONE, 250);
    const farthest = Math.max(...area.polygon.map((p) => state.targetZ - p.z));
    expect(farthest).toBeGreaterThan(240);
  });
});
