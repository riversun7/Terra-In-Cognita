// 옆 2차맵 땅 누르기 → 옆 2차맵 칸(docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜")
import { describe, expect, it } from "vitest";
import { crossedNeighbour, neighbourCellAt } from "./neighbourTap.ts";
import type { NeighbourSpot } from "./secondMapNeighbours.ts";

const EAST: NeighbourSpot = { key: 11, ox: 1, oy: 0, placement: { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 } };
/** 면 경계 너머 90° 돌아간 아래 이웃: 이웃 칸 (c, r) → (128 − r, c + 128) */
const BELOW: NeighbourSpot = {
  key: 22,
  ox: 0,
  oy: 1,
  placement: { a: 0, b: -1, cc: 1, d: 0, tx: 128, tz: 128 },
};

describe("옆 2차맵 땅 누르기", () => {
  it("지금 2차맵 안이면 없음", () => {
    expect(neighbourCellAt(1, { x: 100, y: 100 }, [EAST])).toBeNull();
  });

  it("동쪽 이웃: 한 변만큼 왼쪽으로 옮긴 칸", () => {
    expect(neighbourCellAt(1, { x: 260.4, y: 40.2 }, [EAST])).toEqual({ mapKey: 11, x: 4, y: 40 });
  });

  it("돌아간 이웃은 그 틀의 칸으로, 그쪽 이웃이 없으면 없음", () => {
    // 지금 틀 (100, 300) = 지형 칸 (50, 150) → 이웃 지형 칸 c = (150 − 128) = 22, r = −(50 − 128) = 78 → 배치 칸 (44, 156)
    expect(neighbourCellAt(1, { x: 100, y: 300 }, [BELOW])).toEqual({ mapKey: 22, x: 44, y: 156 });
    expect(neighbourCellAt(1, { x: -5, y: 10 }, [EAST, BELOW])).toBeNull();
  });

  it("넘기 신호: 변 바로 옆에서 사라졌으면 그 변 이웃, 멀었으면 없음", () => {
    expect(crossedNeighbour(1, { x: 254.6, y: 40 }, [EAST, BELOW])).toBe(11);
    expect(crossedNeighbour(1, { x: 100, y: 254 }, [EAST, BELOW])).toBe(22);
    expect(crossedNeighbour(1, { x: 200, y: 40 }, [EAST, BELOW])).toBeNull();
  });
});
