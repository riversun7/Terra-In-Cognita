// 설정 칸 패널 화면 시험 — /dev/tuning (docs/adr/2026-11-01-dev-settings-panel.md 12절·"바뀜: D-462").
// - dev: N39 기본액을 [바꾸기] → [담기] → [적용]하면 그 세계에 바로 든다(사이보그 만들기 화면의 정착 지원금 72 × 1.5 = 108 → 135).
//   [되돌리기] → [적용]이면 팩 값(108). 서로 묶인 칸(N9 합·칸 최대)은 하나만 보내면 규칙 문제로 거절되고 함께 보내면 받는다.
//   구조 값은 확인 창. [내보내기]는 팩 차이 JSON. [모두 되돌리기]. 49 칸 목록(연결됨·값 없음·연결 없음).
// - player: 권한 없음 화면, tRPC tuning.*는 403.
// - 사진: 390·1440 × 파스텔·다크·정거장 × 한국어·영어(E2E_SHOTS_DIR).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(다른 줄기의 지원금·환생 값 시험을 흔들지 않게).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";

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
async function firstGrant(page: Page): Promise<unknown> {
  const creation = await trpc(page, "cyborg.creation");
  const factions = field(creation.data, "factions");
  return Array.isArray(factions) ? field(factions[0], "grant") : undefined;
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

/** 줄을 찾아 [바꾸기] → 값 → [담기] */
async function stageValue(page: Page, id: string, value: string): Promise<void> {
  await page.locator(".tp-search input").fill(id);
  const target = row(page, id);
  await target.locator(".tp-edit").click();
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

  test("서로 묶인 칸: 합만 보내면 규칙 문제(N9)로 거절, 칸 최대와 함께 보내면 받는다. 구조 값은 확인 창, 내보내기, 모두 되돌리기", async ({
    page,
    deviceErrors,
  }) => {
    await panelReady(page);
    await resetTuning(page);
    await page.reload();
    await stageValue(page, "n9_initial_sum", "150");
    await page.locator(".tp-apply").click();
    const alert = page.locator(".tp-screen [role='alert']").first();
    await expect(alert).toContainText(message("ko", "dev_tuning_problem_n9_fit"));
    // 거절되면 담은 것은 남는다 → 칸 최대를 더 담아 함께 보낸다
    await expect(row(page, "n9_initial_sum")).toHaveAttribute("data-staged", "");
    await stageValue(page, "n9_initial_max", "30");
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

  test("49 칸 중 N개 연결: 연결됨(N9)·값 없음(T6)·연결 없음(T1)", async ({ page }) => {
    await panelReady(page);
    const cells = page.locator(".tp-cells");
    await cells.locator("summary").click();
    await expect(cells.locator('.tp-cell[data-code="N9"]')).toHaveAttribute("data-status", "connected");
    await expect(cells.locator('.tp-cell[data-code="T6"]')).toHaveAttribute("data-status", "no_value");
    await expect(cells.locator('.tp-cell[data-code="T1"]')).toHaveAttribute("data-status", "not_connected");
    expect(await cells.locator(".tp-cell").count()).toBeGreaterThan(200);
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

const LAYOUTS: readonly { theme: Theme; language: Language; width: number; height: number }[] = (
  ["pastel", "dark", "station"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390, height: 844 },
    { theme, language, width: 1440, height: 900 },
  ]),
);

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ theme, language, viewport: { width, height } });

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
        await page.locator(".tp-search input").fill("N39");
        await row(page, "n39_grant_step").locator(".tp-edit").click();
        await row(page, "n39_grant_step").locator(".tp-input").fill("60");
        await row(page, "n39_grant_step").locator(".tp-stage").click();
        await row(page, "n39_grant_min").locator(".tp-edit").click();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        // 전체 길이 사진: 고정된 위 띠·하단 탭·건너뛰기 링크가 사진 가운데에 끼지 않게 숨긴다(economy.spec.ts fullShot과 같은 결)
        const style = await page.addStyleTag({
          content: ".tabbar, .topbar, .frame-side, .skip-link { visibility: hidden !important; }",
        });
        await shot(page, `tuning-${theme}-${language}-${width}`, { fullPage: true });
        await style.evaluate((element) => element.parentNode?.removeChild(element));
        await resetTuning(page);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
