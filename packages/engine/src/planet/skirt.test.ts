// 치마(레벨이 다른 이웃 사이 틈 막기) 시험 — 진짜 타일과 같은 규칙(ADR 36 꼭짓점 평균·2×2 모으기)으로 만든 타일을 쓴다.
// 맞닿은 변의 꼭짓점·치마는 모두 같은 대원 평면 위에 있으므로(면 변은 대원이고 치마는 그 아래로 곧게 내린다),
// 그 평면의 극좌표(각, 반지름)로 두 타일의 변 선(위)과 치마 선(아래)을 견준다. 높은 쪽 치마가 낮은 쪽 변까지 내려가면 막힌다.
import type { Face } from "@terra/planet";
import { planetRadiusMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { adrTiles } from "./testSupport.ts";
import {
  type TileMeshArrays,
  buildTileMesh,
  skirtTopIndex,
  skirtVertexIndex,
  vertexLiftM,
} from "./tileMesh.ts";
import { SKIRT_MARGIN_M, faceSTDirection, skirtDepthM, tileShape } from "./tileShape.ts";
import {
  type TileNode,
  nodeSTRange,
  tileCellsPerSide,
  tileLayout,
  tileRequestOf,
  tilesPerSide,
} from "./tileTree.ts";
import { type Vec3, cross, dot, normalize } from "./vec3.ts";

/** 변 번호(tileMesh.ts skirtTopIndex): 2 = i 처음(왼쪽), 3 = i 끝(오른쪽) */
const LEFT = 2;
const RIGHT = 3;

interface EdgeLines {
  top: Vec3[];
  bottom: Vec3[];
}

/** 해수면 구 위 꼭짓점 v(원점 + 32비트 위치)와 위쪽 */
function seaPoint(mesh: TileMeshArrays, v: number): Vec3 {
  return [
    mesh.origin[0] + (mesh.positions[v * 3] ?? 0),
    mesh.origin[1] + (mesh.positions[v * 3 + 1] ?? 0),
    mesh.origin[2] + (mesh.positions[v * 3 + 2] ?? 0),
  ];
}

const lifted = (p: Vec3, lift: number): Vec3 => {
  const up = normalize(p);
  return [p[0] + up[0] * lift, p[1] + up[1] * lift, p[2] + up[2] * lift];
};

/**
 * 변 edge의 보이는 변 선(셰이더와 같은 올림 vertexLiftM)과 치마 아래 끝 선.
 * skirtLift(높이) = 치마 꼭짓점을 해수면 구에서 옮기는 양. 지금 셰이더는 −skirtDepthM(모든 타일 같은 바닥)이다.
 */
function edgeLines(
  mesh: TileMeshArrays,
  edge: number,
  exaggeration: number,
  skirtLift: (heightM: number) => number,
): EdgeLines {
  const top: Vec3[] = [];
  const bottom: Vec3[] = [];
  for (let k = 0; k <= mesh.segments; k++) {
    const t = skirtTopIndex(mesh.segments, edge, k);
    const s = skirtVertexIndex(mesh.segments, edge, k);
    const height = mesh.heights[t * 2] ?? 0;
    top.push(lifted(seaPoint(mesh, t), vertexLiftM(height, false, exaggeration, 0)));
    bottom.push(lifted(seaPoint(mesh, s), skirtLift(mesh.heights[s * 2] ?? 0)));
  }
  return { top, bottom };
}

interface Polar {
  phi: number;
  r: number;
}

/** 대원 평면의 극좌표 틀(e1 = 첫 점 방향) */
function planeFrame(a: Vec3, b: Vec3): (p: Vec3) => Polar {
  const e1 = normalize(a);
  const normal = normalize(cross(a, b));
  const e2 = cross(normal, e1);
  return (p) => {
    const x = dot(p, e1);
    const y = dot(p, e2);
    return { phi: Math.atan2(y, x), r: Math.hypot(x, y) };
  };
}

/** 곧은 선분들(각 순서)이 각 phi에서 가지는 반지름 — 선분과 그 각의 반직선이 만나는 점 */
function radiusAt(line: readonly Polar[], phi: number): number | null {
  for (let k = 0; k + 1 < line.length; k++) {
    const a = line[k];
    const b = line[k + 1];
    if (!a || !b) continue;
    const lo = Math.min(a.phi, b.phi);
    const hi = Math.max(a.phi, b.phi);
    if (phi < lo - 1e-12 || phi > hi + 1e-12) continue;
    const ax = a.r * Math.cos(a.phi);
    const ay = a.r * Math.sin(a.phi);
    const dx = b.r * Math.cos(b.phi) - ax;
    const dy = b.r * Math.sin(b.phi) - ay;
    const ux = Math.cos(phi);
    const uy = Math.sin(phi);
    const denominator = dx * uy - dy * ux;
    const t = denominator === 0 ? 0 : -(ax * uy - ay * ux) / denominator;
    return (ax + t * dx) * ux + (ay + t * dy) * uy;
  }
  return null;
}

/**
 * 두 타일의 맞닿은 변에서 막히지 않은 가장 큰 높이 차(m). 0 이하면 막혔다.
 * 각마다 높은 쪽 변의 치마 아래 끝이 낮은 쪽 변보다 위에 있으면 그만큼 틈이다.
 */
function worstGap(a: EdgeLines, b: EdgeLines): number {
  const first = a.top[0];
  const last = a.top[a.top.length - 1];
  if (!first || !last) throw new Error("empty edge");
  const polar = planeFrame(first, last);
  const aTop = a.top.map(polar);
  const aBottom = a.bottom.map(polar);
  const bTop = b.top.map(polar);
  const bBottom = b.bottom.map(polar);
  const angles = [...aTop, ...bTop].map((p) => p.phi).toSorted((x, y) => x - y);
  const samples: number[] = [];
  for (let k = 0; k < angles.length; k++) {
    const phi = angles[k] ?? 0;
    samples.push(phi);
    const next = angles[k + 1];
    if (next !== undefined) samples.push((phi + next) / 2);
  }
  let worst = Number.NEGATIVE_INFINITY;
  let compared = 0;
  for (const phi of samples) {
    const ra = radiusAt(aTop, phi);
    const rb = radiusAt(bTop, phi);
    if (ra === null || rb === null) continue;
    const bottom = radiusAt(ra >= rb ? aBottom : bBottom, phi);
    if (bottom === null) continue;
    worst = Math.max(worst, bottom - Math.min(ra, rb));
    compared += 1;
  }
  if (compared < 10) throw new Error(`edges do not overlap (${compared} samples)`);
  return worst;
}

/** 면 0 안에서 거친 타일(맵 레벨 6~8)의 오른쪽 변과 그 너머 1~3단계 고운 타일들의 맞닿음마다 가장 큰 틈(m) */
function worstOverPairs(
  tiles: ReturnType<typeof adrTiles>,
  exaggeration: number,
  skirtLift: (mesh: TileMeshArrays, node: TileNode) => (heightM: number) => number,
): { pairs: number; worst: number } {
  const faceLevel = tiles.faceLevel;
  const radius = planetRadiusMeters(faceLevel);
  const meshes = new Map<number, TileMeshArrays>();
  const meshOf = (node: TileNode): TileMeshArrays => {
    const name = ((node.mapLevel * 1024 + node.ty) * 1024 + node.tx) * 8 + node.face;
    let mesh = meshes.get(name);
    if (!mesh) {
      mesh = buildTileMesh(tiles.tile(tileRequestOf(node)), radius);
      meshes.set(name, mesh);
    }
    return mesh;
  };
  let pairs = 0;
  let worst = Number.NEGATIVE_INFINITY;
  for (let level = 6; level <= 8; level++) {
    for (let gap = 1; level + gap <= faceLevel && gap <= 3; gap++) {
      const perSide = tilesPerSide(level);
      const scale = 1 << gap;
      for (let ty = 0; ty < Math.min(perSide, 3); ty++) {
        for (let tx = 0; tx + 1 < Math.min(perSide, 4); tx++) {
          const coarseNode: TileNode = { face: 0, mapLevel: level, tx, ty };
          const coarse = meshOf(coarseNode);
          const coarseLines = edgeLines(coarse, RIGHT, exaggeration, skirtLift(coarse, coarseNode));
          for (let k = 0; k < scale; k++) {
            const fineNode: TileNode = {
              face: 0,
              mapLevel: level + gap,
              tx: (tx + 1) * scale,
              ty: ty * scale + k,
            };
            const fine = meshOf(fineNode);
            const fineLines = edgeLines(fine, LEFT, exaggeration, skirtLift(fine, fineNode));
            worst = Math.max(worst, worstGap(fineLines, coarseLines));
            pairs += 1;
          }
        }
      }
    }
  }
  return { pairs, worst };
}

describe("치마 바닥(모든 타일 같은 깊이)", () => {
  it.each([6, 9, 11])(
    "면 레벨 %i: 모든 단계 모든 타일 변은 해수면(가장 낮은 경우)에서도 치마 바닥보다 30m 가까이 위다",
    (faceLevel) => {
      const radius = planetRadiusMeters(faceLevel);
      const layout = tileLayout(faceLevel);
      const floor = radius - skirtDepthM(layout, radius);
      // 큰 행성은 면 하나만(면마다 같은 모양을 돌린 것이다)
      const faces: readonly Face[] = faceLevel >= 11 ? [0] : [0, 1, 2, 3, 4, 5];
      let lowest = Number.POSITIVE_INFINITY;
      for (let level = layout.firstLevel; level <= layout.lastLevel; level++) {
        const perSide = tilesPerSide(level);
        // 메시 한 변은 늘 32마디(면 전체 타일도 32마디로 나눈다)
        const segments = Math.max(32, tileCellsPerSide(level));
        for (const face of faces) {
          for (let ty = 0; ty < perSide; ty++) {
            for (let tx = 0; tx < perSide; tx++) {
              const { s0, t0, span } = nodeSTRange({ face, mapLevel: level, tx, ty });
              for (let edge = 0; edge < 4; edge++) {
                const at = (k: number): Vec3 => {
                  const u = (k / segments) * span;
                  if (edge === 0) return faceSTDirection(face, s0 + u, t0);
                  if (edge === 1) return faceSTDirection(face, s0 + u, t0 + span);
                  if (edge === 2) return faceSTDirection(face, s0, t0 + u);
                  return faceSTDirection(face, s0 + span, t0 + u);
                };
                let previous = at(0);
                for (let k = 1; k <= segments; k++) {
                  const current = at(k);
                  // 해수면 꼭짓점 사이 현의 가장 낮은 곳 = 가운데
                  const middle =
                    (radius * Math.hypot(...previous.map((value, i) => value + (current[i] ?? 0)))) / 2;
                  lowest = Math.min(lowest, middle);
                  previous = current;
                }
              }
            }
          }
        }
      }
      // 보이는 높이 ≥ 0이라 땅이 있으면 변은 더 위다(현의 가장 낮은 곳은 두 끝 반지름이 클수록 높다)
      expect(lowest - floor).toBeGreaterThan(SKIRT_MARGIN_M - 1);
    },
  );

  it("고운 고원 옆 거친 해안(ADR 규칙 타일): 예전 식(타일 높이 범위)은 1km 넘게 열리고, 같은 바닥은 막는다", () => {
    const faceLevel = 9;
    const radius = planetRadiusMeters(faceLevel);
    const exaggeration = 6;
    // 면 0의 레벨 9 칸 i ≥ 252는 고원 300m, 나머지는 바다 −900m: 레벨 7 칸 63부터 고원, 레벨 6 칸 31은 그 둘의 평균(−300)
    const tiles = adrTiles(faceLevel, (face, i) => (face === 0 && i >= 252 ? 300 : -900));
    // 고운 A(맵 레벨 7, 칸 i 64~95, j 32~63)의 왼쪽 변 = 거친 B(맵 레벨 6, 칸 0~31)의 오른쪽 변(s = 0.5)
    const fineNode: TileNode = { face: 0, mapLevel: 7, tx: 2, ty: 1 };
    const coarseNode: TileNode = { face: 0, mapLevel: 6, tx: 0, ty: 0 };
    const fine = tiles.tile(tileRequestOf(fineNode));
    const coarse = tiles.tile(tileRequestOf(coarseNode));
    expect(fine.heightsM[0]).toBe(300);
    expect(coarse.heightsM[20 * 33 + 32]).toBe(0);
    const fineMesh = buildTileMesh(fine, radius);
    const coarseMesh = buildTileMesh(coarse, radius);
    const depth = skirtDepthM(tileLayout(faceLevel), radius);
    const floor = (): number => -depth;
    const now = worstGap(
      edgeLines(fineMesh, LEFT, exaggeration, floor),
      edgeLines(coarseMesh, RIGHT, exaggeration, floor),
    );
    expect(now).toBeLessThanOrEqual(0);
    // 예전 셰이더: 치마 = 그 꼭짓점 보이는 높이 − (활꼴 깊이 + 과장 × 그 타일 높이 범위 + 30m)
    const oldLift = (mesh: TileMeshArrays, node: TileNode) => {
      const range = Math.max(0, mesh.maxHeightM) - Math.max(0, mesh.minHeightM);
      const drop = tileShape(node, radius).sagM + exaggeration * range + SKIRT_MARGIN_M;
      return (height: number): number => vertexLiftM(height, false, exaggeration, 0) - drop;
    };
    const before = worstGap(
      edgeLines(fineMesh, LEFT, exaggeration, oldLift(fineMesh, fineNode)),
      edgeLines(coarseMesh, RIGHT, exaggeration, oldLift(coarseMesh, coarseNode)),
    );
    expect(before).toBeGreaterThan(1000);
  });

  const FACE_LEVEL = 9;
  const RADIUS = planetRadiusMeters(FACE_LEVEL);
  const DEPTH = skirtDepthM(tileLayout(FACE_LEVEL), RADIUS);
  /** 지금 셰이더: 모든 타일 같은 바닥 */
  const sharedFloor = () => (): number => -DEPTH;
  /** 예전 셰이더(검토 전): 치마 = 보이는 높이 − (활꼴 깊이 + 과장 × 그 타일 높이 범위 + 30m) */
  const perTileDrop = (exaggeration: number) => (mesh: TileMeshArrays, node: TileNode) => {
    const range = Math.max(0, mesh.maxHeightM) - Math.max(0, mesh.minHeightM);
    const drop = tileShape(node, RADIUS).sagM + exaggeration * range + SKIRT_MARGIN_M;
    return (height: number): number => vertexLiftM(height, false, exaggeration, 0) - drop;
  };
  // 바다·해안·가파른 산이 섞인 칸 고도(게임 m, −950 ~ 760)
  const mixed = adrTiles(FACE_LEVEL, (_face, i, j) =>
    Math.max(
      -950,
      Math.min(
        760,
        Math.round(900 * Math.sin(i / 23) * Math.sin(j / 31) + 260 * Math.sin((i + 2 * j) / 7) - 80),
      ),
    ),
  );
  // 온통 바다: 보이는 높이가 모두 0이라 거친 변의 현(활꼴)이 고운 변보다 낮다
  const allSea = adrTiles(FACE_LEVEL, () => -500);

  it.each([1, 6, 50])(
    "거친 타일과 1~3단계 고운 이웃(면 안, 과장 ×%i): 같은 바닥이면 틈이 없다",
    (exaggeration) => {
      for (const tiles of [mixed, allSea]) {
        const { pairs, worst } = worstOverPairs(tiles, exaggeration, sharedFloor);
        expect(pairs).toBeGreaterThan(90);
        expect(worst).toBeLessThanOrEqual(0);
      }
    },
  );

  it("온통 바다에서 2단계 넘게 차이 나는 이웃: 예전 식은 틈이 열렸다(실제 생성기 행성에서 잰 4~9m와 같은 꼴)", () => {
    const { worst } = worstOverPairs(allSea, 6, perTileDrop(6));
    expect(worst).toBeGreaterThan(1);
  });
});
