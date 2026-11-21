// 이동 경로 표시의 순수 계산 — 사용자 요청 2026-11-09 "2차맵에서 이동 클릭시 목적지와 경로를 표시하는 ui 추가".
// - drapeRoute: 서버 경로(꺾이는 점, 배치 칸)를 일정 간격으로 잘라 땅 위 띠의 가운데 점·옆 방향·누적 길이로 만든다(그리는 쪽은 routeView.ts).
// - createTargetLife: 누른 목적지 표시를 언제 거둘지. 명령 뒤 새 경로가 와서 움직이다 멈추면(도착·멈추기) 거둔다. 새 경로가 TARGET_WAIT_MS 안에
//   오지 않으면(거절·길 없음) 거둔다.
// 좌표: 배치 칸(x = 동쪽, y = 남쪽). 길이도 배치 칸.

/** 누른 뒤 움직이기 시작하지 않으면 목적지 표시를 거두기까지(ms) */
export const TARGET_WAIT_MS = 5_000;
/** 모서리 둥글리기(이차 베지에) 분할 수 */
const CORNER_STEPS = 8;
/** 거의 직선인 모서리(코사인 값)는 둥글리지 않는다 */
const STRAIGHT_DOT = 0.995;

/** 누른 배치 칸(실수)을 서버가 목표를 맞추는 기준 칸 중심으로 맞춘다 */
export function snapCellCenter(cell: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.floor(cell.x) + 0.5,
    y: Math.floor(cell.y) + 0.5,
  };
}

export interface DrapedRoute {
  /** 가운데 점(배치 칸) x, y, … */
  readonly centres: Float32Array;
  /** 옆 방향(단위 벡터, 진행 방향에 수직) x, y, … — 띠는 이 방향 양쪽으로 넓힌다 */
  readonly normals: Float32Array;
  /** 출발점부터 누적 길이(배치 칸) */
  readonly distances: Float32Array;
}

/**
 * 경로를 step(배치 칸) 간격 이하로 자른다.
 * cornerRadius > 0이면 안쪽 꺾이는 모서리를 이차 베지에 곡선으로 둥글린다(거리 distances는 원래 꺾인 선의 누적 길이에 맞춰 uTravelled와 맞춘다).
 * cornerRadius === 0이면 꺾이는 점을 그대로 넣는다(옆 방향은 앞뒤 구간의 평균). 점이 둘 미만이거나 길이가 0이면 null
 */
export function drapeRoute(points: ArrayLike<number>, step: number, cornerRadius = 0): DrapedRoute | null {
  const pointCount = Math.floor(points.length / 2);
  if (pointCount < 2 || !(step > 0)) return null;
  // 연속된 같은 점(길이 0 구간)을 먼저 정리한다
  const cleanX: number[] = [];
  const cleanY: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    const px = Number(points[i * 2]);
    const py = Number(points[i * 2 + 1]);
    const last = cleanX.length - 1;
    if (last >= 0 && Math.hypot(px - (cleanX[last] ?? 0), py - (cleanY[last] ?? 0)) <= 1e-9) continue;
    cleanX.push(px);
    cleanY.push(py);
  }
  const m = cleanX.length;
  if (m < 2) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  const ds: number[] = [];
  const dirX: number[] = [];
  const dirY: number[] = [];

  if (!(cornerRadius > 0) || m === 2) {
    let total = 0;
    for (let i = 0; i + 1 < m; i++) {
      const ax = cleanX[i] ?? 0;
      const ay = cleanY[i] ?? 0;
      const bx = cleanX[i + 1] ?? 0;
      const by = cleanY[i + 1] ?? 0;
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
  } else {
    // 각 직선 구간의 길이·단위 방향과 원래 꺾인 선의 누적 거리
    const segLen = new Float64Array(m - 1);
    const segUx = new Float64Array(m - 1);
    const segUy = new Float64Array(m - 1);
    const cumDist = new Float64Array(m);
    for (let i = 0; i < m - 1; i++) {
      const dx = (cleanX[i + 1] ?? 0) - (cleanX[i] ?? 0);
      const dy = (cleanY[i + 1] ?? 0) - (cleanY[i] ?? 0);
      const len = Math.hypot(dx, dy);
      segLen[i] = len;
      segUx[i] = len > 0 ? dx / len : 1;
      segUy[i] = len > 0 ? dy / len : 0;
      cumDist[i + 1] = (cumDist[i] ?? 0) + len;
    }
    // 안쪽 모서리마다 둥글리기 반경(앞뒤 구간 길이의 42% 안으로 묶어 서로 겹치지 않게 한다)
    const trims = new Float64Array(m);
    for (let i = 1; i < m - 1; i++) {
      const dot = (segUx[i - 1] ?? 0) * (segUx[i] ?? 0) + (segUy[i - 1] ?? 0) * (segUy[i] ?? 0);
      if (dot >= STRAIGHT_DOT) continue;
      trims[i] = Math.min(cornerRadius, (segLen[i - 1] ?? 0) * 0.42, (segLen[i] ?? 0) * 0.42);
    }
    const pushPoint = (x: number, y: number, d: number, tx: number, ty: number): void => {
      const last = xs.length - 1;
      if (last >= 0 && Math.hypot(x - (xs[last] ?? 0), y - (ys[last] ?? 0)) <= 1e-6) {
        dirX[last] = (dirX[last] ?? 0) + tx;
        dirY[last] = (dirY[last] ?? 0) + ty;
        return;
      }
      xs.push(x);
      ys.push(y);
      ds.push(d);
      dirX.push(tx);
      dirY.push(ty);
    };
    const pushStraight = (
      ax: number,
      ay: number,
      da: number,
      bx: number,
      by: number,
      db: number,
      ux: number,
      uy: number,
    ): void => {
      const len = Math.hypot(bx - ax, by - ay);
      if (xs.length === 0) pushPoint(ax, ay, da, ux, uy);
      if (len <= 1e-6) return;
      const pieces = Math.max(1, Math.ceil(len / step));
      for (let k = 1; k <= pieces; k++) {
        const t = k / pieces;
        pushPoint(ax + (bx - ax) * t, ay + (by - ay) * t, da + (db - da) * t, ux, uy);
      }
    };

    let curX = cleanX[0] ?? 0;
    let curY = cleanY[0] ?? 0;
    let curD = 0;
    for (let i = 1; i < m - 1; i++) {
      const px = cleanX[i] ?? 0;
      const py = cleanY[i] ?? 0;
      const pd = cumDist[i] ?? 0;
      const uInX = segUx[i - 1] ?? 1;
      const uInY = segUy[i - 1] ?? 0;
      const uOutX = segUx[i] ?? 1;
      const uOutY = segUy[i] ?? 0;
      const trim = trims[i] ?? 0;
      if (trim <= 1e-6) {
        pushStraight(curX, curY, curD, px, py, pd, uInX, uInY);
        curX = px;
        curY = py;
        curD = pd;
        continue;
      }
      const ax = px - uInX * trim;
      const ay = py - uInY * trim;
      const da = pd - trim;
      const bx = px + uOutX * trim;
      const by = py + uOutY * trim;
      const db = pd + trim;
      pushStraight(curX, curY, curD, ax, ay, da, uInX, uInY);
      // 이차 베지에 곡선 Q(t) = (1-t)² A + 2(1-t)t P + t² B, 접선 T(t) = 2(1-t)(P-A) + 2t(B-P)
      for (let k = 1; k <= CORNER_STEPS; k++) {
        const t = k / CORNER_STEPS;
        const omt = 1 - t;
        const qx = omt * omt * ax + 2 * omt * t * px + t * t * bx;
        const qy = omt * omt * ay + 2 * omt * t * py + t * t * by;
        const tx = omt * (px - ax) + t * (bx - px);
        const ty = omt * (py - ay) + t * (by - py);
        const tLen = Math.hypot(tx, ty) || 1;
        pushPoint(qx, qy, da + (db - da) * t, tx / tLen, ty / tLen);
      }
      curX = bx;
      curY = by;
      curD = db;
    }
    const endX = cleanX[m - 1] ?? 0;
    const endY = cleanY[m - 1] ?? 0;
    const endD = cumDist[m - 1] ?? 0;
    pushStraight(curX, curY, curD, endX, endY, endD, segUx[m - 2] ?? 1, segUy[m - 2] ?? 0);
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
  /** 명령 뒤에 새 경로가 도착해 움직이기 시작했는가(기다리는 중이면 false) */
  confirmed(): boolean;
  /** 남아 있는 목적지를 다른 틀로 옮긴다(옆 2차맵으로 넘을 때 — 언제 거둘지는 그대로) */
  shift(move: (cell: { x: number; y: number }) => { x: number; y: number }): void;
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
    confirmed() {
      return sawMoving;
    },
    shift(move) {
      if (target) target = move(target);
    },
  };
}
