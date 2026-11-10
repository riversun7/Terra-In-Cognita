// 누른 곳 찾기 — 순수 코드(시험 대상).
// - 유닛: 화면에 투영한 점 가운데 누른 곳에서 가장 가까운 것(화면 거리). 내 유닛은 반경을 넉넉히, 남의 유닛은 몸 위를 눌렀을 때만(pickUnit).
// - 땅: 시선을 따라 높이 지도(heightAt) 아래로 들어가는 첫 점(일정 간격으로 걷고 이분법으로 좁힌다).
// - 건물: 조각마다 축 정렬 상자와 시선이 만나는 거리(rayBoxDistance, buildings/buildingView.ts pick).
import type { GroundPoint, ScreenPoint, Vec3 } from "./camera/cameraMath.ts";

/** 넉넉한 누르기 반경(CSS px) — 누름 영역 44px의 반. 내 유닛(넉넉히 고르는 유닛)에 쓴다. 몸 높이의 반을 더한다 */
export const WIDE_TAP_RADIUS_PX = 22;
/** 몸 누르기: 화면에 보이는 몸 상자 둘레로 더 받아 주는 거리(CSS px) — 손가락 오차 */
export const BODY_TAP_MARGIN_PX = 6;
/** 몸 누르기: 몸이 작게 보여도(먼 확대·점 표시) 받는 가장 작은 반 너비·반 높이(CSS px) — 28px 네모 */
export const BODY_TAP_MIN_HALF_PX = 14;

/**
 * 누른 유닛 찾기(사용자 지적 2026-11-10 "다른 유닛 클릭 후 이동지역 클릭시 무시하고 본인 유닛이 이동하게 하라",
 * docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-10)"): 유닛마다 누르기 규칙이 둘이다.
 * - 넉넉히(wide[i] ≠ 0, 내 유닛): 몸 가운데에서 WIDE_TAP_RADIUS_PX + 몸 반 높이 안(앞 규칙 그대로 — 작은 내 유닛도 쉽게 고른다).
 * - 몸(그 밖, 남의 유닛): 누른 곳이 몸 상자(반 너비 halfW·반 높이 halfH) + BODY_TAP_MARGIN_PX 안일 때만. 상자가 작으면
 *   BODY_TAP_MIN_HALF_PX까지 키운다. 빗나간 누르기는 유닛이 아니라 땅 누르기가 된다(이동이 쉽게).
 * 규칙에 든 유닛 가운데 몸 가운데가 가장 가까운 것의 번호. 없으면 -1. visible[i]가 0인 점은 보지 않는다
 */
export function pickUnit(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  visible: ArrayLike<number>,
  count: number,
  tap: ScreenPoint,
  halfW: ArrayLike<number>,
  halfH: ArrayLike<number>,
  wide: ArrayLike<number>,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    if (!visible[i]) continue;
    const dx = Math.abs((xs[i] ?? 0) - tap.x);
    const dy = Math.abs((ys[i] ?? 0) - tap.y);
    const distance = Math.hypot(dx, dy);
    if (distance >= bestDistance) continue;
    const bodyH = halfH[i] ?? 0;
    const hit = wide[i]
      ? distance <= WIDE_TAP_RADIUS_PX + bodyH
      : dx <= Math.max(BODY_TAP_MIN_HALF_PX, (halfW[i] ?? 0) + BODY_TAP_MARGIN_PX) &&
        dy <= Math.max(BODY_TAP_MIN_HALF_PX, bodyH + BODY_TAP_MARGIN_PX);
    if (hit) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 시선이 땅(heightAt)에 닿는 점. 땅 높이 범위 [minY, maxY] 안에서만 걷는다. 닿지 않으면 null.
 * step(m)은 지형 칸보다 작게 둔다(언덕을 건너뛰지 않게).
 */
export function rayHitsTerrain(
  origin: Vec3,
  dir: Vec3,
  heightAt: (x: number, z: number) => number,
  minY: number,
  maxY: number,
  step: number,
): (GroundPoint & { y: number }) | null {
  const length = Math.hypot(dir.x, dir.y, dir.z);
  if (length === 0 || dir.y >= 0) return null;
  const dx = dir.x / length;
  const dy = dir.y / length;
  const dz = dir.z / length;
  // 높이 범위로 걷는 구간을 묶는다: y = maxY에서 시작해 y = minY에서 끝
  const tStart = Math.max(0, (maxY - origin.y) / dy);
  const tEnd = (minY - origin.y) / dy;
  if (tEnd < 0) return null;
  const above = (t: number): boolean => origin.y + dy * t > heightAt(origin.x + dx * t, origin.z + dz * t);
  let previous = tStart;
  if (!above(previous)) return pointAt(origin, dx, dy, dz, previous);
  for (let t = tStart + step; t <= tEnd + step; t += step) {
    const current = Math.min(t, tEnd);
    if (!above(current)) {
      // 이분법으로 좁힌다
      let low = previous;
      let high = current;
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        if (above(mid)) low = mid;
        else high = mid;
      }
      return pointAt(origin, dx, dy, dz, high);
    }
    previous = current;
    if (current === tEnd) break;
  }
  return null;
}

/**
 * 시선(원점, 단위 방향)이 축 정렬 상자(min·max)에 들어가는 거리(m). 원점이 상자 안이면 0, 만나지 않거나 뒤쪽이면 null(slab 방법)
 */
export function rayBoxDistance(
  origin: Vec3,
  dir: Vec3,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number | null {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  const axes: readonly [number, number, number, number][] = [
    [origin.x, dir.x, minX, maxX],
    [origin.y, dir.y, minY, maxY],
    [origin.z, dir.z, minZ, maxZ],
  ];
  for (const [o, d, low, high] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < low || o > high) return null;
      continue;
    }
    let t0 = (low - o) / d;
    let t1 = (high - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return null;
  }
  return near;
}

function pointAt(origin: Vec3, dx: number, dy: number, dz: number, t: number): GroundPoint & { y: number } {
  return { x: origin.x + dx * t, y: origin.y + dy * t, z: origin.z + dz * t };
}
