// 같은 가문원을 친 사람은 가문에서 추방된다 — 사용자 결정 D-592(2026-11-22, 질문 2581 (4) 원문 "16-2 아니요. 추방"). 기획은 "같은 가문원 공격 → 공격한 사람 추방(공격은
// 막지 않는다)"로 읽었고 사용자에게 확인 중이다 [임시 — 해석 확인 중, 질문 2681]. docs/adr/2026-11-11-faction-identity.md "바뀜 (fixes-d592, D-592)".
// - 일부러 치기(travel/encounterWorld.ts strike)가 전투를 연 뒤 부른다. 치는 사람이 든 가문(world/houseTies.ts houseOfUser)과 대상 주인의 가문이 같으면(대상 주인 = 그
//   가문원 사용자 주체이거나 그 가문 자체 소유 주체) 가입 서비스의 추방 길(members.ts expel — 내보내기와 같은 지우기·소식·감사 기록, 행위자 = 시스템)로 뺀다. 그 뒤 가문 표를
//   다시 읽는다(가문 명령 뒤와 같다 — 유닛의 가문 소속 지우기·시야 묶음).
// - 가문장은 넘기기 없이 가문을 떠날 수 없어(leader_cannot_leave — 질문 1003 가) 추방하지 않는다 [임시 — 질문 2681].
// - 건물 공격은 그대로 같은 가문 건물을 막는다(own_target — 2543 (2)). 이 고리는 유닛 공격에만 걸린다.
// 원장이 아니라 세계 저장 층(world.persistence)에 붙는다(WeakMap — houseTies.ts와 같은 자리). 가문 붙이기(attach.ts)가 세계가 준비되면 붙인다.
import { houseTiesOf } from "../world/houseTies.ts";
import type { HouseMemberResult } from "./members.ts";

/** 치는 사용자 · 대상 유닛 주인들 · 시각 → 추방했나 */
export type HouseExpel = (
  attackerUserId: string,
  targetOwners: readonly number[],
  atMs: number,
) => Promise<boolean>;

/** 추방 사유(가문 소식 reason — 화면 houseText.ts가 문구를 고른다) */
export const EXPEL_REASON_ATTACK = "attacked_member";

const expels = new WeakMap<object, HouseExpel>();

/** 세계 저장 층에 붙은 추방 고리(없으면 undefined — DB 없는 월드·붙기 전) */
export const houseExpelOf = (store: object | undefined): HouseExpel | undefined =>
  store ? expels.get(store) : undefined;

/** 소유 주체 한 줄(world persistence owners와 같은 모양) */
export interface ExpelOwner {
  readonly userId: string | null;
  readonly factionId: number | null;
}

/** 대상 주인이 그 가문 것인가(그 가문원 사용자 주체 — 치는 사람 자신은 빼고 — 또는 그 가문 자체 소유 주체) */
export function sameHouseTarget(
  house: number,
  attackerUserId: string,
  owner: ExpelOwner | undefined,
  houseOfUser: (userId: string) => number | undefined,
): boolean {
  if (!owner) return false;
  if (owner.factionId !== null) return owner.factionId === house;
  return owner.userId !== null && owner.userId !== attackerUserId && houseOfUser(owner.userId) === house;
}

/** 추방 고리를 세계 저장 층에 붙인다(이미 있으면 그것) */
export function attachHouseExpel(
  store: object & { readonly owners: ReadonlyMap<number, ExpelOwner> },
  o: {
    /** 가입 서비스의 추방(members.ts expel) */
    readonly expel: (userId: string, reason: string) => Promise<HouseMemberResult>;
    /** 가문원이 바뀐 뒤(가문 표 다시 읽기) */
    readonly after: () => Promise<void>;
    /** 사용자가 든 가문(시험이 넣는다 — 기본 = 세계 저장 층의 가문 표 houseTies.ts) */
    readonly houseOf?: ((userId: string) => number | undefined) | undefined;
  },
): HouseExpel {
  const known = expels.get(store);
  if (known) return known;
  const houseOf = o.houseOf ?? ((userId: string) => houseTiesOf(store)?.houseOfUser(userId));
  const run: HouseExpel = async (attackerUserId, targetOwners) => {
    const house = houseOf(attackerUserId);
    if (house === undefined) return false;
    const hit = targetOwners.some((ownerId) =>
      sameHouseTarget(house, attackerUserId, store.owners.get(ownerId), houseOf),
    );
    if (!hit) return false;
    const result = await o.expel(attackerUserId, EXPEL_REASON_ATTACK);
    if (!result.ok) return false;
    await o.after();
    return true;
  };
  expels.set(store, run);
  return run;
}
