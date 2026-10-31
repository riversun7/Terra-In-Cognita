// 물 수지 시험(출력 판 3) — 빙상 기후 웅덩이는 얼음으로 메운 평지(호수 아님), 큰 강이 드는 마른 분지는 뚫려 물이
// 바다까지 간다(작은 강이 드는 마른 분지는 그대로). 시험 지형: 남쪽은 바다, 북쪽은 평평한 땅(500m)에 둥근 분지 하나
import { describe, expect, it } from "vitest";
import { priorityFlood } from "./flood.ts";
import { buildGrid } from "./grid.ts";
import {
  BREACH_INFLOW_KM3,
  CELL_DRY,
  CELL_FILLED,
  CELL_LAKE,
  FROZEN_BASIN_MAX_C,
  breachDryBasins,
  findRivers,
  waterBalance,
} from "./hydrology.ts";

/** 분지 가운데(단위 벡터)와 반경(라디안) */
const CENTER = [0, 0.6, 0.8] as const;
const RADIUS = 0.45;

function testTerrain() {
  const grid = buildGrid(4);
  const elevation = new Float32Array(grid.cellCount);
  const ocean = new Uint8Array(grid.cellCount);
  const bowl: number[] = [];
  for (let c = 0; c < grid.cellCount; c++) {
    const z = grid.z[c] ?? 0;
    if (z < -0.2) {
      ocean[c] = 1;
      elevation[c] = -1000;
      continue;
    }
    const cos = (grid.x[c] ?? 0) * CENTER[0] + (grid.y[c] ?? 0) * CENTER[1] + z * CENTER[2];
    const d = Math.sqrt(Math.max(0, 2 - 2 * cos));
    // 평평한 땅 500m, 분지는 가운데 200m(깊이 300m)
    elevation[c] = d < RADIUS ? 500 - 300 * (1 - d / RADIUS) : 500;
    if (d < RADIUS) bowl.push(c);
  }
  return { grid, elevation, ocean, bowl };
}

describe("빙상 기후 웅덩이", () => {
  it(`웅덩이 평균 기온 ${FROZEN_BASIN_MAX_C}°C 이하면 호수가 아니라 메운 평지이고 물은 그대로 지나간다. 따뜻하고 습하면 호수`, () => {
    const { grid, elevation, ocean, bowl } = testTerrain();
    const flow = priorityFlood(grid, elevation, ocean);
    const runoff = Float32Array.from({ length: grid.cellCount }, (_, c) => (ocean[c] === 1 ? 0 : 300));
    const cold = new Float32Array(grid.cellCount).fill(FROZEN_BASIN_MAX_C - 1);
    const warm = new Float32Array(grid.cellCount).fill(-5);
    const frozen = findRivers(
      grid,
      flow,
      elevation,
      waterBalance(grid, flow, elevation, runoff, cold, 100),
      ocean,
      runoff,
      100,
    );
    const wet = findRivers(
      grid,
      flow,
      elevation,
      waterBalance(grid, flow, elevation, runoff, warm, 100),
      ocean,
      runoff,
      100,
    );
    const inner = bowl.filter((c) => (flow.filled[c] ?? 0) > (elevation[c] ?? 0));
    expect(inner.length).toBeGreaterThan(5);
    for (const c of inner) {
      expect(frozen.basinKind[c], `cold cell ${c}`).toBe(CELL_FILLED);
      // −5°C는 수면 증발이 0이라 들어온 물이 다 남는다: 넘치는 호수
      expect(wet.basinKind[c], `warm cell ${c}`).toBe(CELL_LAKE);
    }
  });
});

/** 덥고(수면 증발 큼) 유출이 runoffMm인 시험 지형의 물 수지 */
function hotBasin(runoffMm: number) {
  const terrain = testTerrain();
  const { grid, elevation, ocean } = terrain;
  const flow = priorityFlood(grid, elevation, ocean);
  const runoff = Float32Array.from({ length: grid.cellCount }, (_, c) => (ocean[c] === 1 ? 0 : runoffMm));
  const temperature = new Float32Array(grid.cellCount).fill(30);
  const balance = waterBalance(grid, flow, elevation, runoff, temperature, 100);
  return { ...terrain, flow, runoff, temperature, balance };
}

describe("큰 강이 드는 마른 분지 뚫기", () => {
  it("들어온 물이 문턱 이상이면 바닥에서 넘치는 곳 너머까지 바닥 높이로 깎아, 다시 흐름을 구하면 분지가 없다", () => {
    const { grid, elevation, ocean, bowl, flow, runoff, temperature, balance } = hotBasin(20);
    const before = Float32Array.from(elevation);
    const basins = new Set(bowl.map((c) => flow.basin[c] ?? -1).filter((b) => b >= 0));
    expect(basins.size).toBe(1);
    const [basin = -1] = basins;
    expect(balance.basinInflow[basin] ?? 0).toBeGreaterThanOrEqual(BREACH_INFLOW_KM3);
    // 증발이 커서 마른 분지다(바다로 가는 물이 없다)
    const dry = findRivers(grid, flow, elevation, balance, ocean, runoff, 100);
    expect(bowl.some((c) => dry.basinKind[c] === CELL_DRY)).toBe(true);
    expect(breachDryBasins(grid, flow, elevation, balance, ocean, 0)).toBe(1);
    // 바닥 높이 = 분지에서 가장 낮은 칸. 깎은 칸은 정확히 그 높이이고, 다른 칸은 그대로다
    const pitHeight = Math.min(...bowl.map((c) => before[c] ?? 0));
    let carved = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      if (Object.is(before[c], elevation[c])) continue;
      carved++;
      expect(elevation[c]).toBe(pitHeight);
      expect(before[c] ?? 0).toBeGreaterThan(pitHeight);
    }
    expect(carved).toBeGreaterThan(0);
    // 다시 흐름을 구하면 분지 칸에 웅덩이(채운 높이 > 바닥)가 없고, 물이 바다로 나간다
    const reflow = priorityFlood(grid, elevation, ocean);
    const pit = bowl.find((c) => before[c] === pitHeight) ?? -1;
    expect((reflow.filled[pit] ?? 0) - (elevation[pit] ?? 0)).toBe(0);
    const after = waterBalance(grid, reflow, elevation, runoff, temperature, 100);
    let toSea = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const r = reflow.receiver[c] ?? -1;
      if (ocean[c] !== 1 && r >= 0 && ocean[r] === 1) toSea += after.discharge[c] ?? 0;
    }
    let toSeaBefore = 0;
    for (let c = 0; c < grid.cellCount; c++) {
      const r = flow.receiver[c] ?? -1;
      if (ocean[c] !== 1 && r >= 0 && ocean[r] === 1) toSeaBefore += balance.discharge[c] ?? 0;
    }
    expect(toSea).toBeGreaterThan(toSeaBefore + 0.9 * (balance.basinInflow[basin] ?? 0));
  });

  it("들어온 물이 문턱보다 적은 마른 분지는 그대로 둔다(작은 강은 마른 분지에서 끝난다)", () => {
    const { grid, elevation, ocean, flow, balance } = hotBasin(0.001);
    const before = Float32Array.from(elevation);
    expect(breachDryBasins(grid, flow, elevation, balance, ocean, 0)).toBe(0);
    expect(elevation).toEqual(before);
  });
});
