// 경계 너머 시야 — 사용자 지적 2026-11-09 "옆 2차맵이 더 심하게 잘려서 보이지 않는다"(docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜").
// 서버 시야·탐사 기록은 2차맵마다라서, 변 가까이 선 내 유닛의 시야가 옆 2차맵으로 이어지지 않아 이웃 안개가 경계에서 잘렸다.
// 기기가 내 유닛 시야를 옆 2차맵 틀로 옮겨 그 2차맵 안개 칸에 더한다(그림만 — 지형은 숨김 정보가 아니다, ADR 26. 이웃 유닛·건물은 그리지 않는다).
// 규칙은 서버 시야 칸과 같다(@terra/sim vision.ts): 시야 칸 = 배치 칸 8, 유닛 시야 반지름 24칸 → 시야 칸 3, 덮임 dx² + dy² ≤ R² + R.
import type { NeighbourPlacement } from "@terra/engine";

/** 시야 칸 한 변의 배치 칸 수·한 줄 칸 수·비트 바이트(@terra/sim VISION_CELL·VISION_SIDE·VISION_BYTES — 게임 앱은 sim을 가져오지 않는다) */
const VISION_CELL = 8;
const VISION_SIDE = 32;
const VISION_BYTES = 128;
/** [임시] 유닛 시야 반지름(배치 칸, @terra/sim UNIT_VISION_CELLS) */
export const UNIT_SIGHT_CELLS = 24;

/** 지금 2차맵 틀의 점(배치 칸)들이 그 이웃 2차맵에서 덮는 시야 칸 비트(32×32). 덮는 칸이 없으면 null */
export function neighbourSightBits(
  placement: NeighbourPlacement,
  points: readonly { readonly x: number; readonly y: number }[],
  sightCells = UNIT_SIGHT_CELLS,
): Uint8Array | null {
  const radius = Math.ceil(sightCells / VISION_CELL);
  const limit = radius * radius + radius;
  const { a, b, cc, d, tx, tz } = placement;
  let bits: Uint8Array | null = null;
  for (const point of points) {
    // 지금 틀 배치 칸 → 이웃 틀 배치 칸(놓는 자리는 지형 칸 = 배치 칸의 반, 역 = 전치)
    const dx = point.x / 2 - tx;
    const dz = point.y / 2 - tz;
    const cx = Math.floor(((a * dx + cc * dz) * 2) / VISION_CELL);
    const cy = Math.floor(((b * dx + d * dz) * 2) / VISION_CELL);
    if (cx < -radius || cy < -radius || cx >= VISION_SIDE + radius || cy >= VISION_SIDE + radius) continue;
    for (let oy = -radius; oy <= radius; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= VISION_SIDE) continue;
      for (let ox = -radius; ox <= radius; ox++) {
        const x = cx + ox;
        if (x < 0 || x >= VISION_SIDE || ox * ox + oy * oy > limit) continue;
        const index = y * VISION_SIDE + x;
        bits ??= new Uint8Array(VISION_BYTES);
        bits[index >> 3] = (bits[index >> 3] ?? 0) | (1 << (index & 7));
      }
    }
  }
  return bits;
}

/** 두 비트 모음의 합(없으면 다른 것, 둘 다 없으면 null) */
export function unionBits(left: Uint8Array | null, right: Uint8Array | null): Uint8Array | null {
  if (!left) return right;
  if (!right) return left;
  const out = new Uint8Array(VISION_BYTES);
  for (let i = 0; i < VISION_BYTES; i++) out[i] = (left[i] ?? 0) | (right[i] ?? 0);
  return out;
}
