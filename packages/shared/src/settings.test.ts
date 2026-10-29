import { describe, expect, it } from "vitest";
import {
  EMPTY_SETTINGS,
  LOCALES,
  SETTINGS_OBJECT_MAX_BYTES,
  THEMES,
  hasUnstorableText,
  isSettingsObject,
  isSupportedLocale,
  isTheme,
  parseUserSettings,
  settingsObjectBytes,
} from "./settings.ts";

describe("화면 설정 목록", () => {
  it("테마 4개, 언어 2개", () => {
    expect(THEMES).toEqual(["pastel", "dark", "contrast", "station"]);
    expect(LOCALES).toEqual(["ko", "en"]);
  });

  it("목록에 있는 문자열만 통과한다", () => {
    expect(isTheme("station")).toBe(true);
    expect(isTheme("Station")).toBe(false);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("ja")).toBe(false);
    expect(isSupportedLocale(1)).toBe(false);
  });
});

describe("parseUserSettings", () => {
  it("맞는 값은 그대로 읽는다", () => {
    expect(parseUserSettings({ theme: "dark", followSystem: true, locale: "en" })).toEqual({
      theme: "dark",
      followSystem: true,
      locale: "en",
    });
  });

  it("모르는 값(더 새 버전이 저장한 값)은 정하지 않은 것으로 본다", () => {
    expect(parseUserSettings({ theme: "sepia", followSystem: "yes", locale: "ja" })).toEqual(EMPTY_SETTINGS);
  });

  it("빠진 칸·객체가 아닌 값은 기본값", () => {
    expect(parseUserSettings({ theme: "contrast" })).toEqual({ ...EMPTY_SETTINGS, theme: "contrast" });
    expect(parseUserSettings(null)).toEqual(EMPTY_SETTINGS);
    expect(parseUserSettings("dark")).toEqual(EMPTY_SETTINGS);
  });

  it("돌려준 객체를 바꿔도 기본값은 바뀌지 않는다", () => {
    const parsed = parseUserSettings(undefined);
    parsed.theme = "dark";
    expect(EMPTY_SETTINGS.theme).toBeNull();
  });
});

describe("메뉴·홈 설정(nav·home): 모양을 모르는 JSON 객체", () => {
  it("JSON 객체면 안쪽을 보지 않고 그대로 남긴다(모르는 칸·모르는 ID 포함)", () => {
    const nav = { layout: "a", menu: ["future_item", "home"], extra: { x: 1 } };
    const home = {
      template: "dt_future",
      cards: [{ id: "future_card", size: "3x3", note: "n" }],
      extra: [1],
    };
    const parsed = parseUserSettings({ theme: "dark", followSystem: false, locale: null, nav, home });
    expect(parsed).toEqual({ theme: "dark", followSystem: false, locale: null, nav, home });
    // 고치지 않은 같은 값이다(복사하지 않는다)
    expect(parsed.nav).toBe(nav);
    expect(parsed.home).toBe(home);
  });

  it("칸이 없거나 JSON 객체가 아니면(배열·null·문자열) 칸을 두지 않는다 = 정하지 않음", () => {
    for (const value of [undefined, null, [], ["home"], "c", 1, true]) {
      const parsed = parseUserSettings({
        theme: null,
        followSystem: false,
        locale: null,
        nav: value,
        home: value,
      });
      expect(parsed, JSON.stringify(value)).toEqual(EMPTY_SETTINGS);
      expect(Object.hasOwn(parsed, "nav") || Object.hasOwn(parsed, "home")).toBe(false);
    }
  });

  it("isSettingsObject: 배열·null이 아닌 객체", () => {
    expect(isSettingsObject({})).toBe(true);
    expect(isSettingsObject({ a: [1] })).toBe(true);
    expect(isSettingsObject([])).toBe(false);
    expect(isSettingsObject(null)).toBe(false);
    expect(isSettingsObject("{}")).toBe(false);
  });

  it("크기는 JSON.stringify의 UTF-8 바이트로 잰다. 상한은 4KB", () => {
    expect(SETTINGS_OBJECT_MAX_BYTES).toBe(4096);
    expect(settingsObjectBytes({})).toBe(2);
    // {"a":"가"} = ASCII 8바이트 + 한글 한 자 3바이트, 그림 문자(대리 쌍)는 4바이트
    expect(settingsObjectBytes({ a: "가" })).toBe(11);
    expect(settingsObjectBytes({ a: "😀" })).toBe(12);
  });

  it("JSON으로 바꿀 수 없는 값은 무한대(상한을 넘는 것으로 본다)", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(settingsObjectBytes(cycle)).toBe(Number.POSITIVE_INFINITY);
    expect(settingsObjectBytes({ big: 1n })).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("저장할 수 없는 글자(hasUnstorableText): 계정 jsonb 열이 받지 않는 NUL·짝 없는 대리 문자", () => {
  /** NUL, 짝 없는 앞쪽·뒤쪽 대리 문자, 순서가 바뀐 쌍 */
  const BAD = ["\u0000", "a\u0000b", "\uD800", "\uDC00", "a\uD83D", "\uDE00b", "\uDC00\uD800"];

  it("칸 이름·글자 값 어디에 있어도, 깊이 있어도 찾는다", () => {
    for (const text of BAD) {
      const label = JSON.stringify(text);
      expect(hasUnstorableText({ extra: text }), label).toBe(true);
      expect(hasUnstorableText({ [`k${text}`]: 1 }), label).toBe(true);
      expect(hasUnstorableText({ deep: [1, [{ x: ["ok", text] }]] }), label).toBe(true);
      expect(hasUnstorableText({ deep: { [text]: null } }), label).toBe(true);
    }
  });

  it("JSON에 들어가는 값을 본다: toJSON이 돌려준 글자는 보고, 빠지는 칸(undefined)의 이름은 보지 않는다", () => {
    expect(hasUnstorableText({ when: { toJSON: () => "\u0000" } })).toBe(true);
    expect(hasUnstorableText({ "\u0000": undefined })).toBe(false);
  });

  it("짝이 맞는 대리 문자(그림 문자)·한글·NUL이 아닌 제어 문자는 저장할 수 있다", () => {
    expect(hasUnstorableText({})).toBe(false);
    expect(hasUnstorableText({ a: "가😀", "키😀": [1, null, true, { b: "\t\n\u0001\uFFFF" }] })).toBe(false);
  });

  it("JSON으로 바꿀 수 없는 값은 저장할 수 없다", () => {
    const cycle: Record<string, unknown> = {};
    cycle["self"] = cycle;
    expect(hasUnstorableText(cycle)).toBe(true);
    expect(hasUnstorableText({ big: 1n })).toBe(true);
  });
});
