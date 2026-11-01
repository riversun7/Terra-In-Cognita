import { describe, expect, it } from "vitest";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";

const HOUR = 3_600_000;

/** 고정 나라 하나(시작 도시 + 마을 둘)와 유동 세력 둘(도시 하나씩). 시험 시간을 줄이려고 공성 전투맵·넥서스를 작게 */
const world = (gardener?: boolean): Scenario =>
  parseScenario({
    id: "test_gardener",
    factions: [
      { code: "home", count: 1, fixed: true, cities: 3, workers: 9, credit: "50000", tech: 3 },
      { code: "wild", count: 2, fixed: false, cities: 1, workers: 8, credit: "5000", tech: 2 },
    ],
    npc: { decideEveryMs: 6 * HOUR },
    combat: {
      siegeUnits: 6,
      encounterUnits: 2,
      encounterPerMille: 0,
      mapSize: 32,
      siegeMapSize: 48,
      nexusDurability: 600,
    },
    ...(gardener === undefined ? {} : { gardener: { enabled: gardener } }),
  });

/**
 * 오염이 빨리 쌓이고(휴먼 한 명 하루 +1,000), 확률이 바로 상한(300‰)이고, 물리형이 많은 설정(합 ÷ 20 ‰).
 * 공성 제한 5분(오래 버티는 웨이브 전투를 짧게)
 */
const PRESSURE = new Map([
  ["p15_humans_per_step", 1],
  ["p15_human_step", 1000],
  ["c14_chance_divisor", 1],
  ["c16_strength_base", 6],
  ["c17_physical_divisor", 20],
  ["c2_limit_siege", 300_000],
]);

function run(scenario: Scenario, days: number, tuning: ReadonlyMap<string, number> = PRESSURE, seed = 3) {
  const lines: string[] = [];
  const summary = runSimulation({ scenario, seed, days, tuning, sink: (line) => lines.push(line) });
  const records = lines.map((line) => JSON.parse(line));
  return { lines, summary, records };
}

describe("정원사 실행(오염 층 + 웨이브, docs/adr/2026-11-01-gardener-r5b.md)", () => {
  it("기본은 켜져 있고, 같은 시드면 줄·요약이 바이트까지 같다", () => {
    const a = run(world(), 12);
    const b = run(world(), 12);
    expect(b.lines).toEqual(a.lines);
    expect(a.summary.gardener).not.toBeNull();
    expect(a.summary.gardener?.waves.noticed).toBeGreaterThan(0);
    expect(a.records.filter((r) => r.t === "gardener")).toHaveLength(12);
    expect(a.summary.invariants.violations).toBe(0);
  });

  it("끄면 정원사 요약·줄이 없다", () => {
    const off = run(world(false), 10);
    expect(off.summary.gardener).toBeNull();
    expect(off.records.some((r) => r.t === "wave" || r.t === "gardener")).toBe(false);
  });

  it("예고 → 8시간 뒤 도착 → 공성 전투, 이기면 시작 도시는 피해·다른 도시는 폐허, 마지막 도시를 잃으면 떠도는 세력", () => {
    const { summary, records } = run(world(), 15);
    const notices = records.filter((r) => r.t === "wave" && r.phase === "notice" && r.kind === "city");
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) expect(notice.arriveAtMs - notice.atMs).toBe(8 * HOUR);
    const outcomes = records
      .filter((r) => r.t === "wave" && r.phase === "result" && r.kind === "city")
      .map((r) => r.outcome);
    for (const outcome of outcomes) expect(["ruined", "damaged", "repelled", "disbanded"]).toContain(outcome);
    expect(outcomes.some((o) => o === "ruined" || o === "damaged")).toBe(true);
    expect(records.some((r) => r.t === "battle" && r.kind === "wave")).toBe(true);
    const waves = summary.gardener?.waves;
    expect((waves?.won ?? 0) + (waves?.failed ?? 0) + (waves?.disbanded ?? 0)).toBeGreaterThan(0);
    expect(summary.society.ruins.ruined + summary.society.ruins.damaged).toBe(waves?.won);
    // 마지막 도시를 잃은 유동 세력은 떠도는 세력으로 남는다(D-464 217)
    expect(summary.society.ruins.wandering).toBeGreaterThan(0);
    expect(summary.society.ruins.homeless).toBeGreaterThan(0);
    expect(summary.invariants.violations).toBe(0);
  });

  it("오염이 없으면 웨이브가 없다(휴먼 오염만인 작은 세계는 칸당 하루 +0)", () => {
    const { summary } = run(world(), 15, new Map());
    expect(summary.gardener?.waves.noticed).toBe(0);
  });
});
