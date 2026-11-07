// 소유 주체 정산 — docs/adr/2026-10-31-s3-server-stage.md 4절 "정산 단위 = 소유 주체"
// 그 주체의 모든 유닛 직무와 유지비를 (fromMs, toMs] 구간으로 한 번에 계산하고 원장 장부에 거래로 넣는다.
// 서버(apps/server/src/world/settlement.ts)와 시뮬레이터가 같은 함수를 부른다(D-013: NPC도 유저와 같은 규칙).
// 나눠 정산해도 같다(settle.ts의 성질 + 경계 시각 차례대로 낸다, owner.test.ts).
// [임시] 시험 자산·시험 직무·유지비 수치는 기획 Step 5 전 시험값이다(R2 경제 코어에서 진짜 자산으로 바꾼다).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import { mix32 } from "../math/hash.ts";
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
  /**
   * 유지비 무게 합(‰, 보통 유닛 하나 = 1000). 유지비 = ⌊유닛당 유지비 × 무게 ÷ 1000⌋. 없으면 유닛 수 × 1000(예전과 같다).
   * 사이보그 유닛은 비싸다(D-470, society/fusion.ts upkeepWeightPm)
   */
  readonly upkeepWeightPm?: number | undefined;
  /**
   * 유닛마다 산출이 가는 곳을 구간으로 나눈다(노동 계약, docs/adr/2026-11-03-labor-contracts.md). 입력 jobs와 같은 차례.
   * 구간은 fromMs부터 차례로 덮고, 마지막 구간 뒤는 accounts.stock()이다. stock이 null이면 그 구간 산출은 없다(일시 중지).
   * 직무 상태는 나눠 정산해도 같다(settle.ts). 없으면 모두 accounts.stock() — 예전과 같은 거래 하나
   */
  readonly outputs?: readonly (readonly OutputSegment[] | undefined)[] | undefined;
}

/**
 * 산출 구간: 직전 구간 끝부터 untilMs까지의 산출이 stock 계정으로 간다(null = 산출 없음). bonusPm = 그 구간 산출 더하기 ‰(서버 수호신 생산
 * 버프, 기획 답 470 가 — 없거나 0이면 예전과 같다. 시뮬은 쓰지 않는다)
 */
export interface OutputSegment {
  readonly untilMs: number;
  readonly stock: (() => number) | null;
  readonly bonusPm?: number | undefined;
  /**
   * 진짜 물건 산출(서버 채집 시설 직무, docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 있으면 그 구간에 끝난 일 주기(덤 포함)를
   * 시험 광석 대신 이 함수에 넘기고, 돌려준 줄(생산원 → 받는 계정)을 같은 산출 거래에 넣는다. 주기 → 물건 셈(진행 쌓기·티어 추첨)은 부르는
   * 쪽이 한다. stock이 null이면 부르지 않는다(산출 없음). 시뮬은 쓰지 않는다(없으면 예전과 같다)
   */
  readonly goods?: ((made: number) => readonly GoodsLine[]) | undefined;
}

/** 진짜 물건 산출 한 줄: source(생산원 시스템 계정) → account(받는 계정)로 qty(기본 단위). 두 계정은 같은 자산이어야 한다 */
export interface GoodsLine {
  readonly source: number;
  readonly account: number;
  readonly qty: bigint;
}

/**
 * 산출 더하기 ‰의 덤 개수: ⌊산출 × ‰ ÷ 1000⌋ + (남은 몫 ÷ 1000 확률로 1). 확률은 salt의 해시로 정해 같은 입력이면 같다(시드 난수·Math.random
 * 없음). 정산을 나누는 자리가 다르면 덤 개수가 조금 달라질 수 있다(기댓값은 같다) [임시]
 */
export function bonusCycles(cycles: number, bonusPm: number, salt: number): number {
  if (cycles <= 0 || bonusPm <= 0) return 0;
  const scaled = cycles * Math.floor(bonusPm);
  const whole = Math.floor(scaled / 1000);
  return whole + (mix32(salt) % 1000 < scaled % 1000 ? 1 : 0);
}

export interface OwnerSettleResult {
  /** 새 직무 상태(입력과 같은 차례) */
  readonly jobs: readonly JobState[];
  /** 끝난 일 주기(= 산출 수) */
  readonly cycles: number;
  readonly upkeepPaid: number;
  readonly upkeepUnpaid: number;
  /**
   * 구간의 마지막 유지비 경계를 냈는가(경계가 없거나 낼 것이 없으면 null = 그대로). 못 냈으면 사이보그 본체가 효율 불이익으로
   * 돈다(D-453, society/cyborgUpkeep.ts). 부르는 쪽이 상태로 적는다
   */
  readonly lastUpkeepPaid: boolean | null;
  /** 일시 중지 구간이라 내지 않은 일 주기(노동 계약, cycles에 들지 않는다). 0이면 칸이 없다 */
  readonly discarded?: number | undefined;
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
  if (toMs <= fromMs)
    return { jobs: input.jobs, cycles: 0, upkeepPaid: 0, upkeepUnpaid: 0, lastUpkeepPaid: null };
  const rules = input.rules ?? TEST_JOB_RULES;
  let cycles = 0;
  // 계약 몫으로 간 산출(계정 → 수, 처음 나온 차례). 기본 창고 몫은 cycles − 물건 산출 주기 − 이 합
  const routed = new Map<number, number>();
  let routedTotal = 0;
  let discarded = 0;
  // 진짜 물건으로 바꾼 주기와 그 줄(생산원·받는 계정마다 합, 처음 나온 차례)
  let goodsCycles = 0;
  const goodsFrom = new Map<number, bigint>();
  const goodsTo = new Map<number, bigint>();
  const jobs = input.jobs.map((job, index) => {
    if (job.job === JOB_NONE) return job;
    const segments = input.outputs?.[index];
    if (!segments || segments.length === 0) {
      const result = settleJob(job, fromMs, toMs, input.offlineSinceMs, rules);
      cycles += result.cycles;
      return result.state;
    }
    let state = job;
    let from = fromMs;
    for (const segment of segments) {
      const until = Math.min(segment.untilMs, toMs);
      if (until <= from) continue;
      const result = settleJob(state, from, until, input.offlineSinceMs, rules);
      state = result.state;
      from = until;
      if (result.cycles === 0) continue;
      if (segment.stock === null) {
        discarded += result.cycles;
        continue;
      }
      // 수호신 생산 버프(서버만): 덤은 같은 계정으로, 매장량에서 함께 나온다
      const made =
        result.cycles +
        bonusCycles(
          result.cycles,
          segment.bonusPm ?? 0,
          Math.imul(input.ownerId, 0x9e37_79b1) ^ Math.imul(index + 1, 0x85eb_ca6b) ^ (until % 0x1_0000_0000),
        );
      cycles += made;
      if (segment.goods) {
        // 진짜 물건(서버 채집 직무): 시험 광석 대신 부르는 쪽이 정한 물건 줄
        goodsCycles += made;
        for (const line of segment.goods(made)) {
          if (line.qty <= 0n) continue;
          goodsFrom.set(line.source, (goodsFrom.get(line.source) ?? 0n) + line.qty);
          goodsTo.set(line.account, (goodsTo.get(line.account) ?? 0n) + line.qty);
        }
        continue;
      }
      const account = segment.stock();
      routedTotal += made;
      routed.set(account, (routed.get(account) ?? 0) + made);
    }
    if (from < toMs) {
      const result = settleJob(state, from, toMs, input.offlineSinceMs, rules);
      state = result.state;
      cycles += result.cycles;
    }
    return state;
  });
  let upkeepPaid = 0;
  let upkeepUnpaid = 0;
  let lastUpkeepPaid: boolean | null = null;
  const perUnit = input.upkeepPerUnit ?? TEST_UPKEEP_PER_UNIT;
  const charge =
    input.upkeepWeightPm === undefined
      ? BigInt(input.jobs.length) * perUnit
      : (perUnit * BigInt(Math.max(0, input.upkeepWeightPm))) / 1000n;
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
    lastUpkeepPaid = result.paid.at(-1) === boundaries.at(-1);
  }
  const oreCycles = cycles - goodsCycles;
  const entries: { account: number; amount: bigint }[] = [];
  if (oreCycles > 0) {
    // 산출 거래 하나: 매장량 → 기본 창고(+ 계약 몫 창고들). 계약 몫이 없으면 예전과 같은 두 항목
    entries.push({ account: accounts.reserve(), amount: -BigInt(oreCycles) });
    const own = oreCycles - routedTotal;
    if (own > 0) {
      // 계약 몫이 기본 창고와 같은 계정이면(자기 시설·자기 임대) 한 항목으로 합친다
      const stock = accounts.stock();
      entries.push({ account: stock, amount: BigInt(own + (routed.get(stock) ?? 0)) });
      routed.delete(stock);
    }
    for (const [account, count] of routed) entries.push({ account, amount: BigInt(count) });
  }
  // 진짜 물건 줄(서버 채집 직무): 생산원 → 받는 계정. 물건이 없으면 예전과 같은 거래
  for (const [account, qty] of goodsFrom) entries.push({ account, amount: -qty });
  for (const [account, qty] of goodsTo) entries.push({ account, amount: qty });
  if (entries.length > 0) book.post({ kind: "job_output", atMs: toMs, entries });
  return { jobs, cycles, upkeepPaid, upkeepUnpaid, lastUpkeepPaid, ...(discarded > 0 ? { discarded } : {}) };
}
