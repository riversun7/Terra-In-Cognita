// 지형 메시 만들기 — 순수 함수. Web Worker(terrainWorker.ts)에서 돌고, 워커를 못 쓰면 화면 스레드에서 돈다.
// three.js를 쓰지 않는다(워커 조각을 작게): 타입 배열만 만들어 돌려주고, 화면 스레드가 BufferGeometry로 감싼다.
// - 윗면: 꼭짓점 129×129를 함께 쓴다. 칸은 대각선 a–d로 나눈다(terrainData.ts의 sampleHeightM과 같은 삼각형).
// - 색: 꼭짓점에 닿은 칸(최대 4개)의 지표 색 평균 × 높이에 따른 밝기. 윗면은 지형 재질(terrainMaterial.ts)이 칸 자료
//   텍스처로 조각마다 다시 칠하므로, 윗면 꼭짓점 색은 예비용이다(가장자리 벽 색은 그대로 쓴다).
// - 가장자리 벽(치마): 2차맵 밖은 그리지 않고, 네 변에 아래로 내린 벽을 붙여 경계를 보인다(장난감 블록 모양).
//   벽 꼭짓점의 법선 y는 0이다 — 지형 재질이 이것으로 벽과 윗면을 가른다.
import {
  type TerrainInput,
  TERRAIN_CELLS,
  TERRAIN_VERTICES,
  terrainProblem,
  vertexHeightM,
} from "./terrainData.ts";
import { HEIGHT_SHADE, heightShadeScale, surfaceRgb, toByte } from "./terrainTextures.ts";

export interface TerrainMeshArrays {
  /** 꼭짓점 위치 xyz(m) */
  positions: Float32Array;
  /** 꼭짓점 법선 xyz */
  normals: Float32Array;
  /** 꼭짓점 색 rgb(0~255, 정규화해서 읽는다) */
  colors: Uint8Array;
  /** 삼각형 인덱스(앞면은 반시계) */
  indices: Uint16Array;
  minHeightM: number;
  maxHeightM: number;
  /** 물 높이보다 낮은 꼭짓점이 있는지(물 판을 그릴지) */
  hasWater: boolean;
}

/** 가장자리 벽 색(흙 단면) */
const SKIRT_RGB = [0.55, 0.42, 0.3] as const;
/** 가장자리 벽을 가장 낮은 땅보다 얼마나 아래까지 내릴지(m) */
const SKIRT_DEPTH_M = 20;

const SURFACE_VERTEX_COUNT = TERRAIN_VERTICES * TERRAIN_VERTICES;
/** 가장자리 벽: 네 변 × 변마다 꼭짓점 129개 × (위, 아래) */
const SKIRT_VERTEX_COUNT = 4 * TERRAIN_VERTICES * 2;

export function buildTerrainMesh(input: TerrainInput): TerrainMeshArrays {
  const problem = terrainProblem(input);
  if (problem) throw new Error(`invalid terrain: ${problem}`);
  const size = input.cellSizeM;
  const vertexCount = SURFACE_VERTEX_COUNT + SKIRT_VERTEX_COUNT;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Uint8Array(vertexCount * 3);

  // 높이 범위
  let minHeightM = Number.POSITIVE_INFINITY;
  let maxHeightM = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < TERRAIN_VERTICES; row++) {
    for (let col = 0; col < TERRAIN_VERTICES; col++) {
      const h = vertexHeightM(input, col, row);
      if (h < minHeightM) minHeightM = h;
      if (h > maxHeightM) maxHeightM = h;
    }
  }
  const heightScale = heightShadeScale(minHeightM, maxHeightM);
  const hasWater = minHeightM < input.waterLevelM;

  // 윗면 꼭짓점
  for (let row = 0; row < TERRAIN_VERTICES; row++) {
    for (let col = 0; col < TERRAIN_VERTICES; col++) {
      const v = row * TERRAIN_VERTICES + col;
      const h = vertexHeightM(input, col, row);
      positions[v * 3] = col * size;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = row * size;

      // 법선: 중앙 차분(가장자리는 한쪽 차분)
      const left = Math.max(0, col - 1);
      const right = Math.min(TERRAIN_VERTICES - 1, col + 1);
      const up = Math.max(0, row - 1);
      const down = Math.min(TERRAIN_VERTICES - 1, row + 1);
      const dhdx =
        (vertexHeightM(input, right, row) - vertexHeightM(input, left, row)) / ((right - left) * size);
      const dhdz = (vertexHeightM(input, col, down) - vertexHeightM(input, col, up)) / ((down - up) * size);
      const length = Math.hypot(dhdx, 1, dhdz);
      normals[v * 3] = -dhdx / length;
      normals[v * 3 + 1] = 1 / length;
      normals[v * 3 + 2] = -dhdz / length;

      // 색: 닿은 칸 평균
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dr = -1; dr <= 0; dr++) {
        for (let dc = -1; dc <= 0; dc++) {
          const cellRow = row + dr;
          const cellCol = col + dc;
          if (cellRow < 0 || cellCol < 0 || cellRow >= TERRAIN_CELLS || cellCol >= TERRAIN_CELLS) continue;
          const rgb = surfaceRgb(input.surface[cellRow * TERRAIN_CELLS + cellCol]);
          r += rgb[0];
          g += rgb[1];
          b += rgb[2];
          n += 1;
        }
      }
      // 높을수록 조금 밝게(깊이감). 물 아래는 조금 어둡게 — 지형 재질도 같은 값으로 조각마다 계산한다
      const shade =
        (HEIGHT_SHADE.base + HEIGHT_SHADE.span * ((h - minHeightM) * heightScale)) *
        (h < input.waterLevelM ? HEIGHT_SHADE.underwater : 1);
      colors[v * 3] = toByte((r / n) * shade);
      colors[v * 3 + 1] = toByte((g / n) * shade);
      colors[v * 3 + 2] = toByte((b / n) * shade);
    }
  }

  // 윗면 삼각형: 칸마다 (a, d, b), (a, c, d) — 위에서 보면 반시계(앞면)
  const surfaceIndexCount = TERRAIN_CELLS * TERRAIN_CELLS * 6;
  const skirtIndexCount = 4 * TERRAIN_CELLS * 6;
  const indices = new Uint16Array(surfaceIndexCount + skirtIndexCount);
  let k = 0;
  for (let row = 0; row < TERRAIN_CELLS; row++) {
    for (let col = 0; col < TERRAIN_CELLS; col++) {
      const a = row * TERRAIN_VERTICES + col;
      const b = a + 1;
      const c = a + TERRAIN_VERTICES;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = d;
      indices[k++] = b;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  // 가장자리 벽: 변마다 (꼭짓점 번호 함수, 바깥 방향)
  const bottom = minHeightM - SKIRT_DEPTH_M;
  const last = TERRAIN_VERTICES - 1;
  const edges: { vertex: (i: number) => number; out: readonly [number, number] }[] = [
    { vertex: (i) => i, out: [0, -1] }, // 북쪽(행 0)
    { vertex: (i) => last * TERRAIN_VERTICES + i, out: [0, 1] }, // 남쪽(마지막 행)
    { vertex: (i) => i * TERRAIN_VERTICES, out: [-1, 0] }, // 서쪽(열 0)
    { vertex: (i) => i * TERRAIN_VERTICES + last, out: [1, 0] }, // 동쪽(마지막 열)
  ];
  let next = SURFACE_VERTEX_COUNT;
  for (const edge of edges) {
    const first = next;
    for (let i = 0; i < TERRAIN_VERTICES; i++) {
      const source = edge.vertex(i);
      const x = positions[source * 3] ?? 0;
      const y = positions[source * 3 + 1] ?? 0;
      const z = positions[source * 3 + 2] ?? 0;
      for (const [index, height] of [
        [next, y],
        [next + 1, bottom],
      ] as const) {
        positions[index * 3] = x;
        positions[index * 3 + 1] = height;
        positions[index * 3 + 2] = z;
        normals[index * 3] = edge.out[0];
        normals[index * 3 + 1] = 0;
        normals[index * 3 + 2] = edge.out[1];
        colors[index * 3] = toByte(SKIRT_RGB[0]);
        colors[index * 3 + 1] = toByte(SKIRT_RGB[1]);
        colors[index * 3 + 2] = toByte(SKIRT_RGB[2]);
      }
      next += 2;
    }
    for (let i = 0; i < TERRAIN_CELLS; i++) {
      const top0 = first + i * 2;
      const bottom0 = top0 + 1;
      const top1 = top0 + 2;
      const bottom1 = top0 + 3;
      k = pushOutwardTriangle(indices, k, positions, edge.out, top0, top1, bottom0);
      k = pushOutwardTriangle(indices, k, positions, edge.out, top1, bottom1, bottom0);
    }
  }

  return { positions, normals, colors, indices, minHeightM, maxHeightM, hasWater };
}

/** 삼각형을 바깥(out 방향)을 보게 넣는다 — 감는 방향이 반대면 두 점을 바꾼다 */
function pushOutwardTriangle(
  indices: Uint16Array,
  k: number,
  positions: Float32Array,
  out: readonly [number, number],
  i0: number,
  i1: number,
  i2: number,
): number {
  const p = (i: number, axis: number): number => positions[i * 3 + axis] ?? 0;
  const ux = p(i1, 0) - p(i0, 0);
  const uy = p(i1, 1) - p(i0, 1);
  const uz = p(i1, 2) - p(i0, 2);
  const vx = p(i2, 0) - p(i0, 0);
  const vy = p(i2, 1) - p(i0, 1);
  const vz = p(i2, 2) - p(i0, 2);
  // 법선의 x·z 성분(u × v)
  const nx = uy * vz - uz * vy;
  const nz = ux * vy - uy * vx;
  const outward = nx * out[0] + nz * out[1] >= 0;
  indices[k] = i0;
  indices[k + 1] = outward ? i1 : i2;
  indices[k + 2] = outward ? i2 : i1;
  return k + 3;
}
