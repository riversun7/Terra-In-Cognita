// 보유 물건 화면 문구 — 결과 코드 → 문구, 칸·쿨 종류 이름, 물건·효과 이름, 지속·효과량 글자.
// 키로 고르는 문구는 정적 표에 둔다(m[키]는 oxlint가 막는다). 종류가 늘면 satisfies가 빠진 값을 알려 준다.
// 모르는 칸 종류·아이템(더 새 서버·팩)은 ID를 그대로 보인다.
import { EQUIP_SLOTS, type EquipSlot } from "@terra/shared/roster";
import type { HoldingView, UnitEffectView } from "@terra/shared/holdings";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatMilli, formatNumber, localName, slotCellLabel } from "../roster/rosterText.ts";
import { formatWait } from "../ui/messageRef.ts";
import type { ItemFailureCode } from "./itemCommands.ts";
import { formatClock } from "./holdingsModel.ts";

/** 변수가 없는 실패 문구(쿨은 다시 쓸 시각이 붙어 따로) */
const FAILURES = {
  sign_in_required: () => m.holdings_error_sign_in_required(),
  busy: () => m.holdings_error_busy(),
  rate_limited: () => m.holdings_error_rate_limited(),
  internal_error: () => m.holdings_error_internal_error(),
  forbidden: () => m.holdings_error_forbidden(),
  no_owner: () => m.holdings_error_no_owner(),
  unknown_holding: () => m.holdings_error_unknown_holding(),
  unknown_unit: () => m.holdings_error_unknown_unit(),
  unknown_item: () => m.holdings_error_unknown_item(),
  not_holdable: () => m.holdings_error_not_holdable(),
  not_carried: () => m.holdings_error_not_carried(),
  wrong_slot: () => m.holdings_error_wrong_slot(),
  broken: () => m.holdings_error_broken(),
  not_usable: () => m.holdings_error_not_usable(),
  battle_only: () => m.holdings_error_battle_only(),
  not_better: () => m.holdings_error_not_better(),
  confirm_replace: () => m.holdings_error_confirm_replace(),
  not_packed: () => m.holdings_error_not_packed(),
  offline: () => m.holdings_error_offline(),
  timeout: () => m.holdings_error_timeout(),
} satisfies Record<Exclude<ItemFailureCode, "cooldown">, () => string>;

/** 실패 코드 → 문구. 쿨이면 다시 쓸 때까지 남은 시간(서버 시각 기준) */
export function failureText(code: ItemFailureCode, readyAt: number | undefined, now: number): string {
  if (code === "cooldown")
    return m.holdings_error_cooldown({ time: formatClock(readyAt === undefined ? 0 : readyAt - now) });
  return FAILURES[code]();
}

/** 실패 뒤 목록을 다시 받아야 하는가(서버 상태를 모름·물건이 바뀜) */
export const failureNeedsReload = (code: ItemFailureCode): boolean =>
  code === "offline" ||
  code === "timeout" ||
  code === "unknown_holding" ||
  code === "not_carried" ||
  code === "not_packed";

const isEquipSlot = (value: string): value is EquipSlot => (EQUIP_SLOTS as readonly string[]).includes(value);

/** 칸 이름(모르는 종류면 ID). ordinal > 0이면 같은 종류 안 번호를 붙인다("반지 1"·"임플란트 3") */
export const slotKindLabel = (kind: string, ordinal = 0): string =>
  isEquipSlot(kind) ? slotCellLabel(kind, ordinal) : kind;

const COOLDOWN_LABELS = {
  potion: () => m.holdings_cooldown_potion(),
  food: () => m.holdings_cooldown_food(),
} satisfies Record<"potion" | "food", () => string>;

/** 쿨 종류 이름(모르는 종류면 그대로) */
export const cooldownLabel = (kind: string): string =>
  kind === "potion" || kind === "food" ? COOLDOWN_LABELS[kind]() : kind;

/** 물건 이름(팩에서 사라진 아이템이면 ID) */
export const holdingName = (holding: HoldingView): string =>
  localName(holding.name ?? undefined, holding.item);

/** 걸린 효과 이름 */
export const effectName = (effect: UnitEffectView): string =>
  localName(effect.name ?? undefined, effect.effect);

/** 효과량 글자: ‰ 값이면 %(소수 한 자리까지), 아니면 수. 양수는 +를 붙인다 */
export function effectValueText(effect: UnitEffectView): string {
  const sign = effect.value > 0 ? "+" : "";
  if (effect.valueMode === "permille")
    return m.holdings_effect_permille({ value: `${sign}${formatMilli(effect.value * 100)}` });
  return `${sign}${formatNumber(effect.value)}`;
}

/** 쓰는 효과 줄 글자("집중(10분)" — 지속 0이면 이름만) */
export function usesText(holding: HoldingView): string | null {
  const uses = holding.uses ?? [];
  if (uses.length === 0) return null;
  const locale = getLocale();
  return m.holdings_uses({
    effects: uses
      .map((line) => {
        const name = localName(line.name ?? undefined, line.effect);
        // 지속 0(회복처럼 한 번, 버프면 전투 내내)은 이름만 — 전투 밖에서 쓸 수 있는지는 서버가 정한다(battle_only)
        return line.durationMs > 0
          ? m.holdings_use_line({ name, duration: formatWait(line.durationMs / 1000, locale) })
          : name;
      })
      .join(" · "),
  });
}

/** 같은 언어 이름 차례 비교 */
export function nameCompare(): (a: string, b: string) => number {
  const collator = new Intl.Collator(getLocale());
  return (a, b) => collator.compare(a, b);
}
