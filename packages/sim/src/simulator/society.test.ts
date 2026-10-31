import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS as c } from "../society/coefficients.ts";
import { holdingsOf } from "../society/shares.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { createWorld } from "./world.ts";

/** 세력 셋(도시 셋씩): 1 독재(고정), 2 자본주의, 3 민주주의 */
function setup() {
  const scenario = parseScenario({
    id: "society_test",
    factions: [
      {
        code: "dic",
        count: 1,
        fixed: true,
        cities: 3,
        workers: 30,
        credit: "100000",
        tech: 3,
        regime: "dictatorship",
      },
      {
        code: "cap",
        count: 1,
        fixed: false,
        cities: 3,
        workers: 30,
        credit: "100000",
        tech: 3,
        regime: "capitalism",
      },
      {
        code: "dem",
        count: 1,
        fixed: false,
        cities: 3,
        workers: 30,
        credit: "100000",
        tech: 3,
        regime: "democracy",
      },
    ],
    stub: { decideEveryMs: 21_600_000, conquerPerMille: 0 },
  });
  const world = createWorld(scenario, 5, 0);
  const lines: { t: string; cause?: string; faction?: number; from?: number; to?: number }[] = [];
  const recorder = createMetricsRecorder({ startMs: 0, sink: (line) => lines.push(JSON.parse(line)) });
  recorder.start([...world.factions.values()].map((f) => ({ id: f.id, fixed: f.fixed, tech: f.tech })));
  const scheduled: number[] = [];
  const society = attachSociety(
    {
      world,
      scenario,
      recorder,
      c,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: (faction) => scheduled.push(faction.id),
      scheduleUnit: () => {},
      cancel: () => {},
    },
    0,
  );
  const faction = (id: number) => {
    const found = world.factions.get(id);
    if (!found) throw new Error(`faction ${id}`);
    return found;
  };
  return { world, society, lines, scheduled, faction };
}

describe("시뮬 세력·사회", () => {
  it("차리기: 도시마다 지분 1000주를 주인에게, 고정 세력 첫 도시는 시작 도시", () => {
    const { world, society } = setup();
    for (const city of world.cities.values())
      expect(holdingsOf(world.book, city.id)).toEqual([{ owner: city.owner, amount: 1000n }]);
    expect([...world.cities.values()].filter((city) => city.start).map((city) => city.id)).toEqual([1]);
    expect(society.check(0)).toEqual([]);
  });

  it("점령: 지분 유지 = 옛 통치자 몫이 점령 국고로, 시작 도시는 칠 수 없고, 도시를 잃으면 기술 후퇴(city_lost)", () => {
    const { world, society, lines, faction } = setup();
    const cap = faction(2);
    const dem = faction(3);
    // 연구 시설이 있는 첫 도시(4)를 잃으면 상한이 내려간다
    society.occupy(dem, cap, 4, [1, 1], 1000);
    expect(world.cities.get(4)?.owner).toBe(3);
    expect(holdingsOf(world.book, 4)).toEqual([{ owner: 3, amount: 1000n }]);
    expect(cap.wars.has(3)).toBe(true);
    expect(lines.some((line) => line.t === "tech" && line.cause === "city_lost" && line.faction === 2)).toBe(
      true,
    );
    // 시작 도시(1)는 그대로
    society.occupy(dem, faction(1), 1, [0, 0], 2000);
    expect(world.cities.get(1)?.owner).toBe(1);
    expect(society.check(2000)).toEqual([]);
  });

  it("마지막 도시까지 빼앗기면 세력이 사라진다(conquered)", () => {
    const { world, society, lines, faction } = setup();
    for (const cityId of [7, 8, 9]) society.occupy(faction(2), faction(3), cityId, [1, 1], 1000);
    expect(faction(3).alive).toBe(false);
    expect(lines.filter((line) => line.t === "died").map((line) => [line.faction, line.cause])).toEqual([
      [3, "conquered"],
    ]);
    expect([...world.cities.values()].filter((city) => city.owner === 3)).toEqual([]);
  });

  it("약탈 + 상장폐지 + 독재로 바뀜은 만족도를 크게 떨어뜨려 반란이 일어나고, 반란군은 새 세력(전쟁)이 된다", () => {
    const { world, society, lines, scheduled, faction } = setup();
    // 독재(1)가 민주주의(3) 도시 7을 약탈(0)·상장폐지(0)
    society.occupy(faction(1), faction(3), 7, [0, 0], 1000);
    const unitsIn7 = [...world.units.values()].filter((u) => u.city === 7);
    // 60 − 25(약탈) − 15(상장폐지) − 20(독재로) = 0
    expect(unitsIn7.every((u) => u.satisfactionMilli === 0)).toBe(true);
    society.endOfDay(DAY_MS);
    const born = lines.find((line) => line.t === "born" && line.cause === "rebellion");
    expect(born).toBeDefined();
    const rebel = world.factions.get(born?.faction ?? 0);
    expect(world.cities.get(7)?.owner).toBe(rebel?.id);
    expect(rebel?.wars.has(1)).toBe(true);
    expect(rebel?.regime).toBe("dictatorship");
    expect(scheduled).toContain(rebel?.id);
    expect(society.check(DAY_MS)).toEqual([]);
  });

  it("붐비는 도시의 가문이 마을을 세우면 봉신 또는 독립 새 세력(founding)이 생기고 지분을 받는다", () => {
    const { world, society, lines, faction } = setup();
    const cap = faction(2);
    const city = world.cities.get(4);
    if (!city) throw new Error("city");
    city.housing = 5;
    society.found(cap, 0, 1000);
    const born = lines.find((line) => line.t === "born" && line.cause === "founding");
    const house = world.factions.get(born?.faction ?? 0);
    expect(house?.overlord).toBe(2);
    const newCity = [...(house?.cities ?? [])][0] ?? 0;
    expect(holdingsOf(world.book, newCity)).toEqual([{ owner: house?.id, amount: 1000n }]);
    expect(house?.units.size).toBe(8);
  });

  it("자본주의 도시의 지분 1위(지배 주체 아님)가 과반이면 독립 선언 → 새 세력(independence)", () => {
    const { world, society, lines } = setup();
    world.book.post({
      kind: "transfer",
      atMs: 0,
      entries: [
        { account: world.book.ownerAccount(2, "share_5"), amount: -600n },
        { account: world.book.ownerAccount(3, "share_5"), amount: 600n },
      ],
    });
    society.endOfDay(DAY_MS);
    const born = lines.find((line) => line.t === "born" && line.cause === "independence");
    expect(born).toBeDefined();
    expect(world.cities.get(5)?.owner).toBe(born?.faction);
  });

  it("하루가 지나면 만족도는 목표값(먹고 살 곳 있음 = 80)으로 다가가고 출생이 있다", () => {
    const { world, society } = setup();
    for (let day = 1; day <= 10; day++) society.endOfDay(day * DAY_MS);
    const avg = [...world.units.values()].reduce((sum, u) => sum + u.satisfactionMilli, 0) / world.units.size;
    expect(avg).toBeGreaterThan(70_000);
    expect(society.summary().births).toBeGreaterThan(0);
  });
});
