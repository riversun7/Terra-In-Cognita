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
  k("business_share_count", "shareCount", "사업장 지분 발행 수(주)", "Business shares issued (count)"),
  k(
    "business_share_round_ms",
    "shareRoundMs",
    "사업장 지분 동시호가 주기(ms)",
    "Business share call-auction period (ms)",
  ),
  k(
    "business_share_order_max",
    "shareOrderMax",
    "사업장 지분 회차당 주문 수(건)",
    "Business share orders per round (count)",
  ),
  k(
    "business_reserve_margin_pm",
    "reserveMarginPm",
    "지급준비금 임금 상승 여유(‰)",
    "Payroll reserve wage-rise margin (‰)",
  ),
  k(
    "business_reserve_default_pm",
    "reserveDefaultPm",
    "지급준비율 기본값(‰)",
    "Default payroll reserve ratio (‰)",
  ),
  k("business_service_fee_pm", "serviceFeePm", "외주 요금(‰)", "Outsourcing fee (‰)"),
];
