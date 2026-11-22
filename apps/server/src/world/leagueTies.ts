// 가문 연맹 조항 카드의 집행 고리(league-2, 사용자 결정 D-590 2501 다 — 연맹에 붙인 우호 기능 카드, 나라 조약과 따로). docs/adr/2026-11-21-npc-needs-drives.md
// "바뀜 (league-2, D-590)".
// - 연맹 표(factionIdentity/leagueService.ts)가 세계 저장 층(persistence)과 그 사업장 장부(persistence.facilities.business — 요금을 받는 쪽이 들고 있다)에
//   동기 조회를 붙인다(houseTies.ts·houseTax.ts와 같은 WeakMap 꼴). 시야 틱·요금 내기·거래 체결이 동기로 묻는다.
// - 소유 주체 → 플레이어 가문: 도시를 가진 가문 주체(world_owners.faction_id = 가문 행) 또는 가문원 사용자의 주체(houseTies.ts houseOfUser). NPC 국가 주체는
//   가문이 없다 — NPC 가문(npc_houses) 유닛·시설은 나라 주체 것이라 카드가 닿지 않는다 [임시 — 질문 2643].
// - shared_vision: 보는 사람 가문과 그 카드가 붙은 연맹에 함께 든 플레이어 가문의 소유 주체가 덮는 칸을 남을 보는 시야에 더한다(vision.ts allies).
// - fee_discount: 판 쪽(내는 쪽) 가문과 받는 시설 주인 가문이 그 카드가 붙은 연맹에 함께 들었으면 요금을 설정 칸(house_league_fee_discount_pm)만큼 깎는다.
import type { HouseLeagueClause } from "@terra/protocol";
import { houseTiesOf } from "./houseTies.ts";
import type { AllyLookup } from "./vision.ts";

/** 연맹 표의 동기 조회(league-2) */
export interface LeagueTies {
  /** 그 카드가 붙은 연맹에서 이 플레이어 가문(세력 행)과 함께 든 플레이어 가문들(자기 빼고). 없으면 빈 모음 */
  partnersOf(clause: HouseLeagueClause, house: number): ReadonlySet<number>;
  /** 연맹 표 판(든 가문·카드가 바뀔 때마다 오른다 — 시야 묶음 열쇠) */
  version(): number;
  /** 요금 깎는 몫(‰, 설정 칸 house_league_fee_discount_pm) */
  feeDiscountPm(): number;
}

/** 소유 주체를 찾는 저장 층(WorldPersistence의 owners 몫) */
type OwnerStore = {
  readonly owners: ReadonlyMap<number, { readonly factionId: number | null; readonly userId: string | null }>;
};

interface Attached {
  readonly ties: LeagueTies;
  /** 소유 주체 → 가문을 찾는 세계 저장 층 */
  readonly store: OwnerStore;
}

const byKey = new WeakMap<object, Attached>();

/** 연맹 조회를 세계 저장 층(과 keys — 사업장 장부 등)에 붙인다(이미 있으면 바꾼다) */
export function attachLeagueTies(store: OwnerStore, ties: LeagueTies, keys: readonly object[] = []): void {
  const attached = { ties, store };
  byKey.set(store, attached);
  for (const key of keys) byKey.set(key, attached);
}

/** 붙은 연맹 조회(세계 저장 층·사업장 장부로 찾는다). 없으면 undefined */
export function leagueTiesOf(key: object | undefined): LeagueTies | undefined {
  return key ? byKey.get(key)?.ties : undefined;
}

/** 소유 주체 → 플레이어 가문(세력 행). 가문이 없으면 undefined */
export function houseOfOwner(p: OwnerStore, ownerId: number): number | undefined {
  const owner = p.owners.get(ownerId);
  if (!owner) return undefined;
  const ties = houseTiesOf(p);
  if (owner.factionId !== null)
    return ties?.nationOfHouse(owner.factionId) === undefined ? undefined : owner.factionId;
  return owner.userId === null ? undefined : ties?.houseOfUser(owner.userId);
}

/** 두 소유 주체의 가문이 그 카드가 붙은 연맹에 함께 들었나(key = 세계 저장 층 또는 사업장 장부) */
export function leagueTied(
  key: object | undefined,
  clause: HouseLeagueClause,
  a: number,
  b: number,
): boolean {
  const attached = key ? byKey.get(key) : undefined;
  if (!attached) return false;
  const houseA = houseOfOwner(attached.store, a);
  const houseB = houseOfOwner(attached.store, b);
  return houseA !== undefined && houseB !== undefined && attached.ties.partnersOf(clause, houseA).has(houseB);
}

/**
 * 연맹 요금 깎기(fee_discount): 내는 주체와 받는 시설 주인이 함께 든 연맹에 그 카드가 붙었으면 깎은 요금(내림), 아니면 그대로. 받는 주인이 없거나 같은
 * 주체면 그대로. key = 세계 저장 층 또는 사업장 장부
 */
export function leagueDiscountedFee(
  key: object | undefined,
  payer: number,
  receiver: number | null | undefined,
  fee: bigint,
): bigint {
  if (fee <= 0n || receiver === null || receiver === undefined || receiver === payer) return fee;
  const ties = leagueTiesOf(key);
  if (!ties || !leagueTied(key, "fee_discount", payer, receiver)) return fee;
  const pm = BigInt(Math.min(1000, Math.max(0, Math.trunc(ties.feeDiscountPm()))));
  return fee - (fee * pm) / 1000n;
}

/** 시야에 넘기는 연맹 시야 나눔(월드를 잡아 두고 부를 때마다 읽는다) */
export function allyLookupOf(source: { readonly persistence?: OwnerStore | undefined }): AllyLookup {
  return (viewerOwnerId) => {
    const p = source.persistence;
    const ties = leagueTiesOf(p);
    if (!p || !ties) return undefined;
    const house = houseOfOwner(p, viewerOwnerId);
    if (house === undefined) return undefined;
    const partners = ties.partnersOf("shared_vision", house);
    if (partners.size === 0) return undefined;
    return {
      key: `h:${String(house)}:${String(ties.version())}`,
      member: (ownerId) => {
        const other = houseOfOwner(p, ownerId);
        return other !== undefined && partners.has(other);
      },
    };
  };
}
