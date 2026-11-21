// 도시 지분 시장이 세계에서 읽는 것(세계 포트) — docs/adr/2026-11-21-share-market.md. 읽기만 한다(원장 쓰기는 시장 market.ts가 한다).
// - 도시 화폐 = 그 도시 주인 세력의 나라 화폐(NPC 경제 currencyOf — 없으면 서버 기준 화폐). 도시가 없으면(폐허·모르는 도시) undefined.
// - 도시 이름 = NPC 런타임 도시 자리 이름(경제 화면 창고 곳 이름과 같다).
// - 내 계정 = 사용자 소유 주체(정산 findOwnerOfUser — 없으면 만들지 않는다), 내 가문 = 내가 든 플레이어 가문(houseTies houseOfUser — 가문장인지는
//   서비스가 본다).
import type { Ledger } from "../economy/ledger.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { World } from "../world/world.ts";
import type { ShareMarketView } from "@terra/shared/businessBooks";
import type { ExchangeKind } from "@terra/shared/exchange";
import type { LocalizedName } from "@terra/shared/roster";

/** 증권 거래소 목록이 읽는 시설(시설 줄·팩 시설·사업장 지분 조회) */
export interface ShareFacilities {
  records(): Iterable<{
    readonly buildingId: number;
    readonly facilityId: string;
    readonly cityId: number | null;
    readonly level: number;
  }>;
  record(
    buildingId: number,
  ): { readonly facilityId: string; readonly cityId: number | null; readonly level: number } | undefined;
  facility(
    facilityId: string,
  ): { readonly name: LocalizedName; readonly exchange?: ExchangeKind | undefined } | undefined;
  /** 사업장 지분 시장 조회(보는 사람 없이 — 읽기만) */
  shareView(buildingId: number, nowMs: number): ShareMarketView;
}

export interface CitySharePort {
  ready(): boolean;
  ledger(): Ledger | undefined;
  writer(): WorldWriter | undefined;
  pool():
    | { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
    | undefined;
  currencyOf(cityId: number): string | undefined;
  cityName(cityId: number): string | undefined;
  /** 도시 주인 세력(= 국고 소유 주체). 없으면 undefined */
  cityOwner(cityId: number): number | undefined;
  /** 사용자 소유 주체(없으면 undefined — 만들지 않는다) */
  ownerOfUser(userId: string): number | undefined;
  /** 내가 든 플레이어 가문 세력 행(무소속이면 undefined — 가문장인지는 서비스가 의결 표 headOf로 본다) */
  houseOfUser(userId: string): number | undefined;
  /** 시설(사업장·거래소 건물) — 증권 거래소 목록 */
  facilities(): ShareFacilities | undefined;
}

type ShareWorld = Pick<World, "status" | "npc" | "persistence">;

export function worldCitySharePort(world: () => ShareWorld | undefined): CitySharePort {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.npc && w.persistence
      ? { npc: w.npc, persistence: w.persistence }
      : undefined;
  };
  return {
    ready: () => live() !== undefined,
    ledger: () => live()?.persistence.ledger,
    writer: () => live()?.persistence.writer,
    pool: () => live()?.persistence.pool,
    currencyOf(cityId) {
      const l = live();
      const city = l?.npc.world.cities.get(cityId);
      if (!l || !city) return undefined;
      return l.npc.economy?.economy.currencyOf.get(city.owner) ?? ASSET_CREDIT;
    },
    cityName: (cityId) => live()?.npc.places.get(cityId)?.name,
    cityOwner: (cityId) => live()?.npc.world.cities.get(cityId)?.owner,
    ownerOfUser: (userId) => live()?.persistence.settlement.findOwnerOfUser(userId),
    houseOfUser: (userId) => houseTiesOf(live()?.persistence)?.houseOfUser(userId),
    facilities() {
      const facilities = live()?.persistence.facilities;
      if (!facilities) return undefined;
      return {
        records: () => facilities.service.facilities.values(),
        record: (buildingId) => facilities.service.facilities.get(buildingId),
        facility: (facilityId) => facilities.catalog().facility(facilityId),
        shareView: (buildingId, nowMs) => facilities.shares.view(buildingId, undefined, nowMs),
      };
    },
  };
}
