// 신전·생명과학 연구소 화면 시험 — 생산 칸 "신전·생명과학 연구소"(D-517·D-311·D-441·D-451, docs/adr/2026-11-07-temple-religion.md).
// - admin: 유닛 화면 [융합] 칸에서 시험 스탯 유전자 둘 → 인큐베이터(주력)로 휴먼 둘 → 경제 → 생산에서 그 휴먼들 곁에 신전·생명과학 연구소를
//   짓고 [바로 끝내기] → 신전 칸: 휴먼 A [비활성으로(시험)] → 신전 카드에 보임, 환생 막힘(신앙도 0) → 시험 화폐 → 헌금 2,500(+50) → [환생]
//   (다시 일함) → 다시 비활성 → 헌금 5,000 → [신격화](수호신 1) → 휴먼 B 비활성 → 연구소 [유전자로 변환]. 유닛 화면 [융합] 칸의 비활성 표시도 본다.
// - 사진(E2E_SHOTS_DIR): 신전 칸 390 파스텔 한국어·390 다크 영어·1440 파스텔 한국어·1440 다크 영어, 유닛 화면 비활성 카드 390 파스텔·다크.
// 복귀 요약은 띄우지 않는다(hideSummary).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

test.beforeEach(async ({ page }) => {
  await rewriteTrpc(page, { "summary.get": hideSummary });
});

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC 조회를 부른다(같은 출처, 화면과 같은 쿠키) */
async function trpcGet(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (procedure) => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const get = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    const response = await fetch(`/api/trpc/${procedure}`);
    const json: unknown = await response.json();
    return get(get(json, "result"), "data");
  }, path);
}

const humanIds = async (page: Page): Promise<number[]> =>
  list(field(await trpcGet(page, "temple.overview"), "humans")).map((h) => Number(field(h, "unitId")));

/** 유닛 화면 [융합] 칸에서 시험 스탯 유전자 → 인큐베이터(주력)로 휴먼 하나. 새 휴먼 ID */
async function incubateHuman(page: Page): Promise<number> {
  await page.goto("/units");
  await page.getByRole("tab", { name: new RegExp(`^${message("ko", "units_tab_fusion")}`) }).click();
  await expect(page.locator(".fusion")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  const before = await humanIds(page);
  const statGenes = page.locator('.fusion-gene[data-kind="stat"]');
  const count = await statGenes.count();
  await page.getByRole("button", { name: message("ko", "fusion_dev_stat_gene"), exact: true }).click();
  await expect(statGenes).toHaveCount(count + 1, { timeout: 20_000 });
  await statGenes.last().locator(".fusion-incubate-main").click();
  await expect(statGenes).toHaveCount(count, { timeout: 20_000 });
  const born = (await humanIds(page)).find((id) => !before.includes(id));
  if (born === undefined) throw new Error("incubated human not listed");
  return born;
}

/** 그 휴먼이 선 칸 */
async function cellOf(page: Page, unitId: number): Promise<{ x: number; y: number }> {
  const human = list(field(await trpcGet(page, "temple.overview"), "humans")).find(
    (h) => Number(field(h, "unitId")) === unitId,
  );
  const cell = field(human, "cell");
  return { x: Number(field(cell, "x")), y: Number(field(cell, "y")) };
}

/** 칸 근처 빈 자리에 시설을 짓고(그 칸 도시 창고로 시험 재료) [바로 끝내기]. 그 시설 카드 */
async function buildNear(
  page: Page,
  facility: string,
  name: string,
  cell: { x: number; y: number },
): Promise<void> {
  const facilities = page.locator('section[data-part="facilities"]');
  await expect(facilities.locator('[data-part="facility-units"]')).toBeVisible({ timeout: 15_000 });
  const form = facilities.locator("form.labor-form");
  const cards = facilities.locator('li[data-part="facility-card"]');
  const build = form.getByRole("button", { name: message("ko", "facility_build"), exact: true });
  await form.getByLabel(message("ko", "facility_field_facility")).selectOption(facility);
  for (const [dx, dy] of [
    [3, 3],
    [-6, 3],
    [3, -6],
    [-6, -6],
    [8, 0],
    [0, 8],
    [-10, 0],
    [0, -10],
  ] as const) {
    const x = Math.min(250, Math.max(2, cell.x + dx));
    const y = Math.min(250, Math.max(2, cell.y + dy));
    await form.getByLabel(message("ko", "facility_field_x")).fill(String(x));
    await form.getByLabel(message("ko", "facility_field_y")).fill(String(y));
    if (await build.isDisabled()) {
      // 그 칸 도시 창고에 재료가 모자랄 때만 받는다(받기가 속도 제한에 걸리면 토큰이 찰 때까지 다시)
      await expect(async () => {
        if (await build.isDisabled())
          await form.getByRole("button", { name: message("ko", "facility_dev_grant") }).click();
        await expect(build).toBeEnabled({ timeout: 3_000 });
      }).toPass({ timeout: 60_000, intervals: [3_000] });
    }
    // 사용자별 건물 명령 속도 제한(순간 10번·분당 30번 — 시험 재료 받기가 여러 번 쓴다)에 걸리면 같은 자리를 다시 누른다
    let built = false;
    for (let attempt = 0; attempt < 6 && !built; attempt++) {
      await build.click();
      try {
        // 지은 시설 카드 = 그 칸이 적힌 카드(목록은 명령 뒤 다시 받는다)
        // 이름까지 본다(다른 시설이 같은 칸에 있으면 겹침으로 막힌다)
        await expect(
          cards.filter({ hasText: name }).filter({ hasText: `(${String(x)}, ${String(y)})` }),
        ).toHaveCount(1, {
          timeout: 6_000,
        });
        built = true;
      } catch {
        const limited = facilities.getByText(message("ko", "facility_error_rate_limited"));
        if ((await limited.count()) === 0) break; // 막힌 자리(겹침·지형·유닛) → 다음 자리
        await page.waitForTimeout(3_000);
      }
    }
    if (!built) continue;
    // [바로 끝내기]도 속도 제한에 걸리면 토큰이 찰 때까지 다시 누른다
    const card = cards.filter({ hasText: name }).filter({ hasText: `(${String(x)}, ${String(y)})` });
    const job = card.locator('[data-part="facility-job"]');
    await expect(async () => {
      if ((await job.count()) > 0)
        await card.getByRole("button", { name: message("ko", "facility_dev_finish") }).click();
      await expect(job).toHaveCount(0, { timeout: 3_000 });
    }).toPass({ timeout: 60_000, intervals: [3_000] });
    return;
  }
  throw new Error(`no free cell for ${facility}`);
}

const templePanel = (page: Page): Locator => page.locator('section[data-part="temple"]');

/** 단추를 누르고 성공 문구가 보일 때까지(건물 명령 속도 제한에 걸리면 다시 누른다) */
async function clickFor(page: Page, button: Locator, text: string): Promise<void> {
  const success = templePanel(page).locator(".message-success");
  await expect(async () => {
    await button.click();
    await expect(success).toContainText(text, { timeout: 5_000 });
  }).toPass({ timeout: 40_000, intervals: [2_000] });
}

test.describe("신전·생명과학 연구소", () => {
  test.use({ account: "admin" });

  test("비활성 → 헌금 → 환생 → 다시 비활성 → 신격화, 다른 휴먼은 연구소에서 유전자로 변환", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const a = await incubateHuman(page);
    const b = await incubateHuman(page);
    await page.goto("/economy/production");
    await buildNear(page, "temple", "신전", await cellOf(page, a));
    await buildNear(page, "biotech_lab", "생명과학 연구소", await cellOf(page, b));
    // 신전 칸이 새 시설을 보이게(건물 명령 뒤 다시 받는다)
    await expect(templePanel(page).locator('li[data-part="lab-card"]')).toHaveCount(1, { timeout: 15_000 });
    const panel = templePanel(page);
    await expect(panel.locator('li[data-part="temple-card"]').last()).toBeVisible({ timeout: 15_000 });

    // 휴먼 A를 비활성으로 → 내 휴먼 줄에 비활성 표시, 신전 카드에 보이고 환생은 신앙도가 모자라 막힘
    const rowA = panel.locator(`ul[data-part="temple-humans"] li[data-unit="${String(a)}"]`);
    await clickFor(
      page,
      rowA.locator(".temple-dev-inactivate"),
      message("ko", "temple_inactivated", { id: a }),
    );
    await expect(rowA).toHaveAttribute("data-inactive", "true");
    await expect(rowA).toContainText(message("ko", "temple_inactive_tag"));
    const temple = panel.locator('li[data-part="temple-card"]').last();
    const ghostA = temple.locator(`li[data-unit="${String(a)}"]`);
    await expect(ghostA).toBeVisible();
    await expect(ghostA.locator(".temple-rebirth")).toBeDisabled();

    // 시험 화폐 → 헌금 2,500(신앙도 +50) → 환생
    await clickFor(page, panel.locator(".temple-dev-currency"), message("ko", "temple_dev_currency_done"));
    await temple.locator(".temple-offer input").fill("2500");
    await clickFor(
      page,
      temple.locator(".temple-offer-go"),
      message("ko", "temple_offered", { gained: 50, faith: "@" }).split("@")[0] ?? "",
    );
    await expect(ghostA.locator(".temple-rebirth")).toBeEnabled();
    await clickFor(page, ghostA.locator(".temple-rebirth"), message("ko", "temple_reborn", { id: a }));
    await expect(rowA).toHaveAttribute("data-inactive", "false");
    await expect(rowA).toContainText(
      message("ko", "temple_human_line", { id: a, level: 1, rebirths: 1, faith: 0 }),
    );

    // 다시 비활성 → 헌금 5,000(+100) → 신격화 → 수호신 1, 휴먼 A는 떠남
    await clickFor(
      page,
      rowA.locator(".temple-dev-inactivate"),
      message("ko", "temple_inactivated", { id: a }),
    );
    await temple.locator(".temple-offer input").fill("5000");
    await clickFor(
      page,
      temple.locator(".temple-offer-go"),
      message("ko", "temple_offered", { gained: 100, faith: "@" }).split("@")[0] ?? "",
    );
    await clickFor(page, ghostA.locator(".temple-deify"), message("ko", "temple_deified", { id: a }));
    await expect(
      panel.locator(`[data-part="temple-guardians"] li[data-guardian="${String(a)}"]`),
    ).toBeVisible();
    await expect(rowA).toHaveCount(0);

    // 휴먼 B: 비활성 → 연구소에서 유전자로 변환(유닛이 떠남)
    const rowB = panel.locator(`ul[data-part="temple-humans"] li[data-unit="${String(b)}"]`);
    await clickFor(
      page,
      rowB.locator(".temple-dev-inactivate"),
      message("ko", "temple_inactivated", { id: b }),
    );
    const lab = panel.locator('li[data-part="lab-card"]').last();
    await clickFor(page, lab.locator(`li[data-unit="${String(b)}"] .temple-convert`), `#${String(b)}`);
    await expect(rowB).toHaveCount(0);
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(panel, "temple-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });

  test("유닛 화면 [융합] 칸: 비활성 휴먼은 표시되고 융합이 막힌다(사진)", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    const c = await incubateHuman(page);
    await page.goto("/economy/production");
    const panel = templePanel(page);
    const rowC = panel.locator(`ul[data-part="temple-humans"] li[data-unit="${String(c)}"]`);
    await clickFor(
      page,
      rowC.locator(".temple-dev-inactivate"),
      message("ko", "temple_inactivated", { id: c }),
    );
    await page.goto("/units");
    await page.getByRole("tab", { name: new RegExp(`^${message("ko", "units_tab_fusion")}`) }).click();
    await expect(page.locator(".fusion")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const card = page.locator(`.fusion-card[data-unit="${String(c)}"]`);
    await expect(card.locator('[data-part="fusion-inactive"]')).toContainText(
      message("ko", "fusion_inactive"),
    );
    await expect(card.locator(".fusion-fuse")).toBeDisabled();
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(card, "temple-unit-inactive-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });

  for (const look of [
    { theme: "dark", language: "en", viewport: "phone", width: 390 },
    { theme: "pastel", language: "ko", viewport: "desktop", width: 1440 },
    { theme: "dark", language: "en", viewport: "desktop", width: 1440 },
  ] as const) {
    test.describe(`${look.theme}·${look.language}·${look.width}`, () => {
      test.use({ account: "admin", theme: look.theme, language: look.language, ...VIEWPORTS[look.viewport] });

      test("신전 칸이 넘치지 않는다(사진)", async ({ page, deviceErrors }) => {
        await page.goto("/economy/production");
        const panel = templePanel(page);
        await expect(
          panel.getByRole("heading", { name: message(look.language, "temple_title") }),
        ).toBeVisible({
          timeout: 15_000,
        });
        await expect(panel.locator('li[data-part="temple-card"]').first()).toBeVisible({ timeout: 15_000 });
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(panel, `temple-${look.theme}-${look.language}-${look.width}`);
        if (look.width === 390) {
          await page.goto("/units");
          await page
            .getByRole("tab", { name: new RegExp(`^${message(look.language, "units_tab_fusion")}`) })
            .click();
          const inactive = page.locator('[data-part="fusion-inactive"]').first();
          await expect(inactive).toBeVisible({ timeout: 20_000 });
          await elementShot(
            page.locator(".fusion-card", { has: inactive }).first(),
            `temple-unit-inactive-${look.theme}-${look.language}-${look.width}`,
          );
        }
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
