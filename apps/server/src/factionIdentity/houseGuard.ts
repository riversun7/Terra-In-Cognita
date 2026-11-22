// 같은 가문끼리는 공격하지 못한다 — 사용자 결정 D-593(2026-11-22, 기획 커밋 38b81e3, 질문 2681 원문 "4.네 그러나 공격자체가 불가"). fixes-d592의
// [임시] "같은 가문원 공격 → 추방"(houseExpel.ts — 지움)을 대신한다. docs/adr/2026-11-11-faction-identity.md "바뀜 (d593, D-593)".
// - 소유 주체의 가문 = 연맹 고리와 같은 셈(world/leagueTies.ts houseOfOwner — 가문 소유 주체면 그 가문, 사용자 주체면 그 사람이 든 가문). NPC 나라 주체·무소속은
//   가문이 없다(같은 가문이 아니다).
// - 두 소유 주체가 같은 가문이면(같은 주체는 부르는 쪽이 own_target으로 먼저 막는다) 유닛 일부러 치기(travel/encounterWorld.ts strike — 결과 own_target)와
//   NPC 같은 나라 치기(npcStrikes — 후보에서 뺌)를 하지 않는다. 건물·봉화 공격은 원래 같은 가문 건물을 막는다(own_target — 2543 (2)).
// - 한눈 정보(worldMap/mapUnits.ts sameHouse)가 같은 셈으로 [공격]을 감춘다.
import { houseOfOwner } from "../world/leagueTies.ts";

type OwnerStore = Parameters<typeof houseOfOwner>[0];

/** 두 소유 주체(ID)가 같은 가문인가(가문 표가 없거나 같은 주체면 false) */
export function sameHouseOwners(store: OwnerStore | undefined, a: number, b: number): boolean {
  if (!store || a === b) return false;
  const house = houseOfOwner(store, a);
  return house !== undefined && house === houseOfOwner(store, b);
}
