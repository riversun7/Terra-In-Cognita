// 노동 계약(임금형·임대형) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479(분배형 없음)·49 N48(옛 규칙 = 출발값, D-507)
// 서버(apps/server/src/labor/)와 시뮬레이터가 같은 함수를 쓴다(D-013). 돈은 원장 장부로만 옮긴다(만들거나 없애지 않는다).
// - 임금형: 고용주(시설 주인)가 계약할 때 보증금(임금 × N48 날수, 옛 salary_engine.js DEPOSIT_DAYS 30)을 에스크로
//   escrow:labor:<계약 ID>에 넣는다. 임금 주기마다 그 주기 몫을 먼저(선불) 보증금에서 일꾼 지갑으로 낸다.
//   보증금이 0이면 자동 해고(옛 salary_engine.js processPayroll "보증금 소진 → 자동 해고"), 0보다 많지만 한 번 임금에 모자라면
//   일시 중지(옛 ContractDistributor.js INSUFFICIENT_WAGE_BUDGET). 채우면 바로 다시 일한다(옛 ProductionRepository 자동 재개).
//   해고·만료면 남은 보증금을 고용주에게 돌려준다(옛 fireMinion). 산출은 고용주 몫(옛 "100% 건물 창고").
// - 임대형: 임차인(유닛 소유 주체)이 시설을 빌린다. 시간당 임대료(오너가 정함, D-479)를 매시간 먼저(선불) 임차인 지갑에서 오너
//   지갑으로 바로 낸다. 산출은 임차인 몫. 못 내거나 기간이 끝나거나 손으로 해지하면(어느 쪽이든, 기획 341) 유예(N48 7일, 옛 독점형
//   grace_expires_at)에 든다. 유예는 시설 창고에 남은 임차인 물건을 가져갈 기간이다. 유예 없이 물건이 시설 주인에게 가면 점령이
//   아닌 소유 이전이 된다(D-161, 시설 주인이 해지해 임차인 물건을 가져가는 길을 막는다). 유예는 시각으로만 끝난다(손으로 일찍
//   끝내지 않는다, 옛 자정 일괄 처리처럼). 유예가 끝나면 남은 물건이 시설 주인 창고로 넘어간다(옛 StorageUtils.js:286-298
//   expireGraceStorage) — 그 시각을 leftoversMovedAtMs에 적는다. 시설 창고가 아직 없어 옮길 물건은 없다(규칙·기록만).
//   시설이 사라지면(building_gone) 옮길 곳이 없어 유예 없이 끝난다.
// - 임금형은 산출이 모두 고용주 몫이라(옛 ContractDistributor.js:129-130) 시설에 일꾼 물건이 남지 않는다 → 손 해지도 유예 없이 끝.
// - 해지는 시설 주인·유닛 소유 주체가 언제든(옛 production_routes.js:407). 기간은 선택 칸, 위약금은 없다(옛 규칙 없음).
// - 지급 시각마다 거래 하나(중복 방지 키 labor:<계약>:<시각>). 정산은 (지난 정산, toMs]를 시각 차례대로 돌고, 그 사이 유닛이
//   일했는지(구간)를 돌려준다 → 부르는 쪽이 직무 산출을 계약 몫으로 나눈다(settle/owner.ts outputs).
// - 정수·BigInt만 쓴다. 난수·시계는 쓰지 않는다.
import type { LedgerBook } from "../ledger/ledgerBook.ts";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** 노동 계약 칸(49 N48). 출발값 = 옛 규칙 */
export interface LaborRules {
  /** 임금 주기(ms). 옛 salary_engine.js processPayroll = 하루 한 번 */
  readonly wageCycleMs: number;
  /** 보증금 = 임금 × 이 날수만큼의 주기(옛 DEPOSIT_DAYS 30) */
  readonly depositDays: number;
  /** 남은 보증금이 이 날수만큼의 임금보다 적으면 경고(옛 DEPOSIT_WARNING_DAYS 7) */
  readonly warnDays: number;
  /** 임대료 주기(ms). D-479 "시간당"(옛 독점형은 하루였으나 D-479가 이긴다) */
  readonly rentCycleMs: number;
  /** 임대형 미납·만료 뒤 유예(ms, 옛 독점형 7일) */
  readonly graceMs: number;
}

export const OLD_LABOR_RULES: LaborRules = {
  wageCycleMs: DAY_MS,
  depositDays: 30,
  warnDays: 7,
  rentCycleMs: HOUR_MS,
  graceMs: 7 * DAY_MS,
};

export const LABOR_KINDS = ["wage", "lease"] as const;
export type LaborKind = (typeof LABOR_KINDS)[number];

/** active 일함, paused 일시 중지(임금형 보증금 모자람), grace 해지 뒤 유예(임대형: 미납·만료·손 해지·유닛 사라짐), ended 끝 */
export const LABOR_STATES = ["active", "paused", "grace", "ended"] as const;
export type LaborState = (typeof LABOR_STATES)[number];

/** owner 시설 주인이 해지, worker 유닛 소유 주체가 해지, deposit_used_up 보증금을 다 씀(자동 해고), rent_unpaid 임대료 미납,
 *  expired 기간 끝, unit_gone·building_gone 유닛·시설이 사라짐 */
export const LABOR_END_REASONS = [
  "owner",
  "worker",
  "deposit_used_up",
  "rent_unpaid",
  "expired",
  "unit_gone",
  "building_gone",
] as const;
export type LaborEndReason = (typeof LABOR_END_REASONS)[number];

export interface LaborContract {
  readonly id: number;
  readonly kind: LaborKind;
  /** 시설(건물) 주인 주체: 임금형의 고용주, 임대형의 임대인 */
  readonly ownerId: number;
  /** 일하는 유닛의 소유 주체: 임대형의 임차인 */
  readonly workerOwnerId: number;
  readonly unitId: number;
  readonly buildingId: number;
  /** 화폐 자산 코드 */
  readonly asset: string;
  /** 임금형 = 주기당 임금, 임대형 = 시간당 임대료(오너가 바꾸면 다음 시간부터) */
  rate: bigint;
  /** 임금형 보증금 잔액(에스크로 계정 잔고와 같다, 불변 조건). 임대형은 0 */
  deposit: bigint;
  readonly startedAtMs: number;
  /** 기간 끝(선택). null = 기간 없음 */
  readonly endsAtMs: number | null;
  /** 이 시각까지 정산했다 */
  settledAtMs: number;
  /** 다음 지급 시각(선불: 이 시각부터 한 주기 몫을 낸다) */
  nextDueMs: number;
  state: LaborState;
  /** 유예 끝(임대형 해지 뒤). 유예가 아니면 null */
  graceUntilMs: number | null;
  /** 해지된 시각(유예에 들 때도 그 시각) */
  endedAtMs: number | null;
  endReason: LaborEndReason | null;
  /** 지금까지 낸 임금·임대료 합 */
  paidTotal: bigint;
  /**
   * 유예가 끝나 시설 창고에 남은 임차인 물건이 시설 주인 창고로 넘어간 시각(옛 StorageUtils.js expireGraceStorage).
   * 유예를 거치지 않고 끝났거나 아직이면 null. 시설 창고가 아직 없어 넘어간 물건은 없다(기록만)
   */
  leftoversMovedAtMs: number | null;
}

/**
 * 계약이 쓰는 계정. 쓸 때만 만든다.
 * workerWallet = 임금을 받는 곳: 휴먼 지갑(D-097). 휴먼 지갑이 없는 곳(서버)은 유닛 소유 주체 지갑이다[임시]
 */
export interface LaborAccounts {
  owner(contract: LaborContract): number;
  workerOwner(contract: LaborContract): number;
  workerWallet(contract: LaborContract): number;
  escrow(contract: LaborContract): number;
}

/** 보증금 에스크로 시스템 계정 코드 */
export function laborEscrowCode(contractId: number): string {
  return `escrow:labor:${contractId}`;
}

/**
 * owner = 시설 주인 쪽 계정(보증금·채우기를 내고, 돌려받고, 임대료를 받는 곳). 빠지면 시설 주인 지갑(시뮬 — 노동 계약을 돌리지 않는다).
 * 서버는 그 시설의 사업장 금고를 넘긴다(기획 D-548·D-555 1504, docs/adr/2026-11-15-business-ledger.md)
 */
export function laborAccounts(
  book: LedgerBook,
  workerWallet?: (contract: LaborContract) => number,
  owner?: (contract: LaborContract) => number,
): LaborAccounts {
  const workerOwner = (c: LaborContract): number => book.ownerAccount(c.workerOwnerId, c.asset);
  return {
    owner: owner ?? ((c) => book.ownerAccount(c.ownerId, c.asset)),
    workerOwner,
    workerWallet: workerWallet ?? workerOwner,
    escrow: (c) => book.systemAccount(laborEscrowCode(c.id), c.asset),
  };
}

/** 날수 → 주기 수(올림, 최소 1) */
function cyclesIn(days: number, cycleMs: number): bigint {
  return BigInt(Math.max(1, Math.ceil((days * DAY_MS) / Math.max(1, cycleMs))));
}

/** 임금형 보증금 = 주기당 임금 × (N48 보증금 날수의 주기 수) */
export function requiredDeposit(perCycle: bigint, rules: LaborRules): bigint {
  return perCycle * cyclesIn(rules.depositDays, rules.wageCycleMs);
}

/** 남은 보증금 경고(옛 7일분 미만). 임금형이 일하거나 멈춘 동안만 */
export function laborWarning(contract: LaborContract, rules: LaborRules): boolean {
  if (contract.kind !== "wage" || (contract.state !== "active" && contract.state !== "paused")) return false;
  return contract.deposit < contract.rate * cyclesIn(rules.warnDays, rules.wageCycleMs);
}

/** 남은 보증금으로 낼 수 있는 주기 수(임금형) */
export function depositCyclesLeft(contract: LaborContract): bigint {
  return contract.kind === "wage" && contract.rate > 0n ? contract.deposit / contract.rate : 0n;
}

/**
 * 하루 임금 → 주기당 임금. 주기가 하루면 그대로(옛 규칙). 아니면 ⌊하루 × 주기 ÷ 하루⌋, 최소 1
 */
export function wagePerCycle(dailyWage: bigint, rules: LaborRules): bigint {
  if (rules.wageCycleMs === DAY_MS) return dailyWage;
  const value = (dailyWage * BigInt(rules.wageCycleMs)) / BigInt(DAY_MS);
  return value > 0n ? value : 1n;
}

/**
 * 구간: 직전 구간 끝(처음은 settledAtMs)부터 untilMs까지 유닛이 무엇을 했나.
 * work = 계약대로 일함(산출은 임금형이면 고용주, 임대형이면 임차인), idle = 일시 중지(산출 없음),
 * free = 계약에 묶이지 않음(유예·끝: 산출은 유닛 소유 주체, 계약 없는 유닛과 같다)
 */
export type LaborMode = "work" | "idle" | "free";
export interface LaborSegment {
  readonly untilMs: number;
  readonly mode: LaborMode;
}

function modeOf(state: LaborState): LaborMode {
  if (state === "active") return "work";
  return state === "paused" ? "idle" : "free";
}

function nextEventMs(c: LaborContract): number {
  if (c.state === "grace") return c.graceUntilMs ?? Number.POSITIVE_INFINITY;
  if (c.state === "ended") return Number.POSITIVE_INFINITY;
  return c.endsAtMs === null ? c.nextDueMs : Math.min(c.nextDueMs, c.endsAtMs);
}

function refund(c: LaborContract, atMs: number, book: LedgerBook, accounts: LaborAccounts): void {
  if (c.deposit <= 0n) return;
  const amount = c.deposit;
  book.post({
    kind: "labor_refund",
    atMs,
    key: `labor_refund:${c.id}`,
    entries: [
      { account: accounts.escrow(c), amount: -amount },
      { account: accounts.owner(c), amount },
    ],
  });
  c.deposit = 0n;
}

function end(c: LaborContract, atMs: number, reason: LaborEndReason): void {
  c.state = "ended";
  c.graceUntilMs = null;
  c.endedAtMs = atMs;
  c.endReason = reason;
}

/** 해지하고 유예에 든다(임대형 미납·만료·손 해지·유닛 사라짐) */
function enterGrace(c: LaborContract, atMs: number, reason: LaborEndReason, rules: LaborRules): void {
  c.state = "grace";
  c.graceUntilMs = atMs + rules.graceMs;
  c.endedAtMs = atMs;
  c.endReason = reason;
}

/** 지급 시각 하나(선불) */
function payDue(
  c: LaborContract,
  at: number,
  book: LedgerBook,
  accounts: LaborAccounts,
  rules: LaborRules,
): void {
  if (c.kind === "wage") {
    c.nextDueMs = at + rules.wageCycleMs;
    if (c.deposit >= c.rate) {
      book.post({
        kind: "labor_wage",
        atMs: at,
        key: `labor:${c.id}:${at}`,
        entries: [
          { account: accounts.escrow(c), amount: -c.rate },
          { account: accounts.workerWallet(c), amount: c.rate },
        ],
      });
      c.deposit -= c.rate;
      c.paidTotal += c.rate;
      c.state = "active";
    } else if (c.deposit === 0n) {
      end(c, at, "deposit_used_up");
    } else {
      c.state = "paused";
    }
    return;
  }
  const payer = accounts.workerOwner(c);
  if (book.balance(payer) < c.rate) {
    enterGrace(c, at, "rent_unpaid", rules);
    return;
  }
  book.post({
    kind: "labor_rent",
    atMs: at,
    key: `labor:${c.id}:${at}`,
    entries: [
      { account: payer, amount: -c.rate },
      { account: accounts.owner(c), amount: c.rate },
    ],
  });
  c.paidTotal += c.rate;
  c.nextDueMs = at + rules.rentCycleMs;
}

/**
 * 계약 하나를 toMs까지 정산한다: (settledAtMs, toMs] 안의 지급·만료·유예 끝을 시각 차례대로. 같은 시각이면 만료가 먼저다.
 * 돌려주는 구간은 그 사이 유닛이 한 일이다(겹치는 모양은 합친다). 나눠 정산해도 같다(시각마다 한 번, 상태는 계약에 있다).
 */
export function settleLabor(
  c: LaborContract,
  toMs: number,
  book: LedgerBook,
  accounts: LaborAccounts,
  rules: LaborRules,
): LaborSegment[] {
  const segments: LaborSegment[] = [];
  const push = (untilMs: number): void => {
    if (untilMs <= c.settledAtMs) return;
    const mode = modeOf(c.state);
    const last = segments.at(-1);
    if (last && last.mode === mode) segments[segments.length - 1] = { untilMs, mode };
    else segments.push({ untilMs, mode });
    c.settledAtMs = untilMs;
  };
  for (;;) {
    const at = nextEventMs(c);
    if (at > toMs) break;
    push(at);
    if (c.state === "grace") {
      // 유예 끝: 남은 물건이 시설 주인에게 넘어간다(기록만)
      c.state = "ended";
      c.graceUntilMs = null;
      c.leftoversMovedAtMs = at;
    } else if (c.endsAtMs !== null && at >= c.endsAtMs) {
      if (c.kind === "wage") {
        refund(c, at, book, accounts);
        end(c, at, "expired");
      } else enterGrace(c, at, "expired", rules);
    } else payDue(c, at, book, accounts, rules);
  }
  push(toMs);
  return segments;
}

export type LaborFailure = "invalid_terms" | "insufficient_funds" | "not_open";

export interface LaborOpenInput {
  readonly id: number;
  readonly kind: LaborKind;
  readonly ownerId: number;
  readonly workerOwnerId: number;
  readonly unitId: number;
  readonly buildingId: number;
  readonly asset: string;
  /** 임금형 주기당 임금 또는 임대형 시간당 임대료 */
  readonly rate: bigint;
  readonly atMs: number;
  readonly endsAtMs: number | null;
  /**
   * 임금형 보증금(선택). 빠지면 requiredDeposit(N48 날수 전부 — 시뮬·옛 길). 서버는 사업장 금고에 있는 만큼만 묶는다(기획 D-564 1624 "보증금은
   * 있는 만큼만") — 한 주기 임금(rate) 아래로는 받지 않고(invalid_terms), 전부 날수보다 많아도 전부 날수까지만 묶는다
   */
  readonly deposit?: bigint | undefined;
}

/**
 * 계약을 맺는다: 임금형은 보증금을 에스크로에 넣고, 둘 다 첫 주기 몫을 바로 낸다(선불).
 * 고용주 잔고가 보증금보다 적거나 임차인 잔고가 첫 임대료보다 적으면 아무것도 바꾸지 않고 insufficient_funds
 */
export function openLabor(
  input: LaborOpenInput,
  book: LedgerBook,
  accounts: LaborAccounts,
  rules: LaborRules,
): { ok: true; contract: LaborContract } | { ok: false; code: LaborFailure } {
  if (input.rate <= 0n || (input.endsAtMs !== null && input.endsAtMs <= input.atMs))
    return { ok: false, code: "invalid_terms" };
  const contract: LaborContract = {
    id: input.id,
    kind: input.kind,
    ownerId: input.ownerId,
    workerOwnerId: input.workerOwnerId,
    unitId: input.unitId,
    buildingId: input.buildingId,
    asset: input.asset,
    rate: input.rate,
    startedAtMs: input.atMs,
    endsAtMs: input.endsAtMs,
    deposit: 0n,
    settledAtMs: input.atMs,
    nextDueMs: input.atMs,
    state: "active",
    graceUntilMs: null,
    endedAtMs: null,
    endReason: null,
    paidTotal: 0n,
    leftoversMovedAtMs: null,
  };
  if (input.kind === "wage") {
    const full = requiredDeposit(input.rate, rules);
    if (input.deposit !== undefined && input.deposit < input.rate)
      return { ok: false, code: "invalid_terms" };
    const deposit = input.deposit === undefined || input.deposit > full ? full : input.deposit;
    const wallet = accounts.owner(contract);
    if (book.balance(wallet) < deposit) return { ok: false, code: "insufficient_funds" };
    book.post({
      kind: "labor_deposit",
      atMs: input.atMs,
      entries: [
        { account: wallet, amount: -deposit },
        { account: accounts.escrow(contract), amount: deposit },
      ],
    });
    contract.deposit = deposit;
  } else if (book.balance(accounts.workerOwner(contract)) < input.rate) {
    return { ok: false, code: "insufficient_funds" };
  }
  settleLabor(contract, input.atMs, book, accounts, rules);
  return { ok: true, contract };
}

/**
 * 임금형 보증금을 채운다(고용주). 일시 중지였고 이제 한 번 임금이 되면 바로 낸다(지금부터 새 주기).
 * 부르는 쪽이 atMs까지 먼저 정산해 둔다(여기서 다시 정산하지만 그 구간은 돌려주지 않는다)
 */
export function topUpLabor(
  c: LaborContract,
  amount: bigint,
  atMs: number,
  book: LedgerBook,
  accounts: LaborAccounts,
  rules: LaborRules,
): { ok: true } | { ok: false; code: LaborFailure } {
  settleLabor(c, atMs, book, accounts, rules);
  if (c.kind !== "wage" || (c.state !== "active" && c.state !== "paused"))
    return { ok: false, code: "not_open" };
  if (amount <= 0n) return { ok: false, code: "invalid_terms" };
  const wallet = accounts.owner(c);
  if (book.balance(wallet) < amount) return { ok: false, code: "insufficient_funds" };
  book.post({
    kind: "labor_deposit",
    atMs,
    entries: [
      { account: wallet, amount: -amount },
      { account: accounts.escrow(c), amount },
    ],
  });
  c.deposit += amount;
  if (c.state === "paused" && c.deposit >= c.rate) {
    c.nextDueMs = atMs;
    settleLabor(c, atMs, book, accounts, rules);
  }
  return { ok: true };
}

/**
 * 임금형 보증금을 시설 주인 쪽 계정에서 더 묶는다(서버 정산의 지급준비금 자동 채우기 — 기획 D-564 1623·1624 "끊기지 않게"). topUpLabor와 달리
 * 정산하지 않고 상태도 바꾸지 않는다: 일시 중지였으면 다음 지급 시각에 그대로 다시 낸다(그 사이 구간은 정산이 돌려준다 — 산출 구간을 잃지
 * 않는다). 열린 임금형이 아니거나 금액이 0 이하이거나 계정이 모자라면 아무것도 하지 않고 0. 묶은 양
 */
export function fundLaborDeposit(
  c: LaborContract,
  amount: bigint,
  atMs: number,
  book: LedgerBook,
  accounts: LaborAccounts,
): bigint {
  if (c.kind !== "wage" || (c.state !== "active" && c.state !== "paused") || amount <= 0n) return 0n;
  const wallet = accounts.owner(c);
  if (book.balance(wallet) < amount) return 0n;
  book.post({
    kind: "labor_deposit",
    atMs,
    entries: [
      { account: wallet, amount: -amount },
      { account: accounts.escrow(c), amount },
    ],
  });
  c.deposit += amount;
  return amount;
}

/**
 * 해지한다(시설 주인·유닛 소유 주체 언제든, 유닛·시설이 사라졌을 때).
 * - 임금형: 남은 보증금을 고용주에게 돌려주고 바로 끝(시설에 일꾼 물건이 없다).
 * - 임대형: 유예에 든다(손 해지도, 기획 341·N48). 시설이 사라졌으면(building_gone) 옮길 곳이 없어 바로 끝.
 * - 유예 중이면 시설이 사라졌을 때만 유예를 끝낸다(남은 물건은 넘어가지 않는다). 손으로는 유예를 일찍 끝내지 않는다(false).
 * 이미 끝났으면 false
 */
export function terminateLabor(
  c: LaborContract,
  atMs: number,
  reason: LaborEndReason,
  book: LedgerBook,
  accounts: LaborAccounts,
  rules: LaborRules,
): boolean {
  settleLabor(c, atMs, book, accounts, rules);
  if (c.state === "ended") return false;
  if (c.state === "grace") {
    if (reason !== "building_gone") return false;
    // 유예 중 시설이 사라짐: 유예만 끝낸다(해지 사유·시각은 그대로, 넘어간 물건 없음)
    c.state = "ended";
    c.graceUntilMs = null;
    return true;
  }
  if (c.kind === "lease" && reason !== "building_gone") {
    enterGrace(c, atMs, reason, rules);
    return true;
  }
  refund(c, atMs, book, accounts);
  end(c, atMs, reason);
  return true;
}

/** 임대료를 바꾼다(오너, D-479). 지금 낸 시간은 그대로이고 다음 지급부터 */
export function setLeaseRent(c: LaborContract, rent: bigint): boolean {
  if (c.kind !== "lease" || rent <= 0n || (c.state !== "active" && c.state !== "paused")) return false;
  c.rate = rent;
  return true;
}

/** 에스크로 불변 조건: 임금형이 열려 있으면 에스크로 = 보증금, 끝났거나 임대형이면 0. 위반 문장 목록 */
export const INVARIANT_LABOR_ESCROW = "I14 labor escrow differs from contract deposit";

export function checkLaborEscrow(contracts: Iterable<LaborContract>, book: LedgerBook): string[] {
  const byCode = new Map<string, bigint>();
  for (const account of book.accounts())
    if (account.systemCode) byCode.set(account.systemCode, account.balance);
  let bad = 0;
  for (const c of contracts) {
    const held = byCode.get(laborEscrowCode(c.id)) ?? 0n;
    const expected = c.kind === "wage" && c.state !== "ended" && c.state !== "grace" ? c.deposit : 0n;
    if (held !== expected || c.deposit < 0n) bad += 1;
  }
  return bad > 0 ? [`${INVARIANT_LABOR_ESCROW}: ${bad}`] : [];
}
