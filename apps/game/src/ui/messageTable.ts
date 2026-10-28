// 키로 찾아 쓰는 화면 문구 표 — 순수 코드(시험 대상)가 돌려준 메시지 키를 문장으로 바꿀 때 쓴다(text.ts).
// 여기 적은 메시지만 키로 찾을 수 있다. 나머지 문구는 화면 코드가 m.<키>()로 직접 부른다.
// 정적으로 적어 두므로 Paraglide의 안 쓰는 메시지 빼기(나무 흔들기)가 그대로 된다.
import { m } from "../paraglide/messages.js";

/** 변수가 없는 문구: 오류·입력 검사·안내 */
export const PLAIN_MESSAGES = {
  err_network: m.err_network,
  err_server: m.err_server,
  err_unknown: m.err_unknown,
  auth_id_empty: m.auth_id_empty,
  auth_id_invalid_chars: m.auth_id_invalid_chars,
  auth_id_too_short: m.auth_id_too_short,
  auth_id_too_long: m.auth_id_too_long,
  auth_password_empty: m.auth_password_empty,
  auth_email_empty: m.auth_email_empty,
  auth_err_invalid_request: m.auth_err_invalid_request,
  auth_err_forbidden_origin: m.auth_err_forbidden_origin,
  auth_err_invalid_id: m.auth_err_invalid_id,
  auth_err_invalid_password: m.auth_err_invalid_password,
  auth_err_banned: m.auth_err_banned,
  auth_err_id_taken: m.auth_err_id_taken,
  auth_err_signup_closed: m.auth_err_signup_closed,
  auth_err_password_mismatch: m.auth_err_password_mismatch,
  auth_err_password_too_short: m.auth_err_password_too_short,
  auth_err_password_too_long: m.auth_err_password_too_long,
  auth_err_password_same_as_id: m.auth_err_password_same_as_id,
  auth_err_password_too_common: m.auth_err_password_too_common,
  auth_err_invalid_email: m.auth_err_invalid_email,
  auth_err_reset_failed: m.auth_err_reset_failed,
  auth_err_session_missing: m.auth_err_session_missing,
  auth_notice_signed_out: m.auth_notice_signed_out,
  auth_notice_session_ended: m.auth_notice_session_ended,
  auth_notice_password_reset: m.auth_notice_password_reset,
} satisfies Record<string, () => string>;

/** 기다릴 시간({wait})을 넣는 문구 — 시도 제한(429) */
export const WAIT_MESSAGES = {
  auth_err_too_many: m.auth_err_too_many,
  auth_err_signup_limit: m.auth_err_signup_limit,
} satisfies Record<string, (inputs: { wait: string }) => string>;
