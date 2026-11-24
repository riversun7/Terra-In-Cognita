// 유닛·사이보그 화면 시험 — ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// - 플레이어: 실제 자료만(유닛이 없으면 빈 안내, 시안 칸은 빈 안내, 사이보그는 전역 준비가 첫 접속으로 만든 본체, 시안 스위치 없음).
// - dev + 시안 자료: 시안 유닛 10·포로·파티·프리셋·관리인·경매소, 사이보그 본체. 걸러 보기·다중 선택·상세(서버 계산 스탯).
// - admin + 실제 자료: 구인 카드로 휴먼을 고용하면(모자란 시험 화폐는 운영자 지급) 유닛 목록에 그 휴먼("휴먼 #ID", 카드 스탯).
//   그 휴먼 상세의 [AI 작전] 판(D-5039·D-5040, encounter-4): 기본 균형 → 공격적 고르기 → 세부 조정 → 저장(프로토콜 50 unit_tactics) → 다시 열면
//   저장한 값(사진: 파스텔 한국어·다크 영어 390).
//   시험 일꾼은 없앴다(사용자 지적 2026-11-09 "시험일꾼 다 없애라고").
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(유닛 목록·유닛 상세·사이보그, 시안 자료). 폴더는 E2E_SHOTS_DIR.
// 복귀 요약은 시안 자료면 켤 때마다 뜨므로 이 시험들에서는 띄우지 않는다(hideSummary).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { ensureHuman } from "./helpers/wsCommands.ts";
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

  test("유닛은 내 사이보그 본체 한 줄뿐, 시안 칸은 빈 안내, 시안 스위치가 없다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/units");
    await unitsReady(page);
    await expect(page.locator(".roster-preview-switch")).toHaveCount(0);
    await expect(page.locator(".roster-notice")).toHaveCount(0);
    // 칸 여덟: 목록·파티·프리셋·관리자·경매·포로·융합·전투(묶음 1116k 군단 명령 3 — 실시간 세계 전투 칸)
    await expect(page.getByRole("tab")).toHaveCount(8);
    // 사이보그도 유닛이다: 전역 준비가 만든 본체가 목록 맨 위에 "본체" 표로 있다(docs/adr/2026-11-24-unit-cyborg-unify.md)
    await expect(page.locator(".units-row")).toHaveCount(1);
    await expect(page.locator('.units-row[data-self="true"] .units-row-name')).toHaveText("E2EPlayer");
    await expect(page.locator(".units-row .units-self-tag")).toHaveText(message("ko", "units_self_tag"));
    await tab(page, "units_tab_parties").click();
    await expect(page.locator(".roster-empty-title")).toHaveText(message("ko", "units_parties_empty_title"));
    await tab(page, "units_tab_auction").click();
    await expect(page.locator(".roster-empty-title")).toHaveText(message("ko", "units_auction_empty_title"));
    await tab(page, "units_tab_prisoners").click();
    await expect(page.getByText(message("ko", "units_prisoners_held_empty"))).toBeVisible();
    // ←·→로 칸을 옮긴다(탭 패턴): 포로 → 융합 → 전투 → (끝에서 처음으로) 목록
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "units_tab_fusion")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "units_tab_battles")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "units_tab_list")).toHaveAttribute("aria-selected", "true");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("사이보그 본체: 옛 /cyborg 주소는 유닛 창의 본체 줄로 넘어간다 — 이름·외형·본체(레벨 1, 스탯), 시안 표시 없음", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/cyborg");
    await expect(page).toHaveURL(
      (url) => url.pathname === "/units" && url.searchParams.get("unit") === "self",
    );
    await cyborgReady(page);
    // 메뉴에 사이보그 항목은 없다(유닛에 합쳤다)
    await expect(page.locator('a[href="/cyborg"]')).toHaveCount(0);
    // 전역 준비가 만든 사이보그(첫 접속, docs/adr/2026-11-01-first-login-cyborg.md)
    await expect(page.locator(".cyborg-name")).toHaveText("E2EPlayer");
    await expect(page.locator(".cyborg-avatar")).toBeVisible();
    await expect(page.getByText(message("ko", "cyborg_body_later"))).toHaveCount(0);
    await expect(page.locator(".cyborg .core-row")).toHaveCount(6);
    // 환생 조건·비용(D-440·D-441): 본체가 있으니 지금 신앙도(0)와 함께
    await expect(page.locator(".cyborg-rebirth")).toContainText(
      message("ko", "cyborg_rebirth_faith_value", { need: 50, value: 0 }),
    );
    await expect(page.locator(".roster-tag-preview")).toHaveCount(0);
    // 목록 동그라미는 유닛 초상이다(본체 = 만든 3D 외형)
    await expect(page.locator('.units-row[data-self="true"] .roster-avatar')).toHaveAttribute(
      "data-portrait",
      "true",
    );
    // [목록으로]를 누르면 주소에서 ?unit=이 지워진다
    await page.locator(".units-detail-back").click();
    await expect(page).toHaveURL((url) => url.pathname === "/units" && !url.searchParams.has("unit"));
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
    // 내 사이보그 본체(있으면 맨 위, "본체" 표) 다음 첫 줄은 손이 필요한 유닛(포로로 잡힌 Sora)
    await expect(
      page.locator('.units-row:not([data-self="true"])').first().locator(".units-row-name"),
    ).toHaveText("Sora");
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
    // 유닛 상세도 사이보그 판과 같은 사양 판이다(units.sheet — 핵심 사양·상세 전투 스펙)
    await expect(detail.locator('.combat-row[data-sec="hp"] .combat-value-base')).toContainText("281", {
      timeout: 15_000,
    });
    await expect(detail.locator(".core-legend")).toBeVisible();
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

  test("사이보그 시안: 레벨·인공장기·인벤토리·랭킹, 시안 스위치를 끄면 첫 접속에서 만든 본체", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/cyborg");
    await cyborgReady(page);
    await expect(page.locator(".cyborg-profile .roster-meta").first()).toContainText("Lv 23 / 50");
    await expect(page.locator(".cyborg-slot").filter({ hasText: "시험용 인공 심장" })).toBeVisible();
    await expect(page.getByText("곡물")).toBeVisible();
    await expect(page.locator(".cyborg-rank")).toHaveCount(4);
    // 환생(D-440·D-441·D-451·D-452): 레벨 1·가속 없음, 조건 = 최고 레벨 + 신앙도 문턱 + 화폐(양은 설정값), 종교 아이템 = 갈래·특수 스킬(선택),
    // 단추는 가장 가까운 환생 시설로 가는 길(곧 열림). 신앙도는 시안 값
    const rebirth = page.locator(".cyborg-rebirth");
    // 분포는 생성 때처럼 성향을 골라 다시 굴린다(D-444 164): 다시 굴리기 횟수 = N9 3번
    await expect(rebirth).toContainText(message("ko", "cyborg_rebirth_changes_body", { rerolls: 5 }));
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
    // 실제 자료: 전역 준비가 첫 접속으로 만든 본체(레벨 1, 시안 표시 없음)
    await expect(page.locator(".cyborg-name")).toHaveText("E2EDev", { timeout: 15_000 });
    await expect(page.locator(".cyborg-profile .roster-meta").first()).toContainText("Lv 1 / 50");
    await expect(page.locator(".roster-tag-preview")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

// admin으로 고용한다(dev 계정 유닛 화면은 위 시안 자료 시험이 쓴다)
test.describe("admin + 실제 자료", () => {
  test.use({ account: "admin" });

  test("구인 카드로 고용한 휴먼이 유닛 목록에 실제 휴먼으로 보인다(시안 표 없음)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    const unitId = await ensureHuman(page, "e2e_admin");
    await page.goto("/units");
    await unitsReady(page);
    await expect(page.locator(".units-row .roster-tag-preview")).toHaveCount(0);
    // 이름이 없으면 "휴먼 #ID"(admin은 구인 카드 시험에서 고용한 휴먼도 가질 수 있다 → 그 줄을 고른다)
    const name = message("ko", "roster_unnamed", {
      type: message("ko", "roster_type_human"),
      number: unitId,
    });
    const hired = page.locator(".units-row").filter({ hasText: name }).first();
    await expect(hired.locator(".units-row-name")).toContainText(name, { timeout: 15_000 });
    await hired.locator(".units-row-main").click();
    await expect(page.locator(".units-detail")).toContainText(name);
    expect(deviceErrors).toEqual([]);
  });

  // 같은 휴먼을 차례로 쓰므로 판마다 다른 프리셋을 고른다(앞 판이 저장한 값과 달라야 [저장]이 켜진다)
  for (const [theme, language, pick] of [
    ["pastel", "ko", "tactics_preset_aggressive"],
    ["dark", "en", "tactics_preset_defensive"],
  ] as const) {
    test.describe(`AI 작전 ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS.phone, theme, language });

      test(`[AI 작전] 판: 프리셋·세부 조정 → 저장 → 다시 열면 저장한 값 (${theme}·${language})`, async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(90_000);
        const unitId = await ensureHuman(page, "e2e_admin");
        await page.goto("/units");
        await unitsReady(page);
        const name = message(language, "roster_unnamed", {
          type: message(language, "roster_type_human"),
          number: unitId,
        });
        const open = async () => {
          await page
            .locator(".units-row")
            .filter({ hasText: name })
            .first()
            .locator(".units-row-main")
            .click();
          await expect(page.locator(".units-detail")).toContainText(name);
        };
        await open();
        const panel = page.locator('[data-part="unit-tactics"]');
        await expect(panel).toBeVisible();
        const preset = (key: string) =>
          panel.getByRole("button", { name: message(language, key), exact: true });
        // 저장한 적이 없으면 균형, 앞 판이 저장했으면 그 프리셋 — 하나는 눌려 있다
        await expect(panel.locator('.tactics-preset[aria-pressed="true"]')).toHaveCount(1);
        await preset(pick).click();
        await expect(preset(pick)).toHaveAttribute("aria-pressed", "true");
        await panel.locator("summary").click();
        const engage = panel.getByLabel(message(language, "tactics_slider_engage"));
        await engage.focus();
        await engage.press("End");
        await expect(engage).toHaveValue("10");
        await expect(panel).toContainText(
          message(language, "tactics_edited", { preset: message(language, pick) }),
        );
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(panel, `unit-tactics-390-${theme}-${language}`);
        await panel.getByRole("button", { name: message(language, "tactics_save"), exact: true }).click();
        await expect(panel.getByRole("status")).toHaveText(message(language, "tactics_saved"), {
          timeout: 15_000,
        });
        // 다시 받아 열면 저장한 값(고른 프리셋에서 고친 교전 10)
        await page.reload();
        await unitsReady(page);
        await open();
        await expect(preset(pick)).toHaveAttribute("aria-pressed", "true");
        await panel.locator("summary").click();
        await expect(panel.getByLabel(message(language, "tactics_slider_engage"))).toHaveValue("10");
        expect(deviceErrors).toEqual([]);
      });
    });
  }
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
