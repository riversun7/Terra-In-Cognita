// 시험·측정 도우미: 땅덩어리(바다가 아닌 칸의 8이웃 덩어리)와 큰 땅덩어리 수 — 대륙 배치 시험(continents.test.ts)과
// 측정 스크립트가 같은 정의를 쓴다(ADR 2026-10-31-continent-layouts). 이름이 test로 시작해 결정성 검사 밖이고,
// 생성기 코드는 가져오지 않는다(경계 검사가 막는다).
import { type PlanetGrid, areaOf, neighbors8 } from "./grid.ts";

/**
 * 큰 땅덩어리(대륙) 기준: 땅 전체 면적의 이 몫 이상인 덩어리. 3%는 지구로 치면 약 450만 km²(오스트레일리아 770만은 들고,
 * 그린란드 216만은 빠진다). 대륙 배치는 작은 조각 하나를 땅의 1.2% 아래로 두고(continents.ts), 가장 작은 대륙도 이보다
 * 크게 둔다
 */
export const MAJOR_LANDMASS_SHARE = 0.03;

export interface Landmasses {
  /** 땅(바다가 아닌 칸: 호수·웅덩이 포함) 면적(스테라디안) */
  readonly landArea: number;
  /** 덩어리 면적(스테라디안), 큰 것부터 */
  readonly areas: readonly number[];
  /** 칸마다 덩어리 번호(areas 순서, 바다는 -1) */
  readonly component: Int32Array;
}

/** 바다(ocean = 1)가 아닌 칸을 8이웃으로 이은 덩어리 */
export function landmasses(grid: PlanetGrid, ocean: Uint8Array): Landmasses {
  const count = grid.cellCount;
  const raw = new Int32Array(count).fill(-1);
  const queue = new Int32Array(count);
  const out = new Int32Array(8);
  const found: number[] = [];
  let landArea = 0;
  for (let start = 0; start < count; start++) {
    if (ocean[start] === 1 || raw[start] !== -1) continue;
    const id = found.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    raw[start] = id;
    let area = 0;
    while (head < tail) {
      const c = queue[head++] ?? 0;
      area += areaOf(grid, c);
      neighbors8(grid, c, out);
      for (const next of out) {
        if (next < 0 || ocean[next] === 1 || raw[next] !== -1) continue;
        raw[next] = id;
        queue[tail++] = next;
      }
    }
    found.push(area);
    landArea += area;
  }
  const order = found.map((area, id) => ({ area, id })).toSorted((a, b) => b.area - a.area || a.id - b.id);
  const rank = new Int32Array(found.length);
  order.forEach((entry, k) => {
    rank[entry.id] = k;
  });
  const component = new Int32Array(count).fill(-1);
  for (let c = 0; c < count; c++) {
    const id = raw[c] ?? -1;
    if (id >= 0) component[c] = rank[id] ?? -1;
  }
  return { landArea, areas: order.map((entry) => entry.area), component };
}

/** 큰 땅덩어리 수: 땅 면적의 share(기본 3%) 이상인 덩어리 */
export function majorLandmassCount(masses: Landmasses, share = MAJOR_LANDMASS_SHARE): number {
  return masses.areas.filter((area) => area >= share * masses.landArea).length;
}

/**
 * 땅이 가장 많이 든 반구의 땅 몫(0~1): 땅 넓이로 가중한 평균 방향을 가운데로 둔 반구에 든 땅 ÷ 땅 전체. 땅이 고르게
 * 퍼지면 0.5 근처, 한 덩어리면 1에 가깝다(지구 약 0.8)
 */
export function landHemisphereShare(grid: PlanetGrid, ocean: Uint8Array): number {
  let mx = 0;
  let my = 0;
  let mz = 0;
  let land = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if (ocean[c] === 1) continue;
    const area = areaOf(grid, c);
    mx += area * (grid.x[c] ?? 0);
    my += area * (grid.y[c] ?? 0);
    mz += area * (grid.z[c] ?? 0);
    land += area;
  }
  let inside = 0;
  for (let c = 0; c < grid.cellCount; c++) {
    if (ocean[c] === 1) continue;
    if (mx * (grid.x[c] ?? 0) + my * (grid.y[c] ?? 0) + mz * (grid.z[c] ?? 0) > 0) inside += areaOf(grid, c);
  }
  return land > 0 ? inside / land : 0;
}
