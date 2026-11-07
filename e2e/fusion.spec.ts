// 유닛 화면 [융합] 칸 시험 — 사이보그 유닛 융합(D-470)·유전자(D-478·D-516), docs/adr/2026-11-07-cyborg-fusion-genes.md.
// - admin: [시험 재료 받기](화폐·티타늄 괴·마이크로칩) → /dev/recruit에서 가장 비싼 카드 고용(가장 싼 카드는 뒤에 도는 구인 시험
//   recruit.spec.ts가 같은 창에서 산다) → [융합] 칸에 그 휴먼(지금 스탯·융합 뒤 범위·배운 스킬 없음, 유전자 환생 단추 없음)
//   → [시험 스킬 유전자 받기] → 그 휴먼에게 [주입](배운 스킬 1/3) → [시험 스탯 유전자 받기] 둘 → 골라 [합성](하나가 된다)
//   → [인큐베이터(주력)](새 휴먼) → 그 휴먼 [수명 끝내기(시험)](스탯 유전자를 남기고 떠난다) → 고용한 휴먼 [융합](사이보그 유닛),
//   유닛 목록 종류 거르기 "사이보그"에 보인다. 시험 재료는 두 번 받는다(구인 시험이 뒤에 admin 잔고로 카드를 사므로 화폐를 남긴다).
// - player: [융합] 칸은 보이고(고용한 휴먼·유전자 없음 안내), 개발 시험 단추가 없고 [합성]은 막혀 있다. tRPC fusion.overview는 200.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(admin, E2E_SHOTS_DIR). 융합한 사이보그 유닛·유전자가 보이는 상태.
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

  test("시험 재료 → 휴먼 고용 → 스킬 유전자 주입·스탯 유전자 합성·인큐베이터·수명 끝내기 → 융합하면 사이보그 유닛", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await openFusion(page);
    const success = page.locator(".message-success");
    const grant = page.getByRole("button", { name: message("ko", "fusion_dev_materials"), exact: true });
    for (let i = 0; i < 2; i++) {
      await grant.click();
      await expect(success).toContainText(message("ko", "fusion_dev_granted"), { timeout: 20_000 });
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
    await expect(success).toBeVisible({ timeout: 20_000 });
    // [융합] 칸에 새 휴먼이 보인다(지금 스탯·융합 뒤 범위, 배운 스킬 없음). 유전자 환생 단추는 없다(D-516)
    await openFusion(page);
    const after = await trpcGet(page, "fusion.overview");
    const fresh = list(field(after.data, "humans"))
      .map((h) => Number(field(h, "unitId")))
      .find((id) => !knownHumans.has(id));
    if (fresh === undefined) throw new Error("hired human not listed");
    const card = page.locator(`.fusion-card[data-unit="${String(fresh)}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(".fusion-stat-row")).toHaveCount(2);
    await expect(card.locator(".fusion-skills")).toContainText(
      message("ko", "fusion_human_skills_none", { slots: 3 }),
    );
    await expect(page.locator(".fusion-rebirth")).toHaveCount(0);
    // 스킬 유전자 받기 → 그 휴먼에게 주입 → 배운 스킬 1개
    const skillGenes = page.locator('.fusion-gene[data-kind="skill"]');
    const skillCount = await skillGenes.count();
    await page.getByRole("button", { name: message("ko", "fusion_dev_skill_gene"), exact: true }).click();
    await expect(skillGenes).toHaveCount(skillCount + 1, { timeout: 20_000 });
    const newestSkill = skillGenes.last();
    await newestSkill.locator("select").selectOption(String(fresh));
    await newestSkill.locator(".fusion-inject").click();
    await expect(success).toContainText(`#${String(fresh)}`, { timeout: 20_000 });
    await expect(skillGenes).toHaveCount(skillCount);
    await expect(card.locator(".fusion-skills")).toContainText("1/3");
    // 스탯 유전자 둘 받기 → 둘 고르기 → 합성하면 하나가 된다(총합·칸 값·주력 칸)
    const statGenes = page.locator('.fusion-gene[data-kind="stat"]');
    const statCount = await statGenes.count();
    const statGrant = page.getByRole("button", { name: message("ko", "fusion_dev_stat_gene"), exact: true });
    for (let i = 1; i <= 2; i++) {
      await statGrant.click();
      await expect(statGenes).toHaveCount(statCount + i, { timeout: 20_000 });
    }
    await expect(statGenes.last().locator('.fusion-stat[data-main="true"]')).toHaveCount(1);
    await statGenes.nth(statCount).locator(".fusion-pick input").check();
    await statGenes
      .nth(statCount + 1)
      .locator(".fusion-pick input")
      .check();
    await page.locator(".fusion-synth-go").click();
    const synthText = message("ko", "fusion_synth_done", { id: "@", total: "@", outcome: "@" });
    await expect(success).toContainText(synthText.split("@")[0] ?? "", { timeout: 20_000 });
    await expect(statGenes).toHaveCount(statCount + 1);
    // 인큐베이터(주력): 그 유전자로 새 휴먼이 태어난다
    const humansBefore = await page.locator(".fusion-card[data-unit]").count();
    await statGenes.last().locator(".fusion-incubate-main").click();
    const bornText = message("ko", "fusion_incubated", { id: "@" });
    await expect(success).toContainText(bornText.split("@")[1] ?? "", { timeout: 20_000 });
    await expect(page.locator(".fusion-card[data-unit]")).toHaveCount(humansBefore + 1);
    await expect(statGenes).toHaveCount(statCount);
    const overview = await trpcGet(page, "fusion.overview");
    const born = list(field(overview.data, "humans"))
      .map((h) => Number(field(h, "unitId")))
      .find((id) => id !== fresh && !knownHumans.has(id));
    if (born === undefined) throw new Error("incubated human not listed");
    // 수명 끝내기(시험): 태어난 휴먼이 스탯 유전자를 남기고 떠난다
    await page.locator(`.fusion-card[data-unit="${String(born)}"] .fusion-expire`).click();
    await expect(success).toContainText(`#${String(born)}`, { timeout: 20_000 });
    await expect(page.locator(`.fusion-card[data-unit="${String(born)}"]`)).toHaveCount(0);
    await expect(statGenes).toHaveCount(statCount + 1);
    await expect(statGenes.last()).toContainText(message("ko", "fusion_gene_from", { id: born, level: 1 }));
    // 고용한 휴먼을 융합한다 → 내 사이보그 유닛(배운 스킬은 같은 유닛이라 남는다)
    await card.locator(".fusion-fuse").click();
    await expect(success).toContainText(`#${String(fresh)}`, { timeout: 20_000 });
    await expect(page.locator(`.fusion-card[data-cyborg="${String(fresh)}"]`)).toBeVisible();
    await expect(page.locator(`.fusion-card[data-unit="${String(fresh)}"]`)).toHaveCount(0);
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

  test("[융합] 칸: 고용한 휴먼 없음 안내, 유전자 없음, 개발 시험 단추 없음, fusion.overview 200", async ({
    page,
    deviceErrors,
  }) => {
    await openFusion(page);
    await expect(page.getByText(message("ko", "fusion_humans_empty"))).toBeVisible();
    await expect(page.getByText(message("ko", "fusion_genes_empty"))).toBeVisible();
    await expect(
      page.getByRole("button", { name: message("ko", "fusion_dev_materials"), exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: message("ko", "fusion_dev_stat_gene"), exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".fusion-synth-go")).toBeDisabled();
    const overview = await trpcGet(page, "fusion.overview");
    expect(overview.status).toBe(200);
    expect(field(overview.data, "devGrant")).toBe(false);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

// 사진: 390·1440 × 파스텔·다크 × 한국어·영어(admin — 앞 시험이 만든 사이보그 유닛·유전자가 보인다)
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
