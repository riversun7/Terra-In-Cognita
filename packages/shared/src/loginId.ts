// 로그인 아이디 규칙 — 서버(가입·로그인·관리 명령)와 기기(입력 안내)가 같은 함수를 쓴다.
// 결정: docs/adr/2026-10-28-auth-and-accounts.md
// - 영문·숫자·_ 3~20자. 앞뒤 공백을 지우고 NFKC로 바꾼 뒤 검사한다(전각 "ａｄｍｉｎ" → "admin", 켈빈 기호 → "K").
// - 대소문자는 하나로 본다: 저장·비교 키는 소문자(users.username), 입력한 모양은 표시용(users.name).
// - 로그인 아이디는 다른 플레이어에게 보이지 않는다(게임 안 이름은 캐릭터 이름). 그래서 예약어를 두지 않는다.
// 순수 함수: 같은 입력이면 어디서나 같은 결과(정규화는 유니코드 표준, 소문자화는 ASCII만).

export const LOGIN_ID_MIN_LENGTH = 3;
export const LOGIN_ID_MAX_LENGTH = 20;

/** 표시 모양 검사 — 영문 대소문자·숫자·_ */
const DISPLAY_PATTERN = /^[A-Za-z0-9_]+$/;
/** 저장 키 모양 — DB 검사 조건(users_username_format)과 같다 */
const KEY_PATTERN = /^[a-z0-9_]{3,20}$/;
/** 정규화 전에 거르는 입력 길이 상한(아주 긴 문자열의 NFKC 비용을 막는다) */
const RAW_INPUT_MAX = 256;

export type LoginIdProblem = "empty" | "invalid_chars" | "too_short" | "too_long";

export type LoginIdResult =
  | {
      ok: true;
      /** 입력한 모양(공백 제거·NFKC 뒤). 화면과 users.name에 쓴다 */
      display: string;
      /** 비교·저장 키(소문자). users.username에 쓴다 */
      key: string;
    }
  | { ok: false; problem: LoginIdProblem };

/** 입력을 정규화하고 검사한다: 공백 제거 → NFKC → 검사 → 소문자 키 */
export function parseLoginId(input: string): LoginIdResult {
  if (input.length > RAW_INPUT_MAX) return { ok: false, problem: "too_long" };
  const display = input.trim().normalize("NFKC");
  if (display.length === 0) return { ok: false, problem: "empty" };
  if (!DISPLAY_PATTERN.test(display)) return { ok: false, problem: "invalid_chars" };
  if (display.length < LOGIN_ID_MIN_LENGTH) return { ok: false, problem: "too_short" };
  if (display.length > LOGIN_ID_MAX_LENGTH) return { ok: false, problem: "too_long" };
  // 여기까지 오면 ASCII만 남아 소문자화가 언어 설정과 무관하다
  return { ok: true, display, key: display.toLowerCase() };
}

/** 이미 정규화된 저장 키인지 (DB에서 읽은 값 확인용) */
export function isLoginIdKey(value: string): boolean {
  return KEY_PATTERN.test(value);
}
