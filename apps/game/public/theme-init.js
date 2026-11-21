// 테마 시작 스크립트 — index.html <head>에서 CSS보다 먼저 돈다. 첫 화면이 다른 색으로 번쩍이지 않게
// <html data-theme>와 주소창 색(<meta name="theme-color">)을 정한다. ADR 2026-10-28-design-system
// - 인라인 스크립트는 쓰지 않는다(나중에 넣을 콘텐츠 보안 정책). 앱 껍데기로 미리 캐시한다(vite.config.ts includeAssets).
// - 규칙·색·저장 모양은 src/settings/theme.ts·storage.ts와 같아야 한다 → src/settings/themeSources.test.ts가 확인한다.
// - 빌드하지 않고 그대로 내보내는 파일이다. 지원 하한(iOS 16.4) 브라우저가 바로 읽는 문법만 쓴다.
(() => {
  "use strict";
  const STORAGE_KEY = "terra.settings";
  const THEME_COLORS = { pastel: "#eef2f7", dark: "#0b0f19", contrast: "#ffffff", station: "#05050c" };
  let theme = null;
  let followSystem = false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved !== null && typeof saved === "object" && saved.v === 1) {
      if (typeof saved.theme === "string" && Object.hasOwn(THEME_COLORS, saved.theme)) theme = saved.theme;
      followSystem = saved.followSystem === true;
    }
  } catch {
    // 저장소를 못 쓰거나(개인 정보 보호 모드 등) 값이 깨졌으면 정하지 않은 것으로 본다
  }
  let contrastMore = false;
  let dark = false;
  try {
    contrastMore = window.matchMedia("(prefers-contrast: more)").matches;
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    // matchMedia가 없으면 기기 설정을 모르는 것으로 본다
  }
  // 정한 테마가 없으면 파스텔(기기가 고대비를 요청하면 선명). 기기 설정에 맞추기: 고대비 → 선명, 다크 → 다크. 정거장은 자동으로 고르지 않는다
  let effective = theme ?? (contrastMore ? "contrast" : "pastel");
  if (followSystem) effective = contrastMore ? "contrast" : dark ? "dark" : "pastel";
  document.documentElement.setAttribute("data-theme", effective);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[effective]);
})();
