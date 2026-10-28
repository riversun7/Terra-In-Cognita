// A* 열린 목록용 이진 최소 힙 — (f, h, 칸 번호) 순서. 세 값이 모두 같은 항목은 같은 칸의 같은 값이라
// 순서가 완전히 정해진다(같은 입력이면 엔진·힙 구현과 무관하게 같은 순서로 꺼낸다).
// 값이 좋아진 칸은 새로 넣고, 옛 항목은 꺼낼 때 버린다(지연 삭제).

export interface NodeHeap {
  readonly size: number;
  clear(): void;
  push(f: number, h: number, node: number): void;
  /** 가장 앞 항목의 칸 번호를 꺼낸다. 비었으면 -1 */
  pop(): number;
}

const INITIAL_CAPACITY = 4096;

/** 항목 a가 b보다 앞인가 */
function before(fa: number, ha: number, na: number, fb: number, hb: number, nb: number): boolean {
  return fa < fb || (fa === fb && (ha < hb || (ha === hb && na < nb)));
}

export function createNodeHeap(): NodeHeap {
  let fs = new Float64Array(INITIAL_CAPACITY);
  let hs = new Float64Array(INITIAL_CAPACITY);
  let nodes = new Int32Array(INITIAL_CAPACITY);
  let size = 0;

  const grow = (): void => {
    const capacity = fs.length * 2;
    const nextF = new Float64Array(capacity);
    const nextH = new Float64Array(capacity);
    const nextNodes = new Int32Array(capacity);
    nextF.set(fs);
    nextH.set(hs);
    nextNodes.set(nodes);
    fs = nextF;
    hs = nextH;
    nodes = nextNodes;
  };

  return {
    get size() {
      return size;
    },
    clear() {
      size = 0;
    },
    push(f, h, node) {
      if (size === fs.length) grow();
      // 빈 자리를 위로 올리며 부모를 내린다
      let hole = size++;
      while (hole > 0) {
        const parent = (hole - 1) >> 1;
        const pf = fs[parent] ?? 0;
        const ph = hs[parent] ?? 0;
        const pn = nodes[parent] ?? 0;
        if (!before(f, h, node, pf, ph, pn)) break;
        fs[hole] = pf;
        hs[hole] = ph;
        nodes[hole] = pn;
        hole = parent;
      }
      fs[hole] = f;
      hs[hole] = h;
      nodes[hole] = node;
    },
    pop() {
      if (size === 0) return -1;
      const top = nodes[0] ?? -1;
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
        const right = child + 1;
        if (
          right < size &&
          before(
            fs[right] ?? 0,
            hs[right] ?? 0,
            nodes[right] ?? 0,
            fs[child] ?? 0,
            hs[child] ?? 0,
            nodes[child] ?? 0,
          )
        ) {
          child = right;
        }
        const cf = fs[child] ?? 0;
        const ch = hs[child] ?? 0;
        const cn = nodes[child] ?? 0;
        if (!before(cf, ch, cn, f, h, node)) break;
        fs[hole] = cf;
        hs[hole] = ch;
        nodes[hole] = cn;
        hole = child;
      }
      fs[hole] = f;
      hs[hole] = h;
      nodes[hole] = node;
      return top;
    },
  };
}
