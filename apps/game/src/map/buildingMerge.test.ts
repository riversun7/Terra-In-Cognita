// 옆 2차맵 건물을 지금 2차맵 틀로(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)")
import type { BuildingFootprint, NeighbourPlacement } from "@terra/engine";
import { describe, expect, it } from "vitest";
import { createBuildingMerger, footprintThroughPlacement } from "./buildingMerge.ts";

const EAST: NeighbourPlacement = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
/** 90° 돌아간 이웃: 이웃 (x, y) → 지금 (−y + 512, x) (배치 칸) */
const TURNED: NeighbourPlacement = { a: 0, b: -1, cc: 1, d: 0, tx: 256, tz: 0 };
const building = (id: number, over: Partial<BuildingFootprint> = {}): BuildingFootprint => ({
  id,
  cellX: 10,
  cellY: 20,
  width: 4,
  depth: 2,
  rotation: 0,
  heightM: 6,
  ...over,
});

describe("footprintThroughPlacement", () => {
  it("돌림 없는 이웃: 한 변(256칸)만큼 옮기고 회전은 그대로", () => {
    expect(footprintThroughPlacement(building(1), EAST)).toMatchObject({
      cellX: 266,
      cellY: 20,
      width: 4,
      depth: 2,
      rotation: 0,
    });
  });

  it("90° 돌아간 이웃: 차지한 네모를 돌려 새 기준 칸(왼쪽 위)을 잡고 회전을 한 칸 돌린다", () => {
    // 이웃 틀에서 x 10~14, y 20~22(가로 4 × 세로 2) → 지금 틀에서 x 490~492, y 10~14(가로 2 × 세로 4)
    const moved = footprintThroughPlacement(building(1), TURNED);
    expect(moved).toMatchObject({ cellX: 490, cellY: 10, width: 4, depth: 2 });
    // 앞면 남쪽 (0, 1) → (−1, 0) = 서쪽(1). 홀수 회전이라 차지한 칸은 가로 2 × 세로 4
    expect(moved.rotation).toBe(1);
  });

  it("이미 돌린 건물(홀수 회전)도 차지한 네모로 옮긴다", () => {
    // 회전 1: 차지한 칸 가로 2 × 세로 4 → x 10~12, y 20~24 → 지금 틀 x 488~492, y 10~12
    const moved = footprintThroughPlacement(building(1, { rotation: 1 }), TURNED);
    expect(moved).toMatchObject({ cellX: 488, cellY: 10, rotation: 2 });
  });
});

describe("createBuildingMerger", () => {
  it("지금 2차맵 건물 뒤에 옆 2차맵 건물을 붙이고, 같은 ID는 지금 2차맵 것만, 지우면 뺀다", () => {
    const pushes: number[][] = [];
    const merger = createBuildingMerger((list) => pushes.push(list.map((item) => item.cellX)));
    merger.setMain([building(1)]);
    merger.setNeighbour(9, EAST, [building(2), building(1)]);
    expect(pushes.at(-1)).toEqual([10, 266]);
    merger.setMain([building(1, { cellX: 30 })]);
    expect(pushes.at(-1)).toEqual([30, 266]);
    merger.clearNeighbour(9);
    expect(pushes.at(-1)).toEqual([30]);
    // 없는 이웃을 지우거나 빈 목록을 처음 넣어도 다시 넣지 않는다
    const count = pushes.length;
    merger.clearNeighbour(9);
    merger.setNeighbour(7, EAST, []);
    expect(pushes.length).toBe(count);
  });
});
