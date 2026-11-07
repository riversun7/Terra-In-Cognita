// 사이보그 판 버프 몫 화면 시험 — 질문 354 → 기획 D-515 "기본값과 버프를 나눠(버프 몫은 다른 색) 보인다", D-448.
// docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 사이보그 판 버프 몫·꺼진 아이템)".
// - 팩에는 아직 쓰는 물건이 없어서, 시험이 아이템 편집기(tRPC items.save, 그 세계 덮어쓰기)로 시험 효과 다섯과 그 효과를 한 번에 거는
//   시험 물약을 만든다(STR +3 고정값, 공격 +100‰, 방어율 +50‰, 이동 속도 −200‰ 디버프, AGI −2 디버프, 한 시간).
// - admin 계정(사이보그 있음, 개발 받기): 받기 → [사용] → 핵심 사양 STR 줄 = 기본 + 알약 "+3"(버프 색), AGI 줄 알약 "-2"(디버프 색),
//   상세 전투 스펙: 물리 공격력·방어율 줄 버프 알약, 회피 줄 디버프 알약, 실제 공격력 줄은 공격 ‰까지 든 몫(펼치면 "전투 수치 버프 +10%"),
//   기동 묶음에 이동 속도 줄(−20%). 버프는 한 시간 남으므로 이 계정의 공격 값을 보는 equip-stats.spec은 기본값(.combat-value-base)을 읽는다.
//   dev 계정의 칸·효과를 세는 inventory.spec과 겹치지 않게 admin을 쓴다.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어 — 핵심 사양 판, 공격·방어·기동 묶음. 폴더는 E2E_SHOTS_DIR.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const ID = {
  feast: "e2e_sb_feast",
  str: "e2e_sb_str",
  attack: "e2e_sb_attack",
  guard: "e2e_sb_guard",
  slow: "e2e_sb_slow",
  agi: "e2e_sb_agi",
} as const;
const FEAST = { ko: "시험 버프 물약", en: "Test buff tonic" } as const;
const HOUR = 3_600_000;

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  mutation = false,
): Promise<{ status: number; data: unknown; error: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, mutation: post }) => {
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = await fetch(
        post ? `/api/trpc/${name}` : `/api/trpc/${name}${query}`,
        post
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const pick = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      return {
        status: response.status,
        data: pick(pick(json, "result"), "data"),
        error: pick(pick(json, "error"), "data"),
      };
    },
    { procedure, input, mutation },
  );
}

/** 효과 사전 항목(버프·디버프, 한 시간) */
const effectEntry = (id: string, ko: string, en: string, kind: string, stat: string, valueMode: string) => ({
  id,
  name: { ko, en },
  kind,
  stat,
  valueMode,
  durationMs: HOUR,
  tickMs: 0,
  stacking: "refresh",
  maxStacks: 1,
  enabled: true,
});

/** 물약의 효과 줄(늘 걸림, 한 시간) */
const line = (effect: string, value: number) => ({ effect, value, chancePm: 1000, durationMs: HOUR });

/** 시험 효과 다섯과 시험 물약을 그 세계 덮어쓰기로 만든다. 이미 있으면 그대로 */
async function ensureTestItems(page: Page): Promise<void> {
  const listed = await trpc(page, "items.list");
  expect(listed.status).toBe(200);
  if (rows(get(listed.data, "items")).some((row) => get(row, "id") === ID.feast)) return;
  const entries: { category: string; entry: unknown }[] = [
    { category: "effects", entry: effectEntry(ID.str, "시험 힘", "Test strength", "buff", "str", "flat") },
    {
      category: "effects",
      entry: effectEntry(ID.attack, "시험 공격", "Test attack", "buff", "attack", "permille"),
    },
    {
      category: "effects",
      entry: effectEntry(ID.guard, "시험 방어", "Test guard", "buff", "defense_rate", "flat"),
    },
    {
      category: "effects",
      entry: effectEntry(ID.slow, "시험 둔화", "Test slow", "debuff", "move_speed", "permille"),
    },
    { category: "effects", entry: effectEntry(ID.agi, "시험 저림", "Test numb", "debuff", "agi", "flat") },
    {
      category: "items",
      entry: {
        id: ID.feast,
        name: FEAST,
        category: "consumable",
        subcategory: "medicine",
        tier: 1,
        startPrice: 5,
        enabled: true,
        use: {
          effects: [
            line(ID.str, 3),
            line(ID.attack, 100),
            line(ID.guard, 50),
            line(ID.slow, 200),
            line(ID.agi, 2),
          ],
        },
      },
    },
  ];
  const saved = await trpc(
    page,
    "items.save",
    {
      expectedRevision: get(listed.data, "revision"),
      changes: entries.map(({ category, entry }) => ({ op: "put", category, entry, baseHash: null })),
      note: "e2e 사이보그 판 버프 몫 시험 물건",
    },
    true,
  );
  expect(saved.status, JSON.stringify(saved.error)).toBe(200);
}

async function cyborgReady(page: Page): Promise<void> {
  await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".holdings")).toBeVisible({ timeout: 15_000 });
}

const coreRow = (page: Page, stat: string): Locator => page.locator(`.core-row[data-stat="${stat}"]`);
/** 2차 스탯 줄(같은 색 표지를 쓰는 판정 값 줄 — 실제 공격력 등 — 은 뺀다) */
const secRow = (page: Page, sec: string): Locator =>
  page.locator(`.combat-row[data-sec="${sec}"]:not([data-real])`);
const realRow = (page: Page, real: string): Locator => page.locator(`.combat-row[data-real="${real}"]`);
const notice = (page: Page): Locator => page.locator(".holdings .holding-notice");

/** 시험 물약을 받아 쓴다(이미 버프가 걸려 있으면 그대로 — 한 시간 남는다) */
async function ensureBuffed(page: Page, language: Language): Promise<void> {
  if ((await coreRow(page, "str").getAttribute("data-buff")) !== null) return;
  await ensureTestItems(page);
  const card = page.locator(`.holdings .holding-card[data-item="${ID.feast}"]`);
  if ((await card.count()) === 0) {
    const dev = page.locator(".holdings-dev");
    if ((await dev.getAttribute("open")) === null) await dev.locator("summary").click();
    const select = dev.getByLabel(message(language, "holdings_dev_item"));
    await expect(select).toBeVisible({ timeout: 15_000 });
    await select.selectOption(ID.feast);
    await dev.getByLabel(message(language, "holdings_dev_quantity")).fill("1");
    await dev.getByRole("button", { name: message(language, "holdings_dev_submit"), exact: true }).click();
    await expect(notice(page)).toContainText(
      message(language, "holdings_done_grant", { item: FEAST[language], count: 1 }),
    );
  }
  await card.first().locator('[data-action="use"]').click();
  await expect(notice(page)).toContainText(message(language, "holdings_done_use", { item: FEAST[language] }));
  // 보유 물건 목록이 다시 오면 cyborg.get도 다시 받는다 → 버프 몫이 보인다
  await expect(coreRow(page, "str")).toHaveAttribute("data-buff", "3", { timeout: 15_000 });
}

/** 줄 값 글의 수(자리 나눔을 뺀다) */
const numberIn = (text: string | null): number => Number((text ?? "").replaceAll(/[^\d-]/g, ""));

test.describe("관리자 계정: 버프 물약 → 사이보그 판 버프 몫", () => {
  test.use({ account: "admin" });

  test("1차 줄은 기본 + 알약, 2차·판정 값 줄은 기본값 옆 버프·디버프 알약, 실제 공격력은 공격 ‰까지, 이동 속도 줄", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);
    await ensureBuffed(page, "ko");

    // 핵심 사양: STR = 기본 + 알약 "+3"(버프), 상세 판 합계 = 기본 + 3
    const str = coreRow(page, "str");
    await expect(str.locator(".buff-chip")).toHaveAttribute("data-tone", "up");
    await expect(str.locator(".buff-chip")).toContainText("+3");
    await expect(str.locator(".buff-chip")).toContainText(message("ko", "cyborg_buff_up"));
    const strBase = numberIn(await str.locator(".core-total-value").textContent());
    await str.locator(".core-toggle").click();
    await expect(str.locator(".core-pop-sum")).toHaveText(String(strBase + 3));
    await expect(str.locator('.core-seg[data-part="effect"]')).toHaveCount(1);
    // AGI 디버프 −2: 디버프 색 알약, 막대 끝이 깎인 몫, 범례에 디버프
    const agi = coreRow(page, "agi");
    await expect(agi).toHaveAttribute("data-buff", "-2");
    await expect(agi.locator(".buff-chip")).toHaveAttribute("data-tone", "down");
    await expect(agi.locator(".buff-chip")).toContainText("-2");
    await expect(agi.locator('.core-seg[data-part="debuff"]')).toHaveCount(1);
    await expect(page.locator('.core-legend-item[data-part="debuff"]')).toBeVisible();

    // 상세 전투 스펙: 알약의 뜻 줄, 물리 공격력(STR 가중치)·방어율(STR 몫 + 버프 50‰) 버프, 회피(AGI) 디버프
    await expect(page.locator(".combat-buff-legend")).toContainText(message("ko", "cyborg_buff_legend"));
    await expect(secRow(page, "physical_attack")).toHaveAttribute("data-buff", "up");
    await expect(secRow(page, "defense_rate")).toHaveAttribute("data-buff", "up");
    await expect(secRow(page, "evade")).toHaveAttribute("data-buff", "down");
    await expect(secRow(page, "defense_rate").locator(".combat-bar-buff")).toHaveCount(1);
    // 방어율 줄을 펴면 전투 수치 버프 +5%와 "버프 … → 전투 …"
    await secRow(page, "defense_rate").locator(".combat-toggle").click();
    const defense = secRow(page, "defense_rate").locator(".combat-detail");
    await expect(defense).toContainText(message("ko", "cyborg_buff_combat", { value: "+5%" }));
    await expect(defense.locator(".combat-buff-line")).toBeVisible();

    // 실제 공격력: 기본값 옆 버프 알약, 펼치면 공격 ‰ 버프 +10%
    const attack = realRow(page, "attack");
    await expect(attack).toHaveAttribute("data-buff", "up");
    await attack.locator(".combat-toggle").click();
    await expect(attack.locator(".combat-detail")).toContainText(
      message("ko", "cyborg_buff_combat", { value: "+10%" }),
    );
    // 이동 속도(2차 행 없음): 기동 묶음에 100% + 디버프 알약 −20%
    const move = realRow(page, "move_speed");
    await expect(page.locator('.combat-group[data-group="mobility"]').locator(move)).toBeVisible();
    await expect(move.locator(".combat-value-base")).toHaveText("100%");
    await expect(move.locator(".buff-chip")).toContainText("-20%");
    await expect(move).toHaveAttribute("data-buff", "down");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
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

      test(`핵심 사양·공격·방어·기동 버프 몫 (${String(width)} ${theme} ${language})`, async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/cyborg");
        await cyborgReady(page);
        await ensureBuffed(page, language);
        await coreRow(page, "str").locator(".core-toggle").click();
        await realRow(page, "attack").locator(".combat-toggle").click();
        await realRow(page, "move_speed").locator(".combat-toggle").click();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        const name = `${String(width)}-${theme}-${language}`;
        await elementShot(
          page.locator(".roster-section").filter({ has: page.locator(".core-pairs") }),
          `sheet-buffs-core-${name}`,
        );
        for (const group of ["offense", "defense", "mobility"] as const)
          await elementShot(
            page.locator(`.combat-group[data-group="${group}"]`),
            `sheet-buffs-${group}-${name}`,
          );
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
