// 세력 정체성 화면 문구 표 — 문제 코드·거절 까닭·마크 틀·나눔·상징 → 메시지(oxlint: 메시지 이름을 계산해 읽지 않는다, 표로 적는다).
// 마크 틀·나눔·상징 이름은 시작 국가 설정 편집기와 같은 메시지(dev_nations_shape_* 등)를 쓴다(같은 목록의 같은 이름).
import type { HouseResultCode } from "@terra/protocol";
import {
  FACTION_EMBLEM_UPLOAD,
  FACTION_IDENTITY_REASONS,
  FACTION_SHORT_DEFAULT_RANGE,
  type FactionReportStatus,
  type FactionShortRange,
  type FactionIdentityReason,
  type FactionNameProblem,
  type FactionShortProblem,
} from "@terra/shared/factionIdentity";
import type { EmblemCharge, EmblemDivision, EmblemShape } from "@terra/shared/nationEmblem";
import { field } from "../../net/json.ts";
import { m } from "../../paraglide/messages.js";

type Text = () => string;

const NAME_PROBLEMS: Readonly<Record<FactionNameProblem | "taken", Text>> = {
  empty: m.fid_name_empty,
  invalid_chars: m.fid_name_invalid_chars,
  needs_letter: m.fid_name_needs_letter,
  too_short: m.fid_name_too_short,
  too_long: m.fid_name_too_long,
  reserved: m.fid_name_reserved,
  real_place: m.fid_name_real_place,
  taken: m.fid_name_taken,
};
export const nameProblemText = (code: FactionNameProblem | "taken"): string => NAME_PROBLEMS[code]();
export const isNameProblem = (code: string): code is FactionNameProblem | "taken" =>
  Object.hasOwn(NAME_PROBLEMS, code);

type RangeText = (range: FactionShortRange) => string;
const SHORT_PROBLEMS: Readonly<Record<FactionShortProblem | "taken", RangeText>> = {
  empty: () => m.fid_short_empty(),
  invalid: () => m.fid_short_invalid(),
  too_short: (range) => m.fid_short_too_short({ min: range.min }),
  too_long: (range) => m.fid_short_too_long({ max: range.max }),
  needs_letter: () => m.fid_name_needs_letter(),
  reserved: () => m.fid_short_reserved(),
  taken: () => m.fid_short_taken(),
};
/** 약어 문제 → 문장. 길이 문제는 새로 정하는 약어 폭(설정 칸 S20, 서버가 mine.shortRange로 준다)을 넣는다 */
export const shortProblemText = (
  code: FactionShortProblem | "taken",
  range: FactionShortRange = FACTION_SHORT_DEFAULT_RANGE,
): string => SHORT_PROBLEMS[code](range);
export const isShortProblem = (code: string): code is FactionShortProblem | "taken" =>
  Object.hasOwn(SHORT_PROBLEMS, code);

const tooLarge: Text = () => m.fid_crop_too_large({ kb: Math.floor(FACTION_EMBLEM_UPLOAD.maxBytes / 1000) });

/** 서버가 받지 않은 까닭 → 문장(이름·약어 문제는 details의 문제 코드가 더 자세하다 — 부르는 쪽이 먼저 본다) */
const REASONS: Readonly<Record<FactionIdentityReason, Text>> = {
  name_invalid: m.fid_name_invalid_chars,
  name_taken: m.fid_name_taken,
  short_invalid: m.fid_short_invalid,
  short_taken: m.fid_short_taken,
  color_invalid: m.fid_error_color,
  emblem_invalid: m.fid_error_emblem_spec,
  rename_wait: m.fid_error_rename_wait,
  rename_blocked: m.fid_error_rename_blocked,
  upload_off: m.fid_upload_off,
  upload_blocked: m.fid_upload_blocked,
  emblem_not_png: m.fid_error_emblem,
  emblem_wrong_size: m.fid_error_emblem,
  emblem_too_large: tooLarge,
  emblem_bad_chunk: m.fid_error_emblem,
  emblem_bad_data: m.fid_error_emblem,
  no_upload: m.fid_error_emblem,
  rate_limited: m.fid_error_rate_limited,
};
export const reasonText = (reason: FactionIdentityReason): string => REASONS[reason]();

/** 가문 창설 결과 코드(WebSocket house_result) → 문장 */
export const HOUSE_RESULT_TEXT: Readonly<Record<HouseResultCode | "offline" | "timeout", Text>> = {
  sign_in_required: m.fid_found_sign_in,
  busy: m.fid_found_busy,
  rate_limited: m.fid_error_rate_limited,
  internal_error: m.fid_found_failed,
  no_cyborg: m.fid_found_no_cyborg,
  no_identity: m.fid_found_failed,
  already_founded: m.fid_found_already,
  terms_changed: m.fid_found_terms_changed,
  insufficient_funds: m.fid_found_insufficient,
  short_taken: m.fid_short_taken,
  unknown_city: m.fid_home_error_unknown_city,
  offline: m.fid_found_offline,
  timeout: m.fid_found_offline,
};

/** 신고 결과 → 문장 */
export const REPORT_TEXT: Readonly<Record<FactionReportStatus, Text>> = {
  reported: m.map_peek_report_done,
  already: m.map_peek_report_already,
  limit: m.map_peek_report_limit,
  own: m.map_peek_report_own,
  unknown: m.map_peek_report_unknown,
};
export const tooLargeText = tooLarge;

/** tRPC 오류 → 거절 까닭과 더 나눈 문제 코드(없으면 null·빈 목록) */
export function rejectionOf(error: unknown): {
  readonly reason: FactionIdentityReason | null;
  readonly details: readonly string[];
} {
  const data = field(error, "data");
  const raw = field(data, "reason");
  const reason = FACTION_IDENTITY_REASONS.find((known) => known === raw) ?? null;
  const list = field(data, "details");
  const details = Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  return { reason, details };
}

export const SHAPE_TEXT: Readonly<Record<EmblemShape, Text>> = {
  shield: m.dev_nations_shape_shield,
  circle: m.dev_nations_shape_circle,
  diamond: m.dev_nations_shape_diamond,
  banner: m.dev_nations_shape_banner,
  hexagon: m.dev_nations_shape_hexagon,
  square: m.dev_nations_shape_square,
};

export const DIVISION_TEXT: Readonly<Record<EmblemDivision, Text>> = {
  plain: m.dev_nations_division_plain,
  pale: m.dev_nations_division_pale,
  fess: m.dev_nations_division_fess,
  bend: m.dev_nations_division_bend,
  quarterly: m.dev_nations_division_quarterly,
  chevron: m.dev_nations_division_chevron,
  chief: m.dev_nations_division_chief,
  border: m.dev_nations_division_border,
};

export const CHARGE_TEXT: Readonly<Record<EmblemCharge, Text>> = {
  star: m.dev_nations_charge_star,
  sun: m.dev_nations_charge_sun,
  moon: m.dev_nations_charge_moon,
  tree: m.dev_nations_charge_tree,
  mountain: m.dev_nations_charge_mountain,
  wave: m.dev_nations_charge_wave,
  tower: m.dev_nations_charge_tower,
  gear: m.dev_nations_charge_gear,
  wheat: m.dev_nations_charge_wheat,
  anchor: m.dev_nations_charge_anchor,
  flame: m.dev_nations_charge_flame,
  bird: m.dev_nations_charge_bird,
  sword: m.dev_nations_charge_sword,
  crown: m.dev_nations_charge_crown,
  hammer: m.dev_nations_charge_hammer,
  leaf: m.dev_nations_charge_leaf,
};
