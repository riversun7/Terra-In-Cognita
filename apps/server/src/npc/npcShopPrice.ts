// NPC 시설 판매가 — 기획 대조 2153(D-564 1627 원문 "판매가를 정하고 모두가 그가격에 구매가능. 너무 낮으면 다른 유닛이 다 사가고 너무 높으면 안팔림",
// D-570 1822 "당연히 판매자가 정하지 … (모든 제작이 그러함)", D-555 1510 "물건도 플레이어처럼"), docs/adr/2026-11-15-business-ledger.md "바뀜 (2153)".
// NPC도 판매자로서 시설 창고 물건의 1단위 값을 정한다(플레이어 주인과 같은 사업장 값 표 business_prices 줄 — 사업장 판매 business_buy가 그 값을 쓴다).
// [임시] 기술 기본값 식(설정 칸으로 맞춘다):
//   기준 = 팩 기준 값 × (그 도시 거래소 마지막 체결가 ÷ 팩 시작 시세) — 시세 움직임만 따른다(화폐가 달라도 비율은 같다). 체결이 없으면 팩 기준 값.
//   성향 = (상업 성향 치우침‰ − 500) × business_npc_price_temper_pm ÷ 500 — 상업 성향이 높으면 비싸게(이윤), 낮으면 싸게.
//   재고 = business_npc_price_stock_pm × (목표 − 재고 묶음) ÷ 목표(위아래 ± business_npc_price_stock_pm로 자름) — 목표(business_npc_price_stock_lots
//          묶음)보다 쌓이면 내리고(안 팔림) 모자라면 올린다(다 사 감).
//   값 = max(1, 기준 × (1000 + 성향 + 재고) ÷ 1000), 내림.
// 정수·BigInt만 쓴다.

export interface NpcShopPriceInput {
  /** 팩 기준 값(1단위, 사업장 판매 화폐 최소 단위) */
  readonly base: bigint;
  /** 그 도시 거래소 마지막 체결가(묶음 값, 없으면 undefined)와 팩 시작 시세(묶음 값) */
  readonly last?: bigint | undefined;
  readonly start?: bigint | undefined;
  /** 상업 성향 치우침(0~1000‰, 축 가운데 500) */
  readonly commerceTiltPm: number;
  /** 시설 창고 재고(기본 단위)와 판매 최소 묶음(개) */
  readonly stock: bigint;
  readonly minLot: number;
  readonly temperPm: number;
  readonly stockPm: number;
  readonly stockLots: number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** 성향 축 값 → 치우침‰(0~1000, labor/npcWait.ts와 같은 셈) */
export function traitTiltPm(value: number, traitMin: number, traitMax: number): number {
  const span = Math.max(1, traitMax - traitMin);
  return Math.trunc(((clamp(value, traitMin, traitMax) - traitMin) * 1000) / span);
}

/** NPC 시설 1단위 판매가(위 머리 주석) */
export function npcShopPrice(input: NpcShopPriceInput): bigint {
  let reference = input.base > 0n ? input.base : 1n;
  if (input.last !== undefined && input.start !== undefined && input.last > 0n && input.start > 0n)
    reference = (reference * input.last) / input.start;
  const temperCap = Math.max(0, Math.trunc(input.temperPm));
  const temper = Math.trunc(((clamp(input.commerceTiltPm, 0, 1000) - 500) * temperCap) / 500);
  const stockCap = Math.max(0, Math.trunc(input.stockPm));
  const target = BigInt(Math.max(1, Math.trunc(input.stockLots)) * Math.max(1, Math.trunc(input.minLot)));
  const gap = Number(((target - input.stock) * BigInt(stockCap)) / target);
  const stock = clamp(gap, -stockCap, stockCap);
  const pm = BigInt(Math.max(1, 1000 + temper + stock));
  const price = (reference * pm) / 1000n;
  return price > 0n ? price : 1n;
}

/** NPC 시설 판매가 셈의 재료(npc/economy.ts가 잇는다) */
export interface ShopPriceSource {
  readonly unitPriceOf?: ((asset: string) => bigint | undefined) | undefined;
  /** 그 도시 거래소 마지막 체결가(묶음 값) */
  last(cityId: number, asset: string): bigint | undefined;
  /** 팩 시작 시세(묶음 값) */
  start(asset: string): bigint | undefined;
  traits(owner: number): { readonly commerce: number } | undefined;
  rules(): {
    readonly npc: { readonly traitMin: number; readonly traitMax: number };
    readonly business: {
      readonly minLot: number;
      readonly npcPriceTemperPm: number;
      readonly npcPriceStockPm: number;
      readonly npcPriceStockLots: number;
    };
  };
}

/** npcDelivery.ts shopPriceOf 고리(팩 기준 값이 없으면 undefined — 값을 정하지 않는다) */
export function shopPriceSource(
  src: ShopPriceSource,
): (input: { cityId: number; owner: number; asset: string; stock: bigint }) => bigint | undefined {
  return ({ cityId, owner, asset, stock }) => {
    const base = src.unitPriceOf?.(asset);
    if (base === undefined) return undefined;
    const c = src.rules();
    const traits = src.traits(owner);
    return npcShopPrice({
      base,
      last: src.last(cityId, asset),
      start: src.start(asset),
      commerceTiltPm: traits ? traitTiltPm(traits.commerce, c.npc.traitMin, c.npc.traitMax) : 500,
      stock,
      minLot: c.business.minLot,
      temperPm: c.business.npcPriceTemperPm,
      stockPm: c.business.npcPriceStockPm,
      stockLots: c.business.npcPriceStockLots,
    });
  };
}
