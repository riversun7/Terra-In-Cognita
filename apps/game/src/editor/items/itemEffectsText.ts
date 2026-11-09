// 소모품 효과량 문구(아이템 편집기 WP-6) — 미리 보기 효과량 한 줄. 효과 사전의 수치·상태이상 이름은 효과 사전 화면
// (editor/effects/effectDictionaryText.ts, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)")으로 옮겼다.
// oxlint: 메시지 이름을 계산해 읽지 않는다(표로 적는다). 이 조각에만 든다.
import type { UseAmount } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { PRIMARY_TEXT } from "./itemMessages.ts";

/**
 * 효과량 범위 한 줄(D-496 286, D-501): "VIT 10 ÷ 적정 10 → 1000‰(상한 2000‰) → 30 (±500‰ → 15~45)" 또는 비례 스탯이 없으면
 * "30 (±500‰ → 15~45)"
 */
export function amountText(amount: UseAmount): string {
  const range = { variance: amount.variancePm, min: amount.min, max: amount.max, scaled: amount.scaled };
  return amount.stat === null || amount.appropriate === null
    ? m.dev_items_preview_amount_plain(range)
    : m.dev_items_preview_amount({
        ...range,
        stat: PRIMARY_TEXT[amount.stat](),
        value: amount.statValue,
        appropriate: amount.appropriate,
        ratio: amount.ratioPm,
        cap: amount.capPm,
      });
}
