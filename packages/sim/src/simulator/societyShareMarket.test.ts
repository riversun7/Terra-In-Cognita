// NPC 지분 팔기 고리(기획 D-587 질문 2471 다 — 서버는 정부 지분 시장 팔 주문으로 낸다). 고리가 없으면 직접 양도(시뮬 판정 그대로).
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { shareAsset } from "../society/shares.ts";
import { createMetricsRecorder } from "./metrics.ts";
import type { SimHooks } from "./npcRun.ts";
import { parseScenario } from "./scenario.ts";
import { attachSociety } from "./society.ts";
import { createWorld } from "./world.ts";

function setup(hooks: SimHooks | undefined) {
  const scenario = parseScenario({
    id: "share_market_test",
    factions: [
      { code: "seller", count: 1, fixed: true, cities: 1, workers: 4, credit: "10000", tech: 2 },
      { code: "buyer", count: 1, fixed: false, cities: 1, workers: 4, credit: "100000", tech: 2 },
    ],
    npc: { decideEveryMs: 21_600_000 },
  });
  const world = createWorld(scenario, 3, 0);
  const recorder = createMetricsRecorder({ startMs: 0, sink: () => {} });
  recorder.start([...world.factions.values()].map((f) => ({ id: f.id, fixed: f.fixed, tech: f.tech })));
  const society = attachSociety(
    {
      world,
      settings: scenario.society,
      recorder,
      c: TEST_SOCIETY_COEFFICIENTS,
      hooks,
      combat: undefined,
      scheduleFaction: () => {},
      scheduleUnit: () => {},
      cancel: () => {},
    },
    0,
  );
  return { world, society };
}

describe("NPC 지분 팔기 고리(D-587 2471 다)", () => {
  it("고리가 없으면 국고가 가장 많은 세력에게 직접 양도한다(시뮬 판정 그대로)", () => {
    const { world, society } = setup(undefined);
    const seller = world.factions.get(1);
    const city = [...(seller?.cities ?? [])][0];
    if (!seller || city === undefined) throw new Error("setup");
    const before = world.book.balanceOf(seller.id, shareAsset(city));
    society.sellShares(seller, city, 1000);
    expect(world.book.balanceOf(seller.id, shareAsset(city))).toBe(
      before - BigInt(TEST_SOCIETY_COEFFICIENTS.shareSaleAmount),
    );
  });

  it("시장 고리가 맡으면 직접 양도하지 않는다(서버가 팔 주문을 건다)", () => {
    const calls: [number, string | undefined, number][] = [];
    const hooks: SimHooks = {
      treasuryAsset: () => "credit",
      beforeCityTransfer: () => {},
      factionBorn: () => {},
      factionDied: () => {},
      marketShareSale: (seller, house, cityId) => {
        calls.push([seller.id, house, cityId]);
        return true;
      },
    };
    const { world, society } = setup(hooks);
    const seller = world.factions.get(1);
    const city = [...(seller?.cities ?? [])][0];
    if (!seller || city === undefined) throw new Error("setup");
    const before = world.book.balanceOf(seller.id, shareAsset(city));
    society.sellShares(seller, city, 1000);
    expect(calls).toEqual([[seller.id, undefined, city]]);
    expect(world.book.balanceOf(seller.id, shareAsset(city))).toBe(before);
  });
});
