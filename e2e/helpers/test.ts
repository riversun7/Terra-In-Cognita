// 화면 시험 쓰는 법 — 시험 파일(e2e/<줄기>.spec.ts)은 @playwright/test 대신 이 파일의 test·expect를 가져온다.
// 선택(test.use로 바꾼다)
// - account: 처음부터 로그인한 채 열 가짜 계정("player"·"dev"·"admin", 기본 null = 로그인 안 함). 전역 준비가 저장한 세션이다.
//   세션은 시험끼리 함께 쓴다 → 로그아웃하는 시험은 account 대신 login()으로 새 세션을 만든다(helpers/auth.ts. 들어가기
//   시도 제한 때문에 login()은 로그인 자체를 볼 때만 쓴다).
// - preview: 시안 자료 보기를 켠 계정(기기 저장소 terra.preview, 기본 null = 꺼짐). 그 계정으로 로그인해 있고 dev·admin일 때만
//   켜진다(apps/game/src/inbox/preview.ts). 켜면 처리할 일·복귀 요약을 시안 자료로 묻고, 복귀 요약이 앱을 켤 때마다 뜬다.
//   보통 account와 같은 계정을 준다(test.use({ account: "dev", preview: "dev" })). login()으로 들어갈 계정을 미리 줘도 된다.
// - theme·language·nav·home: 기기 저장소에 미리 넣을 설정 묶음(기본 pastel·ko·{}·{}, null = 넣지 않음).
//   "로그인 전에 이 기기에서 고른 값"으로 표시하므로 로그인할 때(저장한 세션으로 열 때 포함) 기기 값이 계정에 올라간다
//   (apps/game/src/settings/syncRules.ts 규칙 1). 그래서 기본값이면 시험마다 계정 설정이 되돌아간다: 파스텔, 한국어,
//   메뉴·홈은 기본({}는 parseNavigation·parseHome이 기본값으로 읽는다). null인 묶음은 앞 시험이 계정에 남긴 값이 온다.
//   처음부터 다른 값으로 시작하려면 그 값을 준다(예: test.use({ nav: { layout: "a" } })).
//   맥락을 만들 때 한 번만 넣으므로 시험 안에서 바꾼 값은 새로고침해도 남는다.
// - devTheme: 개발·관리자 화면의 테마("neon"·"light", 기본 null = 넣지 않음 → 앱 기본 네온 다크). 기기 저장소 terra.devTheme에
//   넣는다(apps/game/src/shell/devSurface.ts의 DEV_THEME_STORAGE_KEY와 같아야 한다). 개발 화면은 게임 테마(theme)를 보지 않는다
//   (ADR 2026-11-02-dev-ui) → 개발·관리자 화면 사진은 theme 대신 devTheme 둘(neon·light)로 찍는다.
// - 화면 크기: test.use(VIEWPORTS.desktop) 등(helpers/viewports.ts, 기본 phone 390×844).
// 고정
// - baseURL: 전역 준비가 켠 서버. page.goto("/units")처럼 경로만 쓴다.
// - deviceErrors: 기기 오류(잡히지 않은 오류, console.error, 오류 보고 전송)를 모은다. 보는 시험이 expect(…).toEqual([]).
// 시험끼리 함께 쓰는 것: 작업자 하나가 시험 파일을 차례로 돌리고, 한 실행에 계정은 player·dev·admin 하나씩이다.
// - 계정 세션(쿠키), 계정 설정 중 null로 준 묶음, 서버의 시도 제한(들어가기: 아이디마다 15분에 10번·주소마다 분당 10번,
//   행성 목록 정보: 사용자마다 분당 60번). 서버를 켤 때마다 처음부터다. 들어가기는 전역 준비가 계정마다 한 번(3번) 쓴다.
// - 기기 저장소(localStorage·sessionStorage)와 쿠키 상자는 맥락(시험)마다 새로 만든다.
// - 다른 기기에도 남는지 보는 시험은 두 번째 기기(deviceOptions)에 보는 묶음을 null로 준다. 그러지 않으면 두 번째 기기가
//   로그인하며 계정 값을 기본으로 되돌린다.
// 그 밖: 넘침·누르는 곳·사진은 helpers/screen.ts, 화면 문구는 helpers/messages.ts, tRPC 요청 보기·응답 바꾸기는
// helpers/trpc.ts, 두 번째 기기는 아래 deviceOptions·watchDeviceErrors.
import { type BrowserContext, type BrowserContextOptions, test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { type AccountName, harness } from "./harness.ts";

export { expect };

/** 테마 4개(ADR 2026-10-28-design-system). 사진은 기본 둘(pastel·dark)만 찍는다 */
export type Theme = "pastel" | "dark" | "contrast" | "station";
/** 개발 화면 층의 테마 둘(ADR 2026-11-02-dev-ui) */
export type DevTheme = "neon" | "light";
/** 개발 화면 테마 기기 저장 열쇠 — apps/game/src/shell/devSurface.ts의 DEV_THEME_STORAGE_KEY와 같아야 한다 */
const DEV_THEME_KEY = "terra.devTheme";
export type Language = "ko" | "en";
/** 메뉴(nav)·홈(home) 설정 값: 모양을 모르는 JSON 객체(@terra/shared의 SettingsObject와 같은 모양) */
export type SettingsObject = { readonly [key: string]: unknown };

/**
 * 기기 저장소 — 앱과 같아야 한다: apps/game/src/settings/storage.ts(SETTINGS_STORAGE_KEY, 판 1, 묶음 이름 SETTINGS_GROUPS),
 * Paraglide 기본 열쇠
 */
const SETTINGS_KEY = "terra.settings";
const PARAGLIDE_KEY = "PARAGLIDE_LOCALE";
/** 시안 자료 보기 표시 — apps/game/src/inbox/preview.ts의 STORAGE_KEY·MARK_VERSION과 같아야 한다({ v: 1, user: 계정 ID }) */
const PREVIEW_KEY = "terra.preview";
const PREVIEW_MARK_VERSION = 1;
/** 기기 오류 보고 경로 — packages/protocol/src/telemetry.ts의 TELEMETRY_PATHS.errors */
const ERROR_REPORT_PATH = "/api/telemetry/errors";

export interface DeviceOptions {
  account: AccountName | null;
  /** 시안 자료 보기를 켠 계정(머리 주석). null = 꺼짐 */
  preview: AccountName | null;
  theme: Theme | null;
  /** 개발·관리자 화면 테마(머리 주석). null = 넣지 않음 */
  devTheme: DevTheme | null;
  language: Language | null;
  nav: SettingsObject | null;
  home: SettingsObject | null;
}

/** 설정 묶음의 기본값(account·preview 제외) — 시험 기본 맥락과 deviceOptions가 같이 쓴다 */
const DEFAULT_SETTINGS = {
  theme: "pastel",
  devTheme: null,
  language: "ko",
  nav: {},
  home: {},
} as const satisfies Omit<DeviceOptions, "account" | "preview">;

export interface DeviceError {
  kind: "uncaught" | "console" | "report";
  text: string;
}

type StorageState = Exclude<NonNullable<BrowserContextOptions["storageState"]>, string>;
type Cookie = StorageState["cookies"][number];

function isCookieFile(value: unknown): value is { cookies: Cookie[] } {
  return typeof value === "object" && value !== null && Array.isArray(Reflect.get(value, "cookies"));
}

/** 브라우저 언어(navigator.language) — 앱 언어와 맞춘다. 넣지 않으면 한국어 기기 */
const browserLocale = (language: Language | null): string => (language === "en" ? "en-US" : "ko-KR");

/** 맥락의 처음 저장 상태: 계정 세션 쿠키 + 기기 저장소의 설정 묶음·시안 자료 표시 */
function startState(
  { account, preview, theme, devTheme, language, nav, home }: DeviceOptions,
  baseURL: string,
): StorageState {
  let cookies: Cookie[] = [];
  if (account) {
    const file = harness().accounts[account].storageState;
    const saved: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isCookieFile(saved)) throw new Error(`세션 파일 모양이 틀렸습니다: ${file}`);
    cookies = saved.cookies;
  }
  const localStorage: { name: string; value: string }[] = [];
  // 넣는 묶음마다 "올릴 것" 표시. by: null = 로그인 전에 이 기기에서 고름
  const pending = {
    ...(theme === null ? {} : { appearance: { by: null } }),
    ...(language === null ? {} : { locale: { by: null } }),
    ...(nav === null ? {} : { nav: { by: null } }),
    ...(home === null ? {} : { home: { by: null } }),
  };
  if (Object.keys(pending).length > 0) {
    // 앱 기기 저장 모양(판 1). theme·locale이 null이면 "정하지 않음"이다(저장하지 않은 것과 같다)
    const settings = {
      v: 1,
      theme,
      followSystem: false,
      locale: language,
      ...(nav === null ? {} : { nav }),
      ...(home === null ? {} : { home }),
      pending,
    };
    localStorage.push({ name: SETTINGS_KEY, value: JSON.stringify(settings) });
  }
  if (language !== null) localStorage.push({ name: PARAGLIDE_KEY, value: language });
  if (devTheme !== null) localStorage.push({ name: DEV_THEME_KEY, value: devTheme });
  if (preview !== null) {
    const user = harness().accounts[preview].userId;
    localStorage.push({ name: PREVIEW_KEY, value: JSON.stringify({ v: PREVIEW_MARK_VERSION, user }) });
  }
  return { cookies, origins: localStorage.length > 0 ? [{ origin: baseURL, localStorage }] : [] };
}

/**
 * 새 기기(브라우저 맥락) 설정 — 시험 기본 맥락과 같은 규칙(적지 않은 묶음은 기본값 = 로그인하며 계정 설정을 되돌린다).
 * 두 번째 기기를 흉내 낼 때: `const other = await browser.newContext({ ...VIEWPORTS.phone, ...deviceOptions({ account: "admin" }) })`.
 * 첫 기기에서 바꾼 홈이 두 번째 기기에도 보이는지 볼 때는 `deviceOptions({ account: "player", home: null })`.
 */
export function deviceOptions(options: Partial<DeviceOptions> = {}): BrowserContextOptions {
  const { baseURL } = harness();
  const device: DeviceOptions = { account: null, preview: null, ...DEFAULT_SETTINGS, ...options };
  return { baseURL, locale: browserLocale(device.language), storageState: startState(device, baseURL) };
}

/** 맥락의 기기 오류를 모으기 시작한다(그 맥락의 모든 화면). 돌려준 배열에 쌓인다 */
export function watchDeviceErrors(context: BrowserContext): DeviceError[] {
  const errors: DeviceError[] = [];
  context.on("weberror", (webError) => {
    const error = webError.error();
    errors.push({ kind: "uncaught", text: `${error.name}: ${error.message}` });
  });
  context.on("console", (message) => {
    if (message.type() !== "error") return;
    const { url, lineNumber } = message.location();
    errors.push({ kind: "console", text: url ? `${message.text()} (${url}:${lineNumber})` : message.text() });
  });
  context.on("request", (request) => {
    if (new URL(request.url()).pathname !== ERROR_REPORT_PATH) return;
    // sendBeacon 본문(Blob)은 Playwright가 읽지 못할 때가 있다(그 오류는 위 두 갈래에도 잡힌다)
    const body = request.postDataBuffer()?.toString("utf8") ?? "";
    errors.push({ kind: "report", text: body === "" ? `${request.method()} ${ERROR_REPORT_PATH}` : body });
  });
  return errors;
}

export const test = base.extend<DeviceOptions & { deviceErrors: DeviceError[] }>({
  account: [null, { option: true }],
  preview: [null, { option: true }],
  theme: [DEFAULT_SETTINGS.theme, { option: true }],
  devTheme: [DEFAULT_SETTINGS.devTheme, { option: true }],
  language: [DEFAULT_SETTINGS.language, { option: true }],
  nav: [DEFAULT_SETTINGS.nav, { option: true }],
  home: [DEFAULT_SETTINGS.home, { option: true }],
  // 시험 틀이 켠 서버 주소(빈 포트라 실행마다 다르다).
  // Playwright는 고정물 함수의 첫 인자 구조 분해로 기대는 고정물을 읽는다 → 기대는 것이 없으면 {}여야 한다
  // oxlint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    await use(harness().baseURL);
  },
  locale: async ({ language }, use) => {
    await use(browserLocale(language));
  },
  storageState: async ({ account, preview, theme, devTheme, language, nav, home }, use) => {
    await use(startState({ account, preview, theme, devTheme, language, nav, home }, harness().baseURL));
  },
  deviceErrors: [
    async ({ context }, use) => {
      await use(watchDeviceErrors(context));
    },
    { auto: true },
  ],
});
