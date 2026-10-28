// 새 비밀번호 길이 규칙 — 서버(판정)와 기기(보내기 전 안내)가 같은 숫자를 쓴다.
// 결정: docs/adr/2026-10-28-auth-and-accounts.md. 아이디와 같음·흔한 비밀번호 검사는 서버 apps/server/src/auth/passwordPolicy.ts.
// 길이는 Better Auth와 같게 UTF-16 글자 수(.length)로 잰다.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
