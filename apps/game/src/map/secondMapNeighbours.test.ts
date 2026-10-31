// 이웃 2차맵 놓기: 면 안은 옮김만, 면 경계 너머는 돌림 + 옮김이 경계 칸 짝(stepMapCell)과 칸마다 맞는다, 대각·정육면체 꼭짓점
import { cellKey } from "@terra/planet";
import { stepMapCell } from "@terra/planet/secondMap";
import { describe, expect, it } from "vitest";
import {
  type NeighbourSpot,
  neighbourSpots,
  neighbourTerrainUrl,
  terrainVersionOf,
  viewMap,
  wantedDirections,
  wantsAllNeighbours,
} from "./secondMapNeighbours.ts";

const LEVEL = 9;
const LAST = 255;

/** 이웃 배치 칸 가운데 → 지금 2차맵 배치 칸 좌표(놓는 자리는 지형 칸 단위라 배치 칸 = 2배) */
function place(spot: NeighbourSpot, bx: number, by: number): [number, number] {
  const { a, b, cc, d, tx, tz } = spot.placement;
  const c = (bx + 0.5) / 2;
  const r = (by + 0.5) / 2;
  return [(a * c + b * r + tx) * 2 - 0.5, (cc * c + d * r + tz) * 2 - 0.5];
}

/** 변 너머 이웃이 경계 칸 짝과 칸마다 맞는가(256칸) */
function checkEdge(mapKey: number, spot: NeighbourSpot): void {
  for (let k = 0; k <= LAST; k++) {
    const x = spot.ox > 0 ? LAST : spot.ox < 0 ? 0 : k;
    const y = spot.oy > 0 ? LAST : spot.oy < 0 ? 0 : k;
    const step = stepMapCell(mapKey, 8, x, y, spot.ox, spot.oy);
    if (!step) throw new Error("edge step missing");
    expect(step.mapKey).toBe(spot.key);
    expect(place(spot, step.x, step.y)).toEqual([x + spot.ox, y + spot.oy]);
  }
}

describe("이웃 2차맵 놓기", () => {
  it("면 안: 8장, 돌림 없이 2차맵 한 변(128칸)씩 옮긴다", () => {
    const key = cellKey(0, LEVEL, 282, 328);
    const spots = neighbourSpots(key);
    expect(spots).toHaveLength(8);
    for (const spot of spots) {
      expect(spot.placement).toMatchObject({ a: 1, b: 0, cc: 0, d: 1, tx: spot.ox * 128, tz: spot.oy * 128 });
    }
  });

  it("면 경계 너머(돌아간 틀 포함): 변 이웃이 경계 칸 짝과 칸마다 맞는다", () => {
    let turned = 0;
    for (const face of [0, 1, 2, 3, 4, 5] as const) {
      for (const [i, j] of [
        [0, 200],
        [511, 200],
        [200, 0],
        [200, 511],
      ] as const) {
        const key = cellKey(face, LEVEL, i, j);
        const spots = neighbourSpots(key);
        expect(spots).toHaveLength(8);
        for (const spot of spots.filter((s) => s.ox === 0 || s.oy === 0)) {
          checkEdge(key, spot);
          if (spot.placement.a !== 1) turned += 1;
        }
      }
    }
    // 돌아간 이웃이 실제로 있다(시험이 돌림을 거친다)
    expect(turned).toBeGreaterThan(0);
  });

  it("대각 이웃: 모서리 칸에서 대각선 한 걸음이 놓은 자리와 맞는다(면 경계 너머 포함)", () => {
    for (const key of [cellKey(0, LEVEL, 282, 328), cellKey(0, LEVEL, 511, 300), cellKey(2, LEVEL, 0, 100)]) {
      for (const spot of neighbourSpots(key).filter((s) => s.ox !== 0 && s.oy !== 0)) {
        const x = spot.ox > 0 ? LAST : 0;
        const y = spot.oy > 0 ? LAST : 0;
        const step = stepMapCell(key, 8, x, y, spot.ox, spot.oy);
        if (!step) continue;
        expect(step.mapKey).toBe(spot.key);
        expect(place(spot, step.x, step.y)).toEqual([x + spot.ox, y + spot.oy]);
      }
    }
  });

  it("정육면체 꼭짓점 칸은 대각선 하나가 없어 7장", () => {
    expect(neighbourSpots(cellKey(0, LEVEL, 0, 0))).toHaveLength(7);
    expect(neighbourSpots(12.5)).toEqual([]);
  });
});

describe("이웃 받기", () => {
  it("판 표지를 그대로 써서 이웃 주소를 만든다", () => {
    const main = "/api/maps/312905547382793/terrain?v=1.3.e04dd3cb.5965ff81";
    expect(terrainVersionOf(main)).toBe("1.3.e04dd3cb.5965ff81");
    expect(neighbourTerrainUrl(main, 42)).toBe("/api/maps/42/terrain?v=1.3.e04dd3cb.5965ff81");
    expect(neighbourTerrainUrl("/api/maps/1/terrain", 42)).toBeNull();
  });

  it("경계 가까이·너머 쪽만, 모서리면 대각까지. 목표점이 있는 2차맵 표지", () => {
    expect(wantedDirections(750, 750, 1500)).toEqual([]);
    expect(wantedDirections(1450, 750, 1500)).toEqual(["1,0"]);
    expect(wantedDirections(-10, 1490, 1500).toSorted()).toEqual(["-1,0", "-1,1", "0,1"]);
    expect(viewMap(1600, 20, 1500)).toBe("1,0");
    expect(viewMap(700, -5, 1500)).toBe("0,-1");
    expect(wantsAllNeighbours("?second-map-neighbours=all&x=1")).toBe(true);
    expect(wantsAllNeighbours("?second-map-neighbours=some")).toBe(false);
  });
});
