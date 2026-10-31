// 행성 편집기 화면 시험 — ADR 2026-10-29-planet-editor-stage1(38) WP-D: /dev/planet-editor(틀 숨김).
// - admin·dev가 개발자 홈에서 열고, 기기 워커 미리보기(공개본 F5 확인 → 초안 F7)가 지구본에 나온다.
// - 열 때 확인: 이 기기의 공개본 F5 해시가 서버 확인 해시와 같다(헤드리스 Chromium, 해시 값은 적지 않는다).
// - 슬라이더를 바꾸면 "바뀐 값 N개"만 생기고(미리보기·자동 저장 없음), [적용]을 누르면 새 미리보기와 자동 저장 판(서버 초안)이
//   생긴다(사용자 의견 2026-10-31). 판 되돌리기·JSON 내보내기·가져오기, 칸 쉬운 설명, 지구본 옆 평면 미니맵도 본다.
// - player는 권한 없음 화면이다(서버도 매 요청 권한을 본다: 단위·DB 시험).
// F8·F9는 느려서 넣지 않는다. 초안은 계정마다·행성마다 하나이고 실행마다 새 DB라, admin·dev 시험은 서로 섞이지 않는다.
// 표지(class·data-*)로 본다: 지구본 .pe-globe-view[data-face-level·data-sequence·data-status], 확인 칩 .pe-check-chip[data-check],
// 저장 줄 .pe-save-line[data-save-status·data-revision](초안 탭, 숨겨져 있어도 읽는다).
import type { Page } from "@playwright/test";
import { shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 처음 여는 행성 F7 미리보기는 부하에 따라 수 초다(빌드·워커 데우기 포함) */
const PREVIEW_TIMEOUT = 45_000;

const globe = (page: Page) => page.locator(".pe-globe-view");
const saveLine = (page: Page) => page.locator(".pe-save-line");
const tab = (page: Page, id: string) => page.locator(`.pe-tab[data-tab="${id}"]`);
const slider = (page: Page, key: string) => page.locator(`input.pe-range[data-key="${key}"]`);

/** 지구본이 그 면 레벨 결과를 다 그릴 때까지. 그린 결과의 받은 차례를 돌려준다 */
async function globeReady(page: Page, level: number, after = 0): Promise<number> {
  await expect(globe(page)).toHaveAttribute("data-face-level", String(level), { timeout: PREVIEW_TIMEOUT });
  await expect
    .poll(async () => Number(await globe(page).getAttribute("data-sequence")), { timeout: PREVIEW_TIMEOUT })
    .toBeGreaterThan(after);
  await expect(globe(page)).toHaveAttribute("data-status", "ready", { timeout: PREVIEW_TIMEOUT });
  return Number(await globe(page).getAttribute("data-sequence"));
}

/** 자동 저장이 끝나 서버 판이 previous보다 커질 때까지. 새 판을 돌려준다 */
async function savedAfter(page: Page, previous: number): Promise<number> {
  await expect(saveLine(page)).toHaveAttribute("data-save-status", "saved", { timeout: 20_000 });
  await expect
    .poll(async () => Number(await saveLine(page).getAttribute("data-revision")), { timeout: 20_000 })
    .toBeGreaterThan(previous);
  return Number(await saveLine(page).getAttribute("data-revision"));
}

/** 슬라이더를 키보드로 한 칸 옮긴다(적용 전 변경만 생긴다). 새 값을 돌려준다 */
async function nudge(page: Page, key: string, direction: "ArrowRight" | "ArrowLeft"): Promise<number> {
  const input = slider(page, key);
  const before = Number(await input.inputValue());
  await input.focus();
  await input.press(direction);
  await expect.poll(async () => Number(await input.inputValue())).not.toBe(before);
  await expect(page.locator(".pe-apply-bar")).toBeVisible();
  return Number(await input.inputValue());
}

/** [적용]: 적용 줄이 사라진다 */
async function applyEdits(page: Page): Promise<void> {
  await page.locator(".pe-apply").click();
  await expect(page.locator(".pe-apply-bar")).toHaveCount(0);
}

/** 확인 창의 확인 버튼 */
async function confirmDialog(page: Page): Promise<void> {
  const dialog = page.locator("dialog.pe-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await dialog.locator(".button-primary, .pe-button-danger").click();
  await expect(dialog).not.toHaveAttribute("open", "");
}

/** 편집기 판 안이 가로로 넘치지 않는다(판은 세로 스크롤 상자라 문서 넘침 검사로는 보이지 않는다) */
async function panelOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    for (const box of document.querySelectorAll<HTMLElement>(".pe-header, .pe-tabpanel:not([hidden])")) {
      if (box.scrollWidth > box.clientWidth + 1) {
        problems.push(`${box.className} ${box.scrollWidth}px > ${box.clientWidth}px`);
      }
    }
    return problems;
  });
}

test.describe("관리자", () => {
  test.use({ account: "admin" });

  test("개발자 홈에서 열면 F5 확인 → F7 미리보기, 슬라이더로 새 미리보기·자동 저장 판, 판 되돌리기, 내보내기·가져오기 왕복", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/dev");
    await page.locator('#main a.dev-tool[href="/dev/planet-editor"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/planet-editor");
    await expect(page.locator(".pe-screen")).toBeVisible();
    await expect(page.locator(".frame")).toHaveCount(0);
    // 열 때 확인(공개본 F5 = 서버 확인 해시)과 초안 F7 지구본
    await expect(page.locator(".pe-check-chip")).toHaveAttribute("data-check", "match", {
      timeout: PREVIEW_TIMEOUT,
    });
    let sequence = await globeReady(page, 7);
    await expect(saveLine(page)).toHaveAttribute("data-save-status", "saved");
    await expect(saveLine(page)).toHaveAttribute("data-revision", "0");

    // 슬라이더 → 바뀐 값 1개, 미리보기·자동 저장은 하지 않는다(Enter도 적용하지 않는다)
    const first = await nudge(page, "landPercent", "ArrowRight");
    await expect(page.locator(".pe-apply-bar")).toHaveAttribute("data-pending", "1");
    await expect(tab(page, "settings").locator(".pe-tab-badge")).toHaveText("1");
    await slider(page, "landPercent").press("Enter");
    await page.waitForTimeout(2_500);
    await expect(globe(page)).toHaveAttribute("data-sequence", String(sequence));
    await expect(saveLine(page)).toHaveAttribute("data-revision", "0");
    // [적용] → 새 F7 미리보기 + 자동 저장(판 1개)
    await applyEdits(page);
    sequence = await globeReady(page, 7, sequence);
    const firstSequence = sequence;
    const revision1 = await savedAfter(page, 0);
    // 두 번째 변경 → 새 판
    const second = await nudge(page, "landPercent", "ArrowRight");
    expect(second).toBe(first + 1);
    await applyEdits(page);
    await globeReady(page, 7, sequence);
    const revision2 = await savedAfter(page, revision1);

    // 면적표: 바이옴 줄과 공개본 대비 차이가 있다
    await tab(page, "area").click();
    await expect(page.locator(".pe-area-table tbody tr")).not.toHaveCount(0);
    await expect(page.locator(".pe-area-table td[data-diff]").first()).toBeVisible();

    // 판 되돌리기: 판 1로 → 새 판, 슬라이더 값이 그때 값
    await tab(page, "draft").click();
    await page.locator(".pe-revisions-load").click();
    const row = page.locator(`.pe-revision[data-revision="${revision1}"]`);
    await expect(row).toBeVisible();
    await expect(page.locator(`.pe-revision[data-revision="${revision2}"]`)).toBeVisible();
    await row.locator("button").click();
    await confirmDialog(page);
    const revision3 = await savedAfter(page, revision2);
    await expect(slider(page, "landPercent")).toHaveValue(String(first));
    // 그 값의 F7 결과는 기억에 있어 다시 만들지 않고 그대로 보인다(받은 차례가 그때 것)
    await expect(globe(page)).toHaveAttribute("data-sequence", String(firstSequence));

    // 내보내기(확인이 같음이라 막히지 않는다)
    await tab(page, "draft").click();
    await page.locator(".pe-export").click();
    const exported = await page.locator(".pe-export-text").inputValue();
    const bundle: unknown = JSON.parse(exported);
    expect(bundle).toMatchObject({
      format: "terra-planet-draft",
      formatVersion: 1,
      planet: { id: "s2_editor_planet" },
    });
    expect(Reflect.get(Object(bundle), "checks")).not.toHaveLength(0);

    // 값을 바꿔 저장한 뒤, 내보낸 것을 가져오면 그 값으로 돌아온다(새 판)
    await tab(page, "settings").click();
    await nudge(page, "landPercent", "ArrowLeft");
    await applyEdits(page);
    const revision4 = await savedAfter(page, revision3);
    await tab(page, "draft").click();
    await page.locator(".pe-import-text").fill(exported);
    await page.locator(".pe-import").click();
    await confirmDialog(page);
    await savedAfter(page, revision4);
    await expect(slider(page, "landPercent")).toHaveValue(String(first));
    await page.locator(".pe-export").click();
    const again: unknown = JSON.parse(await page.locator(".pe-export-text").inputValue());
    expect(Reflect.get(Object(again), "planet")).toEqual(Reflect.get(Object(bundle), "planet"));

    // 칸 정보: 미니맵을 누르면 칸 값과 바이옴 판정 설명(저장 바이옴과 같음)
    await tab(page, "area").click();
    await page.locator(".pe-area-map .flat-map-canvas").click({ position: { x: 40, y: 30 } });
    await tab(page, "cell").click();
    await expect(page.locator(".pe-cell")).toBeVisible();
    // 쉬운 설명이 먼저, 날것의 표는 [자세히 보기] 아래(처음 접힘)
    await expect(page.locator(".pe-story p").first()).not.toBeEmpty();
    await expect(page.locator(".pe-details")).not.toHaveAttribute("open", "");
    await expect(page.locator(".pe-cell-values")).toBeHidden();
    await page.locator(".pe-details-summary").click();
    await expect(page.locator(".pe-cell-values")).toBeVisible();
    await expect(page.locator(".pe-explain-stored")).toHaveAttribute("data-matches", "true");

    // 휴대폰: 지구본 자리를 [평면]으로 바꾸면 평면 미니맵이 덮는다
    await expect(page.locator(".pe-stage-map")).toBeHidden();
    await page.locator('.pe-view-toggle button[data-view="flat"]').click();
    await expect(page.locator(".pe-stage-map .flat-map-canvas")).toBeVisible();
    await page.locator('.pe-view-toggle button[data-view="globe"]').click();
    await expect(page.locator(".pe-stage-map")).toBeHidden();

    // [뒤로]: 저장이 끝났으니 묻지 않고 개발자 홈으로
    await page.locator(".pe-back").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev");
    expect(deviceErrors).toEqual([]);
  });

  // 사진: 휴대폰 세로 390px·데스크톱 1440px × 기본 테마 둘 × 한국어·영어(E2E_SHOTS_DIR). 휴대폰은 판 넘침·누르는 곳도 본다
  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`사진 ${theme} ${language}`, () => {
        test.use({ theme, language });

        test(`390px 세로 (${theme}·${language})`, async ({ page }) => {
          test.setTimeout(120_000);
          await page.goto("/dev/planet-editor");
          await globeReady(page, 7);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          expect(await panelOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `planet-editor-390-${theme}-${language}-settings`);
          // 값을 바꾸면 적용 줄이 판 아래에 붙는다
          await nudge(page, "precipitationPercent", "ArrowRight");
          await shot(page, `planet-editor-390-${theme}-${language}-pending`);
          await page.locator(".pe-discard").click();
          await expect(page.locator(".pe-apply-bar")).toHaveCount(0);
          await page.locator('.pe-view-toggle button[data-view="flat"]').click();
          await shot(page, `planet-editor-390-${theme}-${language}-flat`);
          await tab(page, "area").click();
          await expect(page.locator(".pe-area-table")).toBeVisible();
          expect(await panelOverflow(page)).toEqual([]);
          await shot(page, `planet-editor-390-${theme}-${language}-area`);
          await tab(page, "draft").click();
          expect(await panelOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
        });

        test.describe("데스크톱", () => {
          test.use(VIEWPORTS.desktop);

          test(`1440px (${theme}·${language})`, async ({ page }) => {
            test.setTimeout(120_000);
            await page.goto("/dev/planet-editor");
            await globeReady(page, 7);
            // 넓은 화면: 설정 탭에서도 지구본 아래에 평면 미니맵이 있고, 보기 단추·면적 탭 미니맵은 없다
            await expect(page.locator(".pe-stage-map .flat-map-canvas")).toBeVisible();
            await expect(page.locator(".pe-view-toggle")).toBeHidden();
            await shot(page, `planet-editor-1440-${theme}-${language}-settings`);
            // 적용 줄은 지구본·미니맵 아래(판 밖)에 한 줄로 붙는다
            await nudge(page, "precipitationPercent", "ArrowRight");
            await expect(page.locator(".pe-stage .pe-apply-bar")).toBeVisible();
            await shot(page, `planet-editor-1440-${theme}-${language}-pending`);
            await page.locator(".pe-discard").click();
            await expect(page.locator(".pe-apply-bar")).toHaveCount(0);
            await tab(page, "area").click();
            await expect(page.locator(".pe-area-table")).toBeVisible();
            await expect(page.locator(".pe-area-map")).toBeHidden();
            // 땅 쪽 한 점(팩 편집 전용 행성의 서쪽 대륙)을 골라 칸 쉬운 설명을 찍는다
            const canvas = page.locator(".pe-stage-map .flat-map-canvas");
            const box = await canvas.boundingBox();
            if (!box) throw new Error("미니맵 캔버스가 없습니다");
            await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.5 } });
            expect(await panelOverflow(page)).toEqual([]);
            await shot(page, `planet-editor-1440-${theme}-${language}-area`);
            await tab(page, "cell").click();
            await shot(page, `planet-editor-1440-${theme}-${language}-cell`);
          });
        });
      });
    }
  }
});

test.describe("개발자(dev)", () => {
  test.use({ account: "dev" });

  test("행성 편집기: 슬라이더는 [적용]을 기다리고, 프리셋 단계·시드 [무작위]는 누르면 바로 적용된다(적용 전 슬라이더 변경도 함께)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    await page.goto("/dev");
    await page.locator('#main a.dev-tool[href="/dev/planet-editor"]').click();
    await expect(page.locator(".pe-check-chip")).toHaveAttribute("data-check", "match", {
      timeout: PREVIEW_TIMEOUT,
    });
    let sequence = await globeReady(page, 7);
    // 슬라이더 → 적용 줄(지구본 자리 아래, 판 밖) → [적용] → 새 미리보기·판
    await nudge(page, "precipitationPercent", "ArrowRight");
    await expect(page.locator(".pe-stage .pe-apply-bar")).toBeVisible();
    await expect(page.locator(".pe-tabpanel .pe-apply-bar")).toHaveCount(0);
    await applyEdits(page);
    sequence = await globeReady(page, 7, sequence);
    let revision = await savedAfter(page, 0);
    // 슬라이더를 바꿔 둔 채 프리셋 단계를 누르면 둘 다 바로 적용된다(미리보기 한 번, 판 하나)
    const plates = await nudge(page, "plateCount", "ArrowRight");
    await page.locator('.pe-choice-input[value="wet"]').check();
    await expect(page.locator(".pe-apply-bar")).toHaveCount(0);
    sequence = await globeReady(page, 7, sequence);
    revision = await savedAfter(page, revision);
    await expect(slider(page, "plateCount")).toHaveValue(String(plates));
    await expect(page.locator('.pe-choice-input[value="wet"]')).toBeChecked();
    // 시드 [무작위] → 바로 새 미리보기·판
    const seed = await page.locator(".pe-seed-input").inputValue();
    await page.locator(".pe-seed-random").click();
    await expect(page.locator(".pe-seed-input")).not.toHaveValue(seed);
    await globeReady(page, 7, sequence);
    await savedAfter(page, revision);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("/dev/planet-editor는 권한 없음 화면이다(편집기 조각을 받지 않는다)", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (request) => {
      if (/PlanetEditorScreen|planetEditorWorker/.test(request.url())) requested.push(request.url());
    });
    await page.goto("/dev/planet-editor");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".pe-screen")).toHaveCount(0);
    expect(requested).toEqual([]);
  });
});
