// 옆 2차맵으로 넘기 계산 시험(docs/adr/2026-11-08-seamless-second-map.md WP-3)
import { describe, expect, it } from "vitest";
import type { CameraState } from "../camera/cameraMath.ts";
import type { NeighbourPlacement } from "./neighbourTerrains.ts";
import { cameraThroughPlacement, composePlacement, invertPlacement } from "./rebase.ts";

const IDENTITY: NeighbourPlacement = { a: 1, b: 0, cc: 0, d: 1, tx: 0, tz: 0 };
/** 동쪽 이웃(같은 틀) */
const EAST: NeighbourPlacement = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
/** 면 경계 너머 90° 돌아간 이웃 */
const TURNED: NeighbourPlacement = { a: 0, b: -1, cc: 1, d: 0, tx: 128, tz: 128 };

const apply = (p: NeighbourPlacement, x: number, z: number) => ({
  x: p.a * x + p.b * z + p.tx,
  z: p.cc * x + p.d * z + p.tz,
});

describe("놓는 자리 역·이어 놓기", () => {
  it("역을 이어 놓으면 제자리", () => {
    for (const p of [EAST, TURNED]) {
      expect(composePlacement(p, invertPlacement(p))).toEqual(IDENTITY);
      expect(composePlacement(invertPlacement(p), p)).toEqual(IDENTITY);
    }
  });

  it("이어 놓기 = 차례로 놓기", () => {
    const point = { x: 17, z: 40 };
    const inner = apply(TURNED, point.x, point.z);
    expect(apply(composePlacement(EAST, TURNED), point.x, point.z)).toEqual(apply(EAST, inner.x, inner.z));
  });
});

describe("카메라 옮기기", () => {
  const camera: CameraState = { targetX: 1500, targetY: 3, targetZ: 300, yaw: 0.3, pitch: 0.8, distance: 70 };

  it("동쪽 이웃으로 넘으면 목표점이 한 맵만큼 왼쪽으로, 방위는 그대로", () => {
    const next = cameraThroughPlacement(camera, invertPlacement(EAST), 11.72);
    expect(next.targetX).toBeCloseTo(1500 - 128 * 11.72, 6);
    expect(next.targetZ).toBeCloseTo(300, 6);
    expect(next.yaw).toBeCloseTo(0.3, 9);
    expect(next.pitch).toBe(camera.pitch);
    expect(next.distance).toBe(camera.distance);
  });

  it("돌아간 이웃: 갔다 오면 제자리, 방위도 돌아온다", () => {
    const there = cameraThroughPlacement(camera, invertPlacement(TURNED), 11.72);
    expect(Math.abs(there.yaw - camera.yaw)).toBeGreaterThan(0.1);
    const back = cameraThroughPlacement(there, TURNED, 11.72);
    expect(back.targetX).toBeCloseTo(camera.targetX, 6);
    expect(back.targetZ).toBeCloseTo(camera.targetZ, 6);
    expect(back.yaw).toBeCloseTo(camera.yaw, 9);
  });
});
