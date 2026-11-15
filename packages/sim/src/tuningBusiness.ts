// 사업장 설정 칸 값 ↔ 계수표 — 기획 D-548·D-555, docs/adr/2026-11-15-business-ledger.md. 출발값은 society/businessCoefficients.ts START_BUSINESS
// (모두 [임시]). 49에 칸이 없어 business_*를 앞머리로 쓴다.
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `business.${path}`,
  structural: false,
  ko,
  en,
});

export const BUSINESS_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "business_settle_period_ms",
    "settlePeriodMs",
    "사업장 자동 정산 주기(ms)",
    "Business auto-settlement period (ms)",
  ),
  k("business_min_lot", "minLot", "사업장 판매 최소 묶음(개)", "Business sale minimum lot (count)"),
  k(
    "business_retail_max_admin",
    "retailMaxAdmin",
    "소매 도시 행정 레벨 상한",
    "Retail city admin level limit",
  ),
];
