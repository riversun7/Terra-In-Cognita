// 누른 곳 찾기 — 순수 코드(시험 대상).
// - 유닛: 화면에 투영한 점 가운데 누른 곳에서 가장 가까운 것(화면 거리). 실제 크기 유닛은 작아서 누르는 반경을 넉넉히 둔다.
// - 땅: 시선을 따라 높이 지도(heightAt) 아래로 들어가는 첫 점(일정 간격으로 걷고 이분법으로 좁힌다).
import type { GroundPoint, ScreenPoint, Vec3 } from "./camera/cameraMath.ts";

/**
 * 누른 곳(tap)에서 radius(CSS px) 안의 가장 가까운 점 번호. 없으면 -1.
 * visible[i]가 0인 점(카메라 뒤 등)은 보지 않는다. extra[i]가 있으면 그 점만 반경을 더 넓힌다(크게 보이는 유닛).
 */
export function pickNearest(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  visible: ArrayLike<number>,
  count: number,
  tap: ScreenPoint,
  radius: number,
  extra?: ArrayLike<number>,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    if (!visible[i]) continue;
    const dx = (xs[i] ?? 0) - tap.x;
    const dy = (ys[i] ?? 0) - tap.y;
    const distance = Math.hypot(dx, dy);
    const limit = radius + (extra?.[i] ?? 0);
    if (distance <= limit && distance < bestDistance) {
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

function pointAt(origin: Vec3, dx: number, dy: number, dz: number, t: number): GroundPoint & { y: number } {
  return { x: origin.x + dx * t, y: origin.y + dy * t, z: origin.z + dz * t };
}
