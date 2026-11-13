// 시야 칸(32×32 비트, 128바이트) 판정 도우미 — 지형 안개(terrainMaterial.ts)·소품·건물·어군 가시성에서 함께 쓴다.
import { PLACEMENT_CELLS } from "./terrainData.ts";

/** 시야 격자 한 변 칸 수 */
export const FOG_SIDE = 32;
/** 배치 칸(256²) → 시야 칸(32²) 나누는 비트 수(256 / 32 = 8) */
const PLACEMENT_SHIFT = 3;

/** 배치 칸 (px, py) (0 ~ 255)가 탐사된 시야 칸 안인지 */
export function isPlacementExplored(bits: Uint8Array, px: number, py: number): boolean {
  if (px < 0 || py < 0 || px >= PLACEMENT_CELLS || py >= PLACEMENT_CELLS) return false;
  const vx = px >> PLACEMENT_SHIFT;
  const vz = py >> PLACEMENT_SHIFT;
  const index = vz * FOG_SIDE + vx;
  return ((bits[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}
