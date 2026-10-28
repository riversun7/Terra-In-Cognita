import { describe, expect, it } from "vitest";
import { FACE_EDGE_LINKS, FACE_EDGES, FACES, wrapFaceIJ } from "./faces.ts";
import { sharedCorners } from "./testOracle.ts";

// 면 경계는 격자에서 가장 까다로운 부분이라(ADR 결과) 변환표를 기하 기준으로 전수 검사한다.
const LEVELS = [0, 1, 2, 3, 4, 5, 6];

/** 가장자리 바로 안쪽 칸에서 한 칸 밖(깊이 depth)으로 나간 좌표 */
function outside(edge: string, n: number, along: number, depth: number): [number, number] {
  switch (edge) {
    case "iMinus":
      return [-1 - depth, along];
    case "iPlus":
      return [n + depth, along];
    case "jMinus":
      return [along, -1 - depth];
    default:
      return [along, n + depth];
  }
}

/** 가장자리 바로 안쪽 칸 */
function inside(edge: string, n: number, along: number): [number, number] {
  switch (edge) {
    case "iMinus":
      return [0, along];
    case "iPlus":
      return [n - 1, along];
    case "jMinus":
      return [along, 0];
    default:
      return [along, n - 1];
  }
}

describe("면 가장자리 변환표", () => {
  it("모든 연결은 되돌아가는 연결과 짝을 이룬다", () => {
    for (const face of FACES) {
      for (const edge of FACE_EDGES) {
        const link = FACE_EDGE_LINKS[face][edge];
        const back = FACE_EDGE_LINKS[link.face][link.edge];
        expect({ face: back.face, edge: back.edge, reversed: back.reversed }).toEqual({
          face,
          edge,
          reversed: link.reversed,
        });
      }
    }
  });

  it("각 면은 서로 다른 네 면과 맞닿고, 자기 자신·반대쪽 면과는 닿지 않는다", () => {
    for (const face of FACES) {
      const neighbors = FACE_EDGES.map((edge) => FACE_EDGE_LINKS[face][edge].face);
      expect(new Set(neighbors).size).toBe(4);
      expect(neighbors).not.toContain(face);
      expect(neighbors).not.toContain((face + 3) % 6);
    }
  });

  it("손으로 푼 예: S2 면 배치에서 가장자리를 넘으면 이 칸이 된다", () => {
    const n = 8; // 레벨 3
    // 면 0(+x)의 i+ 가장자리 → 면 1(+y)의 i- 가장자리, 방향 그대로
    expect(wrapFaceIJ(0, 3, n, 5)).toEqual({ face: 1, i: 0, j: 5 });
    // 면 0의 i- 가장자리 → 면 4(-y)의 j+ 가장자리, 방향 뒤집힘
    expect(wrapFaceIJ(0, 3, -1, 2)).toEqual({ face: 4, i: n - 1 - 2, j: n - 1 });
    // 면 1의 j- 가장자리 → 면 5(-z)의 i+ 가장자리, 방향 뒤집힘
    expect(wrapFaceIJ(1, 3, 6, -1)).toEqual({ face: 5, i: n - 1, j: n - 1 - 6 });
    // 면 3(-x)의 j+ 가장자리 → 면 4의 j- 가장자리, 방향 그대로
    expect(wrapFaceIJ(3, 3, 4, n)).toEqual({ face: 4, i: 4, j: 0 });
  });

  it("가장자리를 한 칸 넘으면 그 칸과 변을 공유하는 이웃 면의 칸이 된다 (레벨 0~6, 전수)", () => {
    for (const level of LEVELS) {
      const n = 2 ** level;
      for (const face of FACES) {
        for (const edge of FACE_EDGES) {
          for (let along = 0; along < n; along++) {
            const [si, sj] = inside(edge, n, along);
            const [oi, oj] = outside(edge, n, along, 0);
            const target = wrapFaceIJ(face, level, oi, oj);
            expect(target, `${level}/${face}/${edge}/${along}`).not.toBeNull();
            if (!target) continue;
            expect(target.face).toBe(FACE_EDGE_LINKS[face][edge].face);
            expect(
              sharedCorners(level, { face, i: si, j: sj }, target),
              `${level}/${face}/${edge}/${along}`,
            ).toBe(2);
          }
        }
      }
    }
  });

  it("가장자리 너머 d번째 줄은 이웃 면 가장자리에서 안쪽으로 d번째 줄이다", () => {
    for (const level of [1, 2, 3, 4]) {
      const n = 2 ** level;
      for (const face of FACES) {
        for (const edge of FACE_EDGES) {
          for (let along = 0; along < n; along++) {
            const row = Array.from({ length: n }, (_, depth) => {
              const [oi, oj] = outside(edge, n, along, depth);
              return wrapFaceIJ(face, level, oi, oj);
            });
            // 모두 같은 이웃 면, 한 줄(같은 i 또는 같은 j), 서로 다른 칸
            const cells = row.filter((cell) => cell !== null);
            expect(cells).toHaveLength(n);
            expect(new Set(cells.map((cell) => cell.face)).size).toBe(1);
            const sameI = cells.every((cell) => cell.i === cells[0]?.i);
            const sameJ = cells.every((cell) => cell.j === cells[0]?.j);
            expect(sameI || sameJ).toBe(true);
            // 이웃한 깊이끼리는 변을 공유한다 (펼친 면에서 곧게 이어진다)
            for (let depth = 1; depth < n; depth++) {
              const previous = cells[depth - 1];
              const current = cells[depth];
              if (!previous || !current) throw new Error("missing cell");
              expect(sharedCorners(level, previous, current)).toBe(2);
            }
          }
        }
      }
    }
  });

  it("면 안쪽 좌표는 그대로 돌려준다", () => {
    expect(wrapFaceIJ(2, 4, 3, 15)).toEqual({ face: 2, i: 3, j: 15 });
    expect(wrapFaceIJ(5, 0, 0, 0)).toEqual({ face: 5, i: 0, j: 0 });
  });

  it("두 축이 모두 면을 벗어나면(꼭짓점 쪽) 펼치는 방법이 하나가 아니므로 null", () => {
    expect(wrapFaceIJ(0, 3, -1, -1)).toBeNull();
    expect(wrapFaceIJ(0, 3, 8, 8)).toBeNull();
    expect(wrapFaceIJ(4, 3, -1, 8)).toBeNull();
  });

  it("한 면 폭보다 멀리 벗어나거나 정수가 아니면 거부한다", () => {
    expect(() => wrapFaceIJ(0, 3, 16, 0)).toThrow(RangeError);
    expect(() => wrapFaceIJ(0, 3, -9, 0)).toThrow(RangeError);
    expect(() => wrapFaceIJ(0, 3, 1.5, 0)).toThrow(RangeError);
    expect(() => wrapFaceIJ(0, 23, 0, 0)).toThrow(RangeError);
  });
});
