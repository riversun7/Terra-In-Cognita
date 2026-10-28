// 계정 HTTP API 약속 — 서버(apps/server/src/auth/account.ts)와 기기(로그인 화면)가 같은 경로·형식·오류 코드를 쓴다.
// 들어가기·비밀번호 찾기는 일반 POST(JSON, 같은 출처만), 내 정보·관리자 기능은 tRPC(account.me, admin.users.*).
// 화면 문구는 오류 코드를 메시지 키로 바꿔 만든다(ko·en 함께). 서버 메시지를 그대로 보여 주지 않는다.
import type { Role } from "./roles.ts";

export const ACCOUNT_API_PATHS = {
  /** 아이디·비밀번호로 들어가기. 없는 아이디면 확인 뒤 계정을 만든다 */
  enter: "/api/account/enter",
  /** 아이디 + 복구 이메일이 맞으면 새 비밀번호로 바꾼다(확인 메일 없음) */
  resetPassword: "/api/account/reset-password",
} as const;

/** Better Auth 경로 중 여는 것(허용 목록). 나머지 /api/auth/*는 404 */
export const AUTH_SESSION_PATHS = {
  /** GET: 세션 확인·연장(쿠키를 새로 줄 수 있다) */
  getSession: "/api/auth/get-session",
  /** POST: 로그아웃(같은 출처만) */
  signOut: "/api/auth/sign-out",
} as const;

/** 화면에 보여도 되는 내 계정 정보 */
export interface AccountView {
  id: string;
  /** 입력한 모양의 로그인 아이디(본인에게만 보인다) */
  loginId: string;
  roles: Role[];
}

/**
 * GET /api/auth/get-session 응답 본문. 로그인하지 않았으면 null.
 * 세션 토큰·이메일은 주지 않는다(토큰은 HttpOnly 쿠키에만 있다). 세션이 하루 넘게 쓰였으면 쿠키를 새로 준다.
 */
export type SessionResponse = { user: AccountView; expiresAt: string } | null;

export interface EnterRequest {
  id: string;
  password: string;
  /** "새 아이디" 확인 화면에서 만들기를 눌렀을 때 true */
  create?: boolean;
  /** create일 때 필수: 비밀번호 한 번 더 */
  passwordConfirm?: string;
  /** create일 때 선택: 비밀번호 찾기용 복구 이메일. 빈 문자열은 "없음" */
  email?: string;
}

export type EnterResponse =
  | { status: "signed_in"; user: AccountView }
  | { status: "created"; user: AccountView }
  /** 없는 아이디. 확인 화면을 띄우고 create: true로 다시 보낸다(계정은 아직 없다) */
  | { status: "new_id"; loginId: string };

export interface ResetPasswordRequest {
  id: string;
  email: string;
  newPassword: string;
  newPasswordConfirm: string;
}

/** 바꾼 뒤 그 계정의 세션은 모두 끊긴다. 새 비밀번호로 다시 들어간다 */
export interface ResetPasswordResponse {
  status: "password_reset";
}

/** 실패 응답의 error 값. 화면은 이 코드로 메시지 키를 고른다 */
export const ACCOUNT_ERROR_CODES = [
  "INVALID_REQUEST",
  "FORBIDDEN_ORIGIN",
  "UNSUPPORTED_MEDIA_TYPE",
  "INVALID_ID",
  "INVALID_PASSWORD",
  "BANNED",
  "ID_TAKEN",
  "SIGNUP_CLOSED",
  "SIGNUP_LIMIT",
  "PASSWORD_MISMATCH",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "PASSWORD_SAME_AS_ID",
  "PASSWORD_TOO_COMMON",
  "INVALID_EMAIL",
  "RESET_FAILED",
  "TOO_MANY_REQUESTS",
  "INTERNAL_ERROR",
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

export interface AccountErrorResponse {
  error: AccountErrorCode;
  /** TOO_MANY_REQUESTS·SIGNUP_LIMIT일 때 다시 시도할 수 있을 때까지(초). Retry-After 머리글과 같다 */
  retryAfterSec?: number;
}
