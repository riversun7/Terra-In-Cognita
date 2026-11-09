// 인벤토리(보유 물건) 화면 시험 — docs/adr/2026-11-03-item-holdings.md "바뀜 (화면)", 기획 D-496·D-501·D-509·D-510·N49.
// - 팩에는 아직 쓰는 물건·신선도 묶음·내구도 장비가 없어서, 시험이 아이템 편집기(tRPC items.save, 그 세계 덮어쓰기)로 시험 물건을 만든다:
//   내구도 40 장검(시험 검 복제), 물약(약, 집중 버프 — 물약 쿨), 스튜(요리, 신선도 + 방어 버프 — 요리 쿨), 연고(회복 = 전투 중만),
//   두 버프는 같은 배타 묶음(D-501 교체 확인). items.spec이 시작할 때 만든 항목을 되돌린다(같은 세계).
// - dev 계정(사이보그 있음): 개발 받기(dev_grant_item) → 목록(수량·내구도·신선도) → 카드 [장착] → 칸 창 [해제] → 칸 창에서 고르기 → 카드
//   [해제] → 물약 [사용](걸린 효과·물약 쿨·버튼 남은 시간) → 연고 실패(battle_only, 전투 밖 회복이 열리면 cooldown) → 원장 물자 not_holdable → 스튜 [사용] → 교체 확인(그만두기·
//   그래도 사용) → 스튜 포장 풀기(D-524: 포장 표·멈춘 신선도 → [포장 풀기] → 낱개 표·상하는 때).
// - 내구도 0(응답을 고쳐 본다): 카드·칸 창의 장착을 막고 "수리 필요".
// - 유닛 상세(세계 유닛 = 구인 카드로 고용한 휴먼): 휴먼 칸 배치 6칸, 그 유닛으로 받기 → 카드 [장착] → 무기 칸.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(인벤토리 판, 머리 판 칸, 칸 고르기 창, 교체 확인 창). 폴더는 E2E_SHOTS_DIR.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { ensureHuman } from "./helpers/wsCommands.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const ID = {
  blade: "e2e_inv_blade",
  tonic: "e2e_inv_tonic",
  stew: "e2e_inv_stew",
  salve: "e2e_inv_salve",
  focus: "e2e_inv_focus",
  guard: "e2e_inv_guard",
  group: "e2e_inv_tonic",
} as const;
/** 원장 물자(보유 물건이 아님 → not_holdable) */
const LEDGER_ITEM = "hay";
const TEN_MINUTES = 600_000;

const get = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("객체가 아닙니다");
  return Object.fromEntries(Object.entries(value));
};

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

/** 소모품 항목(쓰는 효과·중분류는 부르는 쪽이 준다) */
const consumable = (entry: Record<string, unknown>) => ({
  category: "consumable",
  tier: 1,
  startPrice: 5,
  enabled: true,
  ...entry,
});

/** 시험 물건(효과 둘·아이템 넷)을 그 세계 덮어쓰기로 만든다. 이미 있으면 그대로 */
async function ensureTestItems(page: Page): Promise<void> {
  const listed = await trpc(page, "items.list");
  expect(listed.status).toBe(200);
  if (rows(get(listed.data, "items")).some((row) => get(row, "id") === ID.blade)) return;
  const sword = record(get((await trpc(page, "items.get", { id: "test_sword" })).data, "entry"));
  const buff = (id: string, ko: string, en: string, stat: string, valueMode: string) => ({
    id,
    name: { ko, en },
    kind: "buff",
    stat,
    valueMode,
    durationMs: TEN_MINUTES,
    tickMs: 0,
    stacking: "refresh",
    maxStacks: 1,
    exclusive: ID.group,
    enabled: true,
  });
  const entries: { category: string; entry: unknown }[] = [
    { category: "effects", entry: buff(ID.focus, "시험 집중", "Test focus", "attack", "permille") },
    { category: "effects", entry: buff(ID.guard, "시험 방어", "Test guard", "defense_rate", "flat") },
    {
      category: "items",
      entry: {
        ...sword,
        id: ID.blade,
        name: { ko: "시험 장검", en: "Test longsword" },
        equip: { ...record(sword.equip), maxDurability: 40 },
      },
    },
    {
      category: "items",
      entry: consumable({
        id: ID.tonic,
        name: { ko: "시험 물약", en: "Test tonic" },
        subcategory: "medicine",
        use: { effects: [{ effect: ID.focus, value: 100, chancePm: 1000, durationMs: TEN_MINUTES }] },
      }),
    },
    {
      category: "items",
      entry: consumable({
        id: ID.stew,
        name: { ko: "시험 스튜", en: "Test stew" },
        subcategory: "dish",
        perish: { shelfLifeMs: 2 * 86_400_000, spoilsTo: "ration" },
        use: { effects: [{ effect: ID.guard, value: 20, chancePm: 1000, durationMs: TEN_MINUTES }] },
      }),
    },
    {
      category: "items",
      entry: consumable({
        id: ID.salve,
        name: { ko: "시험 연고", en: "Test salve" },
        subcategory: "medicine",
        use: { effects: [{ effect: "mend", value: 200, chancePm: 1000 }] },
      }),
    },
  ];
  const saved = await trpc(
    page,
    "items.save",
    {
      expectedRevision: get(listed.data, "revision"),
      changes: entries.map(({ category, entry }) => ({ op: "put", category, entry, baseHash: null })),
      note: "e2e 인벤토리 시험 물건",
    },
    true,
  );
  expect(saved.status, JSON.stringify(saved.error)).toBe(200);
}

async function cyborgReady(page: Page): Promise<void> {
  await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".holdings")).toBeVisible({ timeout: 15_000 });
}

const inventory = (page: Page): Locator =>
  page.locator(".roster-section").filter({ has: page.locator(".holdings") });
const card = (page: Page, item: string): Locator =>
  page.locator(`.holdings .holding-card[data-item="${item}"]`);
const notice = (page: Page): Locator => page.locator(".holdings .holding-notice");
const weaponTile = (page: Page): Locator =>
  page.locator('.cyborg-slot-group[data-side="gear"] .holding-slot[data-index="0"]');
const sheet = (page: Page): Locator => page.locator("dialog.holdings-sheet");
const confirmDialog = (page: Page): Locator => page.locator("dialog.holdings-confirm");

/**
 * 판 하나 사진. 화면보다 긴 판은 스크롤하며 찍혀서 붙은 위 띠(sticky)·하단 탭(fixed)·건너뛰기 링크가 가운데 겹친다 → 사진 동안만
 * 숨기고 초점을 푼다(economy.spec.ts fullShot과 같은 방법)
 */
async function panelShot(page: Page, locator: Locator, name: string): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const style = await page.addStyleTag({
    content: ".frame-top, .tabbar, .skip-link { visibility: hidden !important; }",
  });
  await elementShot(locator, name);
  await style.evaluate((element) => element.parentNode?.removeChild(element));
}

/** 개발 받기 판으로 아이템을 받는다(접혀 있으면 편다) */
async function grant(page: Page, language: Language, item: string, quantity: number, name: string) {
  const dev = page.locator(".holdings-dev");
  if ((await dev.getAttribute("open")) === null) await dev.locator("summary").click();
  const select = dev.getByLabel(message(language, "holdings_dev_item"));
  await expect(select).toBeVisible({ timeout: 15_000 });
  await select.selectOption(item);
  await dev.getByLabel(message(language, "holdings_dev_quantity")).fill(String(quantity));
  await dev.getByRole("button", { name: message(language, "holdings_dev_submit"), exact: true }).click();
  if (name !== "")
    await expect(notice(page)).toContainText(
      message(language, "holdings_done_grant", { item: name, count: quantity }),
    );
}

test.describe("개발 계정: 받기 → 목록 → 장착·해제 → 사용·쿨 → 교체 확인", () => {
  test.use({ account: "dev" });

  test("흐름(카드·칸 창·걸린 효과·쿨·battle_only·not_holdable·교체 확인)", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);
    await ensureTestItems(page);

    // 받기(dev_grant_item): 장검 1·물약 2·스튜 2·연고 1
    await grant(page, "ko", ID.blade, 1, "시험 장검");
    await grant(page, "ko", ID.tonic, 2, "시험 물약");
    await grant(page, "ko", ID.stew, 2, "시험 스튜");
    await grant(page, "ko", ID.salve, 1, "시험 연고");
    // 원장 물자는 보유 물건이 아니다
    await grant(page, "ko", LEDGER_ITEM, 1, "");
    await expect(notice(page)).toContainText(message("ko", "holdings_error_not_holdable"));

    // 목록: 수량·내구도 막대(40/40)·신선도 막대·점수
    const blade = card(page, ID.blade).first();
    await expect(blade).toBeVisible();
    await expect(blade.locator('.holding-bar[data-kind="durability"]')).toContainText("40");
    await expect(card(page, ID.tonic)).toContainText(message("ko", "holdings_quantity", { count: 2 }));
    await expect(card(page, ID.stew).locator('.holding-bar[data-kind="freshness"]')).toBeVisible();
    await expect(blade).toContainText(
      new RegExp(message("ko", "holdings_score", { percent: "PERCENT" }).replace("PERCENT", "\\d+")),
    );

    // 카드 [장착] → 무기 칸(0)에 들어간다, 착용 표
    await blade.locator('[data-action="equip"]').click();
    await expect(notice(page)).toContainText(message("ko", "holdings_done_equip", { item: "시험 장검" }));
    await expect(weaponTile(page)).toContainText("시험 장검");
    await expect(card(page, ID.blade).first()).toContainText(message("ko", "holdings_equipped"));

    // 칸을 누르면 칸 고르기 창 → [해제] → 창이 닫히고 칸이 빈다
    await weaponTile(page).locator("button").click();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toContainText(
      message("ko", "holdings_slot_title", { slot: message("ko", "roster_slot_weapon") }),
    );
    await sheet(page)
      .getByRole("button", { name: message("ko", "holdings_action_unequip"), exact: true })
      .click();
    await expect(sheet(page)).toBeHidden();
    await expect(notice(page)).toContainText(message("ko", "holdings_done_unequip", { item: "시험 장검" }));
    await expect(weaponTile(page)).toHaveAttribute("data-empty", "true");

    // 칸 창에서 고르기(옛 EquipmentSelectionModal) → 장착, 사진(칸 창 390 파스텔 한국어)
    await weaponTile(page).locator("button").click();
    await expect(sheet(page).locator(".holding-choice")).toHaveCount(1);
    expect(await smallTapTargets(page)).toEqual([]);
    await sheet(page).locator(`.holding-choice`).click();
    await expect(sheet(page)).toBeHidden();
    await expect(weaponTile(page)).toContainText("시험 장검");
    // 카드 [해제]
    await card(page, ID.blade)
      .first()
      .getByRole("button", {
        name: message("ko", "holdings_action_label", {
          action: message("ko", "holdings_action_unequip"),
          item: "시험 장검",
        }),
      })
      .click();
    await expect(weaponTile(page)).toHaveAttribute("data-empty", "true");

    // 물약 [사용] → 걸린 효과(집중, 남은 시간), 물약 쿨, 버튼은 남은 시간을 보이고 막힌다
    await card(page, ID.tonic).locator('[data-action="use"]').click();
    await expect(notice(page)).toContainText(message("ko", "holdings_done_use", { item: "시험 물약" }));
    const focus = page.locator(`.holding-effect[data-effect="${ID.focus}"]`);
    await expect(focus).toContainText("시험 집중");
    await expect(focus.locator(".holding-effect-left")).toContainText(/\d:\d\d/);
    await expect(page.locator('.holding-cooldown[data-kind="potion"]')).toContainText(
      message("ko", "holdings_cooldown_potion"),
    );
    const tonicUse = card(page, ID.tonic).locator('[data-action="use"]');
    await expect(tonicUse).toHaveAttribute("aria-disabled", "true");
    await expect(tonicUse.locator(".holding-wait")).toContainText(/0:[0-3]\d/);
    await expect(card(page, ID.tonic)).not.toContainText(message("ko", "holdings_quantity", { count: 2 }));

    // 연고(회복): 같은 물약 쿨이라 버튼이 막혀 있고(클릭은 쿨이 끝날 때까지 기다린다), 쿨이 끝나면 서버가 판정한다 — 전투 밖 회복이
    // 없던 서버는 battle_only, 전투 밖 회복(D-512)이 열린 서버는 HP가 가득이라 낭비 막기 not_better. 어느 쪽이든 쓰지 않고 실패
    // 문구를 보이며 물건은 그대로다(쿨 중에 보내면 cooldown)
    await card(page, ID.salve).locator('[data-action="use"]').click();
    const coolPrefix = message("ko", "holdings_error_cooldown", { time: "TIME" }).split("TIME")[0] ?? "";
    await expect(notice(page).locator(".message-error")).toContainText(
      new RegExp(
        `${message("ko", "holdings_error_battle_only")}|${message("ko", "holdings_error_not_better")}|${coolPrefix.trim()}`,
      ),
    );
    await expect(card(page, ID.salve)).toBeVisible();

    // 스튜(요리 쿨은 따로): 같은 묶음의 다른 효과 → 교체 확인(D-501). 그만두기 → 그대로
    const stewUse = card(page, ID.stew).locator('[data-action="use"]');
    await stewUse.click();
    await expect(confirmDialog(page)).toBeVisible();
    await expect(confirmDialog(page)).toContainText(message("ko", "holdings_replace_title"));
    await expect(confirmDialog(page).locator(`[data-effect="${ID.focus}"]`)).toContainText("시험 집중");
    await elementShot(
      confirmDialog(page).locator(".holdings-dialog-panel"),
      "inventory-confirm-390-pastel-ko",
    );
    await confirmDialog(page)
      .getByRole("button", { name: message("ko", "holdings_replace_cancel"), exact: true })
      .click();
    await expect(confirmDialog(page)).toBeHidden();
    await expect(focus).toBeVisible();
    await expect(card(page, ID.stew)).toContainText(message("ko", "holdings_quantity", { count: 2 }));
    // 그래도 사용 → 방어로 바뀌고 집중은 사라진다, 요리 쿨도 돈다
    await stewUse.click();
    await confirmDialog(page)
      .getByRole("button", { name: message("ko", "holdings_replace_confirm"), exact: true })
      .click();
    await expect(notice(page)).toContainText(message("ko", "holdings_done_use", { item: "시험 스튜" }));
    await expect(page.locator(`.holding-effect[data-effect="${ID.guard}"]`)).toContainText("시험 방어");
    await expect(focus).toHaveCount(0);
    await expect(page.locator('.holding-cooldown[data-kind="food"]')).toBeVisible();
    await expect(stewUse).toHaveAttribute("aria-disabled", "true");

    // 식품 포장(D-524): 남은 스튜 하나는 포장 칸(포장 표·멈춘 신선도, 상하는 때 없음) → [포장 풀기] → 낱개(낱개 표·상하는 때)
    const stew = card(page, ID.stew);
    await expect(stew).toHaveAttribute("data-packed", "true");
    await expect(stew.locator(".holding-pack")).toHaveText(message("ko", "holdings_packed"));
    await expect(stew).toContainText(message("ko", "holdings_packed_note"));
    const spoilsText = new RegExp(message("ko", "holdings_spoils", { time: "TIME" }).replace("TIME", ".+"));
    await expect(stew).not.toContainText(spoilsText);
    await stew.locator('[data-action="unpack"]').click();
    await expect(notice(page)).toContainText(message("ko", "holdings_done_unpack", { item: "시험 스튜" }));
    await expect(card(page, ID.stew)).toHaveAttribute("data-packed", "false");
    await expect(card(page, ID.stew).locator(".holding-pack")).toHaveText(message("ko", "holdings_unpacked"));
    await expect(card(page, ID.stew).locator('[data-action="unpack"]')).toHaveCount(0);
    await expect(card(page, ID.stew)).toContainText(spoilsText);
    await expect(card(page, ID.stew)).not.toContainText(message("ko", "holdings_packed_note"));

    // 걸러 보기: 장비만 → 장검 카드만
    await inventory(page)
      .getByRole("button", { name: message("ko", "holdings_filter_equipment"), exact: true })
      .click();
    await expect(page.locator(".holdings .holding-card")).toHaveCount(await card(page, ID.blade).count());
    await inventory(page)
      .getByRole("button", { name: message("ko", "holdings_filter_all"), exact: true })
      .click();

    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("내구도 0이면 카드·칸 창이 장착을 막고 수리 필요를 보인다(응답을 고쳐 본다)", async ({
    page,
    deviceErrors,
  }) => {
    await page.goto("/cyborg");
    await cyborgReady(page);
    await ensureTestItems(page);
    if ((await card(page, ID.blade).count()) === 0) await grant(page, "ko", ID.blade, 1, "시험 장검");
    // 서버는 내구도 0인 물건을 벗기고(N49) 입히지 않는다(broken). 화면만 보려고 목록 응답의 장검을 0·든 상태로 고친다
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "holdings.list": (data) => {
        for (const row of rows(get(data, "holdings")))
          if (get(row, "item") === ID.blade && typeof row === "object" && row !== null) {
            Reflect.set(row, "durability", 0);
            Reflect.set(row, "slot", null);
          }
      },
    });
    await page.reload();
    await cyborgReady(page);
    const blade = card(page, ID.blade).first();
    await expect(blade).toHaveAttribute("data-broken", "true");
    await expect(blade).toContainText(message("ko", "holdings_broken"));
    await expect(blade.locator('[data-action="equip"]')).toHaveAttribute("aria-disabled", "true");
    await weaponTile(page).locator("button").click();
    await expect(sheet(page).locator(".holding-choice").first()).toHaveAttribute("aria-disabled", "true");
    await sheet(page)
      .getByRole("button", { name: message("ko", "holdings_close"), exact: true })
      .click();
    await expect(sheet(page)).toBeHidden();
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("개발 계정: 유닛 상세(세계 유닛)의 장비·지닌 물건", () => {
  test.use({ account: "dev" });

  test("고용한 휴먼에게 받아 상세 카드에서 장착하면 휴먼 칸 배치의 무기 칸에 들어간다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await cyborgReady(page);
    await ensureTestItems(page);
    // 세계 유닛: 내 휴먼(없으면 구인 카드로 고용, 모자란 시험 화폐는 운영자 지급 — 시험 일꾼은 없앴다)
    await ensureHuman(page, "e2e_dev");
    await page.goto("/units");
    await expect(page.locator(".units-panel .status")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator(".units-row .units-row-main").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".units-row .units-row-main").first().click();
    const detail = page.locator(".units-detail");
    await expect(detail.locator(".roster-section-title")).toContainText([
      message("ko", "holdings_unit_title"),
    ]);
    // 휴먼 칸 배치(무기·보조·머리·몸·장신구 둘)
    await expect(detail.locator(".holding-slot")).toHaveCount(6);
    await grant(page, "ko", ID.blade, 1, "시험 장검");
    const blade = detail.locator(`.holding-card[data-item="${ID.blade}"]`).first();
    await blade.locator('[data-action="equip"]').click();
    await expect(notice(page)).toContainText(message("ko", "holdings_done_equip", { item: "시험 장검" }));
    await expect(detail.locator('.holding-slot[data-index="0"]')).toContainText("시험 장검");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await panelShot(
      page,
      detail.locator(".roster-section").filter({ has: page.locator(".holdings") }),
      "inventory-unit-390-pastel-ko",
    );
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
      test.use({ ...VIEWPORTS[viewport], account: "dev", theme, language });

      test(`인벤토리·칸·창 (${String(width)} ${theme} ${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(90_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/cyborg");
        await cyborgReady(page);
        await ensureTestItems(page);
        const bladeName = language === "ko" ? "시험 장검" : "Test longsword";
        if ((await card(page, ID.tonic).count()) === 0)
          await grant(page, language, ID.tonic, 2, language === "ko" ? "시험 물약" : "Test tonic");
        // 식품 포장 칸(D-524 포장 표·[포장 풀기])도 사진에 보이게
        if (
          (await page
            .locator(`.holdings .holding-card[data-item="${ID.stew}"][data-packed="true"]`)
            .count()) === 0
        )
          await grant(page, language, ID.stew, 2, language === "ko" ? "시험 스튜" : "Test stew");
        // 사진에 장착한 칸(내구도)과 칸 창의 두 판(지금 장착·고를 거리)이 보이게: 장검 둘, 하나는 무기 칸에
        const blades = await card(page, ID.blade).count();
        if (blades < 2) await grant(page, language, ID.blade, 2 - blades, bladeName);
        if ((await weaponTile(page).getAttribute("data-empty")) === "true") {
          await card(page, ID.blade).first().locator('[data-action="equip"]').click();
          await expect(weaponTile(page)).toContainText(bladeName);
        }
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        const name = `${String(width)}-${theme}-${language}`;
        await panelShot(page, inventory(page), `inventory-panel-${name}`);
        await panelShot(page, page.locator(".cyborg-profile"), `inventory-slots-${name}`);
        // 칸 고르기 창
        await weaponTile(page).locator("button").click();
        await expect(sheet(page)).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        await elementShot(sheet(page).locator(".holdings-dialog-panel"), `inventory-sheet-${name}`);
        await page.keyboard.press("Escape");
        await expect(sheet(page)).toBeHidden();
        // 교체 확인 창: 물약 쿨이 끝나면 물약(집중)을 써 본다 — 방어가 걸려 있으면 창이 뜨고, 그만둔다(쓰지 않음)
        const use = card(page, ID.tonic).locator('[data-action="use"]');
        await expect(use).not.toHaveAttribute("aria-disabled", "true", { timeout: 40_000 });
        if ((await page.locator(`.holding-effect[data-effect="${ID.guard}"]`).count()) > 0) {
          await use.click();
          await expect(confirmDialog(page)).toBeVisible();
          await elementShot(
            confirmDialog(page).locator(".holdings-dialog-panel"),
            `inventory-confirm-${name}`,
          );
          await confirmDialog(page)
            .getByRole("button", { name: message(language, "holdings_replace_cancel"), exact: true })
            .click();
          await expect(confirmDialog(page)).toBeHidden();
        }
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
