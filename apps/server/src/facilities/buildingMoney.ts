// 건물의 돈 — 그 건물에서 오가는 돈(임금·임대료·보증금·가게 값·지분 값·숙박비·집세·외주 요금)의 화폐.
// docs/adr/2026-11-23-nation-money.md: 건물이 선 도시의 화폐(도시 기축 통화 — npc/cityMoney.ts, 고르지 않으면 도시 주인 나라 화폐. 거래소 값·배 요금·물류 요금 D-559 1524와 같은 읽기). 도시가 없거나 경제가
// 돌지 않으면 건물 주인의 돈(world/money.ts moneyOf — 소속 국가 화폐), 주인도 없으면 주체 없는 돈(기축 통화, 나라 없는 세계면 NO_NATION_MONEY).
// 건물마다 화폐가 하나라 사업장 금고가 한 화폐로 돈다(매출·임금·보증금이 같은 화폐).
import { moneyOf } from "../world/money.ts";

/** 이 모듈이 읽는 NPC 런타임(도시 주인·세력 화폐) */
export interface BuildingMoneyRuntime {
  readonly economy?:
    | { readonly cityMoney?: { of(cityId: number): string | undefined } | undefined }
    | undefined;
}

export function buildingMoneyOf(parts: {
  readonly ledger: object;
  readonly npc: () => BuildingMoneyRuntime | undefined;
  /** 건물이 선 도시(없으면 null·undefined) */
  readonly cityOf: (buildingId: number) => number | null | undefined;
  /** 건물 주인(없으면 null·undefined) */
  readonly ownerOf: (buildingId: number) => number | null | undefined;
}): (buildingId: number) => string {
  return (buildingId) => {
    const cityId = parts.cityOf(buildingId);
    const npc = parts.npc();
    if (cityId !== null && cityId !== undefined && npc?.economy) {
      const currency = npc.economy.cityMoney?.of(cityId);
      if (currency !== undefined) return currency;
    }
    return moneyOf(parts.ledger, parts.ownerOf(buildingId) ?? undefined);
  };
}
