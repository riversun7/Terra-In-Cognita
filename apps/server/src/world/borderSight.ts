// 경계 너머 시야 원 — 옆 2차맵에 선 내 유닛의 시야를 이 2차맵 덮개에 찍는다(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)").
// vision.ts(덮개)와 edgeWatch.ts(어느 유닛이 닿는지)가 같이 쓴다. 원 모양·반지름은 2차맵 안 시야(@terra/sim stampVision)와 같다. 정수만 쓴다.
import { CELL_UNITS, UNIT_VISION_CELLS, VISION_CELL, VISION_SIDE, visionRadius } from "@terra/sim";

const UNIT_RADIUS = visionRadius(UNIT_VISION_CELLS);
/** 시야 칸 한 변(단위) */
const UNITS_PER_VISION_CELL = VISION_CELL * CELL_UNITS;
/** 유닛 시야 원이 2차맵 밖에서 경계 너머에 닿는 가장 먼 거리(단위, 변에서) — edgeWatch.ts가 이 안의 유닛만 준다 */
export const BORDER_SIGHT_UNITS = UNIT_RADIUS * UNITS_PER_VISION_CELL;

/** 옆 2차맵에 선 내 유닛 하나의 시야 자리: 이 2차맵의 늘인 틀(단위, 2차맵 밖) */
export interface BorderSight {
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
}

/** 2차맵 밖 자리의 유닛 시야 원을 덮개에 더한다(2차맵 안 칸만 — stampVision과 같은 원, 가운데가 밖이어도 된다) */
export function stampBorder(cover: Uint16Array, sight: BorderSight): void {
  const cx = Math.floor(sight.x / UNITS_PER_VISION_CELL);
  const cy = Math.floor(sight.y / UNITS_PER_VISION_CELL);
  const limit = UNIT_RADIUS * UNIT_RADIUS + UNIT_RADIUS;
  for (let dy = -UNIT_RADIUS; dy <= UNIT_RADIUS; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= VISION_SIDE) continue;
    for (let dx = -UNIT_RADIUS; dx <= UNIT_RADIUS; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= VISION_SIDE || dx * dx + dy * dy > limit) continue;
      const index = y * VISION_SIDE + x;
      cover[index] = (cover[index] ?? 0) + 1;
    }
  }
}
