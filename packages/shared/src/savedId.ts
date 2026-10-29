// 계정·주소에 남는 ID의 모양 — 메뉴 항목·카드·템플릿·처리할 일 종류·분류·바로 처리 동작·주소 ID가 같은 규칙을 쓴다.
// 콘텐츠 팩 ID와 같다(영어 snake_case 2~48자, AGENTS.md 4장, packages/content ID_PATTERN).
// 서버 입력 검사(Zod)는 아는 칸에만 이 모양을 건다. 목록에 있는지는 보지 않는다(ADR 2026-10-29-app-shell 5절).

/** 저장되는 ID의 모양 */
export const SAVED_ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/;

/** 저장되는 ID 모양의 문자열인지 */
export function isSavedId(value: unknown): value is string {
  return typeof value === "string" && SAVED_ID_PATTERN.test(value);
}
