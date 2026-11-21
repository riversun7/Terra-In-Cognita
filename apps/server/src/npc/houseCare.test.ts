import { unitPurseLocation } from "@terra/shared/businessBooks";
import { DEFAULT_UNIT_TRAITS, type UnitTraits } from "@terra/shared/unitTraits";
import { TEST_SOCIETY_COEFFICIENTS, createLedgerBook } from "@terra/sim";
import type { HouseFlag } from "@terra/sim/npcAi";
import { describe, expect, it } from "vitest";
import { createHouseCare } from "./houseCare.ts";
import { npcHouseVaultCode } from "./rulingVault.ts";

const CUR = "cur:test";
const counter = (): (() => number) => {
  let next = 0;
  return () => (next += 1);
};
const OWNER = 7;

interface TestUnit {
  id: number;
  city: number;
  owner: number;
  guard?: boolean | undefined;
  fedPm?: number | undefined;
  paidToday?: number | undefined;
}

function setup(o: { flags?: HouseFlag[]; head?: UnitTraits; enabled?: number } = {}) {
  const ledger = createLedgerBook({ accounts: [], nextAccountId: counter(), nextTxId: counter() });
  const units = new Map<number, TestUnit>(
    [
      { id: 1, city: 1, owner: OWNER, paidToday: 1000, fedPm: 1000 },
      { id: 2, city: 1, owner: OWNER, paidToday: 1000, fedPm: 1000 },
      { id: 3, city: 1, owner: OWNER, paidToday: 0, fedPm: 1000 },
      { id: 4, city: 1, owner: OWNER, paidToday: 1000, fedPm: 0 },
      { id: 5, city: 1, owner: OWNER, guard: true },
    ].map((unit) => [unit.id, unit]),
  );
  const purse = (unitId: number): number => ledger.ownerAccount(OWNER, CUR, unitPurseLocation(unitId));
  // 임금을 받은 휴먼의 지갑에 그 임금이 들어 있다
  const mint = ledger.systemAccount("issue:test", CUR);
  for (const unit of units.values())
    if ((unit.paidToday ?? 0) > 0)
      ledger.post({
        kind: "test_wage",
        atMs: 0,
        entries: [
          { account: mint, amount: -BigInt(unit.paidToday ?? 0) },
          { account: purse(unit.id), amount: BigInt(unit.paidToday ?? 0) },
        ],
      });
  const care = createHouseCare({
    ledger,
    rules: () => ({
      ...TEST_SOCIETY_COEFFICIENTS,
      npcAi: { ...TEST_SOCIETY_COEFFICIENTS.npcAi, houseAiEnabled: o.enabled ?? 1 },
    }),
    units,
    cities: new Map([[1, { owner: OWNER }]]),
    currencyOf: () => CUR,
    dailyWage: () => 1000n,
    housesOfCity: () => [10],
    membersOf: () => [1, 2, 3, 4, 5],
    headOf: () => 1,
    traitsOf: () => o.head ?? DEFAULT_UNIT_TRAITS,
    flagsOf: () => o.flags ?? [],
  });
  const vault = (): bigint => ledger.balance(ledger.systemAccount(npcHouseVaultCode(10, CUR), CUR));
  return { ledger, units, care, purse, vault };
}

describe("NPC 가문 금고·돌봄 배당(houseCare.ts)", () => {
  it("가문세: 임금을 받은 가문원 지갑 → 가문 금고(10%). 경비대·못 받은 가문원은 내지 않는다", () => {
    const { ledger, care, purse, vault } = setup();
    expect(care.day(1)).toEqual({ taxed: 3, cared: 0 });
    expect(vault()).toBe(300n);
    expect(ledger.balance(purse(1))).toBe(900n);
    expect(ledger.balance(purse(3))).toBe(0n);
  });

  it("깃발이 선 가문: 못 받았거나 못 먹은 가문원에게 금고에서 배당하고, 받은 돈은 그날 임금에 더한다", () => {
    const giver: UnitTraits = { ...DEFAULT_UNIT_TRAITS, communalism: 1000, greed: 0 };
    const { ledger, units, care, purse, vault } = setup({ flags: ["food_short"], head: giver });
    const day = care.day(1);
    expect(day).toEqual({ taxed: 3, cared: 2 });
    // 금고 300 × 900‰ = 270 → 돌볼 사람 2명(3번 = 못 받음, 4번 = 못 먹음)에게 135씩
    expect(vault()).toBe(30n);
    expect(ledger.balance(purse(3))).toBe(135n);
    expect(units.get(3)?.paidToday).toBe(135);
    expect(units.get(4)?.paidToday).toBe(1135);
  });

  it("짠 가문장은 적게 푼다. 스위치를 끄면 아무것도 하지 않는다", () => {
    const miser: UnitTraits = { ...DEFAULT_UNIT_TRAITS, communalism: 0, greed: 1000 };
    const tight = setup({ flags: ["morale_low"], head: miser });
    tight.care.day(1);
    // 금고 300 × 100‰ = 30 → 15씩
    expect(tight.ledger.balance(tight.purse(3))).toBe(15n);
    const off = setup({ flags: ["food_short"], enabled: 0 });
    expect(off.care.day(1)).toEqual({ taxed: 0, cared: 0 });
    expect(off.vault()).toBe(0n);
  });
});
