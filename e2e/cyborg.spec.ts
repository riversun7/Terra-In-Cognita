// 사이보그 화면 시험 — ADR 2026-11-01-ui-visibility, 기획 D-448(스탯 묶음·색)·D-449(K는 만렙 등에서만)·D-450(속성 12칸)
// - 플레이어(전역 준비가 만든 Lv 1 사이보그): 스탯 두 칸씩 묶음(STR·VIT, INT·WIS, DEX·AGI)·스탯 색, K 없음, 전투 스펙 줄 펼치기
//   (공식·항·결과 = 줄 값, 확률 줄은 상한·반감 상수, 키보드), 스킬 칸(처음 3 + 닫힌 7), 속성 12칸, 인공장기 3·장비 6칸, 상태 줄.
// - 만렙(응답을 고쳐 본다: cyborg.get의 level·growth): K 6개와 세 칸 범례.
// - 사진: 390 × 파스텔·다크·정거장, 1440 × 파스텔·다크, 한국어·영어(dev 시안 자료) — 접은 화면·펼친 화면·머리 판(그림).
//   정거장(네온 SF 테마, 사용자 결정 2026-11-01)은 홈·설정 테마 미리 보기도 찍는다. 폴더는 E2E_SHOTS_DIR.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

async function cyborgReady(page: Page): Promise<void> {
  await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cyborg .stat-cell").first()).toBeVisible();
}

/** #rrggbb → 계산된 색 글("rgb(r, g, b)") */
function rgb(hex: string): string {
  const value = (index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `rgb(${String(value(0))}, ${String(value(1))}, ${String(value(2))})`;
}

test.describe("플레이어: 사이보그 화면", () => {
  test.use({ account: "player" });

  test("스탯 묶음·색, K 없음, 전투 스펙 펼치기, 스킬 칸·속성·장비 칸, 상태 줄", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);

    // 1차 스탯: 두 칸씩 셋, 화면 차례 STR·VIT·INT·WIS·DEX·AGI(D-448)
    await expect(page.locator(".cyborg .stat-pair")).toHaveCount(3);
    const cells = page.locator(".cyborg .stat-cell");
    expect(await cells.evaluateAll((list) => list.map((cell) => cell.getAttribute("data-stat")))).toEqual([
      "str",
      "vit",
      "int",
      "wis",
      "dex",
      "agi",
    ]);
    // 스탯 색: 값 글자 = 그 테마의 --color-stat-*, 스탯마다 다르다
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const read = (stat: string) => {
        const value = document.querySelector(`.cyborg .stat-cell[data-stat="${stat}"] .stat-value`);
        return {
          shown: value ? getComputedStyle(value).color : "",
          token: root.getPropertyValue(`--color-stat-${stat}`).trim(),
        };
      };
      return { str: read("str"), vit: read("vit"), agi: read("agi") };
    });
    expect(colors.str.shown).toBe(rgb(colors.str.token));
    expect(colors.agi.shown).toBe(rgb(colors.agi.token));
    expect(colors.str.shown).not.toBe(colors.vit.shown);
    // K·처음 값은 만렙이 아니면 보이지 않는다(D-449)
    await expect(page.locator(".stat-k")).toHaveCount(0);
    await expect(page.locator(".cyborg")).toContainText(message("ko", "cyborg_core_note"));

    // 전투 스펙: HP 줄을 누르면 공식·항(1차 × 가중치, 0이 아닌 6칸)·결과(= 줄 값)
    const hp = page.locator('.spec-row[data-stat-row="hp"]');
    const toggle = hp.locator(".spec-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(hp.locator(".spec-detail")).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = hp.locator(".spec-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(message("ko", "cyborg_formula_quantity"));
    await expect(detail.locator(".spec-term[data-stat]")).toHaveCount(6);
    const hpValue = (await hp.locator(".spec-value").textContent()) ?? "";
    await expect(detail.locator(".spec-result-value")).toHaveText(hpValue);
    // 확률 줄(회피)은 키보드로: 공식 + 상한·반감 상수 + 곡선 계산
    const evade = page.locator('.spec-row[data-stat-row="evade"]');
    await evade.locator(".spec-toggle").focus();
    await page.keyboard.press("Enter");
    await expect(evade.locator(".spec-detail")).toContainText(message("ko", "cyborg_formula_probability"));
    await expect(evade.locator(".spec-curve")).toBeVisible();
    // 다시 누르면 접힌다
    await toggle.click();
    await expect(hp.locator(".spec-detail")).toBeHidden();

    // 스킬 칸: 처음 3칸(빈 칸) + 닫힌 7칸(환생 1~7회에 하나씩, 팩 skillSlots)
    const locked = page.locator('.cyborg-skill[data-state="locked"]');
    await expect(locked).toHaveCount(7);
    await expect(locked.first()).toContainText(message("ko", "cyborg_skill_locked", { count: 1 }));
    await expect(page.locator('.cyborg-skill[data-state="empty"]')).toHaveCount(3);
    // 속성 12칸(D-450 출처 안내), 인공장기 3칸·장비 6칸(팩 unit_kinds)
    await expect(page.locator(".cyborg-element")).toHaveCount(12);
    await expect(page.locator(".cyborg")).toContainText(message("ko", "cyborg_elements_note"));
    await expect(page.locator('.cyborg-slot-group[data-side="organ"] .cyborg-slot')).toHaveCount(3);
    await expect(page.locator('.cyborg-slot-group[data-side="gear"] .cyborg-slot')).toHaveCount(6);
    // 환생: 신앙도는 문턱(D-451), K는 환생 시설에서(D-449)
    await expect(page.locator(".cyborg-rebirth")).toContainText(
      message("ko", "cyborg_rebirth_faith_value", { need: 50, value: 0 }),
    );
    await expect(page.locator(".cyborg-rebirth")).toContainText(message("ko", "cyborg_rebirth_k"));
    await expect(page.locator(".cyborg-footer")).toContainText("E2EPlayer");

    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("만렙이면 K와 처음 값(D-449): 세 칸 범례, 스탯마다 K 값", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      // 서버는 만렙일 때만 growth를 보낸다(apps/server/src/roster/roster.test.ts). 화면만 보려고 응답을 만렙으로 고친다
      "cyborg.get": (data) => {
        const body: unknown = Reflect.get(Object(data), "body");
        if (typeof body !== "object" || body === null) throw new Error("본체가 없습니다");
        Reflect.set(body, "level", Reflect.get(body, "maxLevel"));
        const k = { str: 1100, vit: 950, int: 1000, wis: 1200, dex: 800, agi: 1050 };
        Reflect.set(body, "growth", { initial: { str: 5, vit: 5, int: 5, wis: 5, dex: 5, agi: 5 }, kPm: k });
      },
    });
    await page.goto("/cyborg");
    await cyborgReady(page);
    const ks = page.locator(".cyborg .stat-k");
    await expect(ks).toHaveCount(6);
    await expect(ks.first()).toHaveText(message("ko", "roster_stat_k", { value: "1.10" }));
    await expect(page.locator('.spec-legend-item[data-kind="initial"]')).toBeVisible();
    await expect(page.locator('.spec-legend-item[data-kind="growth"]')).toBeVisible();
    await expect(page.locator(".cyborg")).toContainText(message("ko", "cyborg_core_note_max"));
    await expect(page.locator('.cyborg .stat-bar-body[data-part="growth"]')).toHaveCount(6);
    expect(deviceErrors).toEqual([]);
  });
});

/** 나쁜 자료(break-ui): 가장 긴 이름(16칸), 끝판 수(1차 1만 넘음·HP 백만 넘음), 긴 아이템·스킬 이름, 큰 순위·양 */
/** 응답의 객체 칸(아니면 시험 실패) */
function record(value: unknown): object {
  if (typeof value !== "object" || value === null) throw new Error("응답 모양이 다릅니다");
  return value;
}

function worstCase(data: unknown): void {
  const root = record(data);
  Reflect.set(root, "name", "Bartholomew12345");
  const body = record(Reflect.get(root, "body"));
  Reflect.set(body, "exp", { into: 1_199_898, span: 1_234_567 });
  Reflect.set(body, "faith", 100);
  const primaries = record(Reflect.get(record(Reflect.get(body, "stats")), "primaries"));
  for (const stat of ["str", "vit", "int", "wis", "dex", "agi"])
    Reflect.set(primaries, stat, { base: 12_345, bonus: 1_284 });
  const rows: unknown = Reflect.get(body, "breakdown");
  if (!Array.isArray(rows)) throw new Error("풀이가 없습니다");
  for (const row of rows) {
    const terms: unknown = Reflect.get(record(row), "terms");
    if (Array.isArray(terms))
      for (const term of terms) {
        Reflect.set(record(term), "value", 13_629);
        Reflect.set(record(term), "milli", 13_629 * Number(Reflect.get(record(term), "weightPm")));
      }
    const probability = Reflect.get(record(row), "shape") === "probability";
    Reflect.set(record(row), "weighted", probability ? 98_765 : 1_234_000);
    Reflect.set(record(row), "score", 98_765);
    Reflect.set(record(row), "extra", 4_321);
    Reflect.set(record(row), "value", probability ? 849 : 1_234_567);
  }
  const names = record(Reflect.get(root, "names"));
  const long = {
    ko: "고대 정원사의 강화 인공 심장 Mk.III",
    en: "Ancient Gardener's Reinforced Artificial Heart Mk.III",
  };
  for (const table of ["items", "skills"]) {
    const entries = record(Reflect.get(names, table));
    for (const id of Object.keys(entries)) Reflect.set(entries, id, long);
  }
  const inventory: unknown = Reflect.get(body, "inventory");
  if (Array.isArray(inventory))
    for (const item of inventory) Reflect.set(record(item), "amount", "123456789012");
  const rankings: unknown = Reflect.get(body, "rankings");
  if (Array.isArray(rankings))
    for (const row of rankings) {
      Reflect.set(record(row), "rank", 1_284_000);
      Reflect.set(record(row), "score", 98_765_432);
    }
}

test.describe("나쁜 자료(긴 이름·큰 수) 390", () => {
  for (const language of ["ko", "en"] as const) {
    test.describe(language, () => {
      test.use({ ...VIEWPORTS.phone, account: "dev", preview: "dev", language });

      test(`넘치지 않는다 (${language})`, async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "cyborg.get": worstCase });
        await page.goto("/cyborg");
        await cyborgReady(page);
        await expect(page.locator(".cyborg-name")).toHaveText("Bartholomew12345");
        await page.locator('.spec-row[data-stat-row="hp"] .spec-toggle').click();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `cyborg-ui-worst-390-${language}`, { fullPage: true });
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

const SHOTS: readonly { viewport: "phone" | "desktop"; theme: Theme; language: Language }[] = [
  ...(["pastel", "dark", "station"] as const).flatMap((theme) =>
    (["ko", "en"] as const).map((language) => ({ viewport: "phone" as const, theme, language })),
  ),
  ...(["pastel", "dark"] as const).flatMap((theme) =>
    (["ko", "en"] as const).map((language) => ({ viewport: "desktop" as const, theme, language })),
  ),
];

for (const { viewport, theme, language } of SHOTS) {
  const width = VIEWPORTS[viewport].viewport.width;
  test.describe(`사진 ${String(width)} ${theme} ${language}`, () => {
    test.use({ ...VIEWPORTS[viewport], account: "dev", preview: "dev", theme, language });

    test(`사이보그 접은·펼친 화면과 그림 (${String(width)}·${theme}·${language})`, async ({
      page,
      deviceErrors,
    }) => {
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await page.goto("/cyborg");
      await cyborgReady(page);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `cyborg-ui-${String(width)}-${theme}-${language}`, { fullPage: true });
      await elementShot(
        page.locator(".cyborg-profile"),
        `cyborg-ui-hero-${String(width)}-${theme}-${language}`,
      );
      for (const row of ["hp", "evade", "crit_multiplier"]) {
        await page.locator(`.spec-row[data-stat-row="${row}"] .spec-toggle`).click();
      }
      await expect(page.locator('.spec-row[data-stat-row="hp"] .spec-detail')).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `cyborg-ui-open-${String(width)}-${theme}-${language}`, { fullPage: true });
      expect(deviceErrors).toEqual([]);
    });

    if (theme === "station") {
      test(`정거장 테마: 홈·설정 (${language})`, async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/");
        await expect(page.locator(".home-card-name").first()).toBeVisible({ timeout: 15_000 });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await shot(page, `station-home-${String(width)}-${language}`, { fullPage: true });
        await page.goto("/settings");
        await expect(page.locator(".theme-option").first()).toBeVisible();
        await shot(page, `station-settings-${String(width)}-${language}`, { fullPage: true });
        expect(deviceErrors).toEqual([]);
      });
    }
  });
}
