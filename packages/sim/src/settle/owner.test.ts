import { describe, expect, it } from "vitest";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  TEST_SYSTEM_ISSUE_CREDIT,
  bonusCycles,
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
    expect(result).toEqual({
      jobs: [fresh],
      cycles: 0,
      upkeepPaid: 0,
      upkeepUnpaid: 0,
      lastUpkeepPaid: null,
    });
  });

  it("마지막 유지비 경계를 냈는지 알려 준다(못 냈으면 사이보그 본체가 비효율로 돈다, D-453). 경계가 없으면 null", () => {
    const broke = bookWithCredit(4, 1n);
    // 유닛 하나(본체), 1시간 경계는 내고 2시간 경계는 못 냄
    const late = settleOwnerPeriod(
      { ownerId: 4, jobs: [idle], fromMs: 0, toMs: 2 * HOUR, offlineSinceMs: null },
      broke,
      testSettleAccounts(broke, 4),
    );
    expect([late.upkeepPaid, late.upkeepUnpaid, late.lastUpkeepPaid]).toEqual([1, 1, false]);
    const rich = bookWithCredit(4, 10n);
    const paid = settleOwnerPeriod(
      { ownerId: 4, jobs: [idle], fromMs: 0, toMs: 2 * HOUR, offlineSinceMs: null },
      rich,
      testSettleAccounts(rich, 4),
    );
    expect(paid.lastUpkeepPaid).toBe(true);
    const inside = settleOwnerPeriod(
      { ownerId: 4, jobs: [idle], fromMs: HOUR + 1, toMs: 2 * HOUR - 1, offlineSinceMs: null },
      rich,
      testSettleAccounts(rich, 4),
    );
    expect(inside.lastUpkeepPaid).toBeNull();
  });
});

describe("소유 주체 정산 — 산출 구간(노동 계약, docs/adr/2026-11-03-labor-contracts.md)", () => {
  it("구간대로 산출을 나누고(null = 일시 중지는 산출 없음), 직무 상태는 나누지 않은 것과 같다", () => {
    const plain = bookWithCredit(3, 100n);
    const whole = settleOwnerPeriod(
      { ownerId: 3, jobs: [fresh, fresh], fromMs: 0, toMs: 3 * HOUR, offlineSinceMs: null },
      plain,
      testSettleAccounts(plain, 3),
    );
    const book = bookWithCredit(3, 100n);
    const employerStock = () => book.ownerAccount(9, TEST_ASSET_ORE);
    const split = settleOwnerPeriod(
      {
        ownerId: 3,
        jobs: [fresh, fresh],
        fromMs: 0,
        toMs: 3 * HOUR,
        offlineSinceMs: null,
        // 첫 유닛: 1시간 고용주 몫 → 30분 일시 중지 → 나머지는 자기 몫. 둘째 유닛: 구간 없음(자기 몫)
        outputs: [
          [
            { untilMs: HOUR, stock: employerStock },
            { untilMs: HOUR + HOUR / 2, stock: null },
          ],
          undefined,
        ],
      },
      book,
      testSettleAccounts(book, 3),
    );
    expect(split.jobs).toEqual(whole.jobs);
    expect(split.upkeepPaid).toBe(whole.upkeepPaid);
    // 첫 유닛: 1시간 = 60주기는 고용주, 30분(30주기)은 사라지고, 나머지 일한 몫은 자기
    expect(book.balanceOf(9, TEST_ASSET_ORE)).toBe(60n);
    expect(split.discarded).toBe(30);
    expect(split.cycles).toBe(whole.cycles - 30);
    expect(book.balanceOf(3, TEST_ASSET_ORE)).toBe(BigInt(whole.cycles - 30 - 60));
    expect(whole.discarded).toBeUndefined();
  });

  it("계약 몫이 자기 창고와 같으면 한 항목으로 합친다(예전 거래 모양 그대로)", () => {
    const book = bookWithCredit(3, 10n);
    const posted: number[] = [];
    const stock = () => book.ownerAccount(3, TEST_ASSET_ORE);
    settleOwnerPeriod(
      {
        ownerId: 3,
        jobs: [fresh],
        fromMs: 0,
        toMs: HOUR,
        offlineSinceMs: null,
        outputs: [[{ untilMs: HOUR / 2, stock }]],
      },
      {
        ...book,
        post(tx) {
          if (tx.kind === "job_output") posted.push(tx.entries.length);
          return book.post(tx);
        },
      },
      testSettleAccounts(book, 3),
    );
    expect(posted).toEqual([2]);
    expect(book.balanceOf(3, TEST_ASSET_ORE)).toBe(60n);
  });

  it("구간 덤(수호신 생산 버프 bonusPm, 기획 답 470 가): ⌊산출 × ‰ ÷ 1000⌋ + 남은 몫 확률(해시) 1, 매장량에서 함께 나온다", () => {
    expect(bonusCycles(60, 100, 7)).toBe(6);
    expect(bonusCycles(0, 100, 7)).toBe(0);
    expect(bonusCycles(5, 0, 7)).toBe(0);
    // 남은 몫(5 × 100 = 500 → 0.5): 해시가 정해 0이나 1, 같은 입력이면 같다
    expect([0, 1]).toContain(bonusCycles(5, 100, 7));
    expect(bonusCycles(5, 100, 7)).toBe(bonusCycles(5, 100, 7));
    const ones = Array.from({ length: 1000 }, (_, salt) => bonusCycles(1, 300, salt)).filter((n) => n === 1);
    expect(ones.length).toBeGreaterThan(200);
    expect(ones.length).toBeLessThan(400);
    const book = bookWithCredit(3, 10n);
    const employer = () => book.ownerAccount(9, TEST_ASSET_ORE);
    const result = settleOwnerPeriod(
      {
        ownerId: 3,
        jobs: [fresh],
        fromMs: 0,
        toMs: HOUR,
        offlineSinceMs: null,
        outputs: [[{ untilMs: HOUR, stock: employer, bonusPm: 100 }]],
      },
      book,
      testSettleAccounts(book, 3),
    );
    // 1시간 = 60주기 + 덤 6 = 66, 매장량에서 66이 나온다
    expect(book.balanceOf(9, TEST_ASSET_ORE)).toBe(66n);
    expect(result.cycles).toBe(66);
  });

  it("진짜 물건 구간(goods): 그 구간 주기를 시험 광석 대신 부르는 쪽 줄(생산원 → 받는 계정)로 내고, 나머지 구간은 예전대로", () => {
    const book = bookWithCredit(3, 10n);
    const log: number[] = [];
    const source = () => book.systemAccount("source:item:pine_log", "item:pine_log");
    const city = () => book.ownerAccount(3, "item:pine_log", 7);
    const result = settleOwnerPeriod(
      {
        ownerId: 3,
        jobs: [fresh, fresh],
        fromMs: 0,
        toMs: HOUR,
        offlineSinceMs: null,
        outputs: [
          [
            {
              untilMs: HOUR,
              stock: () => {
                throw new Error("물건 구간은 시험 광석 계정을 만들지 않는다");
              },
              goods: (made) => {
                log.push(made);
                // 주기 10번마다 원목 1개
                return [{ source: source(), account: city(), qty: BigInt(Math.floor(made / 10)) }];
              },
            },
          ],
          undefined,
        ],
      },
      book,
      testSettleAccounts(book, 3),
    );
    expect(log).toEqual([60]);
    expect(book.balanceOf(3, "item:pine_log", 7)).toBe(6n);
    // 둘째 유닛(구간 없음)은 예전대로 시험 광석
    expect(book.balanceOf(3, TEST_ASSET_ORE)).toBe(60n);
    expect(result.cycles).toBe(120);
  });
});
