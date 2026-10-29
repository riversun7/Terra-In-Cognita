import { describe, expect, it } from "vitest";
import {
  type DeviceSettings,
  EMPTY_DEVICE_SETTINGS,
  parseDeviceSettings,
  serializeDeviceSettings,
  storableSettingsObject,
} from "./storage.ts";

describe("기기 저장 모양", () => {
  it("쓰고 다시 읽으면 같다(올릴 것 표시 포함)", () => {
    const settings: DeviceSettings = {
      theme: "station",
      followSystem: false,
      locale: "en",
      pending: { appearance: { by: "user-1" }, locale: { by: null } },
    };
    expect(parseDeviceSettings(serializeDeviceSettings(settings))).toEqual(settings);
  });

  it("theme-init.js가 읽는 모양: v·theme·followSystem", () => {
    const data = JSON.parse(serializeDeviceSettings({ ...EMPTY_DEVICE_SETTINGS, theme: "dark" }));
    expect(data).toMatchObject({ v: 1, theme: "dark", followSystem: false });
  });

  it("없음·깨진 JSON·모르는 판은 아무것도 정하지 않은 설정", () => {
    expect(parseDeviceSettings(null)).toEqual(EMPTY_DEVICE_SETTINGS);
    expect(parseDeviceSettings("{not json")).toEqual(EMPTY_DEVICE_SETTINGS);
    expect(parseDeviceSettings(JSON.stringify({ v: 2, theme: "dark" }))).toEqual(EMPTY_DEVICE_SETTINGS);
    expect(parseDeviceSettings("null")).toEqual(EMPTY_DEVICE_SETTINGS);
  });

  it("모르는 값은 정하지 않은 것으로, 모양이 틀린 올릴 것 표시는 버린다", () => {
    const raw = JSON.stringify({
      v: 1,
      theme: "aurora",
      followSystem: 1,
      locale: "ja",
      pending: { appearance: { by: 42 }, locale: "yes", other: { by: null } },
    });
    expect(parseDeviceSettings(raw)).toEqual(EMPTY_DEVICE_SETTINGS);
  });
});

describe("기기 저장: 메뉴(nav)·홈(home)", () => {
  // 더 새 버전이 넣은 칸(extra), 목록에 없는 항목 ID(future_item), 모르는 카드와 카드 안의 모르는 칸
  const nav = { layout: "c", menu: ["home", "future_item"], extra: [1, "a"] };
  const home = {
    template: "dt_grid",
    cards: [{ id: "future_card", size: "3x3", pin: { at: 2 } }],
    extra: null,
  };

  it("쓰고 다시 읽으면 같다(안쪽 모르는 칸·묶음 4개의 올릴 것 표시 포함). 판은 1 그대로", () => {
    const settings: DeviceSettings = {
      theme: "dark",
      followSystem: false,
      locale: null,
      nav,
      home,
      pending: {
        appearance: { by: "user-1" },
        locale: { by: null },
        nav: { by: "user-1" },
        home: { by: null },
      },
    };
    const raw = serializeDeviceSettings(settings);
    expect(JSON.parse(raw)).toMatchObject({ v: 1, theme: "dark", followSystem: false });
    expect(parseDeviceSettings(raw)).toEqual(settings);
  });

  it("값이 없으면 저장 문자열에 칸이 생기지 않는다(전과 같은 모양)", () => {
    const raw = serializeDeviceSettings({ ...EMPTY_DEVICE_SETTINGS, theme: "station" });
    expect(Object.keys(JSON.parse(raw))).toEqual(["v", "theme", "followSystem", "locale", "pending"]);
  });

  it("JSON 객체가 아닌 값(배열·문자열·null)은 정하지 않은 것으로 읽는다. 다른 칸은 그대로", () => {
    const raw = JSON.stringify({
      v: 1,
      theme: "dark",
      followSystem: false,
      locale: "en",
      nav: ["c"],
      home: "dt_grid",
    });
    expect(parseDeviceSettings(raw)).toEqual({ ...EMPTY_DEVICE_SETTINGS, theme: "dark", locale: "en" });
  });

  it("저장할 모양으로: 새 객체(나누지 않음), JSON에 없는 것은 빠진다", () => {
    const value = { a: 1, gone: undefined, list: [{ b: 2 }] };
    const copy = storableSettingsObject(value);
    expect(copy).toEqual({ a: 1, list: [{ b: 2 }] });
    expect(copy).not.toBe(value);
    expect(Object.hasOwn(copy ?? {}, "gone")).toBe(false);
    value.list[0] = { b: 3 };
    expect(copy).toEqual({ a: 1, list: [{ b: 2 }] });
  });

  it("4KB(UTF-8 4096바이트)까지 저장하고, 넘거나 JSON으로 못 바꾸면 null", () => {
    // {"s":"…"} = 8바이트 + 글자
    expect(storableSettingsObject({ s: "x".repeat(4096 - 8) })).not.toBeNull();
    expect(storableSettingsObject({ s: "x".repeat(4096 - 7) })).toBeNull();
    // 한글은 3바이트: 1362자 = 4086 + 8 = 4094바이트(통과), 1363자 = 4097바이트(넘음)
    expect(storableSettingsObject({ s: "가".repeat(1362) })).not.toBeNull();
    expect(storableSettingsObject({ s: "가".repeat(1363) })).toBeNull();
    expect(storableSettingsObject({ big: 1n })).toBeNull();
  });
});
