// 임금 소득세 원천징수 — 기획 D-578(사용자 원문 "사업장에서 일괄 계산, 수익에 대한 세금, 임금제공시(유닛에 대한 소득세 납부). 유닛은 이미 세금이 납부된
// 정산한 임금을 받음.(계산 편리)"), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-578)".
// - 임금형 계약 임금을 줄 때(@terra/sim settleLabor — labor_wage 거래 하나) 사업장이 묶어 둔 임금(에스크로)에서 그 유닛의 소득세를 그 사업장 도시
//   나라 국고로 낸다. 유닛은 세후 임금을 받고 유닛 쪽에서는 세금을 셈하지 않는다.
// - 세율 = 그 사업장 수입 소득세율(business/core.ts taxRateOf — 도시 나라 거래세 만분율 [임시]). 같은 주머니(계약의 시설 주인 = 그 나라)면 떼지 않는다
//   (사업장 수입 소득세와 같은 규칙). 세금 = 그 계약의 누적 내림 차이: ⌊(지금까지 낸 총 임금 + 이번 임금) × 만분율 ÷ 10000⌋ − ⌊지금까지 낸 총 임금 × 만분율
//   ÷ 10000⌋(@terra/shared incomeTaxOf). 한 번 임금이 작아(기준 임금 20 × 2% = 0.4) 한 번씩 내리면 늘 0이 되므로, 계약마다 모아서 내린다 — 오래 보면
//   총 임금 × 세율과 최소 단위 하나 안으로 같다. 세율이 바뀌면 그때 세율로 두 항을 함께 센다(늘 0 이상).
// - 설정 칸 business_wage_withhold_mode(1 = 켬, 0 = 옛 판). 기본 화폐·나라 화폐 모두(가문세와 달리 화폐를 가리지 않는다 — 계약 화폐 그대로 국고로).
// - 표: 원장마다 하나(WeakMap — factionIdentity/houseTax.ts와 같은 꼴). 노동 계약 계정(labor/wagePurse.ts)은 원장만 들고 있어 원장으로 찾는다.
//   사업장 장부(createBusinessCore)가 만들어질 때 붙는다 — 그 전(시험·장부 없는 세계)에는 떼지 않는다.
// - 장부에는 "원천징수 소득세" 칸으로 보인다(business/books.ts — 그 사업장 계약 에스크로가 낸 임금 거래의 국고 줄).
import { incomeTaxOf } from "@terra/shared/businessBooks";

/** 떼는 몫: 국고 계정과 세금 */
export interface WithholdCut {
  readonly account: number;
  readonly tax: bigint;
}

/** 그 사업장(건물)·시설 주인·화폐의 총 임금(gross)에서 원천징수할 소득세(없으면 undefined). paidBefore = 그 계약이 지금까지 낸 총 임금(누적 내림) */
export type WageWithhold = (
  buildingId: number,
  ownerId: number,
  asset: string,
  gross: bigint,
  paidBefore?: bigint,
) => WithholdCut | undefined;

/** 이번 임금의 원천징수 소득세 = 누적 내림 차이(위 머리 주석). 0 아래는 0 */
export function withheldTax(gross: bigint, paidBefore: bigint, bp: number): bigint {
  if (gross <= 0n) return 0n;
  const before = paidBefore > 0n ? paidBefore : 0n;
  const due = incomeTaxOf(before + gross, bp) - incomeTaxOf(before, bp);
  return due > 0n ? due : 0n;
}

const withholders = new WeakMap<object, WageWithhold>();

/** 그 원장의 원천징수 셈(사업장 장부가 붙기 전이면 undefined — 떼지 않는다) */
export function wageWithholdOf(ledger: object): WageWithhold | undefined {
  return withholders.get(ledger);
}

/** 원천징수 셈을 원장에 붙인다(마지막에 붙인 것이 이긴다 — 세계 하나에 사업장 장부 하나) */
export function attachWageWithhold(ledger: object, withhold: WageWithhold): void {
  withholders.set(ledger, withhold);
}

/** 원천징수 셈을 만든다(사업장 장부의 도시·세율 고리로) */
export function createWageWithhold(o: {
  readonly ledger: { ownerAccount(ownerId: number, asset: string): number };
  /** 설정 칸 business_wage_withhold_mode(부를 때마다 읽는다) */
  readonly mode: () => number;
  /** 건물이 선 도시(없으면 null) */
  cityOf(buildingId: number): number | null;
  /** 그 도시 국고 주인·소득세 만분율(모르면 undefined → 떼지 않음) */
  tax(cityId: number): { readonly treasuryOwner: number; readonly bp: number } | undefined;
}): WageWithhold {
  return (buildingId, ownerId, asset, gross, paidBefore = 0n) => {
    if (Math.trunc(o.mode()) !== 1 || gross <= 0n) return undefined;
    const cityId = o.cityOf(buildingId);
    const tax = cityId === null ? undefined : o.tax(cityId);
    // 같은 주머니(시설 주인이 그 나라)면 떼지 않는다 — 사업장 수입 소득세와 같다
    if (!tax || tax.treasuryOwner === ownerId) return undefined;
    const due = withheldTax(gross, paidBefore, tax.bp);
    return due > 0n ? { account: o.ledger.ownerAccount(tax.treasuryOwner, asset), tax: due } : undefined;
  };
}
