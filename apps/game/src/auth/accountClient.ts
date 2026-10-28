// 계정 HTTP 요청 — 들어가기(로그인·가입)와 비밀번호 찾기. 같은 출처 JSON POST만 쓴다(서버가 다른 것은 거절).
// 쿠키(세션)는 서버가 Set-Cookie로 준다. 응답 본문은 accountResponse.ts가 읽는다.
import {
  ACCOUNT_API_PATHS,
  type EnterRequest,
  type EnterResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
} from "@terra/shared";
import {
  type AccountResult,
  type RawResponse,
  parseEnterResponse,
  parseResetResponse,
} from "./accountResponse.ts";

async function postJson(path: string, body: unknown): Promise<RawResponse | undefined> {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const parsed: unknown = await response.json().catch(() => undefined);
    return { status: response.status, body: parsed, retryAfter: response.headers.get("retry-after") };
  } catch {
    return undefined;
  }
}

export async function enter(request: EnterRequest): Promise<AccountResult<EnterResponse>> {
  const response = await postJson(ACCOUNT_API_PATHS.enter, request);
  return response ? parseEnterResponse(response) : { ok: false, failure: { kind: "network" } };
}

export async function resetPassword(
  request: ResetPasswordRequest,
): Promise<AccountResult<ResetPasswordResponse>> {
  const response = await postJson(ACCOUNT_API_PATHS.resetPassword, request);
  return response ? parseResetResponse(response) : { ok: false, failure: { kind: "network" } };
}
