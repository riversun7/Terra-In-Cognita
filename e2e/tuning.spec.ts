// 설정 칸 패널 화면 시험 — /dev/tuning (docs/adr/2026-11-01-dev-settings-panel.md 12절·"바뀜: D-462").
// - dev: N39 기본액을 새 값 칸에 넣고 [담기] → [적용]하면 그 세계에 바로 든다(사이보그 만들기 화면의 정착 지원금 72 × 1.5 = 108 → 135).
//   [되돌리기] → [적용]이면 팩 값(108). 서로 묶인 칸(N9 합·칸 최대)은 하나만 보내면 규칙 문제로 거절되고 함께 보내면 받는다.
//   구조 값은 확인 창. [내보내기]는 팩 차이 JSON. [모두 되돌리기]. 49 칸 목록(연결됨·값 없음·연결 없음).
// - 분야 페이지(2026-11-08): 분야(전체·세력·사회·NPC 두뇌·정원사·보유 아이템·전투 코어·경제 코어·기타)마다 그 분야 칸만, 칸 줄에 쉬운 풀이·단위·출처.
//   넓은 폭은 왼쪽 목록(↑↓ 키로 옮김), 휴대폰은 고르기 상자. 고른 분야는 다시 열어도 남는다(localStorage).
// - 화면 개편(2026-11-08): 찾기(풀이·출처 포함)·바꾼 것만·반영 범위·단위 거르기, 거르기 지우기, 값 칸 바로 검사(정수·범위),
//   키("/" 찾기, Enter 담고 다음 줄, ↑↓ 값 한 걸음, Esc 되돌림, Ctrl+Z, Ctrl+S 적용), 값 칸 조작(단추·막대·이름 끌기), 담은 변경 막대(펼쳐 칸마다 담기 취소, 모두 취소),
//   휴대폰 390px에서 화면 안 누르는 곳 44px.
// - player: 권한 없음 화면, tRPC tuning.*는 403.
// - 사진: 390·1440 × 개발 화면 테마 둘(네온 다크·라이트, ADR 2026-11-02-dev-ui) × 한국어·영어(E2E_SHOTS_DIR), 화면 크기.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(다른 줄기의 지원금·환생 값 시험을 흔들지 않게).
import type { Page } from "@playwright/test";
import { clickSlider, dragBy, dragSlider } from "./helpers/inputs.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). 결과 data 또는 오류 코드 */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
): Promise<{ status: number; data: unknown; code: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const field = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const mutation = body !== undefined;
      const response = await fetch(
        `/api/trpc/${name}`,
        mutation
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: field(field(json, "result"), "data"),
        code: field(field(field(json, "error"), "data"), "code"),
      };
    },
    { procedure, input },
  );
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 덮어쓰기를 모두 지운다(세계 설정 판을 읽어 보낸다) */
async function resetTuning(page: Page): Promise<void> {
  const list = await trpc(page, "tuning.list");
  const revision = field(list.data, "revision");
  if (typeof revision !== "number") throw new Error(`tuning.list ${list.status}`);
  const entries = field(list.data, "entries");
  const changed =
    Array.isArray(entries) && entries.some((entry: unknown) => field(entry, "override") !== null);
  if (!changed) return;
  const reverted = await trpc(page, "tuning.revertAll", { expectedRevision: revision });
  if (reverted.status !== 200) throw new Error(`tuning.revertAll ${reverted.status}`);
}

/** 사이보그 만들기 화면의 첫 세력 정착 지원금(문자열) */
/**
 * 가장 덜 붐빈 세력의 지원금(= 기본액 × 최대 배율 1500‰). 시험 세계의 NPC 국가 수·차례·붐빔은 다른 시험과 R5에 따라 바뀌므로
 * 첫 줄이 아니라 세력들 가운데 가장 큰 값을 본다(가장 덜 붐빈 세력은 늘 최대 배율, settlementGrant)
 */
async function firstGrant(page: Page): Promise<unknown> {
  const creation = await trpc(page, "cyborg.creation");
  const factions = field(creation.data, "factions");
  if (!Array.isArray(factions)) return undefined;
  const grants = factions.map((faction) => Number(field(faction, "grant")));
  return grants.length > 0 ? String(Math.max(...grants)) : undefined;
}

const row = (page: Page, id: string) => page.locator(`.tp-row[data-id="${id}"]`);

/** 시험이 일부러 받는 거절(규칙 문제 400·권한 없음 403)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[], status: 400 | 403) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        error.text.includes(`status of ${status}`) &&
        error.text.includes("/api/trpc/tuning.")
      ),
  );

async function panelReady(page: Page): Promise<void> {
  await page.goto("/dev/tuning");
  await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

/** 분야 고르기: 넓은 폭은 왼쪽 목록, 휴대폰은 고르기 상자 */
async function choosePage(page: Page, tab: string): Promise<void> {
  // 다시 불러온 바로 뒤에는 목록이 아직 없다: 준비된 뒤에 넓은 폭(목록)인지 본다
  await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  const button = page.locator(`.tp-nav-list .tp-page[data-page='${tab}']`);
  if (await button.isVisible()) await button.click();
  else await page.locator(".tp-page-select").selectOption(tab);
  await expect(page.locator(".tp-page-panel")).toHaveAttribute("data-page", tab);
}

/** 화면 안(틀 밖 제외) 누르는 곳이 최소 크기(--tap-min 24px, ADR 2026-11-21-tap-target-relax)보다 작은 것 — 휴대폰(터치)에서만 본다 */
const smallInScreen = (page: Page) => smallTapTargets(page, { ignore: ":not(.tp-screen *)" });

/** 줄을 찾아 새 값 칸에 값 → [담기] */
async function stageValue(page: Page, id: string, value: string): Promise<void> {
  await page.locator(".tp-search input").fill(id);
  const target = row(page, id);
  await target.locator(".tp-input").fill(value);
  await target.locator(".tp-stage").click();
  await expect(target).toHaveAttribute("data-staged", "");
}

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("N39 기본액을 담아 적용하면 지원금에 바로 들고, 되돌리기를 적용하면 팩 값. 최근 바꿈에 남는다", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready");
    const before = await page.locator(".tp-screen").getAttribute("data-revision");
    expect(await firstGrant(page)).toBe("108");
    await stageValue(page, "n39_grant_base", "90");
    await expect(row(page, "n39_grant_base").locator(".tp-value-staged .tp-number")).toHaveText("90");
    await expect(page.locator(".tp-pending")).toBeVisible();
    await page.locator(".tp-note-input").fill("e2e 지원금 시험");
    await page.locator(".tp-apply").click();
    await expect(row(page, "n39_grant_base")).toHaveAttribute("data-changed", "");
    await expect(row(page, "n39_grant_base").locator(".tp-value-now .tp-number")).toHaveText("90");
    await expect(row(page, "n39_grant_base").locator(".tp-override")).toContainText("e2e 지원금 시험");
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    await expect(page.locator(".tp-screen")).not.toHaveAttribute("data-revision", before ?? "");
    // 다시 켜지 않아도 서버 사이보그 만들기가 새 값을 쓴다: 90 × 1.5
    expect(await firstGrant(page)).toBe("135");

    await row(page, "n39_grant_base").locator(".tp-revert").click();
    await page.locator(".tp-apply").click();
    await expect(row(page, "n39_grant_base")).not.toHaveAttribute("data-changed", "");
    expect(await firstGrant(page)).toBe("108");

    await page.locator(".tp-history summary").click();
    await expect(page.locator(".tp-history-row").first()).toContainText("n39_grant_base");
    expect(deviceErrors).toEqual([]);
  });

  // D-534(초기 스탯 합 상한 100) 뒤로 합만 올려서는 거절을 만들 수 없다(합 ≤ 100 ≤ 칸 최대 20 × 6).
  // 그래서 칸 최대를 내려(9 × 6 = 54 < 팩 합 60) 거절을 보고, 합(50)을 함께 담아 받게 한다
  test("서로 묶인 칸: 칸 최대만 보내면 규칙 문제(N9)로 거절, 합과 함께 보내면 받는다. 구조 값은 확인 창, 내보내기, 모두 되돌리기", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await stageValue(page, "n9_initial_max", "9");
    await page.locator(".tp-apply").click();
    const alert = page.locator(".tp-screen [role='alert']").first();
    await expect(alert).toContainText(message("ko", "dev_tuning_problem_n9_fit"));
    // 거절되면 담은 것은 남는다 → 합을 더 담아 함께 보낸다
    await expect(row(page, "n9_initial_max")).toHaveAttribute("data-staged", "");
    await stageValue(page, "n9_initial_sum", "50");
    await expect(page.locator(".tp-pending-count")).toContainText("2");
    await page.locator(".tp-apply").click();
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    await page.locator(".tp-search input").fill("n9_initial");
    await expect(row(page, "n9_initial_sum")).toHaveAttribute("data-changed", "");
    await expect(row(page, "n9_initial_max")).toHaveAttribute("data-changed", "");

    // 구조 값(N7 만렙): 확인 창을 거친다
    await stageValue(page, "n7_max_level", "60");
    await page.locator(".tp-apply").click();
    const confirm = page.locator("dialog.tp-confirm[open]");
    await expect(confirm).toHaveCount(1);
    await confirm.locator(".tp-confirm-yes").click();
    await expect(row(page, "n7_max_level")).toHaveAttribute("data-changed", "");

    // 내보내기: 팩과 다른 세 칸
    await page.locator(".tp-export-button").click();
    const exported = page.locator("dialog.tp-export[open]");
    await expect(exported).toHaveCount(1);
    const text = await exported.locator(".tp-export-text").inputValue();
    const diff: unknown = JSON.parse(text);
    expect(field(diff, "format")).toBe("terra-tuning-diff");
    const ids = field(diff, "changes");
    expect(Array.isArray(ids) ? ids.map((change: unknown) => field(change, "id")) : []).toEqual([
      "n7_max_level",
      "n9_initial_max",
      "n9_initial_sum",
    ]);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.tp-export[open]")).toHaveCount(0);

    // 모두 되돌리기(확인 창)
    await page.locator(".tp-revert-all").click();
    await page.locator("dialog.tp-confirm[open] .tp-confirm-yes").click();
    await expect(page.locator(".tp-changed-count")).toHaveAttribute("data-count", "0");
    await expect(page.locator(".tp-row[data-changed]")).toHaveCount(0);
    // 합만 보낸 묶음의 거절(400)은 시험이 일부러 낸 것
    expect(unexpected(deviceErrors, 400)).toEqual([]);
  });

  test("분야(휴대폰 고르기 상자): 분야마다 그 분야 칸만, 풀이·단위·출처, 다시 열어도 남음", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    // 휴대폰은 목록 대신 고르기 상자
    await expect(page.locator(".tp-nav-list")).toBeHidden();
    await expect(page.locator(".tp-page-select option")).toHaveCount(PAGES.length);
    await choosePage(page, "all");
    const total = await page.locator(".tp-row").count();
    for (const [tab, inside, outside] of PAGE_SAMPLES) {
      await choosePage(page, tab);
      await expect(row(page, inside)).toBeVisible();
      await expect(row(page, outside)).toHaveCount(0);
      expect(await page.locator(".tp-row").count()).toBeLessThan(total);
    }
    // 칸 줄: 쉬운 풀이·단위·출처(세력·사회의 반란 문턱)
    await choosePage(page, "society");
    const rebellion = row(page, "s26_rebellion");
    await expect(rebellion.locator(".tp-desc")).toContainText("반란");
    await expect(rebellion.locator(".tp-source")).toContainText("faction-society-core");
    await expect(rebellion.locator(".tp-meta")).toContainText(message("ko", "dev_tuning_unit_label"));
    await page.reload();
    await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready");
    await expect(page.locator(".tp-page-select")).toHaveValue("society");
    await choosePage(page, "all");
    await expect(page.locator(".tp-row")).toHaveCount(total);
    expect(deviceErrors).toEqual([]);
  });

  test("찾기·거르기: 풀이로 찾기, 낱말 여럿, 바꾼 것만·반영 범위·단위, 맞는 칸 없음 → 거르기 지우기, 풀이 숨기기", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await choosePage(page, "all");
    const total = await page.locator(".tp-row").count();
    const search = page.locator(".tp-search-input");
    // 풀이 글로 찾는다(이름·ID에 없는 낱말)
    await search.fill("반란");
    await expect(row(page, "s26_rebellion")).toBeVisible();
    // 낱말 여럿 = 모두 맞는 칸
    await search.fill("반란 s26");
    await expect(page.locator(".tp-row")).not.toHaveCount(0);
    expect(await page.locator(".tp-row").count()).toBeLessThan(10);
    await search.fill("");
    // 휴대폰은 [거르기]를 눌러 거르기 줄을 펼친다(켠 수가 단추에 보인다)
    await expect(page.locator(".tp-filters")).toBeHidden();
    await page.locator(".tp-filters-toggle").click();
    await expect(page.locator(".tp-filters-toggle")).toHaveAttribute("aria-expanded", "true");
    // 반영 범위: 서버 즉시만
    await page.locator(".tp-seg[data-scope='live']").click();
    const live = await page.locator(".tp-row").count();
    expect(live).toBeGreaterThan(0);
    await expect(page.locator(".tp-row:not([data-scope='live'])")).toHaveCount(0);
    await expect(page.locator(".tp-filters-toggle")).toHaveText(
      message("ko", "dev_tuning_filters_count", { count: 1 }),
    );
    // 단위: ms만
    await page.locator(".tp-seg[data-scope='all']").click();
    await page.locator(".tp-unit-filter").selectOption("ms");
    // 거른 줄은 다시 그린 뒤에 센다(바로 세면 그리는 중 0이 나올 수 있다)
    await expect(page.locator(".tp-row")).not.toHaveCount(0);
    await expect(page.locator(".tp-row .tp-meta").first()).toContainText(message("ko", "dev_tuning_unit_ms"));
    // 바꾼 것만: 아무것도 바꾸지 않았으니 비고, 거르기 지우기로 전체
    await page.locator(".tp-changed-only").click();
    await expect(page.locator(".tp-changed-only")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tp-row")).toHaveCount(0);
    await expect(page.locator(".tp-empty")).toContainText(message("ko", "dev_tuning_empty_filter"));
    await page.locator(".tp-empty button").click();
    await expect(page.locator(".tp-row")).toHaveCount(total);
    await expect(page.locator(".tp-reset")).toHaveCount(0);
    // 풀이 숨기기(다시 열어도 남는다)
    await expect(page.locator(".tp-desc").first()).toBeVisible();
    await page.locator(".tp-desc-toggle").click();
    await expect(page.locator(".tp-desc")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready");
    await page.locator(".tp-filters-toggle").click();
    await expect(page.locator(".tp-desc-toggle")).toHaveAttribute("aria-pressed", "false");
    await page.locator(".tp-desc-toggle").click();
    await expect(page.locator(".tp-desc").first()).toBeVisible();
    expect(deviceErrors).toEqual([]);
  });

  test("값 칸 바로 검사: 정수 아님·범위 밖이면 문구와 aria-invalid, [담기] 없음(범위 밖은 떠날 때 끝 값으로 맞춤). Esc = 되돌림. 담은 변경 막대에서 담기 취소·모두 취소", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await page.locator(".tp-search input").fill("n39_grant_max");
    const target = row(page, "n39_grant_max");
    const input = target.locator(".tp-input");
    await input.fill("1.5");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(target.locator(".tp-error")).toHaveText(message("ko", "dev_tuning_value_invalid"));
    await expect(target.locator(".tp-stage")).toHaveCount(0);
    // 정수가 아닌 글은 칸을 떠나도 담기지 않는다
    await page.locator(".tp-search input").focus();
    await expect(target).not.toHaveAttribute("data-staged", "");
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    await input.fill("99999");
    await expect(target.locator(".tp-error")).toContainText("10,000");
    // 범위 밖 정수는 칸을 떠날 때 가까운 끝 값(10,000)으로 맞춰 담고 까닭을 적는다
    await page.locator(".tp-search input").focus();
    await expect(input).toHaveValue("10000");
    await expect(target.locator(".tp-clamped")).toContainText("10,000");
    await expect(target).toHaveAttribute("data-staged", "");
    await target.locator(".tp-unstage").click();
    await expect(target).not.toHaveAttribute("data-staged", "");
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    await expect(input).toHaveValue("1500");
    // 친 글자는 Esc로 되돌린다
    await input.fill("77");
    await input.press("Escape");
    await expect(input).toHaveValue("1500");
    await expect(input).toHaveAttribute("aria-invalid", "false");
    // 맞는 값: 미리 보기(‰ → %) 뒤 칸을 떠나면 담긴다
    await input.fill("1200");
    await expect(target.locator(".tp-preview")).toContainText("120%");
    await page.locator(".tp-search input").focus();
    await expect(target).toHaveAttribute("data-staged", "");
    await stageValue(page, "n39_grant_min", "900");
    await expect(page.locator(".tp-pending-count")).toContainText("2");
    // 막대를 펼쳐 칸 하나를 담기 취소
    await page.locator(".tp-pending-count").click();
    await expect(page.locator(".tp-pending-item")).toHaveCount(2);
    await page.locator(".tp-pending-item[data-id='n39_grant_max'] .tp-pending-remove").click();
    await expect(page.locator(".tp-pending-item")).toHaveCount(1);
    // 모두 취소 = 보내지 않은 것만 버림
    await page.locator(".tp-discard").click();
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    await expect(page.locator(".tp-row[data-staged]")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("49 칸 중 N개 연결: 연결됨(N9)·값 없음(T6)·연결 없음(T1)", async ({ page }) => {
    await panelReady(page);
    const cells = page.locator(".tp-cells");
    await cells.locator("summary").click();
    await expect(cells.locator('.tp-cell[data-code="N9"]')).toHaveAttribute("data-status", "connected");
    // 채집 티어 확률표(D-506): 레벨 보너스 칸 n43_level_bonus가 N43을 잇는다
    await expect(cells.locator('.tp-cell[data-code="N43"]')).toHaveAttribute("data-status", "connected");
    // 옛 1차 생산 규칙(D-507): 필요 진행·진행 1 시간·광석 g 칸이 N44를 잇는다
    await expect(cells.locator('.tp-cell[data-code="N44"]')).toHaveAttribute("data-status", "connected");
    await expect(cells.locator('.tp-cell[data-code="T6"]')).toHaveAttribute("data-status", "no_value");
    await expect(cells.locator('.tp-cell[data-code="T1"]')).toHaveAttribute("data-status", "not_connected");
    expect(await cells.locator(".tp-cell").count()).toBeGreaterThan(200);
  });
});

test.describe("개발자·데스크톱", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("분야 목록: ↑↓로 옮기며 고름, 바뀐 칸 수 표시. 키: / 찾기, Enter 담고 다음 줄(Shift = 앞 줄), ↑↓ 값 한 걸음, Esc 되돌림, Ctrl+Z, Ctrl+S 적용", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await expect(page.locator(".tp-page-select")).toBeHidden();
    await expect(page.locator(".tp-nav-list .tp-page")).toHaveCount(PAGES.length);
    await choosePage(page, "society");
    await expect(page.locator(".tp-page[data-page='society']")).toHaveAttribute("aria-current", "true");
    await page.locator(".tp-page[data-page='society']").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".tp-page[data-page='npc']")).toBeFocused();
    await expect(page.locator(".tp-page-panel")).toHaveAttribute("data-page", "npc");
    await expect(row(page, "npc_idle_score")).toBeVisible();
    await page.keyboard.press("End");
    await expect(page.locator(".tp-page-panel")).toHaveAttribute("data-page", "other");

    // "/" = 찾기 칸
    await page.locator("#tuning-title").click();
    await page.keyboard.press("/");
    await expect(page.locator(".tp-search-input")).toBeFocused();
    await page.keyboard.type("n39_grant");
    const inputs = page.locator(".tp-row .tp-input");
    await expect(inputs).toHaveCount(4);
    // 첫 줄 값 칸에서 Enter(바꾸지 않음) = 다음 줄로, Shift+Enter = 앞 줄로
    await inputs.nth(0).focus();
    await page.keyboard.press("Enter");
    await expect(inputs.nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(inputs.nth(2)).toBeFocused();
    await page.keyboard.press("Shift+Enter");
    await expect(inputs.nth(1)).toBeFocused();
    // ↑ = 값 한 걸음 올려 바로 담는다(줄은 옮기지 않는다), PageDown = 10걸음 내림. Ctrl+Z = 마지막 고침 되돌리기
    const startValue = Number(await inputs.nth(1).inputValue());
    await page.keyboard.press("ArrowUp");
    await expect(inputs.nth(1)).toBeFocused();
    const stepped = Number(await inputs.nth(1).inputValue());
    expect(stepped).toBeGreaterThan(startValue);
    await expect(page.locator(".tp-row[data-staged]")).toHaveCount(1);
    await page.keyboard.press("PageDown");
    expect(Number(await inputs.nth(1).inputValue())).toBeLessThan(stepped);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".tp-row[data-staged]")).toHaveCount(0);
    await expect(inputs.nth(1)).toHaveValue(String(startValue));
    // 친 글자를 Esc로 되돌림
    const before = await inputs.nth(1).inputValue();
    await page.keyboard.type("77");
    await page.keyboard.press("Escape");
    await expect(inputs.nth(1)).toHaveValue(before);
    // 값을 치고 Enter = 담고 다음 줄
    const firstId = await page.locator(".tp-row").nth(1).getAttribute("data-id");
    await page.keyboard.type(String(Number(before) + 10));
    await page.keyboard.press("Enter");
    await expect(row(page, firstId ?? "")).toHaveAttribute("data-staged", "");
    await expect(inputs.nth(2)).toBeFocused();
    await expect(page.locator(".tp-page[data-page='other'] .tp-page-changed")).toContainText("1");
    // Ctrl+S = 적용(값 칸에 친 맞는 값도 먼저 담는다)
    const secondId = await page.locator(".tp-row").nth(2).getAttribute("data-id");
    const second = await inputs.nth(2).inputValue();
    await page.keyboard.type(String(Number(second) + 10));
    await page.keyboard.press("Control+s");
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    await expect(row(page, firstId ?? "")).toHaveAttribute("data-changed", "");
    await expect(row(page, secondId ?? "")).toHaveAttribute("data-changed", "");
    await expect(page.locator(".tp-changed-count")).toHaveAttribute("data-count", "2");
    await resetTuning(page);
    expect(deviceErrors).toEqual([]);
  });

  test("값 칸 조작: − / + 단추·막대 끌기·이름 끌기는 바로 담고, 막대의 팩 값 눈금은 팩 값으로 되돌린다", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await page.locator(".tp-search input").fill("n39_grant_max");
    const target = row(page, "n39_grant_max");
    const input = target.locator(".tp-input");
    await expect(input).toHaveValue("1500");
    // 막대는 값·범위를 알린다(읽기 프로그램)
    const slider = target.locator('[role="slider"]');
    await expect(slider).toHaveAttribute("aria-valuenow", "1500");
    await expect(slider).toHaveAttribute("aria-valuemin", "0");
    await expect(slider).toHaveAttribute("aria-valuemax", "10000");
    // [+] 한 번 = 한 걸음(범위 0~10,000이면 50) → 바로 담긴다
    await target.locator('.ce-step[data-step="up"]').click();
    await expect(input).toHaveValue("1550");
    await expect(target).toHaveAttribute("data-staged", "");
    await expect(target.locator(".tp-value-staged")).toContainText("1,550");
    // 막대를 오른쪽으로 끌면 값이 커지고 담은 값·팩 대비 차이가 따라온다
    await dragSlider(page, slider, 0.2, 0.6);
    const dragged = Number(await input.inputValue());
    expect(dragged).toBeGreaterThan(5000);
    expect(dragged % 50).toBe(0);
    await expect(slider).toHaveAttribute("aria-valuenow", String(dragged));
    await expect(target.locator(".tp-value-staged .tp-delta")).toContainText("+");
    await expect(page.locator(".tp-pending-count")).toContainText("1");
    // 이름을 왼쪽으로 끌면 값이 준다(4화소에 한 걸음)
    await dragBy(page, target.locator(".tp-name"), -80);
    expect(Number(await input.inputValue())).toBe(dragged - 20 * 50);
    // 팩 값 눈금(1500 ÷ 10,000 자리)을 누르면 팩 값(= 지금 값)이라 담음이 빠진다
    await clickSlider(page, slider, 0.15);
    await expect(input).toHaveValue("1500");
    await expect(target).not.toHaveAttribute("data-staged", "");
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("시간(ms) 단위 전환: 수명은 시간으로, 틱은 분/초/ms로 보고 단위 전환 후 담아도 ms 정수로 저장 대기", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await choosePage(page, "all");
    await page.locator(".tp-search input").fill("t4_lifespan_min");
    const lifespan = row(page, "t4_lifespan_min");
    await expect(lifespan).toBeVisible();
    // 기본 단위는 시간(hours)
    await expect(lifespan.locator('.tp-unit-btn[data-unit="hours"]')).toHaveAttribute("aria-pressed", "true");
    // 분(minutes) 단위로 전환 가능
    await lifespan.locator('.tp-unit-btn[data-unit="minutes"]').click();
    await expect(lifespan.locator('.tp-unit-btn[data-unit="minutes"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // 값 칸은 분, 지금 값 풀이는 ms 정수를 함께 보인다(60일 = 86,400분 = 5,184,000,000 ms)
    const input = lifespan.locator(".tp-input");
    await expect(input).toHaveValue("86400");
    await expect(lifespan.locator(".tp-value-now")).toContainText("5,184,000,000 ms");
    // 미리 보기는 처음 값과 다른 맞는 값을 칠 때만 보인다(단위 전환 전과 같은 규칙) → 60분 늘려 치고 담는다
    await input.fill("86460");
    await expect(lifespan.locator(".tp-preview")).toContainText("5,187,600,000 ms");
    await lifespan.locator(".tp-stage").click();
    await expect(lifespan).toHaveAttribute("data-staged", "");
    // 담은 값은 ms 정수(분 × 60,000)
    await expect(lifespan.locator(".tp-value-staged")).toContainText("5,187,600,000 ms");
    await expect(input).toHaveValue("86460");
    await lifespan.locator(".tp-unstage").click();
    await expect(page.locator(".tp-pending")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC tuning.list·tuning.save는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/tuning");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".tp-screen")).toHaveCount(0);
    expect((await trpc(page, "tuning.list")).status).toBe(403);
    const save = await trpc(page, "tuning.save", {
      expectedRevision: 0,
      changes: [{ id: "n39_grant_base", value: 90 }],
    });
    expect([save.status, save.code]).toEqual([403, "FORBIDDEN"]);
    expect(unexpected(deviceErrors, 403)).toEqual([]);
  });
});

/** 분야 페이지 탭(전체 포함, 화면 차례) */
const PAGES = ["all", "society", "npc", "gardener", "holdings", "combat", "economy", "other"] as const;

/** 페이지마다 그 안에 있어야 할 칸·없어야 할 칸 */
const PAGE_SAMPLES: readonly (readonly [string, string, string])[] = [
  ["society", "d186_loot_take", "c19_loot"],
  ["npc", "d323_decide_every", "s26_rebellion"],
  ["gardener", "p15_cell_max", "npc_idle_score"],
  ["holdings", "n49_wear_chance", "p15_cell_max"],
  ["combat", "c19_loot", "n49_wear_chance"],
  ["economy", "npc_bank_gain", "c19_loot"],
  ["other", "n39_grant_base", "npc_bank_gain"],
];

// 개발 화면 층(ADR 2026-11-02-dev-ui): 게임 테마와 상관없이 개발 화면 테마 둘(네온 다크·라이트)로 찍는다
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: 390 | 1440 }[] = (
  ["neon", "light"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390 as const },
    { theme, language, width: 1440 as const },
  ]),
);

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      // 390 = 휴대폰(터치), 1440 = 데스크톱(마우스)
      test.use({ devTheme: theme, language, ...(width === 390 ? VIEWPORTS.phone : VIEWPORTS.desktop) });

      test("덮어쓴 칸·담은 칸·값 칸: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        await panelReady(page);
        await resetTuning(page);
        const list = await trpc(page, "tuning.list");
        const saved = await trpc(page, "tuning.save", {
          expectedRevision: field(list.data, "revision"),
          changes: [{ id: "n39_grant_base", value: 90 }],
          note: language === "ko" ? "사진 시험" : "screenshot test",
        });
        expect(saved.status).toBe(200);
        await page.reload();
        await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready");
        await choosePage(page, "all");
        await page.locator(".tp-search input").fill("N39");
        await row(page, "n39_grant_step").locator(".tp-input").fill("60");
        await row(page, "n39_grant_step").locator(".tp-stage").click();
        await expect(row(page, "n39_grant_step")).toHaveAttribute("data-staged", "");
        // 값을 고치는 중인 줄(담기 전): 범위 밖 값 → 바로 검사 문구
        await row(page, "n39_grant_min").locator(".tp-input").fill("12000");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        if (width === 390) expect(await smallInScreen(page)).toEqual([]);
        // 화면 크기 사진(한 화면에 보이는 줄 수를 본다)
        await shot(page, `tuning-${theme}-${language}-${width}`);
        // 친 범위 밖 값은 되돌린다(그대로 떠나면 끝 값으로 맞춰 담긴다)
        await row(page, "n39_grant_min").locator(".tp-input").press("Escape");
        // 담은 변경 막대를 펼친 모습
        await page.locator(".tp-pending-count").click();
        await expect(page.locator(".tp-pending-item")).toHaveCount(1);
        if (width === 390) expect(await smallInScreen(page)).toEqual([]);
        await shot(page, `tuning-pending-${theme}-${language}-${width}`);
        await resetTuning(page);
        expect(deviceErrors).toEqual([]);
      });

      test("분야 페이지마다: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        await panelReady(page);
        for (const tab of PAGES) {
          await choosePage(page, tab);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page), tab).toEqual([]);
          expect(await smallTapTargets(page), tab).toEqual([]);
          if (width === 390) expect(await smallInScreen(page), tab).toEqual([]);
          await shot(page, `tuning-page-${tab}-${theme}-${language}-${width}`);
        }
        expect(deviceErrors).toEqual([]);
      });

      test("채집 칸(D-506·D-507): N43 레벨 보너스·창고 용량(g)·N44 진행 줄, 가로 넘침 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await panelReady(page);
        await choosePage(page, "all");
        await page.locator(".tp-search input").fill("N43");
        await expect(row(page, "n43_level_bonus")).toBeVisible();
        await page.locator(".tp-search input").fill("d506");
        await expect(row(page, "d506_storage_per_level")).toBeVisible();
        await page.locator(".tp-search input").fill("");
        await page.locator(".tp-search input").fill("n43_level_bonus");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `tuning-n43-${theme}-${language}-${width}`);
        // N44(D-507): 필요 진행 기본·티어당, 진행 1의 시간, 광석 한 번 g
        await page.locator(".tp-search input").fill("N44");
        for (const id of ["n44_tier_progress_base", "n44_tier_progress_step", "n44_tick_ms", "n44_ore_grams"])
          await expect(row(page, id)).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `tuning-n44-${theme}-${language}-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
