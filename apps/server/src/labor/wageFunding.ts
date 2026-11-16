// 정산 구간 임금 채우기(서버) — 기획 D-564 1624 "끊기지 않게", D-570 1789(원문 "적자는 기본적으로 멈춰야한다. 중단이 어려울때 마지막을 적자처리하고
// 마지막 사이클을 돌리고 재정안정될때까지 운영중단 원칙."), D-573 2042("중단이 어려울 때" = 이미 진행 중인 생산 주기가 있을 때), docs/adr/2026-11-15-business-ledger.md
// "바뀜 (D-573)". labor/service.ts가 정산마다 임금형 계약 하나를 넘긴다(service.ts 1,000줄 상한 — 이 모듈로 옮겼다).
// - 정산 구간에 낼 임금을 보증금이 덮지 못하면 모자란 만큼 사업장 금고에서 채운다(fundLaborDeposit).
// - 금고에도 없으면: 기본은 **바로 멈춤** — 금고가 덮는 지급까지만 채우고 그다음 지급 시각에 사업장을 멈춘다(stopAfter, 적자를 미리 넣지 않는다). 그
//   일꾼에게 **진행 중인 생산 주기**(그 시설에서 쌓은 채집 진행 > 0 — 묶음을 끝내지 않음)가 있을 때만 마지막 한 주기 임금을 적자로 넣고(advance) 그 주기가
//   끝나는 시각에 멈춘다(예전 business-4: 늘 마지막 한 주기를 적자로).
// - 그 뒤 보증금이 모자라면 계약은 일시 중지된다(자동 해지 없음 — @terra/sim payDue, D-573 2045). 멈춘 사업장(1504)은 채우지 않는다. 재정이 안정되면
//   (business/core.ts repay) 멈춤이 풀리고 다음 정산이 다시 채운다(일시 중지 계약도 — 수익이 나면 임금 정산 재개).
// 정수·BigInt만 쓴다.
import {
  type LaborAccounts,
  type LaborContract,
  type LaborRules,
  type LedgerBook,
  fundLaborDeposit,
} from "@terra/sim";
import type { LaborBusinessHook } from "./service.ts";

/** 임금 채우기 한 번(머리 주석). inProgress = 그 일꾼이 그 시설에서 진행 중인 생산 주기가 있나 */
export function fundDueWages(input: {
  readonly contract: LaborContract;
  readonly toMs: number;
  readonly rules: LaborRules;
  readonly business: LaborBusinessHook | undefined;
  readonly ledger: LedgerBook;
  readonly accounts: LaborAccounts;
  readonly inProgress: (unitId: number, buildingId: number) => boolean;
}): void {
  const { contract: c, toMs, rules, business } = input;
  const open = c.state === "active" || c.state === "paused";
  if (c.kind !== "wage" || !open || c.rate <= 0n || !business?.fundDeposit) return;
  if (business.suspended?.(c.buildingId) === true) return;
  // 같은 시각이면 만료가 먼저다(laborContract.ts) → 기간 끝 시각의 지급은 없다
  const limit = c.endsAtMs === null ? toMs : Math.min(toMs, c.endsAtMs - 1);
  if (c.nextDueMs > limit) return;
  const cycle = Math.max(1, rules.wageCycleMs);
  const pays = Math.floor((limit - c.nextDueMs) / cycle) + 1;
  const short = BigInt(pays) * c.rate - c.deposit;
  if (short <= 0n) return;
  const have = business.vaultBalance?.(c.buildingId, c.ownerId, c.asset) ?? short;
  let want = short;
  if (have < short) {
    // 금고가 모자람: 금고에 있는 만큼 덮는 지급 수만큼 돌고, 진행 중인 생산 주기가 있으면 마지막 한 주기만 적자(D-573 2042)
    const covered = (c.deposit + (have > 0n ? have : 0n)) / c.rate;
    const last = covered < BigInt(pays) && input.inProgress(c.unitId, c.buildingId) ? covered + 1n : covered;
    want = last * c.rate - c.deposit;
    business.stopAfter?.(c.buildingId, c.nextDueMs + Number(last) * cycle);
  }
  if (want <= 0n) return;
  // 금고가 덮으면 advance는 아무것도 넣지 않는다(모자란 만큼만 적자 — 진행 중인 주기가 없으면 모자람이 없다)
  business.advance(c.buildingId, c.ownerId, c.asset, want, toMs);
  fundLaborDeposit(c, want, toMs, input.ledger, input.accounts);
}
