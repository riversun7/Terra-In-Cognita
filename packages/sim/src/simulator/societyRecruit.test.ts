import { describe, expect, it } from "vitest";
import { TEST_ASSET_CREDIT } from "../settle/owner.ts";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { WALLET_BASE, attachSociety } from "./society.ts";
import { createWorld } from "./world.ts";
import { systemRule } from "./economyRun.ts";

const HOUR = 3_600_000;

/** 세력 둘(도시 둘씩, 주거 6, 일꾼 4): 1은 행정 건물 Lv3, 2는 Lv1(기본) */
function setup(options: { credit?: string; c?: SocietyCoefficients } = {}) {
  const c = options.c ?? TEST_SOCIETY_COEFFICIENTS;
  const scenario = parseScenario({
    id: "recruit_test",
    factions: [
      {
        code: "high",
        count: 1,
        fixed: true,
        cities: 2,
        workers: 4,
        credit: options.credit ?? "10000",
        tech: 1,
        housing: 6,
        adminLevel: 3,
      },
      { code: "low", count: 1, fixed: false, cities: 2, workers: 4, credit: "10000", tech: 1, housing: 6 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 9, 0, { systemRule });
  const recorder = createMetricsRecorder({ startMs: 0, sink: () => {} });
  const scheduledUnits: number[] = [];
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c,
      hooks: undefined,
      combat: undefined,
      scheduleFaction: () => {},
      scheduleUnit: (unitId) => scheduledUnits.push(unitId),
      cancel: () => {},
    },
    0,
  );
  const faction = (id: number) => {
    const found = world.factions.get(id);
    if (!found) throw new Error(`faction ${id}`);
    return found;
  };
  return { world, society, faction, scheduledUnits };
}

describe("시뮬 구인(D-469: 출생 없음, 행정 건물 구인 카드)", () => {
  it("도시 주인은 그 도시 행정 건물 레벨의 카드를 보고, 주인이 아니면 못 본다. 시나리오 기본 행정 건물은 Lv1", () => {
    const { world, society, faction } = setup();
    expect(world.cities.get(1)?.adminLevel).toBe(3);
    expect(world.cities.get(3)?.adminLevel).toBe(1);
    const view = society.recruitView(faction(1), 1, 5 * HOUR);
    expect(view?.level).toBe(3);
    expect(view?.window).toBe(0);
    expect(view?.endsAtMs).toBe(12 * HOUR);
    expect(view?.cards.length).toBeGreaterThanOrEqual(3);
    for (const card of view?.cards ?? []) expect(card.total).toBeGreaterThanOrEqual(60);
    expect(society.recruitView(faction(2), 1, 5 * HOUR)).toBeUndefined();
    // 같은 시각 = 같은 묶음, 다음 창 = 새 묶음
    expect(society.recruitView(faction(1), 1, 6 * HOUR)?.cards).toEqual(view?.cards);
    expect(society.recruitView(faction(1), 1, 13 * HOUR)?.window).toBe(1);
  });

  it("카드를 사면 값이 국고에서 소각되고 레벨 1 휴먼이 그 도시에 생긴다(카드 스탯·속성). 같은 칸은 그 창에 다시 못 산다", () => {
    const { world, society, faction, scheduledUnits } = setup();
    const owner = faction(1);
    const view = society.recruitView(owner, 1, HOUR);
    const card = view?.cards[1];
    if (!card) throw new Error("card");
    const before = world.book.balanceOf(1, TEST_ASSET_CREDIT);
    const unit = society.recruit(owner, 1, 1, HOUR);
    expect(unit?.city).toBe(1);
    expect(unit?.owner).toBe(1);
    expect(unit?.recruit).toEqual({ level: 1, stats: card.stats, elements: card.elements });
    expect(unit?.bornAtMs).toBe(HOUR);
    expect(owner.units.has(unit?.id ?? -1)).toBe(true);
    expect(scheduledUnits).toEqual([unit?.id]);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT)).toBe(before - card.cost);
    expect(society.recruitView(owner, 1, HOUR)?.taken).toBe(2);
    expect(society.recruit(owner, 1, 1, 2 * HOUR)).toBeUndefined();
    // 다음 창에는 새 묶음(같은 자리를 또 살 수 있다)
    expect(society.recruit(owner, 1, 1, 13 * HOUR)).toBeDefined();
    expect(world.audit.check(world.book.accounts())).toEqual([]);
    expect(society.summary().recruited).toBe(2);
    expect(society.summary().recruitSpent[TEST_ASSET_CREDIT]).toBe(
      String(before - world.book.balanceOf(1, TEST_ASSET_CREDIT)),
    );
  });

  it("국고가 모자라거나 남의 도시면 사지 못한다", () => {
    const { society, faction } = setup({ credit: "10" });
    expect(society.recruit(faction(1), 1, 0, HOUR)).toBeUndefined();
    expect(society.recruit(faction(2), 1, 0, HOUR)).toBeUndefined();
    expect(society.summary().recruited).toBe(0);
  });

  it("하루 줄 세력 칸 recruited = 그날 고용 수(하루 끝이 넘긴다)", () => {
    const { society, faction } = setup();
    society.recruit(faction(2), 3, 0, HOUR);
    society.recruit(faction(2), 3, 1, HOUR);
    expect(society.dayFields(faction(2)).recruited).toBe(0);
    society.endOfDay(DAY_MS);
    expect(society.dayFields(faction(2)).recruited).toBe(2);
    expect(society.dayFields(faction(1)).recruited).toBe(0);
    society.endOfDay(2 * DAY_MS);
    expect(society.dayFields(faction(2)).recruited).toBe(0);
  });

  it("죽은 휴먼의 지갑: 상속세(S22)는 도시 국고, 나머지는 소유자(그 세력)에게만 — 자녀·배우자 없음(D-469)", () => {
    const c: SocietyCoefficients = { ...TEST_SOCIETY_COEFFICIENTS, rebirthPm: 0, deifyPm: 0 };
    const { world, society, faction } = setup({ c });
    const unit = society.recruit(faction(2), 3, 0, HOUR);
    if (!unit) throw new Error("unit");
    // 그 휴먼을 남의 도시(세력 1의 도시 1)에 살게 해 국고와 소유자가 갈리게 한다
    faction(2).units.delete(unit.id);
    unit.city = 1;
    unit.owner = 2;
    unit.lifespanMs = 1;
    const wallet = WALLET_BASE + unit.id;
    world.book.post({
      kind: "transfer",
      atMs: HOUR,
      entries: [
        { account: world.book.ownerAccount(1, TEST_ASSET_CREDIT), amount: -101n },
        { account: world.book.ownerAccount(wallet, TEST_ASSET_CREDIT), amount: 101n },
      ],
    });
    const treasury = world.book.balanceOf(1, TEST_ASSET_CREDIT);
    const owner = world.book.balanceOf(2, TEST_ASSET_CREDIT);
    society.endOfDay(DAY_MS);
    expect(world.units.has(unit.id)).toBe(false);
    expect(world.book.balanceOf(wallet, TEST_ASSET_CREDIT)).toBe(0n);
    expect(world.book.balanceOf(1, TEST_ASSET_CREDIT) - treasury).toBe(50n);
    expect(world.book.balanceOf(2, TEST_ASSET_CREDIT) - owner).toBe(51n);
  });
});
