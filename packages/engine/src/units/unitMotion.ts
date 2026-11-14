// 유닛 이동 보간 — 순수 코드(시험 대상). 서버가 준 경로(꺾이는 점) + 출발 시각 + 속도로 지금 위치를 계산한다.
// ADR 2026-10-28-s1-second-map "전송": 서버는 경로가 바뀔 때만 보내고, 기기는 매 프레임 경로를 따라 위치를 계산해 그린다.
// - 표시용이라 실수 계산을 쓴다(판정은 서버의 정수 고정소수점, packages/sim). 서버 좌표(배치 칸의 1/1024)는 /1024 해서 넣는다.
// - 고빈도 상태는 타입 배열에 둔다(PLAN 5.7). 유닛 칸(slot)마다 한 줄, 경로 점은 한 저장소(pool)에 이어 붙인다.
// - 구간 빠르기(docs/adr/2026-11-14-segment-speed.md, 프로토콜 29): 구간 i의 속도 = 기본 속도 × 1000 ÷ paces[i]. 점마다 누적 길이와
//   누적 시간 거리(길이 × pace ÷ 1000)를 두고, (지금 − 출발) × 속도로 시간 거리 구간을 찾는다(@terra/shared pathProgress와 같은 식).
// 좌표 단위: 배치 칸(2차맵 256×256). x = 열(동쪽), y = 행(남쪽).

export interface UnitPath {
  /** 꺾이는 점(배치 칸 좌표) x0, y0, x1, y1, … 첫 점이 출발점. 점 하나면 그 자리에 서 있다 */
  points: ArrayLike<number>;
  /** 출발 시각(서버 시계 ms) */
  departAtMs: number;
  /** 기본 속도(배치 칸/초) */
  speedCellsPerSec: number;
  /** 구간마다 걸음 배율(천분율, 길이 = 점 수 − 1). 없으면 모두 1000 */
  paces?: ArrayLike<number> | undefined;
}

/** 저장소 점 하나의 칸 수: x, y, 누적 길이, 누적 시간 거리 */
const STRIDE = 4;

/** 구간 i의 걸음 배율 ÷ 1000(없거나 틀리면 1) */
function paceFactorOf(paces: ArrayLike<number> | undefined, segment: number): number {
  const pace = paces ? Number(paces[segment]) : 1000;
  return Number.isFinite(pace) && pace > 0 ? pace / 1000 : 1;
}

/** 서버 고정소수점(배치 칸의 1/1024)을 배치 칸으로 */
export const FIXED_POINT_SCALE = 1024;

export class UnitMotionStore {
  readonly capacity: number;
  /** 지금 위치(배치 칸) — update()가 채운다 */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** 아직 가는 중이면 1 */
  readonly moving: Uint8Array;
  private readonly pathStart: Uint32Array;
  private readonly pathCount: Uint32Array;
  private readonly departAt: Float64Array;
  private readonly speed: Float32Array;
  /** 마지막으로 찾은 구간(다음 프레임은 여기서부터 찾는다) */
  private readonly cursor: Uint32Array;
  /** 칸마다 경로 판(경로를 바꿀 때마다 새 값 — 경로 표시가 다시 만들지 정한다) */
  private readonly revisions: Uint32Array;
  private nextRevision = 1;
  /** 경로 점 저장소: 점마다 x, y, 출발점부터 누적 길이, 누적 시간 거리 */
  private pool: Float32Array;
  private poolUsed = 0;
  /** 저장소에서 지금 쓰는 점 수(나머지는 버려진 옛 경로) */
  private poolLive = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.moving = new Uint8Array(capacity);
    this.pathStart = new Uint32Array(capacity);
    this.pathCount = new Uint32Array(capacity);
    this.departAt = new Float64Array(capacity);
    this.speed = new Float32Array(capacity);
    this.cursor = new Uint32Array(capacity);
    this.revisions = new Uint32Array(capacity);
    this.pool = new Float32Array(Math.max(64, capacity * 8) * STRIDE);
  }

  /** 쓰는 칸 수(0부터 연속) */
  get size(): number {
    return this.count;
  }

  /** 칸 수를 정한다. 늘어난 칸은 (0, 0)에 서 있다 */
  resize(count: number): void {
    if (count < 0 || count > this.capacity) throw new RangeError(`unit count out of range: ${count}`);
    for (let slot = count; slot < this.count; slot++) this.poolLive -= this.pathCount[slot] ?? 0;
    for (let slot = this.count; slot < count; slot++) {
      this.pathCount[slot] = 0;
      this.x[slot] = 0;
      this.y[slot] = 0;
      this.moving[slot] = 0;
      this.revisions[slot] = this.nextRevision++;
    }
    this.count = count;
  }

  /** 칸 slot의 경로를 바꾼다. 지금 위치는 다음 update()에서 새 경로로 계산된다 */
  setPath(slot: number, path: UnitPath): void {
    if (slot < 0 || slot >= this.count) throw new RangeError(`unit slot out of range: ${slot}`);
    const pointCount = Math.floor(path.points.length / 2);
    if (pointCount < 1) throw new Error("path needs at least one point");
    // 옛 경로는 버린다(모아 담을 때 옮기지 않게 먼저 비운다)
    this.poolLive -= this.pathCount[slot] ?? 0;
    this.pathCount[slot] = 0;
    this.reserve(pointCount);
    const start = this.poolUsed;
    let total = 0;
    let weight = 0;
    let previousX = 0;
    let previousY = 0;
    for (let i = 0; i < pointCount; i++) {
      const px = Number(path.points[i * 2]);
      const py = Number(path.points[i * 2 + 1]);
      if (i > 0) {
        const length = Math.hypot(px - previousX, py - previousY);
        total += length;
        weight += length * paceFactorOf(path.paces, i - 1);
      }
      const at = (start + i) * STRIDE;
      this.pool[at] = px;
      this.pool[at + 1] = py;
      this.pool[at + 2] = total;
      this.pool[at + 3] = weight;
      previousX = px;
      previousY = py;
    }
    this.poolUsed += pointCount;
    this.poolLive += pointCount;
    this.pathStart[slot] = start;
    this.pathCount[slot] = pointCount;
    this.departAt[slot] = path.departAtMs;
    this.speed[slot] = Math.max(0, path.speedCellsPerSec);
    this.cursor[slot] = 0;
    this.revisions[slot] = this.nextRevision++;
    // 첫 프레임 전에도 위치를 읽을 수 있게 출발점을 넣어 둔다
    this.x[slot] = this.pool[start * STRIDE] ?? 0;
    this.y[slot] = this.pool[start * STRIDE + 1] ?? 0;
    this.moving[slot] = pointCount > 1 && total > 0 && path.speedCellsPerSec > 0 ? 1 : 0;
  }

  /** 경로의 마지막 점(도착점) */
  destination(slot: number): { x: number; y: number } | null {
    const count = this.pathCount[slot] ?? 0;
    if (slot < 0 || slot >= this.count || count === 0) return null;
    const at = ((this.pathStart[slot] ?? 0) + count - 1) * STRIDE;
    return { x: this.pool[at] ?? 0, y: this.pool[at + 1] ?? 0 };
  }

  /** 칸 slot의 경로 판(경로를 바꾸면 달라진다). 없는 칸은 0 */
  revision(slot: number): number {
    return slot >= 0 && slot < this.count ? (this.revisions[slot] ?? 0) : 0;
  }

  /** 칸 slot의 경로 점(배치 칸 x, y, …)을 새 배열로. 없으면 null */
  pathPoints(slot: number): Float32Array | null {
    const count = this.pathCount[slot] ?? 0;
    if (slot < 0 || slot >= this.count || count === 0) return null;
    const start = this.pathStart[slot] ?? 0;
    const out = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      out[i * 2] = this.pool[(start + i) * STRIDE] ?? 0;
      out[i * 2 + 1] = this.pool[(start + i) * STRIDE + 1] ?? 0;
    }
    return out;
  }

  /** 시각 nowMs까지 경로를 따라 간 길이(배치 칸, 0 ~ 전체 길이) — 구간 걸음 배율 반영 */
  travelled(slot: number, nowMs: number): number {
    const count = this.pathCount[slot] ?? 0;
    if (slot < 0 || slot >= this.count || count === 0) return 0;
    const pool = this.pool;
    const start = this.pathStart[slot] ?? 0;
    const last = (start + count - 1) * STRIDE;
    const spent = (Math.max(0, nowMs - (this.departAt[slot] ?? 0)) / 1000) * (this.speed[slot] ?? 0);
    if (spent >= (pool[last + 3] ?? 0)) return pool[last + 2] ?? 0;
    for (let i = 0; i + 1 < count; i++) {
      const a = (start + i) * STRIDE;
      const b = a + STRIDE;
      const weightB = pool[b + 3] ?? 0;
      if (spent >= weightB) continue;
      const weightA = pool[a + 3] ?? 0;
      const t = weightB > weightA ? (spent - weightA) / (weightB - weightA) : 0;
      const lengthA = pool[a + 2] ?? 0;
      return lengthA + ((pool[b + 2] ?? 0) - lengthA) * t;
    }
    return pool[last + 2] ?? 0;
  }

  /**
   * 서버 시각 nowMs의 위치를 모두 계산한다. 아직 가는 중인 유닛 수를 돌려준다(0이면 다시 그릴 필요가 없다).
   * 출발 전인 유닛은 출발점에 서 있지만 곧 움직이므로 가는 중으로 센다.
   */
  update(nowMs: number): number {
    let active = 0;
    for (let slot = 0; slot < this.count; slot++) {
      if (this.compute(slot, nowMs)) active += 1;
    }
    return active;
  }

  /** 칸 하나만 시각 nowMs로 계산한다(x·y·moving을 고친다). 가는 중이면 true */
  compute(slot: number, nowMs: number): boolean {
    const count = this.pathCount[slot] ?? 0;
    if (slot < 0 || slot >= this.count || count === 0) return false;
    const pool = this.pool;
    const start = this.pathStart[slot] ?? 0;
    const last = (start + count - 1) * STRIDE;
    const total = pool[last + 2] ?? 0;
    const totalWeight = pool[last + 3] ?? 0;
    const speed = this.speed[slot] ?? 0;
    // 속도가 0이면 출발점에 서 있다(영원히 "가는 중"이 되어 그리기를 멈추지 못하는 일이 없게)
    if (speed <= 0) {
      this.x[slot] = pool[start * STRIDE] ?? 0;
      this.y[slot] = pool[start * STRIDE + 1] ?? 0;
      this.moving[slot] = 0;
      return false;
    }
    // 지금까지 쓴 시간 거리(기본 속도로 간 길이). 구간 빠르기가 같으면 간 길이와 같다
    const spent = (Math.max(0, nowMs - (this.departAt[slot] ?? 0)) / 1000) * speed;
    if (count === 1 || spent >= totalWeight || total <= 0) {
      this.x[slot] = pool[last] ?? 0;
      this.y[slot] = pool[last + 1] ?? 0;
      this.moving[slot] = 0;
      return false;
    }
    // 구간 찾기: 시간은 보통 앞으로만 가므로 지난번 구간부터 본다. 시계가 뒤로 가면 처음부터
    let segment = this.cursor[slot] ?? 0;
    if (segment >= count - 1 || (pool[(start + segment) * STRIDE + 3] ?? 0) > spent) segment = 0;
    while (segment < count - 2 && (pool[(start + segment + 1) * STRIDE + 3] ?? 0) <= spent) segment++;
    this.cursor[slot] = segment;
    const a = (start + segment) * STRIDE;
    const b = a + STRIDE;
    const weight = (pool[b + 3] ?? 0) - (pool[a + 3] ?? 0);
    const t = weight > 0 ? (spent - (pool[a + 3] ?? 0)) / weight : 1;
    const ax = pool[a] ?? 0;
    const ay = pool[a + 1] ?? 0;
    this.x[slot] = ax + ((pool[b] ?? 0) - ax) * t;
    this.y[slot] = ay + ((pool[b + 1] ?? 0) - ay) * t;
    this.moving[slot] = 1;
    return true;
  }

  /** 저장소에 점 n개 자리를 만든다. 버려진 경로가 많으면 모아 담고, 그래도 모자라면 키운다 */
  private reserve(n: number): void {
    const capacityPoints = this.pool.length / STRIDE;
    if (this.poolUsed + n <= capacityPoints) return;
    const needed = this.poolLive + n;
    const nextCapacity =
      needed * 2 > capacityPoints ? Math.max(needed * 2, capacityPoints * 2) : capacityPoints;
    const next = new Float32Array(nextCapacity * STRIDE);
    let used = 0;
    for (let slot = 0; slot < this.count; slot++) {
      const count = this.pathCount[slot] ?? 0;
      if (count === 0) continue;
      const from = (this.pathStart[slot] ?? 0) * STRIDE;
      next.set(this.pool.subarray(from, from + count * STRIDE), used * STRIDE);
      this.pathStart[slot] = used;
      used += count;
    }
    this.pool = next;
    this.poolUsed = used;
    this.poolLive = used;
  }
}
