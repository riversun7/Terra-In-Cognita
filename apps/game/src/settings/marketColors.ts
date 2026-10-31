// 시세 색(D-442) — 오름·매수와 내림·매도의 색 관례. 순수 함수(시험 대상). 저장은 settings.ts·storage.ts, 그리기는 경제 화면 CSS.
// - 고른 값: 언어 기본 / 한국식 / 서양식(설정 > 화면 "시세 색"). 고르지 않았으면 언어 기본이다.
// - 언어 기본: 한국어 = 한국식(오름·매수 빨강, 내림·매도 파랑), 그 밖(영어) = 서양식(오름·매수 초록, 내림·매도 빨강).
// - 색만으로 읽지 않게 화살표(▲▼)·글자·자리는 어느 쪽이든 그대로 둔다(화면이 한다).
// - 기기에만 저장한다(계정 설정 표에 칸이 없다. 계정에 맞추려면 user_settings 열이 필요하다 — 기획·기술 다음 단계).

/** 설정에서 고르는 값(순서 = 설정 화면 순서) */
export const MARKET_COLOR_CHOICES = ["language", "korean", "western"] as const;
export type MarketColorChoice = (typeof MARKET_COLOR_CHOICES)[number];

/** 화면에 거는 관례(경제 화면 뿌리의 data-market-colors) */
export type MarketColors = "korean" | "western";

export function isMarketColorChoice(value: unknown): value is MarketColorChoice {
  return typeof value === "string" && (MARKET_COLOR_CHOICES as readonly string[]).includes(value);
}

/** 언어의 기본 관례: 한국어(ko, ko-KR 등)면 한국식, 그 밖은 서양식 */
export function languageMarketColors(locale: string): MarketColors {
  return locale === "ko" || locale.startsWith("ko-") ? "korean" : "western";
}

/** 고른 값(없으면 언어 기본)과 지금 언어 → 화면에 걸 관례 */
export function resolveMarketColors(choice: MarketColorChoice | undefined, locale: string): MarketColors {
  if (choice === "korean" || choice === "western") return choice;
  return languageMarketColors(locale);
}
