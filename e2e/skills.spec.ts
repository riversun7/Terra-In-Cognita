// 스킬 편집기·행동별 소모 화면 시험 — /dev/skills (docs/adr/2026-11-01-skill-editor.md 5·6절).
// - dev: 스킬 칸을 고쳐 담은 변경 막대의 [적용]을 누르면 그 세계에 바로 든다(목록·내보내기 차이에 보인다). 새 스킬(맨손 스킬)을 만들고
//   지운다. 팩 검사에 걸리는 값은 거절되고 고친 칸은 남으며 그 칸 옆에 문구가 보인다(2026-11-08 화면 개편). 칸마다 팩 값·[되돌리기].
//   행동별 소모 칸에서 무기 기본 공격·스킬 소모를 [적용]하면 바로 든다.
//   회피 기동은 "미구현", 걷기는 "무료".
// - player: 권한 없음 화면, tRPC skills.*는 403.
// - 사진: 390·1440 × 개발 테마 네온·라이트 × 한국어·영어(E2E_SHOTS_DIR). 칸을 하나 고쳐 담은 변경 막대·칸 견주기도 찍는다.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(유닛·사이보그 화면 시험을 흔들지 않게).
import type { Page } from "@playwright/test";
import { dragSlider, inputValues } from "./helpers/inputs.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). 결과 data 또는 오류 코드 */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
): Promise<{ status: number; data: unknown; code: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const mutation = body !== undefined;
      const response = await fetch(
        `/api/trpc/${name}`,
        mutation
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: get(get(json, "result"), "data"),
        code: get(get(get(json, "error"), "data"), "code"),
      };
    },
    { procedure, input },
  );
}

/** 스킬·무기·유닛 종류 덮어쓰기를 모두 지운다 */
async function resetSkills(page: Page): Promise<void> {
  const current = await trpc(page, "skills.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`skills.list ${current.status}`);
  const changes = list(field(current.data, "actions")).flatMap((row) => {
    const origin = field(row, "origin");
    const key = field(row, "key");
    if (origin === undefined || origin === "pack" || typeof key !== "string") return [];
    const [category, id] = key.split("/");
    return [{ op: "revert", category, id }];
  });
  if (changes.length === 0) return;
  const reverted = await trpc(page, "skills.save", { expectedRevision: revision, changes });
  if (reverted.status !== 200) throw new Error(`skills.save revert ${reverted.status}`);
}

async function editorReady(page: Page): Promise<void> {
  await page.goto("/dev/skills");
  await expect(page.locator(".sk-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

const item = (page: Page, id: string) => page.locator(`.sk-item[data-skill="${id}"]`);
const editing = (page: Page) => page.locator(".sk-editing");
const bar = (page: Page) => page.locator(".sk-stagebar");
/** 휴대폰 폭에서는 편집 판을 열면 목록이 숨는다: 목록으로 돌아간다 */
async function toList(page: Page): Promise<void> {
  const back = page.locator(".sk-back-list");
  if (await back.isVisible()) await back.click();
}
/** 편집 칸에서 이름표로 찾은 입력 */
const input = (page: Page, label: string) => editing(page).getByLabel(label, { exact: true });

/** 시험이 일부러 받는 거절(팩 검사 400·권한 없음 403)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[], status: 400 | 403) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        error.text.includes(`status of ${status}`) &&
        error.text.includes("/api/trpc/skills.")
      ),
  );

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("스킬 소모를 고쳐 저장하면 바로 들고(목록·내보내기), 팩 값으로 되돌린다. 팩 검사에 걸리면 거절되고 칸은 남는다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetSkills(page);
    await page.reload();
    await expect(page.locator(".sk-screen")).toHaveAttribute("data-status", "ready");
    const before = await page.locator(".sk-screen").getAttribute("data-revision");
    await item(page, "power_strike").click();
    await expect(editing(page)).toHaveAttribute("data-skill", "power_strike");
    await input(page, message("ko", "dev_skills_field_cost")).fill("12");
    await expect(editing(page)).toHaveAttribute("data-dirty", "");
    // 칸에 담음 표지·팩 값(10)
    const costField = editing(page)
      .locator(".ce-field")
      .filter({ has: page.getByLabel(message("ko", "dev_skills_field_cost"), { exact: true }) });
    await expect(costField).toHaveAttribute("data-staged", "");
    await expect(costField.locator('[data-part="pack"]')).toBeVisible();
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    await bar(page).locator(".sk-note").fill("e2e 소모 시험");
    await bar(page).locator(".sk-save").click();
    await expect(editing(page)).not.toHaveAttribute("data-dirty", "");
    await expect(bar(page)).toHaveCount(0);
    await expect(page.locator(".sk-screen")).not.toHaveAttribute("data-revision", before ?? "");
    await toList(page);
    await expect(item(page, "power_strike").locator(".sk-origin-edited")).toBeVisible();
    // 서버 실효 항목에 바로 든다(다시 켜지 않음)
    const after = await trpc(page, "skills.list");
    const skill = list(field(after.data, "skills")).find(
      (entry) => field(field(entry, "entry"), "id") === "power_strike",
    );
    expect(field(field(skill, "entry"), "cost")).toBe(12);
    expect(field(field(skill, "override"), "note")).toBe("e2e 소모 시험");
    // 내보내기 차이에 팩 항목이 든다(pnpm tuning:apply)
    await page.locator(".sk-export-button").click();
    const diff: unknown = JSON.parse(await page.locator(".sk-export-text").inputValue());
    expect(list(field(diff, "entries")).map((change) => field(change, "id"))).toEqual(["power_strike"]);

    // 팩 검사에 걸리는 값: 적 하나 모양에 반지름 2 → 거절, 칸은 남고 반지름 칸 옆에 서버 문구
    await item(page, "power_strike").click();
    const radius = input(page, message("ko", "dev_skills_field_radius"));
    await radius.fill("2");
    await bar(page).locator(".sk-save").click();
    await expect(page.locator(".sk-screen [role='alert']").first()).toContainText(
      message("ko", "dev_skills_err_invalid_entry"),
    );
    await expect(editing(page)).toHaveAttribute("data-dirty", "");
    await expect(
      editing(page)
        .locator(".ce-field")
        .filter({ has: page.getByLabel(message("ko", "dev_skills_field_radius"), { exact: true }) }),
    ).toHaveAttribute("data-invalid", "");
    // [되돌리기] → 지금 값(0), 담은 변경이 빠진다
    await editing(page)
      .getByRole("button", {
        name: message("ko", "dev_content_field_undo_named", {
          name: message("ko", "dev_skills_field_radius"),
        }),
      })
      .click();
    await expect(radius).toHaveValue("0");
    await expect(bar(page)).toHaveCount(0);

    // 팩 값으로(확인)
    await editing(page).locator(".sk-revert").click();
    await page.locator(".sk-confirm-yes").click();
    await expect(item(page, "power_strike").locator(".sk-origin-edited")).toHaveCount(0);
    await expect(page.locator(".sk-changed")).toHaveAttribute("data-count", "0");
    expect(unexpected(deviceErrors, 400)).toEqual([]);
  });

  test("새 스킬(맨손 스킬)을 만들고 복제하고 지운다. 효과 사전에서 특수 효과를 고른다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetSkills(page);
    await page.reload();
    await page.locator(".sk-new-button").click();
    await page.getByLabel(message("ko", "dev_skills_new_id_label")).fill("e2e_kick");
    await page.locator(".sk-new-create").click();
    await expect(editing(page)).toHaveAttribute("data-skill", "e2e_kick");
    await input(page, message("ko", "dev_skills_field_name_ko")).fill("발차기");
    await input(page, message("ko", "dev_skills_field_name_en")).fill("Kick");
    await editing(page).getByLabel(message("ko", "dev_skills_field_bare_hand"), { exact: true }).check();
    await editing(page)
      .locator(".sk-section")
      .filter({ hasText: message("ko", "dev_skills_section_effects") })
      .locator(".sk-add")
      .click();
    await input(page, message("ko", "dev_skills_field_chance")).fill("500");
    await bar(page).locator(".sk-save").click();
    await expect(bar(page)).toHaveCount(0);
    await toList(page);
    await expect(item(page, "e2e_kick").locator(".sk-origin-created")).toBeVisible();
    await item(page, "e2e_kick").click();
    const created = await trpc(page, "skills.list");
    const kick = list(field(created.data, "skills")).find(
      (entry) => field(field(entry, "entry"), "id") === "e2e_kick",
    );
    expect(field(field(kick, "entry"), "bareHand")).toBe(true);
    expect(field(list(field(field(kick, "entry"), "effects"))[0], "chancePm")).toBe(500);

    // 복제: 새 ID 초안(적용 전에는 담은 변경에만 있고 목록에 담음 표지로 보인다)
    await editing(page).locator(".sk-duplicate").click();
    await expect(editing(page)).toHaveAttribute("data-skill", "e2e_kick_copy");
    await expect(bar(page)).toHaveAttribute("data-count", "1");
    await editing(page).locator(".sk-unstage").click();
    await expect(bar(page)).toHaveCount(0);
    await toList(page);
    await expect(item(page, "e2e_kick_copy")).toHaveCount(0);

    // 지우기(확인)
    await item(page, "e2e_kick").click();
    await editing(page).locator(".sk-delete").click();
    await page.locator(".sk-confirm-yes").click();
    await expect(item(page, "e2e_kick")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("행동별 소모: 무기 기본 공격·스킬 소모를 [적용]하면 바로 든다. 걷기 무료, 회피 기동 미구현", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetSkills(page);
    await page.reload();
    await page.getByRole("tab", { name: message("ko", "dev_skills_tab_costs") }).click();
    await expect(page.locator('tr[data-key="walk"]')).toContainText(message("ko", "dev_skills_status_free"));
    await expect(page.locator('tr[data-key="evasive_move"]')).toContainText(
      message("ko", "dev_skills_status_unimplemented"),
    );
    // 스태미나 기준(D-511): 보통 유닛 Lv 1·30 적정 STA 10·39, 회복 초당 12, 검 기본 공격은 이어짐
    const basis = page.getByTestId("stamina-basis");
    await expect(basis.locator('tr[data-level="1"] [data-cell="appropriate"]')).toHaveText("10");
    await expect(basis.locator('tr[data-level="30"] [data-cell="appropriate"]')).toHaveText("39");
    await expect(basis.locator('tr[data-level="30"] [data-cell="regen"]')).toHaveText("12");
    const sword = page.locator('tr[data-key="items/test_sword"]');
    await expect(sword.locator(".sk-col-sustain")).toHaveAttribute("data-sustain", "ok");
    await expect(page.locator('.sk-col-sustain[data-sustain="drains"]')).toHaveCount(0);
    await sword.locator("input").first().fill("7");
    await expect(sword).toHaveAttribute("data-changed", "");
    await sword.locator(".sk-cost-apply").click();
    await expect(page.locator('tr[data-key="items/test_sword"] .sk-chip-edited')).toBeVisible();
    const bolt = page.locator('tr[data-key="skills/fire_bolt"]');
    await bolt.locator("input").first().fill("9");
    await bolt.locator(".sk-cost-apply").click();
    await expect(page.locator('tr[data-key="skills/fire_bolt"] .sk-chip-edited')).toBeVisible();
    const after = await trpc(page, "skills.list");
    const rows = list(field(after.data, "actions"));
    const swordRow = rows.find((row) => field(row, "key") === "items/test_sword");
    const boltRow = rows.find((row) => field(row, "key") === "skills/fire_bolt");
    expect([field(swordRow, "staminaCost"), field(boltRow, "cost")]).toEqual([7, 9]);
    await resetSkills(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("등급 사다리(넓은 폭)", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("등급 배율 줄을 골라 선형 채우기·곱하기로 한꺼번에 바꾸고, 줄 막대를 끌어 고친다. Ctrl+Z로 되돌린다", async ({
    page,
    deviceErrors,
  }) => {
    await editorReady(page);
    await resetSkills(page);
    await page.reload();
    await expect(page.locator(".sk-screen")).toHaveAttribute("data-status", "ready");
    await item(page, "power_strike").click();
    await expect(editing(page)).toHaveAttribute("data-skill", "power_strike");
    const ladder = editing(page).locator(".sk-grades");
    const values = (): Promise<number[]> => inputValues(ladder.locator("tbody input"));
    expect(await values()).toEqual([1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2000]);
    // 곡선(작은 막대)이 머리에 있다
    await expect(ladder.locator("thead .ce-spark")).toHaveAttribute("data-shape", "up");
    // 끝 등급을 2800으로 치고, 머리로 열 전체를 골라 선형 채우기 → 200씩
    await ladder.locator('tr[data-ladder-row="9"] input').fill("2800");
    await ladder.locator("thead .ce-col-pick").click();
    const bulk = ladder.locator(".ce-bulk");
    await expect(bulk).toHaveAttribute("data-count", "10");
    await bulk.locator(".ce-bulk-linear").click();
    expect(await values()).toEqual([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800]);
    await expect(editing(page)).toHaveAttribute("data-dirty", "");
    // 곱하기 50%
    await bulk.locator(".ce-bulk-op").selectOption("scale");
    await bulk.locator("input").fill("50");
    await bulk.locator(".ce-bulk-apply").click();
    expect(await values()).toEqual([500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400]);
    // 1등급 줄의 막대를 끌면 그 줄만 바뀐다
    await bulk.locator(".ce-bulk-clear").click();
    const first = ladder.locator('tr[data-ladder-row="0"]');
    await dragSlider(page, first.locator('[role="slider"]'), 0.1, 0.9);
    const dragged = (await values())[0] ?? 0;
    expect(dragged).toBeGreaterThan(500);
    expect((await values()).slice(1)).toEqual([600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400]);
    // Ctrl+Z: 막대 끌기 → 곱하기 → 선형 채우기 차례로 되돌린다
    await page.locator(".sk-screen h1").click();
    await page.keyboard.press("Control+z");
    expect(await values()).toEqual([500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400]);
    await page.keyboard.press("Control+z");
    expect(await values()).toEqual([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2800]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC skills.list·skills.save는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/skills");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".sk-screen")).toHaveCount(0);
    expect((await trpc(page, "skills.list")).status).toBe(403);
    const save = await trpc(page, "skills.save", {
      expectedRevision: 0,
      changes: [{ op: "revert", category: "skills", id: "power_strike" }],
    });
    expect([save.status, save.code]).toEqual([403, "FORBIDDEN"]);
    expect(unexpected(deviceErrors, 403)).toEqual([]);
  });
});

// 개발 화면 층(ADR 2026-11-02-dev-ui): 게임 테마와 상관없이 개발 화면 테마 둘(네온 다크·라이트)로 찍는다
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
      test.use({ devTheme: theme, language, viewport: { width, height } });

      test("스킬 칸·행동별 소모 표: 가로 넘침·작은 누르는 곳 없음, 사진", async ({ page, deviceErrors }) => {
        await editorReady(page);
        await resetSkills(page);
        await page.reload();
        await expect(page.locator(".sk-screen")).toHaveAttribute("data-status", "ready");
        await item(page, "chain_lightning").click();
        await expect(editing(page)).toHaveAttribute("data-skill", "chain_lightning");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `skills-${theme}-${language}-${width}`);
        // 칸 하나를 고쳐 담음 표지·팩 값·담은 변경 막대를 찍는다(적용하지 않는다)
        const cost = editing(page).getByLabel(message(language, "dev_skills_field_cost"), { exact: true });
        await cost.fill("17");
        await expect(bar(page)).toHaveAttribute("data-count", "1");
        await bar(page).locator("summary").click();
        // 고친 칸을 화면 위쪽으로(아래에 붙은 막대가 가리지 않게)
        await cost.evaluate((element) => element.scrollIntoView({ block: "center" }));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `skills-staged-${theme}-${language}-${width}`);
        await bar(page).locator(".sk-clear").click();
        await bar(page).locator(".ce-confirm-yes").click();
        await expect(bar(page)).toHaveCount(0);
        if (width < 1000) {
          await toList(page);
          await expect(item(page, "chain_lightning")).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `skills-list-${theme}-${language}-${width}`);
        }
        await page.getByRole("tab", { name: message(language, "dev_skills_tab_costs") }).click();
        await expect(page.locator(".sk-cost-table")).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `skills-costs-${theme}-${language}-${width}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
