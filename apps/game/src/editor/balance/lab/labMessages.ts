// 전투 실험실 문구 표 — 속성·장비 칸·진형·오류 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 이 조각(BalancePanelScreen)에만 든다. 팩 이름(유닛 종류·장비·스킬·2차 행)은 서버 목록의 {ko, en}을 쓴다.
import type { LabCatalogResponse, LabRow, LabTeam, LabUnit } from "@terra/shared/battleLab";
import type { LocalizedName } from "@terra/shared/roster";
import { m } from "../../../paraglide/messages.js";
import type { LabErrorKey } from "./labModel.ts";

/** 속성 12칸(ELEMENT_CODES 차례) */
export const ELEMENT_TEXT: readonly (() => string)[] = [
  m.cyborg_element_water,
  m.cyborg_element_frost,
  m.cyborg_element_fire,
  m.cyborg_element_blaze,
  m.cyborg_element_wind,
  m.cyborg_element_lightning,
  m.cyborg_element_earth,
  m.cyborg_element_crystal,
  m.cyborg_element_light,
  m.cyborg_element_holy,
  m.cyborg_element_dark,
  m.cyborg_element_necro,
];

const SLOT_TEXT: Readonly<Record<string, () => string>> = {
  weapon: m.roster_slot_weapon,
  offhand: m.roster_slot_offhand,
  head: m.roster_slot_head,
  body: m.roster_slot_body,
  accessory: m.roster_slot_accessory,
  organ: m.roster_slot_organ,
  part: m.roster_slot_part,
  saddle: m.roster_slot_saddle,
};

export const slotText = (slot: string): string => SLOT_TEXT[slot]?.() ?? slot;

const ROW_TEXT: Readonly<Record<LabRow, () => string>> = {
  front: m.dev_lab_row_front,
  middle: m.dev_lab_row_middle,
  back: m.dev_lab_row_back,
};

export const rowText = (row: LabRow): string => ROW_TEXT[row]();

const TEAM_TEXT: Readonly<Record<LabTeam, () => string>> = { a: m.dev_lab_team_a, b: m.dev_lab_team_b };
export const teamText = (team: LabTeam): string => TEAM_TEXT[team]();

/** 사건·표의 유닛 짧은 이름: A1·B3 */
export function unitShort(key: string): string {
  const team = key.charAt(0).toUpperCase();
  const index = Number(key.slice(1));
  if (!Number.isInteger(index)) return `${team}?`;
  // 군단 2번 파티부터(자리 6~)는 A2·3(파티·자리 — 보고서 줄 이름과 같다)
  return index < PARTY_SLOTS
    ? `${team}${index + 1}`
    : `${team}${Math.floor(index / PARTY_SLOTS) + 1}·${(index % PARTY_SLOTS) + 1}`;
}
/** 파티 한 칸 수(LAB_LIMITS.partyMax와 같다) */
const PARTY_SLOTS = 6;

const ERROR_TEXT: Readonly<Record<LabErrorKey, () => string>> = {
  invalid_unit: m.dev_lab_err_invalid_unit,
  invalid_settings: m.dev_lab_err_invalid_settings,
  unknown_terrain: m.dev_lab_err_unknown_terrain,
  busy: m.dev_balance_err_busy,
  rate_limited: m.dev_balance_err_rate_limited,
  timeout: m.dev_balance_err_timeout,
  failed: m.dev_balance_err_failed,
  invalid_preset: m.dev_lab_err_invalid_preset,
  unknown_preset: m.dev_lab_err_unknown_preset,
  preset_conflict: m.dev_lab_err_preset_conflict,
  too_many_presets: m.dev_lab_err_too_many_presets,
  sample_read_only: m.dev_lab_err_sample_read_only,
  replay_unavailable: m.dev_lab_watch_pending,
  forbidden: m.dev_balance_err_forbidden,
  unauthorized: m.auth_notice_session_ended,
  unavailable: m.dev_balance_err_unavailable,
  invalid_input: m.dev_lab_err_invalid_input,
  network: m.err_network,
  unknown: m.err_unknown,
};

export const labErrorText = (key: LabErrorKey): string => ERROR_TEXT[key]();

/** 팩 이름 → 지금 언어 */
export const localized = (name: LocalizedName | undefined, locale: string, fallback: string): string =>
  name ? (locale === "en" ? name.en : name.ko) : fallback;

/** 유닛 제목: 표시 이름(없으면 종류 이름) · Lv */
export function unitTitle(unit: LabUnit, catalog: LabCatalogResponse | null, locale: string): string {
  const kind = catalog?.unitKinds.find((entry) => entry.id === unit.kind);
  const name = unit.label.trim() !== "" ? unit.label : localized(kind?.name, locale, unit.kind);
  return m.dev_lab_unit_title({ name, level: unit.level });
}

/** 장비·무기·스킬·2차 행 이름 */
export function itemName(catalog: LabCatalogResponse | null, id: string, locale: string): string {
  return localized(catalog?.equipment.find((entry) => entry.id === id)?.name, locale, id);
}
export function skillName(catalog: LabCatalogResponse | null, id: string, locale: string): string {
  return localized(catalog?.skills.find((entry) => entry.id === id)?.name, locale, id);
}
export function statName(catalog: LabCatalogResponse | null, id: string, locale: string): string {
  return localized(catalog?.statRows.find((entry) => entry.id === id)?.name, locale, id);
}
