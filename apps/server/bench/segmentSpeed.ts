// 구간 빠르기 측정(기획 D-541, docs/adr/2026-11-14-segment-speed.md) — secondMapPaths.ts에 바이옴 자리로 "pace"를 주면 부른다.
// 서버와 같은 길(생성기 → 지형 비용(엄폐·그림 층·느림 표) → 배치 격자)로 숲 밀도가 높은 땅 2차맵을 만들고, 같은 출발·목표 1,000개(걷기,
// 크기 등급 1)를 구간 빠르기 없이(예전)·있게 길 고르기 → 움직임 → 전송 항목으로 만들어 비교한다:
// - 도착 시간(예전 ÷ 지금 배), 꺾이는 점 수, 전송 항목 JSON 바이트(motionToWire — 메시지 크기), 길 고르기 ms.
// - 숲 건너기: 2차맵마다 가장 긴 숲(나무가 선 칸) 줄을 곧게 지나는 시간과 같은 길이 풀밭 시간.
import { performance } from "node:perf_hooks";
import { FACES, cellKey } from "@terra/planet";
import { type PlanetValues, type PropRuleSet, generateSecondMap } from "@terra/planet/secondMap";
import { createRng } from "@terra/shared";
import {
  CELL_UNITS,
  FOREST_COST_PM,
  type PlacementGrid,
  WALK_SPEED,
  anchorCenter,
  arrivalAt,
  createMotion,
  createPathfinder,
  createPlacementGrid,
  isPassable,
  isTreeArt,
  placementCostsFromLayers,
  planRoute,
} from "@terra/sim";
import { motionToWire, sized } from "../src/world/wire.ts";

const TRIPS = 1000;

export interface PaceBenchInput {
  readonly values: PlanetValues;
  readonly rules: PropRuleSet;
  readonly level: number;
  readonly mapCount: number;
  readonly slowByArt: Uint16Array;
}

const mean = (list: readonly number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
const pct = (sorted: readonly number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;

export function runPaceBench(input: PaceBenchInput): void {
  const { values, rules, level, mapCount, slowByArt } = input;
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
  console.log(
    `# 구간 빠르기 측정 (Node ${process.version}, S2 시험 행성 F${level}, 걷기 ${WALK_SPEED}단위/초)`,
  );
  console.log(
    `\n| 2차맵 | 숲 칸 몫 | 도착 시간 평균(예전 → 지금, 배) | p95 배 | 점 수 평균(예전 → 지금) | 항목 바이트 평균(예전 → 지금) | 최대 바이트 | 길 고르기 합(예전 → 지금) | 숲 건너기(칸, 풀밭 → 숲) |\n|---|---|---|---|---|---|---|---|---|`,
  );
  const pathfinder = createPathfinder();
  const totals = { flatMs: 0, pacedMs: 0, flatBytes: 0, pacedBytes: 0, trips: 0 };
  for (const cell of picked) {
    const face = FACES[Math.floor(cell / (n * n))] ?? 0;
    const rest = cell - face * n * n;
    const key = cellKey(face, level, rest % n, Math.floor(rest / n));
    const map = generateSecondMap(values, key, rules);
    const grid = createPlacementGrid(
      placementCostsFromLayers({
        heights: map.heightsCm,
        surface: map.surface,
        cover: map.cover,
        art: map.art,
        slowByArt,
      }),
    );
    let trees = 0;
    for (const code of map.art) if (isTreeArt(code)) trees += 1;
    const rng = createRng(2026);
    const pick = () => {
      for (let tries = 0; tries < 100_000; tries++) {
        const x = rng.nextInt(256);
        const y = rng.nextInt(256);
        if (isPassable(grid, x, y, 1)) return anchorCenter(x, y, 1);
      }
      return anchorCenter(0, 0, 1);
    };
    const ratios: number[] = [];
    const flatTimes: number[] = [];
    const pacedTimes: number[] = [];
    const flatPoints: number[] = [];
    const pacedPoints: number[] = [];
    const flatBytes: number[] = [];
    const pacedBytes: number[] = [];
    let flatPlanMs = 0;
    let pacedPlanMs = 0;
    for (let i = 0; i < TRIPS; i++) {
      const from = pick();
      const to = pick();
      let t0 = performance.now();
      const flat = planRoute(pathfinder, grid, { from, to, size: 1 });
      flatPlanMs += performance.now() - t0;
      t0 = performance.now();
      const paced = planRoute(pathfinder, grid, { from, to, size: 1, paceSpeed: WALK_SPEED });
      pacedPlanMs += performance.now() - t0;
      if (flat.status !== "found" || paced.status !== "found" || flat.waypoints.length < 2) continue;
      const a = createMotion({ waypoints: flat.waypoints, departAtMs: 0, speed: WALK_SPEED });
      const b = createMotion({
        waypoints: paced.waypoints,
        paces: paced.paces,
        departAtMs: 0,
        speed: WALK_SPEED,
      });
      flatTimes.push(arrivalAt(a));
      pacedTimes.push(arrivalAt(b));
      ratios.push(arrivalAt(b) / Math.max(1, arrivalAt(a)));
      flatPoints.push(a.waypoints.length);
      pacedPoints.push(b.waypoints.length);
      flatBytes.push(sized(motionToWire(123_456, 1, a)).bytes);
      pacedBytes.push(sized(motionToWire(123_456, 1, b)).bytes);
    }
    ratios.sort((x, y) => x - y);
    totals.flatMs += flatTimes.reduce((x, y) => x + y, 0);
    totals.pacedMs += pacedTimes.reduce((x, y) => x + y, 0);
    totals.flatBytes += flatBytes.reduce((x, y) => x + y, 0);
    totals.pacedBytes += pacedBytes.reduce((x, y) => x + y, 0);
    totals.trips += flatTimes.length;
    const crossing = forestCrossing(grid, map.art);
    console.log(
      `| ${key} | ${((trees / map.art.length) * 100).toFixed(1)}% | ${(mean(flatTimes) / 1000).toFixed(1)}초 → ${(mean(pacedTimes) / 1000).toFixed(1)}초 (${mean(ratios).toFixed(3)}) | ${pct(ratios, 0.95).toFixed(3)} | ${mean(flatPoints).toFixed(1)} → ${mean(pacedPoints).toFixed(1)} | ${mean(flatBytes).toFixed(0)} → ${mean(pacedBytes).toFixed(0)} | ${Math.max(...pacedBytes)} | ${flatPlanMs.toFixed(0)} → ${pacedPlanMs.toFixed(0)} ms | ${crossing} |`,
    );
  }
  console.log(
    `\n전체 ${totals.trips}길: 도착 시간 합 ${(totals.flatMs / 1000).toFixed(0)}초 → ${(totals.pacedMs / 1000).toFixed(0)}초 (${(totals.pacedMs / Math.max(1, totals.flatMs)).toFixed(3)}배), 항목 바이트 평균 ${(totals.flatBytes / Math.max(1, totals.trips)).toFixed(0)} → ${(totals.pacedBytes / Math.max(1, totals.trips)).toFixed(0)}`,
  );
}

/** 가장 긴 나무 칸 가로줄을 곧게 지나는 시간: 같은 길이 풀밭(배율 1000)과 그 줄의 칸 비용(구간 빠르기) */
function forestCrossing(grid: PlacementGrid, art: Uint8Array): string {
  let best = { y: 0, x: 0, length: 0 };
  for (let y = 0; y < 256; y++) {
    let run = 0;
    for (let x = 0; x < 256; x++) {
      const index = y * 256 + x;
      if (isTreeArt(art[index] ?? 0) && (grid.terrainCost[index] ?? 0) > 0) {
        run += 1;
        if (run > best.length) best = { y, x: x - run + 1, length: run };
      } else run = 0;
    }
  }
  if (best.length < 2) return "없음";
  const waypoints = [anchorCenter(best.x, best.y, 1), anchorCenter(best.x + best.length - 1, best.y, 1)];
  const paces = [0];
  let weight = 0;
  for (let x = best.x + 1; x < best.x + best.length; x++)
    weight += grid.terrainCost[best.y * 256 + x] ?? 1000;
  paces[0] = Math.round(weight / (best.length - 1));
  const open = arrivalAt(createMotion({ waypoints, departAtMs: 0, speed: WALK_SPEED }));
  const forest = arrivalAt(createMotion({ waypoints, paces, departAtMs: 0, speed: WALK_SPEED }));
  return `${best.length - 1}칸(${((best.length - 1) * CELL_UNITS).toLocaleString("en")}단위) ${(open / 1000).toFixed(1)}초 → ${(forest / 1000).toFixed(1)}초 (×${(forest / open).toFixed(2)}, 숲 ${FOREST_COST_PM}‰ × 지표)`;
}
