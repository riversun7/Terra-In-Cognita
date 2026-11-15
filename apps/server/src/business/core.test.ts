// 사업장 장부 코어 시험 — 기획 D-548·D-555(1501·1503·1504·1509·1514), docs/adr/2026-11-15-business-ledger.md
import { businessDebtCode, businessLocation } from "@terra/shared/businessBooks";
import { START_BUSINESS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { Row, WorldTable } from "../world/persist/tables.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { EMPTY_BUSINESS, createBusinessCore } from "./core.ts";

const DAY = 86_400_000;
const T0 = DAY * 20_000;
const OWNER = 5;
const CUSTOMER = 6;
const NATION = 9;
const SHOP = 70;
const CITY = 3;
const ASSET = "credit";

function fakeWriter() {
  const ops: { op: "upsert" | "remove"; table: WorldTable; row: Row }[] = [];
  const writer: WorldWriter = {
    upsert: (table, row) => ops.push({ op: "upsert", table, row }),
    remove: (table, row) => ops.push({ op: "remove", table, row }),
    append: (table, row) => ops.push({ op: "upsert", table, row }),
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  return { writer, ops };
}

function setup(options: { taxBp?: number; owner?: number | null; cityOwner?: number } = {}) {
  let ids = 1;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const { writer, ops } = fakeWriter();
  const owner = options.owner === undefined ? OWNER : options.owner;
  const core = createBusinessCore({
    ledger,
    writer,
    planetId: "p",
    loaded: EMPTY_BUSINESS,
    place: (buildingId) => (buildingId === SHOP ? { ownerId: owner, cityId: CITY } : undefined),
    businesses: () => [SHOP],
    tax: (cityId) =>
      cityId === CITY ? { treasuryOwner: options.cityOwner ?? NATION, bp: options.taxBp ?? 1000 } : undefined,
    rules: () => START_BUSINESS,
  });
  const grant = (ownerId: number, amount: bigint) =>
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount("issue:credit", ASSET), amount: -amount },
        { account: ledger.ownerAccount(ownerId, ASSET), amount },
      ],
    });
  const vault = () => ledger.balanceOf(OWNER, ASSET, businessLocation(SHOP));
  return { ledger, core, ops, grant, vault };
}

describe("사업장 장부 코어", () => {
  it("요금은 주인 지갑이 아니라 사업장 금고로 들고, 들어올 때 소득세를 그 도시 나라 국고에 낸다", () => {
    const { ledger, core, grant, vault } = setup({ taxBp: 1000 });
    grant(CUSTOMER, 500n);
    expect(
      core.receive({
        from: ledger.ownerAccount(CUSTOMER, ASSET),
        buildingId: SHOP,
        asset: ASSET,
        amount: 200n,
        kind: "berth_fee",
        atMs: T0,
      }),
    ).toBe(true);
    expect(vault()).toBe(180n);
    expect(ledger.balanceOf(NATION, ASSET)).toBe(20n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(0n);
  });

  it("제 시설을 써도 요금을 내고 제 금고로 든다(1514)", () => {
    const { ledger, core, grant, vault } = setup({ taxBp: 0 });
    grant(OWNER, 100n);
    core.receive({
      from: ledger.ownerAccount(OWNER, ASSET),
      buildingId: SHOP,
      asset: ASSET,
      amount: 40n,
      kind: "temple_offering",
      atMs: T0,
    });
    expect(vault()).toBe(40n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(60n);
  });

  it("도시 주인이 건물 주인이면(NPC 제 도시 건물) 세금이 없고, 주인 없는 건물은 받지 않는다", () => {
    const npc = setup({ cityOwner: OWNER, taxBp: 1000 });
    npc.grant(CUSTOMER, 100n);
    npc.core.receive({
      from: npc.ledger.ownerAccount(CUSTOMER, ASSET),
      buildingId: SHOP,
      asset: ASSET,
      amount: 100n,
      kind: "lodging_fee",
      atMs: T0,
    });
    expect(npc.vault()).toBe(100n);
    const none = setup({ owner: null });
    none.grant(CUSTOMER, 100n);
    expect(
      none.core.receive({
        from: none.ledger.ownerAccount(CUSTOMER, ASSET),
        buildingId: SHOP,
        asset: ASSET,
        amount: 10n,
        kind: "lodging_fee",
        atMs: T0,
      }),
    ).toBe(false);
  });

  it("모자라면 적자로 미리 넣고, 다음 주기에 못 갚으면 멈추고, 넣으면 갚고 다시 돈다(1504)", () => {
    const { ledger, core, grant, vault } = setup({ taxBp: 0 });
    expect(core.advance(SHOP, OWNER, ASSET, 300n, T0 + 1000)).toBe(300n);
    expect(vault()).toBe(300n);
    expect(ledger.balance(ledger.systemAccount(businessDebtCode(SHOP, ASSET), ASSET))).toBe(-300n);
    expect(core.debts(SHOP).get(ASSET)).toBe(300n);
    // 임금으로 나갔다고 치자
    ledger.post({
      kind: "labor_deposit",
      atMs: T0 + 2000,
      entries: [
        { account: core.vault(OWNER, ASSET, SHOP), amount: -300n },
        { account: ledger.systemAccount("escrow:labor:1", ASSET), amount: 300n },
      ],
    });
    // 첫 주기 끝: 아직 한 주기가 안 지났다 → 멈추지 않는다
    core.tick(T0 + DAY);
    expect(core.suspended(SHOP)).toBe(false);
    // 둘째 주기 끝: 한 주기 넘게 못 갚음 → 멈춤
    core.tick(T0 + 2 * DAY);
    expect(core.suspended(SHOP)).toBe(true);
    // 같은 주기에 다시 불러도 한 번만
    expect(core.tick(T0 + 2 * DAY + 10)).toBe(0);
    // 주인이 넣으면 바로 갚고 다시 돈다
    grant(OWNER, 500n);
    expect(core.invest(SHOP, OWNER, ASSET, 400n, T0 + 2 * DAY + 20)).toBe(true);
    expect(core.debts(SHOP).size).toBe(0);
    expect(core.suspended(SHOP)).toBe(false);
    expect(vault()).toBe(100n);
    expect(core.check()).toEqual([]);
  });

  it("자동 정산은 금고 돈을 지분 수대로 주주 지갑에 나눈다(주인 하나 = 1주)", () => {
    const { ledger, core, grant, vault } = setup({ taxBp: 0 });
    grant(CUSTOMER, 1000n);
    core.receive({
      from: ledger.ownerAccount(CUSTOMER, ASSET),
      buildingId: SHOP,
      asset: ASSET,
      amount: 700n,
      kind: "lodging_fee",
      atMs: T0 + 5,
    });
    expect(core.tick(T0 + DAY + 1)).toBe(1);
    expect(vault()).toBe(0n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(700n);
    expect(core.state(SHOP)?.settledAtMs).toBe(T0 + DAY);
  });

  it("손 정산은 금액만큼, 대주주만", () => {
    const { ledger, core, grant, vault } = setup({ taxBp: 0 });
    grant(CUSTOMER, 1000n);
    core.receive({
      from: ledger.ownerAccount(CUSTOMER, ASSET),
      buildingId: SHOP,
      asset: ASSET,
      amount: 500n,
      kind: "lodging_fee",
      atMs: T0,
    });
    expect(core.mayManage(SHOP, OWNER)).toBe(true);
    expect(core.mayManage(SHOP, CUSTOMER)).toBe(false);
    expect(core.settle(SHOP, T0 + 1, { asset: ASSET, amount: 200n }).get(ASSET)).toBe(200n);
    expect(vault()).toBe(300n);
    expect(ledger.balanceOf(OWNER, ASSET)).toBe(200n);
  });

  it("판매 값을 적고 사라진 건물이면 줄을 지운다", () => {
    const { core, ops } = setup();
    core.setPrice(SHOP, "item:wood", 12n);
    expect(core.price(SHOP, "item:wood")).toBe(12n);
    core.forget(SHOP);
    expect(core.price(SHOP, "item:wood")).toBeUndefined();
    expect(ops.some((op) => op.op === "remove" && op.table === "businessPrices")).toBe(true);
  });
});
