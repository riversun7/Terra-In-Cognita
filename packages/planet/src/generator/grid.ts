// 생성기용 격자: 면 레벨 F의 모든 칸을 배열 하나로 (칸 번호 = 면 × n² + j × n + i, n = 2^F)
// 칸 중심(단위 벡터)·칸 면적·8이웃. 면 경계는 @terra/planet의 wrapFaceIJ(변환표)로 넘는다.
// 정육면체 꼭짓점에 닿은 칸은 꼭짓점 쪽 대각선 이웃이 없다(-1).
import { detAtan } from "@terra/shared";
import { FACES, FACE_FRAMES, wrapFaceIJ } from "../faces.ts";
import { cellsPerSide } from "../levels.ts";
import { stToUV } from "../projection.ts";

export interface PlanetGrid {
  readonly faceLevel: number;
  /** 면 한 변의 칸 수 2^F */
  readonly n: number;
  /** 면 하나의 칸 수 n² */
  readonly faceCells: number;
  /** 모든 칸 수 6n² */
  readonly cellCount: number;
  /** 칸 중심 단위 벡터 성분 */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** 칸 면적(스테라디안). 여섯 면이 합동이라 면 하나(j × n + i) 표를 같이 쓴다: areaOf() */
  readonly faceArea: Float64Array;
  /** 평균 칸 크기(라디안) = √(4π / 칸 수) */
  readonly meanCellAngle: number;
}

/** 8이웃 방향 (di, dj): j-1 줄, 같은 줄, j+1 줄 순서로 i-1 → i+1 (@terra/planet neighbors8과 같은 순서) */
export const NEIGHBOR_DI: readonly number[] = [-1, 0, 1, -1, 1, -1, 0, 1];
export const NEIGHBOR_DJ: readonly number[] = [-1, -1, -1, 0, 0, 1, 1, 1];

export function buildGrid(faceLevel: number): PlanetGrid {
  const n = cellsPerSide(faceLevel);
  const faceCells = n * n;
  const cellCount = 6 * faceCells;
  // 칸 중심의 면 평면 좌표(i, j 공통) — 탄젠트 투영
  const center = new Float64Array(n);
  for (let i = 0; i < n; i++) center[i] = stToUV((i + 0.5) / n);
  const x = new Float64Array(cellCount);
  const y = new Float64Array(cellCount);
  const z = new Float64Array(cellCount);
  for (const face of FACES) {
    const { normal, uAxis, vAxis } = FACE_FRAMES[face];
    for (let j = 0; j < n; j++) {
      const v = center[j] ?? 0;
      for (let i = 0; i < n; i++) {
        const u = center[i] ?? 0;
        const px = normal[0] + u * uAxis[0] + v * vAxis[0];
        const py = normal[1] + u * uAxis[1] + v * vAxis[1];
        const pz = normal[2] + u * uAxis[2] + v * vAxis[2];
        const length = Math.sqrt(px * px + py * py + pz * pz);
        const c = face * faceCells + j * n + i;
        x[c] = px / length;
        y[c] = py / length;
        z[c] = pz / length;
      }
    }
  }
  return {
    faceLevel,
    n,
    faceCells,
    cellCount,
    x,
    y,
    z,
    faceArea: faceAreaTableOfSide(n),
    meanCellAngle: Math.sqrt((4 * Math.PI) / cellCount),
  };
}

/**
 * 면 레벨 faceLevel의 칸 면적 표(스테라디안, 길이 n², 번호 j × n + i): 여섯 면이 합동이라 면 하나 표로 모든 칸을 센다
 * (칸 c의 면적 = 표[c % n²]). 편집기 면적표·요약(summary.ts)이 쓴다(ADR 38 12절). 면 레벨이 범위 밖이면 RangeError
 */
export function faceAreaTable(faceLevel: number): Float64Array {
  return faceAreaTableOfSide(cellsPerSide(faceLevel));
}

/**
 * 면 하나의 칸 면적 표: 면 평면 직사각형 [u0, u1] × [v0, v1]을 구에 비춘 입체각
 * Ω = G(u1, v1) - G(u0, v1) - G(u1, v0) + G(u0, v0),  G(u, v) = atan(u·v / √(1 + u² + v²)) (projection.ts와 같은 식)
 */
function faceAreaTableOfSide(n: number): Float64Array {
  const edge = new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) edge[k] = stToUV(k / n);
  const side = n + 1;
  const corner = new Float64Array(side * side);
  for (let l = 0; l <= n; l++) {
    const v = edge[l] ?? 0;
    for (let k = 0; k <= n; k++) {
      const u = edge[k] ?? 0;
      corner[l * side + k] = detAtan((u * v) / Math.sqrt(1 + u * u + v * v));
    }
  }
  const area = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      area[j * n + i] =
        (corner[(j + 1) * side + i + 1] ?? 0) -
        (corner[(j + 1) * side + i] ?? 0) -
        (corner[j * side + i + 1] ?? 0) +
        (corner[j * side + i] ?? 0);
    }
  }
  return area;
}

/** 칸 c의 면적(스테라디안) */
export function areaOf(grid: PlanetGrid, c: number): number {
  return grid.faceArea[c % grid.faceCells] ?? 0;
}

/**
 * 칸 c의 8이웃을 out[0..7]에 쓴다(없으면 -1). 순서는 NEIGHBOR_DI·NEIGHBOR_DJ.
 * 면 안쪽 칸은 번호 차이로, 면 가장자리 칸은 변환표(wrapFaceIJ)로 구한다.
 */
export function neighbors8(grid: PlanetGrid, c: number, out: Int32Array): void {
  const { n, faceCells, faceLevel } = grid;
  const face = Math.floor(c / faceCells);
  const rest = c - face * faceCells;
  const j = Math.floor(rest / n);
  const i = rest - j * n;
  if (i > 0 && i < n - 1 && j > 0 && j < n - 1) {
    out[0] = c - n - 1;
    out[1] = c - n;
    out[2] = c - n + 1;
    out[3] = c - 1;
    out[4] = c + 1;
    out[5] = c + n - 1;
    out[6] = c + n;
    out[7] = c + n + 1;
    return;
  }
  for (let k = 0; k < 8; k++) {
    const target = wrapFaceIJ(
      FACES[face] ?? 0,
      faceLevel,
      i + (NEIGHBOR_DI[k] ?? 0),
      j + (NEIGHBOR_DJ[k] ?? 0),
    );
    out[k] = target ? target.face * faceCells + target.j * n + target.i : -1;
  }
}

/** 두 칸 중심 사이 현(chord) 길이(단위 구). 가까운 칸 사이에서는 각도(라디안)와 거의 같다 */
export function chordBetween(grid: PlanetGrid, a: number, b: number): number {
  const dx = (grid.x[a] ?? 0) - (grid.x[b] ?? 0);
  const dy = (grid.y[a] ?? 0) - (grid.y[b] ?? 0);
  const dz = (grid.z[a] ?? 0) - (grid.z[b] ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
