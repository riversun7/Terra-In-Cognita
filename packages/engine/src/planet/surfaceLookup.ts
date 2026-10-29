// 받은 타일로 땅 읽기 — 순수 계산(시험 대상). 누르기(칸 고르기)와 카메라(목표점 높이·가장 낮은 고도)가 쓴다.
// 한 방향에서 "받은 타일 중 가장 고운 것"을 찾아 꼭짓점 높이를 이중선형으로 읽는다(메시 삼각형과 거의 같다).
// 보이는 높이 = max(높이, 0) × 과장(바다는 해수면 구 위) — 셰이더와 같은 식 하나(tileMesh.ts vertexLiftM)를 쓴다.
import { type Face, cellKey } from "@terra/planet";
import type { DecodedTile, PickedCell } from "./planetTypes.ts";
import { vertexLiftM } from "./tileMesh.ts";
import { directionToFaceST } from "./tileShape.ts";
import { type TileLayout, type TileNode, nodeAt, primaryLevelOf, tileKey } from "./tileTree.ts";
import { type Vec3, addScaled, dot, length, normalize } from "./vec3.ts";

/** 마디 키 → 받은(풀어 둔) 타일. 없으면 null */
export type DecodedLookup = (key: number) => DecodedTile | null;

export interface SurfaceHit {
  readonly node: TileNode;
  readonly tile: DecodedTile;
  readonly face: Face;
  /** 면 칸 좌표(정규화) */
  readonly s: number;
  readonly t: number;
}

/** 방향 direction을 덮는 받은 타일 중 가장 고운 것 */
export function finestTileAt(direction: Vec3, layout: TileLayout, lookup: DecodedLookup): SurfaceHit | null {
  const { face, s, t } = directionToFaceST(direction);
  for (let level = layout.lastLevel; level >= layout.firstLevel; level--) {
    const node = nodeAt(face, s, t, level);
    const tile = lookup(tileKey(node));
    if (tile) return { node, tile, face, s, t };
  }
  return null;
}

/** 타일 안 면 칸 좌표 (s, t)의 높이(게임 m): 칸 꼭짓점 높이 이중선형 */
export function heightInTile(tile: DecodedTile, s: number, t: number): number {
  const cells = 2 ** tile.mapLevel;
  const size = tile.size;
  const x = Math.min(size, Math.max(0, s * cells - tile.i0));
  const y = Math.min(size, Math.max(0, t * cells - tile.j0));
  const x0 = Math.min(size - 1, Math.floor(x));
  const y0 = Math.min(size - 1, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const row = size + 1;
  const h = (cx: number, cy: number): number => tile.heightsM[cy * row + cx] ?? 0;
  const bottom = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
  const top = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
  return bottom + (top - bottom) * fy;
}

/** 방향의 보이는 높이(m, 해수면 위 ≥ 0). 받은 타일이 없으면 0 */
export function displayedHeightAt(
  direction: Vec3,
  layout: TileLayout,
  lookup: DecodedLookup,
  exaggeration: number,
): number {
  const hit = finestTileAt(direction, layout, lookup);
  if (!hit) return 0;
  return vertexLiftM(heightInTile(hit.tile, hit.s, hit.t), false, exaggeration, 0);
}

/**
 * 시선이 보이는 땅에 닿는 점(세계 m). 행성 밖이면 null.
 * 가장 높은 땅의 구(radius + maxLift)에 들어간 곳부터 해수면 구까지 일정 간격으로 걷고, 땅 아래로 들어가면 이분법으로 좁힌다.
 * 해수면 구에 닿을 때까지 땅을 못 만나면 해수면 점이다(보이는 땅은 해수면 아래로 내려가지 않는다).
 */
export function rayHitsSurface(
  origin: Vec3,
  dir: Vec3,
  radiusM: number,
  maxLiftM: number,
  heightAt: (direction: Vec3) => number,
  stepM: number,
): Vec3 | null {
  const d = normalize(dir);
  const outer = radiusM + Math.max(0, maxLiftM);
  const enter = sphereEntry(origin, d, outer);
  if (enter === null) return null;
  const seaEnter = sphereEntry(origin, d, radiusM);
  const end = seaEnter ?? sphereExit(origin, d, outer) ?? enter;
  const below = (t: number): boolean => {
    const p = addScaled(origin, d, t);
    return length(p) <= radiusM + heightAt(p);
  };
  let previous = enter;
  if (below(previous)) return addScaled(origin, d, previous);
  const step = Math.max(1, stepM);
  for (let t = enter + step; ; t += step) {
    const current = Math.min(t, end);
    if (below(current)) {
      let low = previous;
      let high = current;
      for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2;
        if (below(mid)) high = mid;
        else low = mid;
      }
      return addScaled(origin, d, high);
    }
    previous = current;
    if (current >= end) break;
  }
  return seaEnter === null ? null : addScaled(origin, d, seaEnter);
}

/** 시선이 구에 들어가는 거리(카메라가 구 안이면 0). 안 만나면 null */
function sphereEntry(origin: Vec3, dir: Vec3, radius: number): number | null {
  const b = dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0) return null;
  const near = -b - Math.sqrt(disc);
  return near >= 0 ? near : null;
}

function sphereExit(origin: Vec3, dir: Vec3, radius: number): number | null {
  const b = dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const far = -b + Math.sqrt(disc);
  return far >= 0 ? far : null;
}

/** 방향을 덮는 가장 고운 받은 타일의 칸 */
export function cellAt(direction: Vec3, layout: TileLayout, lookup: DecodedLookup): PickedCell | null {
  const hit = finestTileAt(direction, layout, lookup);
  if (!hit) return null;
  const { tile, face, s, t } = hit;
  const cells = 2 ** tile.mapLevel;
  const i = Math.min(tile.i0 + tile.size - 1, Math.max(tile.i0, Math.floor(s * cells)));
  const j = Math.min(tile.j0 + tile.size - 1, Math.max(tile.j0, Math.floor(t * cells)));
  const local = (j - tile.j0) * tile.size + (i - tile.i0);
  const row = tile.size + 1;
  const ci = i - tile.i0;
  const cj = j - tile.j0;
  const corner = (x: number, y: number): number => tile.heightsM[y * row + x] ?? 0;
  const heightM = (corner(ci, cj) + corner(ci + 1, cj) + corner(ci, cj + 1) + corner(ci + 1, cj + 1)) / 4;
  const d = normalize(direction);
  return {
    face,
    mapLevel: tile.mapLevel,
    primaryLevel: primaryLevelOf(layout, tile.mapLevel),
    i,
    j,
    cellKey: cellKey(face, tile.mapLevel, i, j),
    latDeg: (Math.asin(Math.min(1, Math.max(-1, d[2]))) * 180) / Math.PI,
    lonDeg: (Math.atan2(d[1], d[0]) * 180) / Math.PI,
    heightM,
    biome: tile.biome[local] ?? 0,
    water: tile.water[local] ?? 0,
    temperatureC: tile.temperatureC[local] ?? 0,
    humidity: tile.humidity[local] ?? 0,
    forest: tile.forest[local] ?? 0,
    river: tile.river[local] ?? 0,
  };
}
