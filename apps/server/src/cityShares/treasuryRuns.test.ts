// 국고 지분 안건 집행 시험(treasuryRuns.ts — 줄기 gov-fix-4, 사용자 결정 D-591 2526 "돈이없으면 못사는거고 취득량만 정하는거다. 통과된안건은 주-월 단위 기간이 있고
// 실행되지못하면 취소할지 계속할지 재투표"). 원장·시장은 진짜, DB·의결은 가짜(메모리)로 본다.
import { createLedgerBook, shareAsset } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_CITY_SHARES, createCityShareMarket, ownerHolder } from "./market.ts";
import { type TreasuryGovernance, createTreasuryRuns, topUpShares } from "./treasuryRuns.ts";

const ROUND = 1_800_000;
const T0 = ROUND * 1_000_000;
const CITY = 12;
const TREASURY = 3;
const NATION_ROW = 30;
const SELLER = 5;
const CUR = "cur_aa";
const DAY = 86_400_000;

function setup(regime: "democracy" | "dictatorship" = "democracy") {
  let ids = 1;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const writer: WorldWriter = {
    upsert: () => undefined,
    remove: () => undefined,
    append: () => undefined,
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  const table = new Map<number, Record<string, unknown>>();
  const agendas: { kind: string; payload: object }[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      if (text.startsWith("insert into treasury_share_runs")) {
        const [agendaId, , , , , , done, , , state, revote] = values;
        table.set(Number(agendaId), { done, state, revote });
      }
      return { rows: [] };
    },
  };
  const governance: TreasuryGovernance = {
    port: {
      nation: (row: number) =>
        row === NATION_ROW ? { rowId: NATION_ROW, ownerId: TREASURY, regime } : undefined,
    },
    store: {
      insertAgenda: async (input) => {
        agendas.push({ kind: input.kind, payload: input.payload });
        return { id: 500 + agendas.length };
      },
    },
    rules: () => ({ shareExecMs: 14 * DAY, periodOf: () => DAY }),
  };
  // 시장 고리가 아래에서 만드는 집행을 부른다
  const ref: { runs?: ReturnType<typeof createTreasuryRuns> } = {};
  const market = createCityShareMarket({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_CITY_SHARES,
    currencyOf: (cityId) => (cityId === CITY ? CUR : undefined),
    rules: () => ({ roundMs: ROUND, orderMax: 3 }),
    now: () => T0,
    onFill: (order, filled) => ref.runs?.filled(order, filled),
  });
  const runs = createTreasuryRuns({
    pool: () => pool,
    governance: () => governance,
    currencyOf: (cityId) => (cityId === CITY ? CUR : undefined),
    sellCap: async () => undefined,
  });
  ref.runs = runs;
  const grant = (account: number, asset: string, amount: bigint) =>
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account, amount },
        { account: ledger.systemAccount(`issue:${asset}`, asset), amount: -amount },
      ],
    });
  const share = shareAsset(CITY);
  grant(ledger.ownerAccount(SELLER, share), share, 1_000n);
  return { ledger, market, runs, table, agendas, grant };
}

const none = () => new Map<string, bigint>();

describe("국고 지분 안건 집행(D-591 2526)", () => {
  it("이번에 걸 주 = 남은 수량 − 걸린 주, 돈·주가 있는 데까지", () => {
    const run = { target: 100n, done: 30n, side: "buy" as const, price: 10n };
    expect(topUpShares(run, 20n, 1_000n)).toBe(50n);
    expect(topUpShares(run, 20n, 7n)).toBe(7n);
    expect(topUpShares(run, 70n, 1_000n)).toBe(0n);
    expect(topUpShares(run, 0n, 0n)).toBe(0n);
  });

  it("돈이 없으면 사지 않다가, 돈이 생기면 회차마다 모자란 만큼 사고, 다 사면 끝난다", async () => {
    const { ledger, market, runs, table, grant } = setup();
    await runs.start(
      market,
      { agendaId: 9, nationId: NATION_ROW, side: "buy", cityId: CITY, target: 100n, price: 10n },
      T0,
    );
    // 국고 돈 0 → 주문 없음(수량은 그대로 — 줄이지 않는다)
    expect(market.orders(CITY).length).toBe(0);
    expect(runs.active()[0]?.target).toBe(100n);
    // 돈 600 → 60주만 건다
    grant(ledger.ownerAccount(TREASURY, CUR), CUR, 600n);
    await runs.beforeRound(market, T0 + ROUND);
    expect(market.orders(CITY).map((order) => order.shares)).toEqual([60n]);
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 60n,
      atMs: T0,
    });
    market.run(T0 + ROUND, none);
    await runs.afterRound();
    expect(runs.active()[0]?.done).toBe(60n);
    // 돈이 더 생기면 남은 40주를 건다
    grant(ledger.ownerAccount(TREASURY, CUR), CUR, 1_000n);
    await runs.beforeRound(market, T0 + 2 * ROUND);
    expect(
      market
        .orders(CITY)
        .filter((order) => order.side === "buy")
        .map((order) => order.shares),
    ).toEqual([40n]);
    market.place({
      holder: ownerHolder(SELLER),
      cityId: CITY,
      side: "sell",
      price: 10n,
      shares: 40n,
      atMs: T0,
    });
    market.run(T0 + 2 * ROUND, none);
    await runs.afterRound();
    expect(runs.active()).toEqual([]);
    expect(table.get(9)).toMatchObject({ state: "filled", done: "100" });
  });

  it("기간이 끝나도 남으면 걸린 주문을 거두고 남은 수량으로 재투표를 연다(독재는 열지 않는다)", async () => {
    const { ledger, market, runs, table, agendas, grant } = setup();
    grant(ledger.ownerAccount(TREASURY, CUR), CUR, 300n);
    await runs.start(
      market,
      { agendaId: 9, nationId: NATION_ROW, side: "buy", cityId: CITY, target: 100n, price: 10n },
      T0,
    );
    expect(market.orders(CITY).map((order) => order.shares)).toEqual([30n]);
    await runs.beforeRound(market, T0 + 15 * DAY);
    expect(market.orders(CITY)).toEqual([]);
    // 묶은 돈은 돌려받았다
    expect(ledger.balanceOf(TREASURY, CUR)).toBe(300n);
    expect(agendas).toEqual([
      { kind: "treasury_share_buy", payload: { cityId: CITY, shares: "100", maxPrice: "10", renewOf: 9 } },
    ]);
    expect(table.get(9)).toMatchObject({ state: "expired", revote: 501 });
    const dictator = setup("dictatorship");
    await dictator.runs.start(
      dictator.market,
      { agendaId: 9, nationId: NATION_ROW, side: "buy", cityId: CITY, target: 100n, price: 10n },
      T0,
    );
    await dictator.runs.beforeRound(dictator.market, T0 + 15 * DAY);
    expect(dictator.agendas).toEqual([]);
    expect(dictator.table.get(9)).toMatchObject({ state: "expired", revote: null });
  });

  it("지도자가 국고 주문을 거두면 그 집행도 끝나 다시 걸지 않는다", async () => {
    const { ledger, market, runs, grant } = setup();
    grant(ledger.ownerAccount(TREASURY, CUR), CUR, 300n);
    await runs.start(
      market,
      { agendaId: 9, nationId: NATION_ROW, side: "buy", cityId: CITY, target: 100n, price: 10n },
      T0,
    );
    const order = market.orders(CITY)[0];
    if (!order) throw new Error("order");
    market.cancel([ownerHolder(TREASURY)], order.id, T0);
    await runs.cancelled(order.agendaId);
    await runs.beforeRound(market, T0 + ROUND);
    expect(market.orders(CITY)).toEqual([]);
    expect(runs.active()).toEqual([]);
  });
});
