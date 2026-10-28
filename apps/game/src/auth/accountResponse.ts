// 계정 HTTP 응답 읽기 — 순수 함수(시험 대상). 요청 보내기는 accountClient.ts가 한다.
// 약속(경로·형식·오류 코드): packages/shared/src/accountApi.ts. 모르는 모양은 믿지 않고 "알 수 없음"으로 본다.
import {
  ACCOUNT_ERROR_CODES,
  type AccountErrorCode,
  type AccountView,
  type EnterResponse,
  type ResetPasswordResponse,
  isRole,
} from "@terra/shared";
import { field } from "../net/json.ts";

/** 실패: 서버 오류 코드 / 모르는 응답 / 서버에 닿지 못함 */
export type AccountFailure =
  | { kind: "code"; code: AccountErrorCode; retryAfterSec?: number }
  | { kind: "unknown" }
  | { kind: "network" };

export type AccountResult<T> = { ok: true; value: T } | { ok: false; failure: AccountFailure };

const isErrorCode = (value: unknown): value is AccountErrorCode =>
  typeof value === "string" && (ACCOUNT_ERROR_CODES as readonly string[]).includes(value);

/** 양의 정수 초. 아니면 undefined */
function positiveSeconds(value: unknown): number | undefined {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0 ? Math.ceil(number) : undefined;
}

/**
 * 실패 응답 → AccountFailure. 본문 { error, retryAfterSec? }를 읽는다.
 * 기다릴 시간은 본문 값이 없으면 Retry-After 머리글(초)을 쓴다.
 */
export function parseFailure(body: unknown, retryAfterHeader: string | null = null): AccountFailure {
  const code = field(body, "error");
  if (!isErrorCode(code)) return { kind: "unknown" };
  const retryAfterSec = positiveSeconds(field(body, "retryAfterSec")) ?? positiveSeconds(retryAfterHeader);
  return retryAfterSec === undefined ? { kind: "code", code } : { kind: "code", code, retryAfterSec };
}

/** 화면에 보여도 되는 계정 정보. 모르는 역할 이름은 버린다(서버가 더 새 버전일 수 있음) */
export function parseAccountView(value: unknown): AccountView | undefined {
  const id = field(value, "id");
  const loginId = field(value, "loginId");
  const roles = field(value, "roles");
  if (typeof id !== "string" || id === "" || typeof loginId !== "string" || loginId === "") return undefined;
  if (!Array.isArray(roles)) return undefined;
  return { id, loginId, roles: roles.filter((role): role is AccountView["roles"][number] => isRole(role)) };
}

/** HTTP 응답 하나(상태·본문·머리글) */
export interface RawResponse {
  status: number;
  body: unknown;
  retryAfter: string | null;
}

/** POST /api/account/enter 응답 */
export function parseEnterResponse(response: RawResponse): AccountResult<EnterResponse> {
  if (response.status !== 200)
    return { ok: false, failure: parseFailure(response.body, response.retryAfter) };
  const status = field(response.body, "status");
  if (status === "signed_in" || status === "created") {
    const user = parseAccountView(field(response.body, "user"));
    if (user) return { ok: true, value: { status, user } };
  }
  if (status === "new_id") {
    const loginId = field(response.body, "loginId");
    if (typeof loginId === "string" && loginId !== "") return { ok: true, value: { status, loginId } };
  }
  return { ok: false, failure: { kind: "unknown" } };
}

/** POST /api/account/reset-password 응답 */
export function parseResetResponse(response: RawResponse): AccountResult<ResetPasswordResponse> {
  if (response.status !== 200)
    return { ok: false, failure: parseFailure(response.body, response.retryAfter) };
  if (field(response.body, "status") === "password_reset") {
    return { ok: true, value: { status: "password_reset" } };
  }
  return { ok: false, failure: { kind: "unknown" } };
}
