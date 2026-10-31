import { describe, expect, it } from "vitest";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";

/** 시험용 작은 시나리오(팩·파일 없이) */
const small: Scenario = parseScenario({
  id: "test_small",
  factions: [{ code: "npc", count: 4, fixed: true, cities: 3, workers: 6, credit: "5000", tech: 2 }],
  stub: {
    decideEveryMs: 6 * 3_600_000,
    conquerPerMille: 150,
    rebelPerMille: 150,
    techUpPerMille: 150,
    techDownPerMille: 100,
    techMax: 10,
  },
  trips: { idleMinMs: 600_000, idleMaxMs: 3_600_000 },
});

function run(seed: number, days: number, scenario: Scenario = small) {
  const lines: string[] = [];
  const summary = runSimulation({ scenario, seed, days, sink: (line) => lines.push(line) });
  return { lines, summary, json: JSON.stringify(summary) };
}

describe("시뮬레이터 실행", () => {
  it("같은 시드는 줄·요약이 바이트까지 같고, 다른 시드는 다르다", () => {
    const a = run(7, 20);
    const b = run(7, 20);
    expect(b.json).toBe(a.json);
    expect(b.lines).toEqual(a.lines);
    expect(run(8, 20).summary.linesHash).not.toBe(a.summary.linesHash);
  });

  it("줄은 머리 → 시작 → (사건·하루) → 요약이고, 하루 줄은 날마다 하나다", () => {
    const { lines, summary } = run(3, 10);
    const kinds = lines.map((line) => JSON.parse(line).t);
    expect(kinds[0]).toBe("header");
    expect(kinds[1]).toBe("start");
    expect(kinds.at(-1)).toBe("summary");
    expect(kinds.filter((kind) => kind === "day")).toHaveLength(10);
    expect(summary.metrics.series.factions).toHaveLength(10);
    expect(summary.lines).toBe(lines.length - 1);
  });

  it("돌리는 동안 불변 조건 위반이 없고, 원장·예약이 실제로 돈다", () => {
    const { summary } = run(11, 30);
    expect(summary.invariants).toMatchObject({ checks: 30, violations: 0, first: [] });
    expect(summary.events.byKind.decide).toBeGreaterThan(0);
    expect(summary.events.byKind.arrive).toBeGreaterThan(0);
    expect(summary.ledger.transactions).toBeGreaterThan(0);
    // 시험 직무 산출이 원장에 쌓인다
    expect(BigInt(summary.world.ore)).toBeGreaterThan(0n);
  });

  it("[임시] 대리 규칙이 기록기의 세 갈래(생김·사라짐·기술 오르내림)를 모두 건드린다", () => {
    const { summary } = run(5, 60);
    expect(summary.metrics.churn.born.total).toBeGreaterThan(0);
    expect(summary.metrics.churn.died.total).toBeGreaterThan(0);
    expect(summary.metrics.tech.ups).toBeGreaterThan(0);
    expect(summary.metrics.tech.downs).toBeGreaterThan(0);
  });
});

describe("시나리오 읽기", () => {
  it("틀린 값은 어디가 틀렸는지 알린다", () => {
    expect(() => parseScenario({ id: "xx", factions: [] })).toThrow(/factions/);
    expect(() =>
      parseScenario({
        id: "xx",
        factions: [{ code: "aa", count: 1, fixed: true, cities: 0, workers: 1, credit: "1", tech: 1 }],
        stub: small.stub,
      }),
    ).toThrow(/cities/);
    expect(() =>
      parseScenario({
        id: "xx",
        factions: [{ code: "aa", count: 1, fixed: true, cities: 1, workers: 1, credit: "-1", tech: 1 }],
        stub: small.stub,
      }),
    ).toThrow(/credit/);
  });
});
