// 공성 결과 셋 시험(D-520·D-527): 약탈은 정부가 무너져 재건 전까지 꺼내 가고 재건되면 다시 전쟁(소유 그대로·폐허 없음), 점령 상태는 정해진 끝 없이
// 세금·저절로 회복·힘으로 몰아냄·주인 바뀜으로 끝, 점령·귀속은 재건 비용·느린 회복
import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { createMetricsRecorder, DAY_MS } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { createSocietyWar } from "./societyWar.ts";
import { OCCUPATION_END_REASONS } from "@terra/shared/faction";
import { WAR_STATE_END_REASONS, type WarStateEndReason } from "../society/warOutcomes.ts";
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

/** 남은 상태 끝 까닭을 모으는 시험 실행기(createSocietyWar 직접) */
function warOf(world: ReturnType<typeof setup>["world"], c: SocietyCoefficients = TEST_SOCIETY_COEFFICIENTS) {
  const ended: [number, WarStateEndReason][] = [];
  const resumed: [number, number][] = [];
  const war = createSocietyWar({
    world,
    c,
    hooks: undefined,
    treasuryAsset: () => TEST_ASSET_CREDIT,
    resumeWar: (owner, looter) => resumed.push([owner.id, looter.id]),
    onEnd: (entry, reason) => ended.push([entry.city, reason]),
  });
  return { war, ended, resumed };
}

/** 점령 상태 시험용: 힘으로 몰아내기를 끈 계수 */
const NO_EXPEL: SocietyCoefficients = {
  ...TEST_SOCIETY_COEFFICIENTS,
  war: { ...TEST_SOCIETY_COEFFICIENTS.war, occupyExpelStrengthPm: 0 },
};

describe("공성 결과 셋(D-520·D-527)", () => {
  it("약탈: 정부가 무너진 상태만 두고 소유는 그대로, 폐허가 되지 않는다. 꺼내 가기는 하루 끝부터", () => {
    const { world, society, problems, credit, faction } = setup();
    const [two, three] = [faction(2), faction(3)];
    const before = { two: credit(2), three: credit(3) };
    society.occupy(three, two, 5, { treatment: "loot", shares: "delist" }, 2000);
    expect(credit(2)).toBe(before.two);
    expect(credit(3)).toBe(before.three);
    expect(world.occupations.get(5)).toMatchObject({
      kind: "looted",
      occupier: 3,
      owner: 2,
      sinceMs: 2000,
      untilMs: 2000 + TEST_SOCIETY_COEFFICIENTS.war.govRebuildDays * DAY_MS,
      taken: 0n,
    });
    expect(world.cities.get(5)?.owner).toBe(2);
    expect(two.cities.has(5)).toBe(true);
    expect(world.ruins.has(5)).toBe(false);
    expect(three.wars.has(2)).toBe(true);
    expect(society.summary().occupations).toMatchObject({ loot: 1, integrate: 0, occupy: 0, looted: 1 });
    expect(problems(2000)).toEqual([]);
  });

  it("약탈: 재건 전까지 하루마다 금고 몫·공공 창고 몫을 꺼내 가고, 재건할 날이 지나면 옛 세력이 비용을 내고 재건 → 다시 전쟁", () => {
    const { world, credit, faction, give } = setup();
    const { war, ended, resumed } = warOf(world);
    const [two, three] = [faction(2), faction(3)];
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    give(2, "item:plank", 400n, 5);
    give(1, "item:plank", 100n, 5);
    const entry = war.raid(three, two, city, 0);
    const c = TEST_SOCIETY_COEFFICIENTS;
    const before = { two: credit(2), three: credit(3) };
    war.endOfDay(DAY_MS);
    // 금고 몫 = 국고 × lootTakeBp ÷ 10000 ÷ 도시 2개
    const share = (before.two * BigInt(c.lootTakeBp)) / 10_000n / 2n;
    expect(credit(2)).toBe(before.two - share);
    expect(credit(3)).toBe(before.three + share);
    expect(entry.taken).toBe(share);
    // 공공 창고 = 도시 주인(2)의 그 도시 물건 25%, 약탈자의 가장 오래된 도시(6) 창고로. 다른 세력(1) 물건은 그대로
    expect(world.book.balanceOf(2, "item:plank", 5)).toBe(300n);
    expect(world.book.balanceOf(3, "item:plank", 6)).toBe(100n);
    expect(world.book.balanceOf(1, "item:plank", 5)).toBe(100n);
    // 이튿날도 남은 것의 25%
    war.endOfDay(2 * DAY_MS);
    expect(world.book.balanceOf(2, "item:plank", 5)).toBe(225n);
    expect(world.occupations.get(5)?.kind).toBe("looted");
    // 재건할 날(7일)에 꺼내 간 뒤 재건 비용(주거 × 값)을 소각하고 끝 → 다시 전쟁
    const housing = BigInt(city.housing);
    for (let day = 3; day < c.war.govRebuildDays; day++) war.endOfDay(day * DAY_MS);
    expect(world.occupations.has(5)).toBe(true);
    const ownerBefore = credit(2);
    war.endOfDay(c.war.govRebuildDays * DAY_MS);
    const lastShare = (ownerBefore * BigInt(c.lootTakeBp)) / 10_000n / 2n;
    expect(credit(2)).toBe(ownerBefore - lastShare - housing * BigInt(c.war.govRebuildPerHousing));
    expect(world.occupations.has(5)).toBe(false);
    expect(ended).toEqual([[5, "rebuilt"]]);
    expect(resumed).toEqual([[2, 3]]);
    expect(war.summary()).toMatchObject({ govRebuilt: 1, lootWithdrawals: c.war.govRebuildDays, looted: 0 });
  });

  it("약탈: 옛 세력이 재건 비용을 다 못 내면 있는 만큼 내고 재건한다(국고가 빈 세력도 무너진 채 남지 않는다)", () => {
    const { world, credit, faction } = setup();
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      war: { ...TEST_SOCIETY_COEFFICIENTS.war, govRebuildPerHousing: 1_000_000_000 },
    };
    const { war, ended } = warOf(world, c);
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    war.raid(faction(3), faction(2), city, 0);
    for (let day = 1; day < c.war.govRebuildDays; day++) war.endOfDay(day * DAY_MS);
    expect(world.occupations.get(5)?.kind).toBe("looted");
    war.endOfDay(c.war.govRebuildDays * DAY_MS);
    expect(credit(2)).toBe(0n);
    expect(ended).toEqual([[5, "rebuilt"]]);
  });

  it("society: 재건되면 약탈 세력과 다시 전쟁(백지 강화로 끝났어도)", () => {
    const { world, society, faction } = setup();
    const [two, three] = [faction(2), faction(3)];
    society.occupy(three, two, 5, { treatment: "loot", shares: "keep" }, 0);
    expect(two.wars.has(3)).toBe(true);
    // 백지 강화를 흉내(전쟁 끝)
    two.wars.delete(3);
    three.wars.delete(2);
    const days = TEST_SOCIETY_COEFFICIENTS.war.govRebuildDays;
    for (let day = 1; day <= days; day++) society.endOfDay(day * DAY_MS);
    if (world.occupations.has(5)) throw new Error("재건되지 않음");
    expect(two.wars.has(3) && three.wars.has(2)).toBe(true);
    expect(society.summary().occupations).toMatchObject({ govRebuilt: 1, looted: 0 });
  });

  it("점령 상태: 소유 그대로, 세금 주기마다 그 도시 몫 세금, 정해진 끝 없이 저절로 회복(occupyDays)에 끝난다", () => {
    const { world, credit, faction } = setup();
    const c: SocietyCoefficients = {
      ...NO_EXPEL,
      war: { ...NO_EXPEL.war, occupyDays: 7, occupyTaxEveryDays: 1, occupyTaxBp: 1000 },
    };
    const { war, ended } = warOf(world, c);
    const [two, three] = [faction(2), faction(3)];
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    const entry = war.occupy(three, two, city, 0);
    expect(entry).toMatchObject({
      kind: "occupied",
      occupier: 3,
      owner: 2,
      untilMs: 7 * DAY_MS,
      nextTaxMs: DAY_MS,
    });
    expect(world.cities.get(5)?.owner).toBe(2);
    const before = credit(2);
    war.endOfDay(DAY_MS);
    const tax = (before * 1000n) / 10_000n / 2n;
    expect(entry.taken).toBe(tax);
    expect(credit(3)).toBe(1000n + tax);
    for (let day = 2; day < 7; day++) war.endOfDay(day * DAY_MS);
    expect(world.occupations.has(5)).toBe(true);
    war.endOfDay(7 * DAY_MS);
    expect(world.occupations.has(5)).toBe(false);
    expect(ended).toEqual([[5, "recovered"]]);
    expect(war.summary()).toMatchObject({
      occupationTaxes: 7,
      occupationsEnded: 1,
      recovered: 1,
      occupied: 0,
    });
  });

  it("점령 상태: 옛 세력이 힘을 회복하면(유닛 수 ≥ 점령자 × ‰) 몰아낸다", () => {
    const { world, faction } = setup();
    const { war, ended } = warOf(world);
    const [two, three] = [faction(2), faction(3)];
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    // 유닛 6(두 번째) 대 4(세 번째): 6 × 1000 ≥ 4 × 1200 → 몰아냄. 세 번째가 첫 번째(9)를 점령하면 4 대 9라 이어진다
    war.occupy(three, two, city, 0);
    const home = world.cities.get(2);
    if (!home) throw new Error("home");
    war.occupy(three, faction(1), home, 0);
    war.endOfDay(DAY_MS);
    expect(world.occupations.has(5)).toBe(false);
    expect(world.occupations.has(2)).toBe(false);
    expect(ended).toContainEqual([5, "expelled"]);
    expect(war.summary().expelled).toBeGreaterThanOrEqual(1);
  });

  it("점령 상태는 도시 주인이 바뀌면 끝난다(세금 없음)", () => {
    const { world, faction } = setup();
    const { war, ended } = warOf(world, NO_EXPEL);
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    const entry = war.occupy(faction(3), faction(2), city, 0);
    city.owner = 1;
    war.endOfDay(30 * DAY_MS);
    expect(entry.taken).toBe(0n);
    expect(world.occupations.has(5)).toBe(false);
    expect(ended).toEqual([[5, "owner_changed"]]);
  });

  it("끝난 까닭 목록은 세력 화면 공유 타입과 같다(표 war_outcomes.end_reason 검사와도 같은 값)", () => {
    expect([...WAR_STATE_END_REASONS]).toEqual([...OCCUPATION_END_REASONS]);
  });

  it("같은 도시에 새 결과가 오면 옛 상태는 replaced로 끝난다", () => {
    const { world, faction } = setup();
    const { war, ended } = warOf(world, NO_EXPEL);
    const city = world.cities.get(5);
    if (!city) throw new Error("city");
    war.raid(faction(3), faction(2), city, 0);
    war.occupy(faction(1), faction(2), city, 10);
    expect(world.occupations.get(5)).toMatchObject({ kind: "occupied", occupier: 1 });
    expect(ended).toEqual([[5, "replaced"]]);
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
