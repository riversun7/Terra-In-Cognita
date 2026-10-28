import { describe, expect, it } from "vitest";
import {
  type CellKey,
  cellKey,
  cellKeyFromHilbert,
  decodeCellKey,
  hilbertIndex,
  isCellKey,
} from "./cellKey.ts";
import { FACES } from "./faces.ts";
import {
  ancestorKey,
  cellKeyRange,
  childKeys,
  containsCell,
  descendantAt,
  offsetInAncestor,
  parentKey,
} from "./hierarchy.ts";
import { MAX_LEVEL } from "./levels.ts";

/** 한 레벨의 모든 칸 키 */
function keysAt(level: number): CellKey[] {
  const n = 2 ** level;
  const keys: CellKey[] = [];
  for (const face of FACES) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) keys.push(cellKey(face, level, i, j));
    }
  }
  return keys;
}

// 풀어 둔 칸 좌표 (전수 시험에서 같은 키를 여러 번 풀지 않게)
const decodedCache = new Map<CellKey, ReturnType<typeof decodeCellKey>>();
function decoded(key: CellKey): ReturnType<typeof decodeCellKey> {
  let value = decodedCache.get(key);
  if (!value) {
    value = decodeCellKey(key);
    decodedCache.set(key, value);
  }
  return value;
}

/** 독립 기준: b가 a 자신이거나 a의 하위 칸인지 (칸 좌표를 반씩 줄여 비교) */
function isWithin(a: CellKey, b: CellKey): boolean {
  const outer = decoded(a);
  const inner = decoded(b);
  const depth = inner.level - outer.level;
  return (
    depth >= 0 && inner.face === outer.face && inner.i >> depth === outer.i && inner.j >> depth === outer.j
  );
}

describe("부모·자식", () => {
  it("자식 4칸은 부모 칸을 2×2로 나눈 칸이고 힐베르트 순서로 이어진다 (레벨 0~4 전수)", () => {
    for (const level of [0, 1, 2, 3, 4]) {
      for (const key of keysAt(level)) {
        const parent = decodeCellKey(key);
        const children = childKeys(key).map(decodeCellKey);
        expect(children.map((c) => [c.face, c.level])).toEqual(
          Array.from({ length: 4 }, () => [parent.face, level + 1]),
        );
        // 2i, 2i+1 × 2j, 2j+1 네 칸을 한 번씩
        const expected = [
          `${2 * parent.i},${2 * parent.j}`,
          `${2 * parent.i},${2 * parent.j + 1}`,
          `${2 * parent.i + 1},${2 * parent.j}`,
          `${2 * parent.i + 1},${2 * parent.j + 1}`,
        ];
        expect(children.map((c) => `${c.i},${c.j}`).toSorted()).toEqual(expected.toSorted());
        const h = hilbertIndex(key);
        expect(childKeys(key).map(hilbertIndex)).toEqual([4 * h, 4 * h + 1, 4 * h + 2, 4 * h + 3]);
        for (const child of childKeys(key)) expect(parentKey(child)).toBe(key);
      }
    }
  });

  it("조상은 칸 좌표를 레벨 차이만큼 반으로 줄인 칸이다", () => {
    const key = cellKey(3, 17, 98_765, 4_321);
    for (let level = 0; level <= 17; level++) {
      const shift = 17 - level;
      expect(decodeCellKey(ancestorKey(key, level))).toEqual({
        face: 3,
        level,
        i: 98_765 >> shift,
        j: 4_321 >> shift,
      });
    }
    expect(ancestorKey(key, 17)).toBe(key);
    expect(() => ancestorKey(key, 18)).toThrow(RangeError);
    expect(() => parentKey(cellKey(2, 0, 0, 0))).toThrow(RangeError);
    expect(() => childKeys(cellKey(2, MAX_LEVEL, 0, 0))).toThrow(RangeError);
  });
});

describe("키 구간 (DB 범위 조회·지역 분할)", () => {
  it("칸 하나의 키 구간에는 그 칸과 모든 하위 칸(레벨 무관)만 들어간다 (지역 레벨 0~3 × 키 레벨 0~5 전수)", () => {
    const keys = [0, 1, 2, 3, 4, 5].flatMap(keysAt);
    const mismatches: string[] = [];
    let inside = 0;
    for (const level of [0, 1, 2, 3]) {
      for (const region of keysAt(level)) {
        const { min, max } = cellKeyRange(region);
        if (min !== region) mismatches.push(`min ${region}`);
        for (const key of keys) {
          const expected = isWithin(region, key);
          if (expected) inside++;
          if ((min <= key && key <= max) !== expected || containsCell(region, key) !== expected) {
            mismatches.push(`${region} ∋ ${key}?`);
          }
        }
      }
    }
    expect(mismatches.slice(0, 10)).toEqual([]);
    // 지역 하나(레벨 L)에 레벨 L~5 칸이 1 + 4 + … 개씩: 기대 개수와 같은지(구간이 비어 있지 않은지)
    let expectedInside = 0;
    for (const level of [0, 1, 2, 3]) {
      for (let keyLevel = level; keyLevel <= 5; keyLevel++)
        expectedInside += 6 * 4 ** level * 4 ** (keyLevel - level);
    }
    expect(inside).toBe(expectedInside);
  });

  it("레벨 0 칸(면 하나)의 구간은 그 면의 키 전부다", () => {
    expect(cellKeyRange(cellKey(0, 0, 0, 0))).toEqual({ min: 0, max: 2 ** 49 - 1 });
    expect(cellKeyRange(cellKey(4, 0, 0, 0))).toEqual({ min: 4 * 2 ** 49, max: 5 * 2 ** 49 - 1 });
  });

  it("같은 레벨 칸들의 구간은 겹치지 않고 힐베르트 순서로 이어진다 (레벨 0~4, 면 사이 포함)", () => {
    for (const level of [0, 1, 2, 3, 4]) {
      const keys = keysAt(level).toSorted((a, b) => a - b);
      expect(cellKeyRange(keys[0] ?? cellKey(0, 0, 0, 0)).min).toBe(level);
      for (let index = 1; index < keys.length; index++) {
        const previous = keys[index - 1];
        const current = keys[index];
        if (previous === undefined || current === undefined) throw new Error("keys");
        // 구간 사이의 틈은 다음 칸과 위치가 같은 조상 칸(레벨 필드만 다름) 자리뿐이다
        expect(cellKeyRange(previous).max + 1 + level).toBe(current);
      }
      expect(cellKeyRange(keys.at(-1) ?? cellKey(0, 0, 0, 0)).max).toBe(6 * 2 ** 49 - 1);
    }
  });

  it("최대 레벨 칸의 구간에는 자기 자신밖에 없다", () => {
    const key = cellKey(5, MAX_LEVEL, (1 << MAX_LEVEL) - 1, 777);
    const { min, max } = cellKeyRange(key);
    expect(min).toBe(key);
    for (let value = min + 1; value <= max; value++) expect(isCellKey(value)).toBe(false);
    expect(max + 1 + MAX_LEVEL).toBe(cellKeyFromHilbert(5, MAX_LEVEL, hilbertIndex(key) + 1));
    expect(Number.isSafeInteger(max)).toBe(true);
  });
});

describe("하위 칸 좌표 (2차맵 지형·배치 칸)", () => {
  it("하위 칸의 (x, y)는 조상 칸 안의 위치이고 되돌리면 같은 칸이다", () => {
    const parent = cellKey(1, 2, 3, 1);
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const child = descendantAt(parent, 3, x, y);
        expect(decodeCellKey(child)).toEqual({ face: 1, level: 5, i: 3 * 8 + x, j: 1 * 8 + y });
        expect(offsetInAncestor(child, 2)).toEqual({ ancestor: parent, x, y });
        expect(containsCell(parent, child)).toBe(true);
      }
    }
  });

  it("지구 1차맵 최소 칸(레벨 9)의 지형 128×128·배치 256×256 칸이 그 칸의 키 구간 안에 있다", () => {
    const cell = cellKey(4, 9, 300, 17);
    const { min, max } = cellKeyRange(cell);
    for (const [depth, size] of [
      [7, 128],
      [8, 256],
    ] as const) {
      for (const [x, y] of [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
        [size >> 1, (size >> 2) + 3],
      ] as const) {
        const sub = descendantAt(cell, depth, x, y);
        expect(sub).toBeGreaterThanOrEqual(min);
        expect(sub).toBeLessThanOrEqual(max);
        expect(offsetInAncestor(sub, 9)).toEqual({ ancestor: cell, x, y });
      }
    }
  });

  it("범위를 벗어난 하위 칸 요청은 거부한다", () => {
    const cell = cellKey(0, 20, 5, 5);
    expect(() => descendantAt(cell, 3, 0, 0)).toThrow(RangeError); // 레벨 23
    expect(() => descendantAt(cell, 2, 4, 0)).toThrow(RangeError); // x는 0~3
    expect(() => descendantAt(cell, 1, 0, -1)).toThrow(RangeError);
    expect(() => offsetInAncestor(cell, 21)).toThrow(RangeError);
  });
});
