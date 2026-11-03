// 노동 계약 설정 칸 값 ↔ 계수표 — 기획 49 N48·D-479, docs/adr/2026-11-03-labor-contracts.md
// 팩 항목 ID ↔ 세력·사회 계수표 labor 칸(경로). 출발값 = 옛 규칙(salary_engine.js DEPOSIT_DAYS 30·DEPOSIT_WARNING_DAYS 7·하루 정산,
// D-479 시간당 임대료, 옛 독점형 유예 7일)이고 값은 economy/laborContract.ts OLD_LABOR_RULES다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "N48",
  target: "society",
  path: `labor.${path}`,
  structural: false,
  ko,
  en,
});

export const LABOR_TUNING_KEYS: readonly TuningKey[] = [
  k("n48_wage_cycle_ms", "wageCycleMs", "임금 주기(ms)", "Wage cycle (ms)"),
  k("n48_deposit_days", "depositDays", "보증금 = 임금 × 날수", "Deposit = wage × days"),
  k("n48_warn_days", "warnDays", "보증금 경고 남은 날수", "Deposit warning (days left)"),
  k("n48_rent_cycle_ms", "rentCycleMs", "임대료 주기(ms)", "Rent cycle (ms)"),
  k("n48_grace_ms", "graceMs", "임대형 해지 뒤 유예(ms)", "Lease grace after termination (ms)"),
];
