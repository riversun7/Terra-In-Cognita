// 사업장 장부 명령 시험 — 기획 D-555(1501·1502·1507·1508)·D-569(1781 판매만·1784 실제 운반), docs/adr/2026-11-15-business-ledger.md
import { businessLocation, unitPurseLocation } from "@terra/shared/businessBooks";
import { cityLocation } from "@terra/shared/goodsPlaces";
import { START_BUSINESS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { WorldWriter } from "../world/persist/writer.ts";
import { createBusinessCommands } from "./commands.ts";
import { EMPTY_BUSINESS, createBusinessCore } from "./core.ts";

const OWNER = 5;
const BUYER = 6;
const FARM = 70;
const STORE = 71;
const CITY = 3;
const ASSET = "credit";
const WOOD = "item:wood";

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

const place = (buildingId: number) =>
  buildingId === FARM || buildingId === STORE ? { ownerId: OWNER, cityId: CITY } : undefined;

type Carry = (
  seller: number,
  buyer: number,
  buildingId: number,
  asset: string,
  qty: bigint,
  atMs: number,
  via?: number | "auto" | "own",
  keep?: { readonly asset: string; readonly amount: bigint },
) => string | null | undefined;

function setup(
  admin = 4,
  carry?: Carry,
  opts: {
    holders?: () => { ownerId: number; shares: bigint }[];
    boatTypes?: (buildingId: number) => readonly string[];
    fxShop?: (buildingId: number) => boolean;
    goodsExchange?: (buildingId: number) => boolean;
    haulShop?: (buildingId: number) => boolean;
  } = {},
) {
  let ids = 1;
  const kinds: string[] = [];
  const ledger = createLedgerBook({
    nextAccountId: () => ids++,
    nextTxId: () => ids++,
    hooks: { posted: (_id, tx) => kinds.push(tx.kind) },
  });
  const core = createBusinessCore({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place,
    businesses: () => [FARM, STORE],
    tax: () => undefined,
    rules: () => START_BUSINESS,
    holders: opts.holders,
  });
  const commands = createBusinessCommands({
    core,
    ledger,
    unitOwner: (unitId) => (unitId === 900 ? OWNER : undefined),
    catalog: () => ({ isGoods: (id: string) => id === "wood", unitPriceOf: () => 3n }),
    rules: () => START_BUSINESS,
    place,
    isBusiness: (id) => id === FARM || id === STORE,
    carry,
    cityAdminLevel: () => admin,
    ownerOf: (userId) => (userId === "owner" ? OWNER : userId === "buyer" ? BUYER : undefined),
    fallbackAsset: ASSET,
    now: () => 1000,
    durable: () => Promise.resolve(),
    boatTypes: opts.boatTypes,
    fxShop: opts.fxShop,
    goodsExchange: opts.goodsExchange,
    haulShop: opts.haulShop,
  });
  const grant = (ownerId: number, asset: string, amount: bigint, location: number | null = null) =>
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount(`issue:${asset}`, asset), amount: -amount },
        { account: ledger.ownerAccount(ownerId, asset, location), amount },
      ],
    });
  return { ledger, core, commands, grant, kinds };
}

describe("사업장 장부 명령", () => {
  it("남은 최소 묶음부터 사고(B2B), 돈은 사업장 금고로, 물건은 산 사람 도시 창고로", async () => {
    const { ledger, commands, grant } = setup(4);
    grant(OWNER, WOOD, 50n, businessLocation(FARM));
    grant(BUYER, ASSET, 1000n);
    expect(await commands.run("buyer", { kind: "buy", buildingId: FARM, item: WOOD, qty: 2 })).toEqual({
      ok: false,
      code: "below_lot",
    });
    expect(await commands.run("buyer", { kind: "buy", buildingId: FARM, item: WOOD, qty: 10 })).toEqual({
      ok: true,
      paid: 30n,
    });
    expect(ledger.balanceOf(OWNER, ASSET, businessLocation(FARM))).toBe(30n);
    expect(ledger.balanceOf(BUYER, WOOD, cityLocation(CITY))).toBe(10n);
    expect(ledger.balanceOf(OWNER, WOOD, businessLocation(FARM))).toBe(40n);
  });

  it("저급 도시는 낱개(소매)로도 팔고, 값 0이면 남에게 팔지 않는다", async () => {
    const { commands, grant } = setup(1);
    grant(OWNER, WOOD, 50n, businessLocation(FARM));
    grant(BUYER, ASSET, 1000n);
    expect((await commands.run("buyer", { kind: "buy", buildingId: FARM, item: WOOD, qty: 1 })).ok).toBe(
      true,
    );
    expect(await commands.run("buyer", { kind: "price", buildingId: FARM, item: WOOD, price: 0n })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect((await commands.run("owner", { kind: "price", buildingId: FARM, item: WOOD, price: 0n })).ok).toBe(
      true,
    );
    expect(await commands.run("buyer", { kind: "buy", buildingId: FARM, item: WOOD, qty: 1 })).toEqual({
      ok: false,
      code: "not_for_sale",
    });
  });

  it("주인도 누구나와 같은 판매(D-569 1781): 같은 판매가·최소 묶음, 값 0이면 주인도 못 사고, 돈은 매출로 금고에", async () => {
    const { ledger, commands, grant, kinds } = setup();
    grant(OWNER, ASSET, 100n);
    grant(OWNER, WOOD, 50n, businessLocation(FARM));
    expect((await commands.run("owner", { kind: "price", buildingId: FARM, item: WOOD, price: 7n })).ok).toBe(
      true,
    );
    // 주인도 최소 묶음(10)부터
    expect(await commands.run("owner", { kind: "buy", buildingId: FARM, item: WOOD, qty: 1 })).toEqual({
      ok: false,
      code: "below_lot",
    });
    expect(await commands.run("owner", { kind: "buy", buildingId: FARM, item: WOOD, qty: 10 })).toEqual({
      ok: true,
      paid: 70n,
    });
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(30n);
    expect(ledger.balanceOf(OWNER, ASSET, businessLocation(FARM))).toBe(70n);
    expect(ledger.balanceOf(OWNER, WOOD, cityLocation(CITY))).toBe(10n);
    // 매출 거래(business_sale)로 금고에 든다(손익계산서 판매 칸)
    expect(kinds).toContain("business_sale");
    expect(kinds).toContain("business_sale_goods");
    // 값 0 = 아무에게도 안 팖 — 주인도 못 산다(값을 먼저 정한다)
    expect((await commands.run("owner", { kind: "price", buildingId: FARM, item: WOOD, price: 0n })).ok).toBe(
      true,
    );
    expect(await commands.run("owner", { kind: "buy", buildingId: FARM, item: WOOD, qty: 10 })).toEqual({
      ok: false,
      code: "not_for_sale",
    });
  });

  it("산 물건은 운반꾼이 나른다(D-569 1784): 운반꾼이 없으면 no_carrier — 돈·물건 그대로", async () => {
    const calls: string[] = [];
    let answer: string | null | undefined = "unknown_unit";
    const { ledger, commands, grant } = setup(4, (seller, buyer, buildingId, asset, qty) => {
      calls.push(`${seller}>${buyer}:${buildingId}:${asset}:${qty}`);
      return answer;
    });
    grant(OWNER, WOOD, 50n, businessLocation(FARM));
    grant(BUYER, ASSET, 1000n);
    expect(await commands.run("buyer", { kind: "buy", buildingId: FARM, item: WOOD, qty: 10 })).toEqual({
      ok: false,
      code: "no_carrier",
    });
    expect(ledger.balanceOf(BUYER, ASSET)).toBe(1000n);
    expect(ledger.balanceOf(OWNER, WOOD, businessLocation(FARM))).toBe(50n);
    // 운반꾼이 실었으면(고리가 물건을 옮김) 돈만 낸다 — 도시 창고에는 닿을 때 든다
    answer = null;
    expect(await commands.run("buyer", { kind: "buy", buildingId: FARM, item: WOOD, qty: 10 })).toEqual({
      ok: true,
      paid: 30n,
    });
    expect(ledger.balanceOf(BUYER, WOOD, cityLocation(CITY))).toBe(0n);
    expect(ledger.balanceOf(OWNER, ASSET, businessLocation(FARM))).toBe(30n);
    expect(calls).toEqual([`${OWNER}>${BUYER}:${FARM}:${WOOD}:10`, `${OWNER}>${BUYER}:${FARM}:${WOOD}:10`]);
  });

  it("산 물건 운반을 물류센터에 맡기기(기획 대조 2273): via·사기 값(keep)을 넘기고 물류센터 실패는 no_carrier·insufficient_funds", async () => {
    const seen: unknown[] = [];
    let answer: string | null | undefined = "no_shop_worker";
    const { commands, grant } = setup(4, (_seller, _buyer, _building, _asset, _qty, _atMs, via, keep) => {
      seen.push([via, keep]);
      return answer;
    });
    grant(OWNER, WOOD, 50n, businessLocation(FARM));
    grant(BUYER, ASSET, 1000n);
    const buy = { kind: "buy", buildingId: FARM, item: WOOD, qty: 10, via: 44 } as const;
    expect(await commands.run("buyer", buy)).toEqual({ ok: false, code: "no_carrier" });
    answer = "service_closed";
    expect(await commands.run("buyer", buy)).toEqual({ ok: false, code: "no_carrier" });
    answer = "insufficient_funds";
    expect(await commands.run("buyer", buy)).toEqual({ ok: false, code: "insufficient_funds" });
    answer = null;
    expect(await commands.run("buyer", { ...buy, via: "own" })).toEqual({ ok: true, paid: 30n });
    expect(seen[0]).toEqual([44, { asset: ASSET, amount: 30n }]);
    expect(seen.at(-1)).toEqual(["own", { asset: ASSET, amount: 30n }]);
  });

  it("자동 옮김의 주인 구매(sellTo): 지갑이 되는 만큼·최소 묶음, 값 0이면 0", async () => {
    const { ledger, commands, grant } = setup();
    grant(OWNER, ASSET, 40n);
    grant(OWNER, WOOD, 50n, businessLocation(FARM));
    // 값 3 × 지갑 40 → 13개까지
    expect(commands.sellTo(OWNER, FARM, WOOD, 50n, 1)).toBe(13n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(1n);
    expect(ledger.balanceOf(OWNER, ASSET, businessLocation(FARM))).toBe(39n);
    // 지갑 1 → 최소 묶음 아래라 0
    expect(commands.sellTo(OWNER, FARM, WOOD, 50n, 1)).toBe(0n);
    await commands.run("owner", { kind: "price", buildingId: FARM, item: WOOD, price: 0n });
    grant(OWNER, ASSET, 1000n);
    expect(commands.sellTo(OWNER, FARM, WOOD, 10n, 1)).toBe(0n);
  });

  it("정산·넣기는 주인만, 유닛 선물은 내 유닛 지갑으로", async () => {
    const { ledger, commands, grant } = setup();
    grant(OWNER, ASSET, 100n);
    expect(await commands.run("owner", { kind: "settle", buildingId: FARM })).toEqual({
      ok: false,
      code: "nothing_to_settle",
    });
    expect(
      await commands.run("owner", { kind: "invest", buildingId: FARM, asset: ASSET, amount: 40n }),
    ).toEqual({
      ok: true,
      paid: 40n,
    });
    expect(await commands.run("buyer", { kind: "settle", buildingId: FARM })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await commands.run("owner", { kind: "settle", buildingId: FARM })).toEqual({
      ok: true,
      paid: 40n,
    });
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(100n);
    expect(await commands.run("owner", { kind: "gift", unitId: 900, amount: 25n })).toEqual({
      ok: true,
      paid: 25n,
    });
    expect(ledger.balanceOf(OWNER, ASSET, unitPurseLocation(900))).toBe(25n);
    expect(await commands.run("buyer", { kind: "gift", unitId: 900, amount: 1n })).toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it("정산·넣기·지급준비율은 주인 또는 대주주(2047): 지분을 팔아 대주주가 아닌 건물 주인도, 값 정하기는 대주주", async () => {
    const { commands, grant } = setup(4, undefined, {
      holders: () => [
        { ownerId: BUYER, shares: 900n },
        { ownerId: OWNER, shares: 100n },
      ],
    });
    grant(OWNER, ASSET, 100n);
    expect(
      await commands.run("owner", { kind: "invest", buildingId: FARM, asset: ASSET, amount: 40n }),
    ).toEqual({ ok: true, paid: 40n });
    expect(await commands.run("owner", { kind: "reserve", buildingId: FARM, reservePm: 0 })).toEqual({
      ok: true,
    });
    expect(await commands.run("owner", { kind: "settle", buildingId: FARM })).toMatchObject({ ok: true });
    expect(
      await commands.run("owner", { kind: "price", buildingId: FARM, item: "item:wood", price: 5n }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await commands.run("buyer", { kind: "price", buildingId: FARM, item: "item:wood", price: 5n }),
    ).toEqual({ ok: true });
  });

  it("배 판매가(2057·2072): 그 배 종류를 만드는 조선소만 boat:<종류> 값을 정한다", async () => {
    const { core, commands } = setup(4, undefined, {
      boatTypes: (buildingId) => (buildingId === STORE ? ["rowboat"] : []),
    });
    expect(
      await commands.run("owner", { kind: "price", buildingId: FARM, item: "boat:rowboat", price: 500n }),
    ).toEqual({ ok: false, code: "not_goods" });
    expect(
      await commands.run("owner", { kind: "price", buildingId: STORE, item: "boat:cargo_boat", price: 500n }),
    ).toEqual({ ok: false, code: "not_goods" });
    expect(
      await commands.run("owner", { kind: "price", buildingId: STORE, item: "boat:rowboat", price: 500n }),
    ).toEqual({ ok: true });
    expect(core.price(STORE, "boat:rowboat")).toBe(500n);
  });

  it("물자 거래소 이용료 요율(D-574 질문 2085): 물자 거래소만 service:exchange_fee를, 아래·위 끝(설정 칸) 안에서 정한다", async () => {
    const { core, commands } = setup(4, undefined, { goodsExchange: (buildingId) => buildingId === STORE });
    const price = (buildingId: number, value: bigint) =>
      commands.run("owner", { kind: "price", buildingId, item: "service:exchange_fee", price: value });
    expect(await price(FARM, 30n)).toEqual({ ok: false, code: "not_goods" });
    expect(await price(STORE, BigInt(START_BUSINESS.exchangeFeeMaxBp ?? 0) + 1n)).toEqual({
      ok: false,
      code: "invalid_amount",
    });
    expect(await price(STORE, 30n)).toEqual({ ok: true });
    expect(core.price(STORE, "service:exchange_fee")).toBe(30n);
    // 외환 거래소 칸은 물자 거래소에 쓰지 못한다
    expect(
      await commands.run("owner", { kind: "price", buildingId: STORE, item: "service:fx_fee", price: 30n }),
    ).toEqual({ ok: false, code: "not_goods" });
  });

  it("환전 이용료 요율(질문 2086): 외환 거래소만 service:fx_fee를, 위 끝(만분율)까지 정한다", async () => {
    const { core, commands } = setup(4, undefined, { fxShop: (buildingId) => buildingId === STORE });
    const max = BigInt(START_BUSINESS.exchangeFxFeeMaxBp);
    expect(
      await commands.run("owner", { kind: "price", buildingId: FARM, item: "service:fx_fee", price: 30n }),
    ).toEqual({ ok: false, code: "not_goods" });
    expect(
      await commands.run("owner", {
        kind: "price",
        buildingId: STORE,
        item: "service:fx_fee",
        price: max + 1n,
      }),
    ).toEqual({ ok: false, code: "invalid_amount" });
    expect(
      await commands.run("owner", { kind: "price", buildingId: STORE, item: "service:fx_fee", price: 30n }),
    ).toEqual({ ok: true });
    expect(core.price(STORE, "service:fx_fee")).toBe(30n);
  });

  it("운반 대행 요금(기획 D-576): 물류센터만 service:haul 한 단위 값을 정한다(0 = 받지 않음)", async () => {
    const { core, commands } = setup(4, undefined, { haulShop: (buildingId) => buildingId === STORE });
    expect(
      await commands.run("owner", { kind: "price", buildingId: FARM, item: "service:haul", price: 30n }),
    ).toEqual({ ok: false, code: "not_goods" });
    expect(
      await commands.run("owner", { kind: "price", buildingId: STORE, item: "service:haul", price: -1n }),
    ).toEqual({ ok: false, code: "invalid_amount" });
    expect(
      await commands.run("owner", { kind: "price", buildingId: STORE, item: "service:haul", price: 0n }),
    ).toEqual({ ok: true });
    expect(core.price(STORE, "service:haul")).toBe(0n);
  });
});
