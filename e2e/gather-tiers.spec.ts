// 1차 생산 티어 확률 화면 시험 — /dev/gather-tiers (기획 49 N43·D-513, docs/adr/2026-11-02-building-editor.md "바뀜 (2026-11-09)").
// - dev: 개발자 홈의 줄로 들어간다. 행렬 칸 하나를 고치면 같은 구간의 나머지가 따라 움직여 합이 1000 그대로 담기고, [적용]하면 그 세계에
//   바로 든다(buildings.list). [팩 값으로]를 담아 적용하면 팩 값. 건물 편집기에는 확률 탭이 없다.
// - 구간 조절 판(분포 막대): 경계 끌기·잠금·막대·키보드·균등·팩 값으로·Ctrl+Z. 행렬 묶음 바꾸기: 열 고르기·더하기·선형 채우기·끌어 채우기
//   (docs/adr/2026-11-10-editor-input-controls.md).
// - player: 권한 없음 화면.
// - 사진: 390·1440 × 개발 화면 테마 네온·라이트 × 한국어·영어(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 확률표 덮어쓰기를 모두 지운다.
import type { Locator, Page } from "@playwright/test";
import { dragBy, dragSlider, dragTo, inputValues } from "./helpers/inputs.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). input이 있으면 POST(쓰기), 없으면 GET */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const mutation = body !== undefined;
      const response = await fetch(
        `/api/trpc/${name}`,
        mutation
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return { status: response.status, data: get(get(json, "result"), "data") };
    },
    { procedure, input },
  );
}

/** 확률표 덮어쓰기를 모두 지운다(팩 값으로) */
async function resetBands(page: Page): Promise<void> {
  const current = await trpc(page, "buildings.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`buildings.list ${current.status}`);
  const changes = list(field(current.data, "gatherBands")).flatMap((row) =>
    field(row, "origin") === "edited"
      ? [{ op: "revert_gather_band", id: field(field(row, "entry"), "id"), baseHash: field(row, "hash") }]
      : [],
  );
  if (changes.length === 0) return;
  const reverted = await trpc(page, "buildings.save", { expectedRevision: revision, changes });
  if (reverted.status !== 200) throw new Error(`buildings.save revert ${reverted.status}`);
}

const screen = (page: Page) => page.locator(".gt-screen");
const stagebar = (page: Page) => page.locator(".gt-stagebar");
const panel = (page: Page) => page.locator(".gt-panel");
/** 행렬 한 줄의 T0~T9 값 */
const rowWeights = (row: Locator): Promise<number[]> => inputValues(row.locator("input[data-tier]"));
const bandRow = (page: Page, id: string) => page.locator(`.gt-table tr[data-band-id="${id}"]`);
async function ready(page: Page): Promise<void> {
  await page.goto("/dev/gather-tiers");
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

test.describe("개발자", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("개발자 홈에서 들어가 칸을 고치면 나머지가 따라 움직여 합이 1000 그대로 담기고, [적용]하면 든다. [팩 값으로]는 팩 값", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev");
    await page.locator('#main a.dev-tool[href="/dev/gather-tiers"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/gather-tiers");
    await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await resetBands(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    const bands = list(field((await trpc(page, "buildings.list")).data, "gatherBands"));
    await expect(page.locator(".gt-table tbody tr")).toHaveCount(bands.length);
    const first = bands[0];
    const id = String(field(field(first, "entry"), "id"));
    const weights = list(field(field(first, "entry"), "weightsPm")).map(Number);
    const row = bandRow(page, id);

    // T1 칸에 +7: 담기고, 같은 구간의 나머지가 줄어 합은 1000 그대로 → 검사가 막지 않는다
    const t1 = row.locator('input[data-tier="1"]');
    await t1.fill(String((weights[1] ?? 0) + 7));
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(row).toHaveAttribute("data-staged", "");
    expect(await rowWeights(row)).toHaveLength(10);
    expect((await rowWeights(row)).reduce((sum, value) => sum + value, 0)).toBe(1000);
    await expect(row.locator(".gt-sum[data-invalid]")).toHaveCount(0);
    // 같은 구간에서 이어서 친 칸: 앞에서 친 T1은 그대로 두고 나머지만 움직인다
    await row.locator('input[data-tier="2"]').fill(String((weights[2] ?? 0) + 5));
    await expect(t1).toHaveValue(String((weights[1] ?? 0) + 7));
    expect((await rowWeights(row)).reduce((sum, value) => sum + value, 0)).toBe(1000);
    // ↓ 키는 다음 구간의 같은 티어 칸으로
    await t1.press("ArrowDown");
    await expect(page.locator('.gt-table input[data-row="1"][data-tier="1"]')).toBeFocused();
    // 검사 통과 → [적용]
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".gt-note").fill("e2e 티어 확률");
    await stagebar(page).locator(".gt-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(row).toHaveAttribute("data-changed", "");
    const after = list(field((await trpc(page, "buildings.list")).data, "gatherBands")).find(
      (band) => field(field(band, "entry"), "id") === id,
    );
    expect(field(after, "origin")).toBe("edited");
    const saved = list(field(field(after, "entry"), "weightsPm")).map(Number);
    expect(saved.reduce((sum, value) => sum + value, 0)).toBe(1000);
    expect(saved[1]).toBe((weights[1] ?? 0) + 7);

    // 구간 조절 판의 [팩 값으로] → 적용하면 팩 값
    await expect(panel(page)).toHaveAttribute("data-band-id", id);
    await panel(page).locator(".gt-revert").click();
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".gt-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(row).not.toHaveAttribute("data-changed", "");
    await resetBands(page);

    // 건물 편집기에는 확률 탭이 없다(시설 목록과 편집 판만)
    await page.goto("/dev/buildings");
    await expect(page.locator(".be-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator('.be-screen [role="tablist"]')).toHaveCount(0);
    await expect(page.locator(".be-screen .gt-table")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("구간 조절 판: 경계를 끌면 두 칸이 바뀌고 합은 1000, 잠근 칸은 움직이지 않는다. 막대·키보드(↑↓)·균등·팩 값으로·Ctrl+Z", async ({
    page,
    deviceErrors,
  }) => {
    await ready(page);
    await resetBands(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    const dist = panel(page).locator(".ce-dist");
    const part = (tier: number) => dist.locator(`.ce-dist-part[data-part="t${tier}"]`);
    const valueOf = async (tier: number): Promise<number> =>
      Number(await part(tier).getAttribute("data-value"));
    const before = [await valueOf(0), await valueOf(1), await valueOf(2)];
    await expect(dist).toHaveAttribute("data-sum", "1000");
    // 평균 티어(결과 읽기)가 보인다
    const average = await panel(page).locator(".gt-avg").getAttribute("data-avg");
    expect(Number(average)).toBeGreaterThan(0);

    // T0 · T1 경계를 왼쪽으로 끈다: T0가 줄고 T1이 그만큼 는다
    await dragBy(page, dist.locator('.ce-dist-handle[data-left="t0"]'), -120);
    await expect(dist).toHaveAttribute("data-sum", "1000");
    const moved = [await valueOf(0), await valueOf(1), await valueOf(2)];
    expect(moved[0]).toBeLessThan(before[0] ?? 0);
    expect((moved[1] ?? 0) - (before[1] ?? 0)).toBe((before[0] ?? 0) - (moved[0] ?? 0));
    expect(moved[2]).toBe(before[2]);
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    // 끄는 동안 평균 티어가 따라 바뀌었다
    await expect(panel(page).locator(".gt-avg")).not.toHaveAttribute("data-avg", average ?? "");

    // T2를 잠그고 T0 막대를 끌면 T2는 그대로, 합은 1000
    await part(2).locator(".ce-dist-lock").click();
    await expect(part(2)).toHaveAttribute("data-locked", "");
    await dragSlider(page, part(0).locator('[role="slider"]'), 0.5, 0.2);
    await expect(dist).toHaveAttribute("data-sum", "1000");
    expect(await valueOf(2)).toBe(moved[2]);
    expect(await valueOf(0)).toBeLessThan(moved[0] ?? 0);
    // 막대는 값·범위를 알린다
    const slider = part(0).locator('[role="slider"]');
    await expect(slider).toHaveAttribute("aria-valuemin", "0");
    await expect(slider).toHaveAttribute("aria-valuemax", "1000");
    await expect(slider).toHaveAttribute("aria-valuenow", String(await valueOf(0)));

    // 키보드만으로: T1 값 칸에서 ↑ 세 번 = +3, Shift+↓ = −10. 잠근 T2는 그대로, 합은 1000
    const t1Before = await valueOf(1);
    const t1Input = part(1).locator("input");
    await t1Input.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(part(1)).toHaveAttribute("data-value", String(t1Before + 3));
    await page.keyboard.press("Shift+ArrowDown");
    await expect(part(1)).toHaveAttribute("data-value", String(t1Before - 7));
    expect(await valueOf(2)).toBe(moved[2]);
    await expect(dist).toHaveAttribute("data-sum", "1000");

    // [균등]: 잠그지 않은 권장 티어에 고르게(잠근 T2는 그대로)
    await dist.locator(".ce-dist-even").click();
    expect(await valueOf(2)).toBe(moved[2]);
    await expect(dist).toHaveAttribute("data-sum", "1000");
    expect(await valueOf(0)).toBe(await valueOf(1));
    // Ctrl+Z = 마지막 고침(균등) 되돌리기
    await page.locator("#gather-tiers-title").click();
    await page.keyboard.press("Control+z");
    await expect(part(1)).toHaveAttribute("data-value", String(t1Before - 7));
    // [팩 값으로] → 담은 것이 빠진다
    await dist.locator(".ce-dist-pack").click();
    await expect(stagebar(page)).toHaveCount(0);
    expect([await valueOf(0), await valueOf(1), await valueOf(2)]).toEqual(before);
    expect(deviceErrors).toEqual([]);
  });

  test("행렬 묶음 바꾸기: 열을 골라 더하기·선형 채우기, 모서리를 끌어 아래로 채우기 — 바뀐 구간마다 합은 1000", async ({
    page,
    deviceErrors,
  }) => {
    await ready(page);
    await resetBands(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    const rows = page.locator(".gt-table tbody tr");
    const count = await rows.count();
    const column = async (tier: number): Promise<number[]> =>
      inputValues(page.locator(`.gt-table tbody input[data-tier="${tier}"]`));
    const sums = async (): Promise<number[]> => {
      const out: number[] = [];
      for (let index = 0; index < count; index++)
        out.push((await rowWeights(rows.nth(index))).reduce((sum, value) => sum + value, 0));
      return out;
    };
    const bulk = page.locator(".gt-bulkbar");
    // 머리 = 열 전체 고르기
    await page.locator('.gt-tier-head[data-tier="t1"] .ce-col-pick').click();
    await expect(bulk).toHaveAttribute("data-count", String(count));
    const before = await column(1);
    // 더하기 10
    await bulk.locator(".ce-bulk-op").selectOption("add");
    await bulk.locator("input").fill("10");
    await bulk.locator(".ce-bulk-apply").click();
    expect(await column(1)).toEqual(before.map((value) => value + 10));
    expect(await sums()).toEqual(Array.from({ length: count }, () => 1000));
    await expect(stagebar(page)).toHaveAttribute("data-count", String(count));
    // 선형 채우기: 첫 칸과 끝 칸 사이를 같은 차이로
    await bulk.locator(".ce-bulk-linear").click();
    const filled = await column(1);
    const firstValue = filled[0] ?? 0;
    const lastValue = filled.at(-1) ?? 0;
    expect(filled).toEqual(
      filled.map((_, index) => Math.round(firstValue + ((lastValue - firstValue) * index) / (count - 1))),
    );
    expect(await sums()).toEqual(Array.from({ length: count }, () => 1000));
    // 고르기 풀고, 칸 모서리를 끌어 아래 두 구간에 같은 값 채우기
    await bulk.locator(".ce-bulk-clear").click();
    await expect(bulk).toHaveAttribute("data-count", "0");
    const source = page.locator('.gt-table input[data-row="0"][data-tier="0"]');
    await source.click();
    const sourceValue = await source.inputValue();
    await dragTo(
      page,
      page.locator('.gt-table td[data-grid-row="0"][data-grid-col="0"] .ce-fill-handle'),
      page.locator('.gt-table td[data-grid-row="2"][data-grid-col="0"]'),
    );
    await expect(page.locator('.gt-table input[data-row="1"][data-tier="0"]')).toHaveValue(sourceValue);
    await expect(page.locator('.gt-table input[data-row="2"][data-tier="0"]')).toHaveValue(sourceValue);
    expect(await sums()).toEqual(Array.from({ length: count }, () => 1000));
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    // 버린다
    await stagebar(page)
      .getByRole("button", { name: message("ko", "dev_content_discard_all"), exact: true })
      .click();
    await stagebar(page).locator(".ce-confirm-yes").click();
    await expect(stagebar(page)).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page }) => {
    await page.goto("/dev/gather-tiers");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(screen(page)).toHaveCount(0);
  });
});

// 개발 화면 층(ADR 2026-11-02-dev-ui): 개발 화면 테마 둘(네온 다크·라이트)로, 보이는 화면 크기로 찍는다
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = (
  ["neon", "light"] as const
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
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("행렬·담은 변경 막대: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        await ready(page);
        await resetBands(page);
        await page.reload();
        await expect(screen(page)).toHaveAttribute("data-status", "ready");
        // 구간 하나를 프리셋으로 바꿔 담은 모양도 찍는다
        await page.locator(".gt-panel .gt-preset").selectOption("even");
        await expect(stagebar(page)).toHaveAttribute("data-count", "1");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `gather-tiers-${theme}-${language}-${width}`);
        await stagebar(page)
          .getByRole("button", { name: message(language, "dev_content_discard_all"), exact: true })
          .click();
        await stagebar(page).locator(".ce-confirm-yes").click();
        await expect(stagebar(page)).toHaveCount(0);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
