// 도시 매입 호가(기획 답 530 가, D-518) — NPC 거래 판단 끝에 자기 도시의 모자란 물건을 지난 값의 90%로 상시 매수 주문한다.
// 시뮬·서버가 같은 함수(placeCityBids)를 쓴다. docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"
import { describe, expect, it } from "vitest";
import { TEST_NPC_COEFFICIENTS } from "../npc/coefficients.ts";
import { createEconomy } from "./economy.ts";
import { createSimLoop } from "./loop.ts";
import type { SimEvent } from "./npcRun.ts";
import { cityTargets, onTrade } from "./npcTrade.ts";
import { TEST_CATALOG, TEST_ECONOMY_SCENARIO } from "./testEconomy.ts";
import { createWorld } from "./world.ts";

function setup() {
  const world = createWorld(TEST_ECONOMY_SCENARIO, 3, 0);
  const economy = createEconomy(world, TEST_ECONOMY_SCENARIO, TEST_CATALOG, 0);
  const loop = createSimLoop<SimEvent>({ startMs: 0, handle: () => {} });
  // 농업 나라(첫 세력): 처음 배급 식량 200이 목표(휴먼 10명 × 48시간 = 480)보다 적다
  const faction = [...world.factions.values()].find((entry) => entry.code.startsWith("agri"));
  if (!faction) throw new Error("agri faction");
  return { world, economy, loop, faction };
}

describe("도시 매입 호가(530 가)", () => {
  it("자기 도시의 모자란 배급 식량을 지난 값(없으면 시작 시세 4)의 90%로, 모자란 양만큼 매수 주문한다", () => {
    const { world, economy, loop, faction } = setup();
    const [first] = [...faction.cities].toSorted((a, b) => a - b);
    if (first === undefined) throw new Error("city");
    const target = cityTargets(economy, first).get("item:ration") ?? 0n;
    const stock = world.book.balanceOf(faction.id, "item:ration", first);
    expect(target).toBeGreaterThan(stock);
    const bids = onTrade(economy, world, loop, faction.id, 1, TEST_NPC_COEFFICIENTS);
    expect(bids).toBeGreaterThan(0);
    const bid = economy.markets.get(first)?.get("item:ration")?.best("buy");
    expect(bid).toMatchObject({ owner: faction.id, price: 3n, remaining: target - stock });
    // 남는 물건(목표보다 많은 생활용품은 없다)에는 매수 주문을 걸지 않는다
    expect(economy.markets.get(first)?.get("item:household_goods")?.best("buy")).toBeUndefined();
  });

  it("오는 중인 내 화물만큼은 사지 않고, 다음 판단이 지난 호가를 거두고 다시 건다", () => {
    const { world, economy, loop, faction } = setup();
    const [first] = [...faction.cities].toSorted((a, b) => a - b);
    if (first === undefined) throw new Error("city");
    const target = cityTargets(economy, first).get("item:ration") ?? 0n;
    const stock = world.book.balanceOf(faction.id, "item:ration", first);
    // 그 도시로 오는 배급 식량 5개(운송 중 계정은 시험에 필요 없다 — 화물 줄만 본다)
    economy.cargo.set(999, { id: 999, owner: faction.id, asset: "item:ration", from: 0, to: first, qty: 5n });
    onTrade(economy, world, loop, faction.id, 1, TEST_NPC_COEFFICIENTS);
    const market = economy.markets.get(first)?.get("item:ration");
    expect(market?.best("buy")?.remaining).toBe(target - stock - 5n);
    economy.cargo.delete(999);
    onTrade(economy, world, loop, faction.id, 2, TEST_NPC_COEFFICIENTS);
    expect(market?.best("buy")).toMatchObject({ remaining: target - stock });
  });
});
