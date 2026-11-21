import { DEFAULT_UNIT_TRAITS, type UnitTraits } from "@terra/shared/unitTraits";
import { TEST_SOCIETY_COEFFICIENTS, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createHouseLeague, leagueFundCode } from "./houseLeague.ts";
import { npcHouseVaultCode } from "./rulingVault.ts";

const CUR = "cur:test";
const OWNER = 7;
const counter = (): (() => number) => {
  let next = 0;
  return () => (next += 1);
};

function setup(o: {
  head: UnitTraits;
  vault: bigint;
  cards?: { slot: number; total: number; cost: bigint }[];
}) {
  const ledger = createLedgerBook({ accounts: [], nextAccountId: counter(), nextTxId: counter() });
  const city = { id: 1, owner: OWNER, housing: 50, researchLevel: 1 };
  const cities = new Map([[1, city]]);
  const units = new Map(
    [1, 2, 3, 4].map((id) => [id, { id, city: 1, guard: undefined as boolean | undefined }]),
  );
  const vault = ledger.systemAccount(npcHouseVaultCode(10, CUR), CUR);
  ledger.post({
    kind: "test_fill",
    atMs: 0,
    entries: [
      { account: ledger.systemAccount("issue:test", CUR), amount: -o.vault },
      { account: vault, amount: o.vault },
    ],
  });
  const hired: { slot: number; guard: boolean | undefined; prepaid: boolean | undefined }[] = [];
  const faction = { id: OWNER, wars: new Set<number>() };
  const league = createHouseLeague({
    ledger,
    rules: () => TEST_SOCIETY_COEFFICIENTS,
    units,
    cities,
    currencyOf: () => CUR,
    // 가문 10(가문원 3)·가문 20(가문원 1) → 대표 = 가문 10의 가문장
    housesOfCity: () => [10, 20],
    membersOf: (houseId) => (houseId === 10 ? [1, 2, 3] : [4]),
    headOf: (houseId) => (houseId === 10 ? 1 : 4),
    traitsOf: (unitId) => (unitId === 1 ? o.head : DEFAULT_UNIT_TRAITS),
    npc: () => ({
      world: { factions: new Map([[OWNER, faction]]), cities },
      settings: { researchBuildCost: 2000n },
      society: {
        recruitView: () => ({ window: 1, endsAtMs: 0, level: 1, taken: 0, cards: o.cards ?? [] }),
        recruit: (_f: unknown, _c: number, slot: number, _n: number, guard?: boolean, prepaid?: boolean) => {
          hired.push({ slot, guard, prepaid });
          return { id: 99 };
        },
      },
    }),
  });
  const balance = (code: string): bigint => ledger.balance(ledger.systemAccount(code, CUR));
  return { ledger, league, city, hired, balance, treasury: () => ledger.balanceOf(OWNER, CUR) };
}

describe("가문 연맹(houseLeague.ts)", () => {
  it("분담금: 가문 금고의 20%가 연맹 기금으로. 호전적인 대표는 살 수 있는 가장 좋은 카드를 경비대로 들인다", () => {
    const hawk: UnitTraits = { ...DEFAULT_UNIT_TRAITS, belligerence: 1000, boldness: 900 };
    const { league, hired, balance } = setup({
      head: hawk,
      vault: 5000n,
      cards: [
        { slot: 0, total: 60, cost: 300n },
        { slot: 1, total: 90, cost: 900n },
        { slot: 2, total: 99, cost: 5000n },
      ],
    });
    const day = league.day(1);
    expect(day.dues).toBe(1);
    expect(day.invested.military).toBe(1);
    // 기금 1000 → 900짜리 카드(살 수 있는 것 가운데 가장 좋은 것)를 경비대로, 값은 미리 낸 것으로
    expect(hired).toEqual([{ slot: 1, guard: true, prepaid: true }]);
    expect(balance(leagueFundCode(1, CUR))).toBe(100n);
    expect(balance(`sink:${CUR}`)).toBe(900n);
  });

  it("개방적인 대표는 기술에 투자한다 — 값은 레벨이 오를수록 비싸고, 모자라면 모은다", () => {
    const scholar: UnitTraits = { ...DEFAULT_UNIT_TRAITS, openness: 1000, discipline: 900 };
    const poor = setup({ head: scholar, vault: 5000n });
    // 기금 1000 < 기술 값 2000 × (1 + 1) = 4000 → 모은다
    expect(poor.league.day(1).invested.tech).toBe(0);
    expect(poor.city.researchLevel).toBe(1);
    expect(poor.balance(leagueFundCode(1, CUR))).toBe(1000n);
    const rich = setup({ head: scholar, vault: 30_000n });
    expect(rich.league.day(1).invested.tech).toBe(1);
    expect(rich.city.researchLevel).toBe(2);
    expect(rich.balance(leagueFundCode(1, CUR))).toBe(2000n);
  });

  it("이윤을 좇는 대표는 생산을 고르고 모인 기금을 나라 국고로 넘긴다", () => {
    const merchant: UnitTraits = { ...DEFAULT_UNIT_TRAITS, greed: 1000, discipline: 900 };
    const { league, treasury, balance } = setup({ head: merchant, vault: 5000n });
    expect(league.day(1).invested.production).toBe(1);
    expect(treasury()).toBe(1000n);
    expect(balance(leagueFundCode(1, CUR))).toBe(0n);
  });
});
