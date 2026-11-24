// 도시 지분 시장이 세계에서 읽는 것(세계 포트) — docs/adr/2026-11-21-share-market.md. 읽기만 한다(원장 쓰기는 시장 market.ts가 한다).
// - 도시 화폐 = 도시가 고른 화폐, 고르지 않으면 주인 세력의 나라 화폐(NPC 경제 cityMoney — 없으면 그 주체의 돈 — world/money.ts). 도시가 없으면(폐허·모르는 도시) undefined.
// - 도시 이름 = NPC 런타임 도시 자리 이름(경제 화면 창고 곳 이름과 같다).
// - 내 계정 = 사용자 소유 주체(정산 findOwnerOfUser — 없으면 만들지 않는다), 내 가문 = 내가 든 플레이어 가문(houseTies houseOfUser — 가문장인지는
//   서비스가 본다).
import type { Ledger } from "../economy/ledger.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { moneyOf } from "../world/money.ts";
import type { World } from "../world/world.ts";
import type { ShareLevy } from "./levy.ts";
import type { NpcShareHouse, NpcShareNation } from "./npcTrade.ts";
import { createWorldShareLevy } from "./levyWorld.ts";
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
  /** 지분 체결 거래세·증권 거래소 이용료(D-587 질문 2474 다 — levy.ts). 세계가 준비되지 않았으면 undefined */
  levy(): ShareLevy | undefined;
  /** NPC가 이끄는 살아 있는 나라들(NPC 지분 사기 — npcTrade.ts, D-587 질문 2471 다). 선출된 플레이어 지도자·빈자리 나라는 빠진다 */
  npcNations(): readonly NpcShareNation[];
  /** NPC 가문들(가문 금고 사기 — 질문 2522 나, npc-invest-2). 지배 쪽이 NPC인 나라의 도시 가문만. 없으면 가문은 사지 않는다 */
  npcHouses?(): readonly NpcShareHouse[];
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
      return l.npc.economy?.cityMoney.of(cityId) ?? moneyOf(l.persistence.ledger, city.owner);
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
    levy: () => worldShareLevy(live),
    npcNations() {
      const l = live();
      if (!l) return [];
      const out: NpcShareNation[] = [];
      for (const faction of l.npc.world.factions.values()) {
        if (!faction.alive || faction.player || faction.cities.size === 0) continue;
        if (l.npc.cityHouses.controlOf(faction.id) !== "npc") continue;
        out.push({
          ownerId: faction.id,
          asset:
            l.npc.economy?.economy.currencyOf.get(faction.id) ?? moneyOf(l.persistence.ledger, faction.id),
          commerce: faction.traits.commerce,
        });
      }
      return out;
    },
    npcHouses() {
      const l = live();
      if (!l) return [];
      const out: NpcShareHouse[] = [];
      for (const city of [...l.npc.world.cities.values()].toSorted((a, b) => a.id - b.id)) {
        const nation = l.npc.world.factions.get(city.owner);
        // 플레이어 가문 도시·플레이어가 이끄는 나라의 도시 가문은 빼고 NPC 쪽만(나라 사기와 같은 문)
        if (!nation?.alive || nation.player || l.npc.cityHouses.controlOf(nation.id) !== "npc") continue;
        const asset =
          l.npc.economy?.economy.currencyOf.get(nation.id) ?? moneyOf(l.persistence.ledger, nation.id);
        for (const houseId of l.npc.cityHouses.housesOfCity(city.id)) {
          const head = l.npc.cityHouses.headOf(houseId);
          const greed = head === undefined ? undefined : l.npc.unitTraits(head)?.greed;
          out.push({ houseId, asset, greed: greed ?? 500 });
        }
      }
      return out;
    },
  };
}

type LiveShareWorld = () =>
  | { readonly npc: NonNullable<World["npc"]>; readonly persistence: NonNullable<World["persistence"]> }
  | undefined;

/** 세계 값으로 지분 체결 세금·이용료 고리를 만든다(도시 주인 나라 거래세, 그 도시 일하는 증권 거래소와 그 요율 — levy.ts) */
export function worldShareLevy(live: LiveShareWorld): ShareLevy | undefined {
  const l = live();
  const facilities = l?.persistence.facilities;
  if (!l || !facilities) return undefined;
  return createWorldShareLevy({
    records: () => facilities.service.facilities.values(),
    catalog: facilities.catalog,
    works: (buildingId) => facilities.service.works(buildingId),
    business: facilities.business,
    businessRules: () => facilities.rules().business,
    cityOwner: (cityId) => l.npc.world.cities.get(cityId)?.owner,
    taxOf: (owner) => l.npc.economy?.economy.taxOf.get(owner),
    balance: (account) => l.persistence.ledger.balance(account),
  });
}
