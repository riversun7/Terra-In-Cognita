// 유닛 경로를 다른 틀로 옮기기·보이던 자리에서 잇기 — 순수 계산(시험 대상). 사용자 지적 2026-11-11 "미세한 화면전환의 흔적 … 완전히 자연스럽게
// 연결될순 없는지"(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)").
// - 옆 2차맵 유닛은 그 틀의 경로를 놓는 자리(90° 배수 돌림 + 옮김)로 지금 2차맵 틀로 옮겨 그린다(경로는 곧은 선이라 같은 움직임이다).
// - 서버는 변 끝 칸에 닿은 유닛을 옆 2차맵의 첫 칸에 세운다(travel/service.ts cross) — 한 칸(약 6m)을 건너뛴다. 따라가는 유닛이 그 순간 튀어
//   보이지 않게, 넘은 뒤 잠깐은 새 경로를 "화면에 보이던 자리"에서 시작하게 잇는다(blendPath): 보이던 자리 → 서버의 지금 자리 → 남은 경로.
//   서버 도착 시각에 맞게 조금 빨리 걷는다(상한 BLEND_MAX_SPEEDUP — 넘으면 그만큼 늦게 닿는다). 판정이 아니라 그림만이다.
// 좌표: 배치 칸(2차맵 256×256). 놓는 자리는 지형 칸(배치 칸의 반) 단위다.
import type { NeighbourPlacement, UnitPath } from "@terra/engine";
import { paceFactor, pathProgress } from "@terra/shared/pathProgress";

/** 이보다 가까우면 잇지 않는다(이미 그 자리), 이보다 멀면 잇지 않는다(다른 곳에 나타남 — 그대로 옮긴다). 배치 칸 */
export const BLEND_MIN_CELLS = 0.02;
export const BLEND_MAX_CELLS = 3;
/** 따라잡느라 빨라지는 상한(유닛 속도의 배수) */
export const BLEND_MAX_SPEEDUP = 2;

export interface CellPoint {
  readonly x: number;
  readonly y: number;
}

/** 옆 틀의 점(배치 칸)을 놓는 자리로 지금 틀로 */
export function pointThroughPlacement(point: CellPoint, placement: NeighbourPlacement): CellPoint {
  const { a, b, cc, d, tx, tz } = placement;
  const x = point.x / 2;
  const y = point.y / 2;
  return { x: (a * x + b * y + tx) * 2, y: (cc * x + d * y + tz) * 2 };
}

/** 방향(배치 칸 차이)만 돌린다(옮김 없음) */
export function directionThroughPlacement(direction: CellPoint, placement: NeighbourPlacement): CellPoint {
  const { a, b, cc, d } = placement;
  return { x: a * direction.x + b * direction.y, y: cc * direction.x + d * direction.y };
}

/** 옆 틀의 경로를 지금 틀로(출발 시각·속도는 그대로) */
export function pathThroughPlacement(path: UnitPath, placement: NeighbourPlacement): UnitPath {
  const points = new Float64Array(path.points.length);
  for (let i = 0; i + 1 < points.length; i += 2) {
    const moved = pointThroughPlacement(
      { x: Number(path.points[i]), y: Number(path.points[i + 1]) },
      placement,
    );
    points[i] = moved.x;
    points[i + 1] = moved.y;
  }
  return { ...path, points };
}

/** 경로의 마지막 점(도착점). 점이 없으면 null */
export function pathEnd(path: UnitPath): CellPoint | null {
  const n = path.points.length;
  return n < 2 ? null : { x: Number(path.points[n - 2]), y: Number(path.points[n - 1]) };
}

/**
 * 새 경로를 보이던 자리 shown에서 시작하게 잇는다. 서버 경로에서 지금(nowMs, 서버 시계) 있을 자리로 곧게 간 뒤 남은 경로를 따른다.
 * 보이던 자리가 그 자리와 거의 같거나(BLEND_MIN_CELLS) 너무 멀거나(BLEND_MAX_CELLS) 속도가 0이면 경로를 그대로 돌려준다
 */
export function blendPath(shown: CellPoint, path: UnitPath, nowMs: number): UnitPath {
  const count = Math.floor(path.points.length / 2);
  const speed = path.speedCellsPerSec;
  if (count < 1 || !(speed > 0)) return path;
  const px = (i: number): number => Number(path.points[i * 2]);
  const py = (i: number): number => Number(path.points[i * 2 + 1]);
  // 서버 경로에서 지금 있을 자리(구간 segment 안). 남은 양은 시간 거리(길이 × 걸음 배율 ÷ 1000 — 구간 빠르기, 프로토콜 29)
  const progress = pathProgress(path, nowMs);
  const segment = progress.done ? count - 1 : progress.segment;
  const atX = progress.x;
  const atY = progress.y;
  let remaining = 0;
  if (!progress.done) {
    const length = Math.hypot(px(segment + 1) - px(segment), py(segment + 1) - py(segment));
    remaining = length * (1 - progress.t) * paceFactor(path.paces, segment);
    for (let k = segment + 1; k + 1 < count; k++)
      remaining += Math.hypot(px(k + 1) - px(k), py(k + 1) - py(k)) * paceFactor(path.paces, k);
  }
  const gap = Math.hypot(atX - shown.x, atY - shown.y);
  if (gap < BLEND_MIN_CELLS || gap > BLEND_MAX_CELLS) return path;
  const points: number[] = [shown.x, shown.y, atX, atY];
  // 보이던 자리 → 지금 자리는 기본 빠르기(1000), 그다음은 원래 구간 배율
  const paces: number[] = [1000];
  if (!progress.done) paces.push(Math.round(paceFactor(path.paces, segment) * 1000));
  for (let k = segment + 1; k < count; k++) {
    points.push(px(k), py(k));
    if (k + 1 < count) paces.push(Math.round(paceFactor(path.paces, k) * 1000));
  }
  // 남은 시간 거리를 서버 도착 시각에 맞춰 걷는다(남은 것이 0 = 서 있는 유닛이면 제 속도로 그 자리까지)
  const speedup = remaining > 0 ? Math.min(BLEND_MAX_SPEEDUP, (gap + remaining) / remaining) : 1;
  const blended: UnitPath = { points, departAtMs: nowMs, speedCellsPerSec: speed * speedup };
  if (path.paces !== undefined) blended.paces = paces;
  return blended;
}
