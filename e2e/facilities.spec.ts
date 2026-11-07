// 건물 화면 시험 — 생산 칸 "건물"(docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15, D-508·D-509·D-171).
// - admin: 개발 [시험 재료 받기]로 공방 Lv1·Lv2 재료를 받고, 빈 칸에 공방을 짓는다(짓는 중) → 개발 [바로 끝내기] → Lv1·정상·100%
//   → 레벨업(Lv2 재료·시간) → [바로 끝내기] → Lv2(최대 내구도 300 × 1.2 = 360). 재료가 모자란 시설은 [짓기]가 막힌다.
//   수리·장비 수리·노화는 시간이 걸려 DB 시험(apps/server/src/facilities/facilities.db.test.ts)이 본다.
// - dev에게는 유닛·건물을 주지 않는다(다른 시험이 dev의 처음 유닛 수를 기준으로 본다). admin만 쓴다.
// - 사진(E2E_SHOTS_DIR): 390 파스텔 한국어, 390 다크 영어, 1440 파스텔 한국어, 1440 다크 영어(건물 칸).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const panel = (page: Page): Locator => page.locator('section[data-part="facilities"]');

async function openFacilities(page: Page): Promise<Locator> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/economy/production");
  const found = panel(page);
  await expect(found.locator('[data-part="facility-units"]')).toBeVisible({ timeout: 15_000 });
  return found;
}

/** 빈 칸을 찾아 공방을 짓는다(지형·건물·유닛에 막히면 다음 자리). 지은 뒤 카드 수 */
async function buildWorkshop(page: Page, facilities: Locator): Promise<void> {
  const form = facilities.locator("form.labor-form");
  const cards = facilities.locator('li[data-part="facility-card"]');
  const before = await cards.count();
  for (const cell of [24, 40, 56, 72, 104, 136, 180, 200, 220]) {
    await form.getByLabel(message("ko", "facility_field_x")).fill(String(cell));
    await form.getByLabel(message("ko", "facility_field_y")).fill(String(cell + 8));
    await form.getByRole("button", { name: message("ko", "facility_build"), exact: true }).click();
    try {
      await expect(cards).toHaveCount(before + 1, { timeout: 4_000 });
      return;
    } catch {
      // 막힌 자리(겹침·지형·유닛) → 다음 자리
    }
  }
  throw new Error("no free cell for the workshop");
}

test.describe("건물", () => {
  test.use({ account: "admin" });

  test("admin: 시험 재료 → 공방 짓기 → 바로 끝내기 → Lv1 정상 → 레벨업 → Lv2", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    const facilities = await openFacilities(page);
    await expect(facilities.getByRole("heading", { name: message("ko", "facility_title") })).toBeVisible();
    const form = facilities.locator("form.labor-form");
    await form.getByLabel(message("ko", "facility_field_facility")).selectOption("workshop");
    await form.getByRole("button", { name: message("ko", "facility_dev_grant") }).click();
    // 공방 Lv1 = 소나무 원목 12·철광석 7 → 두 번 지을 만큼(24·14) + Lv2 재료(판자 48·철 주괴 29 × 2)
    await expect(facilities.locator('[data-part="facility-materials"]')).toContainText("96", {
      timeout: 15_000,
    });
    await expect(form.locator('[data-part="facility-preview"]')).not.toContainText(
      message("ko", "facility_have_short", { have: "0" }),
    );
    await buildWorkshop(page, facilities);
    const card = facilities.locator('li[data-part="facility-card"]').last();
    await expect(card).toContainText(message("ko", "facility_state_building"));
    await expect(card.locator('[data-part="facility-job"]')).toBeVisible();
    await card.getByRole("button", { name: message("ko", "facility_dev_finish") }).click();
    await expect(card).toContainText(message("ko", "facility_card_title", { name: "공방", level: 1 }));
    await expect(card.locator(".eco-tag")).toHaveText(message("ko", "facility_state_ok"));
    await expect(card.locator(".facility-meter-text")).toHaveText("100%");
    await expect(card).toContainText("300/300");

    // 레벨업: 판자·철 주괴(가공품, D-508) → 짓는 중 → 바로 끝내기 → Lv2, 최대 내구도 360(M15 단계 20%)
    await card.getByRole("button", { name: /Lv2/ }).click();
    await expect(card.locator('[data-part="facility-job"]')).toContainText(
      message("ko", "facility_job_upgrade"),
    );
    await card.getByRole("button", { name: message("ko", "facility_dev_finish") }).click();
    await expect(card).toContainText(message("ko", "facility_card_title", { name: "공방", level: 2 }));
    await expect(card).toContainText("360/360");
    await expect(facilities).toContainText(message("ko", "facility_holdings_empty"));
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(facilities, "facilities-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });

  for (const look of [
    { theme: "dark", language: "en", viewport: "phone", width: 390 },
    { theme: "pastel", language: "ko", viewport: "desktop", width: 1440 },
    { theme: "dark", language: "en", viewport: "desktop", width: 1440 },
  ] as const) {
    test.describe(`${look.theme}·${look.language}·${look.width}`, () => {
      test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS[look.viewport] });

      test("건물 칸이 넘치지 않는다(사진)", async ({ page, deviceErrors }) => {
        const facilities = await openFacilities(page);
        await expect(
          facilities.getByRole("heading", { name: message(look.language, "facility_title") }),
        ).toBeVisible();
        await expect(facilities.locator('li[data-part="facility-card"]').first()).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(facilities, `facilities-${look.theme}-${look.language}-${look.width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
