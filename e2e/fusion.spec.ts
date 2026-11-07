// 유닛 화면 [융합] 칸 시험 — 사이보그 유닛 융합(D-470)·유전자 조각(D-478), docs/adr/2026-11-07-cyborg-fusion-genes.md.
// - admin: [시험 재료 받기](화폐·티타늄 괴·마이크로칩) → /dev/recruit에서 가장 비싼 카드 고용(가장 싼 카드는 뒤에 도는 구인 시험
//   recruit.spec.ts가 같은 창에서 산다) → [융합] 칸에 그 휴먼(지금 스탯·융합 뒤 범위)
//   → [융합]하면 WebSocket cyborg_fuse가 성공하고 그 유닛이 "내 사이보그 유닛"으로 옮겨 간다, 유닛 목록 종류 거르기 "사이보그"에 보인다.
//   [시험 유전자 조각 받기] → 휴먼 스탯 유전자 조각 수가 는다. 수명이 남은 휴먼의 [유전자 환생]은 막혀 있다.
//   시험 재료는 두 번 받는다(구인 시험 recruit.spec.ts가 뒤에 admin 잔고로 카드를 사므로 화폐를 남긴다).
// - player: [융합] 칸은 보이고(고용한 휴먼 없음 안내), 개발 받기 단추가 없다. tRPC fusion.overview는 200.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(admin, E2E_SHOTS_DIR). 융합한 사이보그 유닛이 보이는 상태.
// 복귀 요약은 띄우지 않는다(hideSummary).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

test.beforeEach(async ({ page }) => {
  await rewriteTrpc(page, { "summary.get": hideSummary });
});

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC 조회를 부른다(같은 출처, 화면과 같은 쿠키) */
async function trpcGet(page: Page, path: string): Promise<{ status: number; data: unknown }> {
  return page.evaluate(async (procedure) => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const get = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    const response = await fetch(`/api/trpc/${procedure}`);
    const json: unknown = await response.json();
    return { status: response.status, data: get(get(json, "result"), "data") };
  }, path);
}

const tab = (page: Page, key: string, language: Language = "ko") =>
  page.getByRole("tab", { name: new RegExp(`^${message(language, key)}`) });

/** 유닛 화면 [융합] 칸을 열고 자료를 받을 때까지 */
async function openFusion(page: Page, language: Language = "ko"): Promise<void> {
  await page.goto("/units");
  await expect(page.locator(".units-panel")).toBeVisible();
  await tab(page, "units_tab_fusion", language).click();
  await expect(page.locator(".fusion")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

test.describe("관리자", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("시험 재료 → 휴먼 고용 → 융합하면 사이보그 유닛이 되고, 유전자 조각을 받는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await openFusion(page);
    const grant = page.getByRole("button", { name: message("ko", "fusion_dev_materials"), exact: true });
    for (let i = 0; i < 2; i++) {
      await grant.click();
      await expect(page.locator(".message-success")).toContainText(message("ko", "fusion_dev_granted"), {
        timeout: 20_000,
      });
      await expect(grant).toBeEnabled();
    }
    const before = await trpcGet(page, "fusion.overview");
    for (const material of list(field(field(before.data, "rules"), "materials")))
      expect(BigInt(String(field(material, "have")))).toBeGreaterThanOrEqual(
        BigInt(Number(field(material, "qty"))),
      );
    const knownHumans = new Set(list(field(before.data, "humans")).map((h) => Number(field(h, "unitId"))));
    // 구인 카드 시험 화면에서 남은 카드 가운데 가장 비싼 것을 고용한다
    await page.goto("/dev/recruit");
    await expect(page.locator(".rl-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const board = await trpcGet(page, "recruit.board");
    const priciest = list(field(board.data, "cards"))
      .filter((card) => field(card, "taken") !== true)
      .map((card) => ({ slot: Number(field(card, "slot")), cost: BigInt(String(field(card, "cost"))) }))
      .toSorted((a, b) => (a.cost > b.cost ? -1 : a.cost < b.cost ? 1 : b.slot - a.slot))[0];
    if (!priciest) throw new Error("no card left");
    await page
      .locator(".rl-card")
      .nth(priciest.slot)
      .getByRole("button", { name: message("ko", "dev_recruit_hire"), exact: true })
      .click();
    await expect(page.locator(".message-success")).toBeVisible({ timeout: 20_000 });
    // [융합] 칸에 새 휴먼이 보인다
    await openFusion(page);
    const after = await trpcGet(page, "fusion.overview");
    const fresh = list(field(after.data, "humans"))
      .map((h) => Number(field(h, "unitId")))
      .find((id) => !knownHumans.has(id));
    if (fresh === undefined) throw new Error("hired human not listed");
    const card = page.locator(`.fusion-card[data-unit="${String(fresh)}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(".fusion-stat-row")).toHaveCount(2);
    // 수명이 남았으니 유전자 환생은 막혀 있다
    await expect(card.locator(".fusion-rebirth")).toBeDisabled();
    await card.locator(".fusion-fuse").click();
    await expect(page.locator(".message-success")).toContainText(`#${String(fresh)}`, { timeout: 20_000 });
    await expect(page.locator(`.fusion-card[data-cyborg="${String(fresh)}"]`)).toBeVisible();
    await expect(page.locator(`.fusion-card[data-unit="${String(fresh)}"]`)).toHaveCount(0);
    // 유전자 조각 받기 → 휴먼 스탯 유전자 수가 는다
    const gene = page.locator('.fusion-gene[data-item="gene_stat_human"] .fusion-gene-qty');
    const geneBefore = Number((await gene.textContent())?.replaceAll(",", "") ?? "0");
    await page.getByRole("button", { name: message("ko", "fusion_dev_genes"), exact: true }).click();
    await expect(page.locator(".message-success")).toContainText(message("ko", "fusion_dev_granted"), {
      timeout: 20_000,
    });
    await expect(gene).toHaveText(new Intl.NumberFormat("ko").format(geneBefore + 5));
    // 유닛 목록 종류 거르기 "사이보그"에 융합한 유닛이 있다
    await tab(page, "units_tab_list").click();
    await page.getByLabel(message("ko", "units_filter_type")).selectOption("cyborg");
    await expect(page.locator(".units-row").first()).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("[융합] 칸: 고용한 휴먼 없음 안내, 개발 받기 단추 없음, fusion.overview 200", async ({
    page,
    deviceErrors,
  }) => {
    await openFusion(page);
    await expect(page.getByText(message("ko", "fusion_humans_empty"))).toBeVisible();
    await expect(
      page.getByRole("button", { name: message("ko", "fusion_dev_materials"), exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.fusion-gene[data-item="gene_stat_human"]')).toBeVisible();
    const overview = await trpcGet(page, "fusion.overview");
    expect(overview.status).toBe(200);
    expect(field(overview.data, "devGrant")).toBe(false);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

// 사진: 390·1440 × 파스텔·다크 × 한국어·영어(admin — 앞 시험이 만든 사이보그 유닛·유전자 조각이 보인다)
for (const viewport of ["phone", "desktop"] as const) {
  for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
    for (const language of ["ko", "en"] as const satisfies readonly Language[]) {
      const width = VIEWPORTS[viewport].viewport.width;
      test.describe(`사진 ${String(width)} ${theme} ${language}`, () => {
        test.use({ ...VIEWPORTS[viewport], account: "admin", theme, language });

        test(`융합 칸 (${String(width)}·${theme}·${language})`, async ({ page, deviceErrors }) => {
          await openFusion(page, language);
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `fusion-${String(width)}-${theme}-${language}`, { fullPage: true });
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
}
