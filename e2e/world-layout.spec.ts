// 세계 배치 화면 시험 — /dev/world-layout (기획 D-528, docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)").
// - admin: 국가 넷과 수도(NPC가 고른 수도, 발전도)가 표에 보이고, 행성 평면 지도(1차맵 타일)에 도시·수도 표시가 선다. [자동 제안 보기] →
//   점선 제안 → [제안 모두 놓기]로 자리를 놓는다(지금 세계는 같은 자동 배치로 섰으므로 이미 그 자리 → 적용됨). 지도에서 놓은 자리를 눌러
//   다른 국가를 놓으면 "너무 가깝다". 놓은 자리를 지우면 자동 배치로 돌아간다.
// - 국력 등급("바뀜 (2026-11-11)"): 등급 배치 계획 미리 보기(국가마다 수도 마름모 + 시작 도시 점, 등급이 클수록 큰 표시)·다시 만들기,
//   이 세계에 반영 미리 보기(시험 세계는 처음부터 등급대로 서서 더 세울 도시가 없다), 세울 수 있는 국가 목록.
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

/** 놓은 자리를 모두 지운다(선 국가의 자리 + 세울 국가의 자리 + 등급 반영 예약) */
async function clearAll(page: Page): Promise<void> {
  const view = await trpc(page, "worldLayout.view", { planetId: PLANET });
  for (const nation of list(field(view.data, "nations")))
    if (field(nation, "placement") !== null)
      await trpc(page, "worldLayout.clear", { planetId: PLANET, code: field(nation, "code") }, true);
  for (const entry of list(field(view.data, "founding")))
    if (field(entry, "mapKey") !== null)
      await trpc(page, "worldLayout.clear", { planetId: PLANET, code: field(entry, "code") }, true);
  await trpc(page, "worldLayout.cancelTierApply", { planetId: PLANET }, true);
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

test.describe("국력 등급", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("등급 배치 계획 미리 보기·다시 만들기, 이 세계에 반영 미리 보기(새 세계는 더할 것 없음), 세울 수 있는 국가", async ({
    page,
    deviceErrors,
  }) => {
    await openScreen(page);
    await clearAll(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-planet", "ready", { timeout: 90_000 });
    const panel = page.getByTestId("wl-tier");
    // 국가 표에 등급 표지: 국가 넷 = 소국·초강대국·강대국·중견국(1번 = 16번째 프리셋)
    await expect(page.locator(".wl-table .wl-tier-badge")).toHaveCount(4);
    await expect(page.locator('.wl-table .wl-tier-badge[data-tier="superpower"]')).toHaveCount(1);

    // 계획 미리 보기: 국가마다 수도(마름모, 등급 크기) + 시작 도시(등급 수 — 초강대국 6·강대국 4·중견국 3·소국 2, 땅이 모자라면 적다)
    const suggested = await trpc(page, "worldLayout.suggest", { planetId: PLANET });
    const planned = list(field(field(suggested.data, "plan"), "nations"));
    expect(planned).toHaveLength(4);
    const cityCount = planned.reduce((sum: number, nation) => sum + list(field(nation, "cities")).length, 0);
    expect(planned.map((nation) => Number(field(nation, "wantCities"))).toSorted((a, b) => a - b)).toEqual([
      2, 3, 4, 6,
    ]);
    await panel.locator(".wl-plan-show").click();
    await expect(panel.locator(".wl-plan-table tbody tr")).toHaveCount(4);
    await expect(page.locator('.wl-mark[data-kind="plan_home"]')).toHaveCount(4);
    await expect(page.locator('.wl-mark[data-kind="plan_home"][data-tier="superpower"]')).toHaveCount(1);
    await expect(page.locator('.wl-mark[data-kind="plan_city"]')).toHaveCount(cityCount - 4);
    const superRow = panel.locator('.wl-plan-table tr[data-tier="superpower"]');
    await expect(superRow).toContainText(message("ko", "dev_power_tier_superpower"));
    // 초강대국 수도 표시가 소국 표시보다 크다
    const size = async (tier: string) =>
      (await page.locator(`.wl-mark[data-kind="plan_home"][data-tier="${tier}"]`).first().boundingBox())
        ?.width ?? 0;
    expect(await size("superpower")).toBeGreaterThan(await size("small_state"));
    // 다시 만들기: 같은 세계 시드라 같은 계획(결정적)
    const homes = () =>
      page
        .locator('.wl-mark[data-kind="plan_home"]')
        .evaluateAll((marks) => marks.map((mark) => mark.getAttribute("style") ?? "").join("|"));
    const before = await homes();
    await panel.locator(".wl-plan-show").click();
    await expect(page.locator('.wl-mark[data-kind="plan_home"]')).toHaveCount(4);
    expect(await homes()).toBe(before);
    await panel.locator(".wl-plan-hide").click();
    await expect(page.locator('.wl-mark[data-kind="plan_home"]')).toHaveCount(0);

    // 이 세계에 반영 미리 보기: 시험 세계는 처음부터 등급대로 섰다 → 더 세울 도시가 없다(휴먼 수는 NPC 사회가 돌며 바뀔 수 있다).
    // 미리 보기는 예약을 만들지 않는다
    await panel.locator(".wl-apply-show").click();
    await expect(panel.locator(".wl-apply-table tbody tr")).toHaveCount(4);
    await expect(panel.getByTestId("wl-apply-totals")).toBeVisible();
    for (const row of await panel.locator(".wl-apply-table tbody tr").all())
      await expect(row).toHaveAttribute("data-add", "0");
    const plan = await trpc(page, "worldLayout.tierPlan", { planetId: PLANET });
    expect(field(field(plan.data, "totals"), "cities")).toBe(0);
    expect(field(plan.data, "request")).toBeNull();
    await panel.locator(".wl-apply-hide").click();

    // 세울 수 있는 국가: 차례 밖 프리셋 12개(4~15번째). 고르고 다른 국가 수도 자리에 놓으면 너무 가깝다(세우지 않는다)
    const candidates = panel.locator('.wl-found-list[data-list="candidates"] li');
    await expect(candidates.nth(11)).toBeVisible();
    await candidates.first().locator(".wl-pick").click();
    const code = (await candidates.first().getAttribute("data-found-code")) ?? "";
    await expect(page.locator(".wl-field select")).toHaveValue(code);
    await clickMark(page, '.wl-mark[data-kind="capital"]');
    await page.getByRole("button", { name: message("ko", "dev_world_layout_place"), exact: true }).click();
    await expect(page.locator(".wl-panel .message-error")).toBeVisible();
    const view = await trpc(page, "worldLayout.view", { planetId: PLANET });
    expect(list(field(view.data, "founding")).every((entry) => field(entry, "mapKey") === null)).toBe(true);
    await clearAll(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("배후지 덮개(docs/adr/2026-11-11-city-catchment.md)", () => {
  test.use({ account: "admin" });

  for (const { theme, width } of [
    { theme: "neon" as const, width: 1440 },
    { theme: "light" as const, width: 390 },
  ] satisfies readonly { theme: DevTheme; width: number }[]) {
    test.describe(`${theme}·${width}px`, () => {
      test.use({
        devTheme: theme,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height: 844 } }),
      });

      test("고른 국가 수도 둘레 격자·지금(실선)·계획(점선) 배후지, 간격 값, 겹친 쌍 0", async ({
        page,
        deviceErrors,
      }) => {
        await openScreen(page);
        const code = await page.locator(".wl-field select").inputValue();
        const api = await trpc(page, "worldLayout.catchment", { planetId: PLANET, code });
        expect(api.status).toBe(200);
        const radius = Number(field(api.data, "radiusCells"));
        const span = Number(field(api.data, "span"));
        expect(radius).toBe(2);
        expect(field(api.data, "sameGapCells")).toBe(4);
        expect(field(api.data, "foreignGapCells")).toBe(6);
        expect(list(field(api.data, "cells"))).toHaveLength((2 * span + 1) ** 2);
        // 계획(새 배치)은 배후지가 겹친 도시 쌍이 없다. 지금 세계 값은 앞서 도는 시험(폐허 복원·자리 놓기 등)이 도시를 더해 바뀔 수
        // 있어 수로만 본다(시험 순서에 따라 달라진다)
        expect(typeof field(api.data, "overlapWorld")).toBe("number");
        expect(field(api.data, "overlapPlan")).toBe(0);
        const panel = page.locator(".wl-catch");
        await panel
          .getByRole("button", { name: message("ko", "dev_world_layout_catchment_show"), exact: true })
          .click();
        await expect(panel).toHaveAttribute("data-state", "ready");
        await expect(panel.locator(".wl-catch-cell")).toHaveCount((2 * span + 1) ** 2);
        await expect(panel.locator('[data-catch-city="world"][data-own]').first()).toBeVisible();
        await expect(panel.locator('[data-catch-city="plan"]').first()).toBeAttached();
        await expect(panel.locator("[data-catch-summary]")).toContainText("2");
        await panel.evaluate((node) => node.scrollIntoView({ block: "start" }));
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `world-layout-catchment-${theme}-ko-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
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
        // 국력 등급 판(등급 배치 계획 표 — [자동 제안 보기]가 계획도 함께 받는다)
        await expect(page.locator('.wl-mark[data-kind="plan_home"]').first()).toBeVisible();
        await page.getByTestId("wl-tier").evaluate((node) => node.scrollIntoView({ block: "start" }));
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `world-layout-tiers-${theme}-ko-${width}`);
        await page.locator(".wl-table").evaluate((table) => table.scrollIntoView({ block: "center" }));
        await shot(page, `world-layout-table-${theme}-ko-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
