// 타일 고르기(LOD) — 순수 계산(시험 대상). ADR 36 "렌더러": 화면 오차로 나누고, 부모를 먼저 그리고 자식이 오면 바꾼다.
// 1) 나누기: 꼭대기(면마다 하나)에서 시작해 화면 오차(칸 한 변이 화면에서 차지하는 CSS px)가 가장 큰 마디부터 나눈다.
//    화면 오차 = 칸 평균 변(m) × 화면 계수 ÷ (카메라에서 마디를 감싼 구까지 거리). 문턱 이하이거나 가장 고운 단계면 멈춘다.
//    나누면 그릴 타일 수가 (보이는 자식 수 − 1)만큼 는다. 상한(visibleTiles)을 넘으면 그 마디는 나누지 않는다.
//    시야(절두체) 밖·지평선 뒤 마디는 버린다.
// 2) 그리기 목록(부모 먼저): 나눈 마디는 보이는 자식이 모두 그릴 수 있을 때만 자식으로 바꾼다. 아니면 마디 자신을 그린다.
//    마디도 아직 없으면 그 위 부모가 대신 그린다. 그래서 그리기 목록은 서로 겹치지 않고 화면 구멍도 없다(꼭대기가 있으면).
// 3) 받을 목록: 고른 나무의 마디 중 아직 그릴 수 없는 것. 거친 레벨 먼저(부모 먼저), 같은 레벨은 화면 오차 큰 것 먼저.
import { aboveHorizon, sphereInFrustum } from "./culling.ts";
import { type TileShape, boundingSphere } from "./tileShape.ts";
import { type TileLayout, type TileNode, childNodes, isDataLevel, rootNodes, tileKey } from "./tileTree.ts";
import type { Vec3 } from "./vec3.ts";

export interface SelectionCamera {
  /** 카메라 위치(행성 중심 기준, m) */
  readonly position: Vec3;
  /** 카메라 기준 좌표(점 − 카메라 위치)의 절두체 평면(culling.ts frustumPlanes) */
  readonly frustum: Float64Array;
  /** 화면 계수: 거리 1m에서 1m가 차지하는 CSS px = 화면 높이 ÷ (2·tan(세로 시야각/2)) */
  readonly pixelsPerMeterAtUnitDistance: number;
}

export interface SelectionParams {
  readonly layout: TileLayout;
  /** 타일 아래쪽 반지름(m): 해수면 − 메시 활꼴 깊이 */
  readonly innerRadiusM: number;
  /** 타일 위쪽 반지름(m): 해수면 + 가장 높은 땅 × 과장 */
  readonly outerRadiusM: number;
  /** 행성 몸(가리는 구) 반지름(m) */
  readonly occluderRadiusM: number;
  /** 화면 오차 문턱(CSS px) */
  readonly maxScreenErrorPx: number;
  /** 그릴 타일 수 상한 */
  readonly maxTiles: number;
}

export interface SelectionSources {
  shape(key: number, node: TileNode): TileShape;
  /** GPU에 올라 그릴 수 있는 타일인지 */
  drawable(key: number): boolean;
}

export interface WantedTile {
  readonly key: number;
  readonly node: TileNode;
  /** 작을수록 먼저: 맵 레벨 × 1e6 − 화면 오차(같은 레벨은 오차 큰 것 먼저) */
  readonly priority: number;
}

export interface Selection {
  /** 그릴 타일(서로 겹치지 않는다), 카메라에서 가까운 것 먼저 */
  readonly draw: readonly { key: number; node: TileNode; distance: number }[];
  /** 받을 타일, 우선순위 순 */
  readonly wanted: readonly WantedTile[];
  /** 고른 잎 마디 수(화면 오차로 원하는 타일 수, 상한 이하) */
  readonly selected: number;
  /** 상한 때문에 나누지 못한 마디가 있다 */
  readonly budgetHit: boolean;
  /** 보이는 곳 중 그릴 것이 없는 마디가 있다(바탕 구가 보인다) */
  readonly incomplete: boolean;
  /** 고른 나무의 모든 마디 키(오래 안 쓴 타일을 버릴 때 지킨다) */
  readonly used: readonly number[];
}

interface Work {
  readonly key: number;
  readonly node: TileNode;
  readonly data: boolean;
  readonly sse: number;
  readonly distance: number;
  split: boolean;
  children: Work[];
}

/** 화면 오차 큰 것이 위에 오는 쌓기(최대 힙) */
class MaxHeap {
  private readonly items: Work[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: Work): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = items[parent];
      if (!p || p.sse >= item.sse) break;
      items[i] = p;
      i = parent;
    }
    items[i] = item;
  }

  pop(): Work | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top === undefined || last === undefined || items.length === 0) return top;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let largest = i;
      let largestSse = last.sse;
      const l = items[left];
      const r = items[right];
      if (l && l.sse > largestSse) {
        largest = left;
        largestSse = l.sse;
      }
      if (r && r.sse > largestSse) largest = right;
      if (largest === i) break;
      const moved = items[largest];
      if (!moved) break;
      items[i] = moved;
      i = largest;
    }
    items[i] = last;
    return top;
  }
}

export function selectTiles(
  camera: SelectionCamera,
  params: SelectionParams,
  sources: SelectionSources,
): Selection {
  const { layout } = params;
  const c = camera.position;
  const used: number[] = [];

  // 보이는 마디만 일감으로 만든다(보이지 않으면 null)
  const visit = (node: TileNode): Work | null => {
    const key = tileKey(node);
    const shape = sources.shape(key, node);
    if (!aboveHorizon(c, shape.center, shape.angularRadius, params.occluderRadiusM, params.outerRadiusM)) {
      return null;
    }
    const sphere = boundingSphere(shape, params.innerRadiusM - shape.sagM, params.outerRadiusM);
    const rx = sphere.center[0] - c[0];
    const ry = sphere.center[1] - c[1];
    const rz = sphere.center[2] - c[2];
    if (!sphereInFrustum(camera.frustum, rx, ry, rz, sphere.radius)) return null;
    const distance = Math.max(1, Math.hypot(rx, ry, rz) - sphere.radius);
    const data = isDataLevel(layout, node.mapLevel);
    // 자료 없는 마디(큰 행성의 꼭대기 쪽)는 늘 나눈다
    const sse = data
      ? (shape.cellEdgeM * camera.pixelsPerMeterAtUnitDistance) / distance
      : Number.POSITIVE_INFINITY;
    used.push(key);
    return { key, node, data, sse, distance, split: false, children: [] };
  };

  const roots: Work[] = [];
  for (const node of rootNodes(layout)) {
    const work = visit(node);
    if (work) roots.push(work);
  }

  // 1) 나누기
  let count = roots.length;
  let budgetHit = false;
  const heap = new MaxHeap();
  for (const root of roots) heap.push(root);
  while (heap.size > 0) {
    const work = heap.pop();
    if (!work) break;
    if (work.node.mapLevel >= layout.lastLevel) continue;
    if (work.data && work.sse <= params.maxScreenErrorPx) continue;
    const children: Work[] = [];
    for (const child of childNodes(layout, work.node)) {
      const childWork = visit(child);
      if (childWork) children.push(childWork);
    }
    const extra = children.length - 1;
    if (work.data && count + extra > params.maxTiles) {
      budgetHit = true;
      continue;
    }
    work.split = true;
    work.children = children;
    count += extra;
    for (const child of children) heap.push(child);
  }

  // 2) 그리기 목록(부모 먼저) 3) 받을 목록
  const wanted: WantedTile[] = [];
  let incomplete = false;
  let selected = 0;
  const resolve = (work: Work): Work[] | null => {
    const drawable = work.data && sources.drawable(work.key);
    if (work.data && !drawable) {
      wanted.push({
        key: work.key,
        node: work.node,
        priority: work.node.mapLevel * 1e6 - Math.min(work.sse, 1e5),
      });
    }
    if (!work.split) {
      selected += 1;
      return drawable ? [work] : null;
    }
    const lists = work.children.map(resolve);
    if (lists.every((list): list is Work[] => list !== null)) return lists.flat();
    return drawable ? [work] : null;
  };
  const draw: Work[] = [];
  for (const root of roots) {
    const list = resolve(root);
    if (list) draw.push(...list);
    else incomplete = true;
  }
  draw.sort((a, b) => a.distance - b.distance);
  wanted.sort((a, b) => a.priority - b.priority);
  return {
    draw: draw.map((work) => ({ key: work.key, node: work.node, distance: work.distance })),
    wanted,
    selected,
    budgetHit,
    incomplete,
    used,
  };
}
