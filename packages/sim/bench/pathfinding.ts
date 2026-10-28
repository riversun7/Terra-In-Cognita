// S1 서버 예산용 벤치마크 — 유닛 1,000개 경로탐색, 통과 폭 다시 계산, 이동 위치 계산, 이벤트 큐.
// 실행: pnpm --filter @terra/sim bench  (또는 packages/sim에서 node bench/pathfinding.ts)
// pnpm test에 넣지 않는다(시간을 재는 스크립트라 결과가 기계마다 다르다).
import { createRng } from "@terra/shared";
import {
  type PlacementGrid,
  type Rotation,
  type SizeClass,
  WALK_SPEED,
  applyPlacement,
  arrivalAt,
  computeClearance,
  createEventQueue,
  createFnv1a,
  createMotion,
  createPathfinder,
  createPlacementGrid,
  generateTempTerrain,
  isPassable,
  placementCostsFromTerrain,
  planRoute,
  positionAt,
  removeBuilding,
  seedFromCellKey,
  setRoad,
  anchorCenter,
  type Motion,
  ROAD_TWO_LANE,
} from "../src/index.ts";

const UNITS = 1000;
const MAP_SEED = seedFromCellKey(0x1234_5678_9abc);
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const ms = (value: number) => `${value.toFixed(3)} ms`;

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

function timeIt(repeat: number, body: () => void): number {
  const start = performance.now();
  for (let i = 0; i < repeat; i++) body();
  return (performance.now() - start) / repeat;
}

// ── 지도: 임시 지형 + 건물 300개 시도 + 2칸 폭 도로 격자 ─────────────────────────────
const memoryBefore = process.memoryUsage();
const terrainMs = timeIt(20, () => generateTempTerrain(MAP_SEED));
const terrain = generateTempTerrain(MAP_SEED);
const costs = placementCostsFromTerrain(terrain);
const gridMs = timeIt(20, () => createPlacementGrid(costs));
const grid = createPlacementGrid(costs);
const layoutRng = createRng(7);
let buildingsPlaced = 0;
for (let id = 1; id <= 300; id++) {
  const placement = {
    x: layoutRng.nextInt(256),
    y: layoutRng.nextInt(256),
    width: 2 + layoutRng.nextInt(7),
    height: 2 + layoutRng.nextInt(7),
    rotation: ROTATIONS[layoutRng.nextInt(4)] ?? 0,
  };
  if (applyPlacement(grid, id, placement).ok) buildingsPlaced++;
}
for (let line = 16; line < 256; line += 48) {
  for (let i = 0; i < 256; i++) {
    for (const offset of [0, 1]) {
      if (grid.building[(line + offset) * 256 + i] === 0) setRoad(grid, i, line + offset, ROAD_TWO_LANE);
      if (grid.building[i * 256 + line + offset] === 0) setRoad(grid, line + offset, i, ROAD_TWO_LANE);
    }
  }
}

// ── 유닛 1,000개: 크기 등급 1(90%)·2(8%)·3(2%), 출발·목표는 그 등급이 설 수 있는 칸 ───────────
interface UnitTrip {
  size: SizeClass;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
function makeTrips(seed: number): UnitTrip[] {
  const rng = createRng(seed);
  const pick = (size: SizeClass) => {
    for (;;) {
      const x = rng.nextInt(256);
      const y = rng.nextInt(256);
      if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
    }
  };
  return Array.from({ length: UNITS }, () => {
    const roll = rng.nextInt(100);
    const size: SizeClass = roll < 90 ? 1 : roll < 98 ? 2 : 3;
    return { size, from: pick(size), to: pick(size) };
  });
}

interface RunResult {
  times: number[];
  expanded: number[];
  statuses: Map<string, number>;
  waypoints: number;
  motions: Motion[];
  digest: string;
  totalMs: number;
}
function runTrips(map: PlacementGrid, trips: readonly UnitTrip[], nodeBudget?: number): RunResult {
  const pathfinder = createPathfinder();
  const times: number[] = [];
  const expanded: number[] = [];
  const statuses = new Map<string, number>();
  const motions: Motion[] = [];
  const hash = createFnv1a();
  let waypoints = 0;
  const started = performance.now();
  for (const trip of trips) {
    const t0 = performance.now();
    const route = planRoute(pathfinder, map, {
      ...trip,
      ...(nodeBudget === undefined ? {} : { nodeBudget }),
    });
    times.push(performance.now() - t0);
    statuses.set(route.status, (statuses.get(route.status) ?? 0) + 1);
    hash.updateText(route.status);
    if ("expanded" in route) expanded.push(route.expanded);
    if (route.status === "found") {
      waypoints += route.waypoints.length;
      for (const point of route.waypoints) {
        hash.update32(point.x);
        hash.update32(point.y);
      }
      motions.push(
        createMotion({ waypoints: route.waypoints, departAtMs: 1_798_000_000_000, speed: WALK_SPEED }),
      );
    }
  }
  return {
    times,
    expanded,
    statuses,
    waypoints,
    motions,
    digest: hash.digest(),
    totalMs: performance.now() - started,
  };
}

function report(label: string, result: RunResult): void {
  const times = result.times.toSorted((a, b) => a - b);
  const expanded = result.expanded.toSorted((a, b) => a - b);
  const found = result.statuses.get("found") ?? 0;
  console.log(`\n## ${label}`);
  console.log(`| 항목 | 값 |\n|---|---|`);
  console.log(`| 합계 | ${ms(result.totalMs)} |`);
  console.log(
    `| 평균 / p50 / p95 / p99 / 최대 | ${ms(result.totalMs / times.length)} / ${ms(percentile(times, 0.5))} / ${ms(percentile(times, 0.95))} / ${ms(percentile(times, 0.99))} / ${ms(times.at(-1) ?? 0)} |`,
  );
  console.log(
    `| 펼친 칸 평균 / p95 / 최대 | ${Math.round(expanded.reduce((a, b) => a + b, 0) / Math.max(1, expanded.length))} / ${percentile(expanded, 0.95)} / ${expanded.at(-1) ?? 0} |`,
  );
  console.log(`| 상태 | ${[...result.statuses].map(([k, v]) => `${k} ${v}`).join(", ")} |`);
  console.log(`| 꺾이는 점 평균 | ${(result.waypoints / Math.max(1, found)).toFixed(1)} |`);
  console.log(`| 결과 해시 | ${result.digest} |`);
}

console.log(`# @terra/sim 벤치마크 (Node ${process.version}, ${process.platform}/${process.arch})`);
console.log(`\n## 지도`);
console.log(`| 항목 | 값 |\n|---|---|`);
console.log(`| 임시 지형 생성(129×129 높이 + 128×128 지표) | ${ms(terrainMs)} |`);
console.log(`| 배치 격자 만들기(전체 통과 폭 포함) | ${ms(gridMs)} |`);
console.log(`| 건물 | ${buildingsPlaced}/300 놓음 |`);

const trips = makeTrips(2026);
const cold = runTrips(grid, trips);
report("경로탐색 1,000개 — 첫 실행(JIT 예열 전)", cold);
const warm = runTrips(grid, makeTrips(2027));
report("경로탐색 1,000개 — 예열 뒤(다른 출발·목표)", warm);
const again = runTrips(grid, makeTrips(2027));
console.log(`\n결정성: 같은 입력 두 번 → 해시 ${warm.digest === again.digest ? "같음" : "다름!"}`);
report("경로탐색 1,000개 — 노드 예산 16,384", runTrips(grid, makeTrips(2027), 16_384));

// ── 통과 폭: 전체 계산 vs 건물 놓기·치우기(국소 갱신) ─────────────────────────────────
const fullClearanceMs = timeIt(200, () => computeClearance(grid));
const placeRng = createRng(99);
let placeOps = 0;
let placeTime = 0;
let removeTime = 0;
for (let i = 0; i < 2000; i++) {
  const id = 100_000 + i;
  const placement = {
    x: placeRng.nextInt(250),
    y: placeRng.nextInt(250),
    width: 4,
    height: 4,
    rotation: 0 as const,
  };
  const t0 = performance.now();
  const ok = applyPlacement(grid, id, placement).ok;
  const t1 = performance.now();
  if (!ok) continue;
  removeBuilding(grid, id);
  const t2 = performance.now();
  placeOps++;
  placeTime += t1 - t0;
  removeTime += t2 - t1;
}
console.log(`\n## 통과 폭`);
console.log(`| 항목 | 값 |\n|---|---|`);
console.log(`| 전체 다시 계산(256×256) | ${ms(fullClearanceMs)} |`);
console.log(
  `| 4×4 건물 놓기(검사 + 점유 + 국소 갱신, ${placeOps}번 평균) | ${ms(placeTime / Math.max(1, placeOps))} |`,
);
console.log(`| 4×4 건물 치우기(국소 갱신) | ${ms(removeTime / Math.max(1, placeOps))} |`);

// ── 이동 위치 계산과 도착 이벤트 ───────────────────────────────────────────────────
const motions = warm.motions;
const sampleTime = 1_798_000_000_000 + 60_000;
const positionsMs = timeIt(1000, () => {
  for (const motion of motions) positionAt(motion, sampleTime);
});
const queueMs = timeIt(200, () => {
  const queue = createEventQueue<number>();
  motions.forEach((motion, i) => queue.schedule(arrivalAt(motion), i));
  queue.popDue(Number.MAX_SAFE_INTEGER);
});
console.log(`\n## 이동·이벤트`);
console.log(`| 항목 | 값 |\n|---|---|`);
console.log(`| positionAt ${motions.length}개 한 번 | ${ms(positionsMs)} |`);
console.log(`| 도착 이벤트 ${motions.length}개 예약 + 모두 꺼내기 | ${ms(queueMs)} |`);

// ── 메모리 ────────────────────────────────────────────────────────────────────────
const gridBytes =
  grid.terrainCost.byteLength + grid.road.byteLength + grid.building.byteLength + grid.clearance.byteLength;
const memoryAfter = process.memoryUsage();
console.log(`\n## 메모리`);
console.log(`| 항목 | 값 |\n|---|---|`);
console.log(`| 배치 격자 1개(타입 배열) | ${mib(gridBytes)} |`);
// g 8 + 부모 4 + 도장 4 + 4, 힙: f 8 + h 8 + 칸 4 + 위치 4 (바이트/칸)
console.log(`| 길찾기 객체 1개(작업 배열 + 힙) | ${mib(65536 * (8 + 4 + 4 + 4 + 8 + 8 + 4 + 4))} |`);
console.log(
  `| 임시 지형 1개(높이 + 지표) | ${mib(terrain.heights.byteLength + terrain.surface.byteLength)} |`,
);
console.log(`| 프로세스 heapUsed 시작 → 끝 | ${mib(memoryBefore.heapUsed)} → ${mib(memoryAfter.heapUsed)} |`);
console.log(`| 프로세스 rss 시작 → 끝 | ${mib(memoryBefore.rss)} → ${mib(memoryAfter.rss)} |`);
