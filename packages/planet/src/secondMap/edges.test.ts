import { describe, expect, it } from "vitest";
import { cellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { stepMapCell } from "./edges.ts";

describe("2차맵 경계 칸 짝", () => {
  it("2차맵 안 걸음은 같은 키, 좌표만 바뀐다(행이 커지면 아래)", () => {
    const key = cellKey(0, 9, 100, 100);
    expect(stepMapCell(key, 8, 10, 10, 1, 0)).toEqual({ mapKey: key, x: 11, y: 10 });
    expect(stepMapCell(key, 8, 10, 10, 0, 1)).toEqual({ mapKey: key, x: 10, y: 11 });
  });

  it("면 안 경계: 오른쪽 끝 → 이웃 i+1의 왼쪽 끝, 맨 위 줄 → 이웃 j+1의 맨 아래 줄", () => {
    const key = cellKey(0, 9, 100, 100);
    expect(stepMapCell(key, 8, 255, 40, 1, 0)).toEqual({ mapKey: cellKey(0, 9, 101, 100), x: 0, y: 40 });
    expect(stepMapCell(key, 8, 40, 0, 0, -1)).toEqual({ mapKey: cellKey(0, 9, 100, 101), x: 40, y: 255 });
  });

  it("모든 면 경계에서 되돌아오면 제자리다(A → B → A), 정육면체 꼭짓점 쪽 대각선은 없다", () => {
    const level = 4;
    const n = 2 ** level;
    let crossings = 0;
    for (const face of FACES) {
      for (const [i, j] of [
        [0, 5],
        [n - 1, 5],
        [5, 0],
        [5, n - 1],
      ] as const) {
        const key = cellKey(face, level, i, j);
        for (const size of [7, 8]) {
          const last = (1 << size) - 1;
          for (const [x, y, dx, dy] of [
            [0, 30, -1, 0],
            [last, 30, 1, 0],
            [30, 0, 0, -1],
            [30, last, 0, 1],
          ] as const) {
            const next = stepMapCell(key, size, x, y, dx, dy);
            if (!next) throw new Error("edge step must exist");
            if (next.mapKey === key) continue;
            crossings += 1;
            // 되돌아오는 걸음: 넘어간 2차맵에서 넘어온 변 쪽으로 한 칸
            const back = [
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            ].map(([bx = 0, by = 0]) => stepMapCell(next.mapKey, size, next.x, next.y, bx, by));
            expect(back.some((step) => step?.mapKey === key && step.x === x && step.y === y)).toBe(true);
          }
        }
      }
    }
    expect(crossings).toBeGreaterThan(0);
    expect(stepMapCell(cellKey(0, level, 0, 0), 8, 0, 255, -1, 1)).toBeNull();
  });
});
