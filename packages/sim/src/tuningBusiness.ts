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
  k("business_service_fee_pm", "serviceFeePm", "적정가 수수료(‰)", "Fair-price fee (‰)"),
  k(
    "business_npc_books",
    "npcBooks",
    "NPC 사업장 장부(1 = 켬, 0 = 끔)",
    "NPC business books (1 = on, 0 = off)",
  ),
  k(
    "business_npc_wait_days",
    "npcWaitDays",
    "NPC 일꾼 소유자가 멈춘 계약을 기다리는 날",
    "Days an NPC worker owner waits on a paused contract",
  ),
  k(
    "business_npc_price_temper_pm",
    "npcPriceTemperPm",
    "NPC 시설 판매가 상업 성향 폭(‰)",
    "NPC shop price commerce-temper range (‰)",
  ),
  k(
    "business_npc_price_stock_pm",
    "npcPriceStockPm",
    "NPC 시설 판매가 재고 폭(‰)",
    "NPC shop price stock range (‰)",
  ),
  k(
    "business_npc_price_stock_lots",
    "npcPriceStockLots",
    "NPC 시설 판매가 목표 재고(묶음)",
    "NPC shop price target stock (lots)",
  ),
  // 거래소 건물 2(기획 D-571, docs/adr/2026-11-16-exchange-buildings.md "바뀜 (D-571)") — 서버만 읽는다
  k("exchange_fee_bp", "exchangeFeeBp", "거래소 이용료(만분율)", "Exchange usage fee (bp)"),
  k(
    "exchange_locker_g",
    "exchangeLockerG",
    "거래소 개인 창고 기본 크기(유닛마다, g)",
    "Exchange locker base size (per unit, g)",
  ),
  k(
    "exchange_locker_step_g",
    "exchangeLockerStepG",
    "거래소 개인 창고 넓히기 한 칸(g)",
    "Exchange locker expansion step (g)",
  ),
  k(
    "exchange_locker_step_price",
    "exchangeLockerStepPrice",
    "거래소 개인 창고 넓히기 값(화폐 최소 단위)",
    "Exchange locker expansion price (minor units)",
  ),
  k(
    "exchange_locker_max_steps",
    "exchangeLockerMaxSteps",
    "거래소 개인 창고 넓히기 칸 수 위 끝",
    "Exchange locker expansion steps limit",
  ),
  k(
    "exchange_trade_slots",
    "exchangeTradeSlots",
    "거래소 거래 직무 자리 수(레벨마다)",
    "Trade-desk seats per exchange level",
  ),
  k(
    "exchange_desk_haul_pm",
    "exchangeDeskHaulPm",
    "거래 직무 유닛 운반 시간 배율(‰)",
    "Trade-desk unit haul time (‰)",
  ),
  k("exchange_fx_fee_bp", "exchangeFxFeeBp", "환전 이용료 적정 요율(만분율)", "Fair FX usage fee (bp)"),
  k("exchange_fx_fee_max_bp", "exchangeFxFeeMaxBp", "환전 이용료 위 끝(만분율)", "FX usage fee limit (bp)"),
  // 기타 D-574(줄기 misc-574): 물자 거래소 이용료 위아래 한도(질문 2085), 환전 이용료 아래 끝, NPC 거래소 거래 직무 자리 값(질문 2204)
  k(
    "exchange_fee_min_bp",
    "exchangeFeeMinBp",
    "거래소 이용료 아래 끝(만분율)",
    "Exchange usage fee floor (bp)",
  ),
  k(
    "exchange_fee_max_bp",
    "exchangeFeeMaxBp",
    "거래소 이용료 위 끝(만분율)",
    "Exchange usage fee limit (bp)",
  ),
  k("exchange_fx_fee_min_bp", "exchangeFxFeeMinBp", "환전 이용료 아래 끝(만분율)", "FX usage fee floor (bp)"),
  k(
    "exchange_npc_desk_rent_pm",
    "exchangeNpcDeskRentPm",
    "NPC 거래소 거래 직무 자리 값(적정가 ‰)",
    "NPC exchange trade-desk rent (‰ of fair)",
  ),
  k("business_haul_unit_g", "haulUnitG", "운반 대행 요금 단위 무게(g)", "Haul service fee unit weight (g)"),
  k(
    "business_haul_unit_cells",
    "haulUnitCells",
    "운반 대행 요금 단위 거리(칸)",
    "Haul service fee unit distance (cells)",
  ),
];
