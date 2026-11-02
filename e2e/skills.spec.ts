// 스킬 편집기·행동별 소모 화면 시험 — /dev/skills (docs/adr/2026-11-01-skill-editor.md 5·6절).
// - dev: 스킬 칸을 고쳐 [저장]하면 그 세계에 바로 든다(목록·내보내기 차이에 보인다). 새 스킬(맨손 스킬)을 만들고 지운다.
//   팩 검사에 걸리는 값은 거절되고 고친 칸은 남는다. 행동별 소모 칸에서 무기 기본 공격·스킬 소모를 [적용]하면 바로 든다.
//   회피 기동은 "미구현", 걷기는 "무료".
// - player: 권한 없음 화면, tRPC skills.*는 403.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(E2E_SHOTS_DIR).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(유닛·사이보그 화면 시험을 흔들지 않게).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";

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
    await editing(page).locator(".sk-note").fill("e2e 소모 시험");
    await editing(page).locator(".sk-save").click();
    await expect(editing(page)).not.toHaveAttribute("data-dirty", "");
    await expect(page.locator(".sk-screen")).not.toHaveAttribute("data-revision", before ?? "");
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

    // 팩 검사에 걸리는 값: 적 하나 모양에 반지름 2 → 거절, 칸은 남는다
    await input(page, message("ko", "dev_skills_field_radius")).fill("2");
    await editing(page).locator(".sk-save").click();
    await expect(page.locator(".sk-screen [role='alert']").first()).toContainText(
      message("ko", "dev_skills_err_invalid_entry"),
    );
    await expect(editing(page)).toHaveAttribute("data-dirty", "");
    await input(page, message("ko", "dev_skills_field_radius")).fill("0");

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
    await editing(page).locator(".sk-save").click();
    await expect(item(page, "e2e_kick").locator(".sk-origin-created")).toBeVisible();
    const created = await trpc(page, "skills.list");
    const kick = list(field(created.data, "skills")).find(
      (entry) => field(field(entry, "entry"), "id") === "e2e_kick",
    );
    expect(field(field(kick, "entry"), "bareHand")).toBe(true);
    expect(field(list(field(field(kick, "entry"), "effects"))[0], "chancePm")).toBe(500);

    // 복제: 새 ID 초안(저장 전에는 목록에 없다)
    await editing(page).locator(".sk-duplicate").click();
    await expect(editing(page)).toHaveAttribute("data-skill", "e2e_kick_copy");
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
    const sword = page.locator('tr[data-key="items/test_sword"]');
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
