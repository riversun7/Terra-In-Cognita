// 사업장 적정가 셈(서버 조회) — 기획 D-570 1822(사용자 원문 "당연히 판매자가 정하지, 적정가격 계산은 필요 재료비 인건비, 수수료 세금 등을
// 대략계산하여 가격설정시 보여줌.(모든 제작이 그러함)"), 셈 꼴은 @terra/shared/fairPrice. 판정에 쓰지 않는다(값은 주인이 정한다) — 단, 외주 수리
// 요금을 주인이 정하지 않았으면 적정가로 받는다(D-570 1785).
// - 창고 물건(1개): 재료비 = 0(플레이어 사업장 산출은 채집 — 레시피 재료가 없다 [임시]), 인건비 = 장부 기간의 임금 칸 지출을 그 기간 산출(job_output)에
//   팩 기준 값 비율로 나눈 몫(올림). 산출이 없으면 인건비 0.
// - 외주 수리(시간당): 재료비 = 0(재료는 맡기는 사람이 낸다), 인건비 = 그 공방 일꾼 시간당 인건비(labor/service.ts hourlyLabor).
// - 수수료 = 설정 칸 business_service_fee_pm, 세금 = 그 사업장 소득세율.
import { type FairPrice, fairPrice } from "@terra/shared/fairPrice";

export interface FairInput {
  readonly feePm: number;
  readonly taxBp: number;
}

/** 시간당 외주 적정가(재료 없음) */
export function hourlyFair(hourly: bigint, input: FairInput): FairPrice {
  return fairPrice({ materials: 0n, labor: hourly, feePm: input.feePm, taxBp: input.taxBp });
}

/**
 * 창고 물건마다 1개 적정가: wagesSpent = 기간 임금 지출(양수), produced = 기간 산출 수량(자산마다), unitPrice = 팩 기준 값.
 * 인건비 = ⌈임금 지출 × 기준 값 ÷ Σ(산출 × 기준 값)⌉ — 여러 물건을 내면 기준 값 비율로 나눈다
 */
export function goodsFair(
  assets: readonly string[],
  wagesSpent: bigint,
  produced: ReadonlyMap<string, bigint>,
  unitPrice: (asset: string) => bigint,
  input: FairInput,
): Map<string, FairPrice> {
  let worth = 0n;
  for (const [asset, qty] of produced) if (qty > 0n) worth += qty * unitPrice(asset);
  const out = new Map<string, FairPrice>();
  for (const asset of assets) {
    const unit = unitPrice(asset);
    const labor =
      wagesSpent > 0n && worth > 0n && (produced.get(asset) ?? 0n) > 0n
        ? (wagesSpent * unit + worth - 1n) / worth
        : 0n;
    out.set(asset, fairPrice({ materials: 0n, labor, feePm: input.feePm, taxBp: input.taxBp }));
  }
  return out;
}
