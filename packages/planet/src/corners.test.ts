import { describe, expect, it } from "vitest";
import { cellKey, decodeCellKey } from "./cellKey.ts";
import { CUBE_CORNERS, type CubeCornerId, cubeCornerCells, cubeCornersOfCell } from "./corners.ts";
import { FACES } from "./faces.ts";
import { MAX_LEVEL } from "./levels.ts";
import { neighbors4, neighbors8 } from "./neighbors.ts";
import { allCells, cellName, cornerPoints, gridPoint, sharedCorners } from "./testOracle.ts";

/** 독립 기준: 꼭짓점의 정수 3D 좌표 ([-n, n]³ 정육면체) */
function cornerPoint(id: number, level: number): string {
  const n = 2 ** level;
  const corner = CUBE_CORNERS[id];
  if (!corner) throw new Error("corner");
  return corner.axisSigns.map((sign) => sign * n).join(",");
}

describe("정육면체 꼭짓점 8곳", () => {
  it("꼭짓점 8개는 축 부호가 모두 다르고, 각각 서로 다른 면 3개가 만나며, 면마다 꼭짓점이 4개다", () => {
    expect(CUBE_CORNERS).toHaveLength(8);
    expect(new Set(CUBE_CORNERS.map((c) => c.axisSigns.join(","))).size).toBe(8);
    CUBE_CORNERS.forEach((corner, index) => {
      expect(corner.id).toBe(index);
      expect(new Set(corner.faces.map((f) => f.face)).size).toBe(3);
    });
    for (const face of FACES) {
      const count = CUBE_CORNERS.filter((c) => c.faces.some((f) => f.face === face)).length;
      expect(count).toBe(4);
    }
  });

  it("꼭짓점 ID는 축 부호 비트다: x > 0 → 1, y > 0 → 2, z > 0 → 4", () => {
    expect(CUBE_CORNERS[0]?.axisSigns).toEqual([-1, -1, -1]);
    expect(CUBE_CORNERS[1]?.axisSigns).toEqual([1, -1, -1]);
    expect(CUBE_CORNERS[6]?.axisSigns).toEqual([-1, 1, 1]);
    expect(CUBE_CORNERS[7]?.axisSigns).toEqual([1, 1, 1]);
  });

  it("면별 위치 (u, v)는 그 면에서 꼭짓점이 있는 모서리다 (기하 기준)", () => {
    for (const level of [0, 1, 3]) {
      const n = 2 ** level;
      for (const corner of CUBE_CORNERS) {
        for (const { face, u, v } of corner.faces) {
          const p = u > 0 ? n : 0;
          const q = v > 0 ? n : 0;
          expect(gridPoint(face, level, p, q)).toBe(cornerPoint(corner.id, level));
        }
      }
    }
  });

  it("꼭짓점 칸 3개 = 그 꼭짓점에 닿은 칸 전부 (레벨 0~6, 기하 기준 전수)", () => {
    for (const level of [0, 1, 2, 3, 4, 5, 6]) {
      for (const corner of CUBE_CORNERS) {
        const point = cornerPoint(corner.id, level);
        const touching = allCells(level)
          .filter((cell) => cornerPoints(cell.face, level, cell.i, cell.j).includes(point))
          .map(cellName)
          .toSorted();
        const cells = cubeCornerCells(corner.id, level)
          .map((key) => cellName(decodeCellKey(key)))
          .toSorted();
        expect(cells, `level ${level}, corner ${corner.id}`).toEqual(touching);
        expect(cells).toHaveLength(3);
      }
    }
  });

  it("꼭짓점 칸 3개는 서로 변을 공유하고 8이웃이 7칸이다 (레벨 1~6, 22)", () => {
    for (const level of [1, 2, 3, 4, 5, 6, MAX_LEVEL]) {
      for (const corner of CUBE_CORNERS) {
        const cells = cubeCornerCells(corner.id, level);
        for (const a of cells) {
          expect(neighbors8(a)).toHaveLength(7);
          for (const b of cells) {
            if (a === b) continue;
            expect(neighbors4(a)).toContain(b);
            expect(sharedCorners(level, decodeCellKey(a), decodeCellKey(b))).toBe(2);
          }
        }
      }
    }
  });

  it("칸이 닿은 꼭짓점: 레벨 1 이상은 꼭짓점 칸만 하나, 레벨 0(면)은 4개 (레벨 0~5 전수)", () => {
    for (const level of [0, 1, 2, 3, 4, 5]) {
      const expected = new Map<string, CubeCornerId[]>();
      for (const corner of CUBE_CORNERS) {
        for (const key of cubeCornerCells(corner.id, level)) {
          const name = cellName(decodeCellKey(key));
          expected.set(
            name,
            [...(expected.get(name) ?? []), corner.id].toSorted((a, b) => a - b),
          );
        }
      }
      for (const cell of allCells(level)) {
        const found = cubeCornersOfCell(cellKey(cell.face, level, cell.i, cell.j));
        expect(found, `${level} ${cellName(cell)}`).toEqual(expected.get(cellName(cell)) ?? []);
      }
    }
    expect(cubeCornersOfCell(cellKey(0, 0, 0, 0))).toEqual([1, 3, 5, 7]);
  });

  it("없는 꼭짓점 번호는 거부한다", () => {
    // @ts-expect-error 꼭짓점 번호는 0~7
    expect(() => cubeCornerCells(8, 3)).toThrow(RangeError);
  });
});
