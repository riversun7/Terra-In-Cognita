import { describe, expect, it } from "vitest";
import { type CellKey, cellKey, decodeCellKey, isCellKey } from "./cellKey.ts";
import { FACES } from "./faces.ts";
import { MAX_LEVEL } from "./levels.ts";
import { neighbors4, neighbors8, stepCell } from "./neighbors.ts";
import { allCells, cellName, geometricNeighbors, sharedCorners } from "./testOracle.ts";

const LEVELS = [0, 1, 2, 3, 4, 5, 6];

function names(keys: readonly CellKey[]): Set<string> {
  return new Set(keys.map((key) => cellName(decodeCellKey(key))));
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

describe("이웃 (기하 기준과 전수 비교)", () => {
  it("4이웃 = 변을 공유하는 칸 전부, 8이웃 = 꼭짓점을 하나라도 공유하는 칸 전부 (레벨 0~6, 모든 칸)", () => {
    for (const level of LEVELS) {
      const oracle = geometricNeighbors(level);
      const mismatches: string[] = [];
      for (const cell of allCells(level)) {
        const key = cellKey(cell.face, level, cell.i, cell.j);
        const expected = oracle.get(cellName(cell));
        if (!expected) throw new Error("oracle");
        const four = neighbors4(key);
        const eight = neighbors8(key);
        if (four.length !== 4 || !sameSet(names(four), expected.edge)) mismatches.push(`4 ${cellName(cell)}`);
        if (eight.length !== expected.vertex.size || !sameSet(names(eight), expected.vertex)) {
          mismatches.push(`8 ${cellName(cell)}`);
        }
      }
      expect(mismatches.slice(0, 10), `level ${level}`).toEqual([]);
    }
  });

  it("이웃 관계는 대칭이다 (레벨 0~6, 모든 칸)", () => {
    for (const level of LEVELS) {
      const broken: string[] = [];
      for (const cell of allCells(level)) {
        const key = cellKey(cell.face, level, cell.i, cell.j);
        for (const other of neighbors8(key)) {
          if (!neighbors8(other).includes(key)) broken.push(`${key} → ${other}`);
        }
        for (const other of neighbors4(key)) {
          if (!neighbors4(other).includes(key)) broken.push(`4: ${key} → ${other}`);
        }
      }
      expect(broken.slice(0, 10), `level ${level}`).toEqual([]);
    }
  });

  it("8이웃 수: 레벨 0은 4칸, 레벨 1 이상은 정육면체 꼭짓점에 닿은 칸만 7칸이고 나머지는 8칸", () => {
    for (const level of LEVELS) {
      const counts = new Map<number, number>();
      for (const cell of allCells(level)) {
        const size = neighbors8(cellKey(cell.face, level, cell.i, cell.j)).length;
        counts.set(size, (counts.get(size) ?? 0) + 1);
      }
      const total = 6 * 4 ** level;
      if (level === 0) expect(Object.fromEntries(counts)).toEqual({ 4: 6 });
      // 꼭짓점 8곳 × 칸 3개 = 24칸 (레벨 1은 모든 칸이 꼭짓점 칸)
      else if (level === 1) expect(Object.fromEntries(counts)).toEqual({ 7: 24 });
      else expect(Object.fromEntries(counts)).toEqual({ 7: 24, 8: total - 24 });
    }
  });

  it("4이웃 순서는 i-1, i+1, j-1, j+1 방향이다", () => {
    const key = cellKey(2, 4, 7, 9);
    expect(neighbors4(key)).toEqual([
      cellKey(2, 4, 6, 9),
      cellKey(2, 4, 8, 9),
      cellKey(2, 4, 7, 8),
      cellKey(2, 4, 7, 10),
    ]);
    expect(stepCell(key, 1, 1)).toBe(cellKey(2, 4, 8, 10));
  });

  it("꼭짓점 칸의 꼭짓점 쪽 대각선은 칸이 없다 (null)", () => {
    // 면 0의 (n-1, n-1) 칸은 꼭짓점 (+1, +1, +1)에 닿는다
    const corner = cellKey(0, 3, 7, 7);
    expect(stepCell(corner, 1, 1)).toBeNull();
    expect(stepCell(corner, 1, -1)).not.toBeNull();
    expect(stepCell(corner, -1, 1)).not.toBeNull();
    expect(() => stepCell(corner, 0, 0)).toThrow(RangeError);
    expect(() => stepCell(corner, 2, 0)).toThrow(RangeError);
  });

  it("최대 레벨 22의 면 경계·꼭짓점 칸도 이웃이 맞다 (공유 꼭짓점 수로 확인)", () => {
    const last = (1 << MAX_LEVEL) - 1;
    const problems: string[] = [];
    for (const face of FACES) {
      for (const i of [0, 1, 2, last - 2, last - 1, last]) {
        for (const j of [0, 1, last >> 1, last - 1, last]) {
          const key = cellKey(face, MAX_LEVEL, i, j);
          const self = decodeCellKey(key);
          const atCorner = (i === 0 || i === last) && (j === 0 || j === last);
          const eight = neighbors8(key);
          if (eight.length !== (atCorner ? 7 : 8) || new Set(eight).size !== eight.length) {
            problems.push(`count ${face}/${i}/${j}`);
          }
          for (const other of eight) {
            if (!isCellKey(other)) problems.push(`invalid ${Number(other)}`);
            const shared = sharedCorners(MAX_LEVEL, self, decodeCellKey(other));
            const isEdge = neighbors4(key).includes(other);
            if (shared !== (isEdge ? 2 : 1)) problems.push(`shared ${face}/${i}/${j} → ${other}`);
            if (!neighbors8(other).includes(key)) problems.push(`symmetry ${face}/${i}/${j}`);
          }
        }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
