// 시야 칸·경로 자르기 시험
import { describe, expect, it } from "vitest";
import { arrivalAt, createMotion, positionAt } from "../motion/motion.ts";
import {
  VISION_BYTES,
  VISION_CELLS,
  VISION_SIDE,
  addCoverBits,
  hasBit,
  stampVision,
  truncateMotion,
  visibleUntil,
  visionCellOf,
  visionRadius,
} from "./vision.ts";

const CELL = 1024;
/** 시야 칸 x가 limitCell보다 작은 칸만 덮였다 */
const coveredBelowX = (limitCell: number) => (cell: number) => cell % 32 < limitCell;
const at = (cx: number, cy: number) => ({ x: cx * CELL + 512, y: cy * CELL + 512 });

describe("시야 칸", () => {
  it("배치 칸 8×8이 시야 칸 하나, 밖은 가장자리로", () => {
    expect(VISION_SIDE).toBe(32);
    expect(VISION_BYTES).toBe(128);
    expect(visionCellOf(at(0, 0))).toBe(0);
    expect(visionCellOf(at(9, 17))).toBe(2 * 32 + 1);
    expect(visionCellOf({ x: -5, y: 1e9 })).toBe(31 * 32);
    expect(visionRadius(24)).toBe(3);
    expect(visionRadius(16)).toBe(2);
  });

  it("반지름 3: dx² + dy² ≤ 12인 칸, 가장자리에서는 잘린다, 비트 모음에 더한다", () => {
    const cover = new Uint16Array(VISION_CELLS);
    stampVision(cover, 10 * 32 + 10, 3);
    expect(cover.reduce((sum, v) => sum + v, 0)).toBe(37);
    expect(cover[10 * 32 + 13]).toBe(1);
    expect(cover[13 * 32 + 13]).toBe(0);
    const edge = new Uint16Array(VISION_CELLS);
    stampVision(edge, 0, 3);
    expect(edge.reduce((sum, v) => sum + v, 0)).toBe(13);
    const bits = new Uint8Array(VISION_BYTES);
    expect(addCoverBits(bits, cover)).toBe(true);
    expect(addCoverBits(bits, cover)).toBe(false);
    expect(hasBit(bits, 10 * 32 + 10)).toBe(true);
    expect(hasBit(bits, 0)).toBe(false);
  });
});

describe("경로 자르기", () => {
  // 오른쪽으로 100칸 가는 차(약 4.7칸/초 → 약 21초)
  const motion = createMotion({
    waypoints: [at(10, 10), at(60, 10), at(60, 60)],
    departAtMs: 1_000,
    speed: 4813,
  });

  it("덮인 칸을 벗어나기 전 마지막 시각, horizon까지, 처음부터 안 보이면 undefined", () => {
    const until = visibleUntil(motion, 1_000, coveredBelowX(4), 8_000, 250);
    expect(until).toBeDefined();
    const end = until ?? 0;
    expect(visionCellOf(positionAt(motion, end)) % 32).toBeLessThan(4);
    expect(visionCellOf(positionAt(motion, end + 250)) % 32).toBeGreaterThanOrEqual(4);
    expect(visibleUntil(motion, 1_000, () => true, 8_000, 250)).toBe(9_000);
    expect(visibleUntil(motion, 1_000, () => false, 8_000, 250)).toBeUndefined();
    expect(visibleUntil(motion, arrivalAt(motion) + 5, () => true, 8_000, 250)).toBe(arrivalAt(motion) + 5);
  });

  it("자른 움직임: 시작·끝 위치가 원래 경로의 그 시각 위치, 그 뒤 꺾이는 점은 없다", () => {
    const cut = truncateMotion(motion, 3_000, 15_000);
    expect(cut.waypoints[0]).toEqual(positionAt(motion, 3_000));
    expect(cut.waypoints.at(-1)).toEqual(positionAt(motion, 15_000));
    expect(cut.waypoints).toContainEqual(at(60, 10));
    expect(cut.waypoints).not.toContainEqual(at(60, 60));
    expect(Math.abs(arrivalAt(cut) - 15_000)).toBeLessThanOrEqual(2);
  });
});
