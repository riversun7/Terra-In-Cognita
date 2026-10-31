// 첫 접속 화면 문구 표 — 서버 코드·목록 ID → 메시지 키(ko·en). 키로 고르는 문구는 표에 적는다(oxlint import(namespace)).
// 모르는 ID(더 새 서버)는 표 밖이라 일반 문구나 ID로 보인다.
import type { CrowdingBand, CyborgColorId, CyborgLookSlot, CyborgNameProblem } from "@terra/shared/cyborg";
import type { CyborgResultCode } from "@terra/protocol";
import { m } from "../paraglide/messages.js";

type Text = () => string;

const NAME_PROBLEMS = {
  empty: m.start_name_empty,
  invalid_chars: m.start_name_invalid_chars,
  needs_letter: m.start_name_needs_letter,
  too_short: m.start_name_too_short,
  too_long: m.start_name_too_long,
  reserved: m.start_name_reserved,
  taken: m.start_name_taken,
} satisfies Record<CyborgNameProblem | "taken", Text>;

export const nameProblemText = (code: CyborgNameProblem | "taken"): string => NAME_PROBLEMS[code]();

const TEMPERAMENTS: Readonly<Record<string, Text>> = {
  balanced: m.start_temperament_balanced,
  combat: m.start_temperament_combat,
  tech: m.start_temperament_tech,
  trade: m.start_temperament_trade,
};

export const temperamentText = (id: string): string => TEMPERAMENTS[id]?.() ?? id;

const PRESETS: Readonly<Record<string, Text>> = {
  scout: m.start_preset_scout,
  guard: m.start_preset_guard,
  tinker: m.start_preset_tinker,
  drifter: m.start_preset_drifter,
};

export const presetText = (id: string): string => PRESETS[id]?.() ?? id;

const SLOTS = {
  head: m.start_looks_slot_head,
  face: m.start_looks_slot_face,
  body: m.start_looks_slot_body,
  limbs: m.start_looks_slot_limbs,
} satisfies Record<CyborgLookSlot, Text>;

export const slotText = (slot: CyborgLookSlot): string => SLOTS[slot]();

const COLORS = {
  mint: m.start_color_mint,
  peach: m.start_color_peach,
  sky: m.start_color_sky,
  lilac: m.start_color_lilac,
  lemon: m.start_color_lemon,
  coral: m.start_color_coral,
  slate: m.start_color_slate,
  cream: m.start_color_cream,
} satisfies Record<CyborgColorId, Text>;

export const colorText = (id: CyborgColorId): string => COLORS[id]();

const CROWDING = {
  quiet: m.start_crowding_quiet,
  normal: m.start_crowding_normal,
  busy: m.start_crowding_busy,
} satisfies Record<CrowdingBand, Text>;

export const crowdingText = (band: CrowdingBand): string => CROWDING[band]();

/** 명령 실패 → 문구. 이름 문제는 이름 단계로 돌아가 그 칸에 보인다(화면이 고른다) */
const COMMAND_ERRORS = {
  sign_in_required: m.auth_notice_session_ended,
  busy: m.start_error_busy,
  rate_limited: m.start_error_rate_limited,
  already_created: m.start_error_already,
  roll_required: m.start_error_roll_required,
  rolls_exhausted: m.start_stats_exhausted,
  unknown_temperament: m.start_error_retry,
  name_invalid: m.start_name_invalid_chars,
  name_reserved: m.start_name_reserved,
  name_taken: m.start_name_taken,
  appearance_invalid: m.start_error_appearance,
  unknown_faction: m.start_error_place,
  unknown_city: m.start_error_place,
  no_room: m.start_error_no_room,
  internal_error: m.start_error_retry,
  offline: m.start_error_offline,
  timeout: m.start_error_retry,
} satisfies Record<CyborgResultCode | "offline" | "timeout", Text>;

export const commandErrorText = (code: CyborgResultCode | "offline" | "timeout"): string =>
  COMMAND_ERRORS[code]();
