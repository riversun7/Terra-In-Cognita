// 효과 사전 화면 시험 — /dev/effects (docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)", 사용자 결정 B: 따로 화면 + 두 편집기에서 잇기).
// - dev: 개발자 홈에서 연다. 효과를 고쳐 담고 [적용]하면 그 세계에 바로 든다(아이템 편집기 효과 줄·스킬 편집기 효과 고르기가 같은 실효
//   효과를 쓴다). 쓰는 곳에 아이템·스킬이 보이고 누르면 그 편집기에서 그 항목이 열린다. 칸마다 팩 값 견주기·[팩 값으로].
//   새 효과는 꺼진 채로 만들어 적용된다.
// - 아이템 편집기 사용 효과 줄·스킬 편집기 효과 줄 옆 [효과 사전에서 열기]·[새 효과 만들기]가 이 화면을 연다.
// - 사진: 1440 × 개발 화면 테마 네온·라이트(한국어) + 390 네온(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui). 가로 넘침·작은 누르는 곳 없음.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 아이템 편집기 분류(효과 포함)의 덮어쓰기를 모두 지운다.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {};
/** 목록에서 id가 맞는 줄(TaxonomyRow면 entry.id) */
const byId = (rows: unknown, id: string): unknown =>
  list(rows).find((row) => (field(field(row, "entry"), "id") ?? field(row, "id")) === id);

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). mutation이면 POST, 아니면 GET(?input=) */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  mutation = false,
): Promise<{ status: number; data: unknown; reason: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, mutation: post }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = await fetch(
        post ? `/api/trpc/${name}` : `/api/trpc/${name}${query}`,
        post
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: get(get(json, "result"), "data"),
        reason: get(get(get(json, "error"), "data"), "reason"),
      };
    },
    { procedure, input, mutation },
  );
}

/** 아이템·분류 자료·효과 덮어쓰기를 모두 지운다(만든 항목은 지워지고 ID가 은퇴한다) */
async function resetItems(page: Page): Promise<void> {
  const current = await trpc(page, "items.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`items.list ${current.status}`);
  const reverts = (category: string, key: string) =>
    list(field(current.data, key)).flatMap((row) => {
      const entry = field(row, "entry") ?? row;
      const id = field(entry, "id");
      if (field(row, "origin") === "pack" || typeof id !== "string") return [];
      return [{ op: "revert", category, id, baseHash: field(row, "hash") }];
    });
  const changes = [
    ...reverts("item_subcategories", "subcategories"),
    ...reverts("item_tags", "tags"),
    ...reverts("weapon_types", "weaponTypes"),
    ...reverts("effects", "effectRows"),
    ...reverts("items", "items"),
  ];
  if (changes.length === 0) return;
  const reverted = await trpc(page, "items.save", { expectedRevision: revision, changes }, true);
  if (reverted.status !== 200)
    throw new Error(`items.save revert ${reverted.status} ${String(reverted.reason)}`);
}

/** 배급 식량을 본뜬 시험 소모품(사용 효과 = 화상)을 그 세계에 넣는다. 아이템 ID(지우면 은퇴하므로 부를 때마다 새 ID) */
async function seedConsumable(page: Page): Promise<string> {
  const id = `e2e_fx_ration_${Date.now().toString(36)}`;
  const ration = await trpc(page, "items.get", { id: "ration" });
  const listed = await trpc(page, "items.list");
  const entry = {
    ...record(field(ration.data, "entry")),
    id,
    name: { ko: "e2e 화상 식량", en: "e2e burn ration" },
    use: { effects: [{ effect: "burn", value: 5, chancePm: 1000 }] },
  };
  const saved = await trpc(
    page,
    "items.save",
    {
      expectedRevision: field(listed.data, "revision"),
      changes: [{ op: "put", category: "items", entry, baseHash: null }],
    },
    true,
  );
  if (saved.status !== 200) throw new Error(`items.save seed ${saved.status} ${String(saved.reason)}`);
  return id;
}

async function effectsReady(page: Page, path = "/dev/effects"): Promise<void> {
  await page.goto(path);
  await expect(page.locator(".fx-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

const entryRow = (page: Page, id: string) => page.locator(`.fx-item[data-effect="${id}"]`);
const editing = (page: Page) => page.locator(".fx-editing");
const bar = (page: Page) => page.locator(".fx-stagebar");

/** 휴대폰 폭에서는 편집 판을 열면 목록이 숨는다: 목록으로 돌아간다 */
async function toList(page: Page): Promise<void> {
  const back = page.locator(".fx-back-list");
  if (await back.isVisible()) await back.click();
}

async function open(page: Page, id: string): Promise<void> {
  await toList(page);
  await entryRow(page, id).click();
  await expect(editing(page)).toHaveAttribute("data-effect-entry", id);
}

/** 검사가 끝나 [적용]을 누를 수 있을 때까지 기다린 뒤 적용한다 */
async function apply(page: Page, note?: string): Promise<void> {
  await expect(bar(page)).toHaveAttribute("data-check", "ok", { timeout: 15_000 });
  if (note !== undefined) await bar(page).locator(".fx-note").fill(note);
  await bar(page).locator(".fx-apply").click();
  await expect(bar(page)).toHaveAttribute("data-count", "0", { timeout: 15_000 });
}

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("개발자 홈에서 열고, 효과를 고쳐 적용하면 두 편집기가 같은 실효 효과를 쓴다. 쓰는 곳 아이템·스킬은 그 편집기에서 열린다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev");
    await resetItems(page);
    const consumable = await seedConsumable(page);
    await page.locator('a[href="/dev/effects"]').click();
    await expect(page).toHaveURL(/\/dev\/effects$/);
    await expect(page.locator(".fx-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const listed = await trpc(page, "items.list");
    const skillIds = list(field(field(field(listed.data, "effectUsage"), "burn"), "skills")).map(String);
    expect(skillIds.length).toBeGreaterThan(0);
    const skillId = skillIds[0] ?? "";
    const skillName = String(field(field(byId(field(listed.data, "skills"), skillId), "name"), "ko"));

    await open(page, "burn");
    const usage = editing(page).locator('[data-part="effect-usage"]');
    await expect(usage.locator(`a[data-item="${consumable}"]`)).toHaveText("e2e 화상 식량");
    await expect(usage.locator(`a[data-skill="${skillId}"]`)).toHaveText(skillName);

    // 칸 고치기 → 담음 표지·팩 값 견주기 → 적용
    const form = editing(page).locator('[data-effect="burn"]');
    const duration = form.getByLabel(message("ko", "dev_effects_field_duration"), { exact: true });
    await duration.fill("4500");
    await form.getByLabel(message("ko", "dev_items_field_name_ko"), { exact: true }).fill("e2e 화상");
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    await expect(entryRow(page, "burn")).toHaveAttribute("data-staged", "");
    await expect(editing(page).locator('[data-section="time"]')).toHaveAttribute("data-staged", "");
    await apply(page, "e2e 효과 사전 시험");
    await expect(editing(page)).toContainText(message("ko", "dev_items_origin_edited"));
    // 덮어쓴 칸은 팩 값과 견준다: [팩 값으로]가 보인다
    await expect(
      editing(page).getByRole("button", {
        name: message("ko", "dev_content_field_to_pack_named", {
          name: message("ko", "dev_effects_field_duration"),
        }),
      }),
    ).toBeVisible();

    // 서버 실효: 아이템 편집기 효과 목록, 스킬 편집기 효과 고르기(같은 덮어쓰기 층)
    const after = await trpc(page, "items.list");
    const burn = byId(field(after.data, "effectRows"), "burn");
    expect([field(burn, "origin"), field(field(burn, "entry"), "durationMs")]).toEqual(["edited", 4500]);
    expect(field(field(byId(field(after.data, "effects"), "burn"), "name"), "ko")).toBe("e2e 화상");
    const skills = await trpc(page, "skills.list");
    expect(field(field(byId(field(skills.data, "effects"), "burn"), "name"), "ko")).toBe("e2e 화상");

    // 쓰는 곳 고리: 아이템 → 아이템 편집기에서 그 아이템, 스킬 → 스킬 편집기에서 그 스킬
    await usage.locator(`a[data-item="${consumable}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/dev/items\\?item=${consumable}$`));
    await expect(page.locator(".ie-detail-body")).toHaveAttribute("data-item", consumable, {
      timeout: 20_000,
    });
    await page.goBack();
    await expect(page.locator(".fx-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await open(page, "burn");
    await editing(page).locator(`[data-part="effect-usage"] a[data-skill="${skillId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/dev/skills\\?skill=${skillId}$`));
    await expect(page.locator(".sk-editing")).toHaveAttribute("data-skill", skillId, { timeout: 20_000 });

    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });

  test("새 효과는 꺼진 채로 담겨 적용되고, [지우기]를 담아 적용하면 빠진다", async ({
    page,
    deviceErrors,
  }) => {
    await effectsReady(page, "/dev/effects?create=1");
    await resetItems(page);
    // 만든 뒤 지운 ID는 은퇴해 다시 못 쓴다: 실행마다 새 ID
    const id = `e2e_glow_${Date.now().toString(36)}`;
    const create = page.locator('[data-part="effect-new"]');
    await create.getByLabel(message("ko", "dev_items_field_name_ko"), { exact: true }).fill("e2e 빛남");
    await create.getByLabel(message("ko", "dev_items_field_name_en"), { exact: true }).fill("e2e glow");
    await create.getByLabel(message("ko", "dev_items_field_id"), { exact: true }).fill(id);
    await create.locator(".fx-new-create").click();
    await expect(editing(page)).toHaveAttribute("data-effect-entry", id);
    await expect(editing(page)).toContainText(message("ko", "dev_items_disabled"));
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    await apply(page);
    const created = byId(field((await trpc(page, "items.list")).data, "effectRows"), id);
    expect([field(created, "origin"), field(field(created, "entry"), "enabled")]).toEqual(["created", false]);
    await open(page, id);
    await editing(page).locator(".fx-revert").click();
    await expect(editing(page).locator(".fx-revert-note")).toBeVisible();
    await apply(page);
    expect(byId(field((await trpc(page, "items.list")).data, "effectRows"), id)).toBeUndefined();
    await expect(entryRow(page, id)).toHaveCount(0);
    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });

  test("아이템 편집기 사용 효과 줄·스킬 편집기 효과 줄의 고리가 효과 사전을 연다", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/dev");
    await resetItems(page);
    const consumable = await seedConsumable(page);
    // 아이템 편집기: 사용 효과 줄마다 [효과 사전에서 열기], 아래 [새 효과 만들기]
    await page.goto(`/dev/items?item=${consumable}`);
    await expect(page.locator(".ie-detail-body")).toHaveAttribute("data-item", consumable, {
      timeout: 20_000,
    });
    const use = page.locator('.ie-detail-body [data-section="use"]');
    await expect(use.locator(".fx-dict-create")).toHaveAttribute("href", "/dev/effects?create=1");
    await use.locator('.fx-dict-link[data-effect-link="burn"]').click();
    await expect(page).toHaveURL(/\/dev\/effects\?effect=burn$/);
    await expect(editing(page)).toHaveAttribute("data-effect-entry", "burn", { timeout: 20_000 });
    // 스킬 편집기: 효과 줄마다 같은 고리
    await page.goto("/dev/skills?skill=fire_bolt");
    const effects = page.locator('.sk-editing [data-section="effects"]');
    await expect(effects.locator(".fx-dict-create")).toBeVisible({ timeout: 20_000 });
    await effects.locator('.fx-dict-link[data-effect-link="burn"]').click();
    await expect(page).toHaveURL(/\/dev\/effects\?effect=burn$/);
    await expect(editing(page)).toHaveAttribute("data-effect-entry", "burn", { timeout: 20_000 });
    // [새 효과 만들기]는 새 효과 칸을 연다
    await page.goto("/dev/skills?skill=fire_bolt");
    await page.locator('.sk-editing [data-section="effects"] .fx-dict-create').click();
    await expect(page).toHaveURL(/\/dev\/effects\?create=1$/);
    await expect(page.locator('[data-part="effect-new"]')).toBeVisible({ timeout: 20_000 });
    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });
});

const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = [
  { theme: "neon", language: "ko", width: 1440, height: 900 },
  { theme: "light", language: "ko", width: 1440, height: 900 },
  { theme: "neon", language: "en", width: 390, height: 844 },
];

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("목록·편집 판(상태이상 구역·쓰는 곳)·새 효과 칸: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await effectsReady(page, "/dev/effects?effect=stun");
        await expect(editing(page)).toHaveAttribute("data-effect-entry", "stun");
        await expect(editing(page).locator('[data-section="status"]')).toBeVisible();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const check = async (name: string): Promise<void> => {
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `${name}-${theme}-${language}-${width}`);
        };
        await check("effects");
        if (width < 1000) {
          await editing(page).locator(".fx-back-list").click();
          await expect(entryRow(page, "stun")).toBeVisible();
          await check("effects-list");
        }
        await page.locator(".fx-new-button").click();
        await expect(page.locator('[data-part="effect-new"]')).toBeVisible();
        await check("effects-new");
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
