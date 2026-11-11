// 배후지 채집 다툼 시험(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)"): 겹친 배후지는 두 도시 모두 고갈되고 성장이 멈춘다
import { describe, expect, it } from "vitest";
import { recruitPicks } from "../npc/policy.ts";
import { TEST_NPC_COEFFICIENTS } from "../npc/coefficients.ts";
import { START_WORLD_SEED } from "../society/worldSeed.ts";
import { facilitySupplyPm, planeCell, planeGeometry, scenarioPlaneLayout } from "./catchmentRun.ts";
import { runSimulation } from "./run.ts";
import { parseScenario } from "./scenario.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO_RAW } from "./testEconomy.ts";
import { createWorld } from "./world.ts";

/** 혼자 선 나라 둘(iso)과 도시 둘이 붙어 배후지가 겹친 나라 둘(close) — packages/sim/scenarios/catchment4.json과 같은 꼴 */
function scenario(withCatchment = true) {
  const agri = TEST_ECONOMY_SCENARIO_RAW.factions[0];
  const group = (code: string, step?: number) => ({
    ...agri,
    code,
    count: 2,
    cities: 2,
    workers: 24,
    housing: 40,
    cityPlan: [
      { facility: "farm", recipe: "farm_grain", level: 1, workers: 4 },
      { facility: "kitchen", recipe: "cook_ration", level: 1, workers: 2 },
      { facility: "lumber_camp", recipe: "cut_timber", level: 1, workers: 2 },
    ],
    ...(step === undefined ? {} : { catchmentStep: step }),
  });
  return parseScenario({
    ...TEST_ECONOMY_SCENARIO_RAW,
    id: "catchment_test",
    factions: [group("iso"), group("close", 1)],
    ...(withCatchment ? { catchment: { groupGap: 40 } } : {}),
  });
}

function run(days: number, withCatchment = true) {
  const lines: string[] = [];
  const summary = runSimulation({
    scenario: scenario(withCatchment),
    catalog: TEST_CATALOG,
    seed: 1,
    days,
    sink: (line) => lines.push(line),
  });
  const econ: Record<string, unknown>[] = lines
    .map((line): unknown => JSON.parse(line))
    .flatMap((record) =>
      typeof record === "object" && record !== null && Reflect.get(record, "t") === "econ"
        ? [Object.fromEntries(Object.entries(record))]
        : [],
    );
  return { summary, econ, lines };
}

/** 줄의 catchment 칸(시험에서 모양을 확인하며 읽는다) */
function catchmentOf(value: unknown): { cities: number[][]; stalled: number; overlapped: number } {
  if (typeof value !== "object" || value === null) throw new Error("no catchment");
  const cities: unknown = Reflect.get(value, "cities");
  const stalled: unknown = Reflect.get(value, "stalled");
  const overlapped: unknown = Reflect.get(value, "overlapped");
  if (!Array.isArray(cities) || typeof stalled !== "number" || typeof overlapped !== "number")
    throw new Error("bad catchment");
  const rows: unknown[] = cities;
  return {
    cities: rows.map((row) => (Array.isArray(row) ? row.map(Number) : [])),
    stalled,
    overlapped,
  };
}

/** 그날 곡물 생산 */
function grainOf(econ: readonly Record<string, unknown>[], day: number): number {
  const produced: unknown = econ[day - 1]?.produced;
  return typeof produced === "object" && produced !== null
    ? Number(Reflect.get(produced, "item:grain") ?? 0)
    : 0;
}

describe("평면 배치", () => {
  it("세력 차례마다 groupGap, 도시는 묶음 칸 간격(없으면 처음 기간 요구 지름)", () => {
    const sc = scenario();
    const world = createWorld(sc, 1, 0);
    const layout = scenarioPlaneLayout(world, sc, START_WORLD_SEED);
    expect(layout?.at.get(1)).toEqual({ x: 0, y: 0 });
    // 주거 40·기술 2 지방 도시 요구 반경 ≈ 2.07칸 → 지름 ⌈4.14⌉ = 5칸
    expect(layout?.at.get(2)).toEqual({ x: 0, y: 5 });
    expect(layout?.at.get(5)).toEqual({ x: 80, y: 0 });
    expect(layout?.at.get(6)).toEqual({ x: 80, y: 1 });
    expect(scenarioPlaneLayout(world, scenario(false), START_WORLD_SEED)).toBeUndefined();
  });

  it("반경 안 칸·자리를 모르는 도시는 먼 칸 하나", () => {
    const geometry = planeGeometry({ at: new Map([[1, { x: 0, y: 0 }]]), richnessPm: { ore: 0 } });
    expect(geometry.cellsOf(1, 999)).toEqual([planeCell(0, 0)]);
    expect(geometry.cellsOf(1, 1000)).toHaveLength(5);
    expect(geometry.cellsOf(1, 2000)).toHaveLength(13);
    expect(geometry.cellsOf(9, 1000)).toHaveLength(5);
    expect(geometry.capacityPm(planeCell(0, 0), "ore")).toBe(0);
    expect(geometry.capacityPm(planeCell(0, 0), "crop")).toBe(1000);
  });
});

describe("채집 다툼(시뮬 30일)", () => {
  const { summary, econ } = run(30);
  const raw: unknown = econ.at(-1)?.catchment;
  const last = catchmentOf(raw);

  it("혼자 선 도시는 다 받고, 겹친 도시는 둘 다 덜 받고 성장을 멈춘다", () => {
    const supply = new Map(last.cities.map((row) => [row[0], row[2]]));
    for (const id of [1, 2, 3, 4]) expect(supply.get(id)).toBe(1000);
    for (const id of [5, 6, 7, 8]) expect(supply.get(id) ?? 1000).toBeLessThan(700);
    expect(last.overlapped).toBe(4);
    expect(last.stalled).toBe(4);
    expect(summary.invariants.violations).toBe(0);
    // 묶음 끝 유닛: 겹친 나라가 혼자 선 나라보다 적다(죽은 휴먼을 다시 구인하지 못함)
    const iso = summary.groups.find((group) => group.code === "iso")?.end.units ?? 0;
    const close = summary.groups.find((group) => group.code === "close")?.end.units ?? 0;
    expect(close).toBeLessThan(iso);
  });

  it("겹친 나라의 곡물 생산이 줄고, 배후지 칸이 없는 시나리오는 줄에 catchment가 없다", () => {
    expect(grainOf(econ, 30)).toBeLessThan(grainOf(econ, 5));
    const plain = run(3, false);
    expect(plain.econ[0]).not.toHaveProperty("catchment");
    expect(plain.summary.economy).not.toHaveProperty("catchment");
  });

  it("같은 시드면 줄이 바이트까지 같다", () => {
    expect(run(12).lines).toEqual(run(12).lines);
  });
});

describe("빠르기·구인 문턱", () => {
  it("배후지가 없거나 채집 시설이 아니면 1000, 몫이 바닥보다 낮으면 바닥", () => {
    expect(facilitySupplyPm(undefined, 1, "farm")).toBe(1000);
  });

  it("성장 멈춤이면 주거 목표로는 사지 않고 경비대만 채운다", () => {
    const cards = [0, 1, 2].map((slot) => ({ slot, total: 10 - slot, cost: 1n }));
    const base = { cards, taken: 0, population: 10, housing: 20, treasury: 1000n };
    expect(recruitPicks(base, TEST_NPC_COEFFICIENTS)).toHaveLength(3);
    expect(recruitPicks({ ...base, growthBlocked: true }, TEST_NPC_COEFFICIENTS)).toHaveLength(0);
    expect(
      recruitPicks({ ...base, growthBlocked: true, guards: 0, guardTarget: 1 }, TEST_NPC_COEFFICIENTS),
    ).toEqual([{ slot: 0, guard: true }]);
  });
});
