// 사이보그 화면 시험 — ADR 2026-11-01-ui-visibility(+ "바뀜": 옛 프로젝트 모양으로 다시), 기획 D-448·D-449·D-450
// - 플레이어(전역 준비가 만든 Lv 1 사이보그): 핵심 사양(옛 StatBar) 두 칸씩 묶음·스탯 색, 막대를 누르면 출처 상세(몸 값·장비·인공장기·
//   스킬·효과·합계, Escape로 닫힘), K 없음. 상세 전투 스펙(옛 SecondaryStatsCard): VITALS·OFFENSE·DEFENSE·MOBILITY 묶음, 줄마다
//   한 색 막대(2차 스탯 색 = 1차 스탯 색과 다름), ▶ 펼치면 "공식 … | 캡 …"·입력 줄·"= 결과", 키보드. 스킬 칸·속성·장비 칸·상태 줄.
// - 만렙(응답을 고쳐 본다: level·growth·primarySources): K 6개, 처음 값·레벨 성장 칸, 세 칸 범례.
// - 데스크톱: 막대에 마우스를 올리면 출처 상세가 보인다.
// - 사진: 390 × 파스텔·다크·정거장, 1440 × 파스텔·다크, 한국어·영어(dev 시안 자료) — 접은·펼친 전투 스펙, 출처 상세, 머리 판.
//   정거장(네온 SF 테마, D-454)은 홈·설정 테마 미리 보기도 찍는다. 폴더는 E2E_SHOTS_DIR.
// - D-458 새 2차 스탯 넷: 쉴드 재생·MP 회복·스태미나 회복은 VITALS, 속성 방어율은 DEFENSE. 줄마다 자기 --color-sec-* 색
//   (1차 스탯 색과 다름), 펼친 묶음 사진(cyborg-d459-*).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const PRIMARY = ["str", "vit", "int", "wis", "dex", "agi"] as const;
/** D-458 새 행 → 묶음·색 토큰 */
const NEW_ROWS = [
  { row: "shield_regen", group: "vitals", token: "--color-sec-shield-regen" },
  { row: "mp_regen", group: "vitals", token: "--color-sec-mp-regen" },
  { row: "stamina_regen", group: "vitals", token: "--color-sec-stamina-regen" },
  { row: "elemental_defense_rate", group: "defense", token: "--color-sec-elemental-defense-rate" },
] as const;

async function cyborgReady(page: Page): Promise<void> {
  await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".cyborg .core-row").first()).toBeVisible();
}

/** #rrggbb → 계산된 색 글("rgb(r, g, b)") */
function rgb(hex: string): string {
  const value = (index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `rgb(${String(value(0))}, ${String(value(1))}, ${String(value(2))})`;
}

test.describe("플레이어: 사이보그 화면", () => {
  test.use({ account: "player" });

  test("핵심 사양(묶음·색·출처 상세), 상세 전투 스펙(묶음·한 색 막대·공식 상자), 스킬 칸·속성·장비 칸, 상태 줄", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);

    // 핵심 사양: 두 칸씩 셋, 화면 차례 STR·VIT·INT·WIS·DEX·AGI(D-448), 합계 글자 = 그 스탯 색
    await expect(page.locator(".cyborg .core-pair")).toHaveCount(3);
    const rows = page.locator(".cyborg .core-row");
    expect(await rows.evaluateAll((list) => list.map((row) => row.getAttribute("data-stat")))).toEqual([
      ...PRIMARY,
    ]);
    const colors = await page.evaluate((stats) => {
      const root = getComputedStyle(document.documentElement);
      const fills = ["hp", "physical_attack"].map((row) => {
        const element = document.querySelector(`.combat-row[data-sec="${row}"] .combat-bar-fill`);
        return element ? getComputedStyle(element).backgroundColor : "";
      });
      return {
        totals: stats.map((stat) => {
          const element = document.querySelector(`.cyborg .core-row[data-stat="${stat}"] .core-total`);
          return element ? getComputedStyle(element).color : "";
        }),
        stat: stats.map((stat) => root.getPropertyValue(`--color-stat-${stat}`).trim()),
        hpFill: fills[0] ?? "",
        hpToken: root.getPropertyValue("--color-sec-hp").trim(),
        attackFill: fills[1] ?? "",
        attackToken: root.getPropertyValue("--color-sec-physical-attack").trim(),
      };
    }, PRIMARY);
    expect(colors.totals).toEqual(colors.stat.map(rgb));
    // 2차 스탯 막대는 그 2차 스탯 색 하나(1차 스탯 색과 겹치지 않는다)
    expect(colors.hpFill).toBe(rgb(colors.hpToken));
    expect(colors.attackFill).toBe(rgb(colors.attackToken));
    for (const token of colors.stat) {
      expect(colors.hpToken).not.toBe(token);
      expect(colors.attackToken).not.toBe(token);
    }
    await expect(page.locator(".combat-row[data-sec='hp'] .combat-bar-fill")).toHaveCount(1);

    // 출처 상세: STR 막대를 누르면 몸 값·스킬·효과·합계(= 막대 합계), Escape로 닫힌다. K는 만렙이 아니면 없다(D-449)
    const str = page.locator('.core-row[data-stat="str"]');
    const pop = str.locator(".core-pop");
    await expect(pop).toBeHidden();
    await str.locator(".core-toggle").click();
    await expect(str.locator(".core-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(pop).toBeVisible();
    await expect(pop).toContainText(message("ko", "cyborg_source_body"));
    await expect(pop).toContainText(message("ko", "cyborg_source_effect"));
    await expect(pop.locator(".core-pop-sum")).toHaveText(
      (await str.locator(".core-total").textContent()) ?? "",
    );
    // 다른 막대를 누르면 그쪽만 열린다
    await page.locator('.core-row[data-stat="vit"] .core-toggle').click();
    await expect(pop).toBeHidden();
    await expect(page.locator('.core-row[data-stat="vit"] .core-pop')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('.core-row[data-stat="vit"] .core-pop')).toBeHidden();
    await expect(page.locator(".core-k")).toHaveCount(0);
    await expect(page.locator(".cyborg")).toContainText(message("ko", "cyborg_core_note"));

    // 상세 전투 스펙: 옛 묶음(효율은 행이 없어 빠진다), HP 줄을 누르면 공식 상자(입력 6줄)·"= 결과"(= 줄 값)
    expect(
      await page
        .locator(".combat-group")
        .evaluateAll((list) => list.map((group) => group.getAttribute("data-group"))),
    ).toEqual(["vitals", "offense", "defense", "mobility"]);
    // D-458 새 행: 옛 묶음 자리(재생·회복은 VITALS, 속성 방어율은 DEFENSE), 막대는 자기 색(1차 스탯 색·다른 2차 스탯 색과 다름)
    const rowsOf = (group: string) =>
      page
        .locator(`.combat-group[data-group="${group}"] .combat-row`)
        .evaluateAll((list) => list.map((row) => row.getAttribute("data-sec")));
    expect(await rowsOf("vitals")).toEqual([
      "hp",
      "armor_hp",
      "shield_hp",
      "shield_regen",
      "mp",
      "mp_regen",
      "stamina",
      "stamina_regen",
    ]);
    expect(await rowsOf("defense")).toEqual(["defense_rate", "elemental_defense_rate", "evade"]);
    const newColors = await page.evaluate((wanted) => {
      const root = getComputedStyle(document.documentElement);
      const allSec = [...document.querySelectorAll<HTMLElement>(".combat-row")].map(
        (row) => row.getAttribute("data-sec") ?? "",
      );
      return {
        rows: wanted.map(({ row, token }) => {
          const fill = document.querySelector(`.combat-row[data-sec="${row}"] .combat-bar-fill`);
          return {
            fill: fill ? getComputedStyle(fill).backgroundColor : "",
            token: root.getPropertyValue(token).trim(),
          };
        }),
        others: allSec
          .filter((id) => !wanted.some((entry) => entry.row === id))
          .map((id) => root.getPropertyValue(`--color-sec-${id.replaceAll("_", "-")}`).trim()),
      };
    }, NEW_ROWS);
    for (const { fill, token } of newColors.rows) {
      expect(token).toMatch(/^#[0-9a-f]{6}$/);
      expect(fill).toBe(rgb(token));
      expect(colors.stat).not.toContain(token);
      expect(newColors.others).not.toContain(token);
    }
    expect(new Set(newColors.rows.map((entry) => entry.token)).size).toBe(NEW_ROWS.length);
    // 회복·재생 값은 분당
    await expect(page.locator('.combat-row[data-sec="shield_regen"] .combat-value')).toContainText("/분");
    const hp = page.locator('.combat-row[data-sec="hp"]');
    const toggle = hp.locator(".combat-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(hp.locator(".combat-detail")).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = hp.locator(".combat-detail");
    await expect(detail).toBeVisible();
    await expect(detail.locator(".combat-formula")).toContainText(message("ko", "cyborg_formula_quantity"));
    await expect(detail.locator(".combat-line")).toHaveCount(8);
    const hpValue = (await hp.locator(".combat-value").textContent()) ?? "";
    await expect(detail.locator(".combat-result")).toHaveText(`= ${hpValue}`);
    // 확률 줄(회피)은 키보드로: 공식 | 캡 …
    const evade = page.locator('.combat-row[data-sec="evade"]');
    await evade.locator(".combat-toggle").focus();
    await page.keyboard.press("Enter");
    await expect(evade.locator(".combat-formula")).toContainText(message("ko", "cyborg_formula_probability"));
    await expect(evade.locator(".combat-formula")).toContainText("|");
    // 다시 누르면 접힌다
    await toggle.click();
    await expect(hp.locator(".combat-detail")).toBeHidden();

    // 스킬 칸: 처음 3칸(빈 칸) + 닫힌 7칸(환생 1~7회에 하나씩, 팩 skillSlots)
    const locked = page.locator('.cyborg-skill[data-state="locked"]');
    await expect(locked).toHaveCount(7);
    await expect(locked.first()).toContainText(message("ko", "cyborg_skill_locked", { count: 1 }));
    await expect(page.locator('.cyborg-skill[data-state="empty"]')).toHaveCount(3);
    // 속성 12칸, 인공장기 3칸·장비 6칸(팩 unit_kinds)
    await expect(page.locator(".cyborg-element")).toHaveCount(12);
    await expect(page.locator('.cyborg-slot-group[data-side="organ"] .cyborg-slot')).toHaveCount(3);
    await expect(page.locator('.cyborg-slot-group[data-side="gear"] .cyborg-slot')).toHaveCount(6);
    await expect(page.locator(".cyborg-footer")).toContainText("E2EPlayer");

    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("만렙이면 K와 처음 값(D-449): 처음 값·레벨 성장 칸, 스탯마다 K, 세 칸 범례", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      // 서버는 만렙일 때만 growth와 처음 값·레벨 성장 출처를 보낸다(apps/server/src/roster/roster.test.ts). 화면만 보려고 응답을 고친다
      "cyborg.get": (data) => {
        const body = record(Reflect.get(record(data), "body"));
        Reflect.set(body, "level", Reflect.get(body, "maxLevel"));
        const k = { str: 1100, vit: 950, int: 1000, wis: 1200, dex: 800, agi: 1050 };
        Reflect.set(body, "growth", { initial: { str: 5, vit: 5, int: 5, wis: 5, dex: 5, agi: 5 }, kPm: k });
        const sources = record(Reflect.get(body, "primarySources"));
        for (const stat of PRIMARY) {
          const list: unknown = Reflect.get(sources, stat);
          if (!Array.isArray(list)) throw new Error("출처가 없습니다");
          const bodyValue = Number(Reflect.get(record(list[0]), "value"));
          Reflect.set(sources, stat, [
            { kind: "initial", value: 5 },
            { kind: "growth", value: bodyValue - 5, kPm: k[stat] },
            ...list.slice(1),
          ]);
        }
      },
    });
    await page.goto("/cyborg");
    await cyborgReady(page);
    const ks = page.locator(".cyborg .core-k");
    await expect(ks).toHaveCount(6);
    await expect(ks.first()).toHaveText(message("ko", "roster_stat_k", { value: "1.10" }));
    await expect(page.locator('.core-legend-item[data-part="initial"]')).toBeVisible();
    await expect(page.locator('.core-legend-item[data-part="growth"]')).toBeVisible();
    await expect(page.locator(".cyborg")).toContainText(message("ko", "cyborg_core_note_max"));
    await expect(page.locator('.cyborg .core-seg[data-part="growth"]')).toHaveCount(6);
    await page.locator('.core-row[data-stat="str"] .core-toggle').click();
    await expect(page.locator('.core-row[data-stat="str"] .core-pop')).toContainText(
      message("ko", "cyborg_source_growth", { k: "1.10" }),
    );
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("데스크톱: 막대에 올리면 출처 상세", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", preview: "dev" });

  test("마우스를 올리면 보이고 치우면 사라진다(장비·인공장기 줄)", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);
    const vit = page.locator('.core-row[data-stat="vit"]');
    await vit.locator(".core-bar").hover();
    const pop = vit.locator(".core-pop");
    await expect(pop).toBeVisible();
    // 시안 인공 심장(인공장기 칸)이 VIT를 올린다
    await expect(pop.locator('.core-pop-row[data-part="organ"]')).toHaveCount(1);
    await page.locator(".screen-title").hover();
    await expect(pop).toBeHidden();
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
        await page.locator('.combat-row[data-sec="hp"] .combat-toggle').click();
        await page.locator('.core-row[data-stat="str"] .core-toggle').click();
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
      const name = `${String(width)}-${theme}-${language}`;
      await shot(page, `cyborg-ui-${name}`, { fullPage: true });
      await elementShot(page.locator(".cyborg-profile"), `cyborg-ui-hero-${name}`);
      // 상세 전투 스펙: 접은 카드 → 펼친 카드(HP·회피·크리 배율)
      const combat = page.locator(".combat-card");
      await elementShot(combat, `cyborg-ui-combat-${name}`);
      for (const row of ["hp", "evade", "crit_multiplier"]) {
        await page.locator(`.combat-row[data-sec="${row}"] .combat-toggle`).click();
      }
      await expect(page.locator('.combat-row[data-sec="hp"] .combat-detail')).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(combat, `cyborg-ui-combat-open-${name}`);
      // D-458 새 행: 접은 VITALS·DEFENSE 묶음, 쉴드 재생·속성 방어율을 펼친 묶음
      const vitals = page.locator('.combat-group[data-group="vitals"]');
      const defense = page.locator('.combat-group[data-group="defense"]');
      await page.locator('.combat-row[data-sec="hp"] .combat-toggle').click();
      await page.locator('.combat-row[data-sec="evade"] .combat-toggle').click();
      await elementShot(vitals, `cyborg-d459-vitals-${name}`);
      await elementShot(defense, `cyborg-d459-defense-${name}`);
      for (const { row } of NEW_ROWS)
        await page.locator(`.combat-row[data-sec="${row}"] .combat-toggle`).click();
      await expect(
        page.locator('.combat-row[data-sec="elemental_defense_rate"] .combat-detail'),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(vitals, `cyborg-d459-vitals-open-${name}`);
      await elementShot(defense, `cyborg-d459-defense-open-${name}`);
      for (const { row } of NEW_ROWS)
        await page.locator(`.combat-row[data-sec="${row}"] .combat-toggle`).click();
      await page.locator('.combat-row[data-sec="hp"] .combat-toggle').click();
      await page.locator('.combat-row[data-sec="evade"] .combat-toggle').click();
      await shot(page, `cyborg-ui-open-${name}`, { fullPage: true });
      // 핵심 사양 출처 상세(VIT: 몸 값 + 인공 심장)
      await page.locator('.core-row[data-stat="vit"] .core-toggle').click();
      await expect(page.locator('.core-row[data-stat="vit"] .core-pop')).toBeVisible();
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(page.locator(".core-pairs"), `cyborg-ui-pop-${name}`);
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
