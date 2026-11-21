import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { shareAsset } from "../society/shares.ts";
import { itemAsset } from "./catalog.ts";
import { DAY_MS } from "./metrics.ts";
import { type ClaimSupply, createSimClaims } from "./npcClaim.ts";
import { parseScenario } from "./scenario.ts";
import { createSimSites, gridKey, isSlot, slotXY } from "./simGrid.ts";
import { type SimWorld, createWorld } from "./world.ts";

const HOUR = 3_600_000;
/** 가짜 행정 건물 레벨 1 재료(유저 알박기 통나무 36·돌 28 모양) */
const MATERIALS = [
  { item: "log", qty: 36 },
  { item: "stone", qty: 28 },
] as const;

/** 가짜 재료 자리: 그 세력 그 도시 창고(원장)에 재료가 다 있어야 한다. 운반 = 거리 × 1시간, 짓기 = 10시간 */
function fakeSupply(world: SimWorld): ClaimSupply {
  return {
    materials: MATERIALS,
    plan: (faction, cityId) => {
      const out = new Map<string, bigint>();
      for (const stack of MATERIALS) {
        if (world.book.balanceOf(faction.id, itemAsset(stack.item), cityId) < BigInt(stack.qty))
          return undefined;
        out.set(stack.item, BigInt(stack.qty));
      }
      return out;
    },
    value: () => 640n,
    haulMs: (_faction, _cityId, distance) => distance * HOUR,
    buildMs: () => 10 * HOUR,
    want: () => false,
  };
}

/** 그 세력 그 도시 창고에 재료를 넣는다(times 벌) */
function stock(world: SimWorld, owner: number, cityId: number, times = 1): void {
  for (const stack of MATERIALS) {
    const asset = itemAsset(stack.item);
    const amount = BigInt(stack.qty * times);
    world.book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: world.book.systemAccount(`issue:${asset}`, asset), amount: -amount },
        { account: world.book.ownerAccount(owner, asset, cityId), amount },
      ],
    });
  }
}

/** 알박기 시험 계수: 휴먼 조건 낮춤, 반경 2, 쉬는 날 3 */
function rules(npc: Partial<SocietyCoefficients["npc"]> = {}): SocietyCoefficients {
  return {
    ...TEST_SOCIETY_COEFFICIENTS,
    npc: {
      ...TEST_SOCIETY_COEFFICIENTS.npc,
      claimHumansPerCity: 4,
      claimRadius: 2,
      claimCooldownDays: 3,
      ...npc,
    },
  };
}

/** 세력 1(도시 1 = 칸 (4,4)), 세력 2(도시 2 = 칸 (7,4)) — 두 도시 사이 칸은 반경 2 안에서 같이 노린다 */
function setup(c: SocietyCoefficients = rules(), opts: { stocked?: boolean; supply?: boolean } = {}) {
  const scenario = parseScenario({
    id: "claim_test",
    factions: [
      { code: "aa", count: 1, fixed: true, cities: 1, workers: 12, credit: "100000", tech: 3 },
      { code: "bb", count: 1, fixed: true, cities: 1, workers: 12, credit: "100000", tech: 3 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 7, 0);
  // 도시 1·2 창고에 재료 두 벌
  if (opts.stocked !== false) {
    stock(world, 1, 1, 2);
    stock(world, 2, 2, 2);
  }
  const sites = createSimSites();
  const events: { atMs: number; claimId: number; id: number }[] = [];
  let nextEvent = 0;
  const claims = createSimClaims({
    world,
    c,
    hooks: undefined,
    sites,
    supply: opts.supply === false ? undefined : fakeSupply(world),
    schedule: (atMs, claimId) => {
      nextEvent += 1;
      events.push({ atMs, claimId, id: nextEvent });
      return nextEvent;
    },
    cancel: (eventId) => {
      const at = events.findIndex((e) => e.id === eventId);
      if (at >= 0) events.splice(at, 1);
    },
  });
  const faction = (id: number) => {
    const f = world.factions.get(id);
    if (!f) throw new Error(`no faction ${id}`);
    return f;
  };
  return {
    world,
    sites,
    claims,
    events,
    faction,
    logs: (id: number, cityId: number) => world.book.balanceOf(id, itemAsset("log"), cityId),
  };
}

describe("NPC 빈 2차맵 알박기(빈틈 2243 — D-572·D-574)", () => {
  it("후보 = 내 도시 둘레의 빈 칸(자리 칸 아님) → 도시 창고 재료를 빼고 운반 뒤 짓기 → 끝나면 그 칸에 가문 마을 모양 새 도시·지분 1,000주", () => {
    const { world, sites, claims, events, faction, logs } = setup();
    const a = faction(1);
    const [option] = claims.options(a, 0);
    expect(option).toBeDefined();
    if (!option) return;
    const home = slotXY(1);
    const at = { x: option.site % 1024, y: Math.floor(option.site / 1024) };
    expect(isSlot(at.x, at.y)).toBe(false);
    expect(Math.max(Math.abs(at.x - (home?.x ?? 0)), Math.abs(at.y - (home?.y ?? 0)))).toBeLessThanOrEqual(2);
    // cost = 재료 값(국고 예비금 판단)
    expect(option).toMatchObject({ cost: 640n, contested: false });
    const d = Math.max(Math.abs(at.x - (home?.x ?? 0)), Math.abs(at.y - (home?.y ?? 0)));
    expect(claims.act(a, option.site, 1000)).toBe(true);
    // 재료(한 벌)를 도시 1 창고에서 뺐다 — 국고는 그대로
    expect(logs(1, 1)).toBe(36n);
    // 끝 = 지금 + 운반(거리 × 1시간) + 짓기 10시간
    expect(events).toEqual([{ atMs: 1000 + d * HOUR + 10 * HOUR, claimId: 1, id: 1 }]);
    // 동시에 하나(설정 칸 npc_claim_max_active 1): 짓는 중이면 후보가 없다
    expect(claims.options(a, 2000)).toEqual([]);
    claims.complete(1, 1000 + d * HOUR + 10 * HOUR);
    const cityId = [...a.cities].find((id) => id !== 1) ?? -1;
    expect(world.cities.get(cityId)).toMatchObject({
      owner: 1,
      start: false,
      adminLevel: 1,
      researchLevel: 0,
      housing: TEST_SOCIETY_COEFFICIENTS.house.villageHousing,
    });
    expect(sites.xyOf(cityId)).toEqual(at);
    expect(world.book.balanceOf(1, shareAsset(cityId))).toBe(1000n);
    expect(claims.summary()).toMatchObject({
      started: 1,
      founded: 1,
      halted: 0,
      lost: 0,
      pending: 0,
      spent: { "item:log": "36", "item:stone": "28" },
    });
    expect(claims.check()).toEqual([]);
  });

  it("재료가 가장 가까운 내 도시 창고에 모자라면 후보가 아니다(사지 않는다 — 질문 2381), 경제가 없으면(재료 자리 없음) 알박기 없음", () => {
    const empty = setup(rules(), { stocked: false });
    expect(empty.claims.options(empty.faction(1), 0)).toEqual([]);
    expect(empty.claims.act(empty.faction(1), gridKey(6, 3), 0)).toBe(false);
    const noEconomy = setup(rules(), { supply: false });
    expect(noEconomy.claims.options(noEconomy.faction(1), 0)).toEqual([]);
    expect(noEconomy.claims.act(noEconomy.faction(1), gridKey(6, 3), 0)).toBe(false);
  });

  it("같은 칸을 둘이 지으면 먼저 다 지은 쪽이 도시, 늦은 쪽은 멈춘다(재료는 돌려주지 않음, 2194)", () => {
    const { world, claims, events, faction, logs } = setup();
    const site = gridKey(6, 3);
    expect(claims.act(faction(1), site, 0)).toBe(true);
    expect(claims.act(faction(2), site, 1000)).toBe(true);
    // 세력 2가 남이 짓는 중인 칸을 보면 contested(다른 빈 칸이 있으면 그쪽을 먼저 고른다)
    expect(events).toHaveLength(2);
    const paid = logs(2, 2);
    expect(paid).toBe(36n);
    claims.complete(1, 12 * HOUR);
    // 늦은 쪽 끝 예약은 지운다
    expect(events.filter((e) => e.claimId === 2)).toHaveLength(0);
    expect(logs(2, 2)).toBe(paid);
    expect([...world.cities.values()].filter((city) => city.owner === 2)).toHaveLength(1);
    expect(claims.summary()).toMatchObject({ founded: 1, halted: 1, pending: 0 });
    // 도시가 선 칸은 더 이상 지을 수 없다
    expect(claims.act(faction(2), site, 20 * HOUR)).toBe(false);
  });

  it("상한·조건: 끔(0)·쉬는 날·도시 수·휴먼·세계 도시 수, 짓는 동안 세력이 사라지면 잃는다", () => {
    const off = setup(rules({ claimMaxActive: 0 }));
    expect(off.claims.options(off.faction(1), 0)).toEqual([]);
    const poor = setup(rules({ claimHumansPerCity: 7 }));
    expect(poor.claims.options(poor.faction(1), 0)).toEqual([]);
    const full = setup(rules({ claimMaxCities: 1 }));
    expect(full.claims.options(full.faction(1), 0)).toEqual([]);
    const crowded = setup(rules({ claimWorldCities: 2 }));
    expect(crowded.claims.options(crowded.faction(1), 0)).toEqual([]);

    const { claims, faction } = setup();
    const a = faction(1);
    const first = claims.options(a, 0)[0];
    expect(first && claims.act(a, first.site, 0)).toBe(true);
    claims.complete(1, 12 * HOUR);
    // 쉬는 날(3일) 동안은 후보가 없다
    expect(claims.options(a, 2 * DAY_MS)).toEqual([]);
    const second = claims.options(a, 3 * DAY_MS)[0];
    expect(second).toBeDefined();
    expect(second && claims.act(a, second.site, 3 * DAY_MS)).toBe(true);
    a.alive = false;
    claims.complete(2, 4 * DAY_MS);
    expect(claims.summary()).toMatchObject({ started: 2, founded: 1, lost: 1, pending: 0 });
  });

  it("D-580(질문 2335 나): 사회 규칙이 있으면 다 지은 도시는 지은 NPC 가문(house)이 받는다 — 재료를 낸 도시를 넘긴다", () => {
    const base = setup();
    const calls: { parent: number; source: number }[] = [];
    const claims = createSimClaims({
      world: base.world,
      c: rules(),
      hooks: undefined,
      sites: base.sites,
      supply: fakeSupply(base.world),
      house: (parent, source, _nowMs, settle) => {
        calls.push({ parent: parent.id, source });
        const house = base.faction(2);
        const cityId = settle(house);
        house.cities.add(cityId);
        return house;
      },
      schedule: () => 1,
      cancel: () => {},
    });
    const a = base.faction(1);
    const option = claims.options(a, 0)[0];
    expect(option && claims.act(a, option.site, 0)).toBe(true);
    claims.complete(1, DAY_MS);
    expect(calls).toEqual([{ parent: 1, source: 1 }]);
    const founded = [...base.world.cities.values()].find((city) => city.id > 2);
    expect(founded?.owner).toBe(2);
    expect(base.faction(1).cities.size).toBe(1);
  });
});
