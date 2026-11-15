// 사업장 장부 명령 시험 — 기획 D-555(1501·1502·1507·1508), docs/adr/2026-11-15-business-ledger.md
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

function setup(admin = 4) {
  let ids = 1;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const core = createBusinessCore({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place,
    businesses: () => [FARM, STORE],
    tax: () => undefined,
    rules: () => START_BUSINESS,
  });
  const commands = createBusinessCommands({
    core,
    ledger,
    unitOwner: (unitId) => (unitId === 900 ? OWNER : undefined),
    catalog: () => ({ isGoods: (id: string) => id === "wood", unitPriceOf: () => 3n }),
    rules: () => START_BUSINESS,
    place,
    isBusiness: (id) => id === FARM || id === STORE,
    isStorage: (id) => id === STORE,
    cityAdminLevel: () => admin,
    ownerOf: (userId) => (userId === "owner" ? OWNER : userId === "buyer" ? BUYER : undefined),
    fallbackAsset: ASSET,
    now: () => 1000,
    durable: () => Promise.resolve(),
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
  return { ledger, core, commands, grant };
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

  it("주인도 값을 내고 꺼낸다(창고 시설은 값 없음)", async () => {
    const { ledger, commands, grant } = setup();
    grant(OWNER, ASSET, 10n);
    expect(commands.chargeTake(OWNER, FARM, WOOD, 5n, 1)).toBe("insufficient_funds");
    expect(commands.chargeTake(OWNER, FARM, WOOD, 2n, 1)).toBeNull();
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(4n);
    expect(ledger.balanceOf(OWNER, ASSET, businessLocation(FARM))).toBe(6n);
    expect(commands.chargeTake(OWNER, STORE, WOOD, 100n, 1)).toBeNull();
    expect(commands.chargeTake(BUYER, FARM, WOOD, 1n, 1)).toBeNull();
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
});
