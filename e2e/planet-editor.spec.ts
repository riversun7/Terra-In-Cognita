// 행성 편집기 화면 시험 — ADR 2026-10-29-planet-editor-stage1(38) WP-D·"바뀜: 행성 보관함": /dev/planet-editor(틀 숨김).
// - 보관함(팀 공용 목록): 빈 보관함 → [새 행성](이름·시작점) → 작업 사본(이 기기) → [저장]이 판 1을 만든다. 고친 값은 서버에
//   쓰지 않고 작업 사본에만 남으며 새로고침해도 이어진다. [저장]마다 판 하나, 저장 기록에서 판 불러오기, [다른 이름으로 저장],
//   이름 바꾸기, 다른 탭이 먼저 저장했을 때 충돌 → [덮어쓰기], 지우기(만든 사람·admin만), JSON 내보내기·가져오기.
// - 기기 워커 미리보기(기준 팩 행성 F5 확인 → 작업 사본 F7), 슬라이더는 [적용]을 기다리고 누르는 조작은 바로 적용된다.
// - dev는 admin이 만든 행성을 보고(만든 사람 표시) 고쳐 저장할 수 있지만 지울 수는 없다. player는 권한 없음 화면이다.
// - 대륙 모양(ADR 2026-10-31-continent-layouts): 누르면 바로 적용, 대륙 수 슬라이더는 [적용]을 기다린다.
// - 행성 표본(ADR 38 "행성 표본"): [새 행성]의 시작점에 태양계 암석 행성 표본이 팩 행성 아래 묶음으로 있고, 고르면 한 줄 특징이
//   보인다. 화성 표본에서 시작해 저장하면 보관함에 시작점 종류 template로 남는다. 확인한 뒤 지워 다른 시험의 첫 행성을 그대로 둔다.
// 고르기 값은 "종류:ID"(pack:s2_editor_planet, template:solar_mars).
// F8·F9는 느려서 넣지 않는다. 실행마다 새 DB라 보관함은 빈 채로 시작한다(admin 시험이 먼저 돈다).
// 표지(class·data-*)로 본다: 지구본 .pe-globe-view[data-face-level·data-sequence·data-status], 확인 칩 .pe-check-chip[data-check],
// 저장 상태 칩 .pe-save-chip[data-save-status: new·dirty·saved·saving·failed], 행성 판의 판 번호 .pe-library-info [data-revision].
import type { Page } from "@playwright/test";
import { shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { watchTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 처음 여는 행성 F7 미리보기는 부하에 따라 수 초다(빌드·워커 데우기 포함) */
const PREVIEW_TIMEOUT = 45_000;

const globe = (page: Page) => page.locator(".pe-globe-view");
const saveChip = (page: Page) => page.locator(".pe-save-chip");
const revision = (page: Page) => page.locator(".pe-library-info [data-revision]");
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

/** [저장]을 누르고 저장이 끝나(저장됨) 판이 expected가 될 때까지 */
async function saveAndExpect(page: Page, expected: number): Promise<void> {
  await page.locator(".pe-save").click();
  await expect(saveChip(page)).toHaveAttribute("data-save-status", "saved", { timeout: 20_000 });
  await expect(revision(page)).toHaveAttribute("data-revision", String(expected));
}

/** 이름 창에 이름을 넣고 확인한다 */
async function answerName(page: Page, name: string): Promise<void> {
  // 이름 창은 목록 화면과 편집 화면에 하나씩 있다: 열린 것 하나를 고른다
  const dialog = page.locator("dialog.pe-prompt[open]");
  await expect(dialog).toHaveCount(1);
  await dialog.locator(".pe-name-input").fill(name);
  await dialog.locator(".pe-prompt-confirm").click();
  await expect(page.locator("dialog.pe-prompt[open]")).toHaveCount(0);
}

/** 편집기를 열고 행성 하나를 연다(보관함이 비어 있으면 새 행성을 만들어 저장한다) */
async function openSomePlanet(page: Page): Promise<void> {
  await page.goto("/dev/planet-editor");
  const empty = page.locator(".pe-empty .pe-new-planet");
  await expect(empty.or(page.locator(".pe-save-chip"))).toBeVisible({ timeout: PREVIEW_TIMEOUT });
  if (await empty.isVisible()) {
    await empty.click();
    await answerName(page, "지구형 행성 1");
    await page.locator(".pe-save").click();
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "saved", { timeout: 20_000 });
  }
}

/** 머리 줄 행성 고르기에서 지금 고른 줄의 글 */
const selectedPlanet = (page: Page) =>
  page.locator(".pe-planet-select").evaluate((element) => {
    const select = element instanceof HTMLSelectElement ? element : null;
    return select?.selectedOptions[0]?.textContent ?? "";
  });

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

/** 열린 확인 창(이름 창 말고) */
const openConfirm = (page: Page) => page.locator("dialog.pe-dialog:not(.pe-prompt)[open]");

/** 확인 창의 확인 버튼 */
async function confirmDialog(page: Page): Promise<void> {
  const dialog = openConfirm(page);
  await expect(dialog).toHaveCount(1);
  await dialog.locator(".button-primary, .pe-button-danger").click();
  await expect(openConfirm(page)).toHaveCount(0);
}

/**
 * [새 행성] 창(열린 채)의 사진 둘: 화성 표본을 고른 모습(특징 줄), 시작점 목록 모양. 기본 고르기의 펼친 목록은 브라우저가
 * 따로 그려 사진에 남지 않아서, 목록 사진만 size를 주어 목록 상자로 펼친다(사진용, 화면 코드는 그대로).
 */
async function pickerShots(page: Page, prefix: string): Promise<void> {
  const select = page.locator("dialog.pe-prompt[open] .pe-base-select");
  await select.selectOption("template:solar_mars");
  await expect(page.locator("dialog.pe-prompt[open] .pe-base-note")).toBeVisible();
  await shot(page, `${prefix}-new-template`);
  // 둥근 알약 모양 그대로 펼치면 글이 잘려 보여 사진에서만 모서리를 편다
  await select.evaluate((element) => {
    element.setAttribute("size", "9");
    element.setAttribute("style", "border-radius: 0");
  });
  await shot(page, `${prefix}-new-list`);
  await select.evaluate((element) => {
    element.removeAttribute("size");
    element.removeAttribute("style");
  });
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

  test("보관함: [새 행성] → [저장] 판 1, 고친 값은 작업 사본(새로고침해도 남음) → 판 2, 판 불러오기 → 판 3, 다른 이름으로 저장·이름 바꾸기·충돌 덮어쓰기·지우기, 내보내기·가져오기", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const calls = watchTrpc(page);
    await page.goto("/dev");
    await page.locator('#main a.dev-tool[href="/dev/planet-editor"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/planet-editor");
    await expect(page.locator(".frame")).toHaveCount(0);
    // 빈 보관함 → [새 행성](이름·시작점) → 저장하지 않은 작업 사본
    await page.locator(".pe-empty .pe-new-planet").click();
    await expect(page.locator("dialog.pe-prompt[open] .pe-base-select")).toHaveValue("pack:s2_editor_planet");
    await answerName(page, "지구형 행성 1");
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "new");
    await expect(page.locator(".pe-check-chip")).toHaveAttribute("data-check", "match", {
      timeout: PREVIEW_TIMEOUT,
    });
    let sequence = await globeReady(page, 7);
    expect(calls.some((call) => call.procedures.includes("planetEditor.library.create"))).toBe(false);
    await tab(page, "planet").click();
    await saveAndExpect(page, 1);
    expect(await selectedPlanet(page)).toContain("지구형 행성 1");

    // 슬라이더 → 적용 전 → [적용](작업 사본만 바뀐다, 서버에 쓰지 않는다)
    await tab(page, "settings").click();
    const first = await nudge(page, "landPercent", "ArrowRight");
    await expect(tab(page, "settings").locator(".pe-tab-badge")).toHaveText("1");
    await slider(page, "landPercent").press("Enter");
    await expect(globe(page)).toHaveAttribute("data-sequence", String(sequence));
    await applyEdits(page);
    sequence = await globeReady(page, 7, sequence);
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "dirty");
    expect(calls.filter((call) => call.procedures.includes("planetEditor.library.save"))).toHaveLength(0);
    // 새로고침해도 작업 사본이 남는다(이 기기)
    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "dirty", { timeout: PREVIEW_TIMEOUT });
    await expect(slider(page, "landPercent")).toHaveValue(String(first));
    sequence = await globeReady(page, 7);
    await saveAndExpect(page, 2);

    // 저장 기록: 판 1 불러오기 → 작업 사본이 그 판(저장 안 함) → [저장] → 판 3
    await tab(page, "planet").click();
    await page.locator(".pe-versions-load").click();
    await expect(page.locator(".pe-revision")).toHaveCount(2);
    await page.locator('.pe-revision[data-revision="1"] button').click();
    await confirmDialog(page);
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "dirty");
    await expect(slider(page, "landPercent")).toHaveValue(String(first - 1));
    await saveAndExpect(page, 3);

    // [다른 이름으로 저장] → 새 행성(판 1)으로 옮긴다, 이름 바꾸기
    await page.locator(".pe-save-as").click();
    await answerName(page, "지구형 행성 2");
    await expect(page.locator(".pe-library-name")).toHaveText("지구형 행성 2", { timeout: PREVIEW_TIMEOUT });
    await expect(revision(page)).toHaveAttribute("data-revision", "1");
    // 다른 행성으로 옮기면 화면을 새로 만든다(설정 탭부터)
    await tab(page, "planet").click();
    await page.locator(".pe-rename").click();
    await answerName(page, "지구형 행성 2b");
    await expect(page.locator(".pe-library-name")).toHaveText("지구형 행성 2b");
    await expect.poll(() => selectedPlanet(page)).toContain("지구형 행성 2b");

    // 충돌: 다른 탭(같은 기기)이 먼저 저장 → 이 탭의 [저장]은 충돌 → [덮어쓰기]
    sequence = await globeReady(page, 7);
    const other = await page.context().newPage();
    await other.goto("/dev/planet-editor");
    await expect(other.locator(".pe-library-name")).toHaveText("지구형 행성 2b", {
      timeout: PREVIEW_TIMEOUT,
    });
    await globeReady(other, 7);
    await nudge(other, "plateCount", "ArrowRight");
    await applyEdits(other);
    await saveAndExpect(other, 2);
    await other.close();
    await tab(page, "settings").click();
    await nudge(page, "hotspotCount", "ArrowRight");
    await applyEdits(page);
    await page.locator(".pe-save").click();
    const conflict = openConfirm(page);
    await expect(conflict).toHaveCount(1);
    await expect(conflict.locator(".pe-dialog-extra")).toBeVisible();
    await conflict.locator(".button-primary").click();
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "saved", { timeout: 20_000 });
    await tab(page, "planet").click();
    await expect(revision(page)).toHaveAttribute("data-revision", "3");

    // 지우기(만든 사람) → 목록에서 빠지고 남은 행성을 연다
    await page.locator(".pe-remove").click();
    await confirmDialog(page);
    await expect(page.locator(".pe-library-name")).toHaveText("지구형 행성 1", { timeout: PREVIEW_TIMEOUT });
    await expect(page.locator(".pe-planet-select option")).toHaveCount(1);

    // 내보내기 → 값 바꿈 → 가져오기 → 작업 사본이 내보낸 것과 같아져 저장 안 한 변경이 없다
    sequence = await globeReady(page, 7);
    await tab(page, "planet").click();
    await page.locator(".pe-export").click();
    const exported = await page.locator(".pe-export-text").inputValue();
    const bundle: unknown = JSON.parse(exported);
    expect(bundle).toMatchObject({
      format: "terra-planet-draft",
      formatVersion: 1,
      planet: { id: "s2_editor_planet" },
      library: { name: "지구형 행성 1", revision: 3 },
    });
    await tab(page, "settings").click();
    await nudge(page, "landPercent", "ArrowLeft");
    await applyEdits(page);
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "dirty");
    await tab(page, "planet").click();
    await page.locator(".pe-import-text").fill(exported);
    await page.locator(".pe-import").click();
    await confirmDialog(page);
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "saved");

    // 칸 정보: 미니맵을 누르면 쉬운 설명 먼저, 날것의 표는 [자세히 보기]
    await tab(page, "area").click();
    await page.locator(".pe-area-map .flat-map-canvas").click({ position: { x: 40, y: 30 } });
    await tab(page, "cell").click();
    await expect(page.locator(".pe-story p").first()).not.toBeEmpty();
    await page.locator(".pe-details-summary").click();
    await expect(page.locator(".pe-explain-stored")).toHaveAttribute("data-matches", "true");

    // [뒤로]: 저장 안 한 변경이 없으니 묻지 않는다
    await page.locator(".pe-back").click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev");
    // 충돌 저장의 409는 브라우저가 콘솔에 남긴다(일부러 낸 충돌이라 뺀다)
    const conflictLog = /status of 409 .*planetEditor\.library\.save/;
    expect(deviceErrors.filter((error) => !conflictLog.test(error.text))).toEqual([]);
  });

  test("행성 표본: [새 행성]에서 화성 표본을 고르면 특징이 보이고, [저장]하면 보관함에 시작점 종류 template로 남는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    const calls = watchTrpc(page);
    await openSomePlanet(page);
    await globeReady(page, 7);
    await tab(page, "planet").click();
    await page.locator(".pe-tabpanel .pe-new-planet").click();
    const dialog = page.locator("dialog.pe-prompt[open]");
    // 팩 행성 묶음, 그다음 표본 묶음(수성·금성·지구·화성·명왕성). 팩 행성을 고른 동안은 특징 줄이 없다
    await expect(dialog.locator(".pe-base-select optgroup")).toHaveCount(2);
    await expect(dialog.locator('.pe-base-select optgroup option[value^="template:"]')).toHaveCount(5);
    await expect(dialog.locator(".pe-base-note")).toHaveCount(0);
    await dialog.locator(".pe-base-select").selectOption("template:solar_mars");
    await expect(dialog.locator(".pe-base-note")).toContainText("춥고 마른 행성");
    await answerName(page, "화성에서 시작");
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "new");
    // 표본도 서버가 F5 확인 해시를 준다(굽지 않음): 기기 F5 결과와 같다
    await expect(page.locator(".pe-check-chip")).toHaveAttribute("data-check", "match", {
      timeout: PREVIEW_TIMEOUT,
    });
    await globeReady(page, 7);
    // 화성 표본은 대륙 모양이 한쪽 반구다(정의를 그대로 가져왔다)
    await tab(page, "settings").click();
    await expect(page.locator('.pe-choice-input[value="hemisphere"]')).toBeChecked();
    await tab(page, "planet").click();
    await saveAndExpect(page, 1);
    await expect(page.locator(".pe-library-info")).toContainText("화성 표본");
    const create = calls.find((call) => call.procedures.includes("planetEditor.library.create"));
    expect(create?.inputs[create.procedures.indexOf("planetEditor.library.create")]).toMatchObject({
      name: "화성에서 시작",
      base: { kind: "template", id: "solar_mars" },
    });
    // 서버 보관함 목록에도 시작점 종류 template로 있다
    const response = await page.request.get("/api/trpc/planetEditor.library.list");
    expect(response.ok()).toBe(true);
    const listed: unknown = await response.json();
    expect(listed).toMatchObject({
      result: {
        data: expect.arrayContaining([
          expect.objectContaining({ name: "화성에서 시작", base: { kind: "template", id: "solar_mars" } }),
        ]),
      },
    });
    // 지운다(만든 사람): 남은 행성을 연다. 저장한 새 행성은 보관함 행성으로 옮겨 화면을 새로 만든다(설정 탭부터)
    await tab(page, "planet").click();
    await page.locator(".pe-remove").click();
    await confirmDialog(page);
    await expect(page.locator(".pe-library-name")).toHaveText("지구형 행성 1", { timeout: PREVIEW_TIMEOUT });
    expect(deviceErrors).toEqual([]);
  });

  test("대륙 모양: 누르면 바로 적용하고 대륙 수 슬라이더는 [적용]을 기다린다. 노이즈로 돌아오면 대륙 수가 없다", async ({
    page,
    deviceErrors,
  }) => {
    // ADR 2026-10-31-continent-layouts: 판 개수 프리셋 줄 대신 대륙 모양 줄, 판 개수는 세부 수치에 남는다
    test.setTimeout(150_000);
    await openSomePlanet(page);
    const initial = await globeReady(page, 7);
    await tab(page, "settings").click();
    await expect(page.locator('.pe-choice-input[value="few"]')).toHaveCount(0);
    await expect(slider(page, "plateCount")).toBeVisible();
    // 팩 정의 그대로면 노이즈: 대륙 수 슬라이더가 없다
    await expect(page.locator('.pe-choice-input[value="noise"]')).toBeChecked();
    await expect(slider(page, "continentCount")).toHaveCount(0);
    // 초대륙: 누르면 바로 새 미리보기, 대륙 수는 기본 1
    await page.locator('.pe-choice-input[value="supercontinent"]').check();
    await expect(page.locator(".pe-apply-bar")).toHaveCount(0);
    const supercontinent = await globeReady(page, 7, initial);
    await expect(slider(page, "continentCount")).toHaveValue("1");
    // 대륙 수 슬라이더는 다른 슬라이더처럼 [적용]을 기다린다
    expect(await nudge(page, "continentCount", "ArrowRight")).toBe(2);
    await expect(globe(page)).toHaveAttribute("data-sequence", String(supercontinent));
    await applyEdits(page);
    await globeReady(page, 7, supercontinent);
    // [되돌리기]는 누르는 조작이라 바로 적용(기본 1 = 앞의 초대륙 정의라 기억한 결과를 다시 그린다)
    const group = page.locator(".pe-preset", { has: slider(page, "continentCount") });
    await group.locator(".button-text").click();
    await expect(slider(page, "continentCount")).toHaveValue("1");
    await expect(globe(page)).toHaveAttribute("data-sequence", String(supercontinent), {
      timeout: PREVIEW_TIMEOUT,
    });
    // 노이즈로 돌아오면 대륙 수 슬라이더가 없고, 처음 정의(팩 그대로)의 결과를 그린다
    await page.locator('.pe-choice-input[value="noise"]').check();
    await expect(slider(page, "continentCount")).toHaveCount(0);
    await expect(globe(page)).toHaveAttribute("data-sequence", String(initial), { timeout: PREVIEW_TIMEOUT });
    await expect(globe(page)).toHaveAttribute("data-status", "ready", { timeout: PREVIEW_TIMEOUT });
    expect(deviceErrors).toEqual([]);
  });

  // 사진: 휴대폰 세로 390px·데스크톱 1440px × 기본 테마 둘 × 한국어·영어(E2E_SHOTS_DIR). 휴대폰은 판 넘침·누르는 곳도 본다
  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`사진 ${theme} ${language}`, () => {
        test.use({ theme, language });

        test(`390px 세로 (${theme}·${language})`, async ({ page }) => {
          test.setTimeout(120_000);
          await openSomePlanet(page);
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
          await tab(page, "planet").click();
          expect(await panelOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `planet-editor-390-${theme}-${language}-planet`);
          await page.locator(".pe-tabpanel .pe-new-planet").click();
          await expect(page.locator("dialog.pe-prompt[open]")).toHaveCount(1);
          await shot(page, `planet-editor-390-${theme}-${language}-new`);
          await pickerShots(page, `planet-editor-390-${theme}-${language}`);
          await page.keyboard.press("Escape");
          // 대륙 모양: 지구형(대륙 몇 개)을 고르면 대륙 수 슬라이더가 나온다
          await tab(page, "settings").click();
          const sequence = Number(await globe(page).getAttribute("data-sequence"));
          await page.locator('.pe-choice-input[value="earthlike"]').check();
          await globeReady(page, 7, sequence);
          await slider(page, "continentCount").scrollIntoViewIfNeeded();
          expect(await panelOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `planet-editor-390-${theme}-${language}-continents`);
        });

        test.describe("데스크톱", () => {
          test.use(VIEWPORTS.desktop);

          test(`1440px (${theme}·${language})`, async ({ page }) => {
            test.setTimeout(120_000);
            await openSomePlanet(page);
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
            // [새 행성] 시작점: 화성 표본을 고른 모습 + 목록 모양
            await tab(page, "planet").click();
            await page.locator(".pe-tabpanel .pe-new-planet").click();
            await expect(page.locator("dialog.pe-prompt[open]")).toHaveCount(1);
            await pickerShots(page, `planet-editor-1440-${theme}-${language}`);
            await page.keyboard.press("Escape");
            await expect(page.locator("dialog.pe-prompt[open]")).toHaveCount(0);
            // 대륙 모양: 초대륙
            await tab(page, "settings").click();
            const sequence = Number(await globe(page).getAttribute("data-sequence"));
            await page.locator('.pe-choice-input[value="supercontinent"]').check();
            await globeReady(page, 7, sequence);
            await slider(page, "continentCount").scrollIntoViewIfNeeded();
            expect(await panelOverflow(page)).toEqual([]);
            await shot(page, `planet-editor-1440-${theme}-${language}-continents`);
          });
        });
      });
    }
  }
});

test.describe("개발자(dev)", () => {
  test.use({ account: "dev" });

  test("팀 공용 목록: admin이 만든 행성을 보고(만든 사람 표시) 고쳐 저장한다. 지우기는 없다. 슬라이더는 [적용], 프리셋·시드는 바로", async ({
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
    expect(await selectedPlanet(page)).toContain("지구형 행성 1");
    await tab(page, "planet").click();
    await expect(page.locator(".pe-library-info")).toContainText("e2e_admin");
    await expect(page.locator(".pe-remove")).toHaveCount(0);
    const before = Number(await revision(page).getAttribute("data-revision"));
    await tab(page, "settings").click();
    // 슬라이더 → 적용 줄(지구본 자리 아래, 판 밖)
    const plates = await nudge(page, "plateCount", "ArrowRight");
    await expect(page.locator(".pe-stage .pe-apply-bar")).toBeVisible();
    await expect(page.locator(".pe-tabpanel .pe-apply-bar")).toHaveCount(0);
    // 프리셋 단계를 누르면 슬라이더 변경과 함께 바로 적용(미리보기 한 번)
    await page.locator('.pe-choice-input[value="wet"]').check();
    await expect(page.locator(".pe-apply-bar")).toHaveCount(0);
    sequence = await globeReady(page, 7, sequence);
    await expect(slider(page, "plateCount")).toHaveValue(String(plates));
    // 시드 [무작위] → 바로 새 미리보기
    const seed = await page.locator(".pe-seed-input").inputValue();
    await page.locator(".pe-seed-random").click();
    await expect(page.locator(".pe-seed-input")).not.toHaveValue(seed);
    await globeReady(page, 7, sequence);
    await expect(saveChip(page)).toHaveAttribute("data-save-status", "dirty");
    await tab(page, "planet").click();
    await saveAndExpect(page, before + 1);
    await expect(page.locator(".pe-library-info")).toContainText("e2e_dev");
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
