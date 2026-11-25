// 플레이어 일꾼 쉼터(workerRest.ts) 시험 — 질문 1088 가
import { TEST_JOB_RULES, TEST_SOCIETY_COEFFICIENTS, createLedgerBook, restPeriodMs } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { unitPurseLocation } from "@terra/shared/businessBooks";
import { createWorkerRest } from "./workerRest.ts";

const rules = TEST_SOCIETY_COEFFICIENTS;
const area = (x: number, y: number) => ({ x, y, radius: 4 });

function setup(lodgingLevel: number | null, lodgingOwner = 9, ownerPurseUnits: readonly number[] = []) {
  let ids = 1;
  const ledger = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  const rest = createWorkerRest({
    rules: () => rules,
    now: () => 0,
    workplaceOf: (unitId) => (unitId === 100 ? 7 : undefined),
    cityOf: () => 1,
    workersIn: () => [{ unitId: 100, buildingId: 7 }],
    places: () => ({
      areas: new Map([[7, area(130, 100)]]),
      lodgings:
        lodgingLevel === null
          ? []
          : [{ id: 60, area: area(120, 100), level: lodgingLevel, ownerId: lodgingOwner }],
      stores: [],
      home: { x: 100, y: 100 },
    }),
    npcTaken: () => undefined,
    ledger,
    feeAssetOf: () => "credit",
    useOwnerPurse: (unitId) => ownerPurseUnits.includes(unitId),
  });
  return { rest, ledger };
}

describe("createWorkerRest", () => {
  it("숙소 Lv1이면 예전 정산 규칙과 같고(2분에 1점), 집이면 3분에 1점, 일꾼이 아니면 기본", () => {
    const lodged = setup(1).rest.rulesFor(5, [{ id: 100 }, { id: 101 }], 0, 1);
    expect(lodged?.[0]?.restStepMs).toBe(TEST_JOB_RULES.restStepMs);
    expect(lodged?.[1]).toBeUndefined();
    const home = setup(null).rest.rulesFor(5, [{ id: 100 }], 0, 1);
    expect(home?.[0]?.restStepMs).toBe(180_000);
    expect(setup(null).rest.rulesFor(5, [{ id: 101 }], 0, 1)).toBeUndefined();
    expect(setup(3).rest.restOf(100)?.recoveryPm).toBeGreaterThan(1500);
  });

  it("숙박비는 유닛 사유재산에서 숙소에 낸다(제 주인 숙소도, D-555 1508·1514)", () => {
    const { rest, ledger } = setup(1, 9);
    const purse = ledger.ownerAccount(5, "credit", unitPurseLocation(100));
    const issue = ledger.systemAccount("issue:credit", "credit");
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: issue, amount: -10n },
        { account: purse, amount: 10n },
      ],
    });
    const view = rest.restOf(100);
    if (!view) throw new Error("no rest");
    const period = restPeriodMs(view.place, view.commuteCells, rules);
    rest.rulesFor(5, [{ id: 100 }], 0, period * 3 + 5);
    const fee = BigInt(rules.logistics.lodgingFeePerNight);
    // 장부가 없는 세계는 숙소 주인 지갑으로(옛 길)
    expect(ledger.balanceOf(9, "credit")).toBe(3n * fee);
    expect(ledger.balanceOf(5, "credit", unitPurseLocation(100))).toBe(10n - 3n * fee);
    // 주인 지갑은 건드리지 않는다
    expect(ledger.balanceOf(5, "credit")).toBe(0n);
    // 제 주인 숙소여도 낸다(유닛 돈 → 숙소)
    const own = setup(1, 5);
    const ownPurse = own.ledger.ownerAccount(5, "credit", unitPurseLocation(100));
    own.ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: own.ledger.systemAccount("issue:credit", "credit"), amount: -10n },
        { account: ownPurse, amount: 10n },
      ],
    });
    own.rest.rulesFor(5, [{ id: 100 }], 0, period * 3);
    expect(own.ledger.balance(ownPurse)).toBe(10n - 3n * fee);
  });

  it("사이보그 본체·재산 없는 유닛의 숙박비는 소유자 지갑에서 낸다(유닛 지갑이 없다 — ADR 2026-11-24 5)", () => {
    const { rest, ledger } = setup(1, 9, [100]);
    // 돈은 소유자(플레이어) 지갑에만 있다 — 유닛 지갑은 비어 있다
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: ledger.systemAccount("issue:credit", "credit"), amount: -10n },
        { account: ledger.ownerAccount(5, "credit"), amount: 10n },
      ],
    });
    const view = rest.restOf(100);
    if (!view) throw new Error("no rest");
    const period = restPeriodMs(view.place, view.commuteCells, rules);
    rest.rulesFor(5, [{ id: 100 }], 0, period * 2 + 5);
    const fee = BigInt(rules.logistics.lodgingFeePerNight);
    expect(ledger.balanceOf(5, "credit")).toBe(10n - 2n * fee);
    expect(ledger.balanceOf(9, "credit")).toBe(2n * fee);
    expect(ledger.balanceOf(5, "credit", unitPurseLocation(100))).toBe(0n);
    // 다 냈으니 못 낸 표시가 없다(회복이 떨어지지 않는다)
    expect(rest.restOf(100)?.unpaid).toBe(false);
  });

  it("숙박비를 다 못 내면 회복이 떨어진다(노숙 회복)", () => {
    const { rest } = setup(3, 9);
    const view = rest.restOf(100);
    if (!view) throw new Error("no rest");
    const period = restPeriodMs(view.place, view.commuteCells, rules);
    const paid = rest.rulesFor(5, [{ id: 100 }], 0, period - 1)?.[0]?.restStepMs;
    const broke = rest.rulesFor(5, [{ id: 100 }], period - 1, period * 2)?.[0]?.restStepMs;
    expect(broke).toBeGreaterThan(paid ?? 0);
    expect(rest.restOf(100)?.unpaid).toBe(true);
  });
});
