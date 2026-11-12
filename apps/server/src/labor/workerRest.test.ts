// 플레이어 일꾼 쉼터(workerRest.ts) 시험 — 질문 1088 가
import { TEST_JOB_RULES, TEST_SOCIETY_COEFFICIENTS, createLedgerBook, restPeriodMs } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createWorkerRest } from "./workerRest.ts";

const rules = TEST_SOCIETY_COEFFICIENTS;
const area = (x: number, y: number) => ({ x, y, radius: 4 });

function setup(lodgingLevel: number | null, lodgingOwner = 9) {
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
    feeAsset: "credit",
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

  it("남의 숙소는 일·쉼 한 바퀴마다 하룻밤 요금을 일꾼 주인 지갑에서 숙소 주인에게(잔고만큼)", () => {
    const { rest, ledger } = setup(1, 9);
    const wallet = ledger.ownerAccount(5, "credit");
    const issue = ledger.systemAccount("issue:credit", "credit");
    ledger.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: issue, amount: -10n },
        { account: wallet, amount: 10n },
      ],
    });
    const view = rest.restOf(100);
    if (!view) throw new Error("no rest");
    const period = restPeriodMs(view.place, view.commuteCells, rules);
    rest.rulesFor(5, [{ id: 100 }], 0, period * 3 + 5);
    expect(ledger.balanceOf(9, "credit")).toBe(3n * BigInt(rules.logistics.lodgingFeePerNight));
    // 내 숙소면 요금 없음
    const own = setup(1, 5);
    own.rest.rulesFor(5, [{ id: 100 }], 0, period * 3);
    expect(own.ledger.balanceOf(5, "credit")).toBe(0n);
  });
});
