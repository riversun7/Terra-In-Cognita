// 화면 이동(SPA) 경로 판정 — 정적 파일에 없는 요청에 index.html을 줄지 정한다(app.ts의 not-found 처리기).
// 화면 주소 표(packages/shared/src/routes.ts)의 경로 규칙과 짝이다(ADR 2026-10-29-app-shell 1절). 시험이 표의 모든 경로 예를 넣어 본다.
// - API·WebSocket·상태 경로는 화면이 아니다. 글자 앞부분만 본다(`/apiary`도 화면이 아니다). 그래서 화면 주소는 이 앞머리로 시작하지 않는다.
// - 마지막 조각에 점이 있으면 파일로 본다(확장자). 없는 /assets/*.js에 HTML을 주면 브라우저가 형식 오류를 내고,
//   나중에 서비스 워커를 걷어낼 수도 없다. 그래서 화면 경로에는 점을 쓰지 않는다.
// - 검색어(? 뒤)는 보지 않는다. 검색어 값에는 점이 있어도 된다.

/**
 * 화면이 아닌 경로 앞머리(서버 API, WebSocket, 상태 확인).
 * 앞머리 셋은 서비스 워커 제외 목록(apps/game/vite.config.ts navigateFallbackDenylist)과 같지만 맞추는 법이 다르다.
 * 서버는 글자 앞부분을 본다(`/healthz`·`/apiary`도 화면이 아니다 → 404). 서비스 워커는 조각 단위로 본다
 * (`/healthz`는 index.html). 주소 표의 경로는 두 규칙을 모두 피한다(packages/shared routes.test.ts가 앞머리를 막는다).
 * 같은 앞머리가 네 곳에 적혀 있어 함께 고친다: 이 목록, vite.config.ts 제외 규칙, scripts/pwa-build.mjs
 * DENIED_NAVIGATIONS(경로 예), packages/shared/src/routes.test.ts RESERVED_PREFIXES.
 */
export const NON_PAGE_PREFIXES = ["/api", "/ws", "/health"] as const;

/** 요청(메서드, 요청 주소 = 경로 + 검색어)이 화면 이동이면 true → index.html */
export function isPagePath(method: string, url: string): boolean {
  if (method !== "GET") return false;
  const pathname = url.split("?", 1)[0] ?? "";
  if (NON_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  return !/\.[^/]*$/.test(pathname);
}
