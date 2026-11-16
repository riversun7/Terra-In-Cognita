// 임금 채우기(D-573 2042): 기본은 바로 멈춤, 진행 중인 생산 주기가 있을 때만 마지막 한 주기를 적자로
import { type LaborContract, OLD_LABOR_RULES, createLedgerBook, laborAccounts } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { fundDueWages } from "./wageFunding.ts";

const DAY = 86_400_000;
const contract = (): LaborContract => ({
  id: 1,
  kind: "wage",
  ownerId: 1,
  workerOwnerId: 2,
  unitId: 9,
  buildingId: 5,
  asset: "credit",
  rate: 10n,
  deposit: 0n,
  startedAtMs: 0,
  endsAtMs: null,
  settledAtMs: 0,
  nextDueMs: DAY,
  state: "active",
  graceUntilMs: null,
  endedAtMs: null,
  endReason: null,
  paidTotal: 0n,
  leftoversMovedAtMs: null,
});

/** 금고 25(임금 10이면 두 번)인 사업장 고리: 적자(모자람)·멈춤 시각을 적는다 */
function run(inProgress: boolean) {
  const vault = 25n;
  const advanced: bigint[] = [];
  const stops: number[] = [];
  let ids = 0;
  const book = createLedgerBook({ nextAccountId: () => ++ids, nextTxId: () => ++ids });
  fundDueWages({
    contract: contract(),
    toMs: 3 * DAY,
    rules: OLD_LABOR_RULES,
    business: {
      advance: (_building, _owner, _asset, needed) => {
        const short = needed > vault ? needed - vault : 0n;
        advanced.push(short);
        return short;
      },
      taxIncome: () => 0n,
      fundDeposit: () => 0n,
      vaultBalance: () => vault,
      stopAfter: (_building, atMs) => stops.push(atMs),
    },
    ledger: book,
    accounts: laborAccounts(book),
    inProgress: (unitId, buildingId) => inProgress && unitId === 9 && buildingId === 5,
  });
  return { advanced, stops };
}

describe("임금 채우기(D-573 2042)", () => {
  it("진행 중인 생산 주기가 없으면 금고가 덮는 지급까지만 채우고 그다음 지급에 멈춘다(적자 없음)", () => {
    // 1·2·3일 세 번 가운데 금고 25로 두 번 → 3일째(1일 + 2주기)에 멈춤
    expect(run(false)).toEqual({ advanced: [0n], stops: [3 * DAY] });
  });

  it("진행 중인 생산 주기가 있으면 마지막 한 주기만 적자로 넣고 그 주기 끝에 멈춘다", () => {
    expect(run(true)).toEqual({ advanced: [5n], stops: [4 * DAY] });
  });
});
