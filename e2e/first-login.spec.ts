// 첫 접속(사이보그 만들기) 화면 시험 — docs/adr/2026-11-01-first-login-cyborg.md, 기획 60 7.1·D-445
// - fresh(사이보그 없는 새 플레이어): 어느 주소로 열어도 /start로 간다(설정은 연다) → 이름(규칙·사칭·이미 있는 이름) → 외형
//   (프리셋·무작위·부위·색) → 초기 스탯(굴리기·다시 굴리기, 남은 횟수) → 속성(D-450: 4원소 두 칸까지 합 10) → 세력 → 시작 도시 →
//   강하 → 홈. 그 뒤 /start는 홈으로, 사이보그 화면은 실제 이름·스탯, 서버가 속성값을 돌려주고, 2차맵은 열리고(내 사이보그 하나)
//   까맣지 않다(탐사 칸 > 0).
// - legacy(속성 분배 전 프로토콜 4로 만든 사이보그): 다음 접속 때 /start의 속성 단계만 보이고, 한 번 나누면 홈으로.
// - fresh_shots: 390px × 파스텔·다크·정거장, 1440px × 파스텔·다크 × 한국어·영어로 단계마다 사진(속성 단계는 빈 것·나눈 것), 외형
//   단계에서 프리셋 그림 넷(만들지 않는다. 굴림은 처음 한 번만 쓴다).
// player·dev·admin은 전역 준비가 사이보그를 만들어 두었다("E2EPlayer" 등 — 이미 있는 이름 시험에 쓴다).
import type { Page } from "@playwright/test";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const STEPS = ["name", "looks", "stats", "elements", "faction", "city", "descent"] as const;

async function expectStep(page: Page, step: (typeof STEPS)[number]): Promise<void> {
  await expect(page.locator(".start")).toHaveAttribute("data-step", step);
}

async function next(page: Page): Promise<void> {
  await page.locator(".start-nav .button-primary").click();
}

/** 속성 한 칸의 단추(less·more·all) */
const elementButton = (page: Page, element: string, which: "less" | "more" | "all") =>
  page.locator(`.start-element[data-element='${element}'] .start-element-${which}`);

/** cyborg.get의 본체 속성값 12칸(서버가 저장한 값) */
async function bodyElements(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const response: unknown = await fetch("/api/trpc/cyborg.get").then((reply) => reply.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    return pick(pick(pick(pick(response, "result"), "data"), "body"), "elements");
  });
}

test.describe("첫 접속: 새 플레이어", () => {
  test.use({ account: "fresh" });

  test("사이보그가 없으면 /start로 가고, 일곱 단계를 마치면 홈 → 사이보그 화면·2차맵이 열린다", async ({
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
      const values = await page.locator(".start-roll-result .stat-value").allTextContents();
      return values.reduce((total, value) => total + Number(value), 0);
    };
    expect(await sum()).toBe(60);
    // 여섯 스탯은 두 칸씩 묶음, 차례 STR·VIT·INT·WIS·DEX·AGI(D-448: 힘·체력이 붙어 있다)
    await expect(result.locator(".stat-pair")).toHaveCount(3);
    expect(
      await result
        .locator(".stat-cell")
        .evaluateAll((list) => list.map((cell) => cell.getAttribute("data-stat"))),
    ).toEqual(["str", "vit", "int", "wis", "dex", "agi"]);
    await page.locator(".start-choice[data-temperament='tech'] input").check();
    await roll.click();
    await expect(result).toHaveAttribute("data-rolls-left", "2", { timeout: 15_000 });
    expect(await sum()).toBe(60);
    await next(page);
    await expectStep(page, "elements");

    // 4. 속성(D-450, N36): 10점을 다 나눠야 다음이 열린다. 한 칸에 모두 → 둘로 나눔 → 세 번째 칸은 못 고른다
    const nextButton = page.locator(".start-nav .button-primary");
    await expect(nextButton).toBeDisabled();
    await elementButton(page, "fire", "all").click();
    await expect(page.locator(".start-element[data-element='fire'] .start-element-value")).toHaveText("10");
    await expect(nextButton).toBeEnabled();
    await expect(elementButton(page, "water", "more")).toBeDisabled();
    for (let i = 0; i < 3; i++) await elementButton(page, "fire", "less").click();
    await expect(nextButton).toBeDisabled();
    for (let i = 0; i < 3; i++) await elementButton(page, "wind", "more").click();
    await expect(page.locator(".start-element[data-picked='true']")).toHaveCount(2);
    await elementButton(page, "fire", "less").click();
    await expect(elementButton(page, "earth", "more")).toBeDisabled();
    await elementButton(page, "fire", "more").click();
    await expect(nextButton).toBeEnabled();
    await next(page);
    await expectStep(page, "faction");

    // 5·6. 세력(추천)·시작 도시(기본 선택 = 가장 덜 붐빔)
    // 시험 국가가 넷이다(docs/adr/2026-11-01-npc-brain-r5.md 7절, 질문 203 가): 기본 선택 = 추천(가장 덜 붐빈) 세력
    const recommended = page.locator(".start-choice[data-faction]:has(.start-badge)").first();
    await expect(recommended.locator("input")).toBeChecked();
    await expect(recommended.locator(".start-badge")).toBeVisible();
    // 정착 지원금(D-455 190, N39 출발값 72 × 가장 덜 붐빈 세력 배율 1500‰)
    await expect(recommended.locator(".start-faction-grant")).toHaveAttribute("data-grant", "108");
    await next(page);
    await expectStep(page, "city");
    await expect(page.locator(".start-choice[data-city] input").first()).toBeChecked();
    // 시작 도시를 1차맵 작은 보기에서 고른다(D-6041, docs/adr/2026-11-07-play-flow.md "WP2"): 국가의 시작 도시가 지도에 있고,
    // 고른 도시의 주변 자원·기후(행성 값)가 보인다. 목록 줄에도 땅·기후 한 줄
    const cityMap = page.locator(".start-city-map");
    await expect(cityMap).toHaveAttribute("data-phase", "ready", { timeout: 60_000 });
    expect(Number(await cityMap.getAttribute("data-cities"))).toBeGreaterThan(0);
    await expect(cityMap.locator(".city-marker:not([hidden])").first()).toBeVisible({ timeout: 15_000 });
    const chosenCity = await page
      .locator(".start-choice[data-city]:has(input:checked)")
      .getAttribute("data-city");
    await expect(page.locator(".start-city-land")).toHaveAttribute("data-city", chosenCity ?? "");
    await expect(page.locator(".start-city-land .land-facts dd")).toHaveCount(3);
    await expect(page.locator(".start-choice .start-city-ground").first()).toBeVisible();
    await next(page);
    await expectStep(page, "descent");
    await expect(page.locator(".start-summary-name")).toHaveText("새싹로봇");
    await expect(page.locator(".start-summary-avatar")).toHaveAttribute("data-look", chosen ?? "");
    await expect(page.locator(".start-elements-summary dd")).toHaveText("불 7 · 바람 3");

    // 7. 강하 → 홈
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
    await expect(page.locator(".cyborg .core-row")).toHaveCount(6);
    // 서버가 나눈 속성값을 저장했다(12칸, 차례 = ELEMENT_CODES: 물·빙결·불·폭렬·바람…)
    expect(await bodyElements(page)).toEqual([0, 0, 7, 0, 3, 0, 0, 0, 0, 0, 0, 0]);

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
    await shot(page, "first-login-map-after-390");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("첫 접속: 속성 분배 전에 만든 사이보그", () => {
  test.use({ account: "legacy" });

  test("다음 접속 때 /start의 속성 단계만 보이고, 한 번 나누면 홈으로 간다(D-450)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(60_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/units");
    await expect(page).toHaveURL(/\/start$/);
    const only = page.locator(".start-elements-only");
    await expect(only).toBeVisible();
    await expect(page.locator(".start-progress")).toHaveCount(0);
    // 설정은 연다(같은 예외)
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await page.goto("/start");
    const save = only.locator(".start-nav .button-primary");
    await expect(save).toBeDisabled();
    await elementButton(page, "earth", "all").click();
    await expect(save).toBeEnabled();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await shot(page, "first-login-elements-only-390-pastel-ko", { fullPage: true });
    await save.click();
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.locator(".tabbar")).toBeVisible();
    await page.goto("/start");
    await expect(page).toHaveURL(/\/$/);
    expect(await bodyElements(page)).toEqual([0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0]);
    expect(deviceErrors).toEqual([]);
  });
});

// 사진 크기·테마: 390 × 파스텔·다크·정거장, 1440 × 파스텔·다크, 한국어·영어(정거장 = 네온 SF 테마, 사용자 결정 2026-11-01)
const SHOT_CASES: readonly { viewport: "phone" | "desktop"; theme: Theme; language: Language }[] = [
  ...(["pastel", "dark", "station"] as const).flatMap((theme) =>
    (["ko", "en"] as const).map((language) => ({ viewport: "phone" as const, theme, language })),
  ),
  ...(["pastel", "dark"] as const).flatMap((theme) =>
    (["ko", "en"] as const).map((language) => ({ viewport: "desktop" as const, theme, language })),
  ),
];

test.describe("첫 접속 사진", () => {
  test.use({ account: "fresh_shots" });

  for (const { viewport, theme, language } of SHOT_CASES) {
    const width = String(VIEWPORTS[viewport].viewport.width);
    test.describe(`${width} ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS[viewport], theme, language });

      test(`단계마다 사진 (${width}·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(90_000);
        await page.goto("/start");
        await expectStep(page, "name");
        await page.locator(".start-name-input").fill(language === "ko" ? "꼬마정찰병" : "Pebble");
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `first-login-1-name-${width}-${theme}-${language}`, { fullPage: true });
        await next(page);
        await expectStep(page, "looks");
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `first-login-2-looks-${width}-${theme}-${language}`, { fullPage: true });
        // 그림(프리셋 넷): 한국어에서만 찍는다(그림에는 글자가 없다)
        if (language === "ko") {
          for (const index of [0, 1, 2, 3]) {
            await page.locator(".start-preset").nth(index).click();
            await elementShot(
              page.locator(".start-looks-preview"),
              `avatar-preset-${String(index)}-${width}-${theme}`,
            );
          }
        }
        await next(page);
        await expectStep(page, "stats");
        // 처음 한 번만 굴린다(다음 사진은 서버에 남은 굴림을 보인다)
        if ((await page.locator(".start-roll-result").count()) === 0) {
          await page.locator(".start-roll-button").click();
          await expect(page.locator(".start-roll-result")).toBeVisible({ timeout: 15_000 });
        }
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `first-login-3-stats-${width}-${theme}-${language}`, { fullPage: true });
        await next(page);
        await expectStep(page, "elements");
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `first-login-4-elements-empty-${width}-${theme}-${language}`, { fullPage: true });
        // 불 6·바람 4(두 칸, 합 10)
        await elementButton(page, "fire", "all").click();
        for (let i = 0; i < 4; i++) await elementButton(page, "fire", "less").click();
        for (let i = 0; i < 4; i++) await elementButton(page, "wind", "more").click();
        await expect(page.locator(".start-nav .button-primary")).toBeEnabled();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `first-login-4-elements-${width}-${theme}-${language}`, { fullPage: true });
        await next(page);
        await expectStep(page, "faction");
        await shot(page, `first-login-5-faction-${width}-${theme}-${language}`, { fullPage: true });
        await next(page);
        await expectStep(page, "city");
        // 1차맵 작은 보기가 그려진 뒤에 찍는다(도시 표시·주변 자원·기후)
        await expect(page.locator(".start-city-map")).toHaveAttribute("data-phase", "ready", {
          timeout: 60_000,
        });
        await expect(page.locator(".start-city-map .city-marker:not([hidden])").first()).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `first-login-6-city-${width}-${theme}-${language}`, { fullPage: true });
        await next(page);
        await expectStep(page, "descent");
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `first-login-7-descent-${width}-${theme}-${language}`, { fullPage: true });
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
