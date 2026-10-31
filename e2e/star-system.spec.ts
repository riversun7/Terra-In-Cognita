// 항성계 편집기 화면 시험 — ADR 2026-10-31-star-system-editor: /dev/star-system(틀 숨김, dev·admin).
// - admin: [새 항성계] → 궤도 넷(보관함 행성·소행성대·우주 구조물 자리·빈 자리) → [저장] 판 1. 행성 궤도 카드의 제안 기온
//   (태양형 0.9 AU = 생명 가능 지대 안쪽 → 빛 1.23배 → 지구 기준 +7°C = 적도 34°C·극 −17°C) → [제안 적용] → 행성 편집기가 그 행성을 열고
//   저장하지 않은 작업 사본(적도 34·극 −17)을 보인다. 서버 행성은 바뀌지 않는다(판 그대로).
// - dev: admin이 만든 항성계를 보고(만든 사람 표시) 고쳐 저장한다. [항성계 지우기]는 없다. player: 권한 없음 화면.
// 보관함 행성은 시험 준비로 tRPC를 화면 안에서 불러 만든다(행성 편집기 화면 시험은 planet-editor.spec.ts가 본다).
// 실행마다 새 DB라 항성계 목록은 빈 채로 시작한다(admin 시험이 먼저 돈다, workers 1).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const PLANET_NAME = "골디락스 시험 행성";
const SYSTEM_NAME = "골디락스 시험 항성계";

/** 화면 안에서 tRPC를 불러 보관함 행성을 만든다(편집 전용 행성 정의 그대로). 행성 ID */
async function createLibraryPlanet(page: Page, name: string): Promise<string> {
  return page.evaluate(async (planetName) => {
    // 이 함수는 브라우저에서 돈다(바깥 함수를 쓸 수 없다)
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const field = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    const definitions: unknown = await (await fetch("/api/trpc/planetEditor.definitions")).json();
    const planets = field(field(field(definitions, "result"), "data"), "planets");
    const base = Array.isArray(planets)
      ? planets.find((planet: unknown) => field(planet, "id") === "s2_editor_planet")
      : undefined;
    const response = await fetch("/api/trpc/planetEditor.library.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: planetName,
        base: { kind: "pack", id: "s2_editor_planet" },
        definition: field(base, "entry"),
      }),
    });
    const id = field(field(field(await response.json(), "result"), "data"), "id");
    if (typeof id !== "string") throw new Error(`보관함 행성을 만들지 못했습니다: ${response.status}`);
    return id;
  }, name);
}

/** 이름 창에 이름을 넣고 확인한다 */
async function answerName(page: Page, name: string): Promise<void> {
  const dialog = page.locator("dialog.pe-prompt[open]");
  await expect(dialog).toHaveCount(1);
  await dialog.locator(".pe-name-input").fill(name);
  await dialog.locator(".pe-prompt-confirm").click();
  await expect(page.locator("dialog.pe-prompt[open]")).toHaveCount(0);
}

/** 확인 창(이름 창 아님)의 확인 단추 */
const confirmButton = (page: Page) =>
  page.locator("dialog.pe-dialog:not(.pe-prompt)[open] .form-actions button.button-primary");

/** 고른 궤도의 거리를 글로 넣고 Enter */
async function setDistance(page: Page, au: string): Promise<void> {
  const input = page.locator(".ss-orbit[data-selected] .ss-distance");
  await input.fill(au);
  await input.press("Enter");
}

/** 항성계 화면이 열려 항성계 하나를 보일 때까지 */
async function systemShown(page: Page): Promise<void> {
  await page.goto("/dev/star-system");
  await expect(page.locator(".ss-toolbar .ss-name")).toBeVisible({ timeout: 20_000 });
}

/** 본문이 화면 폭을 넘지 않는지(머리 줄·이름 줄·판) */
async function boxOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const box of document.querySelectorAll<HTMLElement>(".pe-header, .ss-toolbar, .ss-main, .ss-side")) {
      if (box.scrollWidth > box.clientWidth + 1) {
        problems.push(`${box.className} ${box.scrollWidth}px > ${box.clientWidth}px`);
      }
    }
    return problems;
  });
}

test.describe("관리자", () => {
  test.use({ account: "admin" });

  test("[새 항성계] → 궤도 넷 → [저장] 판 1, 행성 궤도의 제안 기온 → [제안 적용] → 행성 편집기에 저장 안 한 작업 사본", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/dev/star-system");
    await expect(page.locator(".ss-screen")).toBeVisible();
    // 새 DB: 빈 목록 → 빈 화면의 [새 항성계]
    await expect(page.locator(".pe-empty .ss-new-empty")).toBeVisible({ timeout: 20_000 });
    const planetId = await createLibraryPlanet(page, PLANET_NAME);
    // 보관함 목록을 다시 받게 다시 연다
    await page.reload();
    await page.locator(".pe-empty .ss-new-empty").click();
    await answerName(page, SYSTEM_NAME);
    await expect(page.locator(".ss-toolbar .ss-name")).toHaveText(SYSTEM_NAME);
    await expect(page.locator(".ss-save")).toBeEnabled();

    // 궤도 1: 생명 가능 지대 가운데에 생긴다 → 0.9 AU, 보관함 행성
    await page.locator(".ss-add-orbit").click();
    await expect(page.locator(".ss-orbit")).toHaveCount(1);
    await setDistance(page, "0.9");
    await expect(page.locator(".ss-orbit[data-selected] .ss-orbit-pick")).toContainText("0.9 AU");
    await page.locator(".ss-orbit[data-selected] .ss-kind").selectOption("planet");
    await page.locator(".ss-orbit[data-selected] .ss-planet").selectOption(planetId);
    await expect(page.locator(".ss-orbit[data-selected] .ss-orbit-pick")).toContainText(PLANET_NAME);
    // 궤도 2~4: 소행성대·우주 구조물 자리·빈 자리(바깥으로 1.6배씩)
    for (const kind of ["asteroid_belt", "structure", "empty"]) {
      await page.locator(".ss-add-orbit").click();
      await page.locator(".ss-orbit[data-selected] .ss-kind").selectOption(kind);
    }
    await expect(page.locator(".ss-orbit")).toHaveCount(4);
    await expect(page.locator(".ssv-body")).toHaveCount(4);
    await expect(page.locator(".ssv-hz")).toHaveCount(1);

    // 그림의 행성(궤도 1)을 누르면 카드: 지대 안쪽(0.9 AU < 0.99 AU, 더움), 제안 기온 적도 34°C·극 −17°C
    await page.locator('.ssv-body[data-kind="planet"]').click();
    const card = page.locator(".ss-card");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-zone", "hot");
    await expect(card.locator("[data-testid='ss-suggest-temps']")).toContainText("34");
    await expect(card.locator("[data-testid='ss-suggest-temps']")).toContainText("-17");

    // [저장]: 새 항성계를 만든다(판 1)
    await page.locator(".ss-save").click();
    await expect(page.locator(".ss-meta")).toContainText("1", { timeout: 20_000 });
    await expect(page.locator(".ss-save")).toBeDisabled();
    await expect(page.locator(".ss-remove")).toBeVisible();

    // [제안 적용] → 확인 창 → [행성 편집기에서 열기]
    await card.locator(".ss-card-actions .button-primary").click();
    await confirmButton(page).click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/planet-editor");
    await expect(page.locator(".pe-save-chip")).toHaveAttribute("data-save-status", "dirty", {
      timeout: 45_000,
    });
    await expect(page.locator('input.pe-range[data-key="equatorTemperatureC"]')).toHaveValue("34");
    await expect(page.locator('input.pe-range[data-key="poleTemperatureC"]')).toHaveValue("-17");
    // 서버의 행성은 그대로(판 1)
    await expect(page.locator(".pe-library-info [data-revision]")).toHaveAttribute("data-revision", "1");
    expect(deviceErrors).toEqual([]);
  });

  test("항성계 고르기는 저장한 항성계를 다시 연다(정의·이름 그대로)", async ({ page }) => {
    await systemShown(page);
    await expect(page.locator(".ss-toolbar .ss-name")).toHaveText(SYSTEM_NAME);
    await expect(page.locator(".ss-orbit")).toHaveCount(4);
    await expect(page.locator(".ss-save")).toBeDisabled();
  });

  // 사진: 휴대폰 세로 390px·데스크톱 1440px × 기본 테마 둘 × 한국어·영어(E2E_SHOTS_DIR). 휴대폰은 넘침·누르는 곳도 본다
  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`사진 ${theme} ${language}`, () => {
        test.use({ theme, language });

        test(`390px 세로 (${theme}·${language})`, async ({ page }) => {
          await systemShown(page);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          await page.locator('.ssv-body[data-kind="planet"]').click();
          await expect(page.locator(".ss-card .ss-suggest")).toBeVisible();
          // 행성 정의를 받아 [제안 적용]이 켜진 뒤에 찍는다(지금 기온 줄까지)
          await expect(page.locator(".ss-card-actions .button-primary")).toBeEnabled();
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await boxOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `star-system-390-${theme}-${language}`);
          await page.locator(".ss-card").scrollIntoViewIfNeeded();
          await shot(page, `star-system-390-${theme}-${language}-card`);
          await page.locator(".ss-orbit").nth(1).locator(".ss-orbit-pick").click();
          await page.locator(".ss-orbit[data-selected]").scrollIntoViewIfNeeded();
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `star-system-390-${theme}-${language}-orbit`);
        });

        test.describe("데스크톱", () => {
          test.use(VIEWPORTS.desktop);

          test(`1440px (${theme}·${language})`, async ({ page }) => {
            await systemShown(page);
            await page.locator('.ssv-body[data-kind="planet"]').click();
            await expect(page.locator(".ss-card .ss-suggest")).toBeVisible();
            // 행성 정의를 받아 [제안 적용]이 켜진 뒤에 찍는다(지금 기온 줄까지)
            await expect(page.locator(".ss-card-actions .button-primary")).toBeEnabled();
            expect(await boxOverflow(page)).toEqual([]);
            await shot(page, `star-system-1440-${theme}-${language}`);
          });
        });
      });
    }
  }
});

test.describe("개발자(dev)", () => {
  test.use({ account: "dev" });

  test("admin이 만든 항성계를 보고(만든 사람 표시) 고쳐 저장한다. 지우기는 없다", async ({
    page,
    deviceErrors,
  }) => {
    await systemShown(page);
    await expect(page.locator(".ss-toolbar .ss-name")).toHaveText(SYSTEM_NAME);
    await expect(page.locator(".ss-meta")).toContainText("e2e_admin");
    await expect(page.locator(".ss-remove")).toHaveCount(0);
    await page.locator(".ss-star-select").selectOption("k0v");
    await expect(page.locator(".ss-save")).toBeEnabled();
    await page.locator(".ss-save").click();
    await expect(page.locator(".ss-save")).toBeDisabled({ timeout: 20_000 });
    await expect(page.locator(".ss-meta")).toContainText("2");
    // 다시 열어도 바꾼 항성 종류
    await page.reload();
    await expect(page.locator(".ss-star-select")).toHaveValue("k0v", { timeout: 20_000 });
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("/dev/star-system은 권한 없음 화면이다(편집기 조각을 받지 않는다)", async ({ page }) => {
    const chunks: string[] = [];
    page.on("request", (request) => {
      if (/\/assets\/StarSystemScreen-/.test(request.url())) chunks.push(request.url());
    });
    await page.goto("/dev/star-system");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".ss-screen")).toHaveCount(0);
    expect(chunks).toEqual([]);
  });
});
