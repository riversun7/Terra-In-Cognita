// A* 열린 목록용 이진 최소 힙 — (f, h, 칸 번호) 순서. 칸 번호가 항목마다 달라서 순서가 완전히 정해진다
// (같은 입력이면 엔진·힙 구현과 무관하게 같은 순서로 꺼낸다).
// 칸마다 힙 안 위치를 기억해서, 값이 좋아진 칸은 그 자리에서 값을 줄인다(중복 항목 없음).

export interface NodeHeap {
  readonly size: number;
  /** 비운다. 남은 항목 수만큼만 일한다 */
  clear(): void;
  /** 칸을 넣는다. 이미 있으면 값을 바꾼다 — 새 값은 원래보다 앞서야 한다(A*에서 g가 줄 때) */
  upsert(f: number, h: number, node: number): void;
  /** 가장 앞 항목의 칸 번호를 꺼낸다. 비었으면 -1 */
  pop(): number;
}

/** 항목 a가 b보다 앞인가 */
function before(fa: number, ha: number, na: number, fb: number, hb: number, nb: number): boolean {
  return fa < fb || (fa === fb && (ha < hb || (ha === hb && na < nb)));
}

/** 칸 번호가 0 ~ nodeCount-1인 힙. 배열을 처음에 다 만든다(칸당 24바이트) */
export function createNodeHeap(nodeCount: number): NodeHeap {
  const fs = new Float64Array(nodeCount);
  const hs = new Float64Array(nodeCount);
  const nodes = new Int32Array(nodeCount);
  // 칸 → 힙 안 위치(-1 = 없음)
  const slot = new Int32Array(nodeCount).fill(-1);
  let size = 0;

  // 빈 자리 start에서 위로 올리며 부모를 내린다
  const siftUp = (start: number, f: number, h: number, node: number): void => {
    let hole = start;
    while (hole > 0) {
      const parent = (hole - 1) >> 1;
      const pf = fs[parent] ?? 0;
      const ph = hs[parent] ?? 0;
      const pn = nodes[parent] ?? 0;
      if (!before(f, h, node, pf, ph, pn)) break;
      fs[hole] = pf;
      hs[hole] = ph;
      nodes[hole] = pn;
      slot[pn] = hole;
      hole = parent;
    }
    fs[hole] = f;
    hs[hole] = h;
    nodes[hole] = node;
    slot[node] = hole;
  };

  return {
    get size() {
      return size;
    },
    clear() {
      for (let i = 0; i < size; i++) slot[nodes[i] ?? 0] = -1;
      size = 0;
    },
    upsert(f, h, node) {
      const at = slot[node] ?? -1;
      siftUp(at >= 0 ? at : size++, f, h, node);
    },
    pop() {
      if (size === 0) return -1;
      const top = nodes[0] ?? -1;
      slot[top] = -1;
      size--;
      if (size === 0) return top;
      // 마지막 항목을 뿌리에서 아래로 내린다
      const f = fs[size] ?? 0;
      const h = hs[size] ?? 0;
      const node = nodes[size] ?? 0;
      let hole = 0;
      for (;;) {
        let child = hole * 2 + 1;
        if (child >= size) break;
        let cf = fs[child] ?? 0;
        let ch = hs[child] ?? 0;
        let cn = nodes[child] ?? 0;
        const right = child + 1;
        if (right < size) {
          const rf = fs[right] ?? 0;
          const rh = hs[right] ?? 0;
          const rn = nodes[right] ?? 0;
          if (before(rf, rh, rn, cf, ch, cn)) {
            child = right;
            cf = rf;
            ch = rh;
            cn = rn;
          }
        }
        if (!before(cf, ch, cn, f, h, node)) break;
        fs[hole] = cf;
        hs[hole] = ch;
        nodes[hole] = cn;
        slot[cn] = hole;
        hole = child;
      }
      fs[hole] = f;
      hs[hole] = h;
      nodes[hole] = node;
      slot[node] = hole;
      return top;
    },
  };
}
