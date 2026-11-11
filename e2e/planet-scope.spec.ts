// 행성 범위(범위 줄·행성 고르기·모니터링 행성 거르기) 화면 시험 — docs/adr/2026-11-11-planet-scope.md.
// 사용자 요청(2026-11-11): "행성을 선택이 필요한 에디터에 행성 선택하는 기능이 없어 어디에만 반영되는지 확인 불가. 모니터링도 행성별로 가능해야함."
// - 주소 ?planet= 왕복: 세계 배치 화면이 고른 행성을 주소에 적고, 새로고침·바로 연 링크에 남는다. 틀린 값은 대표 플레이 행성으로 고친다.
// - 2차맵 시험은 편집 전용 행성도 고른다(상태 표지). 세계 자료를 바꾸는 화면은 플레이 행성만 고른다.
// - 운영자 콘솔: 처음은 "전체"(?planet=*). 행성을 고르면 현황 행성별 표의 그 줄이 강조되고, 유닛·감사 기록 조회에 planetId가 든다.
//   유저 탭은 세계 전체(거르지 않음).
// - 감사 기록: 세계 배치로 놓은 자리의 기록에 행성이 붙고(범위 칸), 그 행성으로 거르면 나온다. 놓은 자리는 끝에 지운다.
// - 담은 변경 막대: 설정 칸 = "모든 행성 공통", 세계 배치 = 그 행성.
// - 사진: 1440 × 개발 화면 테마 둘(네온·라이트) × (설정 칸·운영자 콘솔), 390 하나(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";
import { watchTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 이 세계의 플레이 행성(콘텐츠 팩 S2 시험 행성)과 편집 전용 행성 */
const PLAYABLE = "s2_test_planet";
const EDITOR_ONLY = "s2_editor_planet";

const bar = (page: Page) => page.locator(".scope-bar");
const planetParam = (page: Page): string | null => new URL(page.url()).searchParams.get("planet");

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

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

async function closeSummary(page: Page): Promise<void> {
  await page.addLocatorHandler(page.locator("dialog.summary-dialog[open]"), async () => {
    await page.keyboard.press("Escape");
  });
}

test.describe("행성 범위 — admin", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("세계 배치: 고른 행성이 주소 ?planet=에 남고(새로고침·링크), 틀린 값은 대표 행성으로 고친다. 편집 전용 행성은 고를 수 없다", async ({
    page,
  }) => {
    await closeSummary(page);
    await page.goto("/dev/world-layout");
    await expect(bar(page)).toHaveAttribute("data-scope", "planet");
    await expect(bar(page)).toHaveAttribute("data-planet", PLAYABLE);
    await expect.poll(() => planetParam(page)).toBe(PLAYABLE);
    await expect(page.locator(".scope-select")).toHaveValue(PLAYABLE);
    await expect(page.locator(".scope-status")).toHaveAttribute("data-status", "playable");
    // 세계 자료를 바꾸는 화면: 플레이 행성만
    await expect(page.locator(`.scope-select option[value="${EDITOR_ONLY}"]`)).toHaveCount(0);
    await expect(page.locator(".wl-screen")).toHaveAttribute("data-planet-id", PLAYABLE);
    await expect(page.locator(".wl-screen")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    // 적용 대상 = 그 행성
    await expect(page.locator(".wl-actions .scope-target")).toHaveAttribute("data-target", PLAYABLE);
    // 새로고침해도 남는다
    await page.reload();
    await expect(bar(page)).toHaveAttribute("data-planet", PLAYABLE);
    expect(planetParam(page)).toBe(PLAYABLE);
    // 편집 전용·모르는 행성을 주소에 넣으면 대표 플레이 행성으로 고친다
    for (const bad of [EDITOR_ONLY, "no_such_planet"]) {
      await page.goto(`/dev/world-layout?planet=${bad}`);
      await expect(bar(page)).toHaveAttribute("data-planet", PLAYABLE);
      await expect.poll(() => planetParam(page)).toBe(PLAYABLE);
    }
    expect(await horizontalOverflow(page)).toEqual([]);
  });

  test("2차맵 시험: 편집 전용 행성도 고른다(상태 표지 = 편집 전용, 주소에 남음)", async ({ page }) => {
    await closeSummary(page);
    await page.goto(`/dev/second-map?planet=${PLAYABLE}`);
    const select = page.locator(".sml-header .scope-select");
    await expect(select).toHaveValue(PLAYABLE);
    await expect(select.locator(`option[value="${EDITOR_ONLY}"]`)).toHaveCount(1);
    await select.selectOption(EDITOR_ONLY);
    await expect(page.locator(".sml-header .scope-status")).toHaveAttribute("data-status", "editor");
    await expect.poll(() => planetParam(page)).toBe(EDITOR_ONLY);
    // 판의 행성 고르기도 같이 바뀐다(같은 값을 본다)
    await expect(page.locator(".sml-planet")).toHaveValue(EDITOR_ONLY);
    // 되돌린다(기기 생성이 큰 행성을 만들지 않게)
    await select.selectOption(PLAYABLE);
    await expect(page.locator(".sml-header .scope-status")).toHaveAttribute("data-status", "playable");
    await expect.poll(() => planetParam(page)).toBe(PLAYABLE);
  });

  test("운영자 콘솔: 처음은 전체, 행성을 고르면 현황·유닛·감사 기록이 그 행성으로 걸러지고 유저 탭은 세계 전체다", async ({
    page,
    deviceErrors,
  }) => {
    await closeSummary(page);
    await page.goto("/ops");
    await expect(page.locator("#ops-title")).toBeVisible();
    await expect(bar(page)).toHaveAttribute("data-planet", "*");
    await expect.poll(() => planetParam(page)).toBe("*");
    // 현황: 행성별 합(행성 한 줄 + 전체 줄, 전체 줄이 지금 고른 것)
    const rows = page.locator(".ops-planets tbody tr");
    await expect(rows).toHaveCount(2);
    const planetRow = page.locator(`.ops-planets tr[data-planet="${PLAYABLE}"]`);
    const allRow = page.locator('.ops-planets tr[data-planet="all"]');
    await expect(allRow).toHaveAttribute("aria-current", "true");
    // 플레이 행성이 하나라 그 줄과 전체 줄이 같다
    for (const key of ["maps", "units", "cities", "buildings"]) {
      const value = await planetRow.locator(`td[data-total="${key}"]`).innerText();
      expect(await allRow.locator(`td[data-total="${key}"]`).innerText()).toBe(value);
    }
    const maps = (await planetRow.locator('td[data-total="maps"]').innerText()).replaceAll(",", "");
    expect(Number(maps)).toBeGreaterThan(0);

    // 행성을 고른다 → 주소·강조·탭 안내
    await page.locator(".scope-select").selectOption(PLAYABLE);
    await expect.poll(() => planetParam(page)).toBe(PLAYABLE);
    await expect(planetRow).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".ops-main")).toHaveAttribute("data-planet", PLAYABLE);
    await expect(page.locator(".ops-main .scope-tab-note")).toBeVisible();

    // 유닛·도시·세력·감사 기록 조회에 planetId가 든다
    const calls = watchTrpc(page);
    const inputOf = (procedure: string): unknown => {
      for (const call of calls.toReversed()) {
        const at = call.procedures.indexOf(procedure);
        if (at !== -1) return call.inputs[at];
      }
      return undefined;
    };
    const tabs = page.locator(".ops-tabs [role='tab']");
    for (const [index, procedure] of [
      [2, "ops.npcs.factions"],
      [3, "ops.npcs.cities"],
      [5, "ops.units.list"],
      [7, "ops.audit"],
    ] as const) {
      await tabs.nth(index).click();
      await expect.poll(() => field(inputOf(procedure), "planetId")).toBe(PLAYABLE);
    }
    // 유저 탭은 세계 전체
    await tabs.nth(1).click();
    await expect(page.locator(".ops-main")).toHaveAttribute("data-planet", "world");
    await expect(page.locator(".ops-main .scope-tab-note")).toBeVisible();
    // 새로고침해도 고른 행성이 남는다(주소)
    await page.reload();
    await expect(bar(page)).toHaveAttribute("data-planet", PLAYABLE);
    // 전체로 되돌리면 조회에 planetId가 없다
    await page.locator(".scope-select").selectOption("*");
    await expect.poll(() => planetParam(page)).toBe("*");
    await page.locator(".ops-tabs [role='tab']").nth(5).click();
    await expect.poll(() => inputOf("ops.units.list") !== undefined).toBe(true);
    await expect.poll(() => field(inputOf("ops.units.list"), "planetId")).toBeUndefined();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("감사 기록에 행성이 남는다: 세계 배치로 놓은 자리 → 범위 칸에 행성, 그 행성으로 거르면 나온다. 플레이 행성이 아니면 404", async ({
    page,
  }) => {
    await closeSummary(page);
    await page.goto("/dev/world-layout");
    await expect(page.locator(".wl-screen")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    // 자동 제안 자리 하나를 놓는다(planetId 없이 = 대표 플레이 행성 — 옛 기기와 같은 부르기)
    const suggestion = await trpc(page, "worldLayout.suggest", {});
    expect(suggestion.status).toBe(200);
    const home = list(field(suggestion.data, "homes"))[0];
    expect(home, "자동 제안 자리가 있어야 한다").toBeDefined();
    const code = String(field(home, "code"));
    const placed = await trpc(
      page,
      "worldLayout.place",
      { placements: [{ code, mapKey: String(field(home, "mapKey")) }] },
      true,
    );
    expect(placed.status).toBe(200);
    try {
      // 서버: 그 행성으로 거른 감사 기록의 첫 줄
      const audit = await trpc(page, "ops.audit", { planetId: PLAYABLE, limit: 5 });
      expect(audit.status).toBe(200);
      const first = list(audit.data)[0];
      expect(field(first, "action")).toBe("world.place_nation");
      expect(field(field(first, "meta"), "planetId")).toBe(PLAYABLE);
      // 플레이 행성이 아닌 행성으로는 거르지 못한다
      expect((await trpc(page, "ops.audit", { planetId: EDITOR_ONLY })).status).toBe(404);
      expect((await trpc(page, "worldLayout.view", { planetId: EDITOR_ONLY })).status).toBe(404);
      // 화면: 감사 기록 탭, 그 행성으로 거름 → 줄마다 범위 칸에 그 행성
      await page.goto(`/ops?tab=audit&planet=${PLAYABLE}`);
      await expect(page.locator(".ops-main")).toHaveAttribute("data-planet", PLAYABLE);
      const scopes = page.locator(".ops-audit tbody .ops-audit-scope .scope-target");
      await expect(scopes.first()).toHaveAttribute("data-target", PLAYABLE);
      const targets = await scopes.evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute("data-target")),
      );
      expect(new Set(targets)).toEqual(new Set([PLAYABLE]));
    } finally {
      await trpc(page, "worldLayout.clear", { code }, true);
    }
  });

  test("설정 칸: 담은 변경 막대의 적용 대상 = 모든 행성 공통", async ({ page }) => {
    await closeSummary(page);
    await page.goto("/dev/tuning");
    await expect(bar(page)).toHaveAttribute("data-scope", "common");
    // 풀이에 지금 플레이 행성 이름이 붙는다
    await expect(page.locator(".scope-bar .scope-tail")).toBeVisible();
    const row = page.locator('.tp-row[data-id="n39_grant_base"]');
    await row.locator(".tp-input").fill("90");
    await row.locator(".tp-stage").click();
    await expect(page.locator(".tp-pending .scope-target")).toHaveAttribute("data-target", "common");
    // 주소에 ?planet=을 적지 않는다(공통 화면)
    expect(planetParam(page)).toBeNull();
  });
});

test.describe("행성 범위 — player", () => {
  test.use({ account: "player" });

  test("플레이어는 편집 전용 행성을 받지 않는다", async ({ page }) => {
    await page.goto("/");
    const answer = await trpc(page, "planetScope.list", undefined);
    expect(answer.status).toBe(200);
    expect(list(field(answer.data, "planets")).map((planet) => field(planet, "id"))).toEqual([PLAYABLE]);
    expect(field(answer.data, "primaryPlanetId")).toBe(PLAYABLE);
  });
});

for (const devTheme of ["neon", "light"] as const satisfies readonly DevTheme[]) {
  test.describe(`사진 1440 ${devTheme}`, () => {
    test.use({ account: "admin", devTheme, ...VIEWPORTS.desktop });

    test("설정 칸(모든 행성 공통)·운영자 콘솔(행성 고름)", async ({ page }) => {
      await closeSummary(page);
      await page.goto("/dev/tuning");
      await expect(bar(page)).toHaveAttribute("data-scope", "common");
      await expect(page.locator(".scope-bar .scope-tail")).toBeVisible();
      await expect(page.locator(".tp-screen")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
      await shot(page, `planet-scope-tuning-1440-${devTheme}`);
      await page.goto(`/ops?planet=${PLAYABLE}`);
      await expect(page.locator(`.ops-planets tr[data-planet="${PLAYABLE}"]`)).toHaveAttribute(
        "aria-current",
        "true",
      );
      await shot(page, `planet-scope-ops-1440-${devTheme}`);
    });
  });
}

test.describe("사진 390", () => {
  test.use({ account: "admin" });

  test("세계 배치(행성 고르기)가 390px에서 넘치지 않는다", async ({ page }) => {
    await closeSummary(page);
    await page.goto("/dev/world-layout");
    await expect(bar(page)).toHaveAttribute("data-planet", PLAYABLE);
    await expect(page.locator(".wl-screen")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    // 행성 평면 지도(타일 24장)가 그려진 뒤에 찍는다
    await expect(page.locator(".wl-screen")).toHaveAttribute("data-planet", "ready", { timeout: 90_000 });
    await expect(page.locator(".wl-map .flat-map-canvas")).toHaveAttribute("data-paint-ms", /\d/, {
      timeout: 15_000,
    });
    expect(await horizontalOverflow(page)).toEqual([]);
    await shot(page, "planet-scope-world-layout-390-neon");
  });
});
