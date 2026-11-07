// 공성 결과 셋 시험(D-520): 약탈은 소유 그대로·폐허 없음, 점령 상태는 기간마다 세금·기한에 끝, 점령·귀속은 재건 비용·느린 회복
import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { createMetricsRecorder, DAY_MS } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { createSocietyWar } from "./societyWar.ts";
import { TEST_ASSET_CREDIT, checkWorld, createWorld } from "./world.ts";

/** 고정 나라 1(시작 도시 1 + 마을 2·3), 유동 세력 2(도시 4·5), 유동 세력 3(도시 6 하나) */
function setup(c: SocietyCoefficients = TEST_SOCIETY_COEFFICIENTS) {
  const scenario = parseScenario({
    id: "war_test",
    factions: [
      { code: "home", count: 1, fixed: true, cities: 3, workers: 9, credit: "100000", tech: 3 },
      { code: "two", count: 1, fixed: false, cities: 2, workers: 6, credit: "100000", tech: 3 },
      { code: "one", count: 1, fixed: false, cities: 1, workers: 4, credit: "1000", tech: 2 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 9, 0);
  const recorder = createMetricsRecorder({ startMs: 0, sink: () => {} });
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
  const problems = (nowMs: number) =>
    [...checkWorld(world, nowMs, false), ...society.check(nowMs)].filter((p) => !p.startsWith("I5"));
  const credit = (owner: number) => world.book.balanceOf(owner, TEST_ASSET_CREDIT);
  const faction = (id: number) => {
    const found = world.factions.get(id);
    if (!found) throw new Error(`faction ${id}`);
    return found;
  };
  /** 그 주인의 도시 창고에 물건을 넣는다(원천 계정에서) */
  const give = (owner: number, asset: string, qty: bigint, city: number) => {
    const source = world.book.systemAccount(`source:${asset}`, asset);
    world.book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: source, amount: -qty },
        { account: world.book.ownerAccount(owner, asset, city), amount: qty },
      ],
    });
  };
  return { world, society, problems, credit, faction, give };
}

describe("공성 결과 셋(D-520)", () => {
  it("약탈: 금고 몫 + 공공 창고 몫만 가져가고 소유는 그대로, 폐허가 되지 않는다(486 가)", () => {
    const { world, society, problems, credit, faction, give } = setup();
    const [two, three] = [faction(2), faction(3)];
    give(2, "item:plank", 400n, 5);
    give(1, "item:plank", 100n, 5);
    const before = { two: credit(2), three: credit(3) };
    society.occupy(three, two, 5, { treatment: "loot", shares: "delist" }, 2000);
    // 금고 몫 = 국고 × 5000 ÷ 10000 ÷ 도시 2개
    const share = (before.two * 5000n) / 10_000n / 2n;
    expect(credit(2)).toBe(before.two - share);
    expect(credit(3)).toBe(before.three + share);
    // 공공 창고 = 도시 주인(2)의 그 도시 물건 25%, 점령자의 가장 오래된 도시(6) 창고로. 다른 세력(1) 물건은 그대로
    expect(world.book.balanceOf(2, "item:plank", 5)).toBe(300n);
    expect(world.book.balanceOf(3, "item:plank", 6)).toBe(100n);
    expect(world.book.balanceOf(1, "item:plank", 5)).toBe(100n);
    expect(world.cities.get(5)?.owner).toBe(2);
    expect(two.cities.has(5)).toBe(true);
    expect(world.ruins.has(5)).toBe(false);
    expect(three.wars.has(2)).toBe(true);
    expect(society.summary().occupations).toMatchObject({ loot: 1, integrate: 0, occupy: 0, delisted: 0 });
    expect(problems(2000)).toEqual([]);
  });

  it("점령 상태: 소유 그대로, 세금 주기마다 그 도시 몫 세금, 기한에 끝난다", () => {
    const { world, credit, faction } = setup();
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      war: { ...TEST_SOCIETY_COEFFICIENTS.war, occupyDays: 14, occupyTaxEveryDays: 7, occupyTaxBp: 1000 },
    };
    const war = createSocietyWar({ world, c, hooks: undefined, treasuryAsset: () => TEST_ASSET_CREDIT });
    const [two, three] = [faction(2), faction(3)];
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    const entry = war.occupy(three, two, city, 0);
    expect(entry).toMatchObject({ kind: "occupied", occupier: 3, owner: 2, untilMs: 14 * DAY_MS });
    expect(world.cities.get(5)?.owner).toBe(2);
    // 6일째: 아직 세금 시각 전
    war.endOfDay(6 * DAY_MS);
    expect(entry.taken).toBe(0n);
    const before = credit(2);
    war.endOfDay(7 * DAY_MS);
    const tax = (before * 1000n) / 10_000n / 2n;
    expect(entry.taken).toBe(tax);
    expect(credit(3)).toBe(1000n + tax);
    expect(world.occupations.has(5)).toBe(true);
    war.endOfDay(14 * DAY_MS);
    expect(world.occupations.has(5)).toBe(false);
    expect(war.summary()).toMatchObject({ occupationTaxes: 2, occupationsEnded: 1, occupied: 0 });
  });

  it("점령 상태는 도시 주인이 바뀌면 끝난다(세금 없음)", () => {
    const { world, faction } = setup();
    const war = createSocietyWar({
      world,
      c: TEST_SOCIETY_COEFFICIENTS,
      hooks: undefined,
      treasuryAsset: () => TEST_ASSET_CREDIT,
    });
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    const entry = war.occupy(faction(3), faction(2), city, 0);
    city.owner = 1;
    war.endOfDay(30 * DAY_MS);
    expect(entry.taken).toBe(0n);
    expect(world.occupations.has(5)).toBe(false);
  });

  it("점령·귀속: 도시를 가져가고 재건 비용(주거 × 값)을 소각, 회복 불이익 동안 오르는 빠르기만 느리다", () => {
    const { world, society, problems, credit, faction } = setup();
    const [home, two] = [faction(1), faction(2)];
    const housing = world.cities.get(5)?.housing ?? 0;
    const before = credit(1);
    society.occupy(home, two, 5, { treatment: "integrate", shares: "keep" }, 1000);
    expect(world.cities.get(5)?.owner).toBe(1);
    const cost = BigInt(housing) * BigInt(TEST_SOCIETY_COEFFICIENTS.war.rebuildPerHousing);
    expect(credit(1)).toBe(before - cost);
    const penalty = world.occupations.get(5);
    expect(penalty).toMatchObject({ kind: "annexed", occupier: 1, owner: 2 });
    expect(penalty?.untilMs).toBe(1000 + TEST_SOCIETY_COEFFICIENTS.war.annexPenaltyDays * DAY_MS);
    expect(society.summary().occupations).toMatchObject({ integrate: 1, rebuilt: 1, annexed: 1 });
    expect(problems(1000)).toEqual([]);
  });

  it("회복 빠르기(recoveryPm): 불이익 중 오를 때만 annexRecoveryPm, 끝나면 평소", () => {
    const { world, faction } = setup();
    const war = createSocietyWar({
      world,
      c: TEST_SOCIETY_COEFFICIENTS,
      hooks: undefined,
      treasuryAsset: () => TEST_ASSET_CREDIT,
    });
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    war.annex(faction(1), faction(2), city, 0);
    city.owner = 1;
    const slow = TEST_SOCIETY_COEFFICIENTS.war.annexRecoveryPm;
    expect(war.recoveryPm(5, 30_000, 60_000, DAY_MS)).toBe(slow);
    expect(war.recoveryPm(5, 60_000, 30_000, DAY_MS)).toBe(1000);
    expect(war.recoveryPm(4, 30_000, 60_000, DAY_MS)).toBe(1000);
    const until = world.occupations.get(5)?.untilMs ?? 0;
    expect(war.recoveryPm(5, 30_000, 60_000, until)).toBe(1000);
    war.endOfDay(until);
    expect(world.occupations.has(5)).toBe(false);
  });
});
