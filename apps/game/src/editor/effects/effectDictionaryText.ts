// 효과 사전 화면 문구 표(/dev/effects, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)") — 전투 수치·1차 스탯·상태이상·출처 이름,
// 지속 글, 서버 거절 문구. 아이템 편집기 [효과 사전] 탭(WP-6)에서 옮겼다. 서버 묻기는 아이템 편집기와 같은 items.*라 거절·출처·검사 문구는
// dev_items_* 키를 그대로 쓴다(같은 뜻). oxlint: 메시지 이름을 계산해 읽지 않는다(표로 적는다).
// 아이템 편집기 조각과 모듈을 같이 쓰지 않는다(같이 쓰면 따로 조각이 되어 이름이 미리 캐시 규칙에 걸린다는 보장이 없다, scripts/pwa-build.mjs).
import type { ContentEditOrigin } from "@terra/shared/contentEdit";
import {
  EFFECT_PRIMARY_STAT_IDS,
  type EffectStatusId,
  ITEM_EDITOR_REASONS,
  ITEM_PRIMARY_CODES,
  type ItemEditorReason,
  type ItemPrimaryCode,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import type { ContentErrorInfo } from "../content/contentEditorModel.ts";

type Text = () => string;

export const EFFECT_REASONS = ITEM_EDITOR_REASONS;

const COMBAT_STAT_TEXT: Readonly<Record<string, Text>> = {
  attack: m.dev_effects_stat_attack,
  defense_rate: m.dev_effects_stat_defense_rate,
  evade: m.dev_effects_stat_evade,
  penetration: m.dev_effects_stat_penetration,
  crit_multiplier: m.dev_effects_stat_crit_multiplier,
  move_speed: m.dev_effects_stat_move_speed,
  shield_regen: m.dev_effects_stat_shield_regen,
};

/** 1차 스탯 약자(로스터와 같은 글) */
export const PRIMARY_STAT_TEXT: Readonly<Record<ItemPrimaryCode, Text>> = {
  str: m.roster_stat_str_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
};

/** 1차 스탯 버프인가(전투 판정이 아직 읽지 않는다) */
export const isPrimaryEffectStat = (stat: string): boolean =>
  (EFFECT_PRIMARY_STAT_IDS as readonly string[]).includes(stat);

/** 효과 수치 이름(전투 수치 또는 1차 스탯) */
export function effectStatText(stat: string): string {
  const primary = ITEM_PRIMARY_CODES.find((code) => code === stat);
  if (primary) return PRIMARY_STAT_TEXT[primary]();
  return COMBAT_STAT_TEXT[stat]?.() ?? stat;
}

const STATUS_TEXT: Readonly<Record<EffectStatusId, Text>> = {
  stun: m.dev_effects_status_stun,
  root: m.dev_effects_status_root,
  silence: m.dev_effects_status_silence,
};

export function effectStatusText(status: EffectStatusId): string {
  return STATUS_TEXT[status]();
}

export const ORIGIN_TEXT: Readonly<Record<ContentEditOrigin, Text>> = {
  pack: m.dev_items_origin_pack,
  edited: m.dev_items_origin_edited,
  created: m.dev_items_origin_created,
};

/** 지속 글: 0 = 전투 내내, 아니면 초(소수 셋째 자리까지, 끝 0은 뺀다) */
export function durationText(ms: number): string {
  if (ms === 0) return m.dev_effects_duration_battle();
  return m.dev_effects_duration_seconds({ seconds: (ms / 1000).toFixed(3).replace(/\.?0+$/, "") });
}

type ErrorKey = ContentErrorInfo<ItemEditorReason>["key"];
const ERROR_TEXT: Readonly<Record<ErrorKey, Text>> = {
  invalid_entry: m.dev_items_err_invalid_entry,
  unknown_entry: m.dev_items_err_unknown_entry,
  retired_id: m.dev_items_err_retired_id,
  duplicate_entry: m.dev_items_err_duplicate_entry,
  invalid_note: m.dev_items_err_invalid_note,
  entry_changed: m.dev_items_err_entry_changed,
  category_locked: m.dev_items_err_category_locked,
  entry_too_large: m.dev_items_err_entry_too_large,
  created_limit: m.dev_items_err_created_limit,
  revision_conflict: m.dev_items_err_revision_conflict,
  rate_limited: m.dev_items_err_rate_limited,
  unauthorized: m.dev_items_err_unauthorized,
  forbidden: m.dev_items_err_forbidden,
  unavailable: m.dev_effects_err_unavailable,
  network: m.dev_items_err_network,
  unknown: m.dev_items_err_unknown,
};

export function errorText(key: ErrorKey): string {
  return ERROR_TEXT[key]();
}
