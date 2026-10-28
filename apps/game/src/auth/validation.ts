// 입력 검사 — 순수 함수(시험 대상). 보내기 전에 바로 알려 주려는 것이고, 판정은 서버가 다시 한다.
// - 아이디: @terra/shared의 parseLoginId(서버와 같은 함수).
// - 새 비밀번호: 길이·아이디와 같음만 미리 본다. 흔한 비밀번호 목록은 서버만 본다.
//   길이 숫자는 서버와 같은 @terra/shared 값을 쓴다(ADR 2026-10-28-auth-and-accounts).
//   시도 제한 때문에 미리 거른다: 규칙에 걸린 요청도 서버에서는 시도 한 번으로 센다.
import { type LoginIdProblem, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, parseLoginId } from "@terra/shared";
import type { PlainMessageKey } from "../ui/messageRef.ts";
/** 이메일 주소 길이 상한(서버와 같다) */
const EMAIL_MAX_LENGTH = 254;
/** 느슨한 모양 검사(골뱅이 하나, 점 있는 도메인). 정확한 검사는 서버가 한다 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** 칸 이름 → 오류 문구 키. 문제가 없으면 키가 없다 */
export type FieldErrors<F extends string> = Partial<Record<F, PlainMessageKey>>;

export const LOGIN_ID_PROBLEM_KEYS = {
  empty: "auth_id_empty",
  invalid_chars: "auth_id_invalid_chars",
  too_short: "auth_id_too_short",
  too_long: "auth_id_too_long",
} as const satisfies Record<LoginIdProblem, PlainMessageKey>;

export const hasErrors = (errors: FieldErrors<string>): boolean => Object.keys(errors).length > 0;

/** 새 비밀번호 규칙(길이, 아이디와 같음). loginIdKey는 소문자 아이디 키 */
export function newPasswordProblem(password: string, loginIdKey: string): PlainMessageKey | undefined {
  if (password.length < PASSWORD_MIN_LENGTH) return "auth_err_password_too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "auth_err_password_too_long";
  if (password.normalize("NFKC").toLowerCase() === loginIdKey) return "auth_err_password_same_as_id";
  return undefined;
}

/** 비어 있으면 통과(선택 칸), 모양이 틀리면 오류 키 */
function emailProblem(email: string, required: boolean): PlainMessageKey | undefined {
  const trimmed = email.trim();
  if (trimmed === "") return required ? "auth_email_empty" : undefined;
  if (trimmed.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(trimmed)) return "auth_err_invalid_email";
  return undefined;
}

export type LoginCheck =
  | { ok: true; loginId: string }
  | { ok: false; errors: FieldErrors<"id" | "password"> };

/** 로그인 화면. 통과하면 정규화한 아이디(입력한 모양)를 돌려준다 */
export function checkLogin(input: { id: string; password: string }): LoginCheck {
  const errors: FieldErrors<"id" | "password"> = {};
  const id = parseLoginId(input.id);
  if (!id.ok) errors.id = LOGIN_ID_PROBLEM_KEYS[id.problem];
  if (input.password === "") errors.password = "auth_password_empty";
  if (!id.ok || hasErrors(errors)) return { ok: false, errors };
  return { ok: true, loginId: id.display };
}

export interface CreateCheck {
  /** 로그인 화면에서 넣은 비밀번호가 규칙에 걸림 → [다시 입력]으로 돌아가 고쳐야 한다 */
  passwordRule: PlainMessageKey | undefined;
  /** 이 화면의 칸 오류 */
  fields: FieldErrors<"passwordConfirm" | "email">;
}

/** "새 아이디" 확인 화면. password는 로그인 화면에서 넣은 비밀번호다 */
export function checkCreate(input: {
  loginId: string;
  password: string;
  passwordConfirm: string;
  email: string;
}): CreateCheck {
  const fields: FieldErrors<"passwordConfirm" | "email"> = {};
  const id = parseLoginId(input.loginId);
  if (input.passwordConfirm === "") fields.passwordConfirm = "auth_password_empty";
  else if (input.passwordConfirm !== input.password) fields.passwordConfirm = "auth_err_password_mismatch";
  const email = emailProblem(input.email, false);
  if (email) fields.email = email;
  return { passwordRule: newPasswordProblem(input.password, id.ok ? id.key : ""), fields };
}

export type ResetField = "id" | "email" | "newPassword" | "newPasswordConfirm";

/** 비밀번호 찾기 화면 */
export function checkReset(input: {
  id: string;
  email: string;
  newPassword: string;
  newPasswordConfirm: string;
}): FieldErrors<ResetField> {
  const errors: FieldErrors<ResetField> = {};
  const id = parseLoginId(input.id);
  if (!id.ok) errors.id = LOGIN_ID_PROBLEM_KEYS[id.problem];
  const email = emailProblem(input.email, true);
  if (email) errors.email = email;
  const rule = newPasswordProblem(input.newPassword, id.ok ? id.key : "");
  if (rule) errors.newPassword = rule;
  if (input.newPasswordConfirm === "") errors.newPasswordConfirm = "auth_password_empty";
  else if (input.newPasswordConfirm !== input.newPassword)
    errors.newPasswordConfirm = "auth_err_password_mismatch";
  return errors;
}
