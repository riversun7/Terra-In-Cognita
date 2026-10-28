import { describe, expect, it } from "vitest";
import {
  MAX_CELL_KEY,
  type CellKey,
  cellKey,
  cellKeyFromHilbert,
  decodeCellKey,
  hilbertIndex,
  isCellKey,
  parseCellKey,
} from "./cellKey.ts";
import { FACES } from "./faces.ts";
import { MAX_LEVEL } from "./levels.ts";
import { sharedCorners } from "./testOracle.ts";

const SMALL_LEVELS = [0, 1, 2, 3, 4, 5];

describe("셀 키 만들기·풀기", () => {
  it("칸 좌표 → 키 → 칸 좌표가 그대로 돌아온다 (레벨 0~5, 모든 면, 전수)", () => {
    for (const level of SMALL_LEVELS) {
      const n = 2 ** level;
      const seen = new Set<number>();
      for (const face of FACES) {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const key = cellKey(face, level, i, j);
            expect(decodeCellKey(key)).toEqual({ face, level, i, j });
            seen.add(key);
          }
        }
      }
      // 같은 레벨의 키는 모두 다르다
      expect(seen.size).toBe(6 * n * n);
    }
  });

  it("비트 배치가 바뀌지 않는다 (골든 값: 면 3비트 | 힐베르트 위치 44비트 | 레벨 5비트)", () => {
    // 키 = 면 × 2^49 + 힐베르트 번호 × 2^(49 - 2·레벨) + 레벨. DB에 저장되는 값이라 바뀌면 안 된다.
    expect(cellKey(0, 0, 0, 0)).toBe(0);
    expect(cellKey(1, 0, 0, 0)).toBe(562_949_953_421_312); // 2^49
    expect(cellKey(5, 0, 0, 0)).toBe(2_814_749_767_106_560); // 5 × 2^49
    // 레벨 1, 면 0: 힐베르트 순서 (0,0) → (0,1) → (1,1) → (1,0)
    expect(cellKey(0, 1, 0, 0)).toBe(1);
    expect(cellKey(0, 1, 0, 1)).toBe(140_737_488_355_329); // 1 × 2^47 + 1
    expect(cellKey(0, 1, 1, 1)).toBe(281_474_976_710_657); // 2 × 2^47 + 1
    expect(cellKey(0, 1, 1, 0)).toBe(422_212_465_065_985); // 3 × 2^47 + 1
    // 홀수 면은 축을 바꿔 시작한다: (0,0) → (1,0) → (1,1) → (0,1)
    expect(cellKey(1, 1, 1, 0)).toBe(562_949_953_421_312 + 140_737_488_355_329);
    // 지구 1차맵 최소 칸 레벨 9, 면 2의 (0,0) 칸
    expect(cellKey(2, 9, 0, 0)).toBe(1_125_899_906_842_633); // 2 × 2^49 + 9
  });

  it("최대 레벨 22의 키도 안전 정수 안에 있고 그대로 풀린다", () => {
    const last = (1 << MAX_LEVEL) - 1;
    for (const face of FACES) {
      for (const [i, j] of [
        [0, 0],
        [last, 0],
        [0, last],
        [last, last],
        [1_234_567, 3_210_987],
      ] as const) {
        const key = cellKey(face, MAX_LEVEL, i, j);
        expect(Number.isSafeInteger(key)).toBe(true);
        expect(key).toBeLessThanOrEqual(MAX_CELL_KEY);
        expect(decodeCellKey(key)).toEqual({ face, level: MAX_LEVEL, i, j });
      }
    }
    // 가장 큰 키 = 면 5, 레벨 22, 마지막 힐베르트 번호. 52비트(2^52 미만)
    expect(MAX_CELL_KEY).toBe(cellKeyFromHilbert(5, MAX_LEVEL, 4 ** MAX_LEVEL - 1));
    expect(MAX_CELL_KEY).toBe(6 * 2 ** 49 - 10);
    expect(MAX_CELL_KEY).toBeLessThan(2 ** 52);
    expect(MAX_CELL_KEY).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
  });

  it("레벨 23 이상, 면 밖 좌표, 정수가 아닌 값은 거부한다", () => {
    expect(() => cellKey(0, MAX_LEVEL + 1, 0, 0)).toThrow(RangeError);
    expect(() => cellKey(0, 3, 8, 0)).toThrow(RangeError);
    expect(() => cellKey(0, 3, -1, 0)).toThrow(RangeError);
    expect(() => cellKey(0, 3, 0.5, 0)).toThrow(RangeError);
    // @ts-expect-error 면은 0~5
    expect(() => cellKey(6, 0, 0, 0)).toThrow(RangeError);
    expect(() => cellKeyFromHilbert(0, 2, 16)).toThrow(RangeError);
  });
});

describe("셀 키 검사", () => {
  it("만든 키는 모두 올바른 키다", () => {
    for (const level of SMALL_LEVELS) {
      for (const face of FACES) {
        for (let h = 0; h < 4 ** level; h++) {
          const key = cellKeyFromHilbert(face, level, h);
          expect(isCellKey(key)).toBe(true);
          expect(parseCellKey(key)).toBe(key);
        }
      }
    }
  });

  it("키가 될 수 없는 값을 가려낸다", () => {
    const bad: unknown[] = [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "0",
      null,
      2 ** 53, // 안전 정수 밖
      6 * 2 ** 49, // 면 6
      23, // 레벨 필드 23
      31,
      cellKey(0, 3, 0, 0) + 2 ** 42, // 레벨 3인데 힐베르트 위치가 레벨 3 칸 단위(2^43)에 맞지 않음
      MAX_CELL_KEY + 1,
    ];
    for (const value of bad) {
      expect(isCellKey(value), String(value)).toBe(false);
    }
    expect(() => parseCellKey(23)).toThrow(RangeError);
  });
});

describe("힐베르트 순서", () => {
  it("한 면·한 레벨의 힐베르트 번호는 0부터 4^레벨 - 1까지 한 번씩 쓴다", () => {
    for (const level of SMALL_LEVELS) {
      const n = 2 ** level;
      for (const face of FACES) {
        const used = new Set<number>();
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) used.add(hilbertIndex(cellKey(face, level, i, j)));
        }
        expect(used.size).toBe(n * n);
        expect(Math.min(...used)).toBe(0);
        expect(Math.max(...used)).toBe(n * n - 1);
      }
    }
  });

  it("번호가 이어지는 두 칸은 면 안에서 변을 공유한다 (레벨 1~6)", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      for (const face of FACES) {
        let previous = decodeCellKey(cellKeyFromHilbert(face, level, 0));
        for (let h = 1; h < 4 ** level; h++) {
          const current = decodeCellKey(cellKeyFromHilbert(face, level, h));
          expect(Math.abs(current.i - previous.i) + Math.abs(current.j - previous.j)).toBe(1);
          previous = current;
        }
      }
    }
  });

  it("곡선이 면 0 → 1 → … → 5 → 0으로 끊기지 않고 이어진다 (면 사이도 변을 공유)", () => {
    for (const level of [0, 1, 2, 3, 4, 5, 6]) {
      for (const face of FACES) {
        const next = FACES[(face + 1) % 6];
        if (next === undefined) throw new Error("face list");
        const last = decodeCellKey(cellKeyFromHilbert(face, level, 4 ** level - 1));
        const first = decodeCellKey(cellKeyFromHilbert(next, level, 0));
        expect(sharedCorners(level, last, first), `level ${level}, face ${face} → ${next}`).toBe(2);
      }
    }
  });

  it("면별 방향: 곡선은 늘 (0, 0)에서 시작하고 짝수 면은 (n-1, 0), 홀수 면은 (0, n-1)에서 끝난다", () => {
    for (const level of [1, 2, 3, 4, 5, 6, MAX_LEVEL]) {
      const last = 2 ** level - 1;
      for (const face of FACES) {
        expect(decodeCellKey(cellKeyFromHilbert(face, level, 0))).toEqual({ face, level, i: 0, j: 0 });
        const end = decodeCellKey(cellKeyFromHilbert(face, level, 4 ** level - 1));
        expect([end.i, end.j]).toEqual(face % 2 === 0 ? [last, 0] : [0, last]);
      }
    }
  });

  it("키 크기 순서가 면 순서 다음 힐베르트 순서다", () => {
    const keys: CellKey[] = [];
    for (const face of FACES) {
      for (let h = 0; h < 4 ** 3; h++) keys.push(cellKeyFromHilbert(face, 3, h));
    }
    const sorted = keys.toSorted((a, b) => a - b);
    expect(sorted).toEqual(keys);
  });
});
