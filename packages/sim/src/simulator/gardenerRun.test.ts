import { describe, expect, it } from "vitest";
import { runSimulation } from "./run.ts";
import { type Scenario, parseScenario } from "./scenario.ts";

const HOUR = 3_600_000;

/** 고정 나라 하나(시작 도시 + 마을 둘)와 유동 세력 둘(도시 하나씩) */
const world = (gardener?: boolean): Scenario =>
  parseScenario({
    id: "test_gardener",
    factions: [
      { code: "home", count: 1, fixed: true, cities: 3, workers: 9, credit: "50000", tech: 3 },
      { code: "wild", count: 2, fixed: false, cities: 1, workers: 8, credit: "5000", tech: 2 },
    ],
    npc: { decideEveryMs: 6 * HOUR },
    ...(gardener === undefined ? {} : { gardener: { enabled: gardener } }),
  });

/** 오염이 빨리 쌓이고(휴먼 한 명 하루 +1,000), 확률이 바로 상한(300‰)이고, 웨이브가 수비보다 훨씬 센 설정 */
const PRESSURE = new Map([
  ["p15_humans_per_step", 1],
  ["p15_human_step", 1000],
  ["c14_chance_divisor", 1],
  ["c16_strength_base", 20],
  // 시험 시간: 공성 제한 10분(오래 버티는 웨이브 전투를 짧게)
  ["c2_limit_siege", 600_000],
]);

function run(scenario: Scenario, days: number, tuning: ReadonlyMap<string, number> = PRESSURE, seed = 3) {
  const lines: string[] = [];
  const summary = runSimulation({ scenario, seed, days, tuning, sink: (line) => lines.push(line) });
  const records = lines.map((line) => JSON.parse(line));
  return { lines, summary, records };
}

describe("정원사 실행(오염 층 + 웨이브, docs/adr/2026-11-01-gardener-r5b.md)", () => {
  it("기본은 켜져 있고, 같은 시드면 줄·요약이 바이트까지 같다", () => {
    const a = run(world(), 20);
    const b = run(world(), 20);
    expect(b.lines).toEqual(a.lines);
    expect(a.summary.gardener).not.toBeNull();
    expect(a.summary.gardener?.waves.noticed).toBeGreaterThan(0);
    expect(a.records.filter((r) => r.t === "gardener")).toHaveLength(20);
    expect(a.summary.invariants.violations).toBe(0);
  });

  it("끄면 정원사 요약·줄이 없다", () => {
    const off = run(world(false), 10);
    expect(off.summary.gardener).toBeNull();
    expect(off.records.some((r) => r.t === "wave" || r.t === "gardener")).toBe(false);
  });

  it("예고 → 8시간 뒤 도착 → 공성 전투, 이기면 시작 도시는 피해·다른 도시는 폐허, 마지막 도시를 잃으면 떠도는 세력", () => {
    const { summary, records } = run(world(), 30);
    const notices = records.filter((r) => r.t === "wave" && r.phase === "notice" && r.kind === "city");
    expect(notices.length).toBeGreaterThan(0);
    for (const notice of notices) expect(notice.arriveAtMs - notice.atMs).toBe(8 * HOUR);
    const results = records.filter((r) => r.t === "wave" && r.phase === "result" && r.kind === "city");
    expect(results.map((r) => r.outcome)).toEqual(expect.arrayContaining(["ruined", "damaged"]));
    expect(records.some((r) => r.t === "battle" && r.kind === "wave")).toBe(true);
    const ruins = summary.society.ruins;
    expect(ruins.ruined).toBeGreaterThanOrEqual(2);
    expect(ruins.damaged).toBeGreaterThan(0);
    expect(ruins.fled).toBeGreaterThan(0);
    expect(ruins.homeless).toBeGreaterThan(0);
    expect(ruins.wandering).toBeGreaterThan(0);
    // 웨이브 피해·폐허는 기술 후퇴로 이어질 수 있다
    expect(
      records.some((r) => r.t === "tech" && (r.cause === "wave_damage" || r.cause === "city_ruined")),
    ).toBe(true);
    // 떠도는 세력은 사라지지 않는다(구성원이 남아 있다): 사라짐 줄에 폐허가 까닭인 것이 없다
    expect(records.filter((r) => r.t === "died" && r.cause === "dispersed")).toHaveLength(0);
    expect(summary.invariants.violations).toBe(0);
  });

  it("떠도는 세력은 구성원이 모두 떠나면(수명) 사라진다", () => {
    const short = new Map([
      ...PRESSURE,
      ["t4_lifespan_min", 20 * 24 * HOUR],
      ["t4_lifespan_max", 25 * 24 * HOUR],
      ["d395_rebirth", 0],
      ["d395_deify", 0],
    ]);
    const { summary, records } = run(world(), 60, short);
    expect(summary.society.ruins.wandering).toBeGreaterThan(0);
    expect(records.some((r) => r.t === "died" && r.cause === "dispersed")).toBe(true);
    expect(summary.invariants.violations).toBe(0);
  });

  it("오염이 없으면 웨이브가 없다(휴먼 오염만인 작은 세계는 칸당 하루 +0)", () => {
    const { summary } = run(world(), 15, new Map());
    expect(summary.gardener?.waves.noticed).toBe(0);
  });
});
