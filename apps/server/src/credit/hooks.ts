// 하루 끝 주민세 빚 → 신용 깎기 고리(SimHooks.residentTaxArrears — @terra/sim simulator/societyPayouts.ts) — docs/adr/2026-11-21-credit.md.
// npc/rulingVault.ts npcRulingHooks가 얹는다(npc/runtime.ts 줄 수 상한). 신용 장부는 원장으로 찾는다(붙기 전이면 아무것도 하지 않는다).
import type { SimHooks } from "@terra/sim";
import { blacklistCheckOf } from "../factionIdentity/blacklist.ts";
import { creditBookOf } from "./book.ts";
import { coupTruceOf } from "./coupTruce.ts";

export function withCredit(base: SimHooks, o: { readonly ledger: object }): SimHooks {
  return {
    ...base,
    residentTaxArrears(faction, arrears, nowMs) {
      base.residentTaxArrears?.(faction, arrears, nowMs);
      creditBookOf(o.ledger)?.residentArrears(faction.id, arrears, nowMs);
    },
  };
}

/**
 * 같은 나라 유저 공격(D-584 — 신용 내림): 공격한 주인과 대상 주인이 둘 다 소속 줄이 있고(사용자 주인 — 소속 훑기가 만든다) 같은 나라면 남는 벌점 한 번.
 * facilities/attack.ts가 전투를 넣은 뒤 부른다. "같은 나라 유저"를 소속 줄로 읽는다(D-588 2496 가 — 건물·유닛 모두. 가문원끼리·봉신 나라·내전 범위는 질문 2543)
 * 바뀜(fixes-d592 — D-592 2581 (4)): 열린 쿠데타에서 맞선 편끼리면 벌점 없음(credit/coupTruce.ts)
 */
export function creditAttackHook(ledger: object) {
  return (attackerOwner: number, targetOwner: number, atMs: number): void => {
    const book = creditBookOf(ledger);
    const mine = book?.standingOf(attackerOwner)?.nationId;
    if (!book || mine === undefined || attackerOwner === targetOwner) return;
    // 열린 쿠데타에서 맞선 편끼리면 벌점 없음(D-592 — 가담 벌점만, coupTruce.ts)
    if (coupTruceOf(ledger)?.(attackerOwner, targetOwner) === true) return;
    // 대상이 공격자 나라의 블랙리스트 유저면 무패널티 PVP 명분(ADR 2026-11-25-house-city-approval-and-blacklist.md)
    if (blacklistCheckOf(ledger)?.(attackerOwner, targetOwner) === true) return;
    if (book.standingOf(targetOwner)?.nationId === mine)
      book.event(attackerOwner, "same_nation_attack", atMs);
  };
}

/**
 * 같은 나라 유저 유닛 공격(약탈 행위 — 사용자 결정 D-588 2496 가: "같은 나라 유저의 건물이나 유닛을 공격하면 신용이 내린다"). 2차맵 유닛 교전(travel/encounterWorld.ts)이
 * 전투를 연 뒤 부른다: 먼저 건 편(공격 편)의 주인마다, 수비 편에 같은 나라 소속 줄을 가진 다른 주인이 하나라도 있으면 그 전투에서 한 번 벌점(credit_same_nation_attack).
 * 지금 조우는 다른 나라 편끼리만 만나므로(D-570 1904 — 나라 = 가문·시민권) 이 고리는 소속 줄 나라와 조우 나라가 어긋날 때만 걸린다 [임시 — 질문 2543]. 벌점을 준 주인 수.
 * 바뀜(fixes-d592 — 사용자 결정 D-592 2581 (4)): 열린 쿠데타에서 맞선 편(credit/coupTruce.ts)인 대상은 세지 않는다 — 쿠데타 중 같은 나라 공격은 가담 벌점만
 */
export function creditUnitAttack(
  ledger: object,
  attackers: readonly number[],
  defenders: readonly number[],
  atMs: number,
): number {
  const book = creditBookOf(ledger);
  if (!book) return 0;
  const defenderNations = new Map<number, number>();
  for (const owner of new Set(defenders)) {
    const nation = book.standingOf(owner)?.nationId;
    if (nation !== undefined) defenderNations.set(owner, nation);
  }
  const truce = coupTruceOf(ledger);
  const blacklisted = blacklistCheckOf(ledger);
  let marked = 0;
  for (const owner of new Set(attackers)) {
    const mine = book.standingOf(owner)?.nationId;
    if (mine === undefined) continue;
    // 열린 쿠데타에서 맞선 편·블랙리스트 유저인 대상은 세지 않는다(D-592·ADR 2026-11-25)
    const hit = [...defenderNations].some(
      ([target, nation]) =>
        target !== owner &&
        nation === mine &&
        truce?.(owner, target) !== true &&
        blacklisted?.(owner, target) !== true,
    );
    if (hit && book.event(owner, "same_nation_attack", atMs)) marked += 1;
  }
  return marked;
}

/** 정산 유지비 고리(질문 2447 나 — world/settlement.ts onUpkeep → credit/book.ts upkeep) */
export function creditUpkeepHook(ledger: object) {
  return (ownerId: number, unpaid: number, lastPaid: boolean | null, atMs: number): void =>
    creditBookOf(ledger)?.upkeep(ownerId, unpaid, lastPaid, atMs);
}
