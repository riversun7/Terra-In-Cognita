// 타일 메시 만들기 — 순수 함수. Web Worker(tileWorker.ts)에서 돌고, 워커를 못 쓰면 화면 스레드에서 돈다.
// three.js를 쓰지 않는다(워커 조각을 작게): 타입 배열만 만들고 화면 스레드가 BufferGeometry·DataTexture로 감싼다.
// - 꼭짓점: 한 변 segments + 1개(32칸 타일은 33×33 = 칸 꼭짓점 그대로). 면 전체 타일(32칸 미만)은 32마디로 나누고 높이는 이중선형.
// - 카메라 기준 좌표(ADR 36, PLAN 5.7): 타일마다 원점(타일 가운데 방향 × 반지름, 실수 64비트)을 두고, 꼭짓점은 원점 기준 32비트다.
//   꼭짓점 위치는 해수면 구 위 점이다. 높이는 셰이더가 위쪽(원점 + 위치의 방향)으로 올린다: max(높이, 0) × 과장.
//   해수면 아래는 해수면 구에 그린다 = 바다는 해수면 높이의 구다(타일이 그 자리를 그린다, 따로 겹친 구가 없어 해안이 어긋나지 않는다).
// - 법선: 꼭짓점마다 높이 기울기(접평면 위 벡터, m/m)를 둔다. 셰이더가 법선 = 정규화(위쪽 − 과장 × 기울기)로 만든다(과장을 바꿔도 다시 만들지 않는다).
//   타일 가장자리는 한쪽 차분이다(이웃 타일 자료가 없다).
// - 치마(skirt): 네 변마다 같은 꼭짓점을 하나 더 두고(치마 표시 1) 셰이더가 아래로 내린다. 레벨이 다른 이웃 사이 틈을 막는다.
// - 칸 자료: RGBA(바이옴, 물 비트, 기온 + 128, 습도)와 RG(숲, 하천) 텍스처. 셰이더가 칸마다 그대로 읽는다(texelFetch, 칸 경계가 또렷하다).
// - 삼각형 인덱스는 모든 타일이 같다(tileIndices, 하나를 함께 쓴다). 밖에서 보면 반시계(모든 면에서 uAxis × vAxis = 바깥).
import { FACES } from "@terra/planet";
import type { DecodedTile } from "./planetTypes.ts";
import { MIN_SEGMENTS, faceSTDirection } from "./tileShape.ts";

export interface TileMeshArrays {
  /** 타일 원점(행성 중심 기준 m, 실수 64비트) */
  origin: [number, number, number];
  /** 한 변 마디 수 */
  segments: number;
  /** 칸 텍스처 한 변 = 타일 한 변 칸 수 */
  cells: number;
  /** 꼭짓점 위치(원점 기준 m, 해수면 구 위) xyz */
  positions: Float32Array;
  /** 높이 기울기(m/m, 접평면 위) xyz. 해수면 아래 꼭짓점은 0(바다는 평평) */
  grads: Float32Array;
  /** (높이 게임 m, 치마 0·1) */
  heights: Float32Array;
  /** 칸 텍스처 좌표(0~1, Uint16 정규화) */
  uvs: Uint16Array;
  /** 칸 자료 RGBA: 바이옴, 물 비트, 기온(°C) + 128, 습도 */
  cellData: Uint8Array;
  /** 칸 자료 RG: 숲, 하천 등급 */
  cellExtra: Uint8Array;
  /** 꼭짓점 높이 범위(게임 m) */
  minHeightM: number;
  maxHeightM: number;
}

/** 꼭짓점 수: 격자 (segments + 1)² + 치마 4 × (segments + 1) */
export function tileVertexCount(segments: number): number {
  return (segments + 1) * (segments + 1) + 4 * (segments + 1);
}

/** 타일 한 변 칸 수 → 메시 마디 수 */
export function segmentsFor(cells: number): number {
  return Math.max(MIN_SEGMENTS, cells);
}

/** 치마 꼭짓점의 시작 번호(변 e = 0: j = 0, 1: j = 끝, 2: i = 0, 3: i = 끝) */
export function skirtVertexIndex(segments: number, edge: number, k: number): number {
  return (segments + 1) * (segments + 1) + edge * (segments + 1) + k;
}

/** 치마 변 e의 k번째 위쪽(격자) 꼭짓점 번호 */
export function skirtTopIndex(segments: number, edge: number, k: number): number {
  const n = segments + 1;
  if (edge === 0) return k;
  if (edge === 1) return segments * n + k;
  if (edge === 2) return k * n;
  return k * n + segments;
}

const indexCache = new Map<number, Uint16Array>();

/**
 * 삼각형 인덱스(모든 타일 공통). 칸 (a 왼아래, b 오른아래, c 왼위, d 오른위)을 (a, b, d), (a, d, c)로 나눈다 — 바깥에서 반시계.
 * 치마는 변마다 바깥(타일 밖 방향)을 보게 감는다: j=0 → −j, j=끝 → +j, i=0 → −i, i=끝 → +i.
 */
export function tileIndices(segments: number): Uint16Array {
  const cached = indexCache.get(segments);
  if (cached) return cached;
  const n = segments + 1;
  if (tileVertexCount(segments) > 0xffff) throw new RangeError(`too many vertices for Uint16: ${segments}`);
  const indices = new Uint16Array(segments * segments * 6 + 4 * segments * 6);
  let k = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = a;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  for (let edge = 0; edge < 4; edge++) {
    for (let m = 0; m < segments; m++) {
      const t0 = skirtTopIndex(segments, edge, m);
      const t1 = skirtTopIndex(segments, edge, m + 1);
      const b0 = skirtVertexIndex(segments, edge, m);
      const b1 = skirtVertexIndex(segments, edge, m + 1);
      // 변 0(−j)·3(+i): (t0, b0, t1), (t1, b0, b1). 변 1(+j)·2(−i): (t0, t1, b0), (t1, b1, b0)
      if (edge === 0 || edge === 3) {
        indices.set([t0, b0, t1, t1, b0, b1], k);
      } else {
        indices.set([t0, t1, b0, t1, b1, b0], k);
      }
      k += 6;
    }
  }
  indexCache.set(segments, indices);
  return indices;
}

/** 풀어 둔 타일의 모양이 맞는지 — 틀리면 무엇이 틀렸는지 문장(없으면 null) */
export function decodedTileProblem(tile: DecodedTile): string | null {
  const { size } = tile;
  if (!Number.isInteger(size) || size < 1 || size > 256)
    return `size must be an integer in [1, 256]: ${size}`;
  if (!Number.isInteger(tile.face) || tile.face < 0 || tile.face > 5)
    return `face must be 0..5: ${tile.face}`;
  const corners = (size + 1) * (size + 1);
  if (!(tile.heightsM instanceof Int16Array) || tile.heightsM.length !== corners) {
    return `heightsM must be Int16Array(${corners})`;
  }
  const cells = size * size;
  if (!(tile.temperatureC instanceof Int8Array) || tile.temperatureC.length !== cells) {
    return `temperatureC must be Int8Array(${cells})`;
  }
  for (const [name, array] of [
    ["biome", tile.biome],
    ["water", tile.water],
    ["humidity", tile.humidity],
    ["forest", tile.forest],
    ["river", tile.river],
  ] as const) {
    if (!(array instanceof Uint8Array) || array.length !== cells)
      return `${name} must be Uint8Array(${cells})`;
  }
  return null;
}

/** 꼭짓점 (vi, vj)(마디 단위)의 높이: 칸 꼭짓점 높이를 이중선형으로 */
function heightAtVertex(tile: DecodedTile, segments: number, vi: number, vj: number): number {
  const size = tile.size;
  const row = size + 1;
  if (segments === size) return tile.heightsM[vj * row + vi] ?? 0;
  const x = (vi * size) / segments;
  const y = (vj * size) / segments;
  const x0 = Math.min(size - 1, Math.floor(x));
  const y0 = Math.min(size - 1, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const h = (cx: number, cy: number): number => tile.heightsM[cy * row + cx] ?? 0;
  const bottom = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
  const top = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
  return bottom + (top - bottom) * fy;
}

/** 타일 하나의 메시 배열. radiusM = 해수면 반지름 */
export function buildTileMesh(tile: DecodedTile, radiusM: number): TileMeshArrays {
  const problem = decodedTileProblem(tile);
  if (problem) throw new Error(`invalid tile: ${problem}`);
  const face = FACES[tile.face];
  if (face === undefined) throw new Error(`invalid tile: face ${tile.face}`);
  const size = tile.size;
  const segments = segmentsFor(size);
  const n = segments + 1;
  const cellsPerFace = 2 ** tile.mapLevel;
  const stOf = (cellOffset: number, base: number): number => (base + cellOffset) / cellsPerFace;
  const center = faceSTDirection(face, stOf(size / 2, tile.i0), stOf(size / 2, tile.j0));
  const origin: [number, number, number] = [center[0] * radiusM, center[1] * radiusM, center[2] * radiusM];

  // 격자 꼭짓점: 방향(실수 64비트), 해수면 위치, 높이
  const gridCount = n * n;
  const dirs = new Float64Array(gridCount * 3);
  const rawHeights = new Float64Array(gridCount);
  let minHeightM = Number.POSITIVE_INFINITY;
  let maxHeightM = Number.NEGATIVE_INFINITY;
  for (let vj = 0; vj < n; vj++) {
    for (let vi = 0; vi < n; vi++) {
      const v = vj * n + vi;
      const dir = faceSTDirection(
        face,
        stOf((vi * size) / segments, tile.i0),
        stOf((vj * size) / segments, tile.j0),
      );
      dirs[v * 3] = dir[0];
      dirs[v * 3 + 1] = dir[1];
      dirs[v * 3 + 2] = dir[2];
      const h = heightAtVertex(tile, segments, vi, vj);
      rawHeights[v] = h;
      if (h < minHeightM) minHeightM = h;
      if (h > maxHeightM) maxHeightM = h;
    }
  }

  const vertexCount = tileVertexCount(segments);
  const positions = new Float32Array(vertexCount * 3);
  const grads = new Float32Array(vertexCount * 3);
  const heights = new Float32Array(vertexCount * 2);
  const uvs = new Uint16Array(vertexCount * 2);

  // 높이 기울기: 이웃 꼭짓점 차분(가장자리는 한쪽). 보이는 면과 같게 해수면 아래는 0으로 본다
  const shown = (v: number): number => Math.max(0, rawHeights[v] ?? 0);
  const pos = (v: number, axis: number): number => (dirs[v * 3 + axis] ?? 0) * radiusM;
  for (let vj = 0; vj < n; vj++) {
    for (let vi = 0; vi < n; vi++) {
      const v = vj * n + vi;
      const ux = dirs[v * 3] ?? 0;
      const uy = dirs[v * 3 + 1] ?? 0;
      const uz = dirs[v * 3 + 2] ?? 0;
      positions[v * 3] = pos(v, 0) - origin[0];
      positions[v * 3 + 1] = pos(v, 1) - origin[1];
      positions[v * 3 + 2] = pos(v, 2) - origin[2];
      heights[v * 2] = rawHeights[v] ?? 0;
      uvs[v * 2] = Math.round((vi / segments) * 0xffff);
      uvs[v * 2 + 1] = Math.round((vj / segments) * 0xffff);

      const left = vj * n + Math.max(0, vi - 1);
      const right = vj * n + Math.min(segments, vi + 1);
      const down = Math.max(0, vj - 1) * n + vi;
      const up = Math.min(segments, vj + 1) * n + vi;
      // 접평면에 투영한 두 방향 a(i 쪽)·b(j 쪽)과 그 방향의 높이 차
      let ax = pos(right, 0) - pos(left, 0);
      let ay = pos(right, 1) - pos(left, 1);
      let az = pos(right, 2) - pos(left, 2);
      let bx = pos(up, 0) - pos(down, 0);
      let by = pos(up, 1) - pos(down, 1);
      let bz = pos(up, 2) - pos(down, 2);
      const aUp = ax * ux + ay * uy + az * uz;
      ax -= aUp * ux;
      ay -= aUp * uy;
      az -= aUp * uz;
      const bUp = bx * ux + by * uy + bz * uz;
      bx -= bUp * ux;
      by -= bUp * uy;
      bz -= bUp * uz;
      const dha = shown(right) - shown(left);
      const dhb = shown(up) - shown(down);
      // 기울기 g = α·a + β·b, g·a = dha, g·b = dhb (2×2 연립)
      const aa = ax * ax + ay * ay + az * az;
      const ab = ax * bx + ay * by + az * bz;
      const bb = bx * bx + by * by + bz * bz;
      const det = aa * bb - ab * ab;
      if (det > 0) {
        const alpha = (dha * bb - dhb * ab) / det;
        const beta = (dhb * aa - dha * ab) / det;
        grads[v * 3] = alpha * ax + beta * bx;
        grads[v * 3 + 1] = alpha * ay + beta * by;
        grads[v * 3 + 2] = alpha * az + beta * bz;
      }
    }
  }

  // 치마 꼭짓점: 위쪽 꼭짓점과 같은 자리·높이·기울기·텍스처 좌표, 치마 표시 1
  for (let edge = 0; edge < 4; edge++) {
    for (let k = 0; k < n; k++) {
      const top = skirtTopIndex(segments, edge, k);
      const v = skirtVertexIndex(segments, edge, k);
      positions.copyWithin(v * 3, top * 3, top * 3 + 3);
      grads.copyWithin(v * 3, top * 3, top * 3 + 3);
      uvs.copyWithin(v * 2, top * 2, top * 2 + 2);
      heights[v * 2] = heights[top * 2] ?? 0;
      heights[v * 2 + 1] = 1;
    }
  }

  // 칸 자료 텍스처
  const cellCount = size * size;
  const cellData = new Uint8Array(cellCount * 4);
  const cellExtra = new Uint8Array(cellCount * 2);
  for (let c = 0; c < cellCount; c++) {
    cellData[c * 4] = tile.biome[c] ?? 0;
    cellData[c * 4 + 1] = tile.water[c] ?? 0;
    cellData[c * 4 + 2] = Math.max(0, Math.min(255, (tile.temperatureC[c] ?? 0) + 128));
    cellData[c * 4 + 3] = tile.humidity[c] ?? 0;
    cellExtra[c * 2] = tile.forest[c] ?? 0;
    cellExtra[c * 2 + 1] = tile.river[c] ?? 0;
  }

  return {
    origin,
    segments,
    cells: size,
    positions,
    grads,
    heights,
    uvs,
    cellData,
    cellExtra,
    minHeightM,
    maxHeightM,
  };
}

/** 메시 배열이 넘겨줄(transfer) 버퍼들 */
export function meshTransferables(mesh: TileMeshArrays): ArrayBuffer[] {
  return [
    mesh.positions.buffer,
    mesh.grads.buffer,
    mesh.heights.buffer,
    mesh.uvs.buffer,
    mesh.cellData.buffer,
    mesh.cellExtra.buffer,
  ].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
}

/** GPU 메모리 추정(바이트): 꼭짓점 속성 + 칸 텍스처 2장(인덱스는 모든 타일이 함께 쓰므로 뺀다) */
export function tileGpuBytes(
  mesh: Pick<TileMeshArrays, "positions" | "grads" | "heights" | "uvs" | "cellData" | "cellExtra">,
): number {
  return (
    mesh.positions.byteLength +
    mesh.grads.byteLength +
    mesh.heights.byteLength +
    mesh.uvs.byteLength +
    mesh.cellData.byteLength +
    mesh.cellExtra.byteLength
  );
}
