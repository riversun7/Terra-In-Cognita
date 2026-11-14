// 느려짐 소품 경로 측정(기획 D-540 질문 1223 나, SIM_VERSION 37) — secondMapPaths.ts에 바이옴을 주면 부른다.
// 그 바이옴 땅 2차맵(서로 떨어진 칸)을 생성기 → 지형 비용(엄폐·그림 층) → 배치 격자로 만들고, 느림 배율 표 없음·있음 두 격자에서
// 같은 출발·목표 1,000개(크기 등급 1 90%·2 8%·3 2%, sim 벤치와 같은 분포)를 잰다.
// 경로 비용 = 걸음 길이 × 칸 비용의 합(그 격자 비용으로), 밟은 느려짐 칸 = 경로 칸 가운데 느림 배율이 있는 그림이 선 칸 수.
// 요약의 "표 없음 길의 느림 비용"(크기 등급 1)은 돌아가지 않았을 때 치를 비용이다(돌아간 경로 비용과 비교).
import { performance } from "node:perf_hooks";
import { FACES, cellKey } from "@terra/planet";
import { type PlanetValues, type PropRuleSet, generateSecondMap } from "@terra/planet/secondMap";
import { createRng } from "@terra/shared";
import {
  DIAGONAL_STEP,
  STRAIGHT_STEP,
  type PlacementGrid,
  type SizeClass,
  createPathfinder,
  createPlacementGrid,
  isPassable,
  placementCostsFromLayers,
} from "@terra/sim";

const TRIPS = 1000;

export interface SlowBenchInput {
  readonly values: PlanetValues;
  readonly rules: PropRuleSet;
  readonly level: number;
  readonly mapCount: number;
  readonly biome: string;
  readonly slowByArt: Uint16Array;
  readonly planetMs: number;
}

interface Trip {
  size: SizeClass;
  start: { x: number; y: number };
  goal: { x: number; y: number };
}

const ms = (value: number) => `${value.toFixed(2)} ms`;
const pct = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
const mean = (list: readonly number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);

function makeTrips(grid: PlacementGrid, seed: number): Trip[] {
  const rng = createRng(seed);
  const pick = (size: SizeClass) => {
    for (let tries = 0; tries < 100_000; tries++) {
      const x = rng.nextInt(256);
      const y = rng.nextInt(256);
      if (isPassable(grid, x, y, size)) return { x, y };
    }
    return { x: 0, y: 0 };
  };
  return Array.from({ length: TRIPS }, () => {
    const roll = rng.nextInt(100);
    const size: SizeClass = roll < 90 ? 1 : roll < 98 ? 2 : 3;
    return { size, start: pick(size), goal: pick(size) };
  });
}

/** 크기 등급 1 칸 경로의 비용(astar.ts와 같은 셈: 걸음 길이 × 들어가는 칸 비용, 도로 없음) */
function pathCost(costs: Uint16Array, cells: readonly number[]): number {
  let total = 0;
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1] ?? 0;
    const b = cells[i] ?? 0;
    const diagonal = a % 256 !== b % 256 && Math.floor(a / 256) !== Math.floor(b / 256);
    total += (diagonal ? DIAGONAL_STEP : STRAIGHT_STEP) * (costs[b] ?? 0);
  }
  return total;
}

interface RunResult {
  times: number[];
  expanded: number[];
  costs: number[];
  slowCells: number[];
  lengths: number[];
  paths: (readonly number[] | undefined)[];
}

function run(grid: PlacementGrid, trips: readonly Trip[], isSlow: (cell: number) => boolean): RunResult {
  const pathfinder = createPathfinder();
  const out: RunResult = { times: [], expanded: [], costs: [], slowCells: [], lengths: [], paths: [] };
  for (const trip of trips) {
    const started = performance.now();
    const result = pathfinder.findPath(grid, trip);
    out.times.push(performance.now() - started);
    if (result.status !== "found") {
      out.paths.push(undefined);
      continue;
    }
    out.paths.push(result.cells);
    out.expanded.push(result.expanded);
    out.costs.push(result.cost);
    out.lengths.push(result.cells.length);
    out.slowCells.push(result.cells.filter(isSlow).length);
  }
  return out;
}

export function runSlowPropsBench(input: SlowBenchInput): void {
  const { values, rules, level, mapCount, biome, slowByArt } = input;
  const biomeIndex = values.biomeIds.indexOf(biome);
  if (biomeIndex < 0) throw new Error(`unknown biome ${biome}: ${values.biomeIds.join(", ")}`);
  const n = 2 ** level;
  console.log(`# 느려짐 소품 경로 측정 (Node ${process.version}, ${process.platform}/${process.arch})`);
  console.log(
    `\n행성 S2 시험 행성 F${level} 생성 ${ms(input.planetMs)}, 바이옴 ${biome}, 느림 배율 ${[
      ...slowByArt.entries(),
    ]
      .filter(([, pm]) => pm > 0)
      .map(([code, pm]) => `그림 ${code} ${pm}‰`)
      .join(", ")}`,
  );
  const picked: { key: number; plain: Uint16Array; slowed: Uint16Array; art: Uint8Array; share: number }[] =
    [];
  const used: number[] = [];
  for (let cell = 0; cell < 6 * n * n && picked.length < mapCount; cell += 1) {
    if (values.biome[cell] !== biomeIndex || ((values.water[cell] ?? 0) & 3) !== 0) continue;
    const far = used.every(
      (other) =>
        Math.abs((other % n) - (cell % n)) + Math.abs(Math.floor(other / n) - Math.floor(cell / n)) > 8,
    );
    if (!far) continue;
    used.push(cell);
    const face = Math.floor(cell / (n * n));
    const rest = cell - face * n * n;
    const key = cellKey(FACES[face] ?? 0, level, rest % n, Math.floor(rest / n));
    const map = generateSecondMap(values, key, rules);
    const layers = { heights: map.heightsCm, surface: map.surface, cover: map.cover, art: map.art };
    const plain = placementCostsFromLayers(layers);
    const t0 = performance.now();
    const slowed = placementCostsFromLayers({ ...layers, slowByArt });
    const costMs = performance.now() - t0;
    let slowCount = 0;
    for (const code of map.art) if ((slowByArt[code] ?? 0) > 1000) slowCount += 1;
    if (slowCount === 0) continue;
    picked.push({ key, plain, slowed, art: map.art, share: slowCount / map.art.length });
    console.log(
      `- 2차맵 ${key}: 느려짐 칸 ${((slowCount / map.art.length) * 100).toFixed(1)}%, 느림 지형 비용 ${ms(costMs)}`,
    );
  }
  console.log(`\n## 경로 ${TRIPS}개 (2차맵마다, 같은 출발·목표, 크기 등급 1·2·3)`);
  console.log(
    "| 2차맵 | 격자 | 합계 | p50 / p95 / 최대 | 펼친 칸 평균 | 경로 칸 평균 | 경로 비용 평균 | 밟은 느려짐 칸 평균 |\n|---|---|---|---|---|---|---|---|",
  );
  const summary: { plainCross: number; slowCross: number; detourCost: number; straightCost: number }[] = [];
  for (const { key, plain, slowed, art } of picked) {
    const plainGrid = createPlacementGrid(plain);
    const slowGrid = createPlacementGrid(slowed);
    const isSlow = (cell: number) => (slowByArt[art[cell] ?? 0] ?? 0) > 1000;
    run(slowGrid, makeTrips(slowGrid, 1), isSlow); // JIT 데우기
    const trips = makeTrips(plainGrid, 2026);
    const rows: [string, RunResult][] = [
      ["표 없음", run(plainGrid, trips, isSlow)],
      ["느림 배율", run(slowGrid, trips, isSlow)],
    ];
    for (const [label, result] of rows) {
      const times = result.times.toSorted((a, b) => a - b);
      console.log(
        `| ${key} | ${label} | ${ms(times.reduce((a, b) => a + b, 0))} | ${ms(pct(times, 0.5))} / ${ms(pct(times, 0.95))} / ${ms(times.at(-1) ?? 0)} | ${Math.round(mean(result.expanded))} | ${mean(result.lengths).toFixed(1)} | ${Math.round(mean(result.costs))} | ${mean(result.slowCells).toFixed(1)} |`,
      );
    }
    // 같은 길을 느림 비용으로 셈(돌아가지 않았다면) ↔ 돌아간 길
    const [, plainRun] = rows[0] ?? ["", undefined];
    const [, slowRun] = rows[1] ?? ["", undefined];
    if (!plainRun || !slowRun) continue;
    const straight: number[] = [];
    const detour: number[] = [];
    plainRun.paths.forEach((cells, i) => {
      const other = slowRun.paths[i];
      if (!cells || !other || trips[i]?.size !== 1) return;
      straight.push(pathCost(slowed, cells));
      detour.push(pathCost(slowed, other));
    });
    summary.push({
      plainCross: mean(plainRun.slowCells),
      slowCross: mean(slowRun.slowCells),
      straightCost: mean(straight),
      detourCost: mean(detour),
    });
  }
  console.log("\n## 돌아가기 요약 (크기 등급 1, 느림 비용으로 셈)");
  console.log(
    "| 2차맵 | 밟은 느려짐 칸(표 없음 → 있음) | 표 없음 길의 느림 비용 | 돌아간 길 비용 | 줄어든 몫 |\n|---|---|---|---|---|",
  );
  summary.forEach((row, i) => {
    const key = picked[i]?.key ?? 0;
    const saved = row.straightCost > 0 ? ((row.straightCost - row.detourCost) / row.straightCost) * 100 : 0;
    console.log(
      `| ${key} | ${row.plainCross.toFixed(1)} → ${row.slowCross.toFixed(1)} | ${Math.round(row.straightCost)} | ${Math.round(row.detourCost)} | ${saved.toFixed(1)}% |`,
    );
  });
}
