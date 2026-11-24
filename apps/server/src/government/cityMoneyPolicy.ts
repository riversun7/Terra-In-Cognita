// 도시 화폐(도시의 기축 통화) 고르기 — docs/adr/2026-11-24-city-money.md (사용자 결정 2026-11-24). 규칙은 npc/cityMoney.ts, 메시지는 @terra/protocol
// cityMoney.ts(WebSocket city_currency → city_currency_result — 가문 게이트웨이가 받아 넘긴다).
// - 고르는 사람: 그 도시 주인 나라의 지도자(나라 세금 정하기와 같다 — 독립 나라 가문장, 선출로 NPC 나라를 이끄는 플레이어 지배 가문의 장).
// - 다른 나라 화폐는 그 나라 국고에 그 화폐가 FOREIGN_CITY_MONEY_MIN 이상 있을 때만 고른다(고를 때 본다).
// - 고르면 world_cities에 적고(고른 주인과 함께) 그 도시 거래소를 새 화폐로 돌린다(걸린 주문은 돌려준다). 감사 기록 faction.city_currency.
import type { CityMoneyResultCode } from "@terra/protocol";
import { currencyAsset } from "@terra/sim";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { electedNationOf, ruledBy } from "../factionIdentity/houseEntryPolicy.ts";
import { type HouseTxPool, inTransaction, membershipOf } from "../factionIdentity/members.ts";
import { currencyCode } from "../market/fxViews.ts";
import { cityMoneyChoice } from "../npc/cityMoney.ts";

export type CityMoneyResult =
  | { readonly ok: true; readonly cityId: number; readonly currency: string }
  | { readonly ok: false; readonly code: CityMoneyResultCode };

export interface CityMoneyPolicyService {
  /** currency = 화폐 코드(null = 주인 나라 화폐) */
  set(userId: string, cityId: number, currency: string | null): Promise<CityMoneyResult>;
}

/** 이 정책이 읽고 바꾸는 세계(준비된 세계의 도시 경제) */
export interface CityMoneyWorld {
  /** 도시 주인(소유 주체). 없는 도시면 undefined */
  cityOwner(cityId: number): number | undefined;
  /** 소유 주체의 세력 행 */
  factionRowOf(ownerId: number): number | undefined;
  /** 세력의 나라 화폐(원장 자산) */
  nationMoneyOf(ownerId: number): string;
  /** 화폐를 찍는 나라가 있는 화폐인가 */
  issued(asset: string): boolean;
  /** 주체의 그 화폐 잔고(국고) */
  balanceOf(ownerId: number, asset: string): bigint;
  /** 도시 화폐(지금) */
  cityMoneyOf(cityId: number): string | undefined;
  /** 메모리 값·거래소를 바꾼다(null = 주인 나라 화폐) */
  apply(cityId: number, asset: string | null, nowMs: number): void;
}

const fail = (code: CityMoneyResultCode): CityMoneyResult => ({ ok: false, code });

export function createCityMoneyPolicy(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
  /** 세계·도시 경제가 준비되지 않았으면 undefined(busy) */
  readonly world: () => CityMoneyWorld | undefined;
}): CityMoneyPolicyService {
  return {
    async set(userId, cityId, currency) {
      const world = o.world();
      if (!world) return fail("busy");
      const owner = world.cityOwner(cityId);
      const ownerRow = owner === undefined ? undefined : world.factionRowOf(owner);
      if (owner === undefined || ownerRow === undefined) return fail("unknown_city");
      const before = world.cityMoneyOf(cityId);
      let stored: string | null = null;
      const result = await inTransaction(o.pool, async (q): Promise<CityMoneyResult> => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        // 가문 행을 잠근다(도시 얻기·해산·독립과 겹치지 않게)
        await q.query("select id from factions where id = $1 for update", [mine.factionId]);
        const ruled = await ruledBy(q, mine.factionId);
        const nationId = ruled.nation ? mine.factionId : await electedNationOf(q, mine.factionId);
        if (nationId === undefined) return fail("not_ruler");
        if (nationId !== ownerRow) return fail("unknown_city");
        const choice = cityMoneyChoice({
          currency: currency === null ? null : currencyAsset(currency),
          own: world.nationMoneyOf(owner),
          issued: (asset) => world.issued(asset),
          treasuryOf: (asset) => world.balanceOf(owner, asset),
        });
        if (!choice.ok) return fail(choice.code);
        stored = choice.store;
        await q.query("update world_cities set currency = $2, currency_owner_id = $3 where id = $1", [
          cityId,
          stored,
          stored === null ? null : owner,
        ]);
        return { ok: true, cityId, currency: currencyCode(stored ?? world.nationMoneyOf(owner)) };
      });
      if (!result.ok) return result;
      // 그 사이 주인이 바뀌었으면 메모리에 적지 않는다(고른 주인이 달라 어차피 쓰지 않는다)
      if (world.cityOwner(cityId) === owner) world.apply(cityId, stored, o.now());
      if (o.db)
        await writeAudit(o.db, {
          actor: { kind: "user", id: userId, ip: null },
          action: "faction.city_currency",
          targetId: userId,
          before: null,
          after: { cityId, before: before ?? null, after: world.cityMoneyOf(cityId) ?? null },
        });
      return result;
    },
  };
}
