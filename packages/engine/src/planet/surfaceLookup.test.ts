import { cellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { averageCellEdgeMeters, cellCenter, xyzToCell } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { globeLimits, globePose, initialGlobe, screenRay } from "./globeCamera.ts";
import type { DecodedTile } from "./planetTypes.ts";
import {
  type DecodedLookup,
  cellAt,
  displayedHeightAt,
  finestTileAt,
  heightInTile,
  rayHitsSurface,
} from "./surfaceLookup.ts";
import { EARTH_RADIUS_M, makeTile, sampleHeight } from "./testSupport.ts";
import { directionToFaceST } from "./tileShape.ts";
import { type TileNode, nodeAt, tileKey, tileLayout, tileRequestOf } from "./tileTree.ts";
import { type Vec3, length, normalize, sub } from "./vec3.ts";

const R = EARTH_RADIUS_M;
const layout = tileLayout(9);

/** 방향을 덮는 맵 레벨들의 타일을 받아 둔 저장소 */
function loaded(direction: Vec3, levels: readonly number[], height = sampleHeight): DecodedLookup {
  const { face, s, t } = directionToFaceST(direction);
  const tiles = new Map<number, DecodedTile>();
  for (const level of levels) {
    const node: TileNode = nodeAt(face, s, t, level);
    const r = tileRequestOf(node);
    tiles.set(tileKey(node), makeTile(r.face, level, r.i0, r.j0, r.size, height));
  }
  return (key) => tiles.get(key) ?? null;
}

describe("받은 타일로 땅 읽기", () => {
  const direction = normalize([0.62, 0.41, 0.66]);

  it("가장 고운 받은 타일을 쓴다", () => {
    expect(finestTileAt(direction, layout, loaded(direction, [5, 6, 7]))?.node.mapLevel).toBe(7);
    expect(finestTileAt(direction, layout, loaded(direction, [5]))?.node.mapLevel).toBe(5);
    expect(finestTileAt(direction, layout, () => null)).toBeNull();
  });

  it("꼭짓점 위에서는 꼭짓점 높이, 사이는 이중선형", () => {
    const tile = makeTile(2, 9, 64, 32, 32);
    const n = 512;
    expect(heightInTile(tile, 70 / n, 40 / n)).toBe(tile.heightsM[(40 - 32) * 33 + (70 - 64)]);
    const a = tile.heightsM[(40 - 32) * 33 + 6] ?? 0;
    const b = tile.heightsM[(40 - 32) * 33 + 7] ?? 0;
    expect(heightInTile(tile, 70.5 / n, 40 / n)).toBeCloseTo((a + b) / 2, 9);
  });

  it("보이는 높이 = max(높이, 0) × 과장(바다는 해수면)", () => {
    const land = loaded(direction, [9], () => 300);
    const sea = loaded(direction, [9], () => -500);
    expect(displayedHeightAt(direction, layout, land, 6)).toBeCloseTo(1800, 6);
    expect(displayedHeightAt(direction, layout, sea, 6)).toBe(0);
    expect(displayedHeightAt(direction, layout, () => null, 6)).toBe(0);
  });
});

describe("누르기(칸 고르기)", () => {
  const viewport = { width: 390, height: 844 };
  const limits = globeLimits(R, averageCellEdgeMeters(9, R), viewport);
  const step = averageCellEdgeMeters(9, R) / 2;

  it("화면 가운데를 누르면 목표점이 든 칸(가장 고운 받은 레벨)", () => {
    const state = initialGlobe(-23.4, 51.7, 60_000, limits);
    const lookup = loaded(state.target, [5, 6, 7, 8, 9], () => 0);
    const pose = globePose(state, R, limits);
    const ray = screenRay(pose, viewport, { x: 195, y: 422 });
    const hit = rayHitsSurface(
      ray.origin,
      ray.dir,
      R,
      760 * 6,
      (d) => displayedHeightAt(d, layout, lookup, 6),
      step,
    );
    expect(hit).not.toBeNull();
    if (!hit) return;
    expect(length(hit)).toBeCloseTo(R, 0);
    const cell = cellAt(normalize(hit), layout, lookup);
    expect(cell?.mapLevel).toBe(9);
    expect(cell?.primaryLevel).toBe(5);
    expect(cell?.cellKey).toBe(xyzToCell(state.target, 9));
    if (!cell) return;
    expect(decodeCellKey(parseCellKey(cell.cellKey))).toEqual({
      face: cell.face,
      level: 9,
      i: cell.i,
      j: cell.j,
    });
    expect(cell.latDeg).toBeCloseTo(-23.4, 1);
  });

  it("거친 타일만 받았으면 그 레벨의 칸", () => {
    const state = initialGlobe(10, 10, 60_000, limits);
    const lookup = loaded(state.target, [5]);
    const cell = cellAt(state.target, layout, lookup);
    expect(cell?.mapLevel).toBe(5);
    expect(cell?.primaryLevel).toBe(1);
    expect(cell?.cellKey).toBe(xyzToCell(state.target, 5));
  });

  it("기울어진 시선은 앞쪽 산비탈에 먼저 닿는다(해수면 점이 아니다)", () => {
    const state = initialGlobe(30, 60, limits.minDistance, limits);
    // 높이 700m 고원(× 과장 6 = 4.2km)
    const lookup = loaded(state.target, [9], () => 700);
    const heightAt = (d: Vec3): number => displayedHeightAt(d, layout, lookup, 6);
    const pose = globePose({ ...state, targetHeight: 4200 }, R, limits);
    const ray = screenRay(pose, viewport, { x: 195, y: 600 });
    const hit = rayHitsSurface(ray.origin, ray.dir, R, 760 * 6, heightAt, step);
    expect(hit).not.toBeNull();
    if (!hit) return;
    expect(length(hit) - R).toBeCloseTo(4200, -1);
    // 해수면 구에 닿는 점보다 카메라에 가깝다
    const seaOnly = rayHitsSurface(ray.origin, ray.dir, R, 760 * 6, () => 0, step);
    expect(seaOnly).not.toBeNull();
    if (!seaOnly) return;
    expect(length(sub(hit, ray.origin))).toBeLessThan(length(sub(seaOnly, ray.origin)));
  });

  it("행성 밖(우주)을 누르면 없음", () => {
    const state = initialGlobe(0, 0, limits.maxDistance, limits);
    const pose = globePose(state, R, limits);
    const ray = screenRay(pose, viewport, { x: 2, y: 2 });
    expect(rayHitsSurface(ray.origin, ray.dir, R, 4560, () => 0, step)).toBeNull();
  });

  it("칸 자료(바이옴·물·기온 …)를 그 칸에서 읽는다", () => {
    const direction = cellCenter(cellKey(4, 9, 300, 123));
    const lookup = loaded(direction, [9]);
    const cell = cellAt(direction, layout, lookup);
    expect(cell).not.toBeNull();
    if (!cell) return;
    expect([cell.face, cell.i, cell.j]).toEqual([4, 300, 123]);
    const node = nodeAt(4, 300.5 / 512, 123.5 / 512, 9);
    const tile = lookup(tileKey(node));
    const local = (123 - node.ty * 32) * 32 + (300 - node.tx * 32);
    expect(cell.biome).toBe(tile?.biome[local]);
    expect(cell.temperatureC).toBe(tile?.temperatureC[local]);
    expect(cell.water).toBe(tile?.water[local]);
  });
});
