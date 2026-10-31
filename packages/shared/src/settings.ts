// 계정·기기 설정(테마·언어·메뉴·홈) 목록과 형식 — 서버(계정 설정 표·tRPC 입력 검사)와 기기(설정 화면·저장)가 같이 쓴다.
// 결정: docs/adr/2026-10-28-design-system.md, docs/adr/2026-10-29-app-shell.md 5절
// - null은 "아직 정하지 않음"이다. 그때는 기본 규칙을 따른다(테마: 파스텔, 기기가 고대비를 요청하면 선명. 언어: 기기 언어).
// - 모르는 값(더 새 버전이 저장한 값)은 정하지 않은 것(null)으로 본다.
// - 메뉴(nav)·홈(home)은 모양을 모르는 JSON 객체로 다룬다. 칸이 없으면 정하지 않은 것이다(기본 메뉴·역할의 기본 카드).
//   안쪽을 읽는 일(parseNavigation·parseHome)은 쓰는 곳(틀·홈 조각)이 한다. 그래서 더 새 버전이 넣은 칸이 지워지지 않고,
//   홈 카드 모듈(@terra/shared/dashboard)이 첫 화면 묶음에 들어가지 않는다.
import { utf8ByteLength } from "./utf8.ts";

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

/** 메뉴·홈 설정 값: 모양을 모르는 JSON 객체 */
export type SettingsObject = { readonly [key: string]: unknown };

/**
 * 메뉴·홈 설정 값 하나의 크기 상한(바이트, settingsObjectBytes로 잰다. ADR 37 5절, Assumed).
 * 서버는 넘는 값을 받지 않고(BAD_REQUEST), 기기는 넘는 값을 저장하지 않는다. 읽을 때는 크기를 보지 않는다:
 * 더 새 버전이 상한을 올려 저장한 값을 되돌림 배포 동안 버리지 않으려고다.
 */
export const SETTINGS_OBJECT_MAX_BYTES = 4096;

/** 배열·null이 아닌 객체인지(JSON 객체) */
export function isSettingsObject(value: unknown): value is SettingsObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 직렬화한 크기 = JSON.stringify(들여쓰기 없음)의 UTF-8 바이트. JSON으로 바꿀 수 없으면(BigInt·순환) 무한대 */
export function settingsObjectBytes(value: SettingsObject): number {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** 짝 없는 대리 문자(UTF-16 반쪽). u 플래그라 짝이 맞는 둘(그림 문자 등)은 한 글자(코드 포인트)로 읽혀 걸리지 않는다 */
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

/** PostgreSQL jsonb가 받지 않는 글자: NUL(U+0000)과 짝 없는 대리 문자 */
const isUnstorableText = (text: string): boolean => text.includes("\u0000") || LONE_SURROGATE.test(text);

/**
 * 메뉴·홈 값의 칸 이름·글자 값에 계정에 저장할 수 없는 글자(NUL, 짝 없는 대리 문자)가 있는지. JSON으로 바꿀 수 없어도 true.
 * 계정 jsonb 열이 받지 않아서, 서버는 받지 않고(BAD_REQUEST. 전에는 DB 오류라 500) 기기는 저장하지 않는다.
 * JSON.stringify가 쓰는 값을 본다(toJSON을 거친 값, 값이 undefined라 빠지는 칸의 이름은 보지 않는다).
 * String.prototype.isWellFormed는 Firefox 119부터라 쓰지 않는다(기기 하한 브라우저에 없다).
 */
export function hasUnstorableText(value: SettingsObject): boolean {
  let found = false;
  try {
    JSON.stringify(value, (key: string, item: unknown) => {
      const written = item !== undefined && typeof item !== "function" && typeof item !== "symbol";
      if ((written && isUnstorableText(key)) || (typeof item === "string" && isUnstorableText(item))) {
        found = true;
      }
      return item;
    });
  } catch {
    return true;
  }
  return found;
}

/** 계정(user_settings 표)과 기기에 저장하는 설정 */
export interface UserSettings {
  /** 고른 테마. null이면 정하지 않음 */
  theme: Theme | null;
  /** "기기 설정에 맞추기" — 켜면 기기의 다크·고대비 설정을 따른다(정거장은 자동으로 고르지 않는다) */
  followSystem: boolean;
  /** 고른 언어. null이면 정하지 않음(기기 언어) */
  locale: Locale | null;
  /** 메뉴 설정(ADR 37 4절). 칸이 없으면 정하지 않음. 읽기는 parseNavigation, 쓰기는 mergeNavigation */
  nav?: SettingsObject;
  /** 홈 설정(ADR 37 6절). 칸이 없으면 정하지 않음. 읽기는 parseHome, 쓰기는 mergeHome(@terra/shared/dashboard) */
  home?: SettingsObject;
}

/** 아무것도 정하지 않은 설정 */
export const EMPTY_SETTINGS: UserSettings = { theme: null, followSystem: false, locale: null };

/** 모르는 값을 기본값으로 바꿔 읽는다. 객체가 아니면 모두 기본값. 메뉴·홈은 JSON 객체일 때만 남긴다(안쪽은 그대로) */
export function parseUserSettings(value: unknown): UserSettings {
  if (typeof value !== "object" || value === null) return { ...EMPTY_SETTINGS };
  const theme: unknown = Reflect.get(value, "theme");
  const followSystem: unknown = Reflect.get(value, "followSystem");
  const locale: unknown = Reflect.get(value, "locale");
  const nav: unknown = Reflect.get(value, "nav");
  const home: unknown = Reflect.get(value, "home");
  const settings: UserSettings = {
    theme: isTheme(theme) ? theme : null,
    followSystem: followSystem === true,
    locale: isSupportedLocale(locale) ? locale : null,
  };
  if (isSettingsObject(nav)) settings.nav = nav;
  if (isSettingsObject(home)) settings.home = home;
  return settings;
}
