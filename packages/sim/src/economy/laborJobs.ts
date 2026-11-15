// 구인 게시(남의 유닛을 임금형으로 고용) — docs/adr/2026-11-03-labor-contracts.md "바뀜 (기획 338~342·구인 게시판)"
// 기획 D-479 기획 정리(338~342): 시설 주인이 일자리(직무·임금)를 내고, 유닛 주인(나중에는 지갑을 가진 휴먼)이 받는다.
// 임금형은 유닛이 스탯에 맞아 효율이 높은 작업장에서 더 높은 임금을 번다(D-479), 단가는 도시 노동 시장(D-432).
// 옛 규칙(D-507, AntiGravt01):
// - 게시 = 건물마다 운영 설정 하나: 모집 중 여부(is_accepting_workers)와 사이클당 기본 임금(default_wage_per_cycle)을 건물주만
//   바꾼다(terra-server/routes/economy/production_routes.js:147-206, 건물주 확인 :162-165). → 시설마다 열린 게시 하나, 다시 내면
//   바꾼다(앞 게시는 거둠). 임금은 v4 식(D-431·D-432: 효율 × 단가 × 고용주 조정)이라 고정 임금 대신 고용주 조정 ‰(N28)을 낸다.
// - 받기 = 미니언 주인이 자기 미니언으로 모집 중인 남의 건물과 계약한다(production_routes.js:315-317 모집 중 확인, :326-332
//   "본인 소유의 미니언만"). 일꾼 종류는 MINION·USER(database_init/schema.js:4393-4395) → 지금은 유닛만, 휴먼 지갑(D-097)이
//   생기면 휴먼도.
// - 모집을 멈춰도(is_accepting_workers = 0) 이미 맺은 계약은 그대로다(:315는 새 계약만 본다) → 거둬도 계약은 그대로.
// 받으면 보통 임금형 계약이다(laborContract.ts openLabor): 고용주 = 시설 주인(보증금은 그 지갑에서), 일꾼 = 받은 유닛 주인.
// 자리 수(slots)는 화면 흐름의 기술 기본안이다(옛 규칙은 모집 중 여부 하나, 자리 수 없음).
// 정수·BigInt만 쓴다. 난수·시계는 쓰지 않는다.
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { wage } from "../society/labor.ts";
import {
  type LaborAccounts,
  type LaborContract,
  type LaborRules,
  openLabor,
  wagePerCycle,
} from "./laborContract.ts";

const HOUR_MS = 3_600_000;

/** 직무. 서버 시설에 종류가 아직 없어 시험 채집 하나다(시설이 직무를 정한다, 옛 건물 종류 → 채집 자원) */
export const LABOR_JOB_KINDS = ["gather"] as const;
export type LaborJobKind = (typeof LABOR_JOB_KINDS)[number];

/** open 받는 중, filled 자리가 다 참, withdrawn 시설 주인이 거둠, gone 시설이 사라지거나 주인이 바뀜 */
export const LABOR_JOB_STATES = ["open", "filled", "withdrawn", "gone"] as const;
export type LaborJobState = (typeof LABOR_JOB_STATES)[number];

export interface LaborJob {
  readonly id: number;
  readonly buildingId: number;
  /** 시설 주인 주체(고용주) */
  readonly ownerId: number;
  readonly job: LaborJobKind;
  /** 화폐 자산 코드 */
  readonly asset: string;
  /** 고용주 조정 ‰(N28 범위, 받을 때 임금 식에 넣는다 — 범위가 바뀌었으면 식이 범위 안으로 자른다) */
  readonly adjustPm: number;
  /** 뽑을 자리 수 */
  readonly slots: number;
  /** 받은 수 */
  filled: number;
  /** 계약 기간(시간, 선택). null = 기간 없음 */
  readonly termHours: number | null;
  readonly postedAtMs: number;
  state: LaborJobState;
  /** 닫힌 시각(open이면 null) */
  closedAtMs: number | null;
}

export interface LaborJobInput {
  readonly id: number;
  readonly buildingId: number;
  readonly ownerId: number;
  readonly job: LaborJobKind;
  readonly asset: string;
  readonly adjustPm: number;
  readonly slots: number;
  readonly termHours: number | null;
  readonly atMs: number;
}

export type LaborJobFailure = "invalid_terms" | "job_not_open" | "employer_insufficient_funds";

/** 게시를 만든다. 조정이 N28 범위 밖이거나 자리·기간이 0 이하면 invalid_terms */
export function postLaborJob(
  input: LaborJobInput,
  society: SocietyCoefficients,
): { ok: true; job: LaborJob } | { ok: false; code: LaborJobFailure } {
  if (
    !Number.isInteger(input.adjustPm) ||
    input.adjustPm < society.employerAdjustMinPm ||
    input.adjustPm > society.employerAdjustMaxPm ||
    !Number.isInteger(input.slots) ||
    input.slots < 1 ||
    (input.termHours !== null && (!Number.isInteger(input.termHours) || input.termHours < 1))
  )
    return { ok: false, code: "invalid_terms" };
  return {
    ok: true,
    job: {
      id: input.id,
      buildingId: input.buildingId,
      ownerId: input.ownerId,
      job: input.job,
      asset: input.asset,
      adjustPm: input.adjustPm,
      slots: input.slots,
      filled: 0,
      termHours: input.termHours,
      postedAtMs: input.atMs,
      state: "open",
      closedAtMs: null,
    },
  };
}

/** 그 게시로 받은 유닛의 주기당 임금 = 주기당(⌊효율 × 단가 ÷ 1000⌋ × 조정 ÷ 1000), D-431·D-432 */
export function laborJobWage(
  job: LaborJob,
  efficiency: number,
  rateMilli: number,
  society: SocietyCoefficients,
  rules: LaborRules,
): bigint {
  return wagePerCycle(BigInt(wage(efficiency, rateMilli, job.adjustPm, society)), rules);
}

/** 게시를 닫는다(거둠·시설 사라짐). 이미 닫혔으면 false */
export function closeLaborJob(job: LaborJob, atMs: number, state: "withdrawn" | "gone"): boolean {
  if (job.state !== "open") return false;
  job.state = state;
  job.closedAtMs = atMs;
  return true;
}

export interface LaborJobAcceptInput {
  /** 새 계약 ID */
  readonly contractId: number;
  /** 받는 유닛의 소유 주체(임금을 받는 곳, 342: 휴먼 지갑 전까지) */
  readonly workerOwnerId: number;
  readonly unitId: number;
  /** 그 유닛의 효율점수(D-431) */
  readonly efficiency: number;
  /** 단가(도시 노동 시장 D-432, 효율 1점당 밀리 화폐) */
  readonly rateMilli: number;
  readonly atMs: number;
  /** 보증금(선택, LaborOpenInput.deposit — 서버는 사업장 금고에 있는 만큼만, D-564 1624). 빠지면 N48 날수 전부 */
  readonly deposit?: bigint | undefined;
}

/**
 * 게시를 받는다: 임금형 계약을 맺고(보증금은 고용주 지갑 → 에스크로, 첫 임금 선불) 자리를 하나 채운다(다 차면 filled).
 * 열리지 않은 게시면 job_not_open, 자기 게시면 invalid_terms(내 시설은 바로 고용), 고용주 잔고가 보증금보다 적으면
 * employer_insufficient_funds(아무것도 바꾸지 않는다). 유닛 소유·바쁨은 부르는 쪽이 본다
 */
export function acceptLaborJob(
  job: LaborJob,
  input: LaborJobAcceptInput,
  book: LedgerBook,
  accounts: LaborAccounts,
  rules: LaborRules,
  society: SocietyCoefficients,
): { ok: true; contract: LaborContract } | { ok: false; code: LaborJobFailure } {
  if (job.state !== "open" || job.filled >= job.slots) return { ok: false, code: "job_not_open" };
  if (input.workerOwnerId === job.ownerId) return { ok: false, code: "invalid_terms" };
  const opened = openLabor(
    {
      id: input.contractId,
      kind: "wage",
      ownerId: job.ownerId,
      workerOwnerId: input.workerOwnerId,
      unitId: input.unitId,
      buildingId: job.buildingId,
      asset: job.asset,
      rate: laborJobWage(job, input.efficiency, input.rateMilli, society, rules),
      atMs: input.atMs,
      endsAtMs: job.termHours === null ? null : input.atMs + job.termHours * HOUR_MS,
      deposit: input.deposit,
    },
    book,
    accounts,
    rules,
  );
  if (!opened.ok)
    return {
      ok: false,
      code: opened.code === "insufficient_funds" ? "employer_insufficient_funds" : "invalid_terms",
    };
  job.filled += 1;
  if (job.filled >= job.slots) {
    job.state = "filled";
    job.closedAtMs = input.atMs;
  }
  return { ok: true, contract: opened.contract };
}
