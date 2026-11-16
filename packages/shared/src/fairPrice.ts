// 적정가 계산 — 기획 D-570 1822(사용자 원문 "당연히 판매자가 정하지, 적정가격 계산은 필요 재료비 인건비, 수수료 세금 등을 대략계산하여 가격설정시
// 보여줌.(모든 제작이 그러함)"), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-570)".
// 값은 판매자(사업장 주인·대주주)가 정한다. 이 계산은 판정에 쓰지 않고, 값을 정하는 화면 곁에 "이 값이면 본전"을 보인다. 서버 조회와 화면이 같은 셈.
// - 적정가 = ⌈(재료비 + 인건비 + 수수료) ÷ (1 − 세율)⌉: 소득세(받는 돈의 만분율, 내림 — businessBooks incomeTaxOf)를 내고 손에 남는 돈이
//   재료비 + 인건비 + 수수료가 되는 가장 작은 값. 수수료 = (재료비 + 인건비) × 수수료‰(설정 칸 business_service_fee_pm), 올림.
// - 인건비 = 시간당 인건비 × 걸리는 시간(올림). 정수·BigInt만 쓴다.

const HOUR_MS = 3_600_000n;

export interface FairPriceParts {
  /** 재료비(화폐 최소 단위 — 재료 기준 값 합) */
  readonly materials: bigint;
  /** 인건비(화폐 최소 단위) */
  readonly labor: bigint;
  /** 수수료(‰, 원가에 붙는 몫) */
  readonly feePm: number;
  /** 소득세 만분율(받는 돈에서 낸다) */
  readonly taxBp: number;
}

export interface FairPrice {
  readonly materials: bigint;
  readonly labor: bigint;
  readonly fee: bigint;
  readonly tax: bigint;
  /** 적정가(재료비 + 인건비 + 수수료 + 세금) */
  readonly price: bigint;
}

/** 응답 꼴(화폐 최소 단위 글자) */
export interface FairPriceView {
  readonly materials: string;
  readonly labor: string;
  readonly fee: string;
  readonly tax: string;
  readonly price: string;
}

const atLeastZero = (value: bigint): bigint => (value > 0n ? value : 0n);

/** 적정가(위 머리 주석). 세율은 0~9,999 만분율로 자른다 */
export function fairPrice(parts: FairPriceParts): FairPrice {
  const materials = atLeastZero(parts.materials);
  const labor = atLeastZero(parts.labor);
  const cost = materials + labor;
  const pm = BigInt(Math.max(0, Math.trunc(parts.feePm)));
  const fee = (cost * pm + 999n) / 1000n;
  const net = cost + fee;
  const bp = BigInt(Math.min(9_999, Math.max(0, Math.trunc(parts.taxBp))));
  let price = (net * 10_000n + (10_000n - bp) - 1n) / (10_000n - bp);
  // 내림 세금 때문에 하나 작은 값으로도 남는 돈이 같을 수 있다 → 가장 작은 값으로
  while (price > net && price - 1n - ((price - 1n) * bp) / 10_000n >= net) price -= 1n;
  return { materials, labor, fee, tax: price - net, price };
}

/** 응답 꼴로 */
export function fairPriceView(value: FairPrice): FairPriceView {
  return {
    materials: String(value.materials),
    labor: String(value.labor),
    fee: String(value.fee),
    tax: String(value.tax),
    price: String(value.price),
  };
}

/** 시간당 인건비 × 걸리는 시간(ms) — 올림. 음수·0은 0 */
export function laborCostOf(hourly: bigint, ms: number): bigint {
  if (hourly <= 0n || !(ms > 0)) return 0n;
  return (hourly * BigInt(Math.ceil(ms)) + HOUR_MS - 1n) / HOUR_MS;
}

/** 외주 요금 = 시간당 요금 × 걸리는 시간(ms) — 올림(D-570 1785 "요금은 주인이 정한다" — 주인이 시간당 요금을 정한다) */
export function serviceFeeOf(perHour: bigint, ms: number): bigint {
  return laborCostOf(perHour, ms);
}
