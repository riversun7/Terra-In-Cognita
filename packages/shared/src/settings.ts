// 화면 설정(테마·언어) 목록과 형식 — 서버(계정 설정 표·tRPC 입력 검사)와 기기(설정 화면·저장)가 같이 쓴다.
// 결정: docs/adr/2026-10-28-design-system.md
// - null은 "아직 정하지 않음"이다. 그때는 기본 규칙을 따른다(테마: 파스텔, 기기가 고대비를 요청하면 선명. 언어: 기기 언어).
// - 모르는 값(더 새 버전이 저장한 값)은 정하지 않은 것(null)으로 본다.

/** 화면 테마. 순서는 설정 화면에 보이는 순서다 */
export const THEMES = ["pastel", "dark", "contrast", "station"] as const;

export type Theme = (typeof THEMES)[number];

/** 정한 테마가 없을 때의 테마. 기기가 고대비를 요청하면 contrast가 된다(게임 앱 settings/theme.ts) */
export const DEFAULT_THEME: Theme = "pastel";

/** 화면 언어. 게임 앱 Paraglide 설정(apps/game/project.inlang/settings.json)과 같아야 한다(시험이 확인) */
export const LOCALES = ["ko", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** 계정(user_settings 표)과 기기에 저장하는 화면 설정 */
export interface UserSettings {
  /** 고른 테마. null이면 정하지 않음 */
  theme: Theme | null;
  /** "기기 설정에 맞추기" — 켜면 기기의 다크·고대비 설정을 따른다(정거장은 자동으로 고르지 않는다) */
  followSystem: boolean;
  /** 고른 언어. null이면 정하지 않음(기기 언어) */
  locale: Locale | null;
}

/** 아무것도 정하지 않은 설정 */
export const EMPTY_SETTINGS: UserSettings = { theme: null, followSystem: false, locale: null };

/** 모르는 값을 기본값으로 바꿔 읽는다. 객체가 아니면 모두 기본값 */
export function parseUserSettings(value: unknown): UserSettings {
  if (typeof value !== "object" || value === null) return { ...EMPTY_SETTINGS };
  const theme: unknown = Reflect.get(value, "theme");
  const followSystem: unknown = Reflect.get(value, "followSystem");
  const locale: unknown = Reflect.get(value, "locale");
  return {
    theme: isTheme(theme) ? theme : null,
    followSystem: followSystem === true,
    locale: isSupportedLocale(locale) ? locale : null,
  };
}
