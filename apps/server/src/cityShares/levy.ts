// 지분 체결의 거래세·증권 거래소 이용료 — 기획 D-587(질문 2474 다 "그 나라 거래세 + 증권 거래소 주인이 정한 이용료"), D-128(거래세)·D-574(물자 거래소
// 이용료와 같은 꼴), docs/adr/2026-11-21-share-market-2.md. 도시(정부) 지분 시장(market.ts)과 사업장 지분 시장(business/shares.ts)이 같이 쓴다.
// - 내는 쪽 = 판 쪽(받은 돈에서 — 물자 거래소 거래세·이용료와 같은 쪽).
// - 거래세 = 체결 총액 × 그 도시 주인 나라 거래세(만분율, 도시 경제 taxOf — 지도자가 정한 nation_taxes.trade_tax_bp가 걸려 있으면 그 값) ÷ 10000(버림) →
//   그 나라 국고(같은 화폐). 판 쪽이 그 나라 국고면 세금이 없다(제 돈을 제게 내지 않는다).
// - 이용료 = 체결 총액 × 그 도시 일하는 증권 거래소의 요율(주인이 정한 service:share_fee, 없으면 적정 요율 — market/fxFee.ts shareFeeOf) ÷ 10000(버림) →
//   그 거래소 사업장 금고(사업장 장부 수입 share_fee, 소득세 포함). 그 도시에 일하는 증권 거래소가 없으면 받지 않는다 [임시](질문 2475 가 그대로 —
//   정부 건물만으로 거래).
// 정수 연산만 쓴다.

/** 한 도시의 지분 체결 세금·이용료 요율(없는 도시면 undefined — 세금·이용료 없음) */
export interface ShareLevyRate {
  /** 거래세를 받는 나라(국고 소유 주체) */
  readonly treasuryOwner: number;
  readonly taxBp: number;
  /** 이용료를 받는 증권 거래소(없으면 이용료 없음) */
  readonly fee?: { readonly buildingId: number; readonly bp: number } | undefined;
}

/** 이용료를 거래소 금고로 넣는다(사업장 장부 수입 — BusinessCore.receive). 낸 쪽 계정이 모자라면 아무것도 하지 않는다 */
export type ShareFeePay = (input: {
  readonly from: number;
  readonly buildingId: number;
  readonly asset: string;
  readonly amount: bigint;
  readonly atMs: number;
}) => void;

/** 지분 체결 세금·이용료 고리(도시 지분·사업장 지분 시장이 받는다) */
export interface ShareLevy {
  rateOf(cityId: number): ShareLevyRate | undefined;
  readonly pay: ShareFeePay;
}

const bpOf = (bp: number): bigint => BigInt(Math.max(0, Math.min(10_000, Math.trunc(bp))));

/** 체결 총액에서 낼 세금·이용료(버림). 판 쪽이 그 나라 국고면 세금 0 */
export function shareLevyAmounts(
  gross: bigint,
  rate: ShareLevyRate | undefined,
  sellerOwner: number | undefined,
): { readonly tax: bigint; readonly fee: bigint } {
  if (!rate || gross <= 0n) return { tax: 0n, fee: 0n };
  const tax = sellerOwner === rate.treasuryOwner ? 0n : (gross * bpOf(rate.taxBp)) / 10_000n;
  const fee = rate.fee ? (gross * bpOf(rate.fee.bp)) / 10_000n : 0n;
  return { tax, fee };
}

/** 세계 값으로 도시마다 요율을 낸다(주인 나라·거래세·그 도시 일하는 증권 거래소·그 거래소 요율) */
export function shareLevyRates(o: {
  cityOwner(cityId: number): number | undefined;
  taxOf(owner: number): number;
  /** 그 도시의 일하는 증권 거래소 건물(없으면 undefined) */
  exchangeIn(cityId: number): number | undefined;
  feeBp(buildingId: number): number;
}): (cityId: number) => ShareLevyRate | undefined {
  return (cityId) => {
    const owner = o.cityOwner(cityId);
    if (owner === undefined) return undefined;
    const buildingId = o.exchangeIn(cityId);
    return {
      treasuryOwner: owner,
      taxBp: o.taxOf(owner),
      ...(buildingId === undefined ? {} : { fee: { buildingId, bp: o.feeBp(buildingId) } }),
    };
  };
}
