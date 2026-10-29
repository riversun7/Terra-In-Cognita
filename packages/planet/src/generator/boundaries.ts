// 판 경계 지형: 경계 칸마다 지형 종류(충돌·안데스·해구·섬 호·열곡)와 세기, 경계를 따라 섞기 (tectonics.ts가 쓴다)
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { km } from "./util.ts";

// 경계 지형 종류
export const FEATURE_NONE = 0;
export const FEATURE_COLLISION = 1;
export const FEATURE_ANDEAN = 2;
export const FEATURE_TRENCH = 3;
export const FEATURE_ISLAND_ARC = 4;
export const FEATURE_RIFT = 5;

/** 경계 지형 종류 수(충돌·안데스·해구·섬 호·열곡) */
export const FEATURE_KINDS = 5;
/** 경계 지형 세기를 경계를 따라 섞는 거리: 종류가 바뀌는 곳에서 산맥이 칼로 자른 듯 끊기지 않게 */
const BOUNDARY_BLEND = km(150);

export interface BoundaryMix {
  /** 칸 → 경계 자리 번호(경계 칸이 아니거나 세기가 모두 0이면 -1) */
  readonly slot: Int32Array;
  /** 자리마다 지형 종류별 세기(FEATURE_KINDS개씩: 충돌, 안데스, 해구, 섬 호, 열곡) */
  readonly weight: Float32Array;
}

/**
 * 경계 칸마다 지형 종류 하나였던 세기를 종류별 세기 묶음으로 바꾸고, 같은 판의 이웃 경계 칸끼리 몇 번 평균한다.
 * 그러면 충돌 산맥이 안데스형으로, 산맥이 해령 쪽으로 서서히 바뀐다.
 */
export function blendBoundaryFeatures(
  grid: PlanetGrid,
  plate: Uint8Array,
  feature: Uint8Array,
  strength: Float32Array,
): BoundaryMix {
  const count = grid.cellCount;
  const slot = new Int32Array(count).fill(-1);
  const cells: number[] = [];
  const out = new Int32Array(8);
  for (let c = 0; c < count; c++) {
    neighbors8(grid, c, out);
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next >= 0 && plate[next] !== plate[c]) {
        slot[c] = cells.length;
        cells.push(c);
        break;
      }
    }
  }
  let weight = new Float32Array(cells.length * FEATURE_KINDS);
  cells.forEach((c, s) => {
    const kind = feature[c] ?? FEATURE_NONE;
    if (kind !== FEATURE_NONE) weight[s * FEATURE_KINDS + kind - 1] = strength[c] ?? 0;
  });
  const passes = Math.max(1, Math.round(BOUNDARY_BLEND / grid.meanCellAngle));
  let next = new Float32Array(weight.length);
  const sums = new Float64Array(FEATURE_KINDS);
  for (let pass = 0; pass < passes; pass++) {
    for (let s = 0; s < cells.length; s++) {
      const c = cells[s] ?? 0;
      neighbors8(grid, c, out);
      let n = 1;
      for (let kind = 0; kind < FEATURE_KINDS; kind++) sums[kind] = weight[s * FEATURE_KINDS + kind] ?? 0;
      for (let k = 0; k < 8; k++) {
        const other = out[k] ?? -1;
        if (other < 0 || plate[other] !== plate[c]) continue;
        const otherSlot = slot[other] ?? -1;
        if (otherSlot < 0) continue;
        n++;
        for (let kind = 0; kind < FEATURE_KINDS; kind++) {
          sums[kind] = (sums[kind] ?? 0) + (weight[otherSlot * FEATURE_KINDS + kind] ?? 0);
        }
      }
      for (let kind = 0; kind < FEATURE_KINDS; kind++) next[s * FEATURE_KINDS + kind] = (sums[kind] ?? 0) / n;
    }
    [weight, next] = [next, weight];
  }
  cells.forEach((c, s) => {
    let total = 0;
    for (let kind = 0; kind < FEATURE_KINDS; kind++) total += weight[s * FEATURE_KINDS + kind] ?? 0;
    if (total < 1e-4) slot[c] = -1;
  });
  return { slot, weight };
}
