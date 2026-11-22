// 열린 쿠데타의 맞선 편(순수 + 의결 틱 고리) — 사용자 결정 D-592(질문 2581 (4) "쿠데타 중" — 같은 나라 공격 신용 벌점 없음, 가담 벌점만). credit/coupTruce.ts가 쓰는 편 표를
// 의결 틱마다 다시 만든다. docs/adr/2026-11-21-credit.md "바뀜 (fixes-d592, D-592)".
// - 혁명군 = 일으킨 사람 + 혁명군 참가 줄 사용자 + 일으킨 플레이어 가문(p:)의 가문원·그 가문 소유 주체. 정부군 = 정부군 참가 줄 사용자 + 지배 플레이어 가문의 가문원·소유 주체.
//   참가 줄이 가문보다 앞선다(지배 가문원이 혁명군에 들었으면 혁명군). NPC 가문 유닛은 NPC 나라 소유라 신용 벌점과 상관없다(소속 줄은 사용자 주인만).
// - 두 주인이 같은 열린 쿠데타의 다른 편이면 맞선 편이다 [임시 — 질문 2682: 편이 아닌 같은 나라 사람·같은 편끼리는 그대로 벌점].
import type { HouseKey } from "@terra/shared/governance";
import { setCoupTruce } from "../credit/coupTruce.ts";
import { houseTiesOf } from "../world/houseTies.ts";
import type { World } from "../world/world.ts";
import type { CoupRow, CoupSide, CoupSideRow, CoupStore } from "./coupStore.ts";
import type { StateRow } from "./store.ts";

/** 열린 쿠데타 하나의 편 */
export interface CoupFront {
  readonly coupId: number;
  /** 참가 줄·일으킨 사람(사용자 → 편) */
  readonly users: ReadonlyMap<string, CoupSide>;
  /** 플레이어 가문 행 → 편(일으킨 가문 = 혁명군, 지배 가문 = 정부군) */
  readonly houses: ReadonlyMap<number, CoupSide>;
}

/** 편을 가리는 사람 하나(사용자 주체면 사용자와 든 가문, 가문 소유 주체면 가문) */
export interface CoupPerson {
  readonly userId: string | null;
  readonly house: number | undefined;
}

const playerHouse = (key: HouseKey | null): number | undefined =>
  key?.startsWith("p:") ? Number(key.slice(2)) : undefined;

/** 열린 쿠데타들의 편(쿠데타 차례) */
export function coupFronts(
  coups: readonly CoupRow[],
  sidesOf: ReadonlyMap<number, readonly CoupSideRow[]>,
  rulingOf: (nationId: number) => HouseKey | null,
): CoupFront[] {
  return coups.map((coup) => {
    const users = new Map<string, CoupSide>();
    if (coup.userId !== null) users.set(coup.userId, "rebel");
    for (const row of sidesOf.get(coup.id) ?? []) if (row.userId !== null) users.set(row.userId, row.side);
    const houses = new Map<number, CoupSide>();
    const loyal = playerHouse(rulingOf(coup.nationId));
    if (loyal !== undefined) houses.set(loyal, "government");
    const rebel = playerHouse(coup.houseKey);
    if (rebel !== undefined) houses.set(rebel, "rebel");
    return { coupId: coup.id, users, houses };
  });
}

/** 그 쿠데타에서 그 사람의 편(참가 줄 먼저, 다음 가문). 없으면 undefined */
export function sideIn(front: CoupFront, person: CoupPerson): CoupSide | undefined {
  const own = person.userId === null ? undefined : front.users.get(person.userId);
  if (own) return own;
  return person.house === undefined ? undefined : front.houses.get(person.house);
}

/** 두 사람이 같은 열린 쿠데타의 다른 편인가 */
export function opposedInCoup(fronts: readonly CoupFront[], a: CoupPerson, b: CoupPerson): boolean {
  return fronts.some((front) => {
    const left = sideIn(front, a);
    const right = sideIn(front, b);
    return left !== undefined && right !== undefined && left !== right;
  });
}

type TruceWorld = Pick<World, "persistence">;

/** 의결 틱마다: 열린 쿠데타 편을 다시 만들어 원장에 붙인다(세계 저장 층이 없으면 아무것도 하지 않는다) */
export async function refreshCoupTruce(o: {
  readonly world: TruceWorld | undefined;
  readonly coups: Pick<CoupStore, "gathering" | "sides">;
  readonly states: () => Promise<ReadonlyMap<number, StateRow>>;
}): Promise<void> {
  const persistence = o.world?.persistence;
  if (!persistence) return;
  const gathering = await o.coups.gathering();
  const sidesOf = new Map<number, CoupSideRow[]>();
  for (const coup of gathering) sidesOf.set(coup.id, await o.coups.sides(coup.id));
  const states = gathering.length > 0 ? await o.states() : new Map<number, StateRow>();
  const fronts = coupFronts(gathering, sidesOf, (nationId) => states.get(nationId)?.rulingHouseKey ?? null);
  const personOf = (ownerId: number): CoupPerson | undefined => {
    const owner = persistence.owners.get(ownerId);
    if (!owner) return undefined;
    if (owner.factionId !== null) return { userId: null, house: owner.factionId };
    if (owner.userId === null) return undefined;
    return { userId: owner.userId, house: houseTiesOf(persistence)?.houseOfUser(owner.userId) };
  };
  setCoupTruce(persistence.ledger, (attacker, target) => {
    if (fronts.length === 0) return false;
    const a = personOf(attacker);
    const b = personOf(target);
    return a !== undefined && b !== undefined && opposedInCoup(fronts, a, b);
  });
}
