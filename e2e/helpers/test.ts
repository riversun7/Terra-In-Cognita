// 화면 시험 쓰는 법 — 시험 파일(e2e/<줄기>.spec.ts)은 @playwright/test 대신 이 파일의 test·expect를 가져온다.
// 선택(test.use로 바꾼다)
// - account: 처음부터 로그인한 채 열 가짜 계정("player"·"admin", 기본 null = 로그인 안 함). 전역 준비가 저장한 세션이다.
//   세션은 시험끼리 함께 쓴다 → 로그아웃하는 시험은 account 대신 login()으로 새 세션을 만든다(helpers/auth.ts. 들어가기
//   시도 제한 때문에 login()은 로그인 자체를 볼 때만 쓴다).
// - theme·language: 기기 저장소에 미리 넣을 테마·언어(기본 pastel·ko, null = 넣지 않음). 맥락을 만들 때 한 번만 넣으므로
//   시험 안에서 바꾼 값은 새로고침해도 남는다. "로그인 전에 고른 값"으로 표시해서 로그인할 때 계정 값에 덮이지 않는다
//   (apps/game/src/settings/syncRules.ts). 그래서 앞 시험이 계정에 남긴 테마·언어가 다음 시험에 새지 않는다.
// - 화면 크기: test.use(VIEWPORTS.desktop) 등(helpers/viewports.ts, 기본 phone 390×844).
// 고정
// - baseURL: 전역 준비가 켠 서버. page.goto("/units")처럼 경로만 쓴다.
// - deviceErrors: 기기 오류(잡히지 않은 오류, console.error, 오류 보고 전송)를 모은다. 보는 시험이 expect(…).toEqual([]).
// 그 밖: 넘침·누르는 곳·사진은 helpers/screen.ts, 두 번째 기기는 아래 deviceOptions·watchDeviceErrors.
import { type BrowserContext, type BrowserContextOptions, test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { type AccountName, harness } from "./harness.ts";

export { expect };

/** 테마 4개(ADR 2026-10-28-design-system). 사진은 기본 둘(pastel·dark)만 찍는다 */
export type Theme = "pastel" | "dark" | "contrast" | "station";
export type Language = "ko" | "en";

/** 기기 저장소 열쇠 — 앱과 같아야 한다: apps/game/src/settings/storage.ts(SETTINGS_STORAGE_KEY, 판 1), Paraglide 기본 열쇠 */
const SETTINGS_KEY = "terra.settings";
const PARAGLIDE_KEY = "PARAGLIDE_LOCALE";
/** 기기 오류 보고 경로 — packages/protocol/src/telemetry.ts의 TELEMETRY_PATHS.errors */
const ERROR_REPORT_PATH = "/api/telemetry/errors";

export interface DeviceOptions {
  account: AccountName | null;
  theme: Theme | null;
  language: Language | null;
}

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

/** 맥락의 처음 저장 상태: 계정 세션 쿠키 + 기기 저장소의 테마·언어 */
function startState({ account, theme, language }: DeviceOptions, baseURL: string): StorageState {
  let cookies: Cookie[] = [];
  if (account) {
    const file = harness().accounts[account].storageState;
    const saved: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isCookieFile(saved)) throw new Error(`세션 파일 모양이 틀렸습니다: ${file}`);
    cookies = saved.cookies;
  }
  const localStorage: { name: string; value: string }[] = [];
  if (theme !== null || language !== null) {
    // 앱 기기 저장 모양(판 1). "올릴 것" 표시의 by: null = 로그인 전에 이 기기에서 고름
    const pending = {
      ...(theme === null ? {} : { appearance: { by: null } }),
      ...(language === null ? {} : { locale: { by: null } }),
    };
    const settings = { v: 1, theme, followSystem: false, locale: language, pending };
    localStorage.push({ name: SETTINGS_KEY, value: JSON.stringify(settings) });
  }
  if (language !== null) localStorage.push({ name: PARAGLIDE_KEY, value: language });
  return { cookies, origins: localStorage.length > 0 ? [{ origin: baseURL, localStorage }] : [] };
}

/**
 * 새 기기(브라우저 맥락) 설정 — 시험 기본 맥락과 같은 규칙. 두 번째 기기를 흉내 낼 때:
 * `const other = await browser.newContext({ ...VIEWPORTS.phone, ...deviceOptions({ account: "admin" }) })`
 */
export function deviceOptions(options: Partial<DeviceOptions> = {}): BrowserContextOptions {
  const { baseURL } = harness();
  const device: DeviceOptions = {
    account: options.account ?? null,
    theme: options.theme === undefined ? "pastel" : options.theme,
    language: options.language === undefined ? "ko" : options.language,
  };
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
  theme: ["pastel", { option: true }],
  language: ["ko", { option: true }],
  // 시험 틀이 켠 서버 주소(빈 포트라 실행마다 다르다).
  // Playwright는 고정물 함수의 첫 인자 구조 분해로 기대는 고정물을 읽는다 → 기대는 것이 없으면 {}여야 한다
  // oxlint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    await use(harness().baseURL);
  },
  locale: async ({ language }, use) => {
    await use(browserLocale(language));
  },
  storageState: async ({ account, theme, language }, use) => {
    await use(startState({ account, theme, language }, harness().baseURL));
  },
  deviceErrors: [
    async ({ context }, use) => {
      await use(watchDeviceErrors(context));
    },
    { auto: true },
  ],
});
