import { describe, expect, it } from "vitest";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  TEST_SYSTEM_ISSUE_CREDIT,
  settleOwnerPeriod,
  testSettleAccounts,
} from "./owner.ts";
import { JOB_GATHER, JOB_NONE, PHASE_REST, PHASE_WORK, type JobState } from "./settle.ts";

const HOUR = 3_600_000;
const fresh: JobState = { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };
const idle: JobState = { job: JOB_NONE, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

function bookWithCredit(ownerId: number, credit: bigint) {
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter() });
  if (credit > 0n)
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(TEST_SYSTEM_ISSUE_CREDIT, TEST_ASSET_CREDIT), amount: -credit },
        { account: book.ownerAccount(ownerId, TEST_ASSET_CREDIT), amount: credit },
      ],
    });
  return book;
}

describe("소유 주체 정산(시험 직무·유지비, 서버·시뮬 공용)", () => {
  it("접속 중 2시간: 일꾼 둘이 120주기씩 일하고 쉬기로, 유지비는 경계 둘 중 잔고만큼만 낸다", () => {
    const book = bookWithCredit(5, 3n);
    const result = settleOwnerPeriod(
      { ownerId: 5, jobs: [fresh, fresh, idle], fromMs: 0, toMs: 2 * HOUR, offlineSinceMs: null },
      book,
      testSettleAccounts(book, 5),
    );
    // 60초 주기 × 120 = 2시간 → 피로 120으로 쉬기 시작
    expect(result.cycles).toBe(240);
    expect(result.jobs[0]).toEqual({ job: JOB_GATHER, phase: PHASE_REST, progressMs: 0, fatigue: 120 });
    expect(result.jobs[2]).toEqual(idle);
    // 유닛 3개 × 1 = 3씩, 1시간 경계에서 3을 내고 2시간 경계는 밀림
    expect(result.upkeepPaid).toBe(1);
    expect(result.upkeepUnpaid).toBe(1);
    expect(book.balanceOf(5, TEST_ASSET_CREDIT)).toBe(0n);
    expect(book.balanceOf(5, TEST_ASSET_ORE)).toBe(240n);
  });

  it("나눠 정산해도 한 번에 한 것과 같다(장부 잔고까지)", () => {
    const once = bookWithCredit(1, 50n);
    const whole = settleOwnerPeriod(
      { ownerId: 1, jobs: [fresh, fresh], fromMs: 0, toMs: 30 * HOUR, offlineSinceMs: null },
      once,
      testSettleAccounts(once, 1),
    );
    const split = bookWithCredit(1, 50n);
    let jobs: readonly JobState[] = [fresh, fresh];
    let cycles = 0;
    let unpaid = 0;
    const cuts = [0, 1234, HOUR, 7 * HOUR + 5, 7 * HOUR + 6, 29 * HOUR, 30 * HOUR];
    for (let i = 1; i < cuts.length; i++) {
      const part = settleOwnerPeriod(
        { ownerId: 1, jobs, fromMs: cuts[i - 1] ?? 0, toMs: cuts[i] ?? 0, offlineSinceMs: null },
        split,
        testSettleAccounts(split, 1),
      );
      jobs = part.jobs;
      cycles += part.cycles;
      unpaid += part.upkeepUnpaid;
    }
    expect(jobs).toEqual(whole.jobs);
    expect(cycles).toBe(whole.cycles);
    expect(unpaid).toBe(whole.upkeepUnpaid);
    expect(split.balanceOf(1, TEST_ASSET_CREDIT)).toBe(once.balanceOf(1, TEST_ASSET_CREDIT));
    expect(split.balanceOf(1, TEST_ASSET_ORE)).toBe(once.balanceOf(1, TEST_ASSET_ORE));
  });

  it("끊긴 지 24시간이 지나면 산출이 멈추고 유지비는 계속 센다", () => {
    const book = bookWithCredit(2, 0n);
    const result = settleOwnerPeriod(
      { ownerId: 2, jobs: [fresh], fromMs: 0, toMs: 48 * HOUR, offlineSinceMs: 0 },
      book,
      testSettleAccounts(book, 2),
    );
    const online = bookWithCredit(2, 0n);
    const day = settleOwnerPeriod(
      { ownerId: 2, jobs: [fresh], fromMs: 0, toMs: 24 * HOUR, offlineSinceMs: null },
      online,
      testSettleAccounts(online, 2),
    );
    expect(result.cycles).toBe(day.cycles);
    expect(result.upkeepUnpaid).toBe(48);
  });

  it("빈 구간은 아무것도 바꾸지 않는다", () => {
    const book = bookWithCredit(3, 10n);
    const result = settleOwnerPeriod(
      { ownerId: 3, jobs: [fresh], fromMs: HOUR, toMs: HOUR, offlineSinceMs: null },
      book,
      testSettleAccounts(book, 3),
    );
    expect(result).toEqual({ jobs: [fresh], cycles: 0, upkeepPaid: 0, upkeepUnpaid: 0 });
  });
});
