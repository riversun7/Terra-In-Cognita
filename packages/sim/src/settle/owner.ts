// 소유 주체 정산 — docs/adr/2026-10-31-s3-server-stage.md 4절 "정산 단위 = 소유 주체"
// 그 주체의 모든 유닛 직무와 유지비를 (fromMs, toMs] 구간으로 한 번에 계산하고 원장 장부에 거래로 넣는다.
// 서버(apps/server/src/world/settlement.ts)와 시뮬레이터가 같은 함수를 부른다(D-013: NPC도 유저와 같은 규칙).
// 나눠 정산해도 같다(settle.ts의 성질 + 경계 시각 차례대로 낸다, owner.test.ts).
// [임시] 시험 자산·시험 직무·유지비 수치는 기획 Step 5 전 시험값이다(R2 경제 코어에서 진짜 자산으로 바꾼다).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import {
  type JobRules,
  type JobState,
  JOB_NONE,
  TEST_JOB_RULES,
  TEST_UPKEEP_PER_UNIT,
  UPKEEP_PERIOD_MS,
  settleJob,
  settleUpkeep,
  upkeepBoundaries,
} from "./settle.ts";

/** [임시] 시험 자산 코드(이름에 임시임이 보이게) */
export const TEST_ASSET_CREDIT = "s3_test_credit";
export const TEST_ASSET_ORE = "s3_test_ore";
/** 시스템 계정: 발행, 유지비가 사라지는 곳, 산출이 나오는 행성 매장량(D-112·D-116) */
export const TEST_SYSTEM_ISSUE_CREDIT = `issue:${TEST_ASSET_CREDIT}`;
export const TEST_SYSTEM_SINK_CREDIT = `sink:${TEST_ASSET_CREDIT}`;
export const TEST_SYSTEM_RESERVE_ORE = `reserve:${TEST_ASSET_ORE}`;

/** 정산이 쓰는 계정. 필요할 때만 만든다(쓰지 않는 계정 행을 만들지 않게) */
export interface SettleAccounts {
  /** 유지비를 내는 지갑 */
  wallet(): number;
  /** 유지비가 사라지는 곳 */
  sink(): number;
  /** 산출이 나오는 곳 */
  reserve(): number;
  /** 산출이 쌓이는 창고 */
  stock(): number;
}

/** 시험 자산으로 주체의 정산 계정 */
export function testSettleAccounts(book: LedgerBook, ownerId: number): SettleAccounts {
  return {
    wallet: () => book.ownerAccount(ownerId, TEST_ASSET_CREDIT),
    sink: () => book.systemAccount(TEST_SYSTEM_SINK_CREDIT, TEST_ASSET_CREDIT),
    reserve: () => book.systemAccount(TEST_SYSTEM_RESERVE_ORE, TEST_ASSET_ORE),
    stock: () => book.ownerAccount(ownerId, TEST_ASSET_ORE),
  };
}

export interface OwnerSettleInput {
  readonly ownerId: number;
  /** 그 주체의 모든 유닛 직무(직무 없는 유닛도 유지비는 낸다) */
  readonly jobs: readonly JobState[];
  readonly fromMs: number;
  readonly toMs: number;
  /** 구간 동안의 접속 상태(접속 중 = null). 구간 안에서 바뀌지 않아야 한다 */
  readonly offlineSinceMs: number | null;
  readonly rules?: JobRules | undefined;
  readonly upkeepPerUnit?: bigint | undefined;
  readonly upkeepPeriodMs?: number | undefined;
}

export interface OwnerSettleResult {
  /** 새 직무 상태(입력과 같은 차례) */
  readonly jobs: readonly JobState[];
  /** 끝난 일 주기(= 산출 수) */
  readonly cycles: number;
  readonly upkeepPaid: number;
  readonly upkeepUnpaid: number;
}

/**
 * 주체 하나를 (fromMs, toMs] 정산한다. 유지비는 경계마다 거래 하나(중복 방지 키 upkeep:<주체>:<경계 ms>),
 * 산출은 정산마다 거래 하나(job_output, toMs). 밀린 횟수·정산 시각은 부르는 쪽이 적는다.
 */
export function settleOwnerPeriod(
  input: OwnerSettleInput,
  book: LedgerBook,
  accounts: SettleAccounts,
): OwnerSettleResult {
  const { fromMs, toMs } = input;
  if (toMs <= fromMs) return { jobs: input.jobs, cycles: 0, upkeepPaid: 0, upkeepUnpaid: 0 };
  const rules = input.rules ?? TEST_JOB_RULES;
  let cycles = 0;
  const jobs = input.jobs.map((job) => {
    if (job.job === JOB_NONE) return job;
    const result = settleJob(job, fromMs, toMs, input.offlineSinceMs, rules);
    cycles += result.cycles;
    return result.state;
  });
  let upkeepPaid = 0;
  let upkeepUnpaid = 0;
  const charge = BigInt(input.jobs.length) * (input.upkeepPerUnit ?? TEST_UPKEEP_PER_UNIT);
  const boundaries = upkeepBoundaries(fromMs, toMs, input.upkeepPeriodMs ?? UPKEEP_PERIOD_MS);
  if (charge > 0n && boundaries.length > 0) {
    const wallet = accounts.wallet();
    const sink = accounts.sink();
    const result = settleUpkeep(book.balance(wallet), charge, boundaries);
    for (const at of result.paid) {
      book.post({
        kind: "upkeep",
        atMs: at,
        key: `upkeep:${input.ownerId}:${at}`,
        entries: [
          { account: wallet, amount: -charge },
          { account: sink, amount: charge },
        ],
      });
    }
    upkeepPaid = result.paid.length;
    upkeepUnpaid = result.unpaid;
  }
  if (cycles > 0) {
    const amount = BigInt(cycles);
    book.post({
      kind: "job_output",
      atMs: toMs,
      entries: [
        { account: accounts.reserve(), amount: -amount },
        { account: accounts.stock(), amount },
      ],
    });
  }
  return { jobs, cycles, upkeepPaid, upkeepUnpaid };
}
