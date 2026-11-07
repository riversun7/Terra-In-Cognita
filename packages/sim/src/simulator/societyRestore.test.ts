import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { holdingsOf } from "../society/shares.ts";
import { DAY_MS, createMetricsRecorder } from "./metrics.ts";
import { parseScenario } from "./scenario.ts";
import { oldestHome, rehomeRuinedGoods } from "./economy.ts";
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
    goalPerHousing: 0,
    fundDays: 0,
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
    expect(society.ruins.open(4, 1, 3000)).toBe("not_owner");
    expect(society.ruins.open(4, 2, 3000)).toBe("ok");
    expect(society.ruins.open(4, 2, 3000)).toBe("already_open");
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

  it("NPC 판단 후보(484 다): 옛 주인은 바로 정부를 짓고, 내 사업에 넣고, 국고가 모자라면 모금을 열어 다른 NPC가 투자한다", () => {
    const c: SocietyCoefficients = {
      ...TEST_SOCIETY_COEFFICIENTS,
      restoration: {
        claimCost: 500,
        goal: 10_000,
        goalPerHousing: 0,
        fundDays: 0,
        npcClaimAfterDays: 3,
        npcFundPm: 500,
        npcInvestPm: 200,
      },
    };
    const { world, society, problems } = setup(c);
    const faction = (id: number) => {
      const f = world.factions.get(id);
      if (!f) throw new Error(`faction ${id}`);
      return f;
    };
    // 세력 3(국고 1,000)의 마지막 도시가 무너진다 → 옛 주인은 바로 정부 짓기 후보, 다른 세력은 며칠 뒤
    society.ruin(6, 1000);
    expect(world.ruins.get(6)?.claimant).toBeNull();
    expect(society.ruins.npcOptions(faction(3), 2000)).toEqual([
      { ruin: 6, mode: "claim", cost: 500n, former: true },
    ]);
    expect(society.ruins.npcOptions(faction(2), 2000)).toEqual([]);
    expect(society.ruins.npcOptions(faction(2), 1000 + 3 * DAY_MS)).toEqual([
      { ruin: 6, mode: "claim", cost: 500n, former: false },
    ]);
    // 정부(값 500) → 국고(500)가 목표보다 적어 모금이 열린다 → 주인 넣기(국고 50%) 후보
    expect(society.ruins.npcAct(faction(3), 6, "claim", 2000)).toBe(true);
    expect(world.ruins.get(6)).toMatchObject({ claimant: 3, joinFaction: 3, open: true });
    expect(society.ruins.npcOptions(faction(3), 3000)).toEqual([
      { ruin: 6, mode: "fund", cost: 250n, former: false },
    ]);
    expect(society.ruins.npcAct(faction(3), 6, "fund", 3000)).toBe(true);
    // 열린 모금: 다른 세력은 국고 × 200‰ × 상업 ÷ 1000만큼 투자 후보(상업 성향이 0이면 후보 없음)
    for (let i = 0; i < 200 && world.ruins.has(6); i++) {
      for (const id of [1, 2]) {
        const invest = society.ruins.npcOptions(faction(id), 4000 + i).find((v) => v.mode === "invest");
        if (invest) society.ruins.npcAct(faction(id), 6, "invest", 4000 + i);
      }
    }
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

  it("목표 = 옛 주거 × 주거 1당 값(482 나), 모금 기한이 지나면 하루 끝에 돌려주고 주인 없음(485 다), 도시가 드는 세력이 사라져도 돌려준다", () => {
    const c: SocietyCoefficients = {
      ...MANUAL,
      restoration: { ...MANUAL.restoration, goalPerHousing: 700, fundDays: 2 },
    };
    const { world, society, problems, credit } = setup(c);
    const housing = world.cities.get(5)?.housing ?? 0;
    expect(housing).toBeGreaterThan(0);
    society.ruin(5, 1000);
    expect(society.ruins.claim(5, 3, 3, 1000, { pay: false })).toBe("ok");
    expect(world.ruins.get(5)?.goal).toBe(BigInt(housing) * 700n);
    expect(society.ruins.deadlineOf(5)).toBe(1000 + 2 * DAY_MS);
    const before = credit(3);
    expect(society.ruins.fund(5, 3, 300n, 2000).accepted).toBe(300n);
    // 기한 전 하루 끝은 그대로, 기한이 지나면 넣기·열기를 받지 않고 하루 끝에 돌려준다
    society.endOfDay(DAY_MS);
    expect(world.ruins.get(5)?.claimant).toBe(3);
    expect(society.ruins.fund(5, 3, 1n, 1000 + 2 * DAY_MS).result).toBe("expired");
    expect(society.ruins.open(5, 3, 1000 + 2 * DAY_MS)).toBe("expired");
    society.endOfDay(3 * DAY_MS);
    expect(world.ruins.get(5)).toMatchObject({ claimant: null, joinFaction: null, goal: 0n, deadlineMs: 0 });
    expect(credit(3)).toBe(before);
    expect(society.summary().ruins).toMatchObject({ expired: 1, released: 0 });
    // 다시 짓는 쪽은 새 기한을 받는다. 도시가 드는 세력이 사라지면 돌려준다
    expect(society.ruins.claim(5, 1, 1, 4 * DAY_MS, { pay: false })).toBe("ok");
    expect(society.ruins.fund(5, 1, 500n, 4 * DAY_MS).accepted).toBe(500n);
    const one = world.factions.get(1);
    if (one) one.alive = false;
    society.endOfDay(5 * DAY_MS);
    expect(world.ruins.get(5)?.claimant).toBeNull();
    expect(society.summary().ruins).toMatchObject({ expired: 1, released: 1 });
    expect(problems(5 * DAY_MS).filter((p) => p.startsWith("R"))).toEqual([]);
  });

  it("정부 건물(480 다·487 다·489 다): 다 지어야 모금을 열고 넣는다, 0%·사라지면 다시 지은 쪽이 주인(낸 값은 사업에 남음), 행정 레벨 = 건물 레벨", () => {
    const { world, society, problems } = setup(MANUAL);
    const status = new Map<number, { state: "building" | "up" | "down"; level: number }>();
    society.ruins.attachGovernment((id) => status.get(id) ?? { state: "down", level: 0 });
    society.ruin(4, 1000);
    // 유저(소유 주체 77)가 행정 건물(건물 900)을 짓기 시작하면 자리를 잡는다 — 짓는 동안은 열기·넣기 not_built
    status.set(900, { state: "building", level: 0 });
    expect(society.ruins.claim(4, 77, 2, 2000, { pay: false, building: 900 })).toBe("ok");
    expect(society.ruins.claimable(4)).toBe(false);
    expect(society.ruins.ready(4)).toBe(false);
    expect(society.ruins.claim(4, 1, 1, 2000, { pay: true })).toBe("claimed");
    expect(society.ruins.open(4, 77, 2500)).toBe("not_built");
    expect(society.ruins.fund(4, 2, 100n, 2500).result).toBe("not_built");
    // 다 지음 → 열고 넣는다
    status.set(900, { state: "up", level: 1 });
    expect(society.ruins.open(4, 77, 3000)).toBe("ok");
    expect(society.ruins.fund(4, 2, 4000n, 3000).accepted).toBe(4000n);
    // 0%가 되면 넣기는 막히고 누구나 다시 지을 수 있다 → 다시 지은 쪽(세력 1, 건물 없이 값)이 주인, 낸 값·목표는 남는다
    status.set(900, { state: "down", level: 1 });
    expect(society.ruins.claimable(4)).toBe(true);
    expect(society.ruins.fund(4, 2, 100n, 3500).result).toBe("not_built");
    expect(society.ruins.claim(4, 1, 1, 4000, { pay: true })).toBe("ok");
    expect(world.ruins.get(4)).toMatchObject({ claimant: 1, joinFaction: 1, building: null, goal: 10_000n });
    expect(world.ruins.get(4)?.contributions.get(2)).toBe(4000n);
    expect(society.summary().ruins).toMatchObject({ claimed: 1, reclaimed: 1 });
    // 다시 지은 NPC 주인(건물 없음 = 다 지은 것)이 채우면 되살아난다(행정 레벨 = NPC 정부 Lv1)
    expect(society.ruins.fund(4, 1, 6000n, 5000)).toMatchObject({ result: "ok", restored: true });
    expect(world.cities.get(4)).toMatchObject({ owner: 1, adminLevel: 1 });
    expect(problems(5000)).toEqual([]);
  });

  it("행정 레벨 = 정부 건물 레벨(489 다): Lv3 정부 건물로 되살린 도시는 행정 Lv3", () => {
    const { world, society, problems } = setup(MANUAL);
    society.ruins.attachGovernment(() => ({ state: "up", level: 3 }));
    society.ruin(5, 1000);
    expect(society.ruins.claim(5, 2, 2, 2000, { pay: false, building: 950 })).toBe("ok");
    expect(society.ruins.fund(5, 2, 10_000n, 3000)).toMatchObject({ result: "ok", restored: true });
    expect(world.cities.get(5)).toMatchObject({ owner: 2, adminLevel: 3 });
    expect(problems(3000)).toEqual([]);
  });

  it("약탈하고 폐허로 둠(486 나): 점령하지 않고 도시가 폐허가 된다(금고 몫을 가져감, 옛 주인 = 진 세력)", () => {
    const { world, society, problems, credit } = setup(MANUAL);
    const two = world.factions.get(2);
    const three = world.factions.get(3);
    if (!two || !three) throw new Error("factions");
    const before = credit(3);
    society.occupy(three, two, 5, { treatment: "raze", shares: "delist" }, 2000);
    expect(world.cities.has(5)).toBe(false);
    expect(world.ruins.get(5)).toMatchObject({ formerOwner: 2, claimant: null });
    expect(two.cities.has(5)).toBe(false);
    expect(three.cities.has(5)).toBe(false);
    expect(credit(3)).toBeGreaterThan(before);
    expect(three.wars.has(2)).toBe(true);
    expect(society.summary().occupations.razed).toBe(1);
    expect(problems(2000)).toEqual([]);
  });

  it("폐허가 된 도시 창고 물건은 소각하지 않고 주인마다 다른 도시 창고로(535): 세력은 가장 오래된 다른 도시, 갈 곳이 없으면 자리 없음", () => {
    const { world } = setup(MANUAL);
    const asset = "item:plank";
    const source = world.book.systemAccount(`source:${asset}`, asset);
    const give = (owner: number, qty: bigint) =>
      world.book.post({
        kind: "endow",
        atMs: 0,
        entries: [
          { account: source, amount: -qty },
          { account: world.book.ownerAccount(owner, asset, 5), amount: qty },
        ],
      });
    // 도시 5(세력 2) 창고: 세력 2 물건 7, 세력 3 물건 4, 세력이 아닌 주체(유저 자리) 77 물건 9
    give(2, 7n);
    give(3, 4n);
    give(77, 9n);
    expect(rehomeRuinedGoods(world, 5, 1000, oldestHome(world))).toBe(3);
    expect(world.book.balanceOf(2, asset, 5)).toBe(0n);
    expect(world.book.balanceOf(2, asset, 4)).toBe(7n);
    expect(world.book.balanceOf(3, asset, 6)).toBe(4n);
    expect(world.book.balanceOf(77, asset, null)).toBe(9n);
    // 갈 곳 고리가 폐허가 될 도시를 고르면 자리 없음으로 친다
    give(2, 1n);
    rehomeRuinedGoods(world, 5, 2000, () => 5);
    expect(world.book.balanceOf(2, asset, null)).toBe(1n);
  });
});
