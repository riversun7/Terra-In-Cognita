// 숲 지형 경로 측정(ADR 35 "경로탐색", ADR 46 10절 WP-2 "sim 벤치에 숲 지형") — node bench/secondMapPaths.ts [면 레벨] [2차맵 수]
// @terra/sim은 @terra/planet을 가져올 수 없어서(경계 규칙) 서버 꾸러미에 둔다. 서버가 쓸 길(생성기 → 지형 비용 → 배치 격자)과 같다.
// - 콘텐츠 팩 S2 시험 행성(기본 F9)을 생성하고, 숲 밀도가 높은 땅 2차맵을 고른다(기본 6장, 서로 떨어진 칸).
// - 2차맵마다: 생성 ms, 지형 비용 ms, 배치 격자 ms, 막힌 칸 몫(엄폐 뺌·포함).
// - 경로 1,000개(크기 등급 1 90%·2 8%·3 2%, sim 벤치와 같은 분포)를 엄폐 포함 격자와 엄폐 뺀 격자에서 같은 출발·목표로 잰다.
//   노드 예산 16,384도 잰다. 표는 Markdown이다. pnpm test에는 없다(시간을 재는 스크립트라 기계마다 다르다).
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { FACES, cellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { compileMapProps, generateSecondMap, planetValuesFromGeneration } from "@terra/planet/secondMap";
import { createRng } from "@terra/shared";
import {
  type PlacementGrid,
  type SizeClass,
  anchorCenter,
  createPathfinder,
  createPlacementGrid,
  isPassable,
  placementCostsFromLayers,
  planRoute,
} from "@terra/sim";
import { mapPropInputsFromPack } from "../src/world/mapProps.ts";

const level = Number(process.argv[2] ?? 9);
const mapCount = Number(process.argv[3] ?? 6);
const TRIPS = 1000;

const loaded = loadContentPack(fileURLToPath(new URL("../../../content/core", import.meta.url)));
if (!loaded.pack) throw new Error("content/core does not validate");
const pack = loaded.pack;
const planet = (pack.entries.get("planets") ?? []).find((entry) => entry.id === "s2_test_planet");
if (!planet) throw new Error("content/core has no s2_test_planet");
const input = planetInputFromDefinition(planet, pack.entries.get("biomes") ?? [], level);
const biomeIds = input.biomes.map((biome) => biome.id);
let t0 = performance.now();
const details = runPlanetGenerator(input);
const planetMs = performance.now() - t0;
const values = planetValuesFromGeneration(details.fields, details, biomeIds);
const rules = compileMapProps(mapPropInputsFromPack(pack), biomeIds);

// 숲 밀도가 높은 땅 칸(바다·호수 아님), 숲 밀도 차례로 앞에서, 서로 8칸 넘게 떨어진 것
const n = 2 ** level;
const candidates: number[] = [];
for (let cell = 0; cell < values.forest.length; cell++) {
  if ((values.forest[cell] ?? 0) >= 200 && ((values.water[cell] ?? 0) & 3) === 0) candidates.push(cell);
}
candidates.sort((a, b) => (values.forest[b] ?? 0) - (values.forest[a] ?? 0) || a - b);
const picked: number[] = [];
for (const cell of candidates) {
  if (picked.length >= mapCount) break;
  const far = picked.every(
    (other) =>
      Math.abs((other % n) - (cell % n)) + Math.abs(Math.floor(other / n) - Math.floor(cell / n)) > 8,
  );
  if (far) picked.push(cell);
}

const ms = (value: number) => `${value.toFixed(2)} ms`;
const pct = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
const blockedShare = (grid: PlacementGrid) => {
  let blocked = 0;
  for (const cost of grid.terrainCost) if (cost === 0) blocked += 1;
  return `${((blocked / grid.terrainCost.length) * 100).toFixed(1)}%`;
};

interface Trip {
  size: SizeClass;
  from: { x: number; y: number };
  to: { x: number; y: number };
}
/** 엄폐 포함 격자에서 그 크기 등급이 설 수 있는 칸끼리(같은 출발·목표를 엄폐 뺀 격자에도 쓴다) */
function makeTrips(grid: PlacementGrid, seed: number): Trip[] {
  const rng = createRng(seed);
  const pick = (size: SizeClass) => {
    for (let tries = 0; tries < 100_000; tries++) {
      const x = rng.nextInt(256);
      const y = rng.nextInt(256);
      if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
    }
    return anchorCenter(0, 0, size);
  };
  return Array.from({ length: TRIPS }, () => {
    const roll = rng.nextInt(100);
    const size: SizeClass = roll < 90 ? 1 : roll < 98 ? 2 : 3;
    return { size, from: pick(size), to: pick(size) };
  });
}

function run(grid: PlacementGrid, trips: readonly Trip[], nodeBudget?: number) {
  const pathfinder = createPathfinder();
  const times: number[] = [];
  const expanded: number[] = [];
  const statuses = new Map<string, number>();
  for (const trip of trips) {
    const start = performance.now();
    const route = planRoute(pathfinder, grid, {
      ...trip,
      ...(nodeBudget === undefined ? {} : { nodeBudget }),
    });
    times.push(performance.now() - start);
    statuses.set(route.status, (statuses.get(route.status) ?? 0) + 1);
    if ("expanded" in route) expanded.push(route.expanded);
  }
  times.sort((a, b) => a - b);
  expanded.sort((a, b) => a - b);
  const total = times.reduce((sum, value) => sum + value, 0);
  return {
    line: `${ms(total)} | ${ms(pct(times, 0.5))} / ${ms(pct(times, 0.95))} / ${ms(pct(times, 0.99))} / ${ms(times.at(-1) ?? 0)} | ${Math.round(expanded.reduce((a, b) => a + b, 0) / Math.max(1, expanded.length))} / ${pct(expanded, 0.95)} / ${expanded.at(-1) ?? 0} | ${[...statuses].map(([k, v]) => `${k} ${v}`).join(", ")}`,
  };
}

console.log(`# 숲 지형 경로 측정 (Node ${process.version}, ${process.platform}/${process.arch})`);
console.log(
  `\n행성 S2 시험 행성 F${level} 생성 ${ms(planetMs)}, 소품 규칙 해시 ${rules.hash}, 2차맵 ${picked.length}장`,
);
console.log(`\n## 2차맵`);
console.log(
  `| 2차맵 | 숲 밀도 | 생성 | 지형 비용 | 배치 격자 | 막힌 칸(엄폐 뺌 → 포함) |\n|---|---|---|---|---|---|`,
);
const prepared: { key: number; withCover: PlacementGrid; terrainOnly: PlacementGrid }[] = [];
for (const cell of picked) {
  const face = FACES[Math.floor(cell / (n * n))] ?? 0;
  const rest = cell - face * n * n;
  const key = cellKey(face, level, rest % n, Math.floor(rest / n));
  t0 = performance.now();
  const map = generateSecondMap(values, key, rules);
  const generateMs = performance.now() - t0;
  t0 = performance.now();
  const costs = placementCostsFromLayers({ heights: map.heightsCm, surface: map.surface, cover: map.cover });
  const costMs = performance.now() - t0;
  t0 = performance.now();
  const withCover = createPlacementGrid(costs);
  const gridMs = performance.now() - t0;
  const terrainOnly = createPlacementGrid(
    placementCostsFromLayers({ heights: map.heightsCm, surface: map.surface }),
  );
  prepared.push({ key, withCover, terrainOnly });
  console.log(
    `| ${key} | ${values.forest[cell] ?? 0} | ${ms(generateMs)} | ${ms(costMs)} | ${ms(gridMs)} | ${blockedShare(terrainOnly)} → ${blockedShare(withCover)} |`,
  );
}

console.log(`\n## 경로 ${TRIPS}개 (2차맵마다, 같은 출발·목표)`);
console.log(
  `| 2차맵 | 격자 | 합계 | p50 / p95 / p99 / 최대 | 펼친 칸 평균 / p95 / 최대 | 상태 |\n|---|---|---|---|---|---|`,
);
for (const { key, withCover, terrainOnly } of prepared) {
  // 한 번 돌려 JIT를 데운다
  run(withCover, makeTrips(withCover, 1), undefined);
  const trips = makeTrips(withCover, 2026);
  console.log(`| ${key} | 숲(엄폐 포함) | ${run(withCover, trips).line} |`);
  console.log(`| ${key} | 엄폐 뺌 | ${run(terrainOnly, trips).line} |`);
  console.log(`| ${key} | 숲, 노드 예산 16,384 | ${run(withCover, trips, 16_384).line} |`);
}
