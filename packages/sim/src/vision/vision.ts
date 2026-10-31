// 2차맵 시야 칸·경로 자르기 — docs/adr/2026-10-31-s3-server-stage.md 3절 (ADR 7 "남의 경로는 보이는 구간만", ADR 26)
// - 시야 칸 = 배치 칸 8×8, 2차맵 하나에 32×32(약 47m). 덮임은 칸마다 세는 수(겹쳐 덮어도 된다).
// - 반지름 R(시야 칸 수) 안: dx² + dy² ≤ R² + R. 정수만 쓴다.
// - 남의 유닛 경로는 지금 덮인 칸을 벗어나는 곳 또는 horizon 뒤에서 자른다(경로 전체는 목적지를 드러낸다).
// [임시] 반지름 수치는 기획 Step 5 전 시험값이다(D-107·D-5037, 기획 질문 알림).
import { type Motion, arrivalAt, createMotion, positionAt } from "../motion/motion.ts";
import { CELL_UNITS, PLACEMENT_SIZE, type Point } from "../units.ts";

/** 시야 칸 한 변의 배치 칸 수 */
export const VISION_CELL = 8;
/** 2차맵 한 변의 시야 칸 수(32) */
export const VISION_SIDE = PLACEMENT_SIZE / VISION_CELL;
export const VISION_CELLS = VISION_SIDE * VISION_SIDE;
/** 시야 칸 비트 모음 바이트 수(32×32 / 8 = 128, world_exploration.cells와 같다) */
export const VISION_BYTES = VISION_CELLS / 8;
/** [임시] 시야 반지름(배치 칸): 유닛 24칸(약 140m), 건물 16칸 */
export const UNIT_VISION_CELLS = 24;
export const BUILDING_VISION_CELLS = 16;

const UNITS_PER_VISION_CELL = VISION_CELL * CELL_UNITS;

/** 위치(고정소수점)가 든 시야 칸 번호(밖이면 가장자리로) */
export function visionCellOf(point: Point): number {
  const clamp = (v: number) => Math.min(VISION_SIDE - 1, Math.max(0, Math.floor(v / UNITS_PER_VISION_CELL)));
  return clamp(point.y) * VISION_SIDE + clamp(point.x);
}

/** 배치 칸 반지름 → 시야 칸 반지름(올림) */
export function visionRadius(placementCells: number): number {
  return Math.ceil(placementCells / VISION_CELL);
}

/** cover의 (cx, cy) 둘레 반지름 radius 시야 칸을 1씩 올린다(덮인 칸 수를 센다) */
export function stampVision(cover: Uint16Array, cell: number, radius: number): void {
  const cx = cell % VISION_SIDE;
  const cy = Math.floor(cell / VISION_SIDE);
  const limit = radius * radius + radius;
  for (let dy = -radius; dy <= radius; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= VISION_SIDE) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= VISION_SIDE || dx * dx + dy * dy > limit) continue;
      const index = y * VISION_SIDE + x;
      cover[index] = (cover[index] ?? 0) + 1;
    }
  }
}

/** 덮인 칸을 비트 모음에 더한다(탐사 기록). 새로 켠 비트가 있으면 true */
export function addCoverBits(bits: Uint8Array, cover: Uint16Array): boolean {
  let changed = false;
  for (let index = 0; index < VISION_CELLS; index++) {
    if ((cover[index] ?? 0) === 0) continue;
    const byte = index >> 3;
    const mask = 1 << (index & 7);
    const old = bits[byte] ?? 0;
    if ((old & mask) === 0) {
      bits[byte] = old | mask;
      changed = true;
    }
  }
  return changed;
}

export function hasBit(bits: Uint8Array, index: number): boolean {
  return ((bits[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

/**
 * 경로를 fromMs부터 따라가 덮인 칸을 벗어나기 전 마지막 시각(stepMs 간격, horizonMs까지)을 찾는다.
 * 서 있거나 이미 도착했으면 fromMs. 시작 칸이 덮이지 않았으면 undefined(보이지 않음).
 */
export function visibleUntil(
  motion: Motion,
  fromMs: number,
  covered: (cell: number) => boolean,
  horizonMs: number,
  stepMs: number,
): number | undefined {
  if (!covered(visionCellOf(positionAt(motion, fromMs)))) return undefined;
  const end = Math.min(arrivalAt(motion), fromMs + horizonMs);
  let last = fromMs;
  for (let t = fromMs + stepMs; t <= end; t += stepMs) {
    if (!covered(visionCellOf(positionAt(motion, t)))) return last;
    last = t;
  }
  if (last < end && covered(visionCellOf(positionAt(motion, end)))) return end;
  return last;
}

/** 경로의 [fromMs, toMs] 구간만 남긴 움직임(fromMs 출발, 속도 그대로). 끝은 toMs의 위치다 */
export function truncateMotion(motion: Motion, fromMs: number, toMs: number): Motion {
  const start = positionAt(motion, fromMs);
  const waypoints: Point[] = [start];
  for (let i = 1; i < motion.waypoints.length; i++) {
    const at = motion.arrivals[i] ?? 0;
    const point = motion.waypoints[i];
    if (!point || at <= fromMs) continue;
    if (at >= toMs) break;
    waypoints.push(point);
  }
  const end = positionAt(motion, toMs);
  const lastPoint = waypoints[waypoints.length - 1];
  if (!lastPoint || lastPoint.x !== end.x || lastPoint.y !== end.y) waypoints.push(end);
  return createMotion({ waypoints, departAtMs: fromMs, speed: motion.speed });
}
