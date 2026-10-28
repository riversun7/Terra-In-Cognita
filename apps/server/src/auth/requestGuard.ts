// 계정 경로 요청 검사 — 같은 출처의 JSON 요청만 받는다 (로그인 CSRF·다른 사이트의 폼 전송 방지)
// 서버에서 auth.api를 부르면 Better Auth의 HTTP 보호(출처 확인 등)가 돌지 않아서 우리가 한다(ADR 인증).
import type { IncomingHttpHeaders } from "node:http";

function single(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 같은 출처인지:
 * - Sec-Fetch-Site가 있으면 same-origin이어야 한다(same-site는 같은 도메인의 다른 포트·앱이라 거절).
 * - Origin이 있으면 앱 출처(BETTER_AUTH_URL)와 같아야 한다.
 * - 둘 다 없으면 거절한다(요즘 브라우저는 POST에 Origin을 붙인다).
 */
export function isSameOriginRequest(headers: IncomingHttpHeaders, appOrigin: string): boolean {
  const site = single(headers, "sec-fetch-site");
  if (site !== undefined && site !== "same-origin") return false;
  const origin = single(headers, "origin");
  if (origin !== undefined) return origin === appOrigin;
  return site === "same-origin";
}

/**
 * WebSocket 연결 요청에서 세션 쿠키를 믿어도 되는지(다른 사이트가 사용자 쿠키로 연결을 여는 것 막기):
 * - Origin이 있으면 앱 출처(BETTER_AUTH_URL)와 같아야 한다. 브라우저는 WebSocket 연결에 늘 Origin을 붙인다.
 * - Origin이 없으면 브라우저가 아니다(측정 스크립트 등). 사용자 쿠키를 몰래 실어 보낼 수 없으므로 믿는다.
 * 믿지 못하면 연결은 그대로 두고 로그인하지 않은 것으로 본다(인사·ping은 된다).
 */
export function isAllowedSocketOrigin(headers: IncomingHttpHeaders, appOrigin: string): boolean {
  const origin = single(headers, "origin");
  return origin === undefined || origin === appOrigin;
}

/** 본문 형식이 JSON인지 (application/json, 매개변수 charset 등은 허용) */
export function isJsonRequest(headers: IncomingHttpHeaders): boolean {
  const type = single(headers, "content-type");
  if (!type) return false;
  return (type.split(";", 1)[0] ?? "").trim().toLowerCase() === "application/json";
}
