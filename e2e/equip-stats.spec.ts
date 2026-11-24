// 입은 장비 → 스탯·공격 값 화면 시험 — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)".
// - admin 계정(사이보그 있음, 개발 받기 권한 dev·admin): 무기 칸을 비우고 실제 공격력(맨손 = 스탯 공격력, "맨손 — 맨손 스킬만")을 읽은 뒤, 팩 시험용 검을 받아
//   쥐면 실제 공격력이 오르고("든 무기: 시험용 검") 벗으면 돌아온다(보유 물건 목록이 다시 오면 cyborg.get을 다시 받는다).
//   스태미나 회복 줄은 실제 회복(행 값 × 적정 STA 비율, D-511)과 그 셈을 보인다. 보유 물건은 버릴 길이 없어 실행 안에 남으므로
//   dev 본체의 칸·인벤토리를 세는 inventory.spec과 겹치지 않게 admin 계정을 쓴다.
// - 유닛 상세(세계 유닛 = 구인 카드로 고용한 휴먼): 시험용 조끼를 입히면 2차 스탯 아머 HP가 오른다(units.list를 다시 받는다).
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어 — 사이보그 상세 전투 스펙(실제 공격력·스태미나 회복 펼침), 유닛 상세 스탯 판.
//   폴더는 E2E_SHOTS_DIR.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { ensureHuman } from "./helpers/wsCommands.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const SWORD = "test_sword";
const VEST = "test_vest";
const NAMES = {
  sword: { ko: "시험용 검", en: "Test sword" },
  vest: { ko: "시험용 조끼", en: "Test vest" },
} as const;

async function cyborgReady(page: Page): Promise<void> {
  await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".holdings")).toBeVisible({ timeout: 15_000 });
}

const notice = (page: Page): Locator => page.locator(".holdings .holding-notice");
const weaponTile = (page: Page): Locator =>
  page.locator('.cyborg-slot-group[data-side="gear"] .holding-slot[data-index="0"]');
const attackRow = (page: Page): Locator => page.locator('.combat-row[data-real="attack"]');
/** 줄 값 글의 수(자리 나눔 쉼표를 뺀다) */
const numberIn = (text: string | null): number => Number((text ?? "").replaceAll(/[^\d]/g, ""));
/** 줄 값(버프 몫 알약을 뺀 기본값 — sheet-buffs.spec.ts가 admin에 버프를 걸어도 같은 값) */
const attackValue = async (page: Page): Promise<number> =>
  numberIn(await attackRow(page).locator(".combat-value-base").textContent());

/** 개발 받기 판으로 아이템을 받는다(접혀 있으면 편다). 사이보그 화면이면 사이보그, 유닛 상세면 그 유닛이 받는다 */
async function grant(page: Page, language: Language, item: string, name: string): Promise<void> {
  const dev = page.locator(".holdings-dev");
  if ((await dev.getAttribute("open")) === null) await dev.locator("summary").click();
  const select = dev.getByLabel(message(language, "holdings_dev_item"));
  await expect(select).toBeVisible({ timeout: 15_000 });
  await select.selectOption(item);
  await dev.getByLabel(message(language, "holdings_dev_quantity")).fill("1");
  await dev.getByRole("button", { name: message(language, "holdings_dev_submit"), exact: true }).click();
  await expect(notice(page)).toContainText(
    message(language, "holdings_done_grant", { item: name, count: 1 }),
  );
}

/** 무기 칸을 비운다(앞 시험이 쥐게 했으면 칸 창에서 [해제]) */
async function emptyWeapon(page: Page, language: Language): Promise<void> {
  if ((await weaponTile(page).getAttribute("data-empty")) === "true") return;
  await weaponTile(page).locator("button").click();
  const sheet = page.locator("dialog.holdings-sheet");
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", { name: message(language, "holdings_action_unequip"), exact: true })
    .click();
  await expect(sheet).toBeHidden();
  await expect(weaponTile(page)).toHaveAttribute("data-empty", "true");
}

/** 시험용 검을 쥐게 한다(없으면 받는다) */
async function holdSword(page: Page, language: Language): Promise<void> {
  const name = NAMES.sword[language];
  if (((await weaponTile(page).textContent()) ?? "").includes(name)) return;
  const sword = page.locator(`.holdings .holding-card[data-item="${SWORD}"]`);
  if ((await sword.count()) === 0) await grant(page, language, SWORD, name);
  if ((await weaponTile(page).getAttribute("data-empty")) !== "true") await emptyWeapon(page, language);
  await sword.first().locator('[data-action="equip"]').click();
  await expect(notice(page)).toContainText(message(language, "holdings_done_equip", { item: name }));
  await expect(weaponTile(page)).toContainText(name);
}

/** 세계 유닛이 있게 한다(없으면 구인 카드로 휴먼 하나를 고용한다 — 모자란 시험 화폐는 운영자 지급). 유닛 화면 상세를 연다 */
async function openUnitDetail(page: Page): Promise<Locator> {
  await page.goto("/units");
  await expect(page.locator(".units-panel .status")).toHaveCount(0, { timeout: 15_000 });
  // 내 사이보그 본체 줄(맨 위, data-self)은 빼고 고른다 — 이 시험은 본체가 아닌 유닛의 상세를 본다
  const others = page.locator('.units-row:not([data-self="true"]) .units-row-main');
  if ((await others.count()) === 0) {
    await ensureHuman(page, "e2e_admin");
    await page.goto("/units");
    await expect(page.locator(".units-panel .status")).toHaveCount(0, { timeout: 15_000 });
    await expect(others.first()).toBeVisible({ timeout: 20_000 });
  }
  await others.first().click();
  const detail = page.locator(".units-detail");
  await expect(detail.locator(".holdings")).toBeVisible({ timeout: 15_000 });
  return detail;
}

/** 유닛 상세에서 시험용 조끼를 입힌다(없으면 받는다, 이미 입었으면 그대로) */
async function wearVest(page: Page, detail: Locator, language: Language): Promise<void> {
  const name = NAMES.vest[language];
  const body = detail.locator('.holding-slot[data-index="3"]');
  if ((await body.getAttribute("data-empty")) !== "true") return;
  const vest = detail.locator(`.holding-card[data-item="${VEST}"]`);
  if ((await vest.count()) === 0) await grant(page, language, VEST, name);
  await vest.first().locator('[data-action="equip"]').click();
  await expect(notice(page)).toContainText(message(language, "holdings_done_equip", { item: name }));
  await expect(body).toContainText(name);
}

test.describe("관리자 계정: 입은 장비 → 사이보그 스탯·공격 값", () => {
  test.use({ account: "admin" });

  test("검을 쥐면 실제 공격력이 오르고 벗으면 돌아온다, 스태미나 회복은 실제 값", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);
    await emptyWeapon(page, "ko");

    // 맨손: 실제 공격력 = 스탯 공격력, 맨손 표지(D-490)
    const attack = attackRow(page);
    await expect(attack).toBeVisible();
    const bare = await attackValue(page);
    expect(bare).toBeGreaterThan(0);
    await attack.locator(".combat-toggle").click();
    const detail = attack.locator(".combat-detail");
    await expect(detail).toContainText(message("ko", "cyborg_attack_bare"));
    await expect(detail.locator(".combat-result")).toContainText(`= ${String(bare)}`);

    // 검을 쥔다 → 보유 물건 목록이 다시 오고 사이보그 자료도 다시 받아 실제 공격력이 오른다(D-502 스탯 + 무기 × 비율)
    await holdSword(page, "ko");
    await expect.poll(() => attackValue(page), { timeout: 15_000 }).toBeGreaterThan(bare);
    await expect(detail).toContainText(message("ko", "cyborg_attack_weapon", { name: NAMES.sword.ko }));
    await expect(detail).toContainText("STR");
    // 명중·크리·간격 줄
    for (const real of ["hit", "crit", "interval"])
      await expect(page.locator(`.combat-row[data-real="${real}"]`)).toBeVisible();

    // 스태미나 회복 줄: 실제 회복(분당)과 그 셈(D-511)
    const regen = page.locator('.combat-row[data-real="stamina_regen"]');
    await expect(regen.locator(".combat-value-base")).toContainText("/분");
    await regen.locator(".combat-toggle").click();
    // 서버가 판정 식(real_stamina_regen, D-556)을 주면 그 식 글을 "실제 회복 = …"으로 보인다(옛 고정 문구는 식이 없을 때만)
    await expect(regen.locator(".combat-detail")).toContainText(`${message("ko", "cyborg_stamina_real")} = `);
    // 줄 값 = 셈의 끝 값(예: 적정보다 STA가 높으면 행 값 720보다 크다)
    const shownRegen = (await regen.locator(".combat-value-base").textContent()) ?? "";
    await expect(regen.locator(".combat-detail .combat-result").last()).toContainText(`= ${shownRegen}`);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 벗으면 맨손 값으로 돌아온다
    await emptyWeapon(page, "ko");
    await expect.poll(() => attackValue(page), { timeout: 15_000 }).toBe(bare);
    await expect(detail).toContainText(message("ko", "cyborg_attack_bare"));
    expect(deviceErrors).toEqual([]);
  });

  test("유닛 상세: 조끼를 입히면 아머 HP가 오른다", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    const detail = await openUnitDetail(page);
    // 유닛 상세의 사양 판(units.sheet — 사이보그 판과 같은 상세 전투 스펙)
    const armor = detail.locator('.combat-row[data-sec="armor_hp"] .combat-value-base');
    await expect(armor).toBeVisible({ timeout: 15_000 });
    const body = detail.locator('.holding-slot[data-index="3"]');
    if ((await body.getAttribute("data-empty")) !== "true") {
      // 앞 실행이 입혔으면 카드에서 벗긴다
      await detail
        .locator(`.holding-card[data-item="${VEST}"]`)
        .first()
        .getByRole("button", {
          name: message("ko", "holdings_action_label", {
            action: message("ko", "holdings_action_unequip"),
            item: NAMES.vest.ko,
          }),
        })
        .click();
      await expect(body).toHaveAttribute("data-empty", "true");
    }
    const before = numberIn(await armor.textContent());
    await wearVest(page, detail, "ko");
    await expect
      .poll(async () => numberIn(await armor.textContent()), { timeout: 15_000 })
      .toBeGreaterThan(before);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

const SHOTS: readonly { viewport: "phone" | "desktop"; theme: Theme; language: Language }[] = (
  ["phone", "desktop"] as const
).flatMap((viewport) =>
  (["pastel", "dark"] as const).flatMap((theme) =>
    (["ko", "en"] as const).map((language) => ({ viewport, theme, language })),
  ),
);

test.describe("사진(390·1440 × 파스텔·다크 × 한국어·영어)", () => {
  for (const { viewport, theme, language } of SHOTS) {
    const width = viewport === "phone" ? 390 : 1440;
    test.describe(`${String(width)} ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS[viewport], account: "admin", theme, language });

      test(`상세 전투 스펙·유닛 스탯 (${String(width)} ${theme} ${language})`, async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/cyborg");
        await cyborgReady(page);
        await holdSword(page, language);
        await expect(attackRow(page).locator(".combat-value")).toBeVisible();
        await expect
          .poll(async () => (await attackRow(page).locator(".combat-detail").textContent()) ?? "", {
            timeout: 15_000,
          })
          .toContain(NAMES.sword[language]);
        await attackRow(page).locator(".combat-toggle").click();
        await page.locator('.combat-row[data-real="stamina_regen"] .combat-toggle').click();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        const name = `${String(width)}-${theme}-${language}`;
        await elementShot(page.locator('.combat-group[data-group="offense"]'), `equip-offense-${name}`);
        await elementShot(page.locator('.combat-group[data-group="vitals"]'), `equip-vitals-${name}`);
        // 유닛 상세: 조끼를 입힌 스탯 판
        const detail = await openUnitDetail(page);
        await wearVest(page, detail, language);
        const stats = detail.locator(".combat-card");
        await expect(stats).toBeVisible({ timeout: 15_000 });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(stats, `equip-unit-stats-${name}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
