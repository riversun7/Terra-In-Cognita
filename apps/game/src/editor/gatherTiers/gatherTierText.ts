// 1차 생산 티어 확률 화면 문구 표 — 티어 이름·프리셋·오류(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다). 이 조각에만 든다.
// 건물 편집기 문구 표(editor/buildings/buildingMessages.ts)는 가져오지 않는다(조각을 섞지 않게) — 오류 문구는 같은 메시지를 쓴다.
import type { BuildingEditorReason } from "@terra/shared/buildingEditor";
import { m } from "../../paraglide/messages.js";
import type { ContentErrorInfo } from "../content/contentEditorModel.ts";
import type { BulkPreset, RowPreset } from "./gatherTierModel.ts";

type Text = () => string;

/** 티어 이름(T0 기초 ~ T9 신성, 옛 화면 이름) */
export const TIER_TEXT: readonly Text[] = [
  m.dev_gather_tier_0,
  m.dev_gather_tier_1,
  m.dev_gather_tier_2,
  m.dev_gather_tier_3,
  m.dev_gather_tier_4,
  m.dev_gather_tier_5,
  m.dev_gather_tier_6,
  m.dev_gather_tier_7,
  m.dev_gather_tier_8,
  m.dev_gather_tier_9,
];

export const ROW_PRESET_TEXT: Readonly<Record<RowPreset, Text>> = {
  low: m.dev_gather_preset_low,
  even: m.dev_gather_preset_even,
  mid: m.dev_gather_preset_mid,
  high: m.dev_gather_preset_high,
};

export const BULK_PRESET_TEXT: Readonly<Record<BulkPreset, Text>> = {
  monotonic: m.dev_gather_preset_monotonic,
  t3peak: m.dev_gather_preset_t3peak,
  low: m.dev_gather_preset_low,
  even: m.dev_gather_preset_even,
  high: m.dev_gather_preset_high,
  pack: m.dev_gather_preset_pack,
};

const ERROR_TEXT: Readonly<Record<ContentErrorInfo<BuildingEditorReason>["key"], Text>> = {
  invalid_entry: m.dev_buildings_error_invalid_entry,
  unknown_entry: m.dev_buildings_error_unknown_entry,
  duplicate_entry: m.dev_buildings_error_duplicate_entry,
  invalid_note: m.dev_buildings_error_invalid_note,
  entry_changed: m.dev_gather_error_entry_changed,
  entry_too_large: m.dev_buildings_error_entry_too_large,
  revision_conflict: m.dev_buildings_error_revision_conflict,
  rate_limited: m.dev_buildings_error_rate_limited,
  unauthorized: m.dev_buildings_error_unauthorized,
  forbidden: m.dev_buildings_error_forbidden,
  unavailable: m.dev_buildings_error_unavailable,
  network: m.dev_buildings_error_network,
  unknown: m.dev_buildings_error_unknown,
};

export const gatherErrorText = (key: ContentErrorInfo<BuildingEditorReason>["key"]): string =>
  ERROR_TEXT[key]();
