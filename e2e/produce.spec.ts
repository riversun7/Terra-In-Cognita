// 플레이어 생산 화면 시험 — 경제 → 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산", 기획 60_UX §7.1 ③·D-469·D-506·D-507).
// - player: 사이보그를 만들 때 받은 시작 재료(설정 칸 [임시] 소나무 원목 20·석재 10)가 시작 도시의 내 도시 창고에 있고(건물 칸 "내 창고·화물"),
//   구인 칸(정부기관 구인 카드)이 시작 도시 카드와 [고용]을 보인다. 고용은 하지 않는다(다른 시험이 player의 유닛 수·잔고를 본다 — 고용 명령은
//   recruit.spec.ts가 admin으로 본다, 같은 명령 함수).
// - admin: 벌목장(채집 시설)을 짓고(개발 재료·바로 끝내기) 카드의 일꾼 칸에서 사이보그 본체를 직무 배치 → 목록에 "직무 배치"가 보이고 일꾼
//   1/10 → [빼기]로 푼다(다른 시험이 쓰는 본체를 묶어 두지 않는다). 진짜 물건이 쌓이는 것은 시간이 걸려 DB 시험(labor/produce.db.test.ts)이 본다.
//   [지도에서 고르기]는 2차맵으로 간다(2차맵 칸 누르기 → 폼 칸 채움은 WebGL 칸 좌표라 화면 시험에서 보지 않는다, buildPick.ts 단위 셈).
// - 사진(E2E_SHOTS_DIR): 일꾼 칸·구인 칸 390 파스텔 한국어, 390 다크 영어.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const facilitiesPanel = (page: Page): Locator => page.locator('section[data-part="facilities"]');
const recruitPanel = (page: Page): Locator => page.locator('section[data-part="recruit"]');

async function openProduction(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/economy/production");
  await expect(facilitiesPanel(page).locator('[data-part="facility-units"]')).toBeVisible({
    timeout: 15_000,
  });
}

/** 빈 칸을 찾아 그 시설을 짓는다(그 칸의 도시 창고에 재료가 모자라면 개발 재료 받기). 지은 카드 */
async function buildAt(page: Page, facility: string, cells: readonly number[]): Promise<Locator> {
  const panel = facilitiesPanel(page);
  const form = panel.locator("form.labor-form");
  const cards = panel.locator('li[data-part="facility-card"]');
  const build = form.getByRole("button", { name: message("ko", "facility_build"), exact: true });
  await form.getByLabel(message("ko", "facility_field_facility")).selectOption(facility);
  const before = await cards.count();
  for (const cell of cells) {
    await form.getByLabel(message("ko", "facility_field_x")).fill(String(cell));
    await form.getByLabel(message("ko", "facility_field_y")).fill(String(cell + 6));
    if (await build.isDisabled()) {
      await form.getByRole("button", { name: message("ko", "facility_dev_grant") }).click();
      await expect(build).toBeEnabled({ timeout: 15_000 });
    }
    await build.click();
    try {
      await expect(cards).toHaveCount(before + 1, { timeout: 4_000 });
      return cards.last();
    } catch {
      // 막힌 자리 → 다음 자리
    }
  }
  throw new Error(`no free cell for ${facility}`);
}

test.describe("플레이어: 시작 재료·구인 칸", () => {
  test.use({ account: "player" });

  test("시작 도시 창고에 소나무 원목 20·석재 10, 구인 칸에 카드와 [고용]", async ({ page, deviceErrors }) => {
    await openProduction(page);
    const city = facilitiesPanel(page).locator('[data-part="facility-places"] [data-kind="city"]').first();
    // 팩 아이템 이름(pine_log = "소나무")과 개수
    await expect(city).toContainText("소나무 20");
    await expect(city).toContainText("석재 10");
    const recruit = recruitPanel(page);
    await expect(recruit.getByRole("heading", { name: message("ko", "recruit_title") })).toBeVisible();
    await expect(recruit.locator('[data-part="recruit-meta"]')).toBeVisible({ timeout: 20_000 });
    const cards = recruit.locator('li[data-part="recruit-card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
    await expect(
      cards.first().getByRole("button", { name: message("ko", "dev_recruit_hire"), exact: true }),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(recruit, "produce-recruit-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("admin: 채집 시설 직무 배치", () => {
  test.use({ account: "admin" });

  test("벌목장을 짓고 사이보그 본체를 직무 배치 → 일꾼 1/10 → 빼기, [지도에서 고르기]는 2차맵으로", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await openProduction(page);
    const card = await buildAt(page, "lumber_camp", [34, 58, 82, 112, 146, 176, 206, 226]);
    await card.getByRole("button", { name: message("ko", "facility_dev_finish") }).click();
    await expect(card).toContainText(message("ko", "facility_card_title", { name: "벌목장", level: 1 }));
    const workers = card.locator('[data-part="facility-workers"]');
    await expect(workers).toContainText(message("ko", "facility_workers_title", { count: 0, slots: 10 }));
    // 쉬는 유닛 가운데 사이보그 본체를 골라 배치한다
    const select = workers.getByLabel(message("ko", "facility_worker_pick"));
    const cyborgLabel = message("ko", "facility_worker_option_cyborg", { stats: "X" }).replace(" · X", "");
    const cyborgValue = await select
      .locator("option", { hasText: cyborgLabel })
      .first()
      .getAttribute("value");
    if (cyborgValue === null) throw new Error("no cyborg option");
    await select.selectOption(cyborgValue);
    await workers.getByRole("button", { name: message("ko", "facility_worker_assign"), exact: true }).click();
    await expect(workers).toContainText(message("ko", "facility_worker_assign_cyborg"), { timeout: 15_000 });
    await expect(workers).toContainText(message("ko", "facility_workers_title", { count: 1, slots: 10 }));
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(card, "produce-workers-pastel-ko-390");
    await workers
      .getByRole("button", { name: message("ko", "facility_worker_unassign"), exact: true })
      .click();
    await expect(workers).toContainText(message("ko", "facility_workers_title", { count: 0, slots: 10 }), {
      timeout: 15_000,
    });

    // [지도에서 고르기] → 2차맵(고르는 중 안내)
    const form = facilitiesPanel(page).locator("form.labor-form");
    await form.getByRole("button", { name: message("ko", "facility_map_pick"), exact: true }).click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByText(message("ko", "map_build_pick_hint"))).toBeVisible({ timeout: 20_000 });
    expect(deviceErrors).toEqual([]);
  });
});

for (const look of [{ theme: "dark", language: "en" }] as const satisfies readonly {
  theme: Theme;
  language: Language;
}[]) {
  test.describe(`${look.theme}·${look.language}·390`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test("구인 칸·건물 칸이 넘치지 않는다(사진)", async ({ page, deviceErrors }) => {
      await openProduction(page);
      const recruit = recruitPanel(page);
      await expect(recruit.locator('[data-part="recruit-meta"]')).toBeVisible({ timeout: 20_000 });
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(recruit, `produce-recruit-${look.theme}-${look.language}-390`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
