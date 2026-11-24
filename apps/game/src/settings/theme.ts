// 테마 고르기 규칙 — 순수 함수(시험 대상). <html>에 거는 일은 settings.ts가 한다.
// 첫 화면 전에 도는 public/theme-init.js도 같은 규칙·색을 따로 갖고 있다 → themeSources.test.ts가 같은지 본다.
// 결정: docs/adr/2026-10-28-design-system.md "처음 테마와 기기 설정"
// - 정한 테마가 없으면 파스텔. 단, 기기가 고대비를 요청하면 선명.
// - "기기 설정에 맞추기"를 켜면 기기를 따른다: 고대비면 선명, 다크면 다크, 아니면 파스텔. 정거장은 자동으로 고르지 않는다.
import { DEFAULT_THEME, type Theme } from "@terra/shared";

/** 테마별 바탕색 = 주소창 색(<meta name="theme-color">). styles/tokens.css의 --color-bg와 같다(시험이 확인) */
export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  pastel: "#eef2f7",
  dark: "#070d14",
  contrast: "#ffffff",
  station: "#05050c",
};

/** 기기 설정을 읽는 미디어 쿼리 */
export const CONTRAST_QUERY = "(prefers-contrast: more)";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 기기(운영체제·브라우저)가 요청하는 화면 */
export interface DevicePreferences {
  /** 고대비(prefers-contrast: more) */
  contrastMore: boolean;
  /** 다크 모드(prefers-color-scheme: dark) */
  dark: boolean;
}

/** 사용자가 고른 것 */
export interface ThemeChoice {
  theme: Theme | null;
  followSystem: boolean;
}

/** 지금 화면에 걸 테마 */
export function resolveTheme(choice: ThemeChoice, device: DevicePreferences): Theme {
  if (choice.followSystem) {
    if (device.contrastMore) return "contrast";
    return device.dark ? "dark" : DEFAULT_THEME;
  }
  if (choice.theme !== null) return choice.theme;
  return device.contrastMore ? "contrast" : DEFAULT_THEME;
}
