// 같은 가문끼리는 공격하지 못한다 — 사용자 결정 D-593(2026-11-22, 기획 커밋 38b81e3, 질문 2681 원문 "4.네 그러나 공격자체가 불가"). fixes-d592의
// [임시] "같은 가문원 공격 → 추방"(houseExpel.ts — 지움)을 대신한다. docs/adr/2026-11-11-faction-identity.md "바뀜 (d593, D-593)".
// - 소유 주체의 가문(houseOfOwner — 가문 소유 주체면 그 가문, 사용자 주체면 그 사람이 든 가문, world/houseTies.ts로 찾는다). NPC 나라 주체·무소속은
//   가문이 없다(같은 가문이 아니다). 옛 연맹 조항 고리(world/leagueTies.ts — league-3 D-593으로 지움)에 있던 가문 찾기만 여기로 옮겼다(묶음 1117j).
// - 두 소유 주체가 같은 가문이면(같은 주체는 부르는 쪽이 own_target으로 먼저 막는다) 유닛 일부러 치기(travel/encounterWorld.ts strike — 결과 own_target)와
//   NPC 같은 나라 치기(npcStrikes — 후보에서 뺌)를 하지 않는다. 건물·봉화 공격은 원래 같은 가문 건물을 막는다(own_target — 2543 (2)).
// - 한눈 정보(worldMap/mapUnits.ts sameHouse)가 같은 셈으로 [공격]을 감춘다.
import { houseTiesOf } from "../world/houseTies.ts";

/** 소유 주체를 찾는 저장 층(WorldPersistence의 owners 몫) */
type OwnerStore = {
  readonly owners: ReadonlyMap<number, { readonly factionId: number | null; readonly userId: string | null }>;
};

/** 소유 주체 → 플레이어 가문(세력 행). 가문이 없으면 undefined */
export function houseOfOwner(p: OwnerStore, ownerId: number): number | undefined {
  const owner = p.owners.get(ownerId);
  if (!owner) return undefined;
  const ties = houseTiesOf(p);
  if (owner.factionId !== null)
    return ties?.nationOfHouse(owner.factionId) === undefined ? undefined : owner.factionId;
  return owner.userId === null ? undefined : ties?.houseOfUser(owner.userId);
}

/** 두 소유 주체(ID)가 같은 가문인가(가문 표가 없거나 같은 주체면 false) */
export function sameHouseOwners(store: OwnerStore | undefined, a: number, b: number): boolean {
  if (!store || a === b) return false;
  const house = houseOfOwner(store, a);
  return house !== undefined && house === houseOfOwner(store, b);
}
