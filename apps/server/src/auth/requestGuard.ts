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
 * 읽기(GET·HEAD)를 받아도 되는지 — 다른 사이트가 사용자 쿠키를 실어 보낸 요청이 아니어야 한다(SameSite=Lax 쿠키는
 * 다른 사이트에서 연 주소(최상위 이동)에도 실린다). 응답은 다른 사이트가 읽을 수 없지만, 감사 기록을 남기는 조회도 있다.
 * - Sec-Fetch-Site가 있으면 same-origin이나 none(주소창·북마크 등 사람이 직접 연 것)이어야 한다.
 *   cross-site·same-site(다른 사이트·같은 도메인의 다른 앱의 링크·이미지·fetch)와 모르는 값은 거절한다.
 * - Origin이 있으면 앱 출처와 같아야 한다(다른 출처의 fetch는 GET에도 Origin을 붙인다).
 * - 둘 다 없으면 받는다(브라우저가 아닌 도구. 지원 브라우저(iOS 16.4 이상)는 Sec-Fetch-Site를 붙인다).
 */
export function isAllowedReadRequest(headers: IncomingHttpHeaders, appOrigin: string): boolean {
  const site = single(headers, "sec-fetch-site");
  if (site !== undefined && site !== "same-origin" && site !== "none") return false;
  const origin = single(headers, "origin");
  return origin === undefined || origin === appOrigin;
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
