// 하루 끝 주민세 빚 → 신용 깎기 고리(SimHooks.residentTaxArrears — @terra/sim simulator/societyPayouts.ts) — docs/adr/2026-11-21-credit.md.
// npc/rulingVault.ts npcRulingHooks가 얹는다(npc/runtime.ts 줄 수 상한). 신용 장부는 원장으로 찾는다(붙기 전이면 아무것도 하지 않는다).
import type { SimHooks } from "@terra/sim";
import { creditBookOf } from "./book.ts";

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
 * facilities/attack.ts가 전투를 넣은 뒤 부른다. "같은 나라 유저"를 소속 줄로 읽는다 [임시 — 질문 2476: 가문원끼리·봉신 나라·전쟁 중 내전 등]
 */
export function creditAttackHook(ledger: object) {
  return (attackerOwner: number, targetOwner: number, atMs: number): void => {
    const book = creditBookOf(ledger);
    const mine = book?.standingOf(attackerOwner)?.nationId;
    if (!book || mine === undefined || attackerOwner === targetOwner) return;
    if (book.standingOf(targetOwner)?.nationId === mine)
      book.event(attackerOwner, "same_nation_attack", atMs);
  };
}

/** 정산 유지비 고리(질문 2447 나 — world/settlement.ts onUpkeep → credit/book.ts upkeep) */
export function creditUpkeepHook(ledger: object) {
  return (ownerId: number, unpaid: number, lastPaid: boolean | null, atMs: number): void =>
    creditBookOf(ledger)?.upkeep(ownerId, unpaid, lastPaid, atMs);
}
