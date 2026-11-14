// 2차맵 건축 모드 시험 — 사용자 요청 2026-11-14 "2차맵에서 건설하는 기능 구현. 도시 버튼을 통해 2차맵에 건축모드로 진입한다"
// (docs/adr/2026-11-14-second-map-build.md 1단계).
// - [도시] → [건설] → 건물 목록 → 고르기 → 땅 누르기 = 반투명 미리보기 자리(판 data-valid) → [회전] → [다른 건물] → [닫기].
// - 땅 규칙: 서버 조회 facilities.landRule이 막힘(다른 세력 도시)이면 경고를 보이고 [짓기]가 꺼진다(응답을 바꿔 본다 — 서버 규칙은 DB 시험).
// - 사진: 390 × 파스텔·다크(놓기 단계).
import type { Page } from "@playwright/test";
import { groundOffsets } from "./helpers/mapGround.ts";
import { navButton, openCitySheet } from "./helpers/mapHud.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 서버 땅 규칙 응답을 "다른 세력 도시라 못 지음"으로 바꾼다 */
function blockLand(data: unknown): void {
  if (typeof data !== "object" || data === null) throw new Error("facilities.landRule 응답 모양이 다릅니다");
  Reflect.set(data, "status", "ready");
  Reflect.set(data, "allowed", false);
  Reflect.set(data, "reason", "foreign_city");
  Reflect.set(data, "cityFaction", 1);
}

async function openMap(
  page: Page,
  edits: Readonly<Record<string, (data: unknown) => void>> = {},
): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary, ...edits });
  await page.goto("/map");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
}

/** [도시] → [건설]로 건축 모드 판을 연다 */
async function openBuild(page: Page) {
  const city = await openCitySheet(page);
  await city.locator(".map-city-build").click();
  await expect(page.locator(".map-city")).toHaveCount(0);
  const sheet = page.locator(".map-build");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** 목록에서 첫 건물을 고르고 빈 땅을 눌러 미리보기 자리를 정한다 */
async function pickAndPlace(page: Page): Promise<void> {
  const sheet = page.locator(".map-build");
  const option = sheet.locator(".map-build-option").first();
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(sheet).toHaveAttribute("data-phase", "place");
  await expect(sheet.locator(".map-build-status")).toHaveAttribute("data-problem", /\bno_cell\b/);
  const canvas = page.locator(".map-view canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("지도 캔버스가 없습니다");
  const [spot] = await groundOffsets(page);
  if (!spot) throw new Error("누를 빈 땅이 없습니다");
  await page.mouse.click(box.x + box.width / 2 + spot.dx, box.y + box.height / 2 + spot.dy);
  await expect(sheet.locator(".map-build-status")).not.toHaveAttribute("data-problem", /\bno_cell\b/);
}

test.describe("건축 모드: 플레이어", () => {
  test.use({ account: "player" });

  test("[도시] → [건설] → 고르기 → 땅 누르기(미리보기) → [회전] → [다른 건물] → [닫기]", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await openMap(page);
    const sheet = await openBuild(page);
    await expect(sheet).toHaveAttribute("data-phase", "list");
    await pickAndPlace(page);
    // 땅을 눌러도 이동 명령·채집 판이 아니다(건축 모드가 누르기를 가져간다)
    await expect(page.locator(".gather-sheet")).toHaveCount(0);
    await expect(sheet).toHaveAttribute("data-valid", /^(true|false)$/);
    const valid = (await sheet.getAttribute("data-valid")) === "true";
    await expect(sheet.locator(".map-build-confirm")).toBeEnabled({ enabled: valid });
    // 회전: 판은 그대로 놓기 단계
    await sheet.locator(".map-build-rotate").click();
    await expect(sheet).toHaveAttribute("data-phase", "place");
    expect(await horizontalOverflow(page)).toEqual([]);
    await sheet.locator(".map-build-change").click();
    await expect(sheet).toHaveAttribute("data-phase", "list");
    await sheet.locator(".map-build-close").click();
    await expect(sheet).toHaveCount(0);
    // 아래 탭을 누르면 건축 모드가 닫힌다
    await openBuild(page);
    await navButton(page, "units").click();
    await expect(page.locator(".map-build")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("땅 규칙: 다른 세력 도시 2차맵이면 경고, [짓기] 꺼짐", async ({ page, deviceErrors }) => {
    test.setTimeout(150_000);
    await openMap(page, { "facilities.landRule": blockLand });
    const sheet = await openBuild(page);
    await expect(sheet).toHaveAttribute("data-land", "blocked", { timeout: 20_000 });
    await expect(sheet.locator(".map-build-warning")).toBeVisible();
    await pickAndPlace(page);
    await expect(sheet).toHaveAttribute("data-valid", "false");
    await expect(sheet.locator(".map-build-confirm")).toBeDisabled();
    expect(deviceErrors).toEqual([]);
  });
});

const THEMES: readonly Theme[] = ["pastel", "dark"];

test.describe("건축 모드 사진(390)", () => {
  test.use({ account: "player", viewport: { width: 390, height: 844 } });
  for (const theme of THEMES) {
    test.describe(theme, () => {
      test.use({ theme });

      test(`건물 목록·놓기 (${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        await openMap(page);
        await openBuild(page);
        await expect(page.locator(".map-build-option").first()).toBeVisible({ timeout: 20_000 });
        await shot(page, `build-list-390-${theme}`);
        await pickAndPlace(page);
        await page.waitForTimeout(500);
        await shot(page, `build-place-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
