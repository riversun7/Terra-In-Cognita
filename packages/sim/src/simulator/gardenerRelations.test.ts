// 정원사 2(docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)"): 관계도·세력 오염·목표 순위·보호 레이드·웨이브 보상
import { describe, expect, it } from "vitest";
import { type GardenerCoefficients, TEST_GARDENER_COEFFICIENTS } from "../gardener/coefficients.ts";
import { squareGrid } from "../gardener/pollution.ts";
import type { WaveReward } from "../gardener/rewards.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { EVENT_WAVE, attachGardener } from "./gardenerRun.ts";
import type { GardenerWave } from "./gardenerTypes.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { createWorld } from "./world.ts";

const HOUR = 3_600_000;

/** 고정 나라 1(시작 도시 1 + 마을 2·3), 유동 세력 2(도시 4·5), 유동 세력 3(도시 6) */
function setup(
  rules: GardenerCoefficients = TEST_GARDENER_COEFFICIENTS,
  fightWins = false,
  hasGuardians?: (cityId: number) => boolean,
) {
  const scenario = parseScenario({
    id: "gardener_two",
    factions: [
      { code: "home", count: 1, fixed: true, cities: 3, workers: 9, credit: "10000", tech: 3 },
      { code: "two", count: 1, fixed: false, cities: 2, workers: 6, credit: "10000", tech: 3 },
      { code: "one", count: 1, fixed: false, cities: 1, workers: 4, credit: "10000", tech: 2 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 9, 0);
  const lines: Record<string, unknown>[] = [];
  const recorder = createMetricsRecorder({ startMs: 0, sink: (line) => lines.push(JSON.parse(line)) });
  recorder.start([...world.factions.values()].map((f) => ({ id: f.id, fixed: f.fixed, tech: f.tech })));
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c: TEST_SOCIETY_COEFFICIENTS,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: () => {},
      scheduleUnit: () => {},
      cancel: () => {},
    },
    0,
  );
  const grid = squareGrid(64);
  // 도시 ID → 칸(4칸 간격, 이웃 영향권이 겹치지 않게)
  const cellOf = (cityId: number): number | undefined => grid.cellOf(4 + cityId * 4, 8);
  const events: { atMs: number; kind: string; subject: number; id: number }[] = [];
  let eventId = 0;
  const rewards: { wave: GardenerWave; ownerId: number; reward: WaveReward }[] = [];
  const fights: { city: number; defenders: number }[] = [];
  const gardener = attachGardener({
    world,
    rules: () => rules,
    grid,
    cellOf,
    mothershipCell: grid.cellOf(63, 63),
    recorder,
    society,
    schedule: (atMs, kind, subject) => {
      eventId += 1;
      events.push({ atMs, kind, subject, id: eventId });
      return eventId;
    },
    cancel: (id) => {
      const at = events.findIndex((event) => event.id === id);
      if (at >= 0) events.splice(at, 1);
    },
    fight: (wave, defenders) => {
      fights.push({ city: wave.city, defenders: defenders.length });
      return fightWins;
    },
    hasGuardians,
    treasuryOf: () => 0n,
    seed: 5,
    onReward: (wave, ownerId, reward) => rewards.push({ wave, ownerId, reward }),
  });
  const faction = (code: string) => {
    const found = [...world.factions.values()].find((f) => f.code === code);
    if (!found) throw new Error(code);
    return found;
  };
  return { world, gardener, lines, events, rewards, faction, cellOf, fights };
}

describe("정원사 2: 보호 레이드(D-500)", () => {
  it("필수 NPC 세력의 도시를 치면 공격자의 가장 오래된 도시로 더 센 레이드가 가고, 막아도 보상·쉬는 시간이 없다", () => {
    const { gardener, lines, events, rewards, faction } = setup();
    const home = faction("home");
    const two = faction("two");
    const attacked = [...home.cities].toSorted((a, b) => a - b)[1] ?? 0;
    expect(gardener.protect(two, home, attacked, 1000)).toBe(true);
    const wave = [...gardener.waves.values()][0];
    expect(wave?.kind).toBe("protection");
    expect(wave?.city).toBe([...two.cities].toSorted((a, b) => a - b)[0]);
    // 세기 = 공격자 웨이브 세기 × 2(도시 2·휴먼 6 → 5 × (1 + ⌊log2(3)⌋) = 10 → 20), 물리형 50%
    expect(wave?.strength).toBe(20);
    expect(wave?.physical).toBe(10);
    const notice = lines.find((line) => line.t === "wave" && line.kind === "protection");
    expect(notice).toMatchObject({ phase: "notice", target: home.id, attacked });
    // 같은 도시에 이미 웨이브가 오고 있으면 건너뛴다
    expect(gardener.protect(two, home, attacked, 2000)).toBe(false);
    expect(gardener.summary().protection.skipped).toBe(1);
    // 유동 세력을 치는 것은 레이드가 없다
    expect(gardener.protect(faction("one"), two, [...two.cities][0] ?? 0, 3000)).toBe(false);
    // 도착 → 막힘: 보상 없음, 쉬는 시간 없음
    const arrival = events.find((event) => event.kind === EVENT_WAVE);
    expect(arrival?.atMs).toBe(1000 + 8 * HOUR);
    gardener.handle(EVENT_WAVE, arrival?.subject ?? 0, arrival?.atMs ?? 0);
    const [done] = gardener.takeResolved();
    expect(done?.outcome).toBe("repelled");
    expect(done?.reward).toEqual({ renown: 0, genes: 0, materials: 0 });
    expect(rewards).toHaveLength(0);
    expect(gardener.cooldownUntil.size).toBe(0);
    expect(gardener.summary().protection).toEqual({ noticed: 1, won: 0, repelled: 1, skipped: 1 });
  });

  it("레이드가 오는 사이 그 도시 주인이 바뀌면 흩어진다", () => {
    const { world, gardener, events, faction } = setup(TEST_GARDENER_COEFFICIENTS, true);
    const home = faction("home");
    const two = faction("two");
    gardener.protect(two, home, [...home.cities][1] ?? 0, 0);
    const wave = [...gardener.waves.values()][0];
    const city = world.cities.get(wave?.city ?? 0);
    if (!city) throw new Error("city");
    city.owner = faction("one").id;
    const arrival = events.find((event) => event.kind === EVENT_WAVE);
    gardener.handle(EVENT_WAVE, arrival?.subject ?? 0, arrival?.atMs ?? 0);
    expect(gardener.takeResolved()[0]?.outcome).toBe("disbanded");
  });

  it("세기 배율 0(서버 웨이브 끔)이면 레이드가 없다", () => {
    const { gardener, faction } = setup({ ...TEST_GARDENER_COEFFICIENTS, raidStrengthPm: 0 });
    expect(gardener.protect(faction("two"), faction("home"), 2, 0)).toBe(false);
    expect(gardener.waves.size).toBe(0);
  });
});

describe("수비 휴먼이 없는 도시의 웨이브(기획 답 472 가, D-311)", () => {
  it("수호신이 있으면 수비 휴먼이 없어도 전투를 연다, 없으면 전투 없이 웨이브가 이긴다(질문 218 가)", () => {
    for (const guarded of [false, true]) {
      const { world, gardener, events, faction, fights } = setup(TEST_GARDENER_COEFFICIENTS, false, (cityId) =>
        guarded ? cityId > 0 : false,
      );
      const home = faction("home");
      const two = faction("two");
      gardener.protect(two, home, [...home.cities][1] ?? 0, 0);
      const target = [...gardener.waves.values()][0]?.city ?? 0;
      // 그 도시 휴먼을 모두 다른 도시로 옮긴다(수비 휴먼 없음)
      const other = [...two.cities].find((id) => id !== target) ?? 0;
      for (const unit of world.units.values()) if (unit.city === target) unit.city = other;
      const arrival = events.find((event) => event.kind === EVENT_WAVE);
      gardener.handle(EVENT_WAVE, arrival?.subject ?? 0, arrival?.atMs ?? 0);
      const [done] = gardener.takeResolved();
      if (guarded) {
        expect(fights).toEqual([{ city: target, defenders: 0 }]);
        expect(done?.outcome).toBe("repelled");
      } else {
        expect(fights).toEqual([]);
        expect(done?.outcome).not.toBe("repelled");
      }
    }
  });
});

describe("정원사 2: 관계도·세력 오염·목표 순위(49 N52, D-509·D-510)", () => {
  it("세력 오염이 쌓이면 관계도가 내려가고(전쟁이면 평화 몫 없음), 필수 NPC 세력은 평화 몫 날에 양수로 오른다", () => {
    const { gardener, faction, cellOf } = setup({
      ...TEST_GARDENER_COEFFICIENTS,
      chanceMaxPm: 0,
      warDaily: 0,
    });
    const two = faction("two");
    const home = faction("home");
    // 유동 세력 2의 도시 칸에 오염 9,000씩(영향권 합 ≈ 18,000 → 걸음 30,000 아래 = 감소 0)
    for (const cityId of two.cities) {
      const cell = cellOf(cityId);
      if (cell !== undefined) gardener.layer().set(cell, 9000);
    }
    // 3일째 = 평화 몫 날(3일마다)
    gardener.endOfDay(3 * DAY_MS, 3);
    expect(gardener.factionPollution.get(two.id)).toBeGreaterThan(17_000);
    expect(gardener.relations.get(two.id)).toBe(0);
    // 필수 NPC 세력(오염 0, 평화) +1
    expect(gardener.relations.get(home.id)).toBe(1);
    // 큰 오염(칸마다 10,000 상한 × 9칸 × 2도시 = 180,000 → 6걸음): 전쟁 중이면 −6
    for (const cityId of two.cities) {
      const cell = cellOf(cityId);
      if (cell === undefined) continue;
      gardener.layer().set(cell, 10_000);
      for (const other of squareGrid(64).neighbors(cell)) gardener.layer().set(other, 10_000);
    }
    two.wars.add(faction("one").id);
    gardener.endOfDay(4 * DAY_MS, 4);
    expect(gardener.relations.get(two.id)).toBeLessThanOrEqual(-5);
    // 평화 몫 날이 아니면 오르지 않는다
    expect(gardener.relations.get(home.id)).toBe(1);
    const summary = gardener.summary();
    expect(summary.relations.friendly + summary.relations.neutral + summary.relations.wary).toBe(3);
  });

  it("관계도 동맹이면 도시 웨이브 확률이 100‰로 드물다(기획 답 385 ③)", () => {
    const pressure = {
      ...TEST_GARDENER_COEFFICIENTS,
      chanceDivisor: 1,
      chanceMaxPm: 1000,
      relationOthersMax: 100,
    };
    const allied = setup(pressure);
    // 정화 한 번 = 그 도시 주인 관계도 +1(D-510) → 세력마다 90번 = 동맹
    for (const f of allied.world.factions.values()) {
      const cityId = [...f.cities][0] ?? 0;
      for (let i = 0; i < 90; i++) allied.gardener.purify(cityId);
      expect(allied.gardener.relations.get(f.id)).toBe(90);
    }
    for (const city of allied.world.cities.values()) {
      const cell = allied.cellOf(city.id);
      if (cell !== undefined) allied.gardener.layer().set(cell, 2000);
    }
    allied.gardener.endOfDay(DAY_MS, 1);
    const notices = allied.lines.filter((line) => line.t === "wave" && line.phase === "notice");
    for (const notice of notices) expect(notice.chancePm).toBe(100);
    const plain = setup(pressure);
    for (const city of plain.world.cities.values()) {
      const cell = plain.cellOf(city.id);
      if (cell !== undefined) plain.gardener.layer().set(cell, 2000);
    }
    plain.gardener.endOfDay(DAY_MS, 1);
    expect(plain.gardener.summary().waves.noticed).toBe(6);
    expect(allied.gardener.summary().waves.noticed).toBeLessThan(6);
  });

  it("전선 도시(전쟁 상대 도시가 가까운 도시)의 칸만 하루마다 오염이 오른다(기획 답 389 나)", () => {
    // 도시 칸은 4칸 간격: 세력 two의 도시 5와 세력 one의 도시 6이 4칸 → 전선 거리 4면 둘만 전선
    const { gardener, faction, cellOf } = setup({
      ...TEST_GARDENER_COEFFICIENTS,
      chanceMaxPm: 0,
      frontRadius: 4,
    });
    const two = faction("two");
    const one = faction("one");
    two.wars.add(one.id);
    one.wars.add(two.id);
    gardener.endOfDay(DAY_MS, 1);
    const polluted = (cityId: number) => (gardener.layer().get(cellOf(cityId) ?? -1) ?? 0) > 0;
    const [far, near] = [...two.cities].toSorted((a, b) => a - b);
    expect(polluted(near ?? 0)).toBe(true);
    expect(polluted([...one.cities][0] ?? 0)).toBe(true);
    expect(polluted(far ?? 0)).toBe(false);
    for (const cityId of faction("home").cities) expect(polluted(cityId)).toBe(false);
  });

  it("모함 몫이 모자라면 세력 오염이 높은 세력의 도시가 먼저 웨이브를 받는다(목표 순위)", () => {
    // 확률 1000‰, 모함 몫 = 웨이브 하나(세기 5 × (1 + …)) 만큼만
    const rules = { ...TEST_GARDENER_COEFFICIENTS, chanceDivisor: 1, chanceMaxPm: 1000, mothershipBp: 1 };
    const { world, gardener, faction, cellOf } = setup(rules);
    const one = faction("one");
    // 도시 6(세력 one)만 오염이 높다 → 도시 ID가 가장 크지만 먼저 받는다
    for (const city of world.cities.values()) {
      const cell = cellOf(city.id);
      if (cell !== undefined) gardener.layer().set(cell, city.owner === one.id ? 10_000 : 1500);
    }
    gardener.endOfDay(DAY_MS, 1);
    const first = [...gardener.waves.values()].toSorted((a, b) => a.id - b.id)[0];
    expect(first?.faction).toBe(one.id);
  });
});

describe("정원사 2: 막아 낸 도시 웨이브 보상(D-499)", () => {
  it("막아 내면 도시 주인에게 보상(명성 누적), 지면 없다", () => {
    const rules = { ...TEST_GARDENER_COEFFICIENTS, chanceDivisor: 1, chanceMaxPm: 1000 };
    const { world, gardener, events, rewards, cellOf } = setup(rules);
    for (const city of world.cities.values()) {
      const cell = cellOf(city.id);
      if (cell !== undefined) gardener.layer().set(cell, 5000);
    }
    gardener.endOfDay(DAY_MS, 1);
    expect(gardener.waves.size).toBeGreaterThan(0);
    for (const event of events.filter((e) => e.kind === EVENT_WAVE).toSorted((a, b) => a.id - b.id))
      gardener.handle(EVENT_WAVE, event.subject, event.atMs);
    const done = gardener.takeResolved().filter((entry) => entry.outcome === "repelled");
    expect(done.length).toBeGreaterThan(0);
    expect(rewards).toHaveLength(done.length);
    let renown = 0;
    for (const entry of rewards) {
      expect(entry.reward.renown).toBe(entry.wave.strength * 10);
      expect(entry.reward.genes).toBe(1);
      renown += entry.reward.renown;
    }
    let stored = 0;
    for (const value of gardener.renown.values()) stored += value;
    expect(stored).toBe(renown);
    expect(gardener.summary().rewards.waves).toBe(done.length);
  });
});
