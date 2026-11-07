import { describe, expect, it } from "vitest";
import { nextFxRoundAt } from "./economy.ts";
import { runSimulation } from "./run.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO } from "./testEconomy.ts";

function run(seed: number, days: number) {
  const lines: string[] = [];
  const summary = runSimulation({
    scenario: TEST_ECONOMY_SCENARIO,
    catalog: TEST_CATALOG,
    seed,
    days,
    sink: (line) => lines.push(line),
  });
  return { lines, summary, json: JSON.stringify(summary) };
}

describe("시뮬레이터 경제(생산·유지비·물자 거래소·환전·중앙은행)", () => {
  it("같은 시드는 줄·요약이 바이트까지 같다", () => {
    const a = run(4, 12);
    const b = run(4, 12);
    expect(b.json).toBe(a.json);
    expect(b.lines).toEqual(a.lines);
  });

  it("30일 동안 불변 조건(원장·에스크로·운송 중·시스템 계정 사건) 위반이 없다", () => {
    const { summary } = run(2, 30);
    expect(summary.invariants).toMatchObject({ checks: 30, violations: 0, first: [] });
  });

  it("나라끼리 물자를 사고팔고(환전을 거쳐), 화폐가 발행·소각되고, 날마다 경제 줄을 쓴다", () => {
    const { summary, lines } = run(3, 20);
    const economy = summary.economy;
    expect(economy?.currencies).toBe(4);
    expect(economy?.trades).toBeGreaterThan(0);
    // 공업 나라 화폐(cur_3·cur_4)가 기준 통화(cur_1)와 한 번 이상 체결됐다 → 환율이 처음 값(로트 100)에서 움직였다
    expect(Object.values(economy?.fx ?? {}).some((rate) => rate !== "100")).toBe(true);
    expect(summary.events.byKind.produce).toBeGreaterThan(0);
    expect(summary.events.byKind.cargo).toBeGreaterThan(0);
    const econLines = lines.map((line) => JSON.parse(line)).filter((record) => record.t === "econ");
    expect(econLines).toHaveLength(20);
    expect(econLines[0]).toHaveProperty("money");
    expect(econLines.some((record) => Object.keys(record.issued).length > 0)).toBe(true);
  });
});

describe("환전 회차 시각(기획 답 564 다)", () => {
  it("회차 길이의 정시에 맞춘다: 시뮬 시작 0은 옛 예약(시작 + 회차)과 같고, 서버가 아무 때나 켜도 다음 정시, 회차 시각이면 그다음", () => {
    const hour = 3_600_000;
    expect(nextFxRoundAt(0, hour)).toBe(hour);
    expect(nextFxRoundAt(10 * hour + 1_234, hour)).toBe(11 * hour);
    expect(nextFxRoundAt(11 * hour, hour)).toBe(12 * hour);
    expect(nextFxRoundAt(11 * hour - 1, hour)).toBe(11 * hour);
  });
});
