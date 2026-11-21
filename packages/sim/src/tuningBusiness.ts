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
  // 도시(정부) 지분 시장(D-583 — 서버 cityShares, docs/adr/2026-11-21-share-market.md)
  k(
    "city_share_round_ms",
    "cityShareRoundMs",
    "도시 지분 동시호가 주기(ms)",
    "City share call-auction period (ms)",
  ),
  k(
    "city_share_order_max",
    "cityShareOrderMax",
    "도시 지분 회차당 주문 수(건)",
    "City share orders per round (count)",
  ),
  // 지분 거래 이용료·NPC 지분 사기·NPC 증권 거래소(D-587 — 서버 cityShares 줄기 share-market-2)
  k(
    "exchange_share_fee_bp",
    "exchangeShareFeeBp",
    "증권 거래소 이용료 적정 요율(만분율)",
    "Fair stock exchange usage fee (bp)",
  ),
  k(
    "exchange_share_fee_min_bp",
    "exchangeShareFeeMinBp",
    "증권 거래소 이용료 아래 끝(만분율)",
    "Stock exchange usage fee floor (bp)",
  ),
  k(
    "exchange_share_fee_max_bp",
    "exchangeShareFeeMaxBp",
    "증권 거래소 이용료 위 끝(만분율)",
    "Stock exchange usage fee limit (bp)",
  ),
  k(
    "city_share_npc_buy_budget_pm",
    "cityShareNpcBuyBudgetPm",
    "NPC 나라 지분 사기 예산(국고 ‰)",
    "NPC nation share-buying budget (‰ of treasury)",
  ),
  k(
    "city_share_npc_exchange_pm",
    "cityShareNpcExchangePm",
    "NPC 증권 거래소 짓기 상업 성향 문턱(배율 ‰)",
    "NPC stock exchange build commerce threshold (scale ‰)",
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
  // NPC 휴먼 일꾼 임금(질문 2236·2291, simulator/humanPurse.ts) — 시뮬·서버
  k("business_npc_wage_mode", "npcWageMode", "NPC 일꾼 임금(1 켬·0 끔)", "NPC worker wages (1 on, 0 off)"),
  k(
    "business_npc_wage_pm",
    "npcWagePm",
    "NPC 일꾼 하루 임금(기준 임금 대비 ‰)",
    "NPC worker daily wage (‰ of base wage)",
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
  // 세금(기획 D-578·D-579) — 원천징수는 서버만 읽고, 주민세(재산 바탕, 주기·국세 몫)는 사회 하루 끝이 읽는다(0이면 걷지 않음)
  k(
    "business_wage_withhold_mode",
    "wageWithholdMode",
    "임금 소득세 원천징수(1 켬·0 끔)",
    "Wage income tax withholding (1 on, 0 off)",
  ),
  k(
    "nation_resident_tax_pm",
    "residentTaxPm",
    "주민세율(재산 ‰, 주기마다)",
    "Resident tax (‰ of property per period)",
  ),
  k("nation_resident_tax_every_ms", "residentTaxEveryMs", "주민세 주기(ms)", "Resident tax period (ms)"),
  k(
    "nation_resident_tax_nation_pm",
    "residentTaxNationPm",
    "주민세 국세 몫(‰)",
    "Resident tax national share (‰)",
  ),
  // 사는 곳 정원(질문 2481 가 — 줄기 governance-6)
  k(
    "residence_capacity_per_level",
    "residenceCapacityPerLevel",
    "사는 곳 정원: 레벨(층)마다 유닛 수",
    "Residence capacity: units per level (floor)",
  ),
  // 나라 세금(tax-2 — 질문 2371 나·2373 가): NPC 나라 주민세 규칙식 범위, 주민세 재산의 건물 값(지은 값·감가)
  k(
    "npc_resident_tax_min_pm",
    "npcResidentTaxMinPm",
    "NPC 주민세 규칙식 아래(‰)",
    "NPC resident tax rule low (‰)",
  ),
  k(
    "npc_resident_tax_max_pm",
    "npcResidentTaxMaxPm",
    "NPC 주민세 규칙식 위(‰)",
    "NPC resident tax rule high (‰)",
  ),
  k(
    "resident_building_value_pm",
    "residentBuildingValuePm",
    "주민세 건물 값(지은 값의 ‰)",
    "Resident tax building value (‰ of built cost)",
  ),
  k(
    "resident_building_depreciation_pm",
    "residentBuildingDepreciationPm",
    "주민세 건물 하루 감가(‰)",
    "Resident tax building depreciation per day (‰)",
  ),
  k(
    "resident_building_floor_pm",
    "residentBuildingFloorPm",
    "주민세 건물 감가 바닥(‰)",
    "Resident tax building depreciation floor (‰)",
  ),
  // 신용 점수(D-581 — 질문 2374 답, 바뀜 D-584 "한 점수", apps/server/src/credit/): 범위·시작값, 내리는 크기(빚·체납·쿠데타 가담·같은 나라 공격), 오르는 크기(소속 기간·사업장)
  k("credit_min", "creditMin", "신용 점수 아래 끝(점)", "Credit score minimum (points)"),
  k("credit_max", "creditMax", "신용 점수 위 끝(점)", "Credit score maximum (points)"),
  k("credit_start", "creditStart", "신용 점수 시작값(점)", "Credit score start (points)"),
  k(
    "credit_resident_nation",
    "creditResidentNation",
    "주민세 빚: 신용 깎기(주기마다, 점)",
    "Resident tax debt: credit cut (per cycle, points)",
  ),
  k(
    "credit_business_nation",
    "creditBusinessNation",
    "사업장 적자: 신용 깎기(점)",
    "Business deficit: credit cut (points)",
  ),
  // 줄기 governance-5(D-584·질문 2447 나)
  k(
    "credit_upkeep",
    "creditUpkeep",
    "유지비 체납: 신용 깎기(못 낸 시간마다, 점)",
    "Upkeep arrears: credit cut (per unpaid hour, points)",
  ),
  k(
    "credit_tenure_per_day",
    "creditTenurePerDay",
    "소속 기간: 하루마다 오르는 신용(점)",
    "Membership tenure: credit rise per day (points)",
  ),
  k(
    "credit_tenure_cap",
    "creditTenureCap",
    "소속 기간: 오르는 신용 상한(점)",
    "Membership tenure: credit rise cap (points)",
  ),
  k(
    "credit_business_daily",
    "creditBusinessDaily",
    "사업장 운영: 하루마다 오르는 신용(사업장마다, 점)",
    "Running businesses: credit rise per day (per business, points)",
  ),
  k(
    "credit_coup_join",
    "creditCoupJoin",
    "쿠데타 가담: 신용 깎기(점)",
    "Joining a coup: credit cut (points)",
  ),
  k(
    "credit_same_nation_attack",
    "creditSameNationAttack",
    "같은 나라 유저 공격: 신용 깎기(한 번마다, 점)",
    "Attacking a same-nation user: credit cut (per attack, points)",
  ),
];
