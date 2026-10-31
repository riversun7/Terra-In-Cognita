// 갇힌 곳 잇기 — 배치 단계 5(placement.ts 머리 주석). ADR 35 생성기 시험: 크기 등급 1이 설 수 있는 칸은 물·벼랑으로
// 갈린 곳을 빼고 모두 이어진다. 정수·배열 연산만 쓴다(판정 자료).
import { SM_PLACEMENT } from "./layout.ts";

const PLACEMENT_CELLS = SM_PLACEMENT * SM_PLACEMENT;

/**
 * 갇힌 곳 잇기: 크기 등급 1이 설 수 있는 칸(지형이 열리고 차폐가 아님)의 덩이 가운데, 지형 묶음(엄폐를 뺀 이어짐)의
 * 본 덩이와 끊긴 덩이마다 차폐를 가장 적게 지나는 길(0-1 너비 우선 탐색)을 찾아 그 길의 차폐를 은폐로 바꾼다.
 * 본 덩이 = 2차맵 가장자리에 닿는 덩이(이웃 2차맵으로 이어진다). 묶음이 가장자리에 닿지 않으면 그 묶음의 가장 큰 덩이.
 * 숲 속 빈터를 메우지 않고 숲을 뚫어 잇는다(빈 길이 물·벼랑에 끊긴 곳에서 생긴다). 바뀐 칸 수를 돌려준다.
 */
export function connectPockets(open: Uint8Array, cover: Uint8Array): number {
  const passable = (i: number): boolean => open[i] === 1 && cover[i] !== 2;
  const openCell = (i: number): boolean => open[i] === 1;
  const queue = new Int32Array(PLACEMENT_CELLS);
  const mark = new Uint8Array(PLACEMENT_CELLS);
  // 1) 설 수 있는 덩이: 번호(덩이 첫 칸 번호), 크기, 가장자리에 닿는가
  const piece = new Int32Array(PLACEMENT_CELLS).fill(-1);
  const pieceSize = new Map<number, number>();
  const pieceTouches = new Map<number, boolean>();
  for (let i = 0; i < PLACEMENT_CELLS; i++) {
    if (mark[i] === 1 || !passable(i)) continue;
    mark[i] = 1;
    queue[0] = i;
    const count = floodFrom(queue, 1, mark, passable);
    let touches = false;
    for (let k = 0; k < count; k++) {
      const cell = queue[k] ?? 0;
      piece[cell] = i;
      if (onEdge(cell)) touches = true;
    }
    pieceSize.set(i, count);
    pieceTouches.set(i, touches);
  }
  if (pieceSize.size <= 1) return 0;
  // 2) 지형 묶음마다 본 덩이를 정한다
  const groupMark = new Uint8Array(PLACEMENT_CELLS);
  const connected = new Uint8Array(PLACEMENT_CELLS);
  const pockets: number[] = [];
  for (let i = 0; i < PLACEMENT_CELLS; i++) {
    if (groupMark[i] === 1 || !openCell(i)) continue;
    groupMark[i] = 1;
    queue[0] = i;
    const count = floodFrom(queue, 1, groupMark, openCell);
    const pieces = new Set<number>();
    for (let k = 0; k < count; k++) {
      const id = piece[queue[k] ?? 0] ?? -1;
      if (id >= 0) pieces.add(id);
    }
    if (pieces.size === 0) continue;
    const touching = [...pieces].filter((id) => pieceTouches.get(id));
    let main = touching;
    if (main.length === 0) {
      let best = -1;
      for (const id of pieces)
        if (best < 0 || (pieceSize.get(id) ?? 0) > (pieceSize.get(best) ?? 0)) best = id;
      main = [best];
    }
    const mainSet = new Set(main);
    for (let k = 0; k < count; k++) {
      const cell = queue[k] ?? 0;
      if (mainSet.has(piece[cell] ?? -1)) connected[cell] = 1;
    }
    for (const id of pieces) if (!mainSet.has(id)) pockets.push(id);
  }
  // 3) 끊긴 덩이마다(번호 차례) 본 덩이까지 차폐를 가장 적게 지나는 길을 뚫는다
  let carved = 0;
  const deque = new Int32Array(2 * PLACEMENT_CELLS);
  const cost = new Int32Array(PLACEMENT_CELLS);
  const parent = new Int32Array(PLACEMENT_CELLS);
  for (const id of pockets.toSorted((a, b) => a - b)) {
    if (connected[id] === 1) continue;
    cost.fill(-1);
    let head = PLACEMENT_CELLS;
    let tail = PLACEMENT_CELLS;
    for (let i = 0; i < PLACEMENT_CELLS; i++) {
      if (piece[i] !== id) continue;
      cost[i] = 0;
      parent[i] = -1;
      deque[tail++] = i;
    }
    let target = -1;
    while (head < tail) {
      const i = deque[head++] ?? 0;
      if (connected[i] === 1) {
        target = i;
        break;
      }
      const px = i % SM_PLACEMENT;
      for (let d = 0; d < 4; d++) {
        const next = stepIndex(i, px, d);
        if (next < 0 || !openCell(next)) continue;
        const step = cover[next] === 2 ? 1 : 0;
        const candidate = (cost[i] ?? 0) + step;
        if (cost[next] !== -1 && (cost[next] ?? 0) <= candidate) continue;
        cost[next] = candidate;
        parent[next] = i;
        if (step === 0) deque[--head] = next;
        else deque[tail++] = next;
      }
    }
    if (target < 0) continue;
    for (let cell = target; cell >= 0; cell = parent[cell] ?? -1) {
      if (cover[cell] === 2) {
        cover[cell] = 1;
        carved += 1;
      }
    }
    // 이어진 칸을 다시 표시한다(뚫은 길로 이어진 다른 끊긴 덩이도 함께)
    for (let cell = target; cell >= 0; cell = parent[cell] ?? -1) connected[cell] = 1;
    mark.fill(0);
    let count = 0;
    for (let i = 0; i < PLACEMENT_CELLS; i++) {
      if (connected[i] === 1 && passable(i)) {
        mark[i] = 1;
        queue[count++] = i;
      }
    }
    count = floodFrom(queue, count, mark, passable);
    for (let k = 0; k < count; k++) connected[queue[k] ?? 0] = 1;
  }
  return carved;
}

/** 2차맵 가장자리 칸인가 */
function onEdge(i: number): boolean {
  const px = i % SM_PLACEMENT;
  return px === 0 || px === SM_PLACEMENT - 1 || i < SM_PLACEMENT || i >= PLACEMENT_CELLS - SM_PLACEMENT;
}

/** 배치 칸 i(열 px)의 네 이웃(d = 0 왼쪽, 1 오른쪽, 2 위, 3 아래). 2차맵 밖이면 −1 */
function stepIndex(i: number, px: number, d: number): number {
  if (d === 0) return px > 0 ? i - 1 : -1;
  if (d === 1) return px < SM_PLACEMENT - 1 ? i + 1 : -1;
  if (d === 2) return i >= SM_PLACEMENT ? i - SM_PLACEMENT : -1;
  return i < PLACEMENT_CELLS - SM_PLACEMENT ? i + SM_PLACEMENT : -1;
}

/** 대기열 queue[0, start)에서 네 방향으로 퍼진다(mark 표시, canEnter인 칸만). 끝난 대기열 길이(닿은 칸 수)를 돌려준다 */
function floodFrom(
  queue: Int32Array,
  start: number,
  mark: Uint8Array,
  canEnter: (i: number) => boolean,
): number {
  let head = 0;
  let tail = start;
  while (head < tail) {
    const i = queue[head++] ?? 0;
    const px = i % SM_PLACEMENT;
    for (let d = 0; d < 4; d++) {
      const next = stepIndex(i, px, d);
      if (next < 0 || mark[next] === 1 || !canEnter(next)) continue;
      mark[next] = 1;
      queue[tail++] = next;
    }
  }
  return tail;
}
