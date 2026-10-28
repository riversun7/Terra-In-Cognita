import { describe, expect, it } from "vitest";
import {
  type DeviceSettings,
  EMPTY_DEVICE_SETTINGS,
  parseDeviceSettings,
  serializeDeviceSettings,
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
