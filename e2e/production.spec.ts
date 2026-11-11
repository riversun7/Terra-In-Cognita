// 생산 편집기 화면 시험 — /dev/production (사용자 요청 2026-11-11, 기획 D-513·D-529·43 §4, docs/adr/2026-11-11-production-six.md).
// - dev: 개발자 홈의 줄로 들어간다. 묶음 탭 줄(필드채집 3 · 건물생산 3 · 2차가공 · 공용 4)과 탭마다의 수. 스탯 매핑에서 주 스탯을 바꾸면
//   치우침 알림과 함께 담기고, [적용]하면 유닛 추천 표(units.guide)와 그 시설 탭의 미리 보기가 바뀐다. 되돌리면 팩 값.
// - 생산 종류 탭: 미리 보기(유닛 스탯 → 유효 스탯 → 구간·해금 티어 → 시간당 기대 산출), 낚시터 성공 확률.
// - 전투 클래스 탭: 분류 미리 보기(옛 35 클래스), 이름을 고쳐 적용하면 표에 든다.
// - player: 권한 없음 화면.
// - 사진: 390·1440 × 개발 화면 테마 네온·라이트(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 시설·클래스 덮어쓰기를 지운다.
import type { Page } from "@playwright/test";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
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

const GATHER_IDS = ["farm", "lumber_camp", "mine", "herb_field", "ranch", "fishing_spot"];

/** 채집 시설·전투 클래스 덮어쓰기를 모두 지운다(팩 값으로) */
async function resetProduction(page: Page): Promise<void> {
  const current = await trpc(page, "buildings.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`buildings.list ${current.status}`);
  const edited = (rows: unknown, op: string, ids?: readonly string[]) =>
    list(rows).flatMap((row) => {
      const id = String(field(field(row, "entry"), "id"));
      return field(row, "origin") === "edited" && (!ids || ids.includes(id))
        ? [{ op, id, baseHash: field(row, "hash") }]
        : [];
    });
  const changes = [
    ...edited(field(current.data, "facilities"), "revert", GATHER_IDS),
    ...edited(field(current.data, "combatClasses"), "revert_combat_class"),
  ];
  if (changes.length === 0) return;
  const reverted = await trpc(page, "buildings.save", { expectedRevision: revision, changes });
  if (reverted.status !== 200) throw new Error(`buildings.save revert ${reverted.status}`);
}

const screen = (page: Page) => page.locator(".pd-screen");
const stagebar = (page: Page) => page.locator(".pd-stagebar");
const tab = (page: Page, key: string) => page.locator(`.pd-tab[data-tab="${key}"]`);
async function ready(page: Page, search = ""): Promise<void> {
  await page.goto(`/dev/production${search}`);
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}
const guideType = async (page: Page, facility: string): Promise<unknown> =>
  list(field((await trpc(page, "units.guide")).data, "production")).find(
    (row) => field(row, "facility") === facility,
  );

test.describe("개발자", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("묶음 탭 줄과 수, 스탯 매핑을 바꿔 담고 적용하면 추천 표·미리 보기가 바뀐다. 되돌리면 팩 값", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev");
    await page.locator('#main a.dev-tool[href="/dev/production"]').click();
    await expect(page).toHaveURL((url) => url.pathname === "/dev/production");
    await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await resetProduction(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");

    // 탭 줄: 필드채집 = 벌목장·광산·약초원, 건물생산 = 농장·목장·낚시터, 공용 = 확률 분포·스탯 매핑·전투 클래스·개요
    const tabsOf = (group: string) =>
      page
        .locator(`.pd-tab-group[data-group="${group}"] .pd-tab`)
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-tab")));
    expect(await tabsOf("field")).toEqual(["lumber_camp", "mine", "herb_field"]);
    expect(await tabsOf("building")).toEqual(["farm", "ranch", "fishing_spot"]);
    expect(await tabsOf("common")).toEqual(["tiers", "mapping", "classes", "overview"]);
    expect((await tabsOf("process")).length).toBeGreaterThan(0);
    // 수: 사다리 아이템(약초 30·어류 26)·확률표 구간 12·클래스 36
    await expect(tab(page, "herb_field").locator(".pd-tab-count")).toHaveAttribute("data-count", "30");
    await expect(tab(page, "fishing_spot").locator(".pd-tab-count")).toHaveAttribute("data-count", "26");
    await expect(tab(page, "tiers").locator(".pd-tab-count")).toHaveAttribute("data-count", "12");
    await expect(tab(page, "classes").locator(".pd-tab-count")).toHaveAttribute("data-count", "36");

    // 처음 탭 = 첫 생산 종류(벌목장). 미리 보기: 스탯 10·10 → 유효 20 → 첫 구간. 농장은 선택 방식이라 해금 T1
    await expect(screen(page)).toHaveAttribute("data-tab", "lumber_camp");
    await expect(page.locator(".pd-result")).toHaveAttribute("data-stat", "20");
    await expect(page.locator(".pd-result")).toHaveAttribute("data-band", "0");
    await tab(page, "farm").click();
    await expect(page.locator(".pd-result")).toHaveAttribute("data-select-tier", "1");

    // 스탯 매핑: 팩 값은 고름. 광산 주 스탯을 DEX로 바꾸면 치우침 알림 + 담김
    await tab(page, "mapping").click();
    await expect(page.locator(".pd-mapping")).toHaveAttribute("data-balanced", "");
    await expect(page.locator('[data-cover="ok"]')).toBeVisible();
    const mineRow = page.locator('.pd-map-table tr[data-facility="mine"]');
    await expect(mineRow.locator(".pd-map-primary select")).toHaveValue("str");
    await mineRow.locator(".pd-map-primary select").selectOption("dex");
    await expect(page.locator('[data-cover="warn"]')).toBeVisible();
    await expect(page.locator('.pd-cover-table tr[data-stat="str"] td[data-count]').first()).toHaveAttribute(
      "data-count",
      "0",
    );
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(tab(page, "mine").locator(".ce-badge-staged")).toBeVisible();
    // 검사는 막지 않는다(알림뿐) → [적용]
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".gt-note").fill("e2e 스탯 매핑");
    await stagebar(page).locator(".gt-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    // 유닛 추천 표(실효 팩)가 바로 바뀐다
    expect(field(await guideType(page, "mine"), "primary")).toBe("dex");
    // 광산 탭 미리 보기의 주 스탯 칸 이름도 DEX
    await tab(page, "mine").click();
    await expect(screen(page)).toHaveAttribute("data-tab", "mine");
    await expect(page.locator(".pd-type .pd-primary select")).toHaveValue("dex");
    await expect(page.locator(".pd-preview-primary label")).toContainText("DEX");
    // 미리 보기: 주 40·보조 20 → 유효 60 → 넷째 구간(60~79), 진행 ×2
    await page.locator(".pd-preview-primary input").first().fill("40");
    await page.locator(".pd-preview-secondary input").first().fill("20");
    await expect(page.locator(".pd-result")).toHaveAttribute("data-stat", "60");
    await expect(page.locator(".pd-result")).toHaveAttribute("data-band", "3");
    const before = Number(await page.locator(".pd-result").getAttribute("data-per-hour"));
    expect(before).toBeGreaterThan(0);
    // 수확량 상한을 1로 낮추면 시간당 기대 산출이 준다(담김)
    await page.locator(".pd-yield-cap input").first().fill("1");
    await expect
      .poll(async () => Number(await page.locator(".pd-result").getAttribute("data-per-hour")))
      .toBeLessThan(before);
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await page.locator(".pd-head .pd-unstage").click();
    await expect(stagebar(page)).toHaveCount(0);
    // [팩 값으로] → 적용하면 팩 값(STR)
    await page.locator(".pd-head .pd-revert").click();
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".gt-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    expect(field(await guideType(page, "mine"), "primary")).toBe("str");
    await resetProduction(page);
    expect(deviceErrors).toEqual([]);
  });

  test("낚시터 성공 확률, 개요 표, 가공 시설 레시피, 전투 클래스 분류 미리 보기와 이름 고치기", async ({
    page,
    deviceErrors,
  }) => {
    await ready(page, "?tab=fishing_spot");
    await resetProduction(page);
    await page.reload();
    await expect(screen(page)).toHaveAttribute("data-status", "ready");
    // 주소의 ?tab=이 그 탭을 연다. 낚시터: 스탯 10·10 → 성공 350‰
    await expect(screen(page)).toHaveAttribute("data-tab", "fishing_spot");
    await expect(page.locator(".pd-result")).toHaveAttribute("data-catch", "350");
    await expect(page.locator('.pd-fields[data-part="catch"]')).toBeVisible();
    // 사다리 표 10줄(T0~T9)
    await expect(page.locator(".pd-ladder tbody tr")).toHaveCount(10);

    // 개요: 여섯 줄, 표본 스탯 넷
    await tab(page, "overview").click();
    await expect(page.locator(".pd-overview-table tbody tr")).toHaveCount(6);
    await expect(page.locator('.pd-overview-table tr[data-facility="mine"] .pd-sample')).toHaveCount(4);
    // 가공 시설: 제련소 레시피
    await tab(page, "smelter").click();
    await expect(page.locator('.pd-recipes tr[data-recipe="smelt_iron"]')).toBeVisible();

    // 전투 클래스: 처음 표본(STR 40·VIT 30) → 2스탯 워리어. DEX를 30으로 올리면 3스탯 중장갑 보병
    await tab(page, "classes").click();
    const result = page.locator(".pd-class-result");
    await expect(result).toHaveAttribute("data-class", "warrior");
    await expect(result).toHaveAttribute("data-kind", "two");
    await page.locator(".pd-try-dex input").first().fill("30");
    await expect(result).toHaveAttribute("data-class", "heavy_infantry");
    await expect(result).toHaveAttribute("data-kind", "three");
    await expect(page.locator('.pd-class-list[data-kind="two"] .pd-class-item')).toHaveCount(15);
    await expect(page.locator('.pd-class-list[data-kind="three"] .pd-class-item')).toHaveCount(20);
    // 워리어 이름을 고쳐 적용 → 추천 표에 든다
    await page.locator('.pd-class-item[data-class="warrior"]').click();
    await page.locator(".pd-class-name-ko input").fill("철벽 워리어");
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".gt-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    const warrior = list(field((await trpc(page, "units.guide")).data, "classes")).find(
      (row) => field(row, "id") === "warrior",
    );
    expect(field(field(warrior, "name"), "ko")).toBe("철벽 워리어");
    await resetProduction(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page }) => {
    await page.goto("/dev/production");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(screen(page)).toHaveCount(0);
  });
});

// 유닛 정보의 추천(1차 생산·전투 유형): 시안 유닛 상세·사이보그 화면. 게임 화면이라 기본 테마 둘(파스텔·다크) 390으로 찍는다
for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
  test.describe(`유닛 추천 (${theme})`, () => {
    test.use({ account: "dev", preview: "dev", theme });

    test("유닛 상세와 사이보그 화면에 스탯 기준 추천(1차 생산 둘·전투 유형·설명)이 보인다", async ({
      page,
      deviceErrors,
    }) => {
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await page.goto("/units");
      await expect(page.locator(".units-panel")).toBeVisible();
      await expect(page.locator(".units-panel .status")).toHaveCount(0, { timeout: 15_000 });
      await page.locator(".units-row").filter({ hasText: "Mina" }).locator(".units-row-main").click();
      const advice = page.locator(".units-detail .unit-advice");
      await expect(advice).toBeVisible({ timeout: 10_000 });
      // 추천은 표의 시설 둘(쉼표로 이은 ID)과 클래스 하나
      const guide = await page.evaluate(async () => {
        const response = await fetch("/api/trpc/units.guide");
        const json: unknown = await response.json();
        return JSON.stringify(json);
      });
      expect(guide).toContain("fishing_spot");
      const jobs = (await advice.getAttribute("data-jobs")) ?? "";
      expect(jobs.split(",")).toHaveLength(2);
      for (const job of jobs.split(","))
        expect(["farm", "lumber_camp", "mine", "herb_field", "ranch", "fishing_spot"]).toContain(job);
      await expect(advice.locator(".unit-advice-job")).toHaveCount(2);
      await expect(advice.locator(".unit-advice-job").first().locator(".unit-advice-reason")).not.toBeEmpty();
      expect(await advice.getAttribute("data-class")).not.toBe("");
      await expect(advice.locator(".unit-advice-desc")).not.toBeEmpty();
      await expect(advice.locator(".unit-advice-note")).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await advice.scrollIntoViewIfNeeded();
      await shot(page, `unit-advice-detail-${theme}-390`);

      await page.goto("/cyborg");
      await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
      const own = page.locator(".unit-advice").first();
      await expect(own).toBeVisible({ timeout: 10_000 });
      await expect(own.locator(".unit-advice-job")).toHaveCount(2);
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      expect(deviceErrors).toEqual([]);
    });
  });
}

// 개발 화면 층(ADR 2026-11-02-dev-ui): 개발 화면 테마 둘(네온 다크·라이트)로, 보이는 화면 크기로 찍는다
const LAYOUTS: readonly { theme: DevTheme; width: number; height: number; tab: string }[] = [
  { theme: "neon", width: 1440, height: 900, tab: "mine" },
  { theme: "light", width: 1440, height: 900, tab: "mapping" },
  { theme: "neon", width: 390, height: 844, tab: "fishing_spot" },
];

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, width, height, tab: key } of LAYOUTS) {
    test.describe(`${theme}·${width}px·${key}`, () => {
      test.use({
        devTheme: theme,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("탭 줄·판: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        await ready(page, `?tab=${key}`);
        await expect(screen(page)).toHaveAttribute("data-tab", key);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `production-${key}-${theme}-${width}`);
        // 개요·전투 클래스 탭도 넘치지 않는다
        for (const other of ["overview", "classes"]) {
          await tab(page, other).click();
          await expect(screen(page)).toHaveAttribute("data-tab", other);
          expect(await horizontalOverflow(page), other).toEqual([]);
          expect(await smallTapTargets(page), other).toEqual([]);
        }
        if (width >= 1000 && theme === "light") await shot(page, `production-classes-${theme}-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
