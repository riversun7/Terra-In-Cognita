import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { holdingsOf } from "../society/shares.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { TEST_ASSET_CREDIT, checkWorld, createWorld, restoreEscrow } from "./world.ts";

/** 고정 나라 1(시작 도시 1 + 마을 2·3), 유동 세력 2(도시 4·5), 유동 세력 3(도시 6 하나) */
function setup(c: SocietyCoefficients = TEST_SOCIETY_COEFFICIENTS) {
  const scenario = parseScenario({
    id: "restore_test",
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
  return { world, society, problems, credit };
}

/** NPC 규칙식을 끈 계수(정부 짓기·넣기를 시험이 직접 부른다) */
const MANUAL: SocietyCoefficients = {
  ...TEST_SOCIETY_COEFFICIENTS,
  restoration: {
    ...TEST_SOCIETY_COEFFICIENTS.restoration,
    claimCost: 2000,
    goal: 10_000,
    npcClaimAfterDays: 10_000,
    npcFundPm: 0,
    npcInvestPm: 0,
  },
};

describe("폐허 복원(D-510·D-339·D-343·D-344)", () => {
  it("웨이브 폐허는 지우지 않고 남는다(옛 주인·주거), 시작 도시는 폐허가 아니다", () => {
    const { world, society } = setup(MANUAL);
    const housing = world.cities.get(3)?.housing ?? 0;
    society.ruin(3, 1000);
    society.ruin(1, 1000);
    expect(world.cities.has(3)).toBe(false);
    expect(world.ruins.get(3)).toMatchObject({ id: 3, formerOwner: 1, housing, claimant: null });
    expect(world.ruins.has(1)).toBe(false);
  });

  it("정부를 먼저 지은 쪽이 주인 → 주인만 넣다가 모금을 열면 누구나 → 목표를 채우면 같은 ID로 도시가 돌아오고 지분은 낸 값 비례", () => {
    const { world, society, problems, credit } = setup(MANUAL);
    society.ruin(4, 1000);
    // 세력 2(옛 주인)가 정부를 짓는다(값 2,000 소각), 세력 1은 늦었다
    const before = credit(2);
    expect(society.ruins.claim(4, 2, 2, 2000, { pay: true })).toBe("ok");
    expect(credit(2)).toBe(before - 2000n);
    expect(society.ruins.claim(4, 1, 1, 2000, { pay: true })).toBe("claimed");
    expect(world.ruins.get(4)).toMatchObject({ claimant: 2, joinFaction: 2, goal: 10_000n, open: false });
    // 모금을 열기 전에는 주인만
    expect(society.ruins.fund(4, 1, 1000n, 3000).result).toBe("not_open");
    expect(society.ruins.fund(4, 2, 4000n, 3000)).toMatchObject({ result: "ok", accepted: 4000n });
    expect(society.ruins.open(4, 1)).toBe("not_owner");
    expect(society.ruins.open(4, 2)).toBe("ok");
    expect(society.ruins.open(4, 2)).toBe("already_open");
    expect(society.ruins.fund(4, 3, 5000n, 3000).result).toBe("insufficient_funds");
    expect(society.ruins.fund(4, 1, 3000n, 3000).accepted).toBe(3000n);
    const escrow = world.book.systemAccount(restoreEscrow(4, TEST_ASSET_CREDIT), TEST_ASSET_CREDIT);
    expect(world.book.balance(escrow)).toBe(7000n);
    expect(problems(3000)).toEqual([]);
    // 세력 1이 남은 몫보다 많이 넣으면 남은 3,000만 받고 복원
    const rest = society.ruins.fund(4, 1, 9000n, 4000);
    expect(rest).toEqual({ result: "ok", accepted: 3000n, restored: true });
    expect(world.ruins.has(4)).toBe(false);
    expect(world.cities.get(4)).toMatchObject({ id: 4, owner: 2, start: false, adminLevel: 1 });
    expect(world.factions.get(2)?.cities.has(4)).toBe(true);
    expect(world.book.balance(escrow)).toBe(0n);
    // 세력 2(민주주의 아닐 수 있음) — 지분은 낸 값 4,000 : 6,000 비례(독재면 2가 과반)
    const regime = world.factions.get(2)?.regime;
    const holdings = holdingsOf(world.book, 4);
    expect(holdings.reduce((sum, h) => sum + h.amount, 0n)).toBe(1000n);
    if (regime === "dictatorship")
      expect(holdings).toEqual([
        { owner: 1, amount: 499n },
        { owner: 2, amount: 501n },
      ]);
    else
      expect(holdings).toEqual([
        { owner: 1, amount: 600n },
        { owner: 2, amount: 400n },
      ]);
    expect(society.summary().ruins).toMatchObject({ claimed: 1, restored: 1, left: 0, contributions: 3 });
    expect(problems(4000)).toEqual([]);
  });

  it("NPC 규칙식: 옛 주인이 정부를 짓고 날마다 넣고, 국고가 모자라면 모금을 열어 다른 NPC가 투자한다", () => {
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      restoration: {
        claimCost: 500,
        goal: 10_000,
        npcClaimAfterDays: 3,
        npcFundPm: 500,
        npcInvestPm: 200,
      },
    };
    const { world, society, problems } = setup(c);
    // 세력 3(국고 1,000)의 마지막 도시가 무너진다 → 떠도는 세력이 옛 폐허에 정부를 짓고 모금을 연다
    society.ruin(6, 1000);
    expect(world.ruins.get(6)?.claimant).toBeNull();
    // 같은 하루 끝: 정부(값 500) → 주인 50% 넣기 → 모금 열림 → 다른 NPC 투자로 목표를 채움
    society.endOfDay(DAY_MS);
    expect(world.ruins.has(6)).toBe(false);
    expect(world.cities.get(6)?.owner).toBe(3);
    const holders = holdingsOf(world.book, 6);
    expect(holders.length).toBeGreaterThan(1);
    expect(holders.some((h) => h.owner === 3)).toBe(true);
    expect(society.summary().ruins).toMatchObject({ claimed: 1, restored: 1 });
    expect(problems(DAY_MS)).toEqual([]);
    // 다음 하루 끝에 노숙 휴먼이 되살아난 도시로 든다
    society.endOfDay(2 * DAY_MS);
    expect([...world.units.values()].filter((u) => u.owner === 3).every((u) => u.city === 6)).toBe(true);
  });

  it("옛 주인이 사라지면 며칠 뒤 값을 낼 수 있는 세력 가운데 도시가 가장 적은 세력이 짓는다, 도시가 드는 세력이 사라지면 돌려준다", () => {
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      restoration: { claimCost: 100, goal: 1_000_000, npcClaimAfterDays: 2, npcFundPm: 10, npcInvestPm: 0 },
    };
    const { world, society, problems, credit } = setup(c);
    society.ruin(5, 1000);
    // 옛 주인(세력 2)을 없는 것으로 친다
    const two = world.factions.get(2);
    if (two) two.alive = false;
    society.endOfDay(DAY_MS);
    expect(world.ruins.get(5)?.claimant).toBeNull();
    society.endOfDay(3 * DAY_MS);
    // 세력 3(도시 1개)이 세력 1(도시 3개)보다 먼저
    expect(world.ruins.get(5)?.claimant).toBe(3);
    const paid = world.ruins.get(5)?.contributions.get(3) ?? 0n;
    expect(paid).toBeGreaterThan(0n);
    const before = credit(3);
    const three = world.factions.get(3);
    if (three) three.alive = false;
    society.endOfDay(4 * DAY_MS);
    // 돌려받고(세력 3), 같은 하루 끝에 남은 세력(1)이 다시 짓는다
    expect(credit(3)).toBe(before + paid);
    expect(world.ruins.get(5)).toMatchObject({ claimant: 1, joinFaction: 1 });
    expect(world.ruins.get(5)?.contributions.has(3)).toBe(false);
    expect(society.summary().ruins.released).toBe(1);
    expect(problems(4 * DAY_MS).filter((p) => p.startsWith("R"))).toEqual([]);
  });
});
