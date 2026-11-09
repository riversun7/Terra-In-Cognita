// 세력 정체성·화폐 표시 규칙(docs/adr/2026-11-09-faction-profiles.md) — 콘텐츠 팩 국가 프리셋 검사, 서버 저장 검사, 화면 입력 검사가 같이 쓴다.
// 사용자 요청(2026-11-09): "세력의 명칭/약어, 시그니처 컬러, 화폐(이름과 심볼표시, 3글자 약어. 고유하게)". 세력이 생길 때 정하고
// (NPC는 프리셋이나 기본값), 관리자가 고칠 수 있다.

/** 세력 이름: 앞뒤 빈칸·제어 문자 없이 1~24자 */
export const FACTION_NAME_MAX = 24;
/** 세력 약어: 글자·숫자 2~5자(빈칸 없음, 한글 가능). 세계 안에서 하나(대소문자 무시) */
export const FACTION_SHORT_PATTERN = /^[\p{L}\p{N}]{2,5}$/u;
/** 시그니처 컬러: #RRGGBB */
export const FACTION_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
/** 화폐 이름: 앞뒤 빈칸·제어 문자 없이 1~24자 */
export const CURRENCY_NAME_MAX = 24;
/** 화폐 기호: 빈칸·제어 문자 없이 1~3자(예: ₩, ¢, Cr) */
export const CURRENCY_SYMBOL_PATTERN = /^[^\s\p{Cc}]{1,3}$/u;
/** 화폐 약어(티커): 영어 대문자 3자. 세계 안에서 하나 */
export const CURRENCY_TICKER_PATTERN = /^[A-Z]{3}$/;

/** 이름 칸(세력·화폐) 검사: 앞뒤 빈칸·제어 문자 없이 1~max자 */
export function isProfileName(text: string, max: number): boolean {
  return text.length >= 1 && text.length <= max && text.trim() === text && !/\p{Cc}/u.test(text);
}

export const isFactionShort = (text: string): boolean => FACTION_SHORT_PATTERN.test(text);
export const isFactionColor = (text: string): boolean => FACTION_COLOR_PATTERN.test(text);
export const isCurrencySymbol = (text: string): boolean => CURRENCY_SYMBOL_PATTERN.test(text);
export const isCurrencyTicker = (text: string): boolean => CURRENCY_TICKER_PATTERN.test(text);

/**
 * 기본 색 표(프리셋 색이 없는 세력이 세력 ID로 하나 고른다). 서로 잘 구별되는 16색 [임시] — 화면은 이 값을 표지 색으로만 쓴다
 * (글자색이 아니므로 대비 검사 대상이 아니다)
 */
export const FACTION_DEFAULT_COLORS = [
  "#e6194b",
  "#3cb44b",
  "#ffe119",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#fabed4",
  "#469990",
  "#dcbeff",
  "#9a6324",
  "#fffac8",
  "#800000",
  "#aaffc3",
] as const;

export function defaultFactionColor(factionId: number): string {
  return FACTION_DEFAULT_COLORS[Math.abs(factionId) % FACTION_DEFAULT_COLORS.length] ?? "#888888";
}
