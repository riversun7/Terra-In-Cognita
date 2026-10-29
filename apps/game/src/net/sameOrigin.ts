// 같은 출처 경로 확인 — 서버가 알려 준 주소(2차맵 지형, 1차맵 타일 주소 틀)를 받기 전에 본다.
// "/api/…"만 받는다. "//다른곳"이나 "/\다른곳"(브라우저가 "\"를 "/"로 읽는다)처럼 출처가 바뀌는 주소는 거절한다.
export function isSameOriginPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}
