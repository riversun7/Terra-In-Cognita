// 유닛·사이보그 화면 시험 — ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// - 플레이어: 실제 자료만(유닛이 없으면 빈 안내, 시안 칸은 빈 안내, 사이보그 본체는 "생기면 보입니다", 시안 스위치 없음).
// - dev + 시안 자료: 시안 유닛 10·포로·파티·프리셋·관리인·경매소, 사이보그 본체. 걸러 보기·다중 선택·상세(서버 계산 스탯).
// - admin + 실제 자료: 2차맵 [시험 일꾼 받기] 뒤 유닛 목록에 시험 일꾼(기본값 스탯 안내). dev는 vision.spec.ts가 빈 상태로 써서 admin으로.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(유닛 목록·유닛 상세·사이보그, 시안 자료). 폴더는 E2E_SHOTS_DIR.
// 복귀 요약은 시안 자료면 켤 때마다 뜨므로 이 시험들에서는 띄우지 않는다(hideSummary).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

test.beforeEach(async ({ page }) => {
  await rewriteTrpc(page, { "summary.get": hideSummary });
});

/** 화면 자료를 받아 그렸다(받는 중 줄이 사라지고 칸 판이 있다) */
async function unitsReady(page: Page): Promise<void> {
  await expect(page.locator(".units-panel")).toBeVisible();
  await expect(page.locator(".units-panel .status")).toHaveCount(0, { timeout: 15_000 });
}

async function cyborgReady(page: Page): Promise<void> {
  await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
}

/** 칸(탭) 고르기 */
const tab = (page: Page, key: string, language: Language = "ko") =>
  page.getByRole("tab", { name: new RegExp(`^${message(language, key)}`) });

test.describe("플레이어(실제 자료)", () => {
  test.use({ account: "player" });

  test("유닛이 없으면 빈 안내, 시안 칸은 빈 안내, 시안 스위치가 없다", async ({ page, deviceErrors }) => {
    await page.goto("/units");
    await unitsReady(page);
    await expect(page.locator(".roster-preview-switch")).toHaveCount(0);
    await expect(page.locator(".roster-notice")).toHaveCount(0);
    await expect(page.getByRole("tab")).toHaveCount(6);
    await expect(page.locator(".roster-empty-title")).toHaveText(message("ko", "units_empty_title"));
    await tab(page, "units_tab_parties").click();
    await expect(page.locator(".roster-empty-title")).toHaveText(message("ko", "units_parties_empty_title"));
    await tab(page, "units_tab_auction").click();
    await expect(page.locator(".roster-empty-title")).toHaveText(message("ko", "units_auction_empty_title"));
    await tab(page, "units_tab_prisoners").click();
    await expect(page.getByText(message("ko", "units_prisoners_held_empty"))).toBeVisible();
    // ←·→로 칸을 옮긴다(탭 패턴)
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "units_tab_list")).toHaveAttribute("aria-selected", "true");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("사이보그: 이름은 계정 이름, 본체는 생기면 보인다는 안내, 유닛 화면 링크", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/cyborg");
    await cyborgReady(page);
    await expect(page.locator(".cyborg-name")).toHaveText("e2e_player");
    await expect(page.getByText(message("ko", "cyborg_body_later"))).toBeVisible();
    // 환생 조건·비용은 본체가 없어도 설정값으로 보인다(D-440·D-441)
    await expect(page.locator(".cyborg-rebirth")).toContainText(
      message("ko", "cyborg_rebirth_faith_need", { need: 50 }),
    );
    await expect(page.locator(".roster-tag-preview")).toHaveCount(0);
    const link = page.locator(".cyborg-units-link");
    await expect(link).toHaveText(message("ko", "cyborg_units_link", { count: 0 }));
    await link.click();
    await expect(page).toHaveURL((url) => url.pathname === "/units");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev + 시안 자료", () => {
  test.use({ account: "dev", preview: "dev" });

  test("시안 유닛·걸러 보기·다중 선택·상세(서버 계산 스탯)·칸 다섯", async ({ page, deviceErrors }) => {
    await page.goto("/units");
    await unitsReady(page);
    await expect(page.locator(".roster-notice")).toHaveText(message("ko", "roster_preview_notice"));
    await expect(page.locator(".roster-preview-switch")).toHaveAttribute("aria-pressed", "true");
    const rows = page.locator(".units-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(10);
    // 첫 줄은 손이 필요한 유닛(포로로 잡힌 Sora)
    await expect(rows.first().locator(".units-row-name")).toHaveText("Sora");
    // 종류 = 안드로이드 → 2
    await page.getByLabel(message("ko", "units_filter_type")).selectOption("android");
    await expect(rows).toHaveCount(2);
    await page.getByLabel(message("ko", "units_filter_type")).selectOption("all");
    // 다중 선택 두 개 → 띠
    await page.getByLabel(message("ko", "units_select_one", { name: "Mina" })).check();
    await page.getByLabel(message("ko", "units_select_one", { name: "Joon" })).check();
    await expect(page.locator(".units-selection-count")).toHaveText(
      message("ko", "units_selected", { count: 2 }),
    );
    expect(await smallTapTargets(page)).toEqual([]);
    // 상세: Mina(Lv18) HP = 281(서버 계산, apps/server/src/roster/roster.test.ts와 같은 값)
    await rows.filter({ hasText: "Mina" }).locator(".units-row-main").click();
    const detail = page.locator(".units-detail");
    await expect(detail.locator(".units-detail-name")).toHaveText("Mina");
    await expect(detail.locator(".units-detail-name")).toBeFocused();
    await expect(detail.locator(".roster-secondary-row").filter({ hasText: "HP" }).first()).toContainText(
      "281",
    );
    await expect(
      detail.locator(".roster-slot").filter({ hasText: message("ko", "roster_slot_weapon") }),
    ).toContainText("시험용 검");
    expect(await horizontalOverflow(page)).toEqual([]);
    // 좁은 폭: [목록으로] → 목록, 초점은 보던 줄
    await detail.locator(".units-detail-back").click();
    await expect(rows.filter({ hasText: "Mina" }).locator(".units-row-main")).toBeFocused();
    // 칸 다섯
    await tab(page, "units_tab_parties").click();
    await expect(page.locator(".units-card")).toHaveCount(2);
    await expect(page.locator(".units-card").first()).toContainText(
      message("ko", "units_party_size", { count: 4, max: 6 }),
    );
    await tab(page, "units_tab_presets").click();
    await expect(page.locator(".roster-list-row")).toHaveCount(3);
    await tab(page, "units_tab_managers").click();
    await expect(page.getByText(message("ko", "units_manager_auto", { name: "Joon" }))).toBeVisible();
    await tab(page, "units_tab_auction").click();
    await expect(page.locator(".units-lot")).toHaveCount(5);
    await tab(page, "units_tab_prisoners").click();
    await expect(page.locator(".units-prisoner")).toHaveCount(2);
    await expect(page.getByText("Sora")).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("사이보그 시안: 레벨·인공장기·인벤토리·랭킹, 시안 스위치를 끄면 본체 안내", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/cyborg");
    await cyborgReady(page);
    await expect(page.locator(".cyborg-profile .roster-meta").first()).toContainText("Lv 23 / 50");
    await expect(page.locator(".roster-slot").filter({ hasText: "시험용 인공 심장" })).toBeVisible();
    await expect(page.getByText("곡물")).toBeVisible();
    await expect(page.locator(".cyborg-rank")).toHaveCount(4);
    // 환생(D-440·D-441): 레벨 1·가속 없음, 비용 = 최고 레벨 + 신앙도 + 화폐(양은 설정값), 종교 아이템은 추가 조건,
    // 단추는 가장 가까운 환생 시설로 가는 길(곧 열림). 신앙도는 시안 값
    const rebirth = page.locator(".cyborg-rebirth");
    // 분포는 생성 때처럼 성향을 골라 다시 굴린다(D-444 164): 다시 굴리기 횟수 = N9 3번
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_changes_body", { rerolls: 3 }));
    // 비용 양은 팩 설정값(N7 만렙 50, N34 신앙도 50·화폐 10,000)
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_level_value", { max: 50, level: 23 }));
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_faith_value", { need: 50, value: 62 }));
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_currency_value", { amount: "10,000" }));
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_items_value"));
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_place"));
    const route = rebirth.getByRole("button", {
      name: new RegExp(message("ko", "cyborg_action_rebirth_route")),
    });
    await expect(route).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".cyborg-faith")).toContainText(message("ko", "cyborg_faith"));
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await page.locator(".roster-preview-switch").click();
    await expect(page.getByText(message("ko", "cyborg_body_later"))).toBeVisible({ timeout: 15_000 });
    expect(deviceErrors).toEqual([]);
  });
});

// admin으로 받는다: dev는 vision.spec.ts가 "처음에는 내 유닛 0개"를 보므로 이 시험이 dev에게 일꾼을 주면 그 시험이 깨진다
test.describe("admin + 실제 자료", () => {
  test.use({ account: "admin" });

  test("2차맵에서 시험 일꾼을 받으면 유닛 목록에 실제 시험 일꾼이 보인다(시안 표 없음, 기본값 스탯 안내)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/map");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 15_000 });
    await page.locator(".map-dev-spawn").click();
    await expect
      .poll(async () => Number(await screen.getAttribute("data-units")), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(5);
    await page.goto("/units");
    await unitsReady(page);
    const rows = page.locator(".units-row");
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator(".units-row .roster-tag-preview")).toHaveCount(0);
    await expect(rows.first().locator(".units-row-name")).toContainText(
      message("ko", "roster_type_test_worker"),
    );
    await rows.first().locator(".units-row-main").click();
    await expect(page.locator(".units-detail")).toContainText(message("ko", "roster_stats_baseline"));
    await expect(page.locator(".units-detail")).toContainText(message("ko", "roster_job_test_gather"));
    expect(deviceErrors).toEqual([]);
  });
});

// 사진: 390·1440 × 파스텔·다크 × 한국어·영어(시안 자료)
for (const viewport of ["phone", "desktop"] as const) {
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    for (const language of ["ko", "en"] as const satisfies readonly Language[]) {
      const width = VIEWPORTS[viewport].viewport.width;
      test.describe(`사진 ${String(width)} ${theme} ${language}`, () => {
        test.use({ ...VIEWPORTS[viewport], account: "dev", preview: "dev", theme, language });

        test(`유닛·상세·사이보그 (${String(width)}·${theme}·${language})`, async ({ page, deviceErrors }) => {
          await page.goto("/units");
          await unitsReady(page);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `units-list-${String(width)}-${theme}-${language}`);
          await page.locator(".units-row").filter({ hasText: "Mina" }).locator(".units-row-main").click();
          await expect(page.locator(".units-detail-name")).toHaveText("Mina");
          expect(await horizontalOverflow(page)).toEqual([]);
          // 넓은 폭은 상세 판이 붙어 있는(sticky) 모양 그대로(화면 크기), 좁은 폭은 상세 전체
          await shot(page, `units-detail-${String(width)}-${theme}-${language}`, {
            fullPage: viewport === "phone",
          });
          await tab(page, "units_tab_parties", language).click();
          await expect(page.locator(".units-card").first()).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `units-parties-${String(width)}-${theme}-${language}`);
          await page.goto("/cyborg");
          await cyborgReady(page);
          await expect(page.locator(".cyborg-rank").first()).toBeVisible();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `cyborg-${String(width)}-${theme}-${language}`, { fullPage: true });
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
}
