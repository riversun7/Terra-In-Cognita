// 노동 계약 칸 공용(LaborPanel.tsx·LaborJobs.tsx) — 결과 코드 문구, 입력 확인, 임금 미리 셈. docs/adr/2026-11-03-labor-contracts.md
// 판정은 서버가 한다. 미리 셈은 서버와 같은 식을 보이기만 한다(@terra/sim wage·wagePerCycle, 게임 앱은 sim을 가져오지 않는다).
import type { LaborResultCode } from "@terra/protocol";
import type { LaborRulesView } from "@terra/shared/labor";
import { m } from "../paraglide/messages.js";
import type { LaborCommand } from "./laborCommands.ts";

const DAY_MS = 86_400_000;

export const LABOR_ERROR_TEXT: Readonly<Record<LaborResultCode | "offline" | "timeout", () => string>> = {
  sign_in_required: m.labor_error_sign_in_required,
  busy: m.labor_error_busy,
  rate_limited: m.labor_error_rate_limited,
  unknown_building: m.labor_error_unknown_building,
  unknown_unit: m.labor_error_unknown_unit,
  unknown_contract: m.labor_error_unknown_contract,
  forbidden: m.labor_error_forbidden,
  unit_busy: m.labor_error_unit_busy,
  insufficient_funds: m.labor_error_insufficient_funds,
  invalid_terms: m.labor_error_invalid_terms,
  not_for_lease: m.labor_error_not_for_lease,
  not_open: m.labor_error_not_open,
  internal_error: m.labor_error_internal_error,
  job_not_open: m.labor_error_job_not_open,
  employer_insufficient_funds: m.labor_error_employer_insufficient_funds,
  not_workplace: m.labor_error_not_workplace,
  facility_full: m.labor_error_facility_full,
  not_assigned: m.labor_error_not_assigned,
  wrong_map: m.labor_error_wrong_map,
  offline: m.labor_error_offline,
  timeout: m.labor_error_timeout,
};

/** 명령 하나를 보내고 성공했는지(문구·목록 다시 받기는 칸이 한다) */
export type LaborRun = (command: LaborCommand) => Promise<boolean>;

/** 10진 글자인 양의 정수인가(금액 칸) */
export const isAmount = (value: string): boolean => /^[1-9][0-9]{0,17}$/.test(value);
/** 0 이상 10진 글자(임대료 칸) */
export const isWhole = (value: string): boolean => /^(0|[1-9][0-9]{0,17})$/.test(value);
/** 기간 칸: 비었거나 1~8760시간 */
export const isTerm = (value: string): boolean =>
  value === "" || (/^[1-9][0-9]{0,3}$/.test(value) && Number(value) <= 24 * 365);

/** 고용주 조정 ‰가 N28 범위 안인가 */
export function adjustInRange(adjustPm: number, rules: LaborRulesView): boolean {
  return Number.isInteger(adjustPm) && adjustPm >= rules.adjustMinPm && adjustPm <= rules.adjustMaxPm;
}

/** 기준 유닛 주기당 임금: 하루 = ⌊⌊효율 × 단가 ÷ 1000⌋ × 조정 ÷ 1000⌋, 주기가 하루가 아니면 비례(최소 1) */
export function previewWage(rules: LaborRulesView, adjustPm: number): bigint {
  if (!adjustInRange(adjustPm, rules)) return 0n;
  const daily = BigInt(
    Math.floor((Math.floor((rules.efficiency * rules.rateMilli) / 1000) * adjustPm) / 1000),
  );
  if (rules.wageCycleMs === DAY_MS) return daily;
  const scaled = (daily * BigInt(rules.wageCycleMs)) / BigInt(DAY_MS);
  return scaled > 0n ? scaled : 1n;
}
