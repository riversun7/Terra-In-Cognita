// 예상 채집 확률표·컨디션 한 줄 시험 — 기획 D-534, docs/adr/2026-11-12-unit-condition.md.
// - dev: 생산 편집기(/dev/production)의 [예상 확률] 탭. 줄 = 두 스탯 초기 합, 칸 = 레벨. 컨디션·시설 레벨 손잡이를 옮기면 칸의 유효 스탯 범위와
//   T0~T9 확률이 바로 바뀐다(판정과 같은 @terra/shared/gatherExpect). 15·15 만렙(50)은 컨디션 없이 T9가 없고 +40이면 T9가 나온다.
// - dev + 시안 자료: 유닛 상세·사이보그 화면에 컨디션 한 줄(시안 값).
// - 사진: 개발 화면 테마 네온·라이트 × 한국어·영어 × 390·1440 가운데 넷(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const screen = (page: Page) => page.locator(".gt-screen");
const cell = (page: Page, sum: number, level: number) => page.getByTestId(`expect-${sum}-${level}`);

/** 예상 확률 탭을 연다(개발자 홈 → 생산 편집기 → 탭) */
async function openExpect(page: Page): Promise<void> {
  await page.goto("/dev/production?tab=expect");
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(screen(page)).toHaveAttribute("data-tab", "expect");
  await expect(page.locator(".pd-expect-table")).toBeVisible();
}

/** 칸의 T9 확률 글(예: "0", "0.7%") */
const topTier = (page: Page, sum: number, level: number) =>
  cell(page, sum, level).locator('.pd-expect-tiers li[data-tier="t9"] .dev-num');

test.describe("개발자: 예상 확률 탭", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("탭으로 들어가 표(초기 합 × 레벨)를 보고, 컨디션·시설 레벨 손잡이를 옮기면 바로 다시 센다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev/production");
    await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await page.locator('.pd-tab[data-tab="expect"]').click();
    await expect(screen(page)).toHaveAttribute("data-tab", "expect");
    // 줄 8(20·30·36·40·50·60·70·80) × 칸 5(Lv1·20·40·50·60)
    await expect(page.locator(".pd-expect-table tbody tr")).toHaveCount(8);
    await expect(page.locator(".pd-expect-table tbody td")).toHaveCount(40);
    // 15·15 만렙 50: K 0.8~1.2 → 146~206, T9 없음. 18·18 만렙 50: 176~246, T9 있음
    await expect(cell(page, 30, 50).locator(".pd-expect-stat")).toHaveText("146~206");
    await expect(topTier(page, 30, 50)).toHaveText("0");
    await expect(cell(page, 36, 50).locator(".pd-expect-stat")).toHaveText("176~246");
    await expect(topTier(page, 36, 50)).not.toHaveText("0");
    // 레벨 1은 성장이 없다
    await expect(cell(page, 30, 1).locator(".pd-expect-stat")).toHaveText("30");

    // 컨디션 +40(상한): 15·15 만렙도 T9 구간에 닿는다(D-534 원문)
    await page.getByTestId("expect-condition").fill("40");
    await expect(page.getByTestId("expect-condition-value")).toHaveText("+40");
    await expect(cell(page, 30, 50).locator(".pd-expect-stat")).toHaveText("186~246");
    await expect(topTier(page, 30, 50)).not.toHaveText("0");
    await expect(cell(page, 30, 50)).toHaveAttribute("data-top", "true");
    // 시설 레벨 5: 레벨당 +10 → +40 더
    await page.getByTestId("expect-facility").fill("5");
    await expect(page.getByTestId("expect-facility-value")).toHaveText("Lv5");
    await expect(cell(page, 30, 50).locator(".pd-expect-stat")).toHaveText("226~286");
    await expect(cell(page, 30, 1).locator(".pd-expect-stat")).toHaveText("110");
    // 컨디션 −40: 0 아래로 가지 않는다(레벨 1의 20·20 = 20 + 레벨 보너스 40 = 60, 컨디션은 40까지 깎는다)
    await page.getByTestId("expect-condition").fill("-40");
    await expect(page.getByTestId("expect-condition-value")).toHaveText("−40");
    await expect(cell(page, 20, 1).locator(".pd-expect-stat")).toHaveText("40");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("개발자 + 시안 자료: 컨디션 한 줄", () => {
  test.use({ account: "dev", preview: "dev", ...VIEWPORTS.desktop });

  test("유닛 상세와 사이보그 화면에 컨디션(합계·주거·음식·상한)이 보인다", async ({ page, deviceErrors }) => {
    await page.goto("/units");
    await expect(page.locator(".units-panel")).toBeVisible();
    await expect(page.locator(".units-panel .status")).toHaveCount(0, { timeout: 15_000 });
    // 시안 Mina: 주거 +20 · 음식 +12 = +32
    await page.locator(".units-row").filter({ hasText: "Mina" }).locator(".units-row-main").click();
    const line = page.locator(".units-detail").getByTestId("unit-condition");
    await expect(line.locator("dt")).toHaveText(message("ko", "roster_condition"));
    await expect(line.locator(".roster-condition-total")).toHaveText("+32");
    await expect(line.locator(".roster-condition-total")).toHaveAttribute("data-tone", "good");
    await expect(line.locator(".roster-condition-parts")).toHaveText(
      message("ko", "roster_condition_parts", { housing: "+20", food: "+12", cap: "40" }),
    );
    // 사이보그 화면(시안 본체 +40)
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("unit-condition").locator(".roster-condition-total")).toHaveText("+40");
    expect(deviceErrors).toEqual([]);
  });
});

/** 사진: 네온·라이트 × 한국어·영어 × 390·1440 가운데 넷 */
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = [
  { theme: "neon", language: "ko", width: 1440, height: 900 },
  { theme: "light", language: "en", width: 1440, height: 900 },
  { theme: "neon", language: "en", width: 390, height: 844 },
  { theme: "light", language: "ko", width: 390, height: 844 },
];

test.describe("화면 모양", () => {
  test.use({ account: "dev" });
  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("예상 확률 표: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        await openExpect(page);
        await page.getByTestId("expect-condition").fill("40");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `gather-expect-${theme}-${language}-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
