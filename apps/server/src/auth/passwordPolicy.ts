// 새 비밀번호 규칙 — 스스로 만들 때(들어가기·비밀번호 찾기)만 적용한다 (ADR 2026-10-28-auth-and-accounts)
// - 8~128자, 아이디와 같으면 안 된다, 흔한 비밀번호 목록에 있으면 안 된다.
// - 로그인(있는 계정)에는 적용하지 않는다: 관리 명령(--allow-weak)으로 만든 계정은 더 짧을 수 있다.
// - 길이는 Better Auth와 같게 UTF-16 글자 수(.length)로 잰다. 비교는 NFKC·소문자로 한다.
// - 길이 숫자는 기기도 쓰므로 @terra/shared(passwordRules.ts)에 둔다.
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@terra/shared";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };

export type PasswordProblem =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_SAME_AS_ID"
  | "PASSWORD_TOO_COMMON";

/**
 * 흔한 비밀번호(8자 이상만 — 더 짧은 것은 길이 규칙이 막는다). 외부 의존성 없이 공개 유출 순위 상위와
 * 한국에서 흔한 자판 배열을 직접 적었다. 소문자로 비교한다.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "12345678",
  "123456789",
  "1234567890",
  "0123456789",
  "87654321",
  "987654321",
  "11111111",
  "00000000",
  "88888888",
  "12341234",
  "11223344",
  "12121212",
  "123123123",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "1q2w3e4r!",
  "q1w2e3r4",
  "q1w2e3r4t5",
  "1qaz2wsx",
  "1qaz2wsx3edc",
  "qwer1234",
  "qwerasdf",
  "asdf1234",
  "zxcv1234",
  "qwertyui",
  "qwertyuiop",
  "qwerty12",
  "qwerty123",
  "qwerty1234",
  "asdfghjk",
  "asdfghjkl",
  "zxcvbnm1",
  "abcd1234",
  "abc12345",
  "abcdefgh",
  "a1234567",
  "a12345678",
  "aa123456",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "starwars",
  "whatever",
  "trustno1",
  "letmein1",
  "welcome1",
  "dragon12",
  "computer",
  "internet",
  "1234qwer",
  "admin123",
  "admin1234",
  "administrator",
  "changeme",
  "test1234",
  "testtest",
  "gamer123",
  "minecraft",
  "pokemon1",
  "terra123",
  "terraincognita",
  // 한글을 영문 자판으로 친 것: 나는바보, 안녕하세요, 사랑해요
  "sksmsqkqh",
  "dkssudgktpdy",
  "tkfkdgody",
]);

/** 새 비밀번호를 검사한다. 문제가 없으면 null. loginIdKey는 소문자 아이디 키 */
export function checkNewPassword(password: string, loginIdKey: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "PASSWORD_TOO_SHORT";
  if (password.length > PASSWORD_MAX_LENGTH) return "PASSWORD_TOO_LONG";
  const folded = password.normalize("NFKC").toLowerCase();
  if (folded === loginIdKey) return "PASSWORD_SAME_AS_ID";
  if (COMMON_PASSWORDS.has(folded)) return "PASSWORD_TOO_COMMON";
  return null;
}
