// 신용 점수 장부 시험 — book.ts·hooks.ts·view.ts (D-581·D-584 한 점수, docs/adr/2026-11-21-credit.md)
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
  const standingRows = new Map<number, Record<string, unknown>>();
  const writer: WorldWriter = {
    upsert(table, row) {
      if (table === "creditMarks") rows.set(String(row.cause), { ...row });
      if (table === "creditStandings") standingRows.set(Number(row.owner_id), { ...row });
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
  return { writer, rows, standingRows };
}

function world(
  o: {
    loaded?: CreditMark[];
    rules?: Partial<BusinessCoefficients>;
    operating?: () => ReadonlyMap<number, number>;
    seed?: (l: ReturnType<typeof createLedger>) => void;
  } = {},
) {
  let account = 0;
  let tx = 0;
  const { writer, rows, standingRows } = fakeWriter();
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
    operating: o.operating,
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
  return { ledger, book, rows, standingRows, give };
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

const DAY = 86_400_000;
const T0 = 10 * DAY;

describe("신용 점수 장부(D-581 · D-584 한 점수)", () => {
  it("주민세 빚이 늘어난 주기마다 그 나라 신용을 깎고(유닛 주체), 일부만 갚으면 그대로, 다 갚으면 바로 되돌린다", () => {
    const w = world();
    expect(w.book.score(unitSubject, NATION, T0)).toBe(100);
    residentCycle(w, 1);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(80);
    // 주인 자신·다른 나라는 그대로
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(100);
    expect(w.book.score(unitSubject, 9, T0)).toBe(100);
    residentCycle(w, 2);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(60);
    expect(w.rows.get(residentDebtCode(NATION, CITY, PLAYER, CUR, UNIT))).toMatchObject({
      kind: "resident",
      unit_id: UNIT,
      city_points: 0,
      nation_points: 40,
      count: 2,
    });
    // 일부만 갚으면 그대로(2443 가 — 빚 20 + 이번 10 = 30 가운데 15만 냄 → 빚 15), 빚이 줄어든 주기는 더 깎지 않는다
    w.give(PLAYER, 15n, unitPurseLocation(UNIT));
    residentCycle(w, 3);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(60);
  });

  it("빚 계정이 0이 되면(다 갚음) 깎은 몫이 바로 돌아오고 표 줄이 지워진다", () => {
    const w = world();
    residentCycle(w, 1);
    const code = residentDebtCode(NATION, CITY, PLAYER, CUR, UNIT);
    expect(w.rows.has(code)).toBe(true);
    w.give(PLAYER, 20n, unitPurseLocation(UNIT));
    residentCycle(w, 2);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(100);
    expect(w.rows.has(code)).toBe(false);
    expect(w.book.marksOf(PLAYER)).toEqual([]);
  });

  it("도시가 넘어가 빚이 사라지면(탕감) 깎은 몫도 돌아온다", () => {
    const w = world();
    residentCycle(w, 1);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(80);
    cancelResidentDebts(w.ledger, NATION, CITY, 2);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(100);
    expect(w.rows.size).toBe(0);
  });

  it("사업장 적자가 생기면 건물 주인의 신용을 한 번 깎고, 다 갚거나 탕감(건물이 사라짐 2445 나)되면 되돌린다", () => {
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
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(90);
    advance(30n, 6);
    // 같은 적자(계정)가 더 늘어도 한 번만
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(90);
    expect(w.book.marksOf(PLAYER)).toMatchObject([{ kind: "business", count: 1, sinceMs: 5 }]);
    // 탕감(business/core.ts forget과 같은 거래 꼴)
    w.ledger.post({
      kind: "business_debt_writeoff",
      atMs: 7,
      entries: [
        { account: debt, amount: 60n },
        { account: w.ledger.systemAccount(`writeoff:business:${CUR}`, CUR), amount: -60n },
      ],
    });
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(100);
    expect(w.rows.size).toBe(0);
  });

  it("같은 주머니(건물 주인 = 그 도시 나라)는 깎지 않는다, 깎는 크기 0이면 줄을 만들지 않는다", () => {
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
    const off = world({ rules: { creditResidentNation: 0 } });
    residentCycle(off, 1);
    expect(off.rows.size).toBe(0);
    expect(off.book.score(unitSubject, NATION, T0)).toBe(100);
  });

  it("소속 기간마다 저절로 오르고(상한까지), 사업장 운영은 하루 한 번, 나라를 옮기면 처음부터(D-584)", () => {
    let operating = new Map<number, number>([[PLAYER, 3]]);
    const w = world({ operating: () => operating });
    w.book.sweep(T0, new Map([[PLAYER, NATION]]));
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(100);
    // 사흘 뒤: 소속 +15(하루 5 — D-587), 그날 사업장 3 × 10 = 30(D-587)
    w.book.sweep(T0 + 3 * DAY, new Map([[PLAYER, NATION]]));
    expect(w.book.score(ownerSubject, NATION, T0 + 3 * DAY)).toBe(145);
    // 같은 날 다시 훑어도 더하지 않는다
    w.book.sweep(T0 + 3 * DAY + 1000, new Map([[PLAYER, NATION]]));
    expect(w.book.standingOf(PLAYER)?.rise).toBe(30);
    // 소속 오름 상한(300) — 100일 뒤
    operating = new Map();
    expect(w.book.score(ownerSubject, NATION, T0 + 100 * DAY)).toBe(100 + 300 + 30);
    // 나라를 옮기면 처음부터, 옛 나라 점수는 시작값
    w.book.sweep(T0 + 5 * DAY, new Map([[PLAYER, 9]]));
    expect(w.book.score(ownerSubject, 9, T0 + 5 * DAY)).toBe(100);
    expect(w.book.score(ownerSubject, NATION, T0 + 5 * DAY)).toBe(100);
    expect(w.standingRows.get(PLAYER)).toMatchObject({ nation_id: 9, rise: 0 });
  });

  it("남는 벌점(쿠데타 가담·같은 나라 공격)·유지비 체납(마지막 경계를 내면 되돌림)·새 나라 시작 가산", () => {
    const w = world({ rules: { creditStart: 500 } });
    // 소속을 모르면 벌점을 적지 않는다
    expect(w.book.event(PLAYER, "coup_join", T0)).toBe(false);
    w.book.sweep(T0, new Map([[PLAYER, NATION]]));
    expect(w.book.event(PLAYER, "coup_join", T0)).toBe(true);
    expect(w.book.event(PLAYER, "same_nation_attack", T0)).toBe(true);
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(500 - 100 - 50);
    w.book.upkeep(PLAYER, 3, false, T0);
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(350 - 6);
    w.book.upkeep(PLAYER, 0, true, T0 + 1);
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(350);
    w.book.restartAt(PLAYER, 12, 40, T0 + 2);
    // 새 나라: 시작값 + 가산, 옛 나라 벌점은 옛 나라에 남는다
    expect(w.book.score(ownerSubject, 12, T0 + 2)).toBe(540);
    expect(w.book.score(ownerSubject, NATION, T0 + 2)).toBe(350);
    expect(w.book.check()).toEqual([]);
  });

  it("점수는 설정 칸 범위로 자른다", () => {
    const w = world({ rules: { creditMin: 70, creditResidentNation: 30 } });
    residentCycle(w, 1);
    residentCycle(w, 2);
    expect(w.book.score(unitSubject, NATION, T0)).toBe(70);
    const low = world({ rules: { creditStart: 500, creditMax: 400 } });
    expect(low.book.score(unitSubject, NATION, T0)).toBe(400);
  });

  it("켤 때 읽은 줄: 빚이 남은 줄만 남기고 이미 갚은(계정 0·없음) 줄은 지운다. 유지비·벌점 줄은 남는다", () => {
    const open = residentDebtCode(NATION, CITY, PLAYER, CUR);
    const paid = residentDebtCode(NATION, 8, PLAYER, CUR);
    const mark = (cause: string, cityId: number, kind: CreditMark["kind"] = "resident"): CreditMark => ({
      cause,
      kind,
      ownerId: PLAYER,
      unitId: null,
      cityId,
      nationId: NATION,
      points: 20,
      count: 1,
      sinceMs: 1,
      updatedAtMs: 1,
    });
    const w = world({
      loaded: [mark(open, CITY), mark(paid, 8), mark(`upkeep:${PLAYER}`, 0, "upkeep")],
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
    expect(w.book.marksOf(PLAYER).map((m) => m.cause)).toEqual([open, `upkeep:${PLAYER}`]);
    expect(w.book.score(ownerSubject, NATION, T0)).toBe(60);
    expect(w.book.check()).toEqual([]);
  });

  it("조회 줄: 주인 지금 나라 줄이 먼저(소속·오른 몫), 유닛 줄", () => {
    const w = world();
    w.book.sweep(T0, new Map([[PLAYER, NATION]]));
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
    expect(creditLines(book, PLAYER, T0 + 2 * DAY)).toEqual([
      {
        subject: "owner",
        unitId: null,
        nationId: NATION,
        current: true,
        score: 100 + 10 - 10,
        tenure: 10,
        rise: 0,
        marks: [{ cause: "business", points: 10, count: 1, sinceMs: 2 }],
      },
      {
        subject: "unit",
        unitId: UNIT,
        nationId: NATION,
        current: false,
        score: 80,
        tenure: 0,
        rise: 0,
        marks: [{ cause: "resident", points: 20, count: 1, sinceMs: 1 }],
      },
    ]);
  });
});
