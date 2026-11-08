// 세계 배치 화면 시험 — /dev/world-layout (기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)").
// - admin: 국가 넷과 수도(NPC가 고른 수도, 발전도)가 표에 보이고, 행성 평면 지도(1차맵 타일)에 도시·수도 표시가 선다. [자동 제안 보기] →
//   점선 제안 → [제안 모두 놓기]로 자리를 놓는다(지금 세계는 같은 자동 배치로 섰으므로 이미 그 자리 → 적용됨). 지도에서 놓은 자리를 눌러
//   다른 국가를 놓으면 "너무 가깝다". 놓은 자리를 지우면 자동 배치로 돌아간다.
// - player: 권한 없음 화면, tRPC worldLayout.view는 403.
// - 사진: 1440(VIEWPORTS.desktop)·390 × 개발 화면 테마 네온·라이트(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 놓은 자리는 다음 서버 시작 때만 세계에 든다(이 실행의 서버는 다시 켜지 않는다) → 다른 시험에 영향이 없게 끝에 모두 지운다.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const PLANET = "s2_test_planet";

const screen = (page: Page) => page.locator(".wl-screen");
const canvas = (page: Page) => page.locator(".wl-map .flat-map-canvas");

/** 화면 안에서 tRPC 부르기(같은 출처, 화면과 같은 쿠키). mutation이면 POST */
async function trpc(
  page: Page,
  procedure: string,
  input: unknown,
  mutation = false,
): Promise<{ status: number; data: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, post }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const response = post
        ? await fetch(`/api/trpc/${name}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/trpc/${name}?input=${encodeURIComponent(JSON.stringify(body))}`);
      const json: unknown = await response.json();
      return { status: response.status, data: get(get(json, "result"), "data") };
    },
    { procedure, input, post: mutation },
  );
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 놓은 자리를 모두 지운다 */
async function clearAll(page: Page): Promise<void> {
  const view = await trpc(page, "worldLayout.view", { planetId: PLANET });
  for (const nation of list(field(view.data, "nations")))
    if (field(nation, "placement") !== null)
      await trpc(page, "worldLayout.clear", { planetId: PLANET, code: field(nation, "code") }, true);
}

async function openScreen(page: Page): Promise<void> {
  await page.addLocatorHandler(page.locator("dialog.summary-dialog[open]"), async () => {
    await page.keyboard.press("Escape");
  });
  await page.goto("/dev/world-layout");
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  // 행성 평면 지도(목록 정보·타일 24장). 처음 굽는 행성은 오래 걸린다
  await expect(screen(page)).toHaveAttribute("data-planet", "ready", { timeout: 90_000 });
  await expect(canvas(page)).toHaveAttribute("data-paint-ms", /\d/, { timeout: 15_000 });
}

/** 지도 표시(그 종류의 n번째) 자리를 누른다 */
async function clickMark(page: Page, selector: string): Promise<void> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  const style = (await page.locator(selector).first().getAttribute("style")) ?? "";
  const left = Number(/left:\s*([\d.]+)%/.exec(style)?.[1] ?? "50");
  const top = Number(/top:\s*([\d.]+)%/.exec(style)?.[1] ?? "50");
  await canvas(page).click({ position: { x: (box.width * left) / 100, y: (box.height * top) / 100 } });
}

test.describe("관리자", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("국가·수도 표와 지도 표시, 자동 제안 놓기, 너무 가까움, 지우기", async ({ page, deviceErrors }) => {
    await openScreen(page);
    await clearAll(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    await expect(screen(page)).toHaveAttribute("data-nations", "4");
    const rows = page.locator(".wl-table tbody tr");
    await expect(rows).toHaveCount(4);
    for (const row of await rows.all()) await expect(row).toHaveAttribute("data-state", "auto");
    // 수도 표시가 국가마다 하나
    await expect(screen(page)).toHaveAttribute("data-planet", "ready", { timeout: 90_000 });
    await expect(page.locator('.wl-mark[data-kind="capital"]')).toHaveCount(4);
    await expect(page.locator(".wl-table tbody td").nth(1)).not.toHaveText(
      message("ko", "dev_world_layout_capital_none"),
    );

    // 자동 제안 → 모두 놓기(지금 세계가 같은 자동 배치라 이미 그 자리 → 적용됨)
    await page.getByRole("button", { name: message("ko", "dev_world_layout_suggest"), exact: true }).click();
    await expect(page.locator('.wl-mark[data-kind="suggested"]')).toHaveCount(4);
    await page
      .getByRole("button", { name: message("ko", "dev_world_layout_apply_suggest"), exact: true })
      .click();
    await expect(page.locator('.wl-mark[data-kind="placed"]')).toHaveCount(4);
    for (const row of await rows.all()) await expect(row).toHaveAttribute("data-state", /applied|pending/);

    // 둘째 국가의 놓은 자리를 눌러 셋째 국가를 놓으면 너무 가깝다
    const codes = await rows.evaluateAll((all) =>
      all.map((row) => row.getAttribute("data-nation-code") ?? ""),
    );
    const second = codes[1] ?? "";
    const third = codes[2] ?? "";
    const secondName =
      (await page.locator(`.wl-table tr[data-nation-code="${second}"] .wl-pick`).textContent()) ?? "";
    await page.locator(".wl-field select").selectOption(third);
    await clickMark(page, `.wl-mark[data-kind="placed"][data-code="${second}"]`);
    await expect(page.locator(".wl-panel .dev-code")).toBeVisible();
    await page.getByRole("button", { name: message("ko", "dev_world_layout_place"), exact: true }).click();
    const gap = Number(
      /\d+/.exec((await page.locator(".wl-summary .dev-badge").textContent())?.split("·").at(-1) ?? "")?.[0],
    );
    await expect(page.locator(".wl-panel")).toContainText(
      message("ko", "dev_world_layout_code_too_close", { near: secondName, gap }),
    );

    // 지우기 → 자동
    await page.locator(".wl-field select").selectOption(second);
    await page.getByRole("button", { name: message("ko", "dev_world_layout_clear"), exact: true }).click();
    await expect(page.locator(`.wl-table tr[data-nation-code="${second}"]`)).toHaveAttribute(
      "data-state",
      "auto",
    );
    await clearAll(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, worldLayout.view 403", async ({ page }) => {
    await page.goto("/dev/world-layout");
    await expect(screen(page)).toHaveCount(0);
    const view = await trpc(page, "worldLayout.view", { planetId: PLANET });
    expect(view.status).toBe(403);
  });
});

const LAYOUTS = (["neon", "light"] as const satisfies readonly DevTheme[]).flatMap((theme) => [
  { theme, width: 390, height: 844 },
  { theme, width: 1440, height: 900 },
]);

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, width, height } of LAYOUTS) {
    test.describe(`${theme}·${width}px`, () => {
      test.use({ devTheme: theme, ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }) });

      test("지도·판·표: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
        await openScreen(page);
        await page
          .getByRole("button", { name: message("ko", "dev_world_layout_suggest"), exact: true })
          .click();
        await expect(page.locator('.wl-mark[data-kind="suggested"]').first()).toBeVisible();
        await clickMark(page, '.wl-mark[data-kind="capital"]');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `world-layout-${theme}-ko-${width}`);
        await page.locator(".wl-table").evaluate((table) => table.scrollIntoView({ block: "center" }));
        await shot(page, `world-layout-table-${theme}-ko-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
