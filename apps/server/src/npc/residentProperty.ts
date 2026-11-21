// 주민세 과세 재산 값(서버 고리) — 기획 D-579(바탕 = 재산: 주거·사업장 등, 임금 아님), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-579)".
// 규칙(누가·얼마·빚)은 @terra/sim society/residentTax.ts이고 하루 끝 사회 규칙(societyPayouts collectResidentTax)이 부른다. 여기는 값만 빌려 준다:
// - 그 주인이 그 도시에 가진 재산 = 그 도시에 선(일하는) 그 주인 시설들의 사업장 금고 잔고(그 나라 국고 화폐만, business/core.ts vaultBalance).
//   랭킹 자산 셈(ranking/worth.ts — "사업장 금고는 재산")과 같은 바탕을 다시 쓴다(새 값 매기기를 만들지 않는다).
// - [임시] 건물 자체 값·주거(집·숙소)는 값을 매기는 규칙이 아직 없어 0이다. 다른 화폐 금고·창고 물건도 넣지 않는다(질문 2371).
// - [임시] 지분이 팔린 사업장도 건물 주인 금고 그대로 센다(지분만큼 주주에게 나누는 랭킹 셈과 다르다 — 질문 2371).
// 세율 0이면 사회 규칙이 이 고리를 부르지 않는다(시설 훑기 없음). 부를 때마다 도시별로 한 번만 훑어 표로 든다.
import type { SimHooks } from "@terra/sim";
import type { CityFacility } from "./economy.ts";
import type { NpcBusiness } from "./npcDelivery.ts";

export interface ResidentPropertySource {
  readonly business?: Pick<NpcBusiness, "vaultBalance"> | undefined;
  facilitiesIn(cityId: number): readonly CityFacility[];
}

/** 걷는 차례 한 번의 재산 값 셈((주인, 도시, 화폐) → 값). 도시 시설 목록은 도시마다 한 번만 읽는다 */
export function residentPropertyOf(
  source: ResidentPropertySource,
): (payer: number, city: number, asset: string) => bigint {
  const business = source.business;
  const byCity = new Map<number, readonly CityFacility[]>();
  return (payer, city, asset) => {
    if (!business) return 0n;
    let list = byCity.get(city);
    if (!list) {
      list = source.facilitiesIn(city);
      byCity.set(city, list);
    }
    let sum = 0n;
    for (const entry of list)
      if (entry.ownerId === payer) sum += business.vaultBalance(entry.buildingId, payer, asset);
    return sum;
  };
}

/** 고리에 주민세 재산 값을 얹는다(경제·사업장 장부가 없으면 그대로 — 걷지 않는다) */
export function withResidentProperty(base: SimHooks, source: ResidentPropertySource | undefined): SimHooks {
  if (!source?.business) return base;
  return { ...base, residentProperty: () => residentPropertyOf(source) };
}
