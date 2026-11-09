// 1차 생산 티어 확률 화면 시험 — /dev/gather-tiers (기획 49 N43·D-513, docs/adr/2026-11-02-building-editor.md "바뀜 (2026-11-09)").
// - dev: 개발자 홈의 줄로 들어간다. 행렬 칸 하나를 고치면 담기고(합이 1000이 아니면 검사가 막는다), [1000‰ 맞춤] 뒤 [적용]하면 그 세계에
//   바로 든다(buildings.list). [팩 값으로]를 담아 적용하면 팩 값. 건물 편집기에는 확률 탭이 없다.
// - player: 권한 없음 화면.
// - 사진: 390·1440 × 개발 화면 테마 네온·라이트 × 한국어·영어(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 확률표 덮어쓰기를 모두 지운다.
import type { Page } from "@playwright/test";
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
const bandRow = (page: Page, id: string) => page.locator(`.gt-table tr[data-band-id="${id}"]`);
async function ready(page: Page): Promise<void> {
  await page.goto("/dev/gather-tiers");
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

test.describe("개발자", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("개발자 홈에서 들어가 칸을 고치면 담기고, 합이 1000이 아니면 막고, 맞춘 뒤 [적용]하면 든다. [팩 값으로]는 팩 값", async ({
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

    // T1 칸에 +7: 담기고 합이 1007 → 검사가 막는다
    const t1 = row.locator('input[data-tier="1"]');
    await t1.fill(String((weights[1] ?? 0) + 7));
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(row).toHaveAttribute("data-staged", "");
    await expect(row.locator(".gt-sum")).toHaveAttribute("data-invalid", "");
    await expect(stagebar(page)).toHaveAttribute("data-check", "blocked", { timeout: 10_000 });
    // ↓ 키는 다음 구간의 같은 티어 칸으로
    await t1.press("ArrowDown");
    await expect(page.locator('.gt-table input[data-row="1"][data-tier="1"]')).toBeFocused();
    // [1000‰ 맞춤] → 통과 → [적용]
    await row.locator(".gt-normalize").click();
    await expect(row.locator(".gt-sum")).not.toHaveAttribute("data-invalid", "");
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

    // [팩 값으로] → 적용하면 팩 값
    await row.getByRole("button", { name: message("ko", "dev_buildings_revert"), exact: true }).click();
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
        await page.locator(".gt-table tbody tr").first().locator(".gt-preset").selectOption("even");
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
