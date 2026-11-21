// 개발자 영역 화면 시험 — ADR 2026-10-29-planet-editor-stage1 1절(개발자 도구 한곳, WP-H): 개발자 홈(/dev),
// 관리자 화면에서 옮긴 셰이더 측정(/dev/gpu-bench), 역할별 권한, 관리자 화면에 측정판이 없음.
// 여기서는 admin으로 연다(dev 계정으로 편집기를 여는 시험은 e2e/planet-editor.spec.ts). 행성 편집기 화면 자체도 그 파일이 본다.
// 화면 문구 대신 표지(class·id·주소)로 본다. 셰이더 측정은 WebGL2 + GLSL 하나만 골라 시작 → 바로 멈춤까지만 한다
// (전체 측정은 약 2분이고, 헤드리스 Chromium의 그리기는 소프트웨어라 숫자가 휴대폰과 다르다).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

const DEV_PATHS = [
  "/dev",
  "/dev/planet-editor",
  "/dev/star-system",
  "/dev/second-map",
  "/dev/tuning",
  "/dev/battle-replay",
  "/dev/gpu-bench",
] as const;

/** 틀 안 화면이 그려질 때까지(본문 제목) */
async function framed(page: Page): Promise<void> {
  await expect(page.locator(".frame #main h1")).toBeVisible();
}

/** 기록 칸의 겹침 표시(라우터가 history.state에 둔다). 서랍을 닫은 뒤 그 칸이 빠질 때까지 기다리는 데 쓴다 */
const overlayEntry = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const state: unknown = history.state;
    const overlay: unknown =
      typeof state === "object" && state !== null ? Reflect.get(state, "overlay") : null;
    return typeof overlay === "string" ? overlay : null;
  });

/** 개발자 홈의 도구 줄 */
const toolRow = (page: Page, path: string) => page.locator(`#main a.dev-tool[href="${path}"]`);

/** 셰이더 측정 화면이 그려질 때까지(방식 고르기 3개와 [측정 시작]) */
async function benchShown(page: Page): Promise<void> {
  await framed(page);
  await expect(page.locator("#main .bench-modes input[type='checkbox']")).toHaveCount(3);
  await expect(page.locator("#main .bench .button-primary")).toBeVisible();
}

test.describe("관리자", () => {
  test.use({ account: "admin" });

  test("서랍의 [개발자]로 개발자 홈을 열고, 도구 열한 줄에서 셰이더 측정을 연다. [뒤로]는 개발자 홈 → 홈", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/");
    await framed(page);
    await page.locator(".topbar-menu").click();
    const drawer = page.locator("dialog.frame-drawer");
    await expect(drawer).toHaveAttribute("open", "");
    await drawer.locator('a.side-item[href="/dev"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev");
    await framed(page);
    await expect(drawer).not.toHaveAttribute("open", "");
    // 도구 스물한 줄(2차맵 시험·지형 오브젝트는 /dev/terrain-objects 하나로 통합, /dev/second-map 주소도 같은 화면을 연다).
    // 운영 권한 부여(/dev/ops-grants)는 개발자만이라 관리자에게는 숨는다
    await expect(page.locator("#main a.dev-tool")).toHaveCount(21);
    await expect(page.locator("#main a.dev-tool .dev-tool-badge")).toHaveCount(0);
    for (const path of [
      "/dev/planet-editor",
      "/dev/star-system",
      "/dev/terrain-objects",
      "/dev/gather-objects",
      "/dev/npc-ai",
      "/dev/tuning",
      "/dev/balance",
      "/dev/secondary-stats",
      "/dev/exp-table",
      "/dev/skills",
      "/dev/items",
      "/dev/effects",
      "/dev/buildings",
      "/dev/production",
      "/dev/nations",
      "/dev/world-layout",
      "/dev/territory",
      "/dev/recruit",
      "/dev/battle-replay",
      "/dev/gpu-bench",
    ]) {
      await expect(toolRow(page, path).locator(".dev-tool-desc")).not.toBeEmpty();
    }
    // 사이드 메뉴의 [개발자]가 지금 화면이다
    await page.locator(".topbar-menu").click();
    await expect(drawer.locator('a.side-item[href="/dev"]')).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveAttribute("open", "");
    // 서랍 칸이 기록에서 빠진 뒤에 옮긴다(빠지는 동안 들어온 옮기기는 라우터가 무시한다)
    await expect.poll(() => overlayEntry(page)).toBeNull();

    await toolRow(page, "/dev/gpu-bench").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/gpu-bench");
    await benchShown(page);
    // 앱 안에서 쌓았으니 [뒤로]는 한 칸 돌아간다
    await page.locator("#main .back-button").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev");
    await expect(toolRow(page, "/dev/gpu-bench")).toBeVisible();
    await page.locator("#main .back-button").click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    expect(deviceErrors).toEqual([]);
  });

  test("행성 편집기 줄은 편집기 화면을 연다(틀 숨김, [뒤로]는 개발자 홈)", async ({ page }) => {
    await page.goto("/dev");
    await framed(page);
    await toolRow(page, "/dev/planet-editor").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/planet-editor");
    await expect(page.locator(".pe-screen")).toBeVisible();
    await expect(page.locator(".coming-soon")).toHaveCount(0);
    await expect(page.locator(".frame")).toHaveCount(0);
    await page.locator(".pe-back").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev");
  });

  test("주소로 바로 연 셰이더 측정: [뒤로]는 부모(개발자 홈)로 바꾼다", async ({ page }) => {
    await page.goto("/dev/gpu-bench");
    await benchShown(page);
    const length = await page.evaluate(() => history.length);
    await page.locator("#main .back-button").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev");
    await framed(page);
    expect(await page.evaluate(() => history.length)).toBe(length);
  });

  test("셰이더 측정: WebGL2 + GLSL만 골라 시작하면 측정 창이 뜨고, [멈춤]으로 닫히며 잰 데까지 요약이 나온다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev/gpu-bench");
    await benchShown(page);
    const modes = page.locator("#main .bench-modes input[type='checkbox']");
    // 둘째·셋째(TSL 방식)를 끈다: three/webgpu 조각(약 690kB)을 받지 않는다
    await modes.nth(1).uncheck();
    await modes.nth(2).uncheck();
    await expect(modes.nth(0)).toBeChecked();
    await page.locator("#main .bench .button-primary").click();
    const run = page.locator("dialog.bench-run");
    await expect(run).toHaveAttribute("open", "", { timeout: 20_000 });
    await expect(run.locator(".bench-hud p[role='status']")).not.toBeEmpty();
    await run.locator(".bench-hud button").click();
    await expect(run).not.toHaveAttribute("open", "", { timeout: 30_000 });
    await expect(page.getByTestId("gpu-bench-summary")).not.toBeEmpty();
    // 재는 동안 고르기를 막았다가 끝나면 다시 연다
    await expect(modes.nth(0)).toBeEnabled();
    expect(deviceErrors).toEqual([]);
  });

  // 버전 줄(사용자 요청 2026-11-15): 설정 → 앱 정보와 같은 줄이 개발자 홈 아래에도 보인다(settings/VersionRow.tsx)
  test("개발자 홈 아래에 앱·서버 빌드 시각·팩 판 버전 줄이 보인다", async ({ page }) => {
    await page.goto("/dev");
    const row = page.locator("#main .dev-version [data-part='version']");
    await expect(row).toHaveAttribute("data-state", "ok");
    await expect(row).toHaveAttribute("data-app-time", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await expect(row).toHaveAttribute("data-server-time", /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await expect(row.locator(".version-text")).toContainText("core@");
    expect(await horizontalOverflow(page)).toEqual([]);
  });

  test("관리자 화면에는 셰이더 측정판이 없다(계정·운영 기능만)", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("#admin-title")).toBeVisible();
    await expect(page.locator(".user-list")).toBeVisible();
    await expect(page.locator(".bench, .bench-modes, dialog.bench-run")).toHaveCount(0);
  });

  test.describe("좁은 폭(320px)", () => {
    test.use({ viewport: { width: 320, height: 640 } });

    for (const language of ["ko", "en"] as const) {
      test.describe(language, () => {
        test.use({ language });

        test(`개발자 홈·셰이더 측정: 가로 넘침 없음, 누르는 곳 44px (${language})`, async ({ page }) => {
          await page.goto("/dev");
          await framed(page);
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await page.goto("/dev/gpu-bench");
          await benchShown(page);
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
        });
      });
    }
  });

  // 사진(390px, 개발 화면 테마 둘 × 한국어·영어): E2E_SHOTS_DIR, 없으면 e2e/test-results/shots.
  // 개발 화면은 게임 테마와 상관없이 개발 화면 층(ADR 2026-11-02-dev-ui)의 테마를 쓴다
  for (const theme of ["neon", "light"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`사진 ${theme} ${language}`, () => {
        test.use({ devTheme: theme, language });

        test(`개발자 홈·셰이더 측정 390px (${theme}·${language})`, async ({ page }) => {
          await page.goto("/dev");
          await framed(page);
          await expect(page.locator("html")).toHaveAttribute("data-surface", "dev");
          await expect(page.locator("html")).toHaveAttribute("data-dev-theme", theme);
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `dev-home-390-${theme}-${language}`);
          await page.goto("/dev/gpu-bench");
          await benchShown(page);
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `dev-gpu-bench-390-${theme}-${language}`);
        });
      });
    }
  }
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("사이드 메뉴에 [개발자]가 없고, /dev·/dev/planet-editor·/dev/star-system·/dev/gpu-bench는 권한 없음 화면이다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/");
    await framed(page);
    await page.locator(".topbar-menu").click();
    const drawer = page.locator("dialog.frame-drawer");
    await expect(drawer).toHaveAttribute("open", "");
    await expect(drawer.locator('a.side-item[href="/settings"]')).toBeVisible();
    await expect(drawer.locator('a.side-item[href="/dev"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    // 서랍을 닫으면 라우터가 겹침 기록 칸을 뒤로 가기로 뺀다. 그 전에 주소를 열면 뒤로 가기가 나중에 들어 홈으로 돌아간다
    await expect(drawer).not.toHaveAttribute("open", "");
    await expect.poll(() => overlayEntry(page)).toBeNull();
    for (const path of DEV_PATHS) {
      await page.goto(path);
      await expect(page.locator("#no-permission-title"), path).toBeVisible();
      await expect(
        page.locator("#main a.dev-tool, #main .bench, .coming-soon, .pe-screen, .sml-screen, .tp-screen"),
        path,
      ).toHaveCount(0);
    }
    expect(deviceErrors).toEqual([]);
  });
});

// 범위 줄(docs/adr/2026-11-11-planet-scope.md): 개발·운영 화면마다 "어디에 반영되는가"가 머리에 보인다.
// 표는 화면 코드(apps/game/src/scope/scopeRoutes.ts)와 따로 적은 약속이다 — 화면의 범위를 바꾸면 여기도 바꾼다.
// 도구를 더하면 한 줄 더한다(줄이 없으면 그 화면은 이 시험 밖이다). 행성 고르기·주소 ?planet=은 e2e/planet-scope.spec.ts가 본다.
const TOOL_SCOPES = [
  ["/dev/tuning", "common"],
  ["/dev/balance", "common"],
  ["/dev/secondary-stats", "common"],
  ["/dev/exp-table", "common"],
  ["/dev/skills", "common"],
  ["/dev/items", "common"],
  ["/dev/effects", "common"],
  ["/dev/buildings", "common"],
  ["/dev/production", "common"],
  ["/dev/gather-tiers", "common"],
  ["/dev/creatures", "common"],
  ["/dev/nations", "common"],
  ["/dev/world-layout", "planet"],
  ["/dev/territory", "planet"],
  ["/dev/recruit", "planet"],
  ["/dev/second-map", "planet"],
  ["/dev/terrain-objects", "common"],
  ["/dev/gather-objects", "common"],
  ["/dev/planet-editor", "library"],
  ["/dev/star-system", "system"],
  ["/dev/battle-replay", "none"],
  ["/dev/gpu-bench", "none"],
  ["/dev/ops-grants", "none"],
  ["/ops", "planet"],
] as const;

test.describe("범위 줄", () => {
  test.describe("개발자", () => {
    test.use({ account: "dev" });

    test("개발 도구·운영자 콘솔마다 범위 줄이 하나 있고 종류가 맞다. 개발자 홈에는 없다", async ({
      page,
    }) => {
      test.slow();
      for (const [path, scope] of TOOL_SCOPES) {
        await page.goto(path);
        const bar = page.locator(".scope-bar");
        await expect(bar, path).toHaveCount(1, { timeout: 30_000 });
        await expect(bar, path).toHaveAttribute("data-scope", scope);
        await expect(bar.locator(".scope-label"), path).toBeVisible();
        if (scope === "planet") {
          // 행성 고르기: 플레이 행성이 하나여도 이름으로 보인다
          await expect(bar.locator(".scope-select"), path).toBeVisible();
          await expect(bar.locator(".scope-select option").first(), path).not.toBeEmpty();
        } else {
          await expect(bar.locator(".scope-chip").first(), path).toBeVisible();
          await expect(bar.locator(".scope-select"), path).toHaveCount(0);
        }
        await expect(bar.locator(".scope-note"), path).not.toBeEmpty();
      }
      await page.goto("/dev");
      await framed(page);
      await expect(page.locator(".scope-bar")).toHaveCount(0);
    });
  });

  test.describe("관리자", () => {
    test.use({ account: "admin" });

    test("관리자 화면: 행성과 무관(계정)", async ({ page }) => {
      await page.goto("/admin");
      await expect(page.locator(".scope-bar")).toHaveAttribute("data-scope", "none");
    });
  });
});
