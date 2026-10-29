import { describe, expect, it } from "vitest";
import {
  type TileNode,
  childNodes,
  isDataLevel,
  nodeAt,
  nodeOfKey,
  parentNode,
  primaryLevelOf,
  rootNodes,
  tileCellsPerSide,
  tileKey,
  tileLayout,
  tileRequestOf,
  tilesPerSide,
} from "./tileTree.ts";

/** 꼭대기부터 모든 마디(가장 고운 단계까지) */
function allNodes(faceLevel: number): TileNode[] {
  const layout = tileLayout(faceLevel);
  const out: TileNode[] = [];
  const stack = rootNodes(layout);
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    out.push(node);
    stack.push(...childNodes(layout, node));
  }
  return out;
}

describe("타일 나무 — 지구 크기(면 레벨 9)", () => {
  const layout = tileLayout(9);

  it("1차맵 5단계 = 맵 레벨 5~9, 꼭대기는 면 하나 = 타일 하나", () => {
    expect(layout).toEqual({ faceLevel: 9, firstLevel: 5, lastLevel: 9, topLevel: 5 });
    expect([5, 6, 7, 8, 9].map(tilesPerSide)).toEqual([1, 2, 4, 8, 16]);
    expect([5, 6, 7, 8, 9].map(tileCellsPerSide)).toEqual([32, 32, 32, 32, 32]);
    expect([4, 5, 9, 10].map((level) => primaryLevelOf(layout, level))).toEqual([0, 1, 5, 0]);
  });

  it("면당 341개, 모두 2,046개. 타일은 그 레벨의 32×32칸이고 면 안에 든다", () => {
    const nodes = allNodes(9);
    expect(nodes).toHaveLength(2046);
    for (const node of nodes) {
      const request = tileRequestOf(node);
      expect(request.size).toBe(32);
      expect(request.i0 % 32).toBe(0);
      expect(request.i0 + request.size).toBeLessThanOrEqual(2 ** node.mapLevel);
      expect(request.j0 + request.size).toBeLessThanOrEqual(2 ** node.mapLevel);
    }
  });

  it("자식의 부모는 자신, 키는 되돌릴 수 있고 겹치지 않는다", () => {
    const keys = new Set<number>();
    for (const node of allNodes(9)) {
      const key = tileKey(node);
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      expect(nodeOfKey(key)).toEqual(node);
      for (const child of childNodes(layout, node)) expect(parentNode(layout, child)).toEqual(node);
    }
    expect(childNodes(layout, { face: 3, mapLevel: 9, tx: 15, ty: 0 })).toEqual([]);
    expect(parentNode(layout, { face: 3, mapLevel: 5, tx: 0, ty: 0 })).toBeNull();
  });

  it("자식 4개는 부모 칸 범위를 2×2로 나눈다", () => {
    const parent: TileNode = { face: 2, mapLevel: 7, tx: 3, ty: 1 };
    const p = tileRequestOf(parent);
    const children = childNodes(layout, parent).map(tileRequestOf);
    expect(children).toHaveLength(4);
    for (const c of children) {
      expect(c.mapLevel).toBe(8);
      expect(c.i0 / 2).toBeGreaterThanOrEqual(p.i0);
      expect((c.i0 + c.size) / 2).toBeLessThanOrEqual(p.i0 + p.size);
    }
  });

  it("면 칸 좌표가 든 마디", () => {
    expect(nodeAt(1, 0.99, 0.01, 9)).toEqual({ face: 1, mapLevel: 9, tx: 15, ty: 0 });
    expect(nodeAt(1, 1, 1, 6)).toEqual({ face: 1, mapLevel: 6, tx: 1, ty: 1 });
    expect(nodeAt(4, 0.3, 0.7, 5)).toEqual({ face: 4, mapLevel: 5, tx: 0, ty: 0 });
  });
});

describe("타일 나무 — 다른 크기", () => {
  it("작은 행성(면 레벨 6): 맵 레벨 2~5는 면 전체 타일(4·8·16·32칸, 자식 1개), 6에서 4개로 나뉜다", () => {
    const layout = tileLayout(6);
    expect(layout).toEqual({ faceLevel: 6, firstLevel: 2, lastLevel: 6, topLevel: 2 });
    const root: TileNode = { face: 0, mapLevel: 2, tx: 0, ty: 0 };
    expect(tileRequestOf(root).size).toBe(4);
    let node = root;
    for (const size of [8, 16, 32]) {
      const children = childNodes(layout, node);
      expect(children).toHaveLength(1);
      node = children[0] ?? node;
      expect(tileRequestOf(node).size).toBe(size);
      expect(parentNode(layout, node)?.mapLevel).toBe(node.mapLevel - 1);
    }
    expect(childNodes(layout, node)).toHaveLength(4);
    expect(allNodes(6)).toHaveLength(6 * (4 + 4));
  });

  it("큰 행성(면 레벨 14): 꼭대기(맵 레벨 5) ~ 9는 자료 없는 마디, 10~14가 1차맵", () => {
    const layout = tileLayout(14);
    expect(layout).toEqual({ faceLevel: 14, firstLevel: 10, lastLevel: 14, topLevel: 5 });
    expect(isDataLevel(layout, 9)).toBe(false);
    expect(isDataLevel(layout, 10)).toBe(true);
    expect(tilesPerSide(10)).toBe(32);
    const deep: TileNode = { face: 5, mapLevel: 14, tx: 511, ty: 300 };
    expect(nodeOfKey(tileKey(deep))).toEqual(deep);
  });

  it("면 레벨 범위 밖은 거절", () => {
    expect(() => tileLayout(3)).toThrow(RangeError);
    expect(() => tileLayout(15)).toThrow(RangeError);
  });
});
