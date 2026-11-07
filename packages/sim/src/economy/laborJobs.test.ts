import { describe, expect, it } from "vitest";
import { createLedgerAudit } from "../ledger/audit.ts";
import { createLedgerBook } from "../ledger/ledgerBook.ts";
import { systemRule } from "../simulator/economyRun.ts";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import {
  OLD_LABOR_RULES,
  checkLaborEscrow,
  laborAccounts,
  settleLabor,
  terminateLabor,
} from "./laborContract.ts";
import {
  type LaborJobInput,
  acceptLaborJob,
  closeLaborJob,
  laborJobWage,
  postLaborJob,
} from "./laborJobs.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CUR = "s3_test_credit";
const EMPLOYER = 1;
const WORKER = 2;
const OTHER = 3;
const society = TEST_SOCIETY_COEFFICIENTS;
const rules = OLD_LABOR_RULES;
/** [임시] 서버 기준 효율(새 유닛 평균 1차 스탯) = 10, 단가 N27 2.0 → 하루 20 × 조정 */
const EFFICIENCY = 10;

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

function world(employer: bigint) {
  const audit = createLedgerAudit([], systemRule);
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
  if (employer > 0n)
    book.post({
      kind: "issue",
      atMs: 0,
      entries: [
        { account: book.systemAccount(`issue:${CUR}`, CUR), amount: -employer },
        { account: book.ownerAccount(EMPLOYER, CUR), amount: employer },
      ],
    });
  return { book, audit, accounts: laborAccounts(book) };
}

const posting = (over: Partial<LaborJobInput> = {}): LaborJobInput => ({
  id: 5,
  buildingId: 700,
  ownerId: EMPLOYER,
  job: "gather",
  asset: CUR,
  adjustPm: 1200,
  slots: 2,
  termHours: null,
  atMs: 0,
  ...over,
});

function post(over: Partial<LaborJobInput> = {}) {
  const result = postLaborJob(posting(over), society);
  if (!result.ok) throw new Error(result.code);
  return result.job;
}

const accept = (workerOwnerId: number, contractId: number, unitId: number, atMs = 0) => ({
  contractId,
  workerOwnerId,
  unitId,
  efficiency: EFFICIENCY,
  rateMilli: society.wageRateMilli,
  atMs,
});

describe("구인 게시 — 남의 유닛을 임금형으로(기획 338~342, 옛 production_routes 모집)", () => {
  it("조정이 N28 범위 밖이거나 자리·기간이 틀리면 내지 않는다", () => {
    expect(postLaborJob(posting({ adjustPm: 799 }), society)).toEqual({ ok: false, code: "invalid_terms" });
    expect(postLaborJob(posting({ adjustPm: 1501 }), society)).toEqual({ ok: false, code: "invalid_terms" });
    expect(postLaborJob(posting({ slots: 0 }), society)).toEqual({ ok: false, code: "invalid_terms" });
    expect(postLaborJob(posting({ termHours: 0 }), society)).toEqual({ ok: false, code: "invalid_terms" });
    expect(post().state).toBe("open");
  });

  it("임금 = 효율 × 단가(N27) × 조정(N28): 효율 10, 2.0, 1200‰ → 하루 24", () => {
    expect(laborJobWage(post(), EFFICIENCY, society.wageRateMilli, society, rules)).toBe(24n);
    expect(laborJobWage(post({ adjustPm: 800 }), EFFICIENCY, society.wageRateMilli, society, rules)).toBe(
      16n,
    );
  });

  it("받으면 고용주 = 시설 주인, 일꾼 = 받은 유닛 주인인 임금형 계약(보증금은 고용주 지갑, 첫 임금은 일꾼 주인에게)", () => {
    const { book, audit, accounts } = world(10_000n);
    const job = post({ termHours: 48 });
    const result = acceptLaborJob(job, accept(WORKER, 11, 70), book, accounts, rules, society);
    if (!result.ok) throw new Error(result.code);
    const c = result.contract;
    expect([c.kind, c.ownerId, c.workerOwnerId, c.unitId, c.buildingId, c.rate]).toEqual([
      "wage",
      EMPLOYER,
      WORKER,
      70,
      700,
      24n,
    ]);
    expect(c.endsAtMs).toBe(48 * HOUR);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(10_000n - 24n * 30n);
    expect(book.balanceOf(WORKER, CUR)).toBe(24n);
    expect(job.filled).toBe(1);
    expect(job.state).toBe("open");
    // 기간 끝: 남은 보증금이 고용주에게(일꾼 물건이 없어 유예 없음)
    settleLabor(c, 3 * DAY, book, accounts, rules);
    expect(c.state).toBe("ended");
    expect(c.endReason).toBe("expired");
    expect(book.balanceOf(WORKER, CUR)).toBe(48n);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(10_000n - 48n);
    expect(checkLaborEscrow([c], book)).toEqual([]);
    expect(audit.check(book.accounts())).toEqual([]);
  });

  it("자리가 다 차면 filled로 닫히고 더 받지 않는다. 자기 게시는 받지 않는다", () => {
    const { book, accounts } = world(10_000n);
    const job = post();
    expect(acceptLaborJob(job, accept(EMPLOYER, 11, 70), book, accounts, rules, society)).toEqual({
      ok: false,
      code: "invalid_terms",
    });
    expect(acceptLaborJob(job, accept(WORKER, 11, 70), book, accounts, rules, society).ok).toBe(true);
    expect(acceptLaborJob(job, accept(OTHER, 12, 71, HOUR), book, accounts, rules, society).ok).toBe(true);
    expect(job.state).toBe("filled");
    expect(job.closedAtMs).toBe(HOUR);
    expect(acceptLaborJob(job, accept(OTHER, 13, 72), book, accounts, rules, society)).toEqual({
      ok: false,
      code: "job_not_open",
    });
  });

  it("고용주 잔고가 보증금보다 적으면 맺지 않고 아무것도 바꾸지 않는다", () => {
    const { book, accounts } = world(24n * 30n - 1n);
    const job = post();
    expect(acceptLaborJob(job, accept(WORKER, 11, 70), book, accounts, rules, society)).toEqual({
      ok: false,
      code: "employer_insufficient_funds",
    });
    expect(job.filled).toBe(0);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(24n * 30n - 1n);
  });

  it("거두면 더 받지 않지만 이미 맺은 계약은 그대로(옛 is_accepting_workers). 양쪽 누구나 해지", () => {
    const { book, accounts } = world(10_000n);
    const job = post();
    const first = acceptLaborJob(job, accept(WORKER, 11, 70), book, accounts, rules, society);
    if (!first.ok) throw new Error(first.code);
    expect(closeLaborJob(job, HOUR, "withdrawn")).toBe(true);
    expect(closeLaborJob(job, HOUR, "gone")).toBe(false);
    expect(acceptLaborJob(job, accept(OTHER, 12, 71), book, accounts, rules, society)).toEqual({
      ok: false,
      code: "job_not_open",
    });
    expect(first.contract.state).toBe("active");
    // 일꾼 주인이 해지: 남은 보증금(30번 − 이미 낸 1번)은 고용주에게
    expect(terminateLabor(first.contract, 2 * HOUR, "worker", book, accounts, rules)).toBe(true);
    expect(book.balanceOf(EMPLOYER, CUR)).toBe(10_000n - 24n);
  });
});
