import { THEMES } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type DevicePreferences, resolveTheme } from "./theme.ts";

const plain: DevicePreferences = { contrastMore: false, dark: false };
const dark: DevicePreferences = { contrastMore: false, dark: true };
const contrast: DevicePreferences = { contrastMore: true, dark: false };
const darkContrast: DevicePreferences = { contrastMore: true, dark: true };

describe("resolveTheme", () => {
  it("정한 테마가 없으면 늘 파스텔 — 기기가 다크여도", () => {
    const unset = { theme: null, followSystem: false };
    expect(resolveTheme(unset, plain)).toBe("pastel");
    expect(resolveTheme(unset, dark)).toBe("pastel");
  });

  it("정한 테마가 없을 때 기기가 고대비를 요청하면 선명만 자동으로", () => {
    const unset = { theme: null, followSystem: false };
    expect(resolveTheme(unset, contrast)).toBe("contrast");
    expect(resolveTheme(unset, darkContrast)).toBe("contrast");
  });

  it("고른 테마는 기기 설정과 상관없이 그대로", () => {
    for (const theme of THEMES) {
      for (const device of [plain, dark, contrast, darkContrast]) {
        expect(resolveTheme({ theme, followSystem: false }, device)).toBe(theme);
      }
    }
  });

  it("기기 설정에 맞추기: 고대비 → 선명, 다크 → 다크, 아니면 파스텔(고른 테마는 무시)", () => {
    for (const theme of [null, ...THEMES]) {
      const follow = { theme, followSystem: true };
      expect(resolveTheme(follow, plain)).toBe("pastel");
      expect(resolveTheme(follow, dark)).toBe("dark");
      expect(resolveTheme(follow, contrast)).toBe("contrast");
      expect(resolveTheme(follow, darkContrast)).toBe("contrast");
    }
  });

  it("정거장은 자동으로 고르지 않는다", () => {
    for (const device of [plain, dark, contrast, darkContrast]) {
      expect(resolveTheme({ theme: null, followSystem: false }, device)).not.toBe("station");
      expect(resolveTheme({ theme: "station", followSystem: true }, device)).not.toBe("station");
    }
  });
});
