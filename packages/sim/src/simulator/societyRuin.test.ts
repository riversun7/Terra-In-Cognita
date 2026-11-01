import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { holdingsOf } from "../society/shares.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { HOMELESS, checkWorld, createWorld } from "./world.ts";

/** 고정 나라 1(시작 도시 1 + 마을 2·3), 유동 세력 2(도시 4·5), 유동 세력 3(도시 6 하나) */
function setup(c: SocietyCoefficients = TEST_SOCIETY_COEFFICIENTS) {
  const scenario = parseScenario({
    id: "ruin_test",
    factions: [
      { code: "home", count: 1, fixed: true, cities: 3, workers: 9, credit: "10000", tech: 3 },
      { code: "two", count: 1, fixed: false, cities: 2, workers: 6, credit: "10000", tech: 3 },
      { code: "one", count: 1, fixed: false, cities: 1, workers: 4, credit: "10000", tech: 2 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 9, 0);
  const lines: { t: string; cause?: string; faction?: number }[] = [];
  const recorder = createMetricsRecorder({ startMs: 0, sink: (line) => lines.push(JSON.parse(line)) });
  recorder.start([...world.factions.values()].map((f) => ({ id: f.id, fixed: f.fixed, tech: f.tech })));
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: () => {},
      scheduleUnit: () => {},
      cancel: () => {},
    },
    0,
  );
  // 판단 예약이 없다는 문장(I5)은 이 시험의 관심 밖이다
  const problems = (nowMs: number) =>
    [...checkWorld(world, nowMs, false), ...society.check(nowMs)].filter((p) => !p.startsWith("I5"));
  return { world, society, lines, problems };
}

describe("웨이브 결과: 건물 피해·폐허·떠도는 세력(D-105·D-341·D-464 217)", () => {
  it("시작 도시는 폐허가 되지 않고 연구 시설만 1레벨 내린다", () => {
    const { world, society } = setup();
    const start = world.cities.get(1);
    const before = start?.researchLevel ?? 0;
    society.ruin(1, 1000);
    expect(world.cities.has(1)).toBe(true);
    society.damage(1, 1000);
    expect(world.cities.get(1)?.researchLevel).toBe(Math.max(0, before - 1));
    expect(society.summary().ruins).toMatchObject({ ruined: 0, damaged: 1 });
  });

  it("다른 도시는 폐허: 도시가 빠지고 휴먼은 같은 세력의 가장 오래된 도시로, 지분은 쓸모없게 남는다", () => {
    const { world, society, problems } = setup();
    const movers = [...world.units.values()].filter((u) => u.city === 3).map((u) => u.id);
    expect(movers.length).toBeGreaterThan(0);
    society.ruin(3, 1000);
    expect(world.cities.has(3)).toBe(false);
    expect(world.factions.get(1)?.cities.has(3)).toBe(false);
    for (const id of movers) expect(world.units.get(id)?.city).toBe(1);
    expect(holdingsOf(world.book, 3)).toEqual([{ owner: 1, amount: 1000n }]);
    expect(society.summary().ruins).toMatchObject({ ruined: 1, fled: movers.length, wandering: 0 });
    expect(problems(1000)).toEqual([]);
  });

  it("마지막 도시를 잃으면 사라지지 않고 떠도는 세력: 휴먼은 노숙, 구성원이 모두 떠나면(수명) 사라진다", () => {
    // 환생·신격화 없이(수명이 끝나면 떠난다)
    const { world, society, lines, problems } = setup({
      ...TEST_SOCIETY_COEFFICIENTS,
      rebirthPm: 0,
      deifyPm: 0,
    });
    const three = world.factions.get(3);
    const members = [...world.units.values()].filter((u) => u.owner === 3);
    society.ruin(6, 1000);
    expect(three?.alive).toBe(true);
    expect(three?.cities.size).toBe(0);
    for (const unit of members) expect(world.units.get(unit.id)?.city).toBe(HOMELESS);
    expect(society.summary().ruins).toMatchObject({ ruined: 1, homeless: members.length, wandering: 1 });
    expect(problems(1000)).toEqual([]);
    // 노숙 휴먼의 만족도는 노숙 목표로 내려간다
    const before = members[0]?.satisfactionMilli ?? 0;
    society.endOfDay(DAY_MS);
    expect(world.units.get(members[0]?.id ?? 0)?.satisfactionMilli ?? 0).toBeLessThan(before);
    expect(problems(DAY_MS)).toEqual([]);
    // 구성원이 모두 떠나면(수명 끝) 사라진다
    for (const unit of members) {
      const live = world.units.get(unit.id);
      if (live) live.lifespanMs = 1;
    }
    society.endOfDay(2 * DAY_MS);
    expect(three?.alive).toBe(false);
    expect(lines.some((l) => l.t === "died" && l.cause === "dispersed" && l.faction === 3)).toBe(true);
    expect(problems(2 * DAY_MS)).toEqual([]);
  });

  it("떠도는 세력이 도시를 다시 얻으면 노숙 휴먼이 그 도시로 든다", () => {
    const { world, society, problems } = setup();
    const members = [...world.units.values()].filter((u) => u.owner === 3).map((u) => u.id);
    society.ruin(6, 1000);
    const two = world.factions.get(2);
    const three = world.factions.get(3);
    if (!two || !three) throw new Error("factions");
    society.occupy(three, two, 5, { treatment: "integrate", shares: "keep" }, 2000);
    society.endOfDay(DAY_MS);
    for (const id of members) expect(world.units.get(id)?.city ?? 5).toBe(5);
    expect(problems(DAY_MS)).toEqual([]);
  });
});
