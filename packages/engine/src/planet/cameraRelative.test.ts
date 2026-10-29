import { averageCellEdgeMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import {
  type ViewRotation,
  cameraRelative,
  eyeCameraRelative32,
  eyeExact,
  eyeWorld32,
} from "./cameraRelative.ts";
import { globeLimits, globePose, initialGlobe } from "./globeCamera.ts";
import { EARTH_RADIUS_M, makeTile } from "./testSupport.ts";
import { buildTileMesh } from "./tileMesh.ts";
import { directionToFaceST } from "./tileShape.ts";
import { nodeAt, tileRequestOf } from "./tileTree.ts";
import { type Vec3, length, sub } from "./vec3.ts";

const R = EARTH_RADIUS_M;

describe("카메라 기준 좌표 — 가까이서 32비트 떨림 없음(수치 시험)", () => {
  // 가장 가까운 거리(약 12km, 기울기 40°)에서 목표점이 든 맵 레벨 9 타일의 꼭짓점들
  const viewport = { width: 390, height: 844 };
  const limits = globeLimits(R, averageCellEdgeMeters(9, R), viewport);
  const state = initialGlobe(37.5, 127, limits.minDistance, limits);
  const pose = globePose(state, R, limits);
  const rotation: ViewRotation = [pose.right, pose.up, pose.back];
  const { face, s, t } = directionToFaceST(state.target);
  const request = tileRequestOf(nodeAt(face, s, t, 9));
  const mesh = buildTileMesh(makeTile(request.face, 9, request.i0, request.j0, request.size), R);
  const vertices = mesh.positions.length / 3;

  /** 가장 큰 꼭짓점 오차(m)와 화면 오차(CSS px = 오차 ÷ 깊이 × 화면 계수) */
  const errors = (kind: "relative" | "world"): { metres: number; pixels: number } => {
    const pixelsPerRadian = viewport.height / (2 * Math.tan((40 * Math.PI) / 360));
    let metres = 0;
    let pixels = 0;
    for (let v = 0; v < vertices; v += 7) {
      const offset: Vec3 = [
        mesh.positions[v * 3] ?? 0,
        mesh.positions[v * 3 + 1] ?? 0,
        mesh.positions[v * 3 + 2] ?? 0,
      ];
      // 기준: 원점 + (이미 32비트인) 위치를 실수 64비트로 계산한 카메라 공간 좌표
      const worldPoint: Vec3 = [
        mesh.origin[0] + offset[0],
        mesh.origin[1] + offset[1],
        mesh.origin[2] + offset[2],
      ];
      const exact = eyeExact(rotation, pose.position, worldPoint);
      const got =
        kind === "relative"
          ? eyeCameraRelative32(rotation, pose.position, mesh.origin, offset)
          : eyeWorld32(rotation, pose.position, worldPoint);
      const error = length(sub(got, exact));
      metres = Math.max(metres, error);
      // 화면 오차는 카메라 앞(깊이 100m 넘게)에 있는 꼭짓점만 본다
      if (-exact[2] > 100) pixels = Math.max(pixels, (error / -exact[2]) * pixelsPerRadian);
    }
    return { metres, pixels };
  };

  it("이 엔진의 방식: 꼭짓점 오차 5mm 아래, 화면에서 0.01px 아래", () => {
    const { metres, pixels } = errors("relative");
    expect(metres).toBeLessThan(0.005);
    expect(pixels).toBeLessThan(0.01);
  });

  it("세계 좌표를 32비트로 보내는 흔한 방식은 cm 단위로 틀린다(이 방식의 10배 넘게)", () => {
    const world = errors("world");
    const ours = errors("relative");
    expect(world.metres).toBeGreaterThan(0.02);
    expect(world.metres).toBeGreaterThan(10 * ours.metres);
    expect(world.pixels).toBeGreaterThan(5 * ours.pixels);
  });

  it("카메라가 1cm 움직이면 이 방식의 화면 좌표도 1cm만큼만 움직인다(계단 없음)", () => {
    const offset: Vec3 = [
      mesh.positions[33 * 16 * 3] ?? 0,
      mesh.positions[33 * 16 * 3 + 1] ?? 0,
      mesh.positions[33 * 16 * 3 + 2] ?? 0,
    ];
    const before = eyeCameraRelative32(rotation, pose.position, mesh.origin, offset);
    const moved: Vec3 = [
      pose.position[0] + 0.01 * pose.right[0],
      pose.position[1] + 0.01 * pose.right[1],
      pose.position[2] + 0.01 * pose.right[2],
    ];
    const after = eyeCameraRelative32(rotation, moved, mesh.origin, offset);
    // 카메라 공간 값은 수 km라 32비트 단위가 1mm 안팎이다 → 1cm 움직임이 ±5mm 안에서 보인다
    expect(before[0] - after[0]).toBeCloseTo(0.01, 2);
  });

  it("원점 − 카메라는 실수 64비트로 뺀다", () => {
    expect(cameraRelative([R, 1, 2], [R - 3, 1, 2])).toEqual([3, 0, 0]);
  });
});
