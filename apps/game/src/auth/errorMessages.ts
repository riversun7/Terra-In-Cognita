// 계정 오류 → 화면 문구 키 — 순수 함수(시험 대상). 서버 메시지 원문은 보여 주지 않는다.
// 서버 오류 코드 목록: packages/shared/src/accountApi.ts의 ACCOUNT_ERROR_CODES (코드가 늘면 여기서 타입 오류가 난다)
import type { AccountErrorCode } from "@terra/shared";
import type { MessageRef, PlainMessageKey, WaitMessageKey } from "../ui/messageRef.ts";
import type { AccountFailure } from "./accountResponse.ts";

/** 서버 오류 코드마다 문구 하나. 기다릴 시간이 붙는 코드(429)는 따로 */
export const ACCOUNT_ERROR_MESSAGE_KEYS = {
  INVALID_REQUEST: "auth_err_invalid_request",
  FORBIDDEN_ORIGIN: "auth_err_forbidden_origin",
  // 브라우저 fetch로 JSON을 보내면 나오지 않는다. 나오면 요청이 잘못 만들어진 것
  UNSUPPORTED_MEDIA_TYPE: "auth_err_invalid_request",
  INVALID_ID: "auth_err_invalid_id",
  INVALID_PASSWORD: "auth_err_invalid_password",
  BANNED: "auth_err_banned",
  ID_TAKEN: "auth_err_id_taken",
  SIGNUP_CLOSED: "auth_err_signup_closed",
  SIGNUP_LIMIT: "auth_err_signup_limit",
  PASSWORD_MISMATCH: "auth_err_password_mismatch",
  PASSWORD_TOO_SHORT: "auth_err_password_too_short",
  PASSWORD_TOO_LONG: "auth_err_password_too_long",
  PASSWORD_SAME_AS_ID: "auth_err_password_same_as_id",
  PASSWORD_TOO_COMMON: "auth_err_password_too_common",
  INVALID_EMAIL: "auth_err_invalid_email",
  RESET_FAILED: "auth_err_reset_failed",
  TOO_MANY_REQUESTS: "auth_err_too_many",
  INTERNAL_ERROR: "err_server",
} as const satisfies Record<AccountErrorCode, PlainMessageKey | WaitMessageKey>;

/** 기다릴 시간을 모를 때(서버가 주지 않음) 쓰는 값. 시도 제한이 1분 단위로 다시 채워진다 */
export const DEFAULT_RETRY_AFTER_SEC = 60;

const isWaitKey = (key: PlainMessageKey | WaitMessageKey): key is WaitMessageKey =>
  key === "auth_err_too_many" || key === "auth_err_signup_limit";

export function accountFailureMessage(failure: AccountFailure): MessageRef {
  switch (failure.kind) {
    case "network":
      return { key: "err_network" };
    case "unknown":
      return { key: "err_unknown" };
    case "code": {
      const key: PlainMessageKey | WaitMessageKey = ACCOUNT_ERROR_MESSAGE_KEYS[failure.code];
      if (isWaitKey(key)) return { key, waitSec: failure.retryAfterSec ?? DEFAULT_RETRY_AFTER_SEC };
      return { key };
    }
    default: {
      // 새 실패 종류가 생기면 여기서 타입 오류가 난다
      const unhandled: never = failure;
      return unhandled;
    }
  }
}

/** 비밀번호 규칙 오류인지 — 확인 화면에서 "다시 입력" 안내를 붙인다 */
export function isNewPasswordRuleCode(code: AccountErrorCode): boolean {
  return (
    code === "PASSWORD_TOO_SHORT" ||
    code === "PASSWORD_TOO_LONG" ||
    code === "PASSWORD_SAME_AS_ID" ||
    code === "PASSWORD_TOO_COMMON"
  );
}
