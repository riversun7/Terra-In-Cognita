import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { type LedgerBook, createLedgerBook } from "../ledger/ledgerBook.ts";
import { systemRule } from "../simulator/economyRun.ts";
import {
  type LaborContract,
  type LaborOpenInput,
  OLD_LABOR_RULES,
  checkLaborEscrow,
  depositCyclesLeft,
  laborAccounts,
  laborEscrowCode,
  laborWarning,
  openLabor,
  requiredDeposit,
  setLeaseRent,
  settleLabor,
  terminateLabor,
  topUpLabor,
  wagePerCycle,
} from "./laborContract.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CUR = "s3_test_credit";
const EMPLOYER = 1;
const WORKER = 2;
const ISSUED = 1_000_000n;
const rules = OLD_LABOR_RULES;

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

/** 고용주·일꾼 주인에게 돈을 준 장부 + 감사 */
function world(employer = ISSUED, worker = ISSUED) {
  const audit = createLedgerAudit([], systemRule);
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
  for (const [owner, amount] of [
    [EMPLOYER, employer],
    [WORKER, worker],
  ] as const) {
    if (amount === 0n) continue;
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${CUR}`, CUR), amount: -amount },
        { account: book.ownerAccount(owner, CUR), amount },
      ],
    });
  }
  return { book, audit, accounts: laborAccounts(book) };
}

const input = (over: Partial<LaborOpenInput> = {}): LaborOpenInput => ({
  id: 7,
  kind: "wage",
  ownerId: EMPLOYER,
  workerOwnerId: WORKER,
  unitId: 70,
  buildingId: 700,
  asset: CUR,
  rate: 20n,
  atMs: 0,
  endsAtMs: null,
  ...over,
});

function open(
  book: LedgerBook,
  accounts: ReturnType<typeof laborAccounts>,
  over: Partial<LaborOpenInput> = {},
) {
  const result = openLabor(input(over), book, accounts, rules);
  if (!result.ok) throw new Error(result.code);
  return result.contract;
}

/** 주체가 아닌 계정(시스템)을 뺀 돈 합 + 에스크로 = 발행한 양(돈은 만들거나 없애지 않는다) */
function ownerMoney(book: LedgerBook): bigint {
  let sum = 0n;
  for (const account of book.accounts()) {
    if (account.asset !== CUR) continue;
    if (account.ownerId !== null || account.systemCode?.startsWith("escrow:")) sum += account.balance;
  }
  return sum;
}

describe("노동 계약 — 임금형(옛 salary_engine·WAGE)", () => {
  it("맺으면 보증금 = 임금 × 30일이 에스크로로 가고 첫 임금을 바로 낸다(선불)", () => {
    const { book, audit, accounts } = world();
    const c = open(book, accounts);
    expect(requiredDeposit(20n, rules)).toBe(600n);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(ISSUED - 600n);
    expect(book.balanceOf(WORKER, CUR)).toBe(ISSUED + 20n);
    expect(book.balance(accounts.escrow(c))).toBe(580n);
    expect(c.deposit).toBe(580n);
    expect(c.nextDueMs).toBe(DAY);
    expect(checkLaborEscrow([c], book)).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("30번 내면 보증금이 0 → 다음 지급 시각에 자동 해고. 그동안 일하고 그 뒤는 자유", () => {
    const { book, audit, accounts } = world();
    const c = open(book, accounts);
    const segments = settleLabor(c, 40 * DAY, book, accounts, rules);
    expect(c.state).toBe("ended");
    expect(c.endReason).toBe("deposit_used_up");
    expect(c.endedAtMs).toBe(30 * DAY);
    expect(c.paidTotal).toBe(600n);
    expect(segments).toEqual([
      { untilMs: 30 * DAY, mode: "work" },
      { untilMs: 40 * DAY, mode: "free" },
    ]);
    expect(book.balanceOf(WORKER, CUR)).toBe(ISSUED + 600n);
    expect(ownerMoney(book)).toBe(2n * ISSUED);
    expect(checkLaborEscrow([c], book)).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("남은 보증금이 7일분 아래로 내려가면 경고(옛 DEPOSIT_WARNING_DAYS)", () => {
    const { book, accounts } = world();
    const c = open(book, accounts);
    settleLabor(c, 22 * DAY, book, accounts, rules);
    // 23번 냈다: 남은 7번 = 140 → 경고 아님
    expect(depositCyclesLeft(c)).toBe(7n);
    expect(laborWarning(c, rules)).toBe(false);
    settleLabor(c, 23 * DAY, book, accounts, rules);
    expect(depositCyclesLeft(c)).toBe(6n);
    expect(laborWarning(c, rules)).toBe(true);
  });

  it("한 번 임금에 모자라게 남으면 일시 중지(산출 없음), 채우면 바로 내고 다시 일한다", () => {
    const { book, audit, accounts } = world();
    const c = open(book, accounts);
    // 고용주가 15를 더 넣어 남는 몫이 15(< 20)가 되게 한다
    expect(topUpLabor(c, 15n, 0, book, accounts, rules)).toEqual({ ok: true });
    const first = settleLabor(c, 31 * DAY, book, accounts, rules);
    expect(c.state).toBe("paused");
    expect(c.deposit).toBe(15n);
    expect(first).toEqual([
      { untilMs: 30 * DAY, mode: "work" },
      { untilMs: 31 * DAY, mode: "idle" },
    ]);
    const at = 31 * DAY + 5 * HOUR;
    settleLabor(c, at, book, accounts, rules);
    expect(topUpLabor(c, 100n, at, book, accounts, rules)).toEqual({ ok: true });
    expect(c.state).toBe("active");
    expect(c.deposit).toBe(95n);
    expect(c.nextDueMs).toBe(at + DAY);
    expect(settleLabor(c, at + HOUR, book, accounts, rules)).toEqual([{ untilMs: at + HOUR, mode: "work" }]);
    expect(checkLaborEscrow([c], book)).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("해고하면 남은 보증금을 돌려준다(옛 fireMinion). 이미 끝난 계약은 다시 해지하지 않는다", () => {
    const { book, audit, accounts } = world();
    const c = open(book, accounts);
    expect(terminateLabor(c, 3 * DAY + 1, "owner", book, accounts, rules)).toBe(true);
    // 4번 냈다(0·1·2·3일)
    expect(c.paidTotal).toBe(80n);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(ISSUED - 80n);
    expect(book.balance(accounts.escrow(c))).toBe(0n);
    expect(c.endReason).toBe("owner");
    expect(terminateLabor(c, 4 * DAY, "worker", book, accounts, rules)).toBe(false);
    expect(checkLaborEscrow([c], book)).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("기간이 끝나면 만료(남은 보증금 돌려줌). 같은 시각의 지급보다 만료가 먼저다", () => {
    const { book, accounts } = world();
    const c = open(book, accounts, { endsAtMs: 2 * DAY });
    settleLabor(c, 5 * DAY, book, accounts, rules);
    expect(c.endReason).toBe("expired");
    expect(c.paidTotal).toBe(40n);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(ISSUED - 40n);
  });

  it("보증금이 모자라면 맺지 않고 아무것도 바꾸지 않는다", () => {
    const { book, accounts } = world(599n);
    expect(openLabor(input(), book, accounts, rules)).toEqual({ ok: false, code: "insufficient_funds" });
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(599n);
    expect(openLabor(input({ rate: 0n }), book, accounts, rules)).toEqual({
      ok: false,
      code: "invalid_terms",
    });
    expect(openLabor(input({ endsAtMs: 0 }), book, accounts, rules)).toEqual({
      ok: false,
      code: "invalid_terms",
    });
  });

  it("하루 임금 → 주기당 임금: 주기가 하루면 그대로, 1시간이면 24로 나눈 몫(최소 1)", () => {
    expect(wagePerCycle(20n, rules)).toBe(20n);
    expect(wagePerCycle(48n, { ...rules, wageCycleMs: HOUR })).toBe(2n);
    expect(wagePerCycle(5n, { ...rules, wageCycleMs: HOUR })).toBe(1n);
    expect(requiredDeposit(2n, { ...rules, wageCycleMs: HOUR })).toBe(2n * 720n);
  });
});

const lease = (over: Partial<LaborOpenInput> = {}) => input({ kind: "lease", rate: 10n, ...over });

describe("노동 계약 — 임대형(D-479 시간당, 옛 독점형)", () => {
  it("임차인이 매시간 먼저 내고 오너가 바로 받는다. 에스크로는 쓰지 않는다", () => {
    const { book, audit, accounts } = world(0n, 1000n);
    const result = openLabor(lease(), book, accounts, rules);
    if (!result.ok) throw new Error(result.code);
    const c = result.contract;
    settleLabor(c, 5 * HOUR + 1, book, accounts, rules);
    // 0·1·2·3·4·5시에 냈다
    expect(c.paidTotal).toBe(60n);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(60n);
    expect(book.balanceOf(WORKER, CUR)).toBe(940n);
    expect(book.balance(accounts.escrow(c))).toBe(0n);
    expect(checkLaborEscrow([c], book)).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("못 내면 해지 + 7일 유예, 유예가 끝나면 끝. 유예 동안 유닛은 계약에 묶이지 않는다", () => {
    const { book, audit, accounts } = world(0n, 25n);
    const result = openLabor(lease(), book, accounts, rules);
    if (!result.ok) throw new Error(result.code);
    const c = result.contract;
    const segments = settleLabor(c, 3 * HOUR, book, accounts, rules);
    expect(c.state).toBe("grace");
    expect(c.endReason).toBe("rent_unpaid");
    expect(c.endedAtMs).toBe(2 * HOUR);
    expect(c.graceUntilMs).toBe(2 * HOUR + 7 * DAY);
    expect(segments).toEqual([
      { untilMs: 2 * HOUR, mode: "work" },
      { untilMs: 3 * HOUR, mode: "free" },
    ]);
    settleLabor(c, 8 * DAY, book, accounts, rules);
    expect(c.state).toBe("ended");
    expect(c.endReason).toBe("rent_unpaid");
    expect(book.balanceOf(WORKER, CUR)).toBe(5n);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("기간이 끝나도 해지 + 유예(만료)", () => {
    const { book, accounts } = world(0n, 1000n);
    const result = openLabor(lease({ endsAtMs: 3 * HOUR }), book, accounts, rules);
    if (!result.ok) throw new Error(result.code);
    settleLabor(result.contract, 4 * HOUR, book, accounts, rules);
    expect(result.contract.state).toBe("grace");
    expect(result.contract.endReason).toBe("expired");
    expect(result.contract.paidTotal).toBe(30n);
  });

  it("오너가 임대료를 바꾸면 다음 시간부터", () => {
    const { book, accounts } = world(0n, 1000n);
    const result = openLabor(lease(), book, accounts, rules);
    if (!result.ok) throw new Error(result.code);
    const c = result.contract;
    settleLabor(c, HOUR / 2, book, accounts, rules);
    expect(setLeaseRent(c, 30n)).toBe(true);
    settleLabor(c, 2 * HOUR, book, accounts, rules);
    expect(c.paidTotal).toBe(10n + 30n + 30n);
    expect(setLeaseRent(c, 0n)).toBe(false);
  });

  it("첫 임대료를 못 내면 맺지 않는다. 손으로 해지하면 유예 없이 끝난다", () => {
    const { book, accounts } = world(0n, 9n);
    expect(openLabor(lease(), book, accounts, rules)).toEqual({ ok: false, code: "insufficient_funds" });
    const rich = world(0n, 1000n);
    const result = openLabor(lease(), rich.book, rich.accounts, rules);
    if (!result.ok) throw new Error(result.code);
    expect(terminateLabor(result.contract, HOUR / 2, "worker", rich.book, rich.accounts, rules)).toBe(true);
    expect(result.contract.state).toBe("ended");
    expect(result.contract.graceUntilMs).toBeNull();
  });
});

/** 같은 계약을 잘게 나눠 정산한 결과와 한 번에 정산한 결과(장부 잔고·상태·구간 합) */
function run(cuts: readonly number[], kind: "wage" | "lease") {
  const { book, audit, accounts } = world(ISSUED, 2000n);
  const result = openLabor(
    input({ kind, rate: kind === "wage" ? 20n : 7n, endsAtMs: 40 * DAY }),
    book,
    accounts,
    rules,
  );
  if (!result.ok) throw new Error(result.code);
  const c: LaborContract = result.contract;
  const modes: string[] = [];
  let workMs = 0;
  let from = 0;
  for (const cut of cuts) {
    for (const segment of settleLabor(c, cut, book, accounts, rules)) {
      if (segment.mode === "work") workMs += segment.untilMs - from;
      modes.push(segment.mode);
      from = segment.untilMs;
    }
  }
  return {
    state: { ...c },
    workMs,
    employer: book.balanceOf(EMPLOYER, CUR),
    worker: book.balanceOf(WORKER, CUR),
    escrow: book.balance(accounts.escrow(c)),
    problems: [...audit.check(book.accounts()), ...checkLaborEscrow([c], book)],
  };
}

describe("노동 계약 — 나눠 정산해도 같다·불변 조건", () => {
  it("임금형·임대형 모두: 한 번(50일)과 잘게 나눈 것이 같다", () => {
    const once = [50 * DAY];
    const pieces: number[] = [];
    for (let at = 7 * HOUR + 13; at < 50 * DAY; at += 5 * HOUR + 777) pieces.push(at);
    pieces.push(50 * DAY);
    for (const kind of ["wage", "lease"] as const) {
      const a = run(once, kind);
      const b = run(pieces, kind);
      expect(b).toEqual(a);
      expect(a.problems).toEqual([]);
    }
  });

  it("에스크로를 계약과 다르게 건드리면 I14가 잡는다", () => {
    const { book, accounts } = world();
    const c = open(book, accounts);
    c.deposit += 1n;
    expect(checkLaborEscrow([c], book)).toEqual(["I14 labor escrow differs from contract deposit: 1"]);
    expect(laborEscrowCode(7)).toBe("escrow:labor:7");
  });
});
