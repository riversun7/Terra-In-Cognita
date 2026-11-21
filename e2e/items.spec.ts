// 아이템 편집기 화면 시험 — /dev/items (docs/adr/2026-11-01-item-editor.md, 설계안 3장).
// - dev: 시험 검을 복제해 공격력을 고치고 켠 뒤 [적용]하면 그 세계에 바로 든다(목록·items.get·전투 실험실 무기 목록). 서버 미리 보기가
//   실효 계산식 값을 보인다. 만든 항목을 지우면 목록에서 빠진다. 저장을 막는 문제(공격 칸 없음)는 막대가 막고 칸 아래·옆 판에 보인다.
//   두 탭이 같은 아이템을 고치면 뒤에 적용한 탭이 내 칸만 새 항목 위에 다시 얹고(다른 칸), 같은 칸이면 고르는 판을 보인다.
//   효과 사전은 따로 화면이다(e2e/effects.spec.ts). 소모품 효과량(D-501): 비례 스탯·적정 스탯·오차
//   → 미리 보기 범위(기준 × min(상한, 스탯 ÷ 적정) ± 오차).
//   대량 도구(WP-7): CSV 가져오기의 틀린 줄은 줄 번호로, 고친 줄·새 줄은 담아 적용. 크리쳐 전용 장비(D-494): 미리 보기·전투 실험실.
// - player: 권한 없음 화면, tRPC items.*는 403.
// - 화면 개편(2026-11-08): 칸마다 팩 값·지금 값 견주기와 [되돌리기], 찾기("/")·목록 키(↓·Enter)·Alt+↓ 다음 아이템·Ctrl+S 적용.
// - 분류(2026-11-09): [아이템] 탭 대분류 타일 → 대분류 › 중분류 › 장비 종류 거르기·목록/격자·줄 빠른 동작([복제]),
//   [아이템 분류] 탭 타일 → 나무(대분류 → 중분류 → 장비 종류) → 고른 마디의 칸·든 아이템, 태그 판은 나무 밖, 장비 종류 새로 만들기.
//   D-497 정리 895~897(2026-11-10, core@60): 이름 "장비 종류"·"보조 장비", 장비 종류의 상위 중분류 칸(나무가 그 칸을 따른다), 중분류 채움.
// - 사진: 390·1440 × 개발 화면 테마 네온·라이트 × 한국어·영어, 보이는 화면 크기(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui). 소모품 효과량 칸·
//   미리 보기 판도 같은 조합으로 찍는다. 옛 자원(295·D-505): 광석·목축 부산물 거르기 목록, 시작 시세 칸·지금 세계 시세(시세 없음).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 아이템 편집기 분류의 덮어쓰기를 모두 지운다.
import type { Page } from "@playwright/test";
import { clickSlider, dragSlider } from "./helpers/inputs.ts";
import { message } from "./helpers/messages.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
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
): Promise<{ status: number; data: unknown; code: unknown; reason: unknown }> {
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
      const data = get(get(json, "error"), "data");
      return {
        status: response.status,
        data: get(get(json, "result"), "data"),
        code: get(data, "code"),
        reason: get(data, "reason"),
      };
    },
    { procedure, input, mutation },
  );
}

/** 아이템·중분류·태그·무기 종류·효과 덮어쓰기를 모두 지운다(만든 항목은 지워지고 ID가 은퇴한다) */
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

async function editorReady(page: Page, path = "/dev/items"): Promise<void> {
  await page.goto(path);
  await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

const row = (page: Page, id: string) => page.locator(`.ie-item[data-item="${id}"]`);
const detail = (page: Page) => page.locator(".ie-detail-body");
const editing = (page: Page) => page.locator(".ie-editing");
const bar = (page: Page) => page.locator(".ie-stagebar");

/** 목록에서 고르고 편집 칸이 뜰 때까지 기다린다 */
/** 휴대폰 폭(기본 390px)에서는 편집 칸을 열면 목록이 숨는다: 목록으로 돌아간다 */
async function toList(page: Page): Promise<void> {
  const back = page.locator(".ie-back-list");
  if (await back.isVisible()) await back.click();
}

async function open(page: Page, id: string): Promise<void> {
  await toList(page);
  await row(page, id).click();
  await expect(detail(page)).toHaveAttribute("data-item", id);
  await expect(editing(page)).toBeVisible();
}

/** 검사가 끝나 [적용]을 누를 수 있을 때까지 기다린 뒤 적용한다 */
async function apply(page: Page, note?: string): Promise<void> {
  await expect(bar(page)).toHaveAttribute("data-check", "ok", { timeout: 15_000 });
  if (note !== undefined) await bar(page).locator(".ie-note").fill(note);
  await bar(page).locator(".ie-apply").click();
  await expect(bar(page)).toHaveAttribute("data-count", "0", { timeout: 15_000 });
}

/**
 * 시험 소모품 초안: 연 아이템(배급 식량)을 복제하고 회복(mend) 효과 줄 하나에 기준 값·비례 스탯 VIT·적정 스탯을 적는다(D-501).
 * 미리 보기 효과량 줄과 고칠 칸을 돌려준다
 */
async function consumableDraft(page: Page, language: Language, value: number, appropriate: number) {
  await editing(page).locator(".ie-duplicate").click();
  const use = detail(page).locator('[data-section="use"]');
  await use.getByRole("button", { name: message(language, "dev_content_add_effect"), exact: true }).click();
  const line = use.locator(".ce-effect-row").first();
  await line.getByLabel(message(language, "dev_content_field_effect"), { exact: true }).selectOption("mend");
  const magnitude = line.getByLabel(message(language, "dev_content_field_magnitude"), { exact: true });
  await magnitude.fill(String(value));
  const scale = use.locator('[data-part="use-scale"]');
  await scale
    .getByLabel(message(language, "dev_items_field_scale_stat"), { exact: true })
    .selectOption("vit");
  const appropriateField = scale.getByLabel(message(language, "dev_items_field_scale_appropriate"), {
    exact: true,
  });
  await appropriateField.fill(String(appropriate));
  return {
    use,
    magnitude,
    appropriate: appropriateField,
    variance: scale.getByLabel(message(language, "dev_items_field_variance"), { exact: true }),
    amount: detail(page).locator('.ie-preview [data-part="use"] [data-part="amount"]'),
  };
}

/** 효과량 줄 문구(VIT 비례, 상한 = 설정 칸 N10 1000‰, D-502) */
const amountLine = (
  language: Language,
  value: number,
  appropriate: number,
  ratio: number,
  scaled: number,
  variance: number,
  min: number,
  max: number,
) =>
  message(language, "dev_items_preview_amount", {
    stat: message(language, "roster_stat_vit_code"),
    value,
    appropriate,
    ratio,
    cap: 1000,
    scaled,
    variance,
    min,
    max,
  });

const koAmount = (...args: [number, number, number, number, number, number, number]) =>
  amountLine("ko", ...args);

/** 시험이 일부러 받는 거절(같은 항목을 먼저 바꿈 400·권한 없음 403)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[], status: 400 | 403) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        error.text.includes(`status of ${status}`) &&
        error.text.includes("/api/trpc/items.")
      ),
  );

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("시험 검을 복제해 공격력을 고치고 켜서 적용하면 바로 든다(목록·전투 실험실), 미리 보기는 실효 식, 지우면 빠진다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    const before = await page.locator(".ie-screen").getAttribute("data-revision");
    await open(page, "test_sword");
    await editing(page).locator(".ie-duplicate").click();
    const copy = (await detail(page).getAttribute("data-item")) ?? "";
    expect(copy).toMatch(/^test_sword_copy\d*$/);
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    await detail(page)
      .locator('[data-part="weapon-physical"]')
      .getByLabel(message("ko", "dev_items_field_attack"), { exact: true })
      .fill("33");
    await editing(page).getByLabel(message("ko", "dev_items_field_enabled"), { exact: true }).check();
    // 서버가 그 세계의 실효 계산식으로 셈한 무기 값
    await expect(detail(page).locator('.ie-preview [data-part="weapon"]')).toContainText(
      message("ko", "dev_items_formula_real_attack"),
      { timeout: 15_000 },
    );
    await apply(page, "e2e 아이템 시험");
    await expect(page.locator(".ie-screen")).not.toHaveAttribute("data-revision", before ?? "");
    await toList(page);
    await expect(row(page, copy).locator(".ie-origin-created")).toBeVisible();
    // 서버 실효 항목에 바로 든다(다시 켜지 않음): 아이템 편집기·전투 실험실 무기 목록
    const got = await trpc(page, "items.get", { id: copy });
    const entry = field(got.data, "entry");
    expect(field(field(field(field(entry, "equip"), "weapon"), "physical"), "attack")).toBe(33);
    expect(field(entry, "enabled")).toBe(true);
    expect(field(field(got.data, "override"), "note")).toBe("e2e 아이템 시험");
    const lab = await trpc(page, "battleLab.catalog");
    const weapon = list(field(lab.data, "weapons")).find((item) => field(item, "id") === copy);
    expect(field(field(weapon, "physical"), "attack")).toBe(33);

    // 지우기(확인) → 담김 → 적용하면 목록에서 빠진다
    await open(page, copy);
    await editing(page).locator(".ie-revert").click();
    await editing(page).locator(".ie-confirm-yes").click();
    await expect(editing(page)).toContainText(message("ko", "dev_items_delete_staged_note"));
    await apply(page);
    await expect(row(page, copy)).toHaveCount(0);
    await expect(page.locator(".ie-changed").first()).toHaveAttribute("data-count", "0");
    expect(deviceErrors).toEqual([]);
  });

  test("저장을 막는 문제(무기 공격 칸 없음)는 막대가 막고 칸 옆 판에 보인다. 되돌리기·다시하기·비우기", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await open(page, "test_staff");
    await editing(page).locator(".ie-duplicate").click();
    const copy = (await detail(page).getAttribute("data-item")) ?? "";
    const physical = detail(page).locator('[data-part="weapon-physical"]');
    const elemental = detail(page).locator('[data-part="weapon-elemental"]');
    // 지팡이는 속성 칸만 쓴다 → 끄면 공격 칸이 하나도 없다
    await elemental.getByLabel(message("ko", "dev_items_attack_field_on"), { exact: true }).uncheck();
    await expect(
      physical.getByLabel(message("ko", "dev_items_attack_field_on"), { exact: true }),
    ).not.toBeChecked();
    await expect(bar(page)).toHaveAttribute("data-check", "blocked", { timeout: 15_000 });
    await expect(bar(page).locator(".ie-apply")).toHaveAttribute("aria-disabled", "true");
    await expect(detail(page).locator(".ie-side .ie-errors")).toContainText(
      message("ko", "dev_items_issue_weapon_field_missing"),
    );
    // 되돌리기 → 공격 칸이 돌아오고 검사가 통과한다. 다시하기 → 다시 막힌다
    await bar(page)
      .getByRole("button", { name: message("ko", "dev_items_undo"), exact: true })
      .click();
    await expect(
      elemental.getByLabel(message("ko", "dev_items_attack_field_on"), { exact: true }),
    ).toBeChecked();
    await expect(bar(page)).toHaveAttribute("data-check", "ok", { timeout: 15_000 });
    await bar(page)
      .getByRole("button", { name: message("ko", "dev_items_redo"), exact: true })
      .click();
    await expect(bar(page)).toHaveAttribute("data-check", "blocked", { timeout: 15_000 });
    // 비우기(확인) → 담은 것이 없고 새 항목도 사라진다
    await bar(page).locator(".ie-clear").click();
    await bar(page)
      .getByRole("button", { name: message("ko", "dev_content_confirm_yes"), exact: true })
      .click();
    await expect(bar(page)).toHaveAttribute("data-count", "0");
    await expect(row(page, copy)).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("두 탭이 같은 아이템을 고치면: 다른 칸은 내 칸만 다시 얹어 적용하고, 같은 칸은 고르는 판을 보인다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    const other = await page.context().newPage();
    await editorReady(page);
    await editorReady(other);
    await open(page, "iron_ore");
    await open(other, "iron_ore");
    // 탭 A: 티어를 먼저 적용
    await editing(page).getByLabel(message("ko", "dev_items_field_tier"), { exact: true }).fill("2");
    await apply(page);
    // 탭 B: 옛 해시로 시작 시세 → 검사가 entry_changed → 티어 2 위에 시작 시세만 바로 다시 얹는다 → 적용
    await editing(other).getByLabel(message("ko", "dev_items_field_start_price"), { exact: true }).fill("9");
    await expect(other.locator(".ie-screen [role='alert']").first()).toContainText(
      message("ko", "dev_items_err_entry_changed"),
      { timeout: 15_000 },
    );
    await expect(bar(other)).toHaveAttribute("data-count", "1");
    await expect(
      editing(other).getByLabel(message("ko", "dev_items_field_tier"), { exact: true }),
    ).toHaveValue("2");
    await apply(other);
    const merged = await trpc(page, "items.get", { id: "iron_ore" });
    expect([
      field(field(merged.data, "entry"), "tier"),
      field(field(merged.data, "entry"), "startPrice"),
    ]).toEqual([2, 9]);

    // 같은 칸(티어): A가 3으로 적용한 뒤 B가 4로 → 고르는 판, [서버 값 쓰기]면 3
    await page.reload();
    await other.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await expect(other.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await open(page, "iron_ore");
    await open(other, "iron_ore");
    await editing(page).getByLabel(message("ko", "dev_items_field_tier"), { exact: true }).fill("3");
    await apply(page);
    await editing(other).getByLabel(message("ko", "dev_items_field_tier"), { exact: true }).fill("4");
    const conflict = editing(other).locator(".ie-conflict");
    await expect(conflict).toContainText("tier", { timeout: 15_000 });
    // 충돌 칸을 고르기 전에는 적용하지 못한다
    await expect(bar(other).locator(".ie-apply")).toHaveAttribute("aria-disabled", "true");
    await conflict
      .getByRole("button", { name: message("ko", "dev_items_conflict_take"), exact: true })
      .click();
    await expect(conflict).toHaveCount(0);
    await expect(
      editing(other).getByLabel(message("ko", "dev_items_field_tier"), { exact: true }),
    ).toHaveValue("3");
    // 서버 값을 골라 실효 값과 같아졌으니 담김에서 빠진다
    await expect(bar(other)).toHaveAttribute("data-count", "0");
    await other.close();
    await resetItems(page);
    expect(unexpected(deviceErrors, 400)).toEqual([]);
  });

  test("무기 1차 적정 스탯(D-502·D-539): 검(공격력 20·적정 STR 25·DEX 12·AGI 12)의 미리 보기 = 15 + 8 = 23, 몫마다 비율, 적정을 비우면 100%", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await open(page, "test_sword");
    await editing(page).locator(".ie-duplicate").click();
    const weapon = detail(page).locator('.ie-preview [data-part="weapon"]');
    const efficiency = weapon.locator('[data-part="efficiency"]');
    // 기준 유닛(1차 모두 10): STR 10 ÷ 25 = 40%, DEX 10 ÷ 12 = 83.3%, AGI 10 ÷ 12 = 83.3%
    await expect(efficiency.locator('tr[data-row="physical"]')).toContainText("40%", { timeout: 15_000 });
    await expect(efficiency.locator('tr[data-row="hit"]')).toContainText("83.3%");
    await expect(efficiency.locator('tr[data-row="speed"]')).toContainText("83.3%");
    const attackRow = weapon
      .locator('table[data-field="physical"] tr')
      .filter({ hasText: message("ko", "dev_items_formula_real_attack") });
    // 실제 공격력 = 스탯 공격력(STR + ⌊VIT ÷ 2⌋ = 10 + 5 = 15, D-539) + ⌊20 × 0.4⌋ = 8 → 23 (계산식 real_attack)
    await expect(attackRow).toContainText("23");
    // 적정 STR 칸 아래에 기준 유닛 비율이 보인다
    const physical = detail(page).locator('[data-part="weapon-physical"]');
    await expect(physical).toContainText(
      message("ko", "dev_items_part_ratio_hint", { stat: "STR", value: 10, ratio: "40%" }),
    );
    // 적정 STR을 비우면 그 몫은 100% → 15 + 20 = 35
    await physical.getByLabel(message("ko", "dev_items_field_appropriate_str"), { exact: true }).fill("");
    await expect(efficiency.locator('tr[data-row="physical"]')).toContainText("100%", { timeout: 15_000 });
    await expect(attackRow).toContainText("35");
    await bar(page).locator(".ie-clear").click();
    await bar(page)
      .getByRole("button", { name: message("ko", "dev_content_confirm_yes"), exact: true })
      .click();
    await expect(bar(page)).toHaveAttribute("data-count", "0");
    expect(deviceErrors).toEqual([]);
  });

  test("소모품 효과량(D-501): 효과 줄에 비례 스탯·적정 스탯·오차를 적으면 미리 보기가 기준 × min(상한, 스탯 ÷ 적정) ± 오차를 셈한다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await open(page, "ration");
    const draft = await consumableDraft(page, "ko", 30, 10);
    // 기준 유닛(1차 모두 10): VIT 10 = 적정 10 → 1000‰ → 30, 설정 칸 d496_use_variance 기본 ±500‰ → 15~45(사용자 예)
    await expect(draft.amount).toHaveText(koAmount(10, 10, 1000, 30, 500, 15, 45), { timeout: 15_000 });
    // 기준 50·100도 적정 스탯에서 ±50% → 25~75·50~150
    await draft.magnitude.fill("50");
    await expect(draft.amount).toHaveText(koAmount(10, 10, 1000, 50, 500, 25, 75), { timeout: 15_000 });
    await draft.magnitude.fill("100");
    await expect(draft.amount).toHaveText(koAmount(10, 10, 1000, 100, 500, 50, 150), { timeout: 15_000 });
    // 적정 스탯 40인 기준 50 물약: VIT 10이면 250‰ → 12(6~18) — 적정 10인 기준 30(15~45)이 더 낫다
    await draft.magnitude.fill("50");
    await draft.appropriate.fill("40");
    await expect(draft.amount).toHaveText(koAmount(10, 40, 250, 12, 500, 6, 18), { timeout: 15_000 });
    // VIT 39: 39 ÷ 40 → 975‰ → 48(24~72)
    const preview = detail(page).locator(".ie-preview");
    await preview.locator(".ie-unit > summary").click();
    await preview.getByLabel(message("ko", "roster_stat_vit_code"), { exact: true }).fill("39");
    await expect(draft.amount).toHaveText(koAmount(39, 40, 975, 48, 500, 24, 72), { timeout: 15_000 });
    // 적정 10이면 상한 1000‰(무기 몫과 같은 설정 칸 N10, 사용자 답 299: 적정 이상이면 기준 ±50%) → 50(25~75), 줄 오차 ±250‰ → 37~62
    await draft.appropriate.fill("10");
    await expect(draft.amount).toHaveText(koAmount(39, 10, 1000, 50, 500, 25, 75), { timeout: 15_000 });
    await draft.variance.fill("250");
    await expect(draft.amount).toHaveText(koAmount(39, 10, 1000, 50, 250, 37, 62), { timeout: 15_000 });
    await bar(page).locator(".ie-clear").click();
    await bar(page)
      .getByRole("button", { name: message("ko", "dev_content_confirm_yes"), exact: true })
      .click();
    await expect(bar(page)).toHaveAttribute("data-count", "0");
    expect(deviceErrors).toEqual([]);
  });

  test("대량 도구(WP-7): CSV 가져오기는 틀린 줄을 줄 번호로 보이고, 고친 줄·새 줄을 담아 [적용]한다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await page.getByRole("tab", { name: message("ko", "dev_items_tab_bulk"), exact: true }).click();
    const part = page.locator('[data-part="bulk-import"]');
    const text = part.getByLabel(message("ko", "dev_items_bulk_paste"), { exact: true });
    const read = part.getByRole("button", { name: message("ko", "dev_items_bulk_read"), exact: true });
    await text.fill("id,tier\niron_ore,x\n");
    await read.click();
    await expect(part.locator('[data-part="bulk-problems"]')).toContainText(
      message("ko", "dev_items_bulk_row", {
        row: 2,
        text: `${message("ko", "dev_items_bulk_err_not_int")} (tier · x)`,
      }),
    );
    // 옛 열 이름 baseValue(팩 core@27까지)도 시작 시세로 읽는다(295)
    await text.fill(
      "id,category,tier,baseValue,name.ko,name.en\niron_ore,,4,,,\ne2e_bulk_ore,raw,1,5,시험 광석,Test ore\n",
    );
    await read.click();
    await expect(part.locator('[data-part="bulk-diff"]')).toHaveText(
      message("ko", "dev_items_bulk_diff", { added: 1, changed: 1, same: 0 }),
    );
    await part
      .getByRole("button", { name: message("ko", "dev_items_bulk_stage", { count: 2 }), exact: true })
      .click();
    await expect(bar(page)).toHaveAttribute("data-count", "2");
    await apply(page, "e2e 대량 가져오기");
    const ore = await trpc(page, "items.get", { id: "iron_ore" });
    // 철광석은 팩 core@29부터 T3(D-506)이라 4로 고쳐 본다
    expect(field(field(ore.data, "entry"), "tier")).toBe(4);
    const created = field((await trpc(page, "items.get", { id: "e2e_bulk_ore" })).data, "entry");
    // 새 줄은 꺼진 채로 만든다(덜 만든 아이템이 세계에 나오지 않게)
    expect([
      field(created, "enabled"),
      field(field(created, "name"), "en"),
      field(created, "startPrice"),
    ]).toEqual([false, "Test ore", 5]);
    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });

  test("크리쳐 전용 장비(D-494): 입을 종류를 크리쳐로만 두면 다른 종류는 입히지 않고 셈하고, 전투 실험실도 크리쳐에만 입힌다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    const listed = await trpc(page, "items.list");
    const creature = String(field(field(byId(field(listed.data, "unitKinds"), "creature"), "name"), "ko"));
    await open(page, "test_vest");
    await editing(page).locator(".ie-duplicate").click();
    const copy = (await detail(page).getAttribute("data-item")) ?? "";
    await detail(page).locator('[data-section="equip"]').getByLabel(creature, { exact: true }).check();
    await editing(page).getByLabel(message("ko", "dev_items_field_enabled"), { exact: true }).check();
    const preview = detail(page).locator(".ie-preview");
    const notWearable = message("ko", "dev_items_preview_not_wearable");
    // 기준 유닛(사이보그)은 입을 수 없다 → 입히지 않고 셈한다. 크리쳐로 바꾸면 입는다
    await expect(preview.locator('[data-part="equip"]')).toContainText(notWearable, { timeout: 15_000 });
    await preview.locator(".ie-unit > summary").click();
    await preview
      .getByLabel(message("ko", "dev_items_preview_kind"), { exact: true })
      .selectOption("creature");
    await expect(preview.locator('[data-part="equip"]')).not.toContainText(notWearable, { timeout: 15_000 });
    await apply(page, "e2e 크리쳐 전용 방어구");
    // 전투 실험실 샘플: 늑대(크리쳐) 방어구 칸(1)에 입히면 그대로, 마법사(휴먼) 방어구 칸(3)이면 빠진다(unit_kind)
    const presets = field((await trpc(page, "battleLab.presets")).data, "presets");
    const wolf = record(field(byId(presets, "sample_creature_wolf"), "data"));
    const mage = record(field(byId(presets, "sample_lv30_mage_fire"), "data"));
    const wolfView = await trpc(page, "battleLab.preview", {
      ...wolf,
      equipment: [
        { slot: 1, item: copy, pm: 500 },
        { slot: 2, item: "test_ring", pm: 0 },
      ],
    });
    expect([wolfView.status, list(field(wolfView.data, "dropped"))]).toEqual([200, []]);
    const mageView = await trpc(page, "battleLab.preview", {
      ...mage,
      equipment: [{ slot: 3, item: copy, pm: 500 }],
    });
    expect(list(field(mageView.data, "dropped"))).toEqual([{ kind: "unit_kind", id: copy }]);
    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });
});

// 넓은 폭(데스크톱): 목록과 편집 판이 함께 보인다(찾기 칸이 늘 보임)
test.describe("화면 개편(넓은 폭)", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("화면 개편: 칸을 고치면 담음·팩 값이 보이고 [되돌리기]로 지금 값, 찾기·목록 키·Alt+↓·Ctrl+S로 적용한다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    // "/" → 찾기, 낱말 둘(대분류 ID + 이름 조각) → ↓ 첫 줄 → Enter 열기
    await page.locator("body").press("/");
    const search = page.getByRole("searchbox", { name: message("ko", "dev_content_search_label") });
    await expect(search).toBeFocused();
    await search.fill("raw iron_o");
    await expect(page.locator(".ie-item")).toHaveCount(1);
    await search.press("ArrowDown");
    await expect(row(page, "iron_ore")).toBeFocused();
    await row(page, "iron_ore").press("Enter");
    await expect(detail(page)).toHaveAttribute("data-item", "iron_ore");
    // 티어를 고치면 그 칸에 담음 표지·팩 값, 구역 머리에 담은 칸 수
    const tier = editing(page).getByLabel(message("ko", "dev_items_field_tier"), { exact: true });
    const original = await tier.inputValue();
    await tier.fill(String(Number(original) + 1));
    const tierField = editing(page)
      .locator(".ce-field")
      .filter({ has: page.getByLabel(message("ko", "dev_items_field_tier"), { exact: true }) });
    await expect(tierField).toHaveAttribute("data-staged", "");
    await expect(tierField.locator('[data-part="pack"]')).toContainText(original);
    await expect(detail(page).locator('[data-section="value"] .ce-badge-staged').first()).toBeVisible();
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    // 범위 밖 값은 칸 옆에 까닭(값은 바뀌지 않는다)
    await tier.fill("99");
    await expect(tierField).toHaveAttribute("data-invalid", "");
    await expect(tierField).toContainText(
      message("ko", "dev_content_value_out_of_range", { range: "0 ~ 9" }),
    );
    await tier.fill(String(Number(original) + 1));
    // [되돌리기] → 지금 값, 담음이 빠진다
    await tierField
      .getByRole("button", {
        name: message("ko", "dev_content_field_undo_named", { name: message("ko", "dev_items_field_tier") }),
      })
      .click();
    await expect(tier).toHaveValue(original);
    await expect(tierField).not.toHaveAttribute("data-staged", "");
    await expect(bar(page)).toHaveAttribute("data-count", "0");
    // Alt+↓: 보이는 차례의 다음 아이템(찾기를 지우면 전체 목록)
    await search.fill("");
    // 찾는 글은 늦춰 거른다: 전체 목록이 다시 그려진 뒤 다음 아이템으로
    await expect(page.locator(".ie-item")).not.toHaveCount(1);
    await page.locator("body").press("Alt+ArrowDown");
    await expect(detail(page)).not.toHaveAttribute("data-item", "iron_ore");
    // 다시 고쳐 Ctrl+S로 적용
    await page.locator("body").press("Alt+ArrowUp");
    await expect(detail(page)).toHaveAttribute("data-item", "iron_ore");
    await tier.fill(String(Number(original) + 1));
    await expect(bar(page)).toHaveAttribute("data-check", "ok", { timeout: 15_000 });
    await page.locator("body").press("Control+s");
    await expect(bar(page)).toHaveAttribute("data-count", "0", { timeout: 15_000 });
    const got = await trpc(page, "items.get", { id: "iron_ore" });
    expect(field(field(got.data, "entry"), "tier")).toBe(Number(original) + 1);
    // 적용 뒤에는 그 칸이 팩과 다르다(덮어씀)
    await expect(tierField).toHaveAttribute("data-changed", "");
    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });

  test("수 조작 칸: 막대 끌기·[−] 단추·↑↓ 키로 고치면 바로 담기고, 팩 값 눈금·Ctrl+Z로 되돌린다(docs/adr/2026-11-10-editor-input-controls.md)", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await page.getByRole("searchbox", { name: message("ko", "dev_content_search_label") }).fill("raw iron_o");
    await expect(page.locator(".ie-item")).toHaveCount(1);
    await row(page, "iron_ore").click();
    await expect(detail(page)).toHaveAttribute("data-item", "iron_ore");
    const tier = editing(page).getByLabel(message("ko", "dev_items_field_tier"), { exact: true });
    const tierField = editing(page)
      .locator(".ce-field")
      .filter({ has: page.getByLabel(message("ko", "dev_items_field_tier"), { exact: true }) });
    const original = await tier.inputValue();
    // 막대(role="slider")는 칸의 범위와 값을 알린다. 칸 안의 input은 글자 칸 하나뿐이다
    const slider = tierField.locator('[role="slider"]');
    await expect(slider).toHaveAttribute("aria-valuemin", "0");
    await expect(slider).toHaveAttribute("aria-valuemax", "9");
    await expect(slider).toHaveAttribute("aria-valuenow", original);
    await expect(tierField.locator("input")).toHaveCount(1);
    // 막대를 오른쪽 끝까지 끌면 9 → 담긴다
    await dragSlider(page, slider, 0.5, 1);
    await expect(tier).toHaveValue("9");
    await expect(tierField).toHaveAttribute("data-staged", "");
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    // [−] 단추 = 한 걸음
    await tierField.locator('.ce-step[data-step="down"]').click();
    await expect(tier).toHaveValue("8");
    // 키보드만: ↓ = −1, PageDown = −10(범위 끝 0에서 멈춘다), ↑ = +1
    await tier.focus();
    await page.keyboard.press("ArrowDown");
    await expect(tier).toHaveValue("7");
    await page.keyboard.press("PageDown");
    await expect(tier).toHaveValue("0");
    await page.keyboard.press("ArrowUp");
    await expect(tier).toHaveValue("1");
    // 범위 밖 값은 칸을 떠날 때 가까운 끝 값으로 맞추고 까닭을 적는다
    await tier.fill("99");
    await tier.blur();
    await expect(tier).toHaveValue("9");
    await expect(tierField.locator(".ce-clamp-note")).toContainText("9");
    await expect(tierField).not.toHaveAttribute("data-invalid", "");
    // Ctrl+Z = 마지막 고침 되돌리기(같은 칸을 잇달아 고친 것은 한 칸)
    await page.keyboard.press("Control+z");
    await expect(tier).toHaveValue(original);
    await expect(bar(page)).toHaveAttribute("data-count", "0");
    // 다시 고친 뒤 팩 값 눈금을 누르면 팩 값
    await tierField.locator('.ce-step[data-step="up"]').click();
    await expect(tierField).toHaveAttribute("data-staged", "");
    await clickSlider(page, slider, Number(original) / 9);
    await expect(tier).toHaveValue(original);
    await expect(tierField).not.toHaveAttribute("data-staged", "");
    expect(deviceErrors).toEqual([]);
  });

  test("분류(아이템 탭): 대분류 타일 → 중분류 → 무기 종류로 거르고, 줄 [복제]는 꺼진 사본을 담아 연다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    // 고른 아이템이 없으면 목록이 넓다(표 머리)
    await expect(page.locator(".ie-lines-head")).toBeVisible();
    await expect(page.locator(".ie-close-detail")).toHaveCount(0);
    // 타일 원자재 → 중분류 광석 10개(금속 원석 8·잡석·석재 — 소금·이탄·화석 제거 뒤. 타일을 바꾸면 중분류·무기 종류가 풀린다)
    await page.locator('.ie-browse .ie-tile[data-category="raw"]').click();
    await expect(page.locator('.ie-browse .ie-tile[data-category="raw"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.locator(".ie-sub-filter").selectOption("ore");
    await expect(page.locator(".ie-item")).toHaveCount(10);
    await expect(row(page, "iron_ore").locator(".ie-chain")).toContainText(message("ko", "economy_cat_raw"));
    // 장비 타일 → 무기 종류 칸은 장비의 무기 종류(검·도 등)를 고를 수 있다
    await page.locator('.ie-browse .ie-tile[data-category="equipment"]').click();
    await expect(page.locator(".ie-sub-filter")).toHaveValue("all");
    const kind = page.locator(".ie-kind-filter");
    await expect(kind).toBeEnabled();
    await expect(kind.locator('option[value="blade"]')).toHaveCount(1);
    await expect(kind.locator('option[value="shield"]')).toHaveCount(1);
    // 시험 검은 중분류 무기(core@60 D-497 정리 897로 채움), 장비에는 중분류 없는 아이템이 없다
    await expect(page.locator('.ie-sub-filter option[value="-"]')).toHaveCount(0);
    await page.locator(".ie-sub-filter").selectOption("weapon");
    await expect(row(page, "test_sword")).toBeVisible();
    // 줄 [복제] → 꺼진 사본이 담기고 편집 판에 열린다
    await row(page, "test_sword").locator("xpath=..").locator(".ie-row-duplicate").click();
    await expect(detail(page)).toHaveAttribute("data-item", /^test_sword_/);
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    await expect(
      editing(page).getByLabel(message("ko", "dev_items_field_enabled"), { exact: true }),
    ).not.toBeChecked();
    await bar(page).locator(".ie-clear").click();
    await page.getByRole("button", { name: message("ko", "dev_content_confirm_yes"), exact: true }).click();
    await expect(bar(page)).toHaveAttribute("data-count", "0");
    expect(deviceErrors).toEqual([]);
  });

  test("분류(분류 탭): 타일 → 나무 대분류 → 중분류 → 무기 종류, 마디 칸·든 아이템, 태그는 따로, 무기 종류 새로 만들기", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetItems(page);
    await page.reload();
    await expect(page.locator(".ie-screen")).toHaveAttribute("data-status", "ready");
    await page.getByRole("tab", { name: message("ko", "dev_items_tab_taxonomy"), exact: true }).click();
    const tree = page.locator(".ie-tax-tree");
    // 전체: 대분류 9개만(닫힘), 무기 종류는 보이지 않는다
    await expect(tree.locator('.ie-tree-node[data-level="0"]')).toHaveCount(9);
    await expect(tree.locator('.ie-tree-node[data-level="2"]')).toHaveCount(0);
    // 장비 타일 → 장비 대분류 마디가 열리고 그 아래 중분류(무기·보조 무기·…) → 무기 종류
    await page.locator('.ie-taxonomy .ie-tile[data-category="equipment"]').click();
    await expect(page.locator('.ie-tax-node[data-node="major:equipment"]')).toBeVisible();
    const weaponBranch = tree.locator('li:has(> button[data-node="sub:weapon"])');
    await expect(weaponBranch.locator('[data-node="weapon:blade"]')).toBeVisible();
    const offhandBranch = tree.locator('li:has(> button[data-node="sub:offhand_weapon"])');
    // 보조 칸 종류는 이름이 바뀐 중분류 "보조 장비" 아래, 자료 이상 표시 없음(D-497 정리 895)
    await expect(offhandBranch.locator('[data-node="weapon:shield"]')).toBeVisible();
    await expect(offhandBranch.locator('[data-node="weapon:shield"]')).not.toHaveAttribute("data-odd", "");
    await expect(offhandBranch.locator('> button[data-node="sub:offhand_weapon"]')).toContainText(
      "보조 장비",
    );
    await expect(tree.locator('[data-node="sub:ore"]')).toHaveCount(0);
    // 중분류 마디: 이름 칸(팩 값)·상위 중분류 칸으로 붙는다는 풀이(자료 이상 표시 아님, D-497 정리 896)
    await tree.locator('[data-node="sub:weapon"]').click();
    const node = page.locator('.ie-tax-node[data-node="sub:weapon"]');
    await expect(
      node.locator(".ie-node-fields").getByLabel(message("ko", "dev_items_field_name_ko"), { exact: true }),
    ).toHaveValue("무기");
    await expect(node.locator(".ie-oddity")).toHaveCount(0);
    await expect(node).toContainText(message("ko", "dev_items_tax_kind_link"));
    await expect(node.locator(".ie-node-children .ie-subheading")).toHaveText(
      message("ko", "dev_items_tax_weapon_types"),
    );
    // 태그 판은 나무 밖에 따로
    await expect(page.locator('.ie-tax[data-category="item_tags"]')).toBeVisible();
    await expect(tree.locator('[data-category="item_tags"]')).toHaveCount(0);
    // 중분류 원자재 › 광석: 든 아이템 10개(소금·이탄·화석 제거 뒤), [아이템 탭에서 거르기] → 아이템 탭 10줄
    await page.locator('.ie-taxonomy .ie-tile[data-category="raw"]').click();
    await tree.locator('[data-node="sub:ore"]').click();
    const ore = page.locator('.ie-tax-node[data-node="sub:ore"]');
    await expect(ore.locator(".ie-node-item")).toHaveCount(10);
    await ore.locator(".ie-show-items").click();
    await expect(page.locator(".ie-sub-filter")).toHaveValue("ore");
    await expect(page.locator(".ie-item")).toHaveCount(10);
    // 무기 마디에서 새 장비 종류 → 칸 = 무기·상위 중분류 = 무기, 나무에서 무기 아래 보이고 고른 마디가 된다. 적용하면 서버 목록에 든다
    await page.getByRole("tab", { name: message("ko", "dev_items_tab_taxonomy"), exact: true }).click();
    await page.locator('.ie-taxonomy .ie-tile[data-category="equipment"]').click();
    await tree.locator('[data-node="sub:weapon"]').click();
    const create = page.locator('.ie-tax-node[data-node="sub:weapon"] .ie-node-new');
    await create.locator("summary").click();
    await create.getByLabel(message("ko", "dev_items_field_name_ko"), { exact: true }).fill("e2e 채찍");
    await create.getByLabel(message("ko", "dev_items_field_name_en"), { exact: true }).fill("E2e whip");
    // 제안 ID(영어 이름 → e2e_whip, 같은 DB에서 되풀이하면 은퇴한 ID를 피해 e2e_whip_2 …)
    const newId = await create.getByLabel(message("ko", "dev_items_field_id"), { exact: true }).inputValue();
    expect(newId).toMatch(/^e2e_whip/);
    await create.getByRole("button", { name: message("ko", "dev_items_create"), exact: true }).click();
    const created = page.locator(`.ie-tax-node[data-node="weapon:${newId}"]`);
    await expect(created).toBeVisible();
    await expect(weaponBranch.locator(`[data-node="weapon:${newId}"]`)).toBeVisible();
    await expect(
      created.locator(".ie-node-fields").getByLabel(message("ko", "dev_items_field_slot"), { exact: true }),
    ).toHaveValue("weapon");
    const parentField = created
      .locator(".ie-node-fields")
      .getByLabel(message("ko", "dev_items_tax_parent"), { exact: true });
    await expect(parentField).toHaveValue("weapon");
    await apply(page);
    const after = await trpc(page, "items.list");
    const createdEntry = field(byId(field(after.data, "weaponTypes"), newId), "entry");
    expect(field(createdEntry, "slot")).toBe("weapon");
    expect(field(createdEntry, "subcategory")).toBe("weapon");
    // 상위 중분류를 보조 장비로 바꾸면 나무에서 그 아래로 옮겨진다(담은 변경, 적용 전)
    await parentField.selectOption("offhand_weapon");
    await expect(offhandBranch.locator(`[data-node="weapon:${newId}"]`)).toBeVisible();
    await expect(weaponBranch.locator(`[data-node="weapon:${newId}"]`)).toHaveCount(0);
    await resetItems(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC items.list·items.save는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/items");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".ie-screen")).toHaveCount(0);
    expect((await trpc(page, "items.list")).status).toBe(403);
    const save = await trpc(
      page,
      "items.save",
      {
        expectedRevision: 0,
        changes: [{ op: "revert", category: "items", id: "test_sword", baseHash: null }],
      },
      true,
    );
    expect([save.status, save.code]).toEqual([403, "FORBIDDEN"]);
    expect(unexpected(deviceErrors, 403)).toEqual([]);
  });
});

// 개발 화면 층(ADR 2026-11-02-dev-ui): 게임 테마와 상관없이 개발 화면 테마 둘(네온 다크·라이트)로, 보이는 화면 크기로 찍는다
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = (
  ["neon", "light"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390, height: 844 },
    { theme, language, width: 1440, height: 900 },
  ]),
);

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      // 1440은 실제 데스크톱(마우스·터치 없음)이라 개발 화면 층의 촘촘한 값으로 찍힌다
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("목록·편집 판·분류·대량 도구: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await editorReady(page, "/dev/items?item=test_sword");
        await expect(detail(page)).toHaveAttribute("data-item", "test_sword");
        await expect(editing(page)).toBeVisible();
        await expect(detail(page).locator('.ie-preview [data-part="weapon"]')).toBeVisible({
          timeout: 15_000,
        });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const check = async (name: string): Promise<void> => {
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `${name}-${theme}-${language}-${width}`);
        };
        await check("items");
        // 무기 칸(D-502 1차 적정 스탯)과 미리 보기 무기 판(몫마다 비율)
        await elementShot(
          detail(page).locator('[data-section="weapon"]'),
          `items-weapon-fields-${theme}-${language}-${width}`,
        );
        await elementShot(
          detail(page).locator('.ie-preview [data-part="weapon"]'),
          `items-weapon-preview-${theme}-${language}-${width}`,
        );
        if (width < 1000) {
          // 390: 목록으로 돌아가 목록 칸을 찍는다
          await detail(page).locator(".ie-back-list").click();
          await expect(row(page, "test_sword")).toBeVisible();
          await check("items-list");
        } else {
          // 편집 판을 닫으면 목록이 넓게: 표 머리와 분류 사슬·무게·쌓기 상한 칸
          await page.locator(".ie-close-detail").click();
          await expect(page.locator(".ie-lines-head")).toBeVisible();
          await expect(row(page, "test_sword").locator(".ie-chain")).toBeVisible();
          await check("items-browse");
          await page.locator('.ie-view-toggle [data-mode="cards"]').click();
          await expect(page.locator('.ie-lines[data-mode="cards"]')).toBeVisible();
          await check("items-cards");
          await page.locator('.ie-view-toggle [data-mode="rows"]').click();
        }
        await expect(page.locator(".ie-tile")).toHaveCount(10);
        await page.getByRole("tab", { name: message(language, "dev_items_tab_taxonomy") }).click();
        await page.locator('.ie-taxonomy .ie-tile[data-category="equipment"]').click();
        await page.locator('.ie-tree-node[data-node="sub:weapon"]').click();
        await expect(page.locator('.ie-tax-node[data-node="sub:weapon"]')).toBeVisible();
        await check("items-taxonomy");
        await page.locator('.ie-tree-node[data-node="weapon:shield"]').click();
        await expect(
          page
            .locator('.ie-tax-node[data-node="weapon:shield"] .ie-node-fields')
            .getByLabel(message(language, "dev_items_tax_parent"), { exact: true }),
        ).toHaveValue("offhand_weapon");
        await check("items-taxonomy-shield");
        await page.getByRole("tab", { name: message(language, "dev_items_tab_bulk") }).click();
        await expect(page.locator('[data-part="bulk-import"]')).toBeVisible();
        await check("items-bulk");
        expect(deviceErrors).toEqual([]);
      });

      test("소모품 효과량 칸·미리 보기(D-501): 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await editorReady(page, "/dev/items?item=ration");
        await expect(detail(page)).toHaveAttribute("data-item", "ration");
        await expect(editing(page)).toBeVisible();
        // 기준 30·적정 10(기준 유닛 VIT 10) → 30, ±500‰ → 15~45
        const draft = await consumableDraft(page, language, 30, 10);
        await expect(draft.amount).toHaveText(amountLine(language, 10, 10, 1000, 30, 500, 15, 45), {
          timeout: 15_000,
        });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await elementShot(draft.use, `items-use-fields-${theme}-${language}-${width}`);
        await elementShot(
          detail(page).locator('.ie-preview [data-part="use"]'),
          `items-use-preview-${theme}-${language}-${width}`,
        );
        expect(deviceErrors).toEqual([]);
      });

      test("옛 자원(295·D-505): 광석·목축 부산물 거르기 목록, 시작 시세 칸과 지금 세계 시세(시세 없음), 사진", async ({
        page,
        deviceErrors,
      }) => {
        await editorReady(page, "/dev/items?item=copper_ore");
        await expect(detail(page)).toHaveAttribute("data-item", "copper_ore");
        const value = detail(page).locator('[data-section="value"]');
        await expect(
          value.getByLabel(message(language, "dev_items_field_start_price"), { exact: true }),
        ).toHaveValue("10");
        // 서버가 물자 거래소를 아직 돌리지 않아 지금 세계 시세는 "시세 없음"
        await expect(value.locator('[data-part="market-price"]')).toContainText(
          message(language, "dev_items_world_price_none"),
        );
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await elementShot(value, `items-start-price-${theme}-${language}-${width}`);
        await toList(page);
        // 잇따른 거르기의 중분류 칸(대분류가 전체면 대분류마다 묶음)
        const pick = page.locator(".ie-sub-filter");
        // 광석 10개(잡석·석재 + 금속 원석 8 — 소금·이탄·화석 제거 뒤), 목축 부산물 17개(먹지 않는 16 + 밍크 오일)
        for (const [subcategory, count] of [
          ["ore", 10],
          ["livestock_byproduct", 17],
        ] as const) {
          await pick.selectOption(subcategory);
          await expect(page.locator(".ie-item")).toHaveCount(count);
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `items-${subcategory}-${theme}-${language}-${width}`);
        }
        expect(deviceErrors).toEqual([]);
      });

      test("채집 티어 추첨·묶음(D-506, 300~302): 철광석 묶음 칸 10,000(10 kg), 광산 Lv마다 나올 확률, 확률표, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await editorReady(page, "/dev/items?item=iron_ore");
        await expect(detail(page)).toHaveAttribute("data-item", "iron_ore");
        await expect(editing(page)).toBeVisible();
        const value = detail(page).locator('[data-section="value"]');
        const lot = value.getByLabel(message(language, "dev_items_field_lot_size"), { exact: true });
        await expect(lot).toHaveValue("10000");
        await expect(value).toContainText(message(language, "dev_items_lot_hint_weight", { size: "10 kg" }));
        // 기준 유닛(새 사이보그 STR 10 + VIT 10 = 20): Lv1 5%(0~39 구간 T3 50‰), Lv5(레벨당 5 → +20 = 40, 기획 D-535 1155 나) 3%(40~59 구간
        // T3 30‰. 레벨당 10이던 때는 60~79 구간 6%)
        const gather = detail(page).locator('.ie-preview [data-part="gather"]');
        await expect(gather.locator('[data-level="1"] [data-part="chance"]')).toHaveText("5.00%", {
          timeout: 15_000,
        });
        await expect(gather.locator('[data-level="5"] [data-part="chance"]')).toHaveText("3.00%");
        await expect(gather.locator('[data-part="gather-summary"]')).toContainText("STR+VIT");
        // 옛 1차 생산 규칙(D-507) + 광석 g 수확: 새 유닛 STR 10 → 진행 ×1, VIT 10 → 100g(50 + 10×5), T3 필요 진행 120, 수확 1단위 1g
        const work = gather.locator('[data-part="gather-work"]');
        await expect(work.locator('[data-part="work-summary"]')).toContainText("120");
        await expect(work.locator('[data-part="work-grams"]')).toHaveText(
          message(language, "dev_items_gather_work_grams", { grams: 1 }),
        );
        await expect(work.locator("tbody tr")).toHaveCount(7);
        await expect(work.locator('tbody tr[data-stat="10"]')).toHaveAttribute("data-hit", "true");
        await expect(work.locator('tbody tr[data-stat="40"] td').nth(0)).toHaveText("×2");
        await expect(work.locator('tbody tr[data-stat="40"] td').nth(1)).toHaveText("250");
        await gather.locator(".ie-gather-bands > summary").click();
        // 확률표 하나(D-552) 구간 14줄: 0·20·…·260 (D-534에서 240·260 구간 추가)
        await expect(gather.locator(".ie-gather-bands tbody tr")).toHaveCount(14);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await elementShot(value, `items-lot-size-${theme}-${language}-${width}`);
        await elementShot(gather, `items-gather-preview-${theme}-${language}-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
