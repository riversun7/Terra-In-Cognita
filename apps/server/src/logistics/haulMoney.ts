// 물류센터 요금 화폐 — 기획 D-559 1524("요금은 그 나라 화폐"), 기획 대조 2277, docs/adr/2026-11-16-logistics-center.md "바뀜 (haul-2)".
// 물류센터가 선 도시 → 그 도시 주인 세력의 나라 화폐(도시 경제 런타임 — 배 요금 boats/world.ts feeAssetOf와 같은 읽기). 도시·경제가 없으면 undefined
// (서버 기준 화폐). 적정가는 서버 기준 통화 눈금으로 센 뒤 지난 환전 체결가(로트당 기준 통화 값, 없으면 로트 = 같은 값)로 바꾼다(조선소 수리 적정가와
// 같은 셈 — @terra/shared convertFair, 기획 대조 2158).
import { convertFair } from "@terra/shared/fairPrice";
import type { HaulMoney } from "./haulService.ts";

/** 이 모듈이 읽는 도시 경제(NPC 런타임 economy.economy의 일부) */
export interface HaulEconomy {
  readonly fx?: ReadonlyMap<string, { readonly lastPrice?: bigint | undefined }> | undefined;
  readonly settings?: { readonly fxLot: bigint } | undefined;
}

/** NPC 런타임에서 읽는 것(facilities/world.ts input.npc의 일부) */
interface HaulRuntime {
  readonly economy?:
    | {
        readonly economy: HaulEconomy;
        /** 도시 화폐(npc/cityMoney.ts) */
        readonly cityMoney?: { of(cityId: number): string | undefined } | undefined;
      }
    | undefined;
}

export function haulMoneyOf(
  runtime: () => HaulRuntime | undefined,
  cityOf: (buildingId: number) => number | null | undefined,
): HaulMoney {
  return {
    assetOf(buildingId) {
      const cityId = cityOf(buildingId);
      const npc = runtime();
      if (cityId === null || cityId === undefined || !npc?.economy) return undefined;
      return npc.economy.cityMoney?.of(cityId);
    },
    toLocal(fair, asset) {
      const economy = runtime()?.economy?.economy;
      const lot = economy?.settings?.fxLot;
      if (!economy || lot === undefined) return fair;
      // 기준 통화 C → 나라 화폐 = C × 로트 ÷ (로트당 기준 통화 값)
      return convertFair(fair, lot, economy.fx?.get(asset)?.lastPrice ?? lot);
    },
  };
}
