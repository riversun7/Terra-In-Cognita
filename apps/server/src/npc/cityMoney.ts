// 도시 화폐(도시의 기축 통화) — docs/adr/2026-11-24-city-money.md (사용자 결정 2026-11-24 "도시는 기축통화로 화폐 한가지를 정해야하며 도시내
// 모든 사업장은 기축통화로 거래 및 세금을 낸다. … 다른나라 화폐를 고를 수 있으나 … 타국가 화폐이용시 국고에 100000개이상 보관필요").
// - 도시마다 화폐가 하나다. 그 도시의 거래소 값·거래세·사업장 돈(임금·임대료·가게 값·숙박비·집세·요금)·도시 지분 값이 모두 이 화폐다.
// - 고르지 않은 도시 = 도시 주인 나라의 화폐(전과 같다). 주인 나라 지도자가 화폐를 찍는 나라의 화폐 가운데 하나로 바꿀 수 있다(동맹·연합 화폐 포함).
// - 주인 나라 화폐가 아닌 화폐를 고르려면 그 나라 국고에 그 화폐가 FOREIGN_CITY_MONEY_MIN 이상 있어야 한다(고를 때 본다 [임시] — 그 뒤 줄어도 되돌리지 않는다).
// - 고른 값은 고른 주인과 함께 남긴다(world_cities.currency·currency_owner_id). 도시 주인이 바뀌면 그 값은 쓰지 않는다(새 주인 나라 화폐로 — 시뮬
//   beforeCityTransfer가 거래소를 새 주인 화폐로 돌리는 것과 같다).

/** 주인 나라 화폐가 아닌 화폐를 도시 화폐로 고를 때 그 나라 국고에 있어야 하는 그 화폐의 양(사용자 결정 2026-11-24) */
export const FOREIGN_CITY_MONEY_MIN = 100_000n;

/** 도시가 고른 화폐와 고른 주인(소유 주체) */
export interface CityMoneyChoice {
  readonly currency: string;
  readonly owner: number;
}

export interface CityMoney {
  /** 그 도시의 화폐. 도시가 없으면 undefined */
  of(cityId: number): string | undefined;
  /** 지금 주인이 고른 화폐(고르지 않았거나 주인이 바뀌었으면 undefined) */
  chosenOf(cityId: number): string | undefined;
  /** 고른 화폐를 적는다(null = 주인 나라 화폐로 되돌림). 주인 = 지금 그 도시 주인 */
  set(cityId: number, currency: string | null): void;
}

/** 부팅 때: 도시가 고른 화폐(world_cities.currency·currency_owner_id) */
export async function loadCityMoney(pool: {
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<Map<number, CityMoneyChoice>> {
  const { rows } = await pool.query(
    "select id, currency, currency_owner_id from world_cities where currency is not null and currency_owner_id is not null",
  );
  return new Map(
    rows.map((row) => [
      Number(row.id),
      { currency: String(row.currency), owner: Number(row.currency_owner_id) },
    ]),
  );
}

export function createCityMoney(o: {
  /** 부팅 때 읽은 고른 값(도시 → 화폐·고른 주인) */
  readonly chosen: Map<number, CityMoneyChoice>;
  /** 도시 주인(소유 주체). 도시가 없으면 undefined */
  readonly ownerOf: (cityId: number) => number | undefined;
  /** 주체의 나라 화폐(없으면 기축 통화) */
  readonly nationMoneyOf: (owner: number) => string;
}): CityMoney {
  const chosenOf = (cityId: number): string | undefined => {
    const choice = o.chosen.get(cityId);
    return choice !== undefined && choice.owner === o.ownerOf(cityId) ? choice.currency : undefined;
  };
  return {
    chosenOf,
    of(cityId) {
      const owner = o.ownerOf(cityId);
      return owner === undefined ? undefined : (chosenOf(cityId) ?? o.nationMoneyOf(owner));
    },
    set(cityId, currency) {
      const owner = o.ownerOf(cityId);
      if (currency === null || owner === undefined) o.chosen.delete(cityId);
      else o.chosen.set(cityId, { currency, owner });
    },
  };
}

/** 도시 화폐를 고를 수 있나(판정만 — 저장·거래소 돌리기는 부르는 쪽). ok면 적을 값(null = 주인 나라 화폐) */
export function cityMoneyChoice(input: {
  /** 고르려는 화폐(null = 주인 나라 화폐로 되돌림) */
  readonly currency: string | null;
  /** 주인 나라 화폐 */
  readonly own: string;
  /** 화폐를 찍는 나라가 있는 화폐인가 */
  readonly issued: (currency: string) => boolean;
  /** 주인 나라 국고의 그 화폐 잔고 */
  readonly treasuryOf: (currency: string) => bigint;
}):
  | { readonly ok: true; readonly store: string | null }
  | { readonly ok: false; readonly code: "unknown_currency" | "reserve_short" } {
  if (input.currency === null || input.currency === input.own) return { ok: true, store: null };
  if (!input.issued(input.currency)) return { ok: false, code: "unknown_currency" };
  if (input.treasuryOf(input.currency) < FOREIGN_CITY_MONEY_MIN) return { ok: false, code: "reserve_short" };
  return { ok: true, store: input.currency };
}
