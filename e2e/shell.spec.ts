// 앱 뼈대 W1 화면 시험 — 화면 길·틀(ADR 2026-10-29-app-shell 1~3·10절, 계획 W1 통과 기준 10, W1 검토 지적 1~5·7~9).
// 시험 틀(e2e/helpers/)은 W5 것이다. "배치를 A로 바꾸면 … 남는다"·"4KB를 넘는 기기"는 W2(계정 설정 nav)와
// shell/shellPrefs.ts 전환(W1을 main 위로 옮길 때) 뒤에 통과한다 — 전환을 빠뜨리면 이 시험이 잡는다.
// 화면 문구 대신 틀의 표지(class·id·aria)와 주소로 본다(틀 파일은 W1 것: shell/*.tsx·*.css). 지도 화면의 표지(.map-screen,
// .map-heading)는 읽기만 한다. 더 많은 흐름(주소 14개·역할별 권한·배치 A 등 72개)은 저장소 밖 flows.cjs가 보던 것이다
// (작업 기록 docs/worklog/2026/10/29-2310-app-shell-w1.md·30-0120-app-shell-w1-review.md).
import type { Page } from "@playwright/test";
import { login } from "./helpers/auth.ts";
import { horizontalOverflow } from "./helpers/screen.ts";
import { deviceOptions, expect, test, watchDeviceErrors } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 지금 스크롤 위치 */
const scrollY = (page: Page): Promise<number> => page.evaluate(() => Math.round(window.scrollY));

/** 지금 초점 요소: body면 "body", 아니면 "태그#id.첫 class" */
const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "body";
    return `${element.tagName.toLowerCase()}#${element.id}.${element.classList[0] ?? ""}`;
  });

/** 기록 칸 상태(라우터가 history.state에 둔 순번·겹침) */
const entry = (page: Page): Promise<{ index: number; overlay: string | null }> =>
  page.evaluate(() => {
    const state: unknown = history.state;
    const index: unknown = typeof state === "object" && state !== null ? Reflect.get(state, "index") : null;
    const overlay: unknown =
      typeof state === "object" && state !== null ? Reflect.get(state, "overlay") : null;
    return {
      index: typeof index === "number" ? index : -1,
      overlay: typeof overlay === "string" ? overlay : null,
    };
  });

/** 틀 안 화면이 그려질 때까지(본문 제목) */
async function framed(page: Page): Promise<void> {
  await expect(page.locator(".frame #main h1")).toBeVisible();
}

/** 스크롤을 옮기고 그 값이 될 때까지 기다린다 */
async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await expect.poll(() => scrollY(page)).toBe(y);
}

const drawer = (page: Page) => page.locator("dialog.frame-drawer");

/** 키보드로 위 띠 ☰를 눌러 서랍을 연다 */
async function openDrawerByKeyboard(page: Page): Promise<void> {
  await page.locator(".topbar-menu").focus();
  await page.keyboard.press("Enter");
  await expect(drawer(page)).toHaveAttribute("open", "");
}

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("지도 2개를 주소로 바로 연다: 틀 숨김, 검색어 그대로, 초점 그대로, 전환은 바꾸기, [뒤로] = 부모(홈)", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/map/planet?planet-debug=cracks");
    await expect(page.locator(".map-screen")).toBeVisible();
    await expect(page.locator(".frame")).toHaveCount(0);
    await expect(page).toHaveURL(
      (url) => url.pathname === "/map/planet" && url.search === "?planet-debug=cracks",
    );
    // 처음 켤 때는 초점을 옮기지 않는다(ADR 37 1절, 검토 지적 5)
    expect(await focused(page)).toBe("body");
    const length = await page.evaluate(() => history.length);
    await page.locator(".map-switch-button").click();
    await expect(page).toHaveURL((url) => url.pathname === "/map");
    await expect(page.locator(".map-screen")).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(length);
    // 바로 연 주소의 [뒤로]: 앱이 쌓은 칸이 없으니 부모(홈)로 바꾼다
    await page.locator(".map-heading button").first().click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await framed(page);
    await page.goto("/map");
    await expect(page.locator(".map-screen")).toBeVisible();
    expect(await focused(page)).toBe("body");
    expect(deviceErrors).toEqual([]);
  });

  test("주소로 바로 연 /settings·/units는 초점을 옮기지 않는다(새로고침도)", async ({ page }) => {
    for (const path of ["/settings", "/units"]) {
      await page.goto(path);
      await framed(page);
      expect(await focused(page), path).toBe("body");
      await page.reload();
      await framed(page);
      expect(await focused(page), `${path} 새로고침`).toBe("body");
    }
  });

  test("서랍을 열고 닫아도 뒤 화면 스크롤이 그대로이고, 닫으면 초점이 ☰로 돌아온다(Esc·닫기 단추·바깥·뒤로)", async ({
    page,
  }) => {
    await page.goto("/settings");
    await framed(page);
    const closers: Record<string, () => Promise<void>> = {
      Esc: () => page.keyboard.press("Escape"),
      "닫기 단추": () => page.locator(".frame-drawer .side-close").click(),
      바깥: () => page.mouse.click(380, 400),
      "시스템 뒤로": async () => {
        await page.goBack();
      },
    };
    for (const [how, close] of Object.entries(closers)) {
      await scrollTo(page, 400);
      const before = await entry(page);
      await openDrawerByKeyboard(page);
      expect(await scrollY(page), `${how}: 연 동안`).toBe(400);
      expect(await entry(page)).toEqual({ index: before.index + 1, overlay: "drawer" });
      await close();
      await expect(drawer(page)).not.toHaveAttribute("open", "");
      await expect.poll(() => entry(page), how).toEqual(before);
      expect(await scrollY(page), `${how}: 닫은 뒤`).toBe(400);
      // 닫으면 <dialog>가 연 단추(☰)로 초점을 돌려준다(ADR 37 10절). 틀은 초점을 다시 옮기지 않는다
      expect(await page.locator(".topbar-menu").evaluate((el) => el === document.activeElement), how).toBe(
        true,
      );
    }
  });

  test("서랍에서 지금 화면을 다시 고르면 맨 위로, 다른 화면에 갔다 오면 화면마다 보던 곳", async ({
    page,
  }) => {
    await page.goto("/settings");
    await framed(page);
    await scrollTo(page, 400);
    await openDrawerByKeyboard(page);
    await drawer(page).locator('a.side-item[href="/settings"]').click();
    await expect(drawer(page)).not.toHaveAttribute("open", "");
    await expect.poll(() => scrollY(page)).toBe(0);
    // 설정 500 → 서랍으로 유닛 → 서랍으로 설정: 500(첫 단계 화면은 화면 ID마다 기억, ADR 37 1절)
    await scrollTo(page, 500);
    await openDrawerByKeyboard(page);
    await drawer(page).locator('a.side-item[href="/units"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/units");
    await framed(page);
    await openDrawerByKeyboard(page);
    await drawer(page).locator('a.side-item[href="/settings"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/settings");
    await expect.poll(() => scrollY(page)).toBe(500);
  });

  test("서랍을 연 채 새로고침하면 겹침 칸이 빠지고 서랍은 닫힌다. 앞으로 가기로 그 칸에 와도 다시 빠진다", async ({
    page,
  }) => {
    await page.goto("/");
    await framed(page);
    await page.locator('.tabbar a.tab[href="/units"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/units");
    await openDrawerByKeyboard(page);
    await page.reload();
    await framed(page);
    await expect.poll(() => entry(page)).toEqual({ index: 1, overlay: null });
    await expect(drawer(page)).not.toHaveAttribute("open", "");
    expect(await focused(page)).toBe("body");
    await page.goForward();
    await expect.poll(() => entry(page)).toEqual({ index: 1, overlay: null });
    await expect(drawer(page)).not.toHaveAttribute("open", "");
  });

  test("탭으로 홈에 돌아오면 홈에서 보던 곳, 지금 탭을 다시 누르면 맨 위로", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 300 });
    await page.goto("/");
    await framed(page);
    // 홈(W4 전에는 진단 화면)이 짧아도 내릴 수 있는 만큼(최대 40)
    const most = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(most).toBeGreaterThan(10);
    const seen = Math.min(40, most);
    await scrollTo(page, seen);
    await page.locator('.tabbar a.tab[href="/units"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/units");
    await page.locator('.tabbar a.tab[href="/"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await expect.poll(() => scrollY(page)).toBe(seen);
    expect((await entry(page)).index).toBe(0);
    await page.locator('.tabbar a.tab[href="/"]').click();
    await expect.poll(() => scrollY(page)).toBe(0);
  });

  test("본문에서 Shift+Tab으로 위 띠 단추에 초점이 가도 문서가 튀지 않는다", async ({ page }) => {
    await page.goto("/settings");
    await framed(page);
    await scrollTo(page, 400);
    await page.locator("#main h1").evaluate((el) => {
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    });
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await scrollY(page), await focused(page)).toBe(400);
    }
    expect(await focused(page)).toContain("topbar");
  });

  test("배치 C: 새 버전 배너와 본문 아래 여백이 가운데 지도 버튼을 피한다", async ({ page }) => {
    await page.goto("/units");
    await framed(page);
    await expect(page.locator("html")).toHaveAttribute("data-tabbar", "c");
    const geometry = await page.evaluate(() => {
      // 새 버전 배너를 연 모양으로(실제 갱신 흐름은 pwa/updates.ts — 여기서는 자리만 본다)
      const banner = document.querySelector<HTMLElement>(".update-banner");
      if (banner === null) return null;
      banner.dataset["open"] = "true";
      document.documentElement.setAttribute("data-update-banner", "");
      const box = banner.getBoundingClientRect();
      const map = document.querySelector(".tab-map-button")?.getBoundingClientRect();
      const heading = document.querySelector("#main h1");
      return map === undefined || heading === null
        ? null
        : {
            bannerBottom: box.bottom,
            mapTop: map.top,
            reserve: Number.parseFloat(getComputedStyle(heading).scrollMarginBottom),
            mapFromBottom: window.innerHeight - map.top,
          };
    });
    expect(geometry).not.toBeNull();
    if (geometry === null) return;
    expect(geometry.bannerBottom).toBeLessThanOrEqual(geometry.mapTop);
    expect(geometry.reserve).toBeGreaterThanOrEqual(geometry.mapFromBottom);
  });

  test("508px C 5칸: 남는 칸은 지도 오른쪽(앞 4칸 자리 그대로), 가로 넘침 없음", async ({ page }) => {
    await page.setViewportSize({ width: 508, height: 844 });
    await page.goto("/units");
    await framed(page);
    const sides = await page
      .locator(".tabbar .tabbar-side")
      .evaluateAll((els) =>
        els.map((el) => [...el.querySelectorAll("a")].map((a) => a.getAttribute("href"))),
      );
    expect(sides).toEqual([
      ["/", "/units"],
      ["/economy", "/faction", "/cyborg"],
    ]);
    expect(await horizontalOverflow(page)).toEqual([]);
  });

  test("배치를 A로 바꾸면 새로고침과 다른 기기에도 남는다(계정 설정 nav — W2, shellPrefs.ts 전환 뒤)", async ({
    page,
    browser,
    deviceErrors,
  }) => {
    await page.goto("/settings");
    await framed(page);
    await expect(page.locator(".tabbar")).toHaveAttribute("data-layout", "c");
    await page
      .locator("label.nav-layout-option")
      .filter({ has: page.locator('input[name="nav-layout"][value="a"]') })
      .click();
    await expect(page.locator(".tabbar")).toHaveAttribute("data-layout", "a");
    await page.reload();
    await framed(page);
    await expect(page.locator(".tabbar")).toHaveAttribute("data-layout", "a");
    // 두 번째 기기: 메뉴 묶음을 넣지 않아(null) 계정 값을 받는다(helpers/test.ts 머리 주석)
    const other = await browser.newContext({
      ...VIEWPORTS.phone,
      ...deviceOptions({ account: "player", nav: null }),
    });
    const otherErrors = watchDeviceErrors(other);
    const otherPage = await other.newPage();
    await expect(async () => {
      await otherPage.goto("/units");
      await expect(otherPage.locator(".tabbar")).toHaveAttribute("data-layout", "a", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await other.close();
    expect(otherErrors).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test.describe("메뉴 값이 계정 상한(4KB)을 넘는 기기", () => {
    // 더 새 버전이 넣은 칸(extra)이 커서 바꾼 값을 저장할 수 없다(W2 chooseNavigation이 false)
    test.use({ nav: { layout: "c", extra: "x".repeat(4_200) } });

    test("메뉴 순서를 옮기면 아무것도 바꾸지 않고 오류를 알린다", async ({ page }) => {
      await page.goto("/settings");
      await framed(page);
      const order = () =>
        page
          .locator("#nav-settings .nav-order-row .nav-order-name")
          .evaluateAll((els) => els.map((el) => el.textContent));
      const before = await order();
      await page.locator('#nav-settings .nav-order-move[data-item="home"][data-direction="down"]').click();
      await expect(page.locator('#nav-settings [role="alert"] .message-error')).toBeVisible();
      expect(await order()).toEqual(before);
      await expect(page.locator(".tabbar")).toHaveAttribute("data-layout", "c");
    });
  });

  test.describe("중간 폭(태블릿)", () => {
    test.use(VIEWPORTS.tablet);

    test("☰는 이름이 그대로이고 aria-expanded가 바뀌며 aria-controls가 레일을 가리킨다", async ({
      page,
    }) => {
      await page.goto("/units");
      await framed(page);
      const menu = page.locator(".topbar-menu");
      const name = await menu.getAttribute("aria-label");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      const controls = await menu.getAttribute("aria-controls");
      expect(controls).not.toBeNull();
      await expect(page.locator(`nav#${controls ?? "none"}`)).toHaveCount(1);
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      expect(await menu.getAttribute("aria-label")).toBe(name);
      await menu.click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    });
  });

  test.describe("넓은 폭(데스크톱)", () => {
    test.use({ ...VIEWPORTS.desktop, viewport: { width: 1440, height: 560 } });

    test("설정 화면에서 [메뉴 편집]을 누르면 메뉴 칸에 초점을 두고 보이게 한다", async ({ page }) => {
      await page.goto("/settings");
      await framed(page);
      await page.locator("a.side-edit").click();
      await expect.poll(() => focused(page)).toBe("section#nav-settings.settings-section");
      // 같은 화면을 다시 고른 것이라 부드럽게 스크롤한다(동작 줄이기가 아니면) → 멈출 때까지 기다린다
      const top = () =>
        page.locator("#nav-settings").evaluate((el) => Math.round(el.getBoundingClientRect().top));
      await expect.poll(top).toBeLessThan(560);
      expect(await top()).toBeGreaterThanOrEqual(0);
    });
  });
});

test.describe("관리자", () => {
  test.use({ account: "admin" });

  test("주소로 바로 연 /admin은 초점을 옮기지 않는다", async ({ page }) => {
    await page.goto("/admin");
    await framed(page);
    expect(await focused(page)).toBe("body");
  });
});

test("로그아웃 → 다른 계정: 홈이고 기록에 홈 한 칸(뒤로 = 앱을 떠남)", async ({ page }) => {
  // 로그아웃은 그 세션을 끝내므로 저장한 세션 대신 새로 들어간다(helpers/test.ts 머리 주석)
  await page.goto("/");
  await login(page, "admin");
  await framed(page);
  await page.locator('.tabbar a.tab[href="/units"]').click();
  await expect(page).toHaveURL((url) => url.pathname === "/units");
  await openDrawerByKeyboard(page);
  await drawer(page).locator('a.side-item[href="/admin"]').click();
  await expect(page).toHaveURL((url) => url.pathname === "/admin");
  await openDrawerByKeyboard(page);
  await drawer(page).locator("button.side-button").click();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await login(page, "player");
  await framed(page);
  await expect(page).toHaveURL((url) => url.pathname === "/");
  expect(await entry(page)).toEqual({ index: 0, overlay: null });
});
