// 쿠데타 중 맞선 편끼리의 공격에는 같은 나라 공격 신용 벌점이 없다 — 사용자 결정 D-592(2026-11-22, 질문 2581 (4) "쿠데타 중"): 쿠데타 중 같은 나라 공격은 신용 벌점 없이
// 쿠데타 가담 벌점(credit_coup_join)만 걸린다. docs/adr/2026-11-21-credit.md "바뀜 (fixes-d592, D-592)".
// - 쿠데타 전투 자체(반란 전투 틀 빨리감기 — governance/portCoup.ts coupBattle)는 신용 고리를 지나지 않는다(원래 벌점 없음).
// - 참가 받는 동안(쿠데타가 열린 동안) 맞선 편끼리(혁명군 ↔ 정부군) 일부러 치기·건물 공격을 하면 hooks.ts가 이 고리로 벌점을 건너뛴다. 편 = governance/coupTruce.ts가 의결 틱마다
//   만든다(쿠데타 참가 줄·일으킨 사람·일으킨 가문 / 지배 가문의 가문원). 같은 편끼리·쿠데타와 상관없는 같은 나라 사람 공격은 그대로 벌점 [임시 — 질문 2682].
// 원장마다 하나(WeakMap — 신용 장부와 같은 자리).

/** 치는 주인 · 대상 주인 → 열린 쿠데타에서 맞선 편인가 */
export type CoupTruce = (attackerOwner: number, targetOwner: number) => boolean;

const truces = new WeakMap<object, CoupTruce>();

/** 원장에 붙은 쿠데타 편 고리(없으면 undefined — 의결이 아직 붙지 않았다) */
export const coupTruceOf = (ledger: object): CoupTruce | undefined => truces.get(ledger);

/** 원장에 쿠데타 편 고리를 붙인다(의결 틱마다 바꾼다) */
export function setCoupTruce(ledger: object, truce: CoupTruce): void {
  truces.set(ledger, truce);
}
