// 지분 체결 세금·이용료 고리를 세계 값으로 만든다(levy.ts) — 도시 지분 시장 포트(port.ts)와 사업장 지분 시장(facilities/world.ts)이 같이 쓴다.
// docs/adr/2026-11-21-share-market-2.md(기획 D-587 질문 2474 다). 부를 때마다 시설 줄을 한 번 훑어 도시마다 일하는 증권 거래소를 찾는다(회차마다 한 번).
import type { BusinessCoefficients } from "@terra/sim";
import type { BusinessCore } from "../business/core.ts";
import type { FacilityCatalog } from "../facilities/catalog.ts";
import type { FacilityRecord } from "../facilities/state.ts";
import { createExchangeDirectory } from "../market/exchangeBuildings.ts";
import { shareFeeOf } from "../market/fxFee.ts";
import { DEFAULT_TAX_BP } from "../npc/currency.ts";
import { type ShareLevy, shareLevyRates } from "./levy.ts";

export function createWorldShareLevy(o: {
  records(): Iterable<FacilityRecord>;
  catalog(): FacilityCatalog;
  works(buildingId: number): boolean;
  readonly business: Pick<BusinessCore, "price" | "receive">;
  businessRules(): BusinessCoefficients;
  /** 도시 주인 세력(없는 도시면 undefined) */
  cityOwner(cityId: number): number | undefined;
  /** 세력 거래세(만분율 — 도시 경제 taxOf). 없으면 기본 거래세 */
  taxOf(owner: number): number | undefined;
  /** 계정 잔고(이용료를 낼 수 있나) */
  balance(account: number): bigint;
}): ShareLevy {
  const securities = createExchangeDirectory({
    records: () => o.records(),
    catalog: () => o.catalog(),
    works: (buildingId) => o.works(buildingId),
  }).citiesWith("securities");
  const feeBp = (buildingId: number): number =>
    shareFeeOf((id, item) => o.business.price(id, item), o.businessRules(), buildingId).charged;
  // 일하는 증권 거래소 건물 → 그 도시(주문에 적힌 거래소 확인 — 바뀜 gov-fix-4, D-591 2523)
  const cityOfExchange = new Map([...securities].map(([cityId, buildingId]) => [buildingId, cityId]));
  return {
    feeAt(buildingId, cityId) {
      const at = cityOfExchange.get(buildingId);
      if (at === undefined) return undefined;
      const owner = o.cityOwner(cityId);
      return owner !== undefined && o.cityOwner(at) === owner
        ? { buildingId, bp: feeBp(buildingId) }
        : undefined;
    },
    rateOf: shareLevyRates({
      cityOwner: (cityId) => o.cityOwner(cityId),
      taxOf: (owner) => o.taxOf(owner) ?? DEFAULT_TAX_BP,
      exchangeIn: (cityId) => securities.get(cityId),
      feeBp,
    }),
    pay: ({ from, buildingId, asset, amount, atMs }) => {
      if (amount <= 0n || o.balance(from) < amount) return;
      o.business.receive({ from, buildingId, asset, amount, kind: "share_fee", atMs });
    },
  };
}
