// 부상·병원 화면 시험 — 기획 D-521(부상 4단계 초록·흰·노랑·빨강, 자연 치유 한 단계씩, 병원은 등급·의사·스킬로 매우 빠르고 비용), docs/adr/2026-11-08-injury.md.
// - admin: 유닛 화면 [융합] 칸 시험 유전자 → 인큐베이터로 휴먼 하나 → 경제 → 생산에서 그 휴먼 곁에 병원을 짓고 [바로 끝내기] → 병원 카드 일꾼 칸에
//   그 휴먼을 의사로 배치(직무 배치 길) → 신전 칸 [시험 화폐] → 유닛 화면 그 휴먼 상세 [부상·병원] 칸: 초록 표 → 개발 시험 [빨강] → 빨강 표·
//   목록 줄 표 → 병원 견적 카드(의사 줄) → [병원 치료 · 값] → 치료 중 안내·견적 없음.
// - 사진(E2E_SHOTS_DIR): [부상·병원] 칸과 목록 줄 390 파스텔 한국어·390 다크 영어.
// 복귀 요약은 띄우지 않는다(hideSummary).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

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

const humans = async (page: Page): Promise<unknown[]> =>
  list(field(await trpcGet(page, "temple.overview"), "humans"));

/** 유닛 화면 [융합] 칸에서 시험 스탯 유전자 → 인큐베이터(주력)로 휴먼 하나. 새 휴먼 ID(신전 시험과 같은 길) */
async function incubateHuman(page: Page, lang: Language = "ko"): Promise<number> {
  await page.goto("/units");
  await page.getByRole("tab", { name: new RegExp(`^${message(lang, "units_tab_fusion")}`) }).click();
  await expect(page.locator(".fusion")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  const before = (await humans(page)).map((h) => Number(field(h, "unitId")));
  const statGenes = page.locator('.fusion-gene[data-kind="stat"]');
  const count = await statGenes.count();
  await page.getByRole("button", { name: message(lang, "fusion_dev_stat_gene"), exact: true }).click();
  await expect(statGenes).toHaveCount(count + 1, { timeout: 20_000 });
  await statGenes.last().locator(".fusion-incubate-main").click();
  await expect(statGenes).toHaveCount(count, { timeout: 20_000 });
  const born = (await humans(page)).map((h) => Number(field(h, "unitId"))).find((id) => !before.includes(id));
  if (born === undefined) throw new Error("incubated human not listed");
  return born;
}

/** 그 휴먼이 선 칸 */
async function cellOf(page: Page, unitId: number): Promise<{ x: number; y: number }> {
  const cell = field(
    (await humans(page)).find((h) => Number(field(h, "unitId")) === unitId),
    "cell",
  );
  return { x: Number(field(cell, "x")), y: Number(field(cell, "y")) };
}

/** 칸 근처 빈 자리에 병원을 짓고(그 칸 도시 창고로 시험 재료) [바로 끝내기]. 병원 카드 */
async function buildHospitalNear(page: Page, cell: { x: number; y: number }): Promise<Locator> {
  const facilities = page.locator('section[data-part="facilities"]');
  await expect(facilities.locator('[data-part="facility-units"]')).toBeVisible({ timeout: 15_000 });
  const form = facilities.locator("form.labor-form");
  const cards = facilities.locator('li[data-part="facility-card"]');
  const build = form.getByRole("button", { name: message("ko", "facility_build"), exact: true });
  await form.getByLabel(message("ko", "facility_field_facility")).selectOption("hospital");
  for (const [dx, dy] of [
    [3, 3],
    [-6, 3],
    [3, -6],
    [-6, -6],
    [8, 0],
    [0, 8],
  ] as const) {
    const x = Math.min(250, Math.max(2, cell.x + dx));
    const y = Math.min(250, Math.max(2, cell.y + dy));
    await form.getByLabel(message("ko", "facility_field_x")).fill(String(x));
    await form.getByLabel(message("ko", "facility_field_y")).fill(String(y));
    if (await build.isDisabled()) {
      await expect(async () => {
        if (await build.isDisabled())
          await form.getByRole("button", { name: message("ko", "facility_dev_grant") }).click();
        await expect(build).toBeEnabled({ timeout: 3_000 });
      }).toPass({ timeout: 60_000, intervals: [3_000] });
    }
    const card = cards.filter({ hasText: "병원" }).filter({ hasText: `(${String(x)}, ${String(y)})` });
    let built = false;
    for (let attempt = 0; attempt < 6 && !built; attempt++) {
      await build.click();
      try {
        await expect(card).toHaveCount(1, { timeout: 6_000 });
        built = true;
      } catch {
        const limited = facilities.getByText(message("ko", "facility_error_rate_limited"));
        if ((await limited.count()) === 0) break;
        await page.waitForTimeout(3_000);
      }
    }
    if (!built) continue;
    const job = card.locator('[data-part="facility-job"]');
    await expect(async () => {
      if ((await job.count()) > 0)
        await card.getByRole("button", { name: message("ko", "facility_dev_finish") }).click();
      await expect(job).toHaveCount(0, { timeout: 3_000 });
    }).toPass({ timeout: 60_000, intervals: [3_000] });
    return card;
  }
  throw new Error("no free cell for hospital");
}

/** 유닛 화면에서 그 유닛 상세의 [부상·병원] 칸 */
async function openCare(
  page: Page,
  unitId: number,
  lang: Language = "ko",
): Promise<{ row: Locator; care: Locator }> {
  await page.goto("/units");
  const row = page.locator(".units-row", { hasText: new RegExp(`#${String(unitId)}(?!\\d)`) });
  await row.locator(".units-row-main").click();
  const care = page.locator(".units-detail section", { hasText: message(lang, "hospital_title") }).first();
  await expect(care.locator('[data-part="injury-badge"]')).toBeVisible({ timeout: 15_000 });
  return { row, care };
}

test.describe("부상·병원", () => {
  test.use({ account: "admin" });

  test("빨강 → 병원 견적(의사) → 치료, 목록·상세 단계 표(사진 390 파스텔 한국어)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const unit = await incubateHuman(page);
    await page.goto("/economy/production");
    const card = await buildHospitalNear(page, await cellOf(page, unit));
    // 병원 카드의 일꾼 칸 = 의사 직무 배치(INT + WIS, 산출 없음)
    const workers = card.locator('[data-part="facility-workers"]');
    await expect(workers).toContainText(message("ko", "facility_workers_rule_medical"));
    await workers.getByLabel(message("ko", "facility_worker_pick")).selectOption(String(unit));
    await workers.getByRole("button", { name: message("ko", "facility_worker_assign"), exact: true }).click();
    await expect(workers).toContainText(message("ko", "facility_workers_title", { count: 1, slots: 2 }), {
      timeout: 15_000,
    });
    // 치료 값을 낼 시험 화폐(신전 칸 개발 시험)
    const temple = page.locator('section[data-part="temple"]');
    await expect(async () => {
      await temple.locator(".temple-dev-currency").click();
      await expect(temple.locator(".message-success")).toContainText(
        message("ko", "temple_dev_currency_done"),
        { timeout: 5_000 },
      );
    }).toPass({ timeout: 40_000, intervals: [2_000] });

    const { row, care } = await openCare(page, unit);
    await expect(care.locator('[data-part="injury-badge"]')).toHaveAttribute("data-stage", "0");
    // 개발 시험 [빨강] → 빨강 표, 병원 견적 카드(의사 줄)
    await care
      .locator('[data-part="hospital-dev"]')
      .getByRole("button", { name: message("ko", "injury_stage_3"), exact: true })
      .click();
    await expect(care.locator('[data-part="injury-badge"]')).toHaveAttribute("data-stage", "3", {
      timeout: 15_000,
    });
    await expect(care).toContainText(message("ko", "injury_red_note"));
    const option = care.locator('[data-part="hospital-option"]').first();
    await expect(option).toBeVisible();
    await expect(option).toContainText(`#${String(unit)}`);
    await expect(row.locator('[data-part="injury-badge"]')).toHaveAttribute("data-stage", "3", {
      timeout: 15_000,
    });
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(care, "injury-care-pastel-ko-390");
    await elementShot(row, "injury-row-pastel-ko-390");
    // [병원 치료 · 값] → 치료 중 안내, 같은 병원 견적은 사라짐(지금보다 빠르지 않음)
    await option.getByRole("button").click();
    await expect(care.locator(".message-success")).toBeVisible({ timeout: 15_000 });
    await expect(care.locator('[data-part="hospital-option"]')).toHaveCount(0);
    await expect(care).toContainText(message("ko", "injury_treated", { speed: "@" }).split("@")[0] ?? "");
    await elementShot(care, "injury-treated-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

for (const [theme, language] of [["dark", "en"]] as const satisfies readonly (readonly [Theme, Language])[]) {
  test.describe(`사진 390 ${theme} ${language}`, () => {
    test.use({ account: "admin", theme, language });

    test("[부상·병원] 칸(노랑)", async ({ page, deviceErrors }) => {
      test.setTimeout(120_000);
      const unit = await incubateHuman(page, language);
      const { care } = await openCare(page, unit, language);
      await care
        .locator('[data-part="hospital-dev"]')
        .getByRole("button", { name: message(language, "injury_stage_2"), exact: true })
        .click();
      await expect(care.locator('[data-part="injury-badge"]')).toHaveAttribute("data-stage", "2", {
        timeout: 15_000,
      });
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(care, `injury-care-${theme}-${language}-390`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
