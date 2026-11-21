// NPC 휴먼 지갑·임금·생활비(질문 2236 — D-569 1782·D-097·D-555 1507·1509, humanPurse.ts)
import { unitPurseLocation } from "@terra/shared/businessBooks";
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { inheritPurse } from "../society/population.ts";
import { beforeCityTransfer, createEconomy } from "./economy.ts";
import {
  type NpcLivingRules,
  cityWorkerUnits,
  humanPurseAccount,
  livingDay,
  moneyAssets,
  movePurses,
  necessityCost,
  noteServed,
  npcBaseDailyWage,
} from "./humanPurse.ts";
import { runSimulation } from "./run.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO } from "./testEconomy.ts";
import { createWorld, transferCity } from "./world.ts";

const DAY = 86_400_000;
const RULES: NpcLivingRules = {
  wageMode: 1,
  wagePm: 1000,
  baseDailyWage: 20n,
  foodEfficiency: [
    { atMost: 30, pm: 0 },
    { atMost: 50, pm: 700 },
  ],
};

function setup() {
  const world = createWorld(TEST_ECONOMY_SCENARIO, 3, 0);
  const economy = createEconomy(world, TEST_ECONOMY_SCENARIO, TEST_CATALOG, 0);
  const faction = [...world.factions.values()].find((entry) => entry.code.startsWith("agri"));
  if (!faction) throw new Error("agri faction");
  const [cityId] = [...faction.cities].toSorted((a, b) => a - b);
  if (cityId === undefined) throw new Error("city");
  const currency = economy.currencyOf.get(faction.id) ?? "";
  const units = [...world.units.values()]
    .filter((unit) => unit.city === cityId)
    .toSorted((a, b) => a.id - b.id);
  return { world, economy, faction, cityId, currency, units };
}

/** 모든 도시가 하루 동안 생필품 경계마다 served명에게 줬다고 적는다(시험은 한 도시만 보지만 하루 끝 셈은 모든 도시를 돈다) */
function feed(economy: ReturnType<typeof setup>["economy"], cityIds: Iterable<number>, served: number): void {
  for (const cityId of cityIds) {
    for (let hour = 0; hour < 24; hour++) noteServed(economy, cityId, "item:ration", served);
    noteServed(economy, cityId, "item:household_goods", served);
  }
}

/** 작은 경제 시나리오 6일(줄·요약) */
function simulate() {
  const lines: string[] = [];
  const summary = runSimulation({
    scenario: TEST_ECONOMY_SCENARIO,
    catalog: TEST_CATALOG,
    seed: 5,
    days: 6,
    sink: (line) => lines.push(line),
  });
  return { summary, lines };
}

describe("NPC 휴먼 지갑(humanPurse.ts)", () => {
  it("기준 임금 = 플레이어 직무 배치와 같은 식(새 유닛 평균 효율 × N27 단가, 조정 1000‰)", () => {
    // 출발값: 초기 합 60 → 효율 10, 단가 2,000밀리 → 하루 20
    expect(npcBaseDailyWage(TEST_SOCIETY_COEFFICIENTS)).toBe(20n);
  });

  it("일꾼은 경비대가 아닌 휴먼을 유닛 ID 차례로 시설 ID 차례에 앞에서부터 채운다(서버 humanPlaces와 같다)", () => {
    const { world, economy, cityId, units } = setup();
    const [first, second] = units;
    if (!first || !second) throw new Error("units");
    first.guard = true;
    const workers = cityWorkerUnits(world, economy, cityId);
    const total = [...economy.facilities.values()]
      .filter((facility) => facility.city === cityId)
      .reduce((sum, facility) => sum + facility.workers, 0);
    expect(workers).toHaveLength(Math.min(total, units.length - 1));
    expect(workers[0]?.unitId).toBe(second.id);
    expect(workers.some((worker) => worker.unitId === first.id)).toBe(false);
    const facilityIds = workers.map((worker) => worker.facilityId);
    expect(facilityIds).toEqual(facilityIds.toSorted((a, b) => a - b));
  });

  it("다 먹은 일꾼: 임금(국고 → 지갑)으로 먹은 생필품 값을 낸다(지갑 → 국고) — 기본 임금이 생활비보다 작아 국고·지갑이 그대로", () => {
    const { world, economy, faction, cityId, currency, units } = setup();
    feed(economy, world.cities.keys(), 100);
    const before = world.book.balanceOf(faction.id, currency);
    const day = livingDay(economy, world, DAY, RULES);
    expect(day.paidWorkers).toBeGreaterThanOrEqual(cityWorkerUnits(world, economy, cityId).length);
    // 그 나라 화폐로 낸 임금 = 일꾼마다 20(다른 나라는 제 화폐로)
    expect((day.wages.get(currency) ?? 0n) % 20n).toBe(0n);
    expect(day.wages.get(currency) ?? 0n).toBeGreaterThan(0n);
    // 먹은 값(24 × 4 + 40 = 136) > 임금 20 → 임금을 모두 생필품 값으로 낸다
    expect(day.living.get(currency)).toBe(day.wages.get(currency));
    expect(world.book.balanceOf(faction.id, currency)).toBe(before);
    for (const unit of units)
      expect(world.book.balanceOf(faction.id, currency, unitPurseLocation(unit.id))).toBe(0n);
    // 지갑이 모자란 몫은 주인 현물 부양
    expect(day.subsidy.get(currency) ?? 0n).toBeGreaterThan(0n);
    // 기록을 비운다
    expect(economy.today.served).toBeUndefined();
  });

  it("굶은 일꾼(포만감 30 이하)은 효율 0이라 임금 0(N33)", () => {
    const { world, economy } = setup();
    feed(economy, world.cities.keys(), 0);
    const hungry = livingDay(economy, world, DAY, RULES);
    expect(hungry.paidWorkers).toBe(0);
    expect(hungry.hungryWorkers).toBeGreaterThan(0);
    expect(hungry.wages.size).toBe(0);
  });

  it("임금이 생활비보다 크면 남는 돈은 지갑에 남고, 다음 숙박비 몫은 생필품에 쓰지 않는다", () => {
    const { world, economy, faction, cityId, currency } = setup();
    feed(economy, world.cities.keys(), 100);
    const [worker] = cityWorkerUnits(world, economy, cityId);
    if (!worker) throw new Error("worker");
    const rules = { ...RULES, baseDailyWage: 200n };
    livingDay(economy, world, DAY, rules, {
      lodgingDue: () => new Map([[`${worker.facilityId}:${worker.index}`, 7n]]),
    });
    // 200 − 136 = 64(숙박비 몫 7은 처음부터 남긴다)
    expect(world.book.balanceOf(faction.id, currency, unitPurseLocation(worker.unitId))).toBe(64n);
    // 다음 날: 지갑 64 + 임금 200 − 136 = 128
    feed(economy, world.cities.keys(), 100);
    livingDay(economy, world, 2 * DAY, rules);
    expect(world.book.balanceOf(faction.id, currency, unitPurseLocation(worker.unitId))).toBe(128n);
  });

  it("임금 낼 곳(서버 고리)이 모자라면 그 일꾼은 받지 못한다 — 국고가 대신 내지 않는다", () => {
    const { world, economy, faction, currency } = setup();
    feed(economy, world.cities.keys(), 100);
    const empty = world.book.ownerAccount(faction.id, currency, 999_999);
    const before = world.book.balanceOf(faction.id, currency);
    const day = livingDay(economy, world, DAY, RULES, { wageSource: () => empty });
    expect(day.paidWorkers).toBe(0);
    expect(day.unpaidWorkers).toBeGreaterThan(0);
    expect(world.book.balanceOf(faction.id, currency)).toBe(before);
  });

  it("끈 판(business_npc_wage_mode 0)은 원장을 건드리지 않는다", () => {
    const { world, economy } = setup();
    feed(economy, world.cities.keys(), 100);
    const accounts = [...world.book.accounts()].length;
    const day = livingDay(economy, world, DAY, { ...RULES, wageMode: 0 });
    expect(day.paidWorkers).toBe(0);
    expect([...world.book.accounts()].length).toBe(accounts);
  });

  it("지갑은 도시 주인이 바뀌면 새 주인 밑으로(창고와 함께), 새 마을 등은 movePurses, 죽으면 상속(세금 = 도시 국고)", () => {
    const { world, economy, faction, cityId, currency, units } = setup();
    const [unit] = units;
    if (!unit) throw new Error("unit");
    world.book.post({
      kind: "transfer",
      atMs: 1,
      entries: [
        { account: world.book.ownerAccount(faction.id, currency), amount: -100n },
        { account: humanPurseAccount(world.book, faction.id, currency, unit.id), amount: 100n },
      ],
    });
    const other = [...world.factions.values()].find((entry) => entry.id !== faction.id);
    if (!other) throw new Error("other");
    beforeCityTransfer(economy, world, cityId, faction, other, 2);
    transferCity(world, cityId, other, 2);
    expect(world.book.balanceOf(faction.id, currency, unitPurseLocation(unit.id))).toBe(0n);
    expect(world.book.balanceOf(other.id, currency, unitPurseLocation(unit.id))).toBe(100n);
    expect(movePurses(world.book, [unit.id], other.id, faction.id, moneyAssets(economy), 3)).toBe(1);
    expect(world.book.balanceOf(faction.id, currency, unitPurseLocation(unit.id))).toBe(100n);
    // 상속: 상속세(S22 만분율)는 도시 국고(other), 나머지는 지갑 주인(faction)
    const treasury = world.book.balanceOf(other.id, currency);
    const owner = world.book.balanceOf(faction.id, currency);
    inheritPurse(
      world.book,
      faction.id,
      unit.id,
      other.id,
      moneyAssets(economy),
      4,
      TEST_SOCIETY_COEFFICIENTS,
    );
    const tax = (100n * BigInt(TEST_SOCIETY_COEFFICIENTS.inheritanceTaxBp)) / 10_000n;
    expect(world.book.balanceOf(faction.id, currency, unitPurseLocation(unit.id))).toBe(0n);
    expect(world.book.balanceOf(other.id, currency) - treasury).toBe(tax);
    expect(world.book.balanceOf(faction.id, currency) - owner).toBe(100n - tax);
  });

  it("생필품 값은 거래소를 읽기만 한다 — 없는 거래소는 get하지 않고 팩 시작 시세(서버 도시 표는 get이 거래소를 만든다, 묶음 1116q leak-hunt)", () => {
    const { economy, cityId, currency } = setup();
    const perItem = economy.markets.get(cityId);
    if (!perItem) throw new Error("markets");
    const asked: string[] = [];
    const plainGet = perItem.get.bind(perItem);
    perItem.get = (asset: string) => {
      asked.push(asset);
      return plainGet(asset);
    };
    perItem.delete("item:ration");
    const lot = economy.catalog.lotSize.get("item:ration") ?? 1n;
    const start = economy.catalog.startPrice.get("item:ration") ?? 0n;
    expect(necessityCost(economy, cityId, "item:ration", currency, lot * 3n)).toBe(start * 3n);
    expect(asked).toEqual([]);
  });

  it("시뮬 전체: 하루 줄·요약에 living 칸, 같은 시드 같은 결과, 불변 조건 위반 없음", () => {
    const a = simulate();
    const b = simulate();
    expect(b.lines).toEqual(a.lines);
    expect(a.summary.invariants).toMatchObject({ violations: 0 });
    const living = a.summary.economy?.living;
    expect(living?.paidWorkers).toBeGreaterThan(0);
    const econ = a.lines.map((line) => JSON.parse(line)).filter((record) => record.t === "econ");
    expect(econ[0]).toHaveProperty("living.treasuries");
  });
});
