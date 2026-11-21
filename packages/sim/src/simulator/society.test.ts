import { describe, expect, it } from "vitest";
import { TEST_ASSET_CREDIT } from "../settle/owner.ts";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import type { OccupationChoice } from "../npc/policy.ts";
import { residentClaimCode, residentDebtCode } from "../society/residentTax.ts";
import { holdingsOf } from "../society/shares.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import type { SimHooks } from "./npcRun.ts";
import { createWorld } from "./world.ts";

/** 점령 처리 선택(시험이 고른다) */
const INTEGRATE_KEEP: OccupationChoice = { treatment: "integrate", shares: "keep" };
const LOOT_DELIST: OccupationChoice = { treatment: "loot", shares: "delist" };
const INTEGRATE_DELIST: OccupationChoice = { treatment: "integrate", shares: "delist" };

/** 세력 셋(도시 셋씩): 1 독재(고정), 2 자본주의, 3 민주주의 */
function setup(options: { hooks?: SimHooks; c?: SocietyCoefficients } = {}) {
  const c = options.c ?? TEST_SOCIETY_COEFFICIENTS;
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
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 5, 0);
  const lines: { t: string; cause?: string; faction?: number; from?: number; to?: number }[] = [];
  const recorder = createMetricsRecorder({ startMs: 0, sink: (line) => lines.push(JSON.parse(line)) });
  recorder.start([...world.factions.values()].map((f) => ({ id: f.id, fixed: f.fixed, tech: f.tech })));
  const scheduled: number[] = [];
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c,
      hooks: options.hooks,
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

  it("차리기: 처음 휴먼도 그 도시 행정 레벨 구인 카드 규칙의 스탯·속성(774 나), 같은 시드면 같은 값", () => {
    const { world } = setup();
    const again = setup().world;
    const rule = TEST_SOCIETY_COEFFICIENTS.recruit.levels[0];
    for (const unit of world.units.values()) {
      const total = (unit.recruit?.stats ?? []).reduce((sum, value) => sum + value, 0);
      expect(unit.recruit?.level).toBe(1);
      expect(total).toBeGreaterThanOrEqual(rule?.statsMin ?? 0);
      expect(total).toBeLessThanOrEqual(rule?.statsMax ?? 0);
      expect(again.units.get(unit.id)?.recruit).toEqual(unit.recruit);
    }
  });

  it("점령: 지분 유지 = 옛 통치자 몫이 점령 국고로, 시작 도시는 칠 수 없고, 도시를 잃으면 기술 후퇴(city_lost)", () => {
    const { world, society, lines, faction } = setup();
    const cap = faction(2);
    const dem = faction(3);
    // 연구 시설이 있는 첫 도시(4)를 잃으면 상한이 내려간다
    society.occupy(dem, cap, 4, INTEGRATE_KEEP, 1000);
    expect(world.cities.get(4)?.owner).toBe(3);
    expect(holdingsOf(world.book, 4)).toEqual([{ owner: 3, amount: 1000n }]);
    expect(cap.wars.has(3)).toBe(true);
    expect(lines.some((line) => line.t === "tech" && line.cause === "city_lost" && line.faction === 2)).toBe(
      true,
    );
    // 시작 도시(1)는 그대로
    society.occupy(dem, faction(1), 1, LOOT_DELIST, 2000);
    expect(world.cities.get(1)?.owner).toBe(1);
    expect(society.check(2000)).toEqual([]);
  });

  it("마지막 도시까지 빼앗기면 세력이 사라진다(conquered)", () => {
    const { world, society, lines, faction } = setup();
    for (const cityId of [7, 8, 9]) society.occupy(faction(2), faction(3), cityId, INTEGRATE_KEEP, 1000);
    expect(faction(3).alive).toBe(false);
    expect(lines.filter((line) => line.t === "died").map((line) => [line.faction, line.cause])).toEqual([
      [3, "conquered"],
    ]);
    expect([...world.cities.values()].filter((city) => city.owner === 3)).toEqual([]);
  });

  it("점령·귀속 + 상장폐지 + 독재로 바뀜은 만족도를 크게 떨어뜨려 반란이 일어나고, 반란군은 새 세력(전쟁)이 된다", () => {
    const { world, society, lines, scheduled, faction } = setup();
    // 독재(1)가 민주주의(3) 도시 7을 점령·귀속·상장폐지
    society.occupy(faction(1), faction(3), 7, INTEGRATE_DELIST, 1000);
    const unitsIn7 = [...world.units.values()].filter((u) => u.city === 7);
    // 60 − 5(점령·귀속) − 15(상장폐지) − 20(독재로) = 20 ≤ 반란 문턱 40(회복 불이익으로 하루 끝에도 거의 오르지 않는다)
    expect(unitsIn7.every((u) => u.satisfactionMilli === 20_000)).toBe(true);
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
    // 순한 부모 → 새 가문(± 150)도 공격 성향 600 아래 → 봉신(질문 198 가)
    cap.traits = { aggression: 100, commerce: 500, faith: 500, station: 500 };
    society.found(cap, 1000);
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

  it("하루가 지나면 만족도는 목표값(먹고 살 곳 있음 = 80)으로 다가가고, 출생은 없다(D-469)", () => {
    const { world, society } = setup();
    const before = world.units.size;
    for (let day = 1; day <= 10; day++) society.endOfDay(day * DAY_MS);
    const avg = [...world.units.values()].reduce((sum, u) => sum + u.satisfactionMilli, 0) / world.units.size;
    expect(avg).toBeGreaterThan(70_000);
    // 하루 끝만 돌리면(구인 없음) 휴먼은 늘지 않는다
    expect(world.units.size).toBeLessThanOrEqual(before);
    expect(society.summary().recruited).toBe(0);
  });
});

/** 경제 고리 흉내: 도시마다 걷은 거래세 누적, 세력마다 낸 발행 이자 누적 */
function taxHooks() {
  const tax = new Map<number, bigint>();
  const interest = new Map<number, bigint>();
  const hooks: SimHooks = {
    treasuryAsset: () => TEST_ASSET_CREDIT,
    beforeCityTransfer: () => {},
    factionBorn: () => {},
    factionDied: () => {},
    taxCollectedOf: (city) => tax.get(city) ?? 0n,
    interestPaidOf: (faction) => interest.get(faction) ?? 0n,
  };
  return { hooks, tax, interest };
}

/** 7번 주체에게 도시 지분 400주를 넘긴다 */
function giveShares(world: ReturnType<typeof setup>["world"], from: number, city: number): void {
  world.book.post({
    kind: "transfer",
    atMs: 0,
    entries: [
      { account: world.book.ownerAccount(from, `share_${city}`), amount: -400n },
      { account: world.book.ownerAccount(77, `share_${city}`), amount: 400n },
    ],
  });
}

describe("시뮬 배당·공물(D-304·D-338·D-443)", () => {
  it("배당 주기마다 도시 세금 − 이자 − 운영비를 나눈다: 자본주의는 지분대로, 민주주의는 국고에 남는다", () => {
    const { hooks, tax, interest } = taxHooks();
    const { world, society } = setup({ hooks });
    giveShares(world, 2, 5);
    giveShares(world, 3, 7);
    tax.set(5, 1000n);
    tax.set(7, 1000n);
    interest.set(2, 100n);
    for (let day = 1; day <= 6; day++) society.endOfDay(day * DAY_MS);
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(0n);
    society.endOfDay(7 * DAY_MS);
    // 도시 5: 1000 − 이자 100 = 이익 900의 40% → 360. 도시 7(민주주의): 0
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(360n);
    expect(society.summary().dividends).toEqual({ settlements: 2, payouts: 1, toTreasury: 1 });
    // 다음 기간은 새로 걷은 세금만 본다
    tax.set(5, 1500n);
    for (let day = 8; day <= 14; day++) society.endOfDay(day * DAY_MS);
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(560n);
    expect(society.check(14 * DAY_MS)).toEqual([]);
  });

  it("배당 주기는 설정값이고, 세금이 없으면 배당도 없다", () => {
    const { hooks, tax } = taxHooks();
    const c = { ...TEST_SOCIETY_COEFFICIENTS, dividendEveryMs: 2 * DAY_MS };
    const { world, society } = setup({ hooks, c });
    giveShares(world, 2, 5);
    tax.set(5, 500n);
    society.endOfDay(DAY_MS);
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(0n);
    society.endOfDay(2 * DAY_MS);
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(200n);
    const quiet = setup();
    giveShares(quiet.world, 2, 5);
    for (let day = 1; day <= 7; day++) quiet.society.endOfDay(day * DAY_MS);
    expect(quiet.world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(0n);
  });

  it("봉신은 공물 주기마다 국고의 공물 비율(설정값 주 5%)을 상위 세력에 낸다", () => {
    const { world, society, faction } = setup();
    faction(3).overlord = 2;
    const before = world.book.balanceOf(2, TEST_ASSET_CREDIT);
    const vassal = world.book.balanceOf(3, TEST_ASSET_CREDIT);
    for (let day = 1; day <= 7; day++) society.endOfDay(day * DAY_MS);
    expect(world.book.balanceOf(2, TEST_ASSET_CREDIT) - before).toBe((vassal * 50n) / 1000n);
    expect(society.summary().tributes).toBe(1);
  });

  it("선포는 국고의 5%를 태우고, 교전 없이 7일이 지나면 백지 강화, 강화 조약은 14일 불가침(질문 194~196 가)", () => {
    const { world, society, faction } = setup();
    const cap = faction(2);
    const dem = faction(3);
    const before = world.book.balanceOf(2, TEST_ASSET_CREDIT);
    society.declareWar(cap, dem, 0);
    expect(world.book.balanceOf(2, TEST_ASSET_CREDIT)).toBe(before - (before * 500n) / 10_000n);
    expect(cap.wars.has(3) && dem.wars.has(2)).toBe(true);
    for (let day = 1; day <= 6; day++) society.endOfDay(day * DAY_MS);
    expect(cap.wars.has(3)).toBe(true);
    society.endOfDay(7 * DAY_MS);
    expect(cap.wars.has(3) || dem.wars.has(2)).toBe(false);
    expect(society.summary().wars).toEqual({ declared: 1, treaties: 0, whitePeace: 1 });
    society.declareWar(cap, dem, 8 * DAY_MS);
    society.makePeace(dem, cap, 9 * DAY_MS);
    expect(cap.wars.size).toBe(0);
    expect(cap.truces.get(3)).toBe(23 * DAY_MS);
    expect(society.check(9 * DAY_MS)).toEqual([]);
  });

  it("반란 세력은 원래 나라를 기억한다(반란의 반란도 맨 처음 나라), 태어날 때 부모도 적는다(620 나)", () => {
    const { world, society, lines, faction } = setup();
    society.occupy(faction(1), faction(3), 7, INTEGRATE_DELIST, 1000);
    society.endOfDay(DAY_MS);
    const born = lines.find((line) => line.t === "born" && line.cause === "rebellion");
    expect(world.factions.get(born?.faction ?? 0)).toMatchObject({ rebelOf: 1, bornOf: 1 });
  });

  it("약탈(D-520)은 도시를 옮기지 않는다: 도시·지분은 그대로, 만족도만 약탈 하락", () => {
    const { world, society, faction } = setup();
    society.occupy(faction(1), faction(3), 7, LOOT_DELIST, 1000);
    expect(world.cities.get(7)?.owner).toBe(3);
    expect(holdingsOf(world.book, 7)).toEqual([{ owner: 3, amount: 1000n }]);
    const unitsIn7 = [...world.units.values()].filter((u) => u.city === 7);
    expect(unitsIn7.every((u) => u.satisfactionMilli === 35_000)).toBe(true);
    expect(society.check(1000)).toEqual([]);
  });
});

/** 도시 5(자본주의 2번 세력)에 사는 휴먼 하나를 77번 주인에게 넘기고 77번에게 돈을 준다 */
const residentSetup = (c: SocietyCoefficients, property: bigint, calls: number[] = []) => {
  const { hooks } = taxHooks();
  const arrears: bigint[] = [];
  const withProperty: SimHooks = {
    ...hooks,
    residentProperty: (nowMs) => {
      calls.push(nowMs);
      return (payer, city) => (payer === 77 && city === 5 ? property : 0n);
    },
    residentTaxArrears: (_faction, list) => {
      for (const entry of list) arrears.push(entry.owed);
    },
  };
  const made = setup({ hooks: withProperty, c });
  const unit = [...made.world.units.values()].find((u) => u.city === 5);
  if (!unit) throw new Error("unit in city 5");
  unit.owner = 77;
  // 시험 동안 수명으로 떠나지 않게
  unit.lifespanMs = 1000 * DAY_MS;
  made.world.book.post({
    kind: "transfer",
    atMs: 0,
    entries: [
      { account: made.world.book.ownerAccount(2, TEST_ASSET_CREDIT), amount: -150n },
      { account: made.world.book.ownerAccount(77, TEST_ASSET_CREDIT), amount: 150n },
    ],
  });
  return { ...made, arrears };
};

describe("시뮬 주민세(D-579)", () => {
  it("세율 0(출발값)이면 재산 값을 묻지도 않고 아무것도 걷지 않는다", () => {
    const calls: number[] = [];
    const { world, society } = residentSetup(TEST_SOCIETY_COEFFICIENTS, 10_000n, calls);
    for (let day = 1; day <= 14; day++) society.endOfDay(day * DAY_MS);
    expect(calls).toEqual([]);
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(150n);
  });

  it("주기마다 재산 × 세율을 사는 도시 나라 국고에, 도시 몫은 D-304 도시 세금 수입으로, 못 낸 몫은 빚(다음에 먼저 갚는다)", () => {
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      business: { ...TEST_SOCIETY_COEFFICIENTS.business, residentTaxPm: 10, residentTaxEveryMs: 7 * DAY_MS },
    };
    const { world, society, arrears } = residentSetup(c, 10_000n);
    giveShares(world, 2, 5);
    for (let day = 1; day <= 6; day++) society.endOfDay(day * DAY_MS);
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(150n);
    society.endOfDay(7 * DAY_MS);
    // 세금 100(10,000 × 10‰) → 국고. 같은 날 도시 세금 정산에서 도시 5 수입 100의 지분 40% = 40이 77번에게
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(90n);
    for (let day = 8; day <= 14; day++) society.endOfDay(day * DAY_MS);
    // 둘째 주: 세금 100 가운데 90만 낸다 → 빚 10, 배당 40% × 90 = 36
    expect(world.book.balanceOf(77, TEST_ASSET_CREDIT)).toBe(36n);
    expect(arrears).toEqual([10n]);
    const debt = world.book.systemAccount(residentDebtCode(2, 5, 77, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT);
    const claim = world.book.systemAccount(residentClaimCode(2, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT);
    expect(world.book.balance(debt)).toBe(-10n);
    expect(world.book.balance(claim)).toBe(10n);
    // 셋째 주: 빚 10 + 세금 100 = 110 가운데 36만 → 빚 74
    for (let day = 15; day <= 21; day++) society.endOfDay(day * DAY_MS);
    expect(world.book.balance(debt)).toBe(-74n);
    expect(world.book.balance(claim)).toBe(74n);
  });

  it("도시가 폐허가 되면 그 도시의 주민세 빚이 사라진다(질문 2427 나)", () => {
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      business: { ...TEST_SOCIETY_COEFFICIENTS.business, residentTaxPm: 100, residentTaxEveryMs: DAY_MS },
    };
    const { world, society } = residentSetup(c, 10_000n);
    society.endOfDay(DAY_MS);
    const debt = world.book.systemAccount(residentDebtCode(2, 5, 77, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT);
    const claim = world.book.systemAccount(residentClaimCode(2, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT);
    expect(world.book.balance(debt)).toBe(-850n);
    society.ruin(5, 2 * DAY_MS);
    expect(world.cities.has(5)).toBe(false);
    expect(world.book.balance(debt)).toBe(0n);
    expect(world.book.balance(claim)).toBe(0n);
  });
});
