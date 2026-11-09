// 이동 경로 표시의 순수 계산 — 사용자 요청 2026-11-09 "2차맵에서 이동 클릭시 목적지와 경로를 표시하는 ui 추가".
// - drapeRoute: 서버 경로(꺾이는 점, 배치 칸)를 일정 간격으로 잘라 땅 위 띠의 가운데 점·옆 방향·누적 길이로 만든다(그리는 쪽은 routeView.ts).
// - createTargetLife: 누른 목적지 표시를 언제 거둘지. 명령 뒤 새 경로가 와서 움직이다 멈추면(도착·멈추기) 거둔다. 새 경로가 TARGET_WAIT_MS 안에
//   오지 않으면(거절·길 없음) 거둔다.
// 좌표: 배치 칸(x = 동쪽, y = 남쪽). 길이도 배치 칸.

/** 누른 뒤 움직이기 시작하지 않으면 목적지 표시를 거두기까지(ms) */
export const TARGET_WAIT_MS = 5_000;

export interface DrapedRoute {
  /** 가운데 점(배치 칸) x, y, … */
  readonly centres: Float32Array;
  /** 옆 방향(단위 벡터, 진행 방향에 수직) x, y, … — 띠는 이 방향 양쪽으로 넓힌다 */
  readonly normals: Float32Array;
  /** 출발점부터 누적 길이(배치 칸) */
  readonly distances: Float32Array;
}

/**
 * 경로를 step(배치 칸) 간격 이하로 자른다. 꺾이는 점은 그대로 넣는다(모서리가 둥글게 깎이지 않게). 옆 방향은 꺾이는 점에서 앞뒤 구간의 평균.
 * 점이 둘 미만이거나 길이가 0이면 null
 */
export function drapeRoute(points: ArrayLike<number>, step: number): DrapedRoute | null {
  const pointCount = Math.floor(points.length / 2);
  if (pointCount < 2 || !(step > 0)) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const ds: number[] = [];
  const dirX: number[] = [];
  const dirY: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < pointCount; i++) {
    const ax = Number(points[i * 2]);
    const ay = Number(points[i * 2 + 1]);
    const bx = Number(points[i * 2 + 2]);
    const by = Number(points[i * 2 + 3]);
    const length = Math.hypot(bx - ax, by - ay);
    if (length <= 0) continue;
    const ux = (bx - ax) / length;
    const uy = (by - ay) / length;
    const pieces = Math.max(1, Math.ceil(length / step));
    // 구간 시작점(앞 구간 끝과 같은 점이면 방향만 평균)
    if (xs.length === 0) {
      xs.push(ax);
      ys.push(ay);
      ds.push(0);
      dirX.push(ux);
      dirY.push(uy);
    } else {
      const last = dirX.length - 1;
      dirX[last] = (dirX[last] ?? 0) + ux;
      dirY[last] = (dirY[last] ?? 0) + uy;
    }
    for (let k = 1; k <= pieces; k++) {
      const t = k / pieces;
      xs.push(ax + (bx - ax) * t);
      ys.push(ay + (by - ay) * t);
      ds.push(total + length * t);
      dirX.push(ux);
      dirY.push(uy);
    }
    total += length;
  }
  if (xs.length < 2) return null;
  const n = xs.length;
  const centres = new Float32Array(n * 2);
  const normals = new Float32Array(n * 2);
  const distances = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    centres[i * 2] = xs[i] ?? 0;
    centres[i * 2 + 1] = ys[i] ?? 0;
    distances[i] = ds[i] ?? 0;
    const dx = dirX[i] ?? 1;
    const dy = dirY[i] ?? 0;
    const length = Math.hypot(dx, dy) || 1;
    // 진행 방향 (dx, dy)에 수직인 (dy, −dx)를 정규화
    normals[i * 2] = dy / length;
    normals[i * 2 + 1] = -dx / length;
  }
  return { centres, normals, distances };
}

export interface TargetLife {
  /** 누른 목적지를 둔다(null이면 거둔다). revision = 그때 그 유닛의 경로 판 */
  set(target: { x: number; y: number } | null, revision: number, nowMs: number): void;
  /** 프레임마다: 그 유닛의 지금 경로 판·움직이는 중. 남아 있는 목적지(없으면 null)를 돌려준다 */
  update(revision: number, moving: boolean, nowMs: number): { x: number; y: number } | null;
}

export function createTargetLife(waitMs = TARGET_WAIT_MS): TargetLife {
  let target: { x: number; y: number } | null = null;
  let revisionAtSet = 0;
  let setAt = 0;
  let sawMoving = false;
  return {
    set(next, revision, nowMs) {
      target = next;
      revisionAtSet = revision;
      setAt = nowMs;
      sawMoving = false;
    },
    update(revision, moving, nowMs) {
      if (!target) return null;
      // 명령 뒤에 온 새 경로로 움직이는 것만 센다(다시 길을 찾느라 잠깐 세운 옛 경로는 아니다)
      const fresh = revision !== revisionAtSet;
      if (fresh && moving) sawMoving = true;
      if ((sawMoving && !moving) || (!sawMoving && nowMs - setAt >= waitMs)) target = null;
      return target;
    },
  };
}
