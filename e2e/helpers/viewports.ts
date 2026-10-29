// 화면 시험 크기 — ADR 2026-10-29-app-shell 13절: 390×844(DPR 3, 터치), 844×390, 820×1180, 1440×900.
// 설정(playwright.config.ts)의 기본은 phone이다. 다른 크기는 시험 파일에서 test.use(VIEWPORTS.desktop)처럼 바꾼다.
// 폭 단계(ADR 3절): 좁음 < 600px(phone), 중간 600~1023px(phoneLandscape·tablet), 넓음 ≥ 1024px(desktop).
// 이 파일은 설정 파일이 가져오므로 @playwright/test의 값(test 등)을 가져오지 않는다.

export interface ViewportPreset {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export const VIEWPORTS = {
  /** 휴대폰 세로(기본) */
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  /** 휴대폰 가로 — 폭 단계는 중간(레일) */
  phoneLandscape: {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  /** 태블릿 세로 — 폭 단계는 중간 */
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  /** 데스크톱 — 폭 단계는 넓음(하단 탭 없음) */
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
} as const satisfies Record<string, ViewportPreset>;

export type ViewportName = keyof typeof VIEWPORTS;
