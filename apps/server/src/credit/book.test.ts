// 신용 점수 장부 시험 — book.ts·hooks.ts·view.ts (D-581, docs/adr/2026-11-21-credit.md)
import { businessDebtCode, businessLocation, unitPurseLocation } from "@terra/shared/businessBooks";
import {
  type BusinessCoefficients,
  START_BUSINESS,
  type SimHooks,
  cancelResidentDebts,
  collectResidentTax,
  newFaction,
  residentDebtCode,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createLedger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type CreditMark, attachCreditBook, creditBookOf } from "./book.ts";
import { withCredit } from "./hooks.ts";
import { creditLines } from "./view.ts";

const CUR = "cur_test";
const NATION = 2;
const CITY = 7;
const PLAYER = 40;
const UNIT = 11;
const BUILDING = 500;

/** 쓰기 대기열 흉내: 신용 표의 마지막 상태만 본다 */
function fakeWriter() {
  const rows = new Map<string, Record<string, unknown>>();
  const writer: WorldWriter = {
    upsert(table, row) {
      if (table === "creditMarks") rows.set(String(row.cause), { ...row });
    },
    remove(table, key) {
      if (table === "creditMarks") rows.delete(String(key.cause));
    },
    append() {},
    durable: async () => {},
    drain: async () => {},
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: async () => {},
  };
  return { writer, rows };
}

function world(
  o: {
    loaded?: CreditMark[];
    rules?: Partial<BusinessCoefficients>;
    seed?: (l: ReturnType<typeof createLedger>) => void;
  } = {},
) {
  let account = 0;
  let tx = 0;
  const { writer, rows } = fakeWriter();
  const ledger = createLedger({ writer, nextAccountId: () => ++account, nextTxId: () => ++tx, accounts: [] });
  o.seed?.(ledger);
  const rules: BusinessCoefficients = { ...START_BUSINESS, ...o.rules };
  const book = attachCreditBook({
    ledger,
    writer,
    loaded: o.loaded ?? [],
    rules: () => rules,
    place: (buildingId) => (buildingId === BUILDING ? { ownerId: PLAYER, cityId: CITY } : undefined),
    nationOf: (cityId) => (cityId === CITY ? NATION : undefined),
  });
  const give = (owner: number, amount: bigint, location?: number) =>
    ledger.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount(`issue:${CUR}`, CUR), amount: -amount },
        { account: ledger.ownerAccount(owner, CUR, location ?? null), amount },
      ],
    });
  return { ledger, book, rows, give };
}

const unitSubject = { ownerId: PLAYER, unitId: UNIT };
const ownerSubject = { ownerId: PLAYER, unitId: null };
const faction = newFaction(NATION, "fake_nation", {
  fixed: true,
  tech: 0,
  regime: "dictatorship",
  settledAtMs: 0,
  traits: { aggression: 500, commerce: 500, faith: 500, station: 500 },
});
/** 고리 바탕(신용 고리가 얹힐 자리 — 원래 고리 넷만) */
const BASE_HOOKS: SimHooks = {
  treasuryAsset: () => CUR,
  beforeCityTransfer: () => {},
  factionBorn: () => {},
  factionDied: () => {},
};

/** 집 몫(유닛 지갑) 주민세 한 주기 — 재산 1000 × 10‰ = 10 */
const residentCycle = (w: ReturnType<typeof world>, atMs: number) => {
  const result = collectResidentTax(w.ledger, {
    nation: NATION,
    asset: CUR,
    assessments: [{ city: CITY, payer: PLAYER, unit: UNIT, property: 1000n }],
    ratePm: 10,
    nationSharePm: 0,
    atMs,
  });
  if (result.arrears.length > 0)
    withCredit(BASE_HOOKS, { ledger: w.ledger }).residentTaxArrears?.(faction, result.arrears, atMs);
  return result;
};

describe("신용 점수 장부(D-581)", () => {
  it("주민세 빚이 늘어난 주기마다 도시·나라 신용을 깎고(유닛 주체), 다 갚으면 바로 모두 되돌린다", () => {
    const w = world();
    expect(w.book.score(unitSubject, { city: CITY })).toBe(1000);
    residentCycle(w, 1);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(950);
    expect(w.book.score(unitSubject, { nation: NATION })).toBe(980);
    // 주인 자신·다른 도시는 그대로
    expect(w.book.score(ownerSubject, { city: CITY })).toBe(1000);
    expect(w.book.score(unitSubject, { city: 8 })).toBe(1000);
    residentCycle(w, 2);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(900);
    expect(w.rows.get(residentDebtCode(NATION, CITY, PLAYER, CUR, UNIT))).toMatchObject({
      kind: "resident",
      unit_id: UNIT,
      city_points: 100,
      nation_points: 40,
      count: 2,
    });
    // 일부만 갚으면 그대로(빚 20 + 이번 10 = 30 가운데 15만 냄 → 빚 15), 빚이 줄어든 주기는 더 깎지 않는다
    w.give(PLAYER, 15n, unitPurseLocation(UNIT));
    residentCycle(w, 3);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(900);
  });

  it("빚 계정이 0이 되면(다 갚음) 깎은 몫이 바로 돌아오고 표 줄이 지워진다", () => {
    const w = world();
    residentCycle(w, 1);
    const code = residentDebtCode(NATION, CITY, PLAYER, CUR, UNIT);
    expect(w.rows.has(code)).toBe(true);
    // 유닛 지갑에 돈을 넣고 다음 주기 — 빚 10 + 이번 10 = 20을 낸다
    w.give(PLAYER, 20n, unitPurseLocation(UNIT));
    residentCycle(w, 2);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(1000);
    expect(w.book.score(unitSubject, { nation: NATION })).toBe(1000);
    expect(w.rows.has(code)).toBe(false);
    expect(w.book.marksOf(PLAYER)).toEqual([]);
  });

  it("도시가 넘어가거나 폐허가 되어 빚이 사라지면(탕감) 깎은 몫도 돌아온다", () => {
    const w = world();
    residentCycle(w, 1);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(950);
    cancelResidentDebts(w.ledger, NATION, CITY, 2);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(1000);
    expect(w.rows.size).toBe(0);
  });

  it("사업장 적자가 생기면 건물 주인의 그 도시·나라 신용을 한 번 깎고, 다 갚으면 되돌린다. 같은 주머니는 깎지 않는다", () => {
    const w = world();
    const debt = w.ledger.systemAccount(businessDebtCode(BUILDING, CUR), CUR);
    const vault = w.ledger.ownerAccount(PLAYER, CUR, businessLocation(BUILDING));
    const advance = (amount: bigint, atMs: number) =>
      w.ledger.post({
        kind: "business_debt",
        atMs,
        entries: [
          { account: debt, amount: -amount },
          { account: vault, amount },
        ],
      });
    advance(30n, 5);
    expect(w.book.score(ownerSubject, { city: CITY })).toBe(970);
    expect(w.book.score(ownerSubject, { nation: NATION })).toBe(990);
    advance(30n, 6);
    // 같은 적자(계정)가 더 늘어도 한 번만
    expect(w.book.score(ownerSubject, { city: CITY })).toBe(970);
    expect(w.book.marksOf(PLAYER)).toMatchObject([{ kind: "business", count: 1, sinceMs: 5 }]);
    w.ledger.post({
      kind: "business_repay",
      atMs: 7,
      entries: [
        { account: vault, amount: -60n },
        { account: debt, amount: 60n },
      ],
    });
    expect(w.book.score(ownerSubject, { city: CITY })).toBe(1000);
    expect(w.rows.size).toBe(0);
  });

  it("같은 주머니(건물 주인 = 그 도시 나라)·모르는 건물은 깎지 않는다, 깎는 크기 0이면 줄을 만들지 않는다", () => {
    const own = world();
    const nationDebt = own.ledger.systemAccount(businessDebtCode(999, CUR), CUR);
    own.ledger.post({
      kind: "business_debt",
      atMs: 1,
      entries: [
        { account: nationDebt, amount: -5n },
        { account: own.ledger.ownerAccount(NATION, CUR, businessLocation(999)), amount: 5n },
      ],
    });
    expect(own.rows.size).toBe(0);
    const off = world({ rules: { creditResidentCity: 0, creditResidentNation: 0 } });
    residentCycle(off, 1);
    expect(off.rows.size).toBe(0);
    expect(off.book.score(unitSubject, { city: CITY })).toBe(1000);
  });

  it("점수는 설정 칸 범위로 자른다", () => {
    const w = world({ rules: { creditMin: 900, creditResidentCity: 70 } });
    residentCycle(w, 1);
    residentCycle(w, 2);
    expect(w.book.score(unitSubject, { city: CITY })).toBe(900);
    const low = world({ rules: { creditStart: 500, creditMax: 400 } });
    expect(low.book.score(unitSubject, { city: CITY })).toBe(400);
  });

  it("켤 때 읽은 줄: 빚이 남은 줄만 남기고 이미 갚은(계정 0·없음) 줄은 지운다", () => {
    const open = residentDebtCode(NATION, CITY, PLAYER, CUR);
    const paid = residentDebtCode(NATION, 8, PLAYER, CUR);
    const mark = (cause: string, cityId: number): CreditMark => ({
      cause,
      kind: "resident",
      ownerId: PLAYER,
      unitId: null,
      cityId,
      nationId: NATION,
      cityPoints: 50,
      nationPoints: 20,
      count: 1,
      sinceMs: 1,
      updatedAtMs: 1,
    });
    const w = world({
      loaded: [mark(open, CITY), mark(paid, 8)],
      seed: (ledger) => {
        // 남은 빚 하나(짝 계정과 함께), 갚은 빚 계정 하나(잔고 0)
        ledger.post({
          kind: "resident_tax",
          atMs: 1,
          entries: [
            { account: ledger.systemAccount(open, CUR), amount: -10n },
            { account: ledger.systemAccount(`claim:resident:${NATION}:${CUR}`, CUR), amount: 10n },
          ],
        });
        ledger.systemAccount(paid, CUR);
      },
    });
    expect(w.book.marksOf(PLAYER).map((m) => m.cause)).toEqual([open]);
    expect(w.book.score(ownerSubject, { city: CITY })).toBe(950);
    expect(w.book.score(ownerSubject, { nation: NATION })).toBe(980);
    expect(w.book.check()).toEqual([]);
  });

  it("조회 줄: 주인 자신이 먼저, 그 도시 신용과 나라 신용을 함께", () => {
    const w = world();
    residentCycle(w, 1);
    const debt = w.ledger.systemAccount(businessDebtCode(BUILDING, CUR), CUR);
    w.ledger.post({
      kind: "business_debt",
      atMs: 2,
      entries: [
        { account: debt, amount: -1n },
        { account: w.ledger.ownerAccount(PLAYER, CUR, businessLocation(BUILDING)), amount: 1n },
      ],
    });
    const book = creditBookOf(w.ledger);
    if (!book) throw new Error("book");
    expect(creditLines(book, PLAYER, (id) => (id === CITY ? "도시" : undefined))).toEqual([
      {
        subject: "owner",
        unitId: null,
        cityId: CITY,
        cityName: "도시",
        nationId: NATION,
        cityScore: 970,
        nationScore: 990,
        marks: [{ cause: "business", cityPoints: 30, nationPoints: 10, count: 1, sinceMs: 2 }],
      },
      {
        subject: "unit",
        unitId: UNIT,
        cityId: CITY,
        cityName: "도시",
        nationId: NATION,
        cityScore: 950,
        nationScore: 980,
        marks: [{ cause: "resident", cityPoints: 50, nationPoints: 20, count: 1, sinceMs: 1 }],
      },
    ]);
  });
});
