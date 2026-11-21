import { describe, expect, it } from "vitest";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { shareAsset } from "../society/shares.ts";
import { DAY_MS } from "./metrics.ts";
import { createSimClaims } from "./npcClaim.ts";
import { parseScenario } from "./scenario.ts";
import { createSimSites, gridKey, isSlot, slotXY } from "./simGrid.ts";
import { TEST_ASSET_CREDIT, createWorld } from "./world.ts";

/** 알박기 시험 계수: 휴먼 조건 낮춤, 짓는 시간 10시간(경제 없음), 반경 2 */
function rules(npc: Partial<SocietyCoefficients["npc"]> = {}): SocietyCoefficients {
  return {
    ...TEST_SOCIETY_COEFFICIENTS,
    npc: {
      ...TEST_SOCIETY_COEFFICIENTS.npc,
      claimHumansPerCity: 4,
      claimBuildHours: 10,
      claimRadius: 2,
      claimCooldownDays: 3,
      ...npc,
    },
  };
}

/** 세력 1(도시 1 = 칸 (4,4)), 세력 2(도시 2 = 칸 (7,4)) — 두 도시 사이 칸은 반경 2 안에서 같이 노린다 */
function setup(c: SocietyCoefficients = rules()) {
  const scenario = parseScenario({
    id: "claim_test",
    factions: [
      { code: "aa", count: 1, fixed: true, cities: 1, workers: 12, credit: "100000", tech: 3 },
      { code: "bb", count: 1, fixed: true, cities: 1, workers: 12, credit: "100000", tech: 3 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 7, 0);
  const sites = createSimSites();
  const events: { atMs: number; claimId: number; id: number }[] = [];
  let nextEvent = 0;
  const claims = createSimClaims({
    world,
    c,
    hooks: undefined,
    treasuryAsset: () => TEST_ASSET_CREDIT,
    sites,
    buildMs: () => c.npc.claimBuildHours * 3_600_000,
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
    credit: (id: number) => world.book.balanceOf(id, TEST_ASSET_CREDIT),
  };
}

describe("NPC 빈 2차맵 알박기(빈틈 2243 — D-572·D-574)", () => {
  it("후보 = 내 도시 둘레의 빈 칸(자리 칸 아님) → 짓기 시작에 값 소각 → 끝나면 그 칸에 가문 마을 모양 새 도시·지분 1,000주", () => {
    const { world, sites, claims, events, faction, credit } = setup();
    const a = faction(1);
    const [option] = claims.options(a, 0);
    expect(option).toBeDefined();
    if (!option) return;
    const home = slotXY(1);
    const at = { x: option.site % 1024, y: Math.floor(option.site / 1024) };
    expect(isSlot(at.x, at.y)).toBe(false);
    expect(Math.max(Math.abs(at.x - (home?.x ?? 0)), Math.abs(at.y - (home?.y ?? 0)))).toBeLessThanOrEqual(2);
    expect(option).toMatchObject({ cost: 5000n, contested: false });
    const before = credit(1);
    expect(claims.act(a, option.site, 1000)).toBe(true);
    expect(credit(1)).toBe(before - 5000n);
    expect(events).toEqual([{ atMs: 1000 + 10 * 3_600_000, claimId: 1, id: 1 }]);
    // 동시에 하나(설정 칸 npc_claim_max_active 1): 짓는 중이면 후보가 없다
    expect(claims.options(a, 2000)).toEqual([]);
    claims.complete(1, 1000 + 10 * 3_600_000);
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
    expect(claims.summary()).toMatchObject({ started: 1, founded: 1, halted: 0, lost: 0, pending: 0 });
    expect(claims.check()).toEqual([]);
  });

  it("같은 칸을 둘이 지으면 먼저 다 지은 쪽이 도시, 늦은 쪽은 멈춘다(값은 돌려주지 않음, 2194)", () => {
    const { world, claims, events, faction, credit } = setup();
    const site = gridKey(6, 3);
    expect(claims.act(faction(1), site, 0)).toBe(true);
    expect(claims.act(faction(2), site, 1000)).toBe(true);
    // 세력 2가 남이 짓는 중인 칸을 보면 contested(다른 빈 칸이 있으면 그쪽을 먼저 고른다)
    expect(events).toHaveLength(2);
    const paid = credit(2);
    claims.complete(1, 10 * 3_600_000);
    // 늦은 쪽 끝 예약은 지운다
    expect(events.filter((e) => e.claimId === 2)).toHaveLength(0);
    expect(credit(2)).toBe(paid);
    expect([...world.cities.values()].filter((city) => city.owner === 2)).toHaveLength(1);
    expect(claims.summary()).toMatchObject({ founded: 1, halted: 1, pending: 0 });
    // 도시가 선 칸은 더 이상 지을 수 없다
    expect(claims.act(faction(2), site, 20 * 3_600_000)).toBe(false);
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
    claims.complete(1, 10 * 3_600_000);
    // 쉬는 날(3일) 동안은 후보가 없다
    expect(claims.options(a, 2 * DAY_MS)).toEqual([]);
    const second = claims.options(a, 3 * DAY_MS)[0];
    expect(second).toBeDefined();
    expect(second && claims.act(a, second.site, 3 * DAY_MS)).toBe(true);
    a.alive = false;
    claims.complete(2, 4 * DAY_MS);
    expect(claims.summary()).toMatchObject({ started: 2, founded: 1, lost: 1, pending: 0 });
  });
});
