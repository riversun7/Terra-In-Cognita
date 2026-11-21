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
