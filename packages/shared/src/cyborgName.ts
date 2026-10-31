// 사이보그 이름 규칙 — 서버(만들기·이름 확인)와 기기(입력 안내)가 같은 함수를 쓴다.
// 기획 D-134(서버 고유 + 차단 + 변경권), D-443 159(서버 고유), 질문 170·171 기술 추천(가). ADR 2026-11-01-first-login-cyborg 3절.
// - NFC로 바꾼 뒤 검사한다(조합형 한글 입력도 완성형으로 본다). 앞뒤 공백은 지운다(가운데 빈칸은 안 된다).
// - 글자: 한글 완성형(가~힣)·영문·숫자만. 글자가 하나는 있어야 한다(숫자만 안 됨).
//   다른 나라 글자는 처음부터 받지 않으므로 모양이 비슷한 글자 섞기(D-134, UTS #39)가 생기지 않는다.
// - 길이: 한글 1자 = 2칸, 영문·숫자 1자 = 1칸으로 3~16칸. 한글만이면 2~8자, 영문만이면 3~16자(D-134 출발값), 섞어도 된다.
// - 비교 열쇠는 소문자다(대소문자는 같은 이름, cyborgs.name_key 유일). 보이는 이름은 친 모양 그대로(cyborgs.name).
// - [임시] 사칭 목록(운영자·관리자 등)을 막는다. 욕설 목록은 기획 Step 5·7이 정하면 같은 자리에 넣는다(질문 171).
// 순수 함수: 같은 입력이면 어디서나 같은 결과(정규화는 유니코드 표준, 소문자화는 ASCII만 남은 뒤).

/** 길이 칸 상한·하한(한글 1자 = 2칸) */
export const CYBORG_NAME_MIN_UNITS = 3;
export const CYBORG_NAME_MAX_UNITS = 16;
/** 정규화 전에 거르는 입력 길이 상한(아주 긴 문자열의 정규화 비용을 막는다) */
const RAW_INPUT_MAX = 64;

const ALLOWED = /^[0-9A-Za-z가-힣]+$/u;
const HAS_LETTER = /[A-Za-z가-힣]/u;
const HANGUL = /[가-힣]/u;

/**
 * [임시] 사칭으로 막는 말(열쇠 = 소문자). contains는 이름 안 어디에 있어도, exact는 이름 전체가 같을 때만 막는다
 * (짧은 말 "gm"을 contains로 두면 평범한 이름까지 막힌다)
 */
export const CYBORG_NAME_RESERVED = {
  contains: [
    "admin",
    "administrator",
    "moderator",
    "operator",
    "gamemaster",
    "system",
    "운영",
    "관리자",
    "시스템",
    "개발자",
  ],
  exact: ["gm", "dev", "terra", "테라", "staff", "official", "공식"],
} as const;

export type CyborgNameProblem =
  | "empty"
  | "invalid_chars"
  | "needs_letter"
  | "too_short"
  | "too_long"
  | "reserved";

export type CyborgNameResult =
  | {
      readonly ok: true;
      /** 보이는 이름(앞뒤 공백 제거·NFC). cyborgs.name */
      readonly display: string;
      /** 비교 열쇠(소문자). cyborgs.name_key — 서버에서 하나뿐 */
      readonly key: string;
    }
  | { readonly ok: false; readonly problem: CyborgNameProblem };

/** 길이 칸: 한글 1자 = 2칸, 나머지(영문·숫자) 1칸. 허용 글자만 든 문자열에 쓴다 */
export function cyborgNameUnits(display: string): number {
  let units = 0;
  for (const char of display) units += HANGUL.test(char) ? 2 : 1;
  return units;
}

/** 입력을 정규화하고 검사한다: 앞뒤 공백 제거 → NFC → 글자 → 길이 → 사칭 → 소문자 열쇠 */
export function parseCyborgName(input: string): CyborgNameResult {
  if (input.length > RAW_INPUT_MAX) return { ok: false, problem: "too_long" };
  const display = input.trim().normalize("NFC");
  if (display.length === 0) return { ok: false, problem: "empty" };
  if (!ALLOWED.test(display)) return { ok: false, problem: "invalid_chars" };
  if (!HAS_LETTER.test(display)) return { ok: false, problem: "needs_letter" };
  const units = cyborgNameUnits(display);
  if (units < CYBORG_NAME_MIN_UNITS) return { ok: false, problem: "too_short" };
  if (units > CYBORG_NAME_MAX_UNITS) return { ok: false, problem: "too_long" };
  // 여기까지 오면 ASCII 영문·숫자와 한글만 남아 소문자화가 언어 설정과 무관하다
  const key = display.toLowerCase();
  const reserved =
    CYBORG_NAME_RESERVED.contains.some((word) => key.includes(word)) ||
    CYBORG_NAME_RESERVED.exact.some((word) => key === word);
  if (reserved) return { ok: false, problem: "reserved" };
  return { ok: true, display, key };
}
