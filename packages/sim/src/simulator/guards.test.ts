// 경비대(국력 등급 씨앗) 시뮬 시험 — 시나리오 guards 칸, 수비·원정 차례, 요약의 묶음별 수.
// docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)". 값은 시험용 가짜다.
import { describe, expect, it } from "vitest";
import { JOB_NONE } from "../settle/settle.ts";
import { runSimulation } from "./run.ts";
import { parseScenario } from "./scenario.ts";
import { createWorld, defenseOrder, expeditionOrder } from "./world.ts";

const tiers = parseScenario({
  id: "test_tiers",
  factions: [
    { code: "big", count: 1, fixed: true, cities: 3, workers: 30, guards: 4, credit: "200000", tech: 3 },
    { code: "small", count: 2, fixed: true, cities: 1, workers: 8, guards: 2, credit: "20000", tech: 1 },
    { code: "plain", count: 1, fixed: true, cities: 2, workers: 6, credit: "20000", tech: 1 },
  ],
  npc: { decideEveryMs: 6 * 3_600_000 },
});

describe("경비대(시나리오 guards)", () => {
  it("도시마다 정해진 수의 경비대가 직무 없이 서고, 일꾼과 따로 센다(칸이 없으면 0)", () => {
    const world = createWorld(tiers, 1, 0);
    const guards = [...world.units.values()].filter((unit) => unit.guard === true);
    expect(guards).toHaveLength(3 * 4 + 2 * 1 * 2);
    expect(guards.every((unit) => unit.job.job === JOB_NONE)).toBe(true);
    const big = [...world.factions.values()].find((faction) => faction.code === "big");
    expect(big?.units.size).toBe(30 + 12);
    for (const cityId of big?.cities ?? [])
      expect(guards.filter((unit) => unit.city === cityId)).toHaveLength(4);
    const plain = [...world.factions.values()].find((faction) => faction.code === "plain");
    expect([...(plain?.units ?? [])].some((id) => world.units.get(id)?.guard === true)).toBe(false);
  });

  it("수비는 경비대 먼저, 원정은 경비대를 맨 뒤로(그 안은 유닛 ID 차례)", () => {
    const units = [{ id: 5, guard: true }, { id: 1 }, { id: 9, guard: true }, { id: 3 }];
    expect(units.toSorted(defenseOrder).map((unit) => unit.id)).toEqual([5, 9, 1, 3]);
    expect(units.toSorted(expeditionOrder).map((unit) => unit.id)).toEqual([1, 3, 5, 9]);
    // 경비대가 없으면 유닛 ID 차례 그대로(옛 결과)
    expect([{ id: 2 }, { id: 1 }].toSorted(defenseOrder).map((unit) => unit.id)).toEqual([1, 2]);
  });

  it("요약에 묶음마다 처음·끝 수가 실리고(묶음 합계), 불변 조건 위반이 없다", () => {
    const summary = runSimulation({ scenario: tiers, seed: 3, days: 10 });
    expect(summary.invariants.violations).toBe(0);
    expect(summary.groups.map((group) => [group.code, group.factions, group.start])).toEqual([
      ["big", 1, { cities: 3, units: 42, guards: 12, tech: 3 }],
      ["small", 2, { cities: 2, units: 20, guards: 4, tech: 1 }],
      ["plain", 1, { cities: 2, units: 6, guards: 0, tech: 1 }],
    ]);
    // 고정 세력은 사라지지 않는다(D-324)
    expect(summary.groups.map((group) => group.end.alive)).toEqual([1, 2, 1]);
    // 같은 시드면 같다
    expect(JSON.stringify(runSimulation({ scenario: tiers, seed: 3, days: 10 }))).toBe(
      JSON.stringify(summary),
    );
  });
});
