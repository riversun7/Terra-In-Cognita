// 환전 이용료 고리(질문 2086 — fxFee.ts) — npc/economy.ts(1,000줄 상한 가까움)가 환전 시장 모음(fx.ts)에 넘긴다.
// 그 화폐를 쓰는 나라(도시 주인 나라 화폐)의 일하는 외환 거래소 가운데 요율이 가장 낮은 곳(같으면 작은 건물 ID)이 받는다. 판 쪽 기준 통화 지갑 →
// 그 외환 거래소 금고(사업장 장부 수입 fx_fee, 소득세 포함). 지갑에 모자라면 내지 않는다(회차에 받은 기준 통화라 늘 있다).
import type { LedgerBook } from "@terra/sim";
import type { BusinessCore } from "../business/core.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { FxRegistryOptions } from "./fx.ts";
import { cheapestFxExchange } from "./fxFee.ts";

export function fxFeeHook(
  input: {
    readonly fxExchanges?: (() => ReadonlyMap<number, number>) | undefined;
    readonly fxFeeBp?: ((buildingId: number) => number) | undefined;
    readonly business?: Pick<BusinessCore, "receive"> | undefined;
  },
  book: LedgerBook,
  currencyOfCity: (cityId: number) => string | undefined,
): FxRegistryOptions["fee"] {
  const { fxExchanges, fxFeeBp, business } = input;
  if (!fxExchanges || !fxFeeBp || !business) return undefined;
  return {
    of(currency) {
      const candidates: number[] = [];
      for (const [cityId, buildingId] of fxExchanges())
        if (currencyOfCity(cityId) === currency) candidates.push(buildingId);
      return cheapestFxExchange(candidates, fxFeeBp);
    },
    charge({ seller, amount, buildingId, atMs }) {
      const from = book.ownerAccount(seller, ASSET_CREDIT);
      if (book.balance(from) < amount) return;
      business.receive({ from, buildingId, asset: ASSET_CREDIT, amount, kind: "fx_fee", atMs });
    },
  };
}
