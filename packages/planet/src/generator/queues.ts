// 생성기 큐: 최소 힙(실수 키 + 칸 번호), 다중 출발점 거리장(정수 가중치 버킷 큐)
// 같은 키는 칸 번호가 작은 쪽이 먼저 나온다 → 꺼내는 순서가 늘 같다(결정적).
import { type PlanetGrid, neighbors8 } from "./grid.ts";

/** 최소 힙. 키가 같으면 칸 번호 순서 */
export class MinHeap {
  private keys: Float64Array;
  private ids: Int32Array;
  private count = 0;
  /** 마지막으로 꺼낸 칸의 키 */
  lastKey = 0;

  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.ids = new Int32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a] ?? 0;
    const kb = this.keys[b] ?? 0;
    return ka < kb || (ka === kb && (this.ids[a] ?? 0) < (this.ids[b] ?? 0));
  }

  private swap(a: number, b: number): void {
    const key = this.keys[a] ?? 0;
    const id = this.ids[a] ?? 0;
    this.keys[a] = this.keys[b] ?? 0;
    this.ids[a] = this.ids[b] ?? 0;
    this.keys[b] = key;
    this.ids[b] = id;
  }

  push(key: number, id: number): void {
    if (this.count === this.keys.length) {
      const keys = new Float64Array(this.keys.length * 2);
      keys.set(this.keys);
      this.keys = keys;
      const ids = new Int32Array(this.ids.length * 2);
      ids.set(this.ids);
      this.ids = ids;
    }
    let at = this.count++;
    this.keys[at] = key;
    this.ids[at] = id;
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!this.less(at, parent)) break;
      this.swap(at, parent);
      at = parent;
    }
  }

  /** 가장 작은 칸 번호를 꺼낸다(키는 lastKey). 비어 있으면 -1 */
  pop(): number {
    if (this.count === 0) return -1;
    const id = this.ids[0] ?? 0;
    this.lastKey = this.keys[0] ?? 0;
    this.count--;
    if (this.count > 0) {
      this.keys[0] = this.keys[this.count] ?? 0;
      this.ids[0] = this.ids[this.count] ?? 0;
      let at = 0;
      for (;;) {
        const left = 2 * at + 1;
        if (left >= this.count) break;
        const right = left + 1;
        const child = right < this.count && this.less(right, left) ? right : left;
        if (!this.less(child, at)) break;
        this.swap(child, at);
        at = child;
      }
    }
    return id;
  }
}

/** 거리 단위: 평균 칸 크기의 1/8 (정수 가중치로 버킷 큐를 쓰려고 칸 사이 거리를 이 단위로 반올림한다) */
export const DISTANCE_STEPS_PER_CELL = 8;

export interface DistanceField {
  /** 가장 가까운 출발점까지 거리(라디안). 상한을 넘으면 상한 값 */
  readonly angle: Float32Array;
  /** 가장 가까운 출발점 칸 번호 (닿지 않았으면 -1) */
  readonly source: Int32Array;
}

/**
 * 다중 출발점 최단 거리(구 위, 8이웃을 따라감). Dial 방식: 이웃 사이 거리를 정수(평균 칸의 1/8 단위)로 반올림한
 * 버킷 큐라 칸 수에 비례하는 시간에 끝나고 결과가 늘 같다. 상한(maxAngle, 라디안)까지만 퍼진다.
 * @param isSource 출발점(거리 0)
 * @param canEnter 그 칸으로 들어갈 수 있는지 (없으면 모두 가능)
 */
export function distanceField(
  grid: PlanetGrid,
  isSource: (c: number) => boolean,
  maxAngle: number,
  canEnter?: (from: number, to: number) => boolean,
): DistanceField {
  const unit = grid.meanCellAngle / DISTANCE_STEPS_PER_CELL;
  const limit = Math.ceil(maxAngle / unit);
  const count = grid.cellCount;
  const dist = new Int32Array(count).fill(limit);
  const source = new Int32Array(count).fill(-1);
  // 원형 버킷: 이웃 사이 가중치는 1 이상 MAX_WEIGHT 이하
  const maxWeight = DISTANCE_STEPS_PER_CELL * 4;
  const bucketCount = maxWeight + 1;
  const buckets: Int32Array[] = [];
  const lengths = new Int32Array(bucketCount);
  for (let b = 0; b < bucketCount; b++) buckets.push(new Int32Array(64));
  const pushTo = (bucket: number, c: number) => {
    let list = buckets[bucket] ?? new Int32Array(64);
    const length = lengths[bucket] ?? 0;
    if (length === list.length) {
      const grown = new Int32Array(list.length * 2);
      grown.set(list);
      list = grown;
      buckets[bucket] = list;
    }
    list[length] = c;
    lengths[bucket] = length + 1;
  };
  let pending = 0;
  for (let c = 0; c < count; c++) {
    if (!isSource(c)) continue;
    dist[c] = 0;
    source[c] = c;
    pushTo(0, c);
    pending++;
  }
  const out = new Int32Array(8);
  for (let d = 0; d < limit && pending > 0; d++) {
    const bucket = d % bucketCount;
    const list = buckets[bucket] ?? new Int32Array(0);
    // 같은 거리 칸을 처리하는 동안 같은 버킷에 새로 들어오지 않는다(가중치 ≥ 1)
    for (let k = 0; k < (lengths[bucket] ?? 0); k++) {
      const c = list[k] ?? 0;
      pending--;
      if (dist[c] !== d) continue;
      neighbors8(grid, c, out);
      for (let e = 0; e < 8; e++) {
        const next = out[e] ?? -1;
        if (next < 0) continue;
        const dx = (grid.x[c] ?? 0) - (grid.x[next] ?? 0);
        const dy = (grid.y[c] ?? 0) - (grid.y[next] ?? 0);
        const dz = (grid.z[c] ?? 0) - (grid.z[next] ?? 0);
        const weight = Math.min(
          maxWeight,
          Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz) / unit)),
        );
        const nd = d + weight;
        if (nd >= (dist[next] ?? 0) || nd > limit) continue;
        if (canEnter && !canEnter(c, next)) continue;
        dist[next] = nd;
        source[next] = source[c] ?? -1;
        pushTo(nd % bucketCount, next);
        pending++;
      }
    }
    lengths[bucket] = 0;
  }
  const angle = new Float32Array(count);
  for (let c = 0; c < count; c++) angle[c] = (dist[c] ?? limit) * unit;
  return { angle, source };
}
