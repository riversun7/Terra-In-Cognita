import { describe, expect, it } from "vitest";
import {
  EMPTY_SETTINGS,
  LOCALES,
  THEMES,
  isSupportedLocale,
  isTheme,
  parseUserSettings,
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
