// 첫 접속(사이보그 만들기) 화면 시험 — docs/adr/2026-11-01-first-login-cyborg.md, 기획 60 7.1·D-445
// - fresh(사이보그 없는 새 플레이어): 어느 주소로 열어도 /start로 간다(설정은 연다) → 이름(규칙·사칭·이미 있는 이름) → 외형
//   (프리셋·무작위·부위·색) → 초기 스탯(굴리기·다시 굴리기, 남은 횟수) → 세력 → 시작 도시 → 강하 → 홈. 그 뒤 /start는 홈으로,
//   사이보그 화면은 실제 이름·스탯, 2차맵은 열리고(내 사이보그 하나) 까맣지 않다(탐사 칸 > 0).
// - fresh_shots: 390px × 파스텔·다크 × 한국어·영어로 단계마다 사진(만들지 않는다. 굴림은 처음 한 번만 쓴다).
// player·dev·admin은 전역 준비가 사이보그를 만들어 두었다("E2EPlayer" 등 — 이미 있는 이름 시험에 쓴다).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

const STEPS = ["name", "looks", "stats", "faction", "city", "descent"] as const;

async function expectStep(page: Page, step: (typeof STEPS)[number]): Promise<void> {
  await expect(page.locator(".start")).toHaveAttribute("data-step", step);
}

async function next(page: Page): Promise<void> {
  await page.locator(".start-nav .button-primary").click();
}

test.describe("첫 접속: 새 플레이어", () => {
  test.use({ account: "fresh" });

  test("사이보그가 없으면 /start로 가고, 여섯 단계를 마치면 홈 → 사이보그 화면·2차맵이 열린다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    // 어느 주소로 열어도 /start(설정은 연다)
    await page.goto("/units");
    await expect(page).toHaveURL(/\/start$/);
    await expectStep(page, "name");
    await expect(page.locator(".tabbar")).toHaveCount(0);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await page.goto("/map");
    await expect(page).toHaveURL(/\/start$/);

    // 1. 이름: 글자 규칙(기기), 사칭·이미 있는 이름(서버, 대소문자 무시)
    const input = page.locator(".start-name-input");
    await input.fill("No va");
    await expect(page.locator(".start-field-problem")).not.toHaveText("");
    await input.fill("운영자");
    await next(page);
    await expect(page.locator(".start-field-problem")).not.toHaveText("");
    await expectStep(page, "name");
    await input.fill("e2eplayer");
    await next(page);
    await expect(page.locator(".start-field-problem")).not.toHaveText("", { timeout: 10_000 });
    await expectStep(page, "name");
    await input.fill("새싹로봇");
    await next(page);
    await expectStep(page, "looks");

    // 2. 외형: 프리셋 → 부위 넘기기 → 색 → 무작위
    const avatar = page.locator(".start-avatar");
    const before = await avatar.getAttribute("data-look");
    await page.locator(".start-preset").nth(2).click();
    await expect(page.locator(".start-preset").nth(2)).toHaveAttribute("aria-pressed", "true");
    await page.locator(".start-part").first().locator(".start-part-step").last().click();
    await page.locator(".start-swatch").nth(5).click();
    expect(await avatar.getAttribute("data-look")).not.toBe(before);
    await page.locator(".start-random").click();
    const chosen = await avatar.getAttribute("data-look");
    await next(page);
    await expectStep(page, "stats");

    // 3. 초기 스탯: 굴리기 전에는 다음이 잠겨 있다. 굴림 4번(처음 1 + 다시 3), 합 60
    await expect(page.locator(".start-nav .button-primary")).toBeDisabled();
    await page.locator(".start-choice[data-temperament='combat'] input").check();
    const roll = page.locator(".start-roll-button");
    await roll.click();
    const result = page.locator(".start-roll-result");
    await expect(result).toHaveAttribute("data-rolls-left", "3", { timeout: 15_000 });
    const sum = async (): Promise<number> => {
      const values = await page.locator(".start-stat-value").allTextContents();
      return values.reduce((total, value) => total + Number(value), 0);
    };
    expect(await sum()).toBe(60);
    await page.locator(".start-choice[data-temperament='tech'] input").check();
    await roll.click();
    await expect(result).toHaveAttribute("data-rolls-left", "2", { timeout: 15_000 });
    expect(await sum()).toBe(60);
    await next(page);
    await expectStep(page, "faction");

    // 4·5. 세력(추천)·시작 도시(기본 선택 = 가장 덜 붐빔)
    await expect(page.locator(".start-choice[data-faction] input").first()).toBeChecked();
    await expect(page.locator(".start-badge").first()).toBeVisible();
    await next(page);
    await expectStep(page, "city");
    await expect(page.locator(".start-choice[data-city] input").first()).toBeChecked();
    await next(page);
    await expectStep(page, "descent");
    await expect(page.locator(".start-summary-name")).toHaveText("새싹로봇");
    await expect(page.locator(".start-summary-avatar")).toHaveAttribute("data-look", chosen ?? "");

    // 6. 강하 → 홈
    await page.locator(".start-descend").click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.locator(".tabbar")).toBeVisible();
    // 만든 뒤 /start는 홈으로
    await page.goto("/start");
    await expect(page).toHaveURL(/\/$/);

    // 사이보그 화면: 실제 이름·외형·스탯(본체 안내가 아니다)
    await page.goto("/cyborg");
    await expect(page.locator(".cyborg-name")).toHaveText("새싹로봇");
    await expect(page.locator(".cyborg-avatar")).toHaveAttribute("data-look", chosen ?? "");
    await expect(page.locator(".roster-primary-name").first()).toBeVisible();

    // 2차맵: 열리고(볼 수 있음), 내 사이보그 하나, 탐사한 칸이 있어 까맣지 않다
    await page.goto("/map");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
    await expect
      .poll(async () => Number(await screen.getAttribute("data-units")), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => Number(await screen.getAttribute("data-explored")), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(page.locator(".map-dark")).toHaveCount(0);
    await shot(page, "first-login-map-after-390");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("첫 접속 사진", () => {
  test.use({ account: "fresh_shots" });

  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`${theme} ${language}`, () => {
        test.use({ theme, language });

        test(`단계마다 사진 (${theme}·${language})`, async ({ page, deviceErrors }) => {
          test.setTimeout(90_000);
          await page.goto("/start");
          await expectStep(page, "name");
          await page.locator(".start-name-input").fill(language === "ko" ? "꼬마정찰병" : "Pebble");
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `first-login-1-name-390-${theme}-${language}`, { fullPage: true });
          await next(page);
          await expectStep(page, "looks");
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `first-login-2-looks-390-${theme}-${language}`, { fullPage: true });
          await next(page);
          await expectStep(page, "stats");
          // 처음 한 번만 굴린다(다음 사진은 서버에 남은 굴림을 보인다)
          if ((await page.locator(".start-roll-result").count()) === 0) {
            await page.locator(".start-roll-button").click();
            await expect(page.locator(".start-roll-result")).toBeVisible({ timeout: 15_000 });
          }
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `first-login-3-stats-390-${theme}-${language}`, { fullPage: true });
          await next(page);
          await expectStep(page, "faction");
          await shot(page, `first-login-4-faction-390-${theme}-${language}`, { fullPage: true });
          await next(page);
          await expectStep(page, "city");
          await shot(page, `first-login-5-city-390-${theme}-${language}`, { fullPage: true });
          await next(page);
          await expectStep(page, "descent");
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `first-login-6-descent-390-${theme}-${language}`, { fullPage: true });
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
});
