// 효과 사전 탭·소모품 효과량·장비 전투 칸 문구 표(아이템 편집기 WP-5·WP-6) — 수치·상태이상·값 방식 이름, 효과량 문장.
// oxlint: 메시지 이름을 계산해 읽지 않는다(표로 적는다). 이 조각에만 든다.
import {
  EFFECT_PRIMARY_STAT_IDS,
  type EffectStatusId,
  ITEM_PRIMARY_CODES,
  type UseAmount,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { PRIMARY_TEXT } from "./itemMessages.ts";

type Text = () => string;

const COMBAT_STAT_TEXT: Readonly<Record<string, Text>> = {
  attack: m.dev_items_fx_stat_attack,
  defense_rate: m.dev_items_fx_stat_defense_rate,
  evade: m.dev_items_fx_stat_evade,
  penetration: m.dev_items_fx_stat_penetration,
  crit_multiplier: m.dev_items_fx_stat_crit_multiplier,
  move_speed: m.dev_items_fx_stat_move_speed,
  shield_regen: m.dev_items_fx_stat_shield_regen,
};

/** 1차 스탯 버프인가(전투 판정이 아직 읽지 않는다) */
export const isPrimaryEffectStat = (stat: string): boolean =>
  (EFFECT_PRIMARY_STAT_IDS as readonly string[]).includes(stat);

/** 효과 수치 이름(전투 수치 또는 1차 스탯) */
export function effectStatText(stat: string): string {
  const primary = ITEM_PRIMARY_CODES.find((code) => code === stat);
  if (primary) return PRIMARY_TEXT[primary]();
  return COMBAT_STAT_TEXT[stat]?.() ?? stat;
}

const STATUS_TEXT: Readonly<Record<EffectStatusId, Text>> = {
  stun: m.dev_items_fx_status_stun,
  root: m.dev_items_fx_status_root,
  silence: m.dev_items_fx_status_silence,
};

export function effectStatusText(status: EffectStatusId): string {
  return STATUS_TEXT[status]();
}

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
