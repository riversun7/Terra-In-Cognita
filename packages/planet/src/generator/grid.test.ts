// 생성기 격자 시험 — 칸 번호·8이웃·중심·면적이 @terra/planet 공개 API(셀 키 기준)와 같은지 (레벨 4·5 전수)
import { describe, expect, it } from "vitest";
import { cellKey, decodeCellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { neighbors8 as keyNeighbors8 } from "../neighbors.ts";
import { cellAreaSteradians, cellCenter } from "../projection.ts";
import { areaOf, buildGrid, neighbors8 } from "./grid.ts";

describe("생성기 격자", () => {
  for (const level of [4, 5]) {
    it(`레벨 ${level}: 칸 번호 = 면 × n² + j × n + i, 8이웃·중심·면적이 셀 키 API와 같다`, () => {
      const grid = buildGrid(level);
      const n = 2 ** level;
      const out = new Int32Array(8);
      const problems: string[] = [];
      let total = 0;
      for (let c = 0; c < grid.cellCount; c++) {
        const face = FACES[Math.floor(c / (n * n))] ?? 0;
        const i = c % n;
        const j = Math.floor(c / n) % n;
        const key = cellKey(face, level, i, j);
        neighbors8(grid, c, out);
        const mine = [...out].filter((value) => value >= 0);
        const expected = keyNeighbors8(key).map((other) => {
          const cell = decodeCellKey(other);
          return cell.face * n * n + cell.j * n + cell.i;
        });
        if (mine.join() !== expected.join()) problems.push(`neighbors ${c}`);
        const [cx, cy, cz] = cellCenter(key);
        if (
          Math.abs((grid.x[c] ?? 0) - cx) +
            Math.abs((grid.y[c] ?? 0) - cy) +
            Math.abs((grid.z[c] ?? 0) - cz) >
          1e-15
        ) {
          problems.push(`center ${c}`);
        }
        if (Math.abs(areaOf(grid, c) - cellAreaSteradians(key)) > 1e-15) problems.push(`area ${c}`);
        total += areaOf(grid, c);
      }
      expect(problems.slice(0, 5)).toEqual([]);
      expect(total).toBeCloseTo(4 * Math.PI, 10);
    });
  }
});
