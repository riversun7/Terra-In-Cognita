// 생성 3단계: 웅덩이 채우기·흐름 방향 — Priority-Flood (Barnes, Lehman, Mulla 2014, "Priority-Flood: An optimal
// depression-filling and watershed-labeling algorithm"의 개선판(웅덩이 큐)을 논문을 보고 새로 구현, ADR 10).
// - 바다 칸에서 시작해 낮은 칸부터 넓혀 간다. 이웃이 지금 칸(채운 높이)보다 낮으면 웅덩이라 그 높이까지 채운다.
// - 각 칸의 흐름 방향(receiver) = 그 칸을 처음 찾은 이웃. 그래서 모든 땅 칸의 물길이 바다에 닿고, 채운 높이로는
//   하류로 갈수록 낮아지거나 같다.
// - 웅덩이 하나 = 힙에서 꺼낸 칸 하나가 연 "웅덩이 큐" 한 차례. 물은 그 칸(넘치는 곳, basinExit)으로 나간다.
// 같은 높이는 칸 번호 순서(MinHeap), 이웃은 고정 순서라 결과가 늘 같다.
import { type PlanetGrid, neighbors8 } from "./grid.ts";
import { MinHeap } from "./queues.ts";

export interface FlowNetwork {
  /** 물이 흘러가는 칸 (바다 칸은 -1) */
  readonly receiver: Int32Array;
  /** 채운 높이(웅덩이는 넘치는 높이까지). 바다 칸은 원래 고도 */
  readonly filled: Float32Array;
  /** 땅 칸을 하류 → 상류 순서로(어느 칸이든 receiver가 앞에 있다). 길이 orderLength */
  readonly order: Int32Array;
  readonly orderLength: number;
  /** 웅덩이 번호(-1 = 웅덩이 아님) */
  readonly basin: Int32Array;
  /** 웅덩이 → 물이 나가는 칸(웅덩이 밖) */
  readonly basinExit: Int32Array;
  readonly basinCount: number;
}

export function priorityFlood(grid: PlanetGrid, elevation: Float32Array, ocean: Uint8Array): FlowNetwork {
  const count = grid.cellCount;
  const closed = new Uint8Array(count);
  const receiver = new Int32Array(count).fill(-1);
  const filled = new Float32Array(count);
  const basin = new Int32Array(count).fill(-1);
  const order = new Int32Array(count);
  const pit = new Int32Array(count);
  let basinExit = new Int32Array(1024);
  let basinCount = 0;
  let orderLength = 0;
  const heap = new MinHeap(4096);
  const out = new Int32Array(8);

  for (let c = 0; c < count; c++) {
    if (ocean[c] !== 1) continue;
    closed[c] = 1;
    filled[c] = elevation[c] ?? 0;
  }
  // 바다와 맞닿은 땅 칸에서 시작한다(물은 처음 찾은 바다 칸으로)
  for (let c = 0; c < count; c++) {
    if (ocean[c] !== 1) continue;
    neighbors8(grid, c, out);
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next < 0 || closed[next] === 1) continue;
      closed[next] = 1;
      receiver[next] = c;
      filled[next] = elevation[next] ?? 0;
      heap.push(filled[next] ?? 0, next);
    }
  }

  let pitHead = 0;
  let pitTail = 0;
  let currentBasin = -1;
  for (;;) {
    let c: number;
    if (pitHead < pitTail) {
      c = pit[pitHead++] ?? 0;
    } else {
      c = heap.pop();
      if (c < 0) break;
      // 새 칸을 힙에서 꺼냈다: 여기서 웅덩이가 열리면 새 번호
      currentBasin = -1;
      pitHead = 0;
      pitTail = 0;
    }
    order[orderLength++] = c;
    const level = filled[c] ?? 0;
    neighbors8(grid, c, out);
    for (let k = 0; k < 8; k++) {
      const next = out[k] ?? -1;
      if (next < 0 || closed[next] === 1) continue;
      closed[next] = 1;
      receiver[next] = c;
      const h = elevation[next] ?? 0;
      if (h <= level) {
        // 웅덩이: 넘치는 높이까지 채운다
        filled[next] = level;
        if (currentBasin < 0) {
          if (basinCount === basinExit.length) {
            const grown = new Int32Array(basinExit.length * 2);
            grown.set(basinExit);
            basinExit = grown;
          }
          currentBasin = basinCount++;
          basinExit[currentBasin] = c;
        }
        basin[next] = currentBasin;
        pit[pitTail++] = next;
      } else {
        filled[next] = h;
        heap.push(h, next);
      }
    }
  }
  return { receiver, filled, order, orderLength, basin, basinExit, basinCount };
}
