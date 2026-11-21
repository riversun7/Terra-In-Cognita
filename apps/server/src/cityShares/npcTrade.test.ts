// NPC 지분 주문 시험 — 기획 D-587(질문 2471 다: NPC도 같은 동시호가로 사고판다, D-323 성향 규칙식), docs/adr/2026-11-21-share-market-2.md
import { createLedgerBook, houseShareCode, shareAsset } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_CITY_SHARES, createCityShareMarket, houseHolder, ownerHolder } from "./market.ts";
import { type NpcShareRules, npcBuyOrders, placeNpcSale } from "./npcTrade.ts";

const ROUND = 1_800_000;
const T0 = ROUND * 1_000_000;
const CITY = 12;
const FOREIGN = 13;
const NPC = 3;
const PLAYER = 5;
const HOUSE = "npc:7:";
const CUR = "cur_aa";
const OTHER_CUR = "cur_bb";
const RULES: NpcShareRules = { lot: 100n, price: 10n, budgetPm: 100, traitMin: 0, traitMax: 1000 };

const currencyOf = (cityId: number) => (cityId === CITY ? CUR : cityId === FOREIGN ? OTHER_CUR : undefined);

function setup() {
  let ids = 1;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const writer: WorldWriter = {
    upsert: () => {},
    remove: () => {},
    append: () => {},
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  const market = createCityShareMarket({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_CITY_SHARES,
    currencyOf,
    rules: () => ({ roundMs: ROUND, orderMax: 10 }),
    now: () => T0,
  });
  const grant = (account: number, asset: string, amount: bigint) =>
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account, amount },
        { account: ledger.systemAccount(`issue:${asset}`, asset), amount: -amount },
      ],
    });
  return { ledger, market, grant };
}

describe("NPC 지분 주문(D-587 2471 다)", () => {
  it("팔기: 국고는 지난 체결가(없으면 설정 값)에 한 묶음, 이미 걸어 두었으면 더 걸지 않는다", () => {
    const { ledger, market, grant } = setup();
    grant(ledger.ownerAccount(NPC, shareAsset(CITY)), shareAsset(CITY), 1000n);
    const sale = { sellerId: NPC, house: undefined, cityId: CITY, total: 1000n, nowMs: T0 };
    placeNpcSale(market, sale, RULES);
    placeNpcSale(market, sale, RULES);
    expect(market.orders(CITY).map((o) => [o.holder, o.side, o.price, o.shares])).toEqual([
      [ownerHolder(NPC), "sell", 10n, 100n],
    ]);
  });

  it("팔기: 독재 지배 가문 계정은 그 도시 과반이 남는 데까지만", () => {
    const { ledger, market, grant } = setup();
    grant(ledger.systemAccount(houseShareCode(HOUSE, CITY), shareAsset(CITY)), shareAsset(CITY), 540n);
    grant(ledger.ownerAccount(PLAYER, shareAsset(CITY)), shareAsset(CITY), 460n);
    placeNpcSale(market, { sellerId: NPC, house: HOUSE, cityId: CITY, total: 1000n, nowMs: T0 }, RULES);
    // 501주를 남기면 39주만 판다
    expect(market.orders(CITY).map((o) => [o.holder, o.shares])).toEqual([[houseHolder(HOUSE), 39n]]);
  });

  it("사기: 기준가 이하로 걸린 남의 팔 주문을 그 나라 화폐 도시에서 예산 안에서 산다(상업 성향 배율), 다음 회차에 다시 고른다", () => {
    const { ledger, market, grant } = setup();
    grant(ledger.ownerAccount(PLAYER, shareAsset(CITY)), shareAsset(CITY), 300n);
    grant(ledger.ownerAccount(NPC, CUR), CUR, 20_000n);
    market.place({
      holder: ownerHolder(PLAYER),
      cityId: CITY,
      side: "sell",
      price: 20n,
      shares: 50n,
      atMs: T0,
    });
    market.place({
      holder: ownerHolder(PLAYER),
      cityId: CITY,
      side: "sell",
      price: 8n,
      shares: 30n,
      atMs: T0,
    });
    // 기준가 = 설정 값 10(체결 없음) → 8에 걸린 30주만 싸다. 예산 = 20000 × 100‰ × 상업 1000(배율 1500‰) = 3000 → 300주까지
    const nations = [{ ownerId: NPC, asset: CUR, commerce: 1000 }];
    expect(npcBuyOrders(market, nations, currencyOf, RULES, T0)).toBe(1);
    const buys = () => market.orders(CITY).filter((o) => o.side === "buy");
    expect(buys().map((o) => [o.holder, o.price, o.shares])).toEqual([[ownerHolder(NPC), 10n, 30n]]);
    expect(ledger.balanceOf(NPC, CUR)).toBe(20_000n - 300n);
    // 다시 고르면 옛 사기 주문을 거두고(돈을 돌려받고) 새로 건다
    expect(npcBuyOrders(market, nations, currencyOf, RULES, T0 + 1)).toBe(1);
    expect(buys()).toHaveLength(1);
    expect(ledger.balanceOf(NPC, CUR)).toBe(20_000n - 300n);
    // 상업 성향이 낮으면 예산이 작다(배율 500‰ → 1000 → 30주는 그대로 — 화폐가 다른 나라는 사지 않는다)
    expect(npcBuyOrders(market, [{ ownerId: 4, asset: OTHER_CUR, commerce: 0 }], currencyOf, RULES, T0)).toBe(
      0,
    );
    expect(market.check()).toEqual([]);
  });
});
