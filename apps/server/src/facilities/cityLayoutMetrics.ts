// 도시 건물 배치 지표 — docs/adr/2026-11-11-city-building-layout.md. 측정 스크립트(bench/cityLayout.ts), 시험(cityLayout.test.ts),
// 운영자 화면(cityLayoutView.ts)이 같은 셈을 쓴다. 보는 것만 한다(판정에 쓰지 않는다).
// - 행정 건물 치우침: 행정 건물 가운데 ↔ 도시 칸(체비셰프 칸).
// - 둘레 덮임: 행정 건물에서 본 16방위 가운데 RING_RADIUS칸 안에 건물(행정 건물 빼고) 가운데가 있는 방위 수.
// - 가림(‰): 행정 건물 가운데에서 바깥으로 쏜 64줄 가운데 RAY_LENGTH칸 안에서 건물 칸에 닿는 줄의 몫 — 바깥에서 곧장 오면 먼저 건물을 만난다.
// - 거리(칸, 가운데끼리): 행정 건물 ↔ 채집소·창고·숙소 평균, 채집소 → 가장 가까운 창고 평균(옮김 거리).
// - 출퇴근 돌아감(‰): 채집소마다 (채집소 → 가장 가까운 숙소 + 숙소 → 행정 건물) ÷ (채집소 → 행정 건물) 평균. 1000이면 숙소가 길 위에 있다.
// - 갇힌 건물: 광장에서 걸어서(건물·막힌 칸을 피해) 그 건물 곁 칸에 닿지 못하는 건물 수(0이어야 한다 — 자기 유닛이 지나간다).
import { detAtan2, detCos, detSin } from "@terra/shared";
import { type LayoutRect, type LayoutRole, grow, rectCenter } from "@terra/sim/city";

/** 둘레 덮임 방위 수 */
export const RING_SECTORS = 16;
/** 둘레 덮임을 보는 반경(칸) */
export const RING_RADIUS = 30;
/** 가림 줄 수·길이(칸) */
export const RAYS = 64;
export const RAY_LENGTH = 48;

export interface LayoutBuilding extends LayoutRect {
  readonly role: LayoutRole;
}

export interface LayoutMetrics {
  readonly hallOffset: number;
  readonly sectors: number;
  readonly screenPm: number;
  readonly hallToStation: number | null;
  readonly hallToStorage: number | null;
  readonly hallToLodging: number | null;
  readonly haul: number | null;
  readonly commutePm: number | null;
  readonly walledIn: number;
}

const tenth = (value: number) => Math.round(value * 10) / 10;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
const mean = (list: readonly number[]) =>
  list.length === 0 ? null : tenth(list.reduce((sum, value) => sum + value, 0) / list.length);
const inside = (rect: LayoutRect, x: number, y: number) =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;

/** 가장 가까운 점까지 거리(없으면 undefined) */
function nearest(
  from: { x: number; y: number },
  points: readonly { x: number; y: number }[],
): { point: { x: number; y: number }; d: number } | undefined {
  let best: { point: { x: number; y: number }; d: number } | undefined;
  for (const point of points) {
    const d = distance(from, point);
    if (!best || d < best.d) best = { point, d };
  }
  return best;
}

export function layoutMetrics(input: {
  readonly center: { readonly x: number; readonly y: number };
  readonly buildings: readonly LayoutBuilding[];
  /** 걸을 수 있는 칸(지형). 없으면 범위 안 모두 */
  readonly passable?: ((x: number, y: number) => boolean) | undefined;
  readonly plazaCells: number;
  readonly size: number;
}): LayoutMetrics {
  const { buildings, size } = input;
  const hallRect = buildings.find((building) => building.role === "core") ?? {
    x: input.center.x,
    y: input.center.y,
    width: 1,
    height: 1,
  };
  const hall = rectCenter(hallRect);
  const others = buildings.filter((building) => building.role !== "core");
  const centers = (role: LayoutRole) =>
    others.filter((building) => building.role === role).map((building) => rectCenter(building));
  const stations = centers("gather");
  const storages = centers("storage");
  const lodgings = centers("living");

  const covered = new Set<number>();
  for (const building of others) {
    const at = rectCenter(building);
    if (distance(at, hall) > RING_RADIUS) continue;
    const angle = detAtan2(at.y - hall.y, at.x - hall.x);
    const turn = (angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI);
    covered.add(Math.min(RING_SECTORS - 1, Math.floor(turn * RING_SECTORS)));
  }

  let blocked = 0;
  for (let ray = 0; ray < RAYS; ray++) {
    const angle = (ray * 2 * Math.PI) / RAYS;
    const dx = detCos(angle);
    const dy = detSin(angle);
    for (let step = 1; step <= RAY_LENGTH * 2; step++) {
      const x = Math.floor(hall.x + 0.5 + (dx * step) / 2);
      const y = Math.floor(hall.y + 0.5 + (dy * step) / 2);
      if (others.some((building) => inside(building, x, y))) {
        blocked += 1;
        break;
      }
    }
  }

  const commute: number[] = [];
  for (const station of stations) {
    const lodge = nearest(station, lodgings);
    const direct = distance(station, hall);
    if (!lodge || direct === 0) continue;
    commute.push(((lodge.d + distance(lodge.point, hall)) * 1000) / direct);
  }

  return {
    hallOffset: Math.max(Math.abs(hall.x - input.center.x), Math.abs(hall.y - input.center.y)),
    sectors: covered.size,
    screenPm: Math.round((blocked * 1000) / RAYS),
    hallToStation: mean(stations.map((at) => distance(at, hall))),
    hallToStorage: mean(storages.map((at) => distance(at, hall))),
    hallToLodging: mean(lodgings.map((at) => distance(at, hall))),
    haul: storages.length === 0 ? null : mean(stations.map((at) => nearest(at, storages)?.d ?? 0)),
    commutePm: commute.length === 0 ? null : Math.round(commute.reduce((s, v) => s + v, 0) / commute.length),
    walledIn: walledIn(hallRect, others, input.plazaCells, size, input.passable),
  };
}

/** 광장에서 걸어 곁 칸에 닿지 못하는 건물 수(4방향 걷기, 건물 칸·막힌 칸은 못 지난다) */
function walledIn(
  hallRect: LayoutRect,
  others: readonly LayoutRect[],
  plazaCells: number,
  size: number,
  passable: ((x: number, y: number) => boolean) | undefined,
): number {
  const solid = new Uint8Array(size * size);
  for (const rect of [hallRect, ...others])
    for (let y = Math.max(0, rect.y); y < Math.min(size, rect.y + rect.height); y++)
      for (let x = Math.max(0, rect.x); x < Math.min(size, rect.x + rect.width); x++) solid[y * size + x] = 1;
  const free = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && solid[y * size + x] === 0 && (!passable || passable(x, y));
  const seen = new Uint8Array(size * size);
  const queue: number[] = [];
  const plaza = grow(hallRect, Math.max(1, plazaCells));
  for (let y = plaza.y; y < plaza.y + plaza.height; y++)
    for (let x = plaza.x; x < plaza.x + plaza.width; x++)
      if (free(x, y)) {
        seen[y * size + x] = 1;
        queue.push(y * size + x);
      }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head] ?? 0;
    const x = index % size;
    const y = Math.floor(index / size);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (!free(nx, ny) || seen[ny * size + nx] === 1) continue;
      seen[ny * size + nx] = 1;
      queue.push(ny * size + nx);
    }
  }
  let count = 0;
  for (const rect of others) {
    const ring = grow(rect, 1);
    let reached = false;
    for (let y = ring.y; y < ring.y + ring.height && !reached; y++)
      for (let x = ring.x; x < ring.x + ring.width; x++) {
        if (inside(rect, x, y) || x < 0 || y < 0 || x >= size || y >= size) continue;
        if (seen[y * size + x] === 1) {
          reached = true;
          break;
        }
      }
    if (!reached) count += 1;
  }
  return count;
}
