// 외환 거래소 환전 이용료(질문 2086, 줄기 exchange-3 — 기획 D-564 1682 "조선소나 상업시설은 모두 외주를 받아 장사한다", D-560 외환 거래소 = 상업,
// D-548 사업장 수입은 사업장 금고, D-570 1822 "판매자가 정하고 적정가격을 보여 줌"). docs/adr/2026-11-16-exchange-buildings.md "바뀜 (2081·2083·2084·2086)".
// - 요율 = 그 외환 거래소 주인(대주주)이 정한 만분율(사업장 값 표 business_prices의 item service:fx_fee, 0 = 받지 않음), 정하지 않았으면 적정 요율(설정 칸
//   exchange_fx_fee_bp). 정할 수 있는 위 끝 = exchange_fx_fee_max_bp.
// - 받는 곳: 환전 회차는 외환 거래소 건물 하나를 고르지 않는다(그 화폐 나라의 어느 외환 거래소든 — 질문 1947 가) → 그 화폐를 쓰는 나라 도시의 일하는
//   외환 거래소 가운데 요율이 가장 낮은 곳(같으면 작은 건물 ID) [임시]. 거래소끼리 요율로 다툰다.
// - 내는 쪽: 회차마다 그 화폐를 판 쪽(기준 통화를 받은 쪽)이 받은 기준 통화 × 요율 ÷ 10000(버림) — 물자 거래소 이용료(판 쪽, 질문 2085 가)와 같은 쪽 [임시].
//   NPC 세력도 낸다(D-555 1514 "제 시설도 요금"). 사업장 장부 수입 fx_fee(소득세 포함).
// - 바뀜(기획 D-574 질문 2085, 줄기 misc-574): 물자 거래소 이용료도 같은 틀 — 주인이 정한 만분율(item service:exchange_fee), 정하지 않으면 적정 요율
//   exchange_fee_bp, 정할 수 있는 범위 = exchange_fee_min_bp ~ exchange_fee_max_bp(exchangeFeeOf). 환전 이용료도 아래 끝 exchange_fx_fee_min_bp를 둔다.
//   받는 곳은 그대로(물자 = 그 도시 물자 거래소 건물, 환전 = 그 화폐 나라에서 가장 싼 외환 거래소 — 질문 2206).
// 정수 연산만 쓴다.
import {
  EXCHANGE_FEE_ITEM,
  FX_FEE_ITEM,
  SHARE_FEE_ITEM,
  type FeeRateView,
  type FxFeeView,
} from "@terra/shared/businessBooks";
import type { BusinessCoefficients } from "@terra/sim";

/** 0 이상 정수(틀린 값은 0) */
const whole = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0);

/** 요율 한 줄(주인이 정한 값 — 아래·위 끝으로 자름, 없으면 적정 요율을 자른 값) */
function feeRate(set: bigint | undefined, fair: number, low: number, high: number): FeeRateView {
  const fairBp = whole(fair);
  const maxBp = whole(high);
  const minBp = Math.min(maxBp, whole(low));
  const clamp = (value: number): number => Math.min(maxBp, Math.max(minBp, value));
  const bp = set === undefined ? null : clamp(Number(set < 0n ? 0n : set > 1_000_000n ? 1_000_000n : set));
  return { bp, charged: bp ?? clamp(fairBp), fairBp, minBp, maxBp };
}

/** 그 외환 거래소의 환전 이용료(주인이 정한 요율 — 한도로 자름, 없으면 적정 요율) */
export function fxFeeOf(
  priceOf: (buildingId: number, item: string) => bigint | undefined,
  rules: BusinessCoefficients,
  buildingId: number,
): FxFeeView {
  return feeRate(
    priceOf(buildingId, FX_FEE_ITEM),
    rules.exchangeFxFeeBp,
    rules.exchangeFxFeeMinBp ?? 0,
    rules.exchangeFxFeeMaxBp,
  );
}

/** 그 물자 거래소의 이용료(D-574 질문 2085 — 주인이 정한 요율, 한도로 자름, 없으면 적정 요율) */
export function exchangeFeeOf(
  priceOf: (buildingId: number, item: string) => bigint | undefined,
  rules: BusinessCoefficients,
  buildingId: number,
): FeeRateView {
  return feeRate(
    priceOf(buildingId, EXCHANGE_FEE_ITEM),
    rules.exchangeFeeBp,
    rules.exchangeFeeMinBp ?? 0,
    rules.exchangeFeeMaxBp ?? 10_000,
  );
}

/** 그 증권 거래소의 이용료(D-587 질문 2474 다 — 물자 거래소와 같은 꼴: 주인이 정한 요율, 한도로 자름, 없으면 적정 요율) */
export function shareFeeOf(
  priceOf: (buildingId: number, item: string) => bigint | undefined,
  rules: BusinessCoefficients,
  buildingId: number,
): FeeRateView {
  return feeRate(
    priceOf(buildingId, SHARE_FEE_ITEM),
    rules.exchangeShareFeeBp ?? 50,
    rules.exchangeShareFeeMinBp ?? 0,
    rules.exchangeShareFeeMaxBp ?? 1000,
  );
}

/** 이용료를 받을 외환 거래소: 후보 가운데 요율이 가장 낮은 곳(같으면 작은 건물 ID). 후보가 없으면 undefined */
export function cheapestFxExchange(
  candidates: Iterable<number>,
  rateOf: (buildingId: number) => number,
): { readonly buildingId: number; readonly bp: number } | undefined {
  let best: { buildingId: number; bp: number } | undefined;
  for (const buildingId of candidates) {
    const bp = rateOf(buildingId);
    if (!best || bp < best.bp || (bp === best.bp && buildingId < best.buildingId)) best = { buildingId, bp };
  }
  return best;
}

/** 회차 체결 하나의 이용료(받은 기준 통화 = 체결 로트 × 체결가, × 요율 ÷ 10000 버림) */
export function fxFeeAmount(filledLots: bigint, clearPrice: bigint, bp: number): bigint {
  if (filledLots <= 0n || clearPrice <= 0n || bp <= 0) return 0n;
  return (filledLots * clearPrice * BigInt(Math.trunc(bp))) / 10_000n;
}
