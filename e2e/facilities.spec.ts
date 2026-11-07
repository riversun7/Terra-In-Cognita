// 건물 화면 시험 — 생산 칸 "건물"(docs/adr/2026-11-07-buildings-runtime.md, 기획 49 N50·M14·M15, D-508·D-509·D-171).
// - admin: 개발 [시험 재료 받기]로 공방 Lv1·Lv2 재료를 짓는 칸의 도시 창고로 받고(D-516 361: 재료는 그 도시 창고·창고 시설·2차맵 화물에서만),
//   빈 칸에 공방을 짓는다(짓는 중) → 개발 [바로 끝내기] → Lv1·정상·100% → 레벨업(Lv2 재료·시간) → [바로 끝내기] → Lv2(최대 내구도
//   300 × 1.2 = 360). 그다음 야적장(창고 단계, 옛 1t, 382)을 짓고 소나무 원목을 넣고 꺼낸다(창고 든 무게). 재료가 모자란 시설은 [짓기]가 막힌다.
//   수리·장비 수리·노화·직무 멈춤은 시간이 걸려 DB 시험(apps/server/src/facilities/facilities.db.test.ts)이 본다. 건물 공격(질문 381)은
//   칸 제목과 빈 목록만 보고, 전투·결과는 DB 시험(attack.db.test.ts)이 본다.
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

/**
 * 빈 칸을 찾아 그 시설을 짓는다(지형·건물·유닛에 막히면 다음 자리). 그 칸이 속한 도시 창고에 재료가 모자라면(가장 가까운 도시가
 * 칸마다 다를 수 있다) 그 도시 창고로 시험 재료를 받고, [짓기]가 풀리면 누른다
 */
async function buildAt(
  page: Page,
  facilities: Locator,
  facility: string,
  cells: readonly number[],
): Promise<void> {
  const form = facilities.locator("form.labor-form");
  const cards = facilities.locator('li[data-part="facility-card"]');
  const build = form.getByRole("button", { name: message("ko", "facility_build"), exact: true });
  await form.getByLabel(message("ko", "facility_field_facility")).selectOption(facility);
  const before = await cards.count();
  for (const cell of cells) {
    await form.getByLabel(message("ko", "facility_field_x")).fill(String(cell));
    await form.getByLabel(message("ko", "facility_field_y")).fill(String(cell + 8));
    // 그 도시 창고에 재료가 모자랄 때만 받는다(사용자별 명령 속도 제한 — 순간 10번·분당 30번)
    if (await build.isDisabled()) {
      await form.getByRole("button", { name: message("ko", "facility_dev_grant") }).click();
      await expect(build).toBeEnabled({ timeout: 15_000 });
    }
    await build.click();
    try {
      await expect(cards).toHaveCount(before + 1, { timeout: 4_000 });
      return;
    } catch {
      // 막힌 자리(겹침·지형·유닛) → 다음 자리
    }
  }
  throw new Error(`no free cell for ${facility}`);
}

/**
 * 단추를 누르고 글이 보일 때까지 기다린다. 사용자별 건물 명령 속도 제한(순간 10번·분당 30번 — 앞 짓기·받기로 다 쓴다)에 걸리면 토큰이 다시
 * 찰 때까지 다시 누른다. 이미 글이 보이면 누르지 않는다(두 번 옮기지 않게)
 */
async function clickUntil(button: Locator, where: Locator, text: string): Promise<void> {
  await expect(async () => {
    if (!((await where.textContent()) ?? "").includes(text)) await button.click();
    await expect(where).toContainText(text, { timeout: 5_000 });
  }).toPass({ timeout: 40_000, intervals: [2_000] });
}

test.describe("건물", () => {
  test.use({ account: "admin" });

  test("admin: 시험 재료 → 공방 짓기 → 바로 끝내기 → Lv1 정상 → 레벨업 → Lv2", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    const facilities = await openFacilities(page);
    await expect(
      facilities.getByRole("heading", { name: message("ko", "facility_title"), exact: true }),
    ).toBeVisible();
    // 공방 Lv1 = 소나무 원목 12·철광석 7 → 두 번 지을 만큼(24·14) + Lv2 재료(판자 48·철 주괴 29 × 2)를 그 칸의 도시 창고로
    await buildAt(page, facilities, "workshop", [24, 40, 56, 72, 104, 136, 180, 200, 220]);
    // 받은 재료는 그 칸의 도시 창고에 있다(자리 목록의 도시 창고 줄)
    await expect(
      facilities.locator('[data-part="facility-places"] [data-kind="city"]').first(),
    ).toBeVisible();
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

    // 야적장(창고 단계): 지은 칸의 도시 창고에 남은 소나무 원목 2(받은 4 − Lv1 재료 2)를 넣고 하나를 꺼낸다 — 소나무 2kg
    await buildAt(page, facilities, "stockpile", [30, 48, 64, 88, 120, 152, 190, 210]);
    const yard = facilities.locator('li[data-part="facility-card"]').last();
    await yard.getByRole("button", { name: message("ko", "facility_dev_finish") }).click();
    await expect(yard).toContainText(message("ko", "facility_card_title", { name: "야적장", level: 1 }));
    const move = yard.locator('[data-part="facility-move"]');
    await move.getByLabel(message("ko", "facility_field_goods")).selectOption("item:pine_log");
    await move.getByLabel(message("ko", "facility_field_qty")).fill("2");
    const moveIn = move.getByRole("button", { name: message("ko", "facility_move_in"), exact: true });
    await clickUntil(moveIn, yard, message("ko", "facility_storage_used", { used: 4, kg: 1000 }));
    await move.getByLabel(message("ko", "facility_field_qty")).fill("1");
    const moveOut = move.getByRole("button", { name: message("ko", "facility_move_out"), exact: true });
    await clickUntil(moveOut, yard, message("ko", "facility_storage_used", { used: 2, kg: 1000 }));
    // 칠 수 있는 건물(질문 381): 남의 시설·다른 세력 비콘 목록 칸
    await expect(
      facilities.getByRole("heading", { name: message("ko", "facility_targets_title") }),
    ).toBeVisible();
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
          facilities.getByRole("heading", { name: message(look.language, "facility_title"), exact: true }),
        ).toBeVisible();
        await expect(facilities.locator('li[data-part="facility-card"]').first()).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(facilities, `facilities-${look.theme}-${look.language}-${look.width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
