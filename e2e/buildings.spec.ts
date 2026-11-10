// 건물 편집기 화면 시험 — /dev/buildings (docs/adr/2026-11-02-building-editor.md, 기획 D-508·49 M14).
// - dev: 시설 표에서 농장을 열어 Lv1 원자재 수량을 고치면 담기고(막대·레벨 표), [적용]하면 그 세계에 바로 든다(buildings.list·내보내기
//   차이). 레벨 구간을 더하면 레벨 표의 구간이 바뀐다. 구간 시작 레벨을 거꾸로 적으면 검사가 막는다. [팩 값으로]를 담아 적용하면 팩 값.
// - 수리 줄(D-512 323): 공방의 옛 REPAIR_MAP 출발값 넷, 기본 양을 고쳐 적용, 칸·무기 종류를 다 빼면 검사가 막는다.
// - 2차맵 모습(2026-11-09): 3D 미리 보기 캔버스가 뜨고, 모델·벽 색을 고치면 담기고 미리 보기가 바뀌며 [적용]하면 팩 look 칸이 든다.
// - player: 권한 없음 화면, tRPC buildings.*는 403.
// - 사진: 390·1440(VIEWPORTS.desktop) × 개발 화면 테마 네온·라이트 × 한국어·영어(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 시설 덮어쓰기를 모두 지운다.
import type { Page } from "@playwright/test";
import { dragTo, inputValues } from "./helpers/inputs.ts";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). input이 있으면 POST(쓰기), 없으면 GET */
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

/** 시설 덮어쓰기를 모두 지운다(팩 값으로) */
async function resetBuildings(page: Page): Promise<void> {
  const current = await trpc(page, "buildings.list");
  const revision = field(current.data, "revision");
  if (typeof revision !== "number") throw new Error(`buildings.list ${current.status}`);
  const changes = list(field(current.data, "facilities")).flatMap((row) => {
    if (field(row, "origin") !== "edited") return [];
    return [{ op: "revert", id: field(field(row, "entry"), "id"), baseHash: field(row, "hash") }];
  });
  if (changes.length === 0) return;
  const reverted = await trpc(page, "buildings.save", { expectedRevision: revision, changes });
  if (reverted.status !== 200) throw new Error(`buildings.save revert ${reverted.status}`);
}

const screen = (page: Page) => page.locator(".be-screen");
async function editorReady(page: Page, path = "/dev/buildings"): Promise<void> {
  await page.goto(path);
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}
async function freshEditor(page: Page, path = "/dev/buildings"): Promise<void> {
  await editorReady(page, path);
  await resetBuildings(page);
  await page.reload();
  await expect(screen(page)).toHaveAttribute("data-status", "ready");
}

/** 왼쪽 목록의 시설 줄(누르면 편집 판) */
const row = (page: Page, id: string) => page.locator(`.be-row-button[data-facility="${id}"]`);
const detail = (page: Page) => page.locator(".be-detail");
const band = (page: Page, index: number) => detail(page).locator(`.be-band[data-band="${index}"]`);
const levelRow = (page: Page, level: number) =>
  detail(page).locator(`.be-level-table tr[data-level="${level}"]`);
const stagebar = (page: Page) => page.locator(".be-stagebar");
const repairRule = (page: Page, index: number) =>
  detail(page).locator(`.be-repair-rule[data-repair="${index}"]`);

/** 시험이 일부러 받는 거절(권한 없음 403)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[], status: 403) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        error.text.includes(`status of ${status}`) &&
        error.text.includes("/api/trpc/buildings.")
      ),
  );

test.describe("개발자", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("농장 Lv1 원자재 수량을 고쳐 담고 [적용]하면 바로 들고(목록·내보내기), [팩 값으로]를 적용하면 팩 값", async ({
    page,
    deviceErrors,
  }) => {
    await freshEditor(page);
    // 목록: 시설마다 한 줄(제재소·가마·영토 비콘 포함, 영토 비콘은 docs/adr/2026-11-03-territory-layer.md). 시설은 늘 켜져 있어 꺼짐
    // 표지가 없다(팩 core@32, 사용자 답 2026-11-03)
    // 목록 줄 수 = 서버 시설 수(팩 core@57은 17개)
    const listed = list(field((await trpc(page, "buildings.list")).data, "facilities"));
    expect(listed.length).toBeGreaterThanOrEqual(9);
    await expect(page.locator(".be-row-button")).toHaveCount(listed.length);
    await expect(page.locator(".ce-side .be-badge-off")).toHaveCount(0);
    await row(page, "farm").click();
    await expect(detail(page)).toHaveAttribute("data-facility", "farm");
    // 편집 판에 켜기 칸이 없다
    await expect(detail(page).locator('input[type="checkbox"]')).toHaveCount(0);
    // 팩 값: Lv1 = 소나무 round(8 × 0.8) = 6, Lv2~ = 판자(켜짐) round(8 × 4 × 0.8) = 26
    await expect(levelRow(page, 1)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "소나무", qty: 6 }),
    );
    await expect(levelRow(page, 2)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "판자", qty: 26 }),
    );
    await expect(levelRow(page, 2).locator(".be-badge-off")).toHaveCount(0);
    const before = await screen(page).getAttribute("data-revision");

    // Lv1 소나무 8 → 10: 담기고 레벨 표가 바로 바뀐다(round(10 × 0.8) = 8)
    await band(page, 0).locator('.be-material[data-item="pine_log"] .be-material-qty input').fill("10");
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(row(page, "farm")).toHaveAttribute("data-staged", "");
    // 칸 견주기(2026-11-08 화면 개편): 고친 칸에 담음 표지·팩 값(8)
    const qty = band(page, 0).locator('.be-material[data-item="pine_log"] .be-material-qty');
    await expect(qty).toHaveAttribute("data-staged", "");
    await expect(qty.locator('[data-part="pack"]')).toContainText("8");
    await expect(levelRow(page, 1)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "소나무", qty: 8 }),
    );
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".be-note").fill("e2e 건축 재료");
    await stagebar(page).locator(".be-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(screen(page)).not.toHaveAttribute("data-revision", before ?? "");
    await expect(row(page, "farm")).toHaveAttribute("data-changed", "");
    await expect(row(page, "farm").locator(".ce-badge-changed")).toBeVisible();
    const after = await trpc(page, "buildings.list");
    const farm = list(field(after.data, "facilities")).find(
      (entry) => field(field(entry, "entry"), "id") === "farm",
    );
    expect(field(field(farm, "override"), "note")).toBe("e2e 건축 재료");
    expect(field(field(field(farm, "entry"), "build"), "levels")).toEqual([
      { from: 1, materials: [{ item: "pine_log", qty: 10 }] },
      { from: 2, materials: [{ item: "plank", qty: 8 }] },
    ]);
    // 내보내기 차이에 시설 항목이 든다(pnpm tuning:apply → facilities.json)
    await page.locator(".be-summary-tools button").first().click();
    const diff: unknown = JSON.parse(await page.locator(".be-export-text").inputValue());
    expect(
      list(field(diff, "entries")).map((change) => [field(change, "category"), field(change, "id")]),
    ).toEqual([["facilities", "farm"]]);

    // [팩 값으로]를 담아 적용 → 팩 값
    await detail(page).locator(".be-revert").click();
    await expect(detail(page).locator(".be-reverting")).toBeVisible();
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".be-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(row(page, "farm")).not.toHaveAttribute("data-changed", "");
    await expect(levelRow(page, 1)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "소나무", qty: 6 }),
    );
    await resetBuildings(page);
    expect(deviceErrors).toEqual([]);
  });

  test("레벨 구간을 더하면 레벨 표 구간이 바뀌고, 시작 레벨을 거꾸로 적으면 검사가 막는다. [비우기]로 담음을 비운다", async ({
    page,
    deviceErrors,
  }) => {
    await freshEditor(page, "/dev/buildings?facility=mine");
    await expect(detail(page)).toHaveAttribute("data-facility", "mine");
    await detail(page).locator(".be-add-band").click();
    await expect(band(page, 2)).toBeVisible();
    await expect(levelRow(page, 3)).toHaveAttribute("data-band-from", "3");
    await expect(levelRow(page, 2)).toHaveAttribute("data-band-from", "2");
    // 셋째 구간 재료: 판자 → 철 주괴(가공품), 수량 4 → Lv3 = round(4 × 9 × 0.8) = 29
    await band(page, 2).locator('.be-material[data-item="plank"] select').selectOption("iron_ingot");
    await band(page, 2).locator('.be-material[data-item="iron_ingot"] .be-material-qty input').fill("4");
    await expect(levelRow(page, 3)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "철 주괴", qty: 29 }),
    );
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    // 셋째 구간 시작 레벨을 2로(앞 구간과 같음) → 검사 오류, [적용] 막힘
    await band(page, 2).getByLabel(message("ko", "dev_buildings_field_from"), { exact: true }).fill("2");
    await expect(stagebar(page)).toHaveAttribute("data-check", "blocked", { timeout: 10_000 });
    await expect(stagebar(page).locator(".be-apply")).toHaveAttribute("aria-disabled", "true");
    await expect(detail(page).locator(".be-issues")).toContainText(
      message("ko", "dev_buildings_issue_levels_order", { previous: "2" }),
    );
    await stagebar(page)
      .getByRole("button", { name: message("ko", "dev_content_discard_all"), exact: true })
      .click();
    await stagebar(page).locator(".ce-confirm-yes").click();
    await expect(stagebar(page)).toHaveCount(0);
    await expect(band(page, 2)).toHaveCount(0);
    expect((await trpc(page, "buildings.list")).status).toBe(200);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("2차맵 모습(3D 미리 보기, 2026-11-09)", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("농장: 미리 보기 캔버스가 뜨고, 모델·벽 색·높이를 고치면 담기고 미리 보기가 바뀌며, [적용]하면 look 칸이 든다", async ({
    page,
    deviceErrors,
  }) => {
    await freshEditor(page, "/dev/buildings?facility=farm");
    await expect(detail(page)).toHaveAttribute("data-facility", "farm");
    const section = detail(page).locator('[data-section="look"]');
    const canvas = section.locator(".be-look-canvas");
    await expect(section.locator(".be-look-stage")).toHaveAttribute("data-preview", "ready", {
      timeout: 20_000,
    });
    await expect(canvas).toHaveAttribute("data-parts", /^[1-9]\d*$/);
    // 팩 출발값: 모델 = 농장(core@59), 바닥 = 팩 칸
    await expect(canvas).toHaveAttribute("data-look", /"model":"farm"/);
    const before = await canvas.getAttribute("data-parts");

    // 모델 → 신전: 담기고 미리 보기가 다시 세워진다(조각 수가 바뀐다)
    await section
      .getByLabel(message("ko", "dev_buildings_field_look_model"), { exact: true })
      .selectOption("temple");
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(canvas).toHaveAttribute("data-look", /"model":"temple"/);
    await expect(canvas).not.toHaveAttribute("data-parts", before ?? "");
    // 벽 색 → 벽돌(색 견본 라디오), 높이 1500‰
    await section
      .locator(".be-swatches")
      .first()
      .getByRole("radio", { name: message("ko", "dev_buildings_look_color_brick"), exact: true })
      .check();
    await expect(canvas).toHaveAttribute("data-look", /"wall":"brick"/);
    await section.getByLabel(message("ko", "dev_buildings_field_look_height"), { exact: true }).fill("1500");
    await expect(canvas).toHaveAttribute("data-look", /"heightPm":1500/);
    // 보기 조건(레벨·밤)은 담지 않는다
    await section.locator(".be-look-levels button").nth(2).click();
    await expect(canvas).toHaveAttribute("data-look", /"level":2/);
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    // 구역 표지: 담은 칸 셋(모델·벽·높이)
    await expect(section).toHaveAttribute("data-staged", "");
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".be-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    const after = await trpc(page, "buildings.list");
    const farm = list(field(after.data, "facilities")).find(
      (entry) => field(field(entry, "entry"), "id") === "farm",
    );
    expect(field(field(farm, "entry"), "look")).toEqual({ model: "temple", wall: "brick", heightPm: 1500 });
    await resetBuildings(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("수리 줄(D-512 323)", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("공방 수리 줄 넷(옛 REPAIR_MAP 출발값): 기본 양을 고쳐 적용하면 든다, 칸·무기 종류를 다 빼면 검사가 막는다", async ({
    page,
    deviceErrors,
  }) => {
    await freshEditor(page, "/dev/buildings?facility=workshop");
    await expect(detail(page)).toHaveAttribute("data-facility", "workshop");
    await expect(detail(page).locator(".be-repair-rule")).toHaveCount(4);
    // 첫 줄 = 옛 무기 공방(근접 무기 종류, 주괴 2), 셋째 줄 = 옛 방어구 공방(머리·몸 + 방패, 주괴 1·가죽 1)
    const blade = message("ko", "dev_buildings_repair_weapon_types");
    await expect(repairRule(page, 0).getByRole("group", { name: blade })).toBeVisible();
    await expect(repairRule(page, 0).getByLabel("검·도", { exact: true })).toBeChecked();
    await expect(repairRule(page, 0).getByLabel("활", { exact: true })).not.toBeChecked();
    await expect(
      repairRule(page, 0).locator('.be-material[data-item="iron_ingot"] .be-material-qty input'),
    ).toHaveValue("2");
    await expect(
      repairRule(page, 2).getByLabel(message("ko", "roster_slot_head"), { exact: true }),
    ).toBeChecked();
    await expect(repairRule(page, 2).getByLabel("방패", { exact: true })).toBeChecked();

    // 첫 줄 주괴 2 → 3: 담기고 검사 통과 → 적용하면 세계에 든다
    await repairRule(page, 0)
      .locator('.be-material[data-item="iron_ingot"] .be-material-qty input')
      .fill("3");
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page).locator(".be-apply").click();
    await expect(stagebar(page)).toHaveCount(0);
    const after = await trpc(page, "buildings.list");
    const workshop = list(field(after.data, "facilities")).find(
      (entry) => field(field(entry, "entry"), "id") === "workshop",
    );
    const rules = list(field(field(workshop, "entry"), "repair"));
    expect(rules).toHaveLength(4);
    expect(field(rules[0], "materials")).toEqual([{ item: "iron_ingot", qty: 3 }]);

    // 장신구 줄의 칸을 빼면 칸·무기 종류가 없는 줄 → 검사가 막는다
    await repairRule(page, 3).getByLabel(message("ko", "roster_slot_accessory"), { exact: true }).uncheck();
    await expect(stagebar(page)).toHaveAttribute("data-check", "blocked", { timeout: 10_000 });
    await expect(detail(page).locator(".be-issues")).toContainText(
      message("ko", "dev_buildings_issue_repair_targets"),
    );
    // 그 줄을 빼면 다시 통과(줄 셋)
    await repairRule(page, 3).locator(".be-remove-repair").click();
    await expect(detail(page).locator(".be-repair-rule")).toHaveCount(3);
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page)
      .getByRole("button", { name: message("ko", "dev_content_discard_all"), exact: true })
      .click();
    await stagebar(page).locator(".ce-confirm-yes").click();
    await resetBuildings(page);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("구간 × 재료 표(묶음 바꾸기, 2026-11-10)", () => {
  test.use({ account: "dev", ...VIEWPORTS.desktop });

  test("레벨마다 나눈 뒤 재료 열을 골라 선형 채우기하면 레벨 표·합계가 따라 바뀐다. 모서리 끌어 채우기, Ctrl+Z", async ({
    page,
    deviceErrors,
  }) => {
    await freshEditor(page);
    await row(page, "farm").click();
    await expect(detail(page)).toHaveAttribute("data-facility", "farm");
    const matrix = detail(page).locator(".be-matrix");
    const cell = (bandIndex: number, item: string) =>
      matrix.locator(`tr[data-band="${bandIndex}"] td[data-item="${item}"]`);
    const plank = (): Promise<number[]> => inputValues(matrix.locator('td[data-item="plank"] input'));
    // 팩: Lv1 소나무 8, Lv2~5 판자 8 → 구간 둘
    await expect(matrix.locator("tbody tr")).toHaveCount(2);
    // 합계 줄(모든 레벨): 판자 round(8 × L² × 0.8) = 26 + 58 + 102 + 160 = 346
    const total = detail(page).locator(".be-level-total");
    await expect(total).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "판자", qty: 346 }),
    );
    // [레벨마다 나누기] → 구간 다섯, 레벨 표는 그대로
    await matrix.locator(".be-split-levels").click();
    await expect(matrix.locator("tbody tr")).toHaveCount(5);
    expect(await plank()).toEqual([8, 8, 8, 8]);
    await expect(levelRow(page, 3)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "판자", qty: 58 }),
    );
    // 끝 구간(Lv5)을 2로 치고, 머리로 판자 열을 골라 선형 채우기 → 8·6·4·2
    await cell(4, "plank").locator("input").fill("2");
    await matrix.locator('th[data-item="plank"] .ce-col-pick').click();
    const bulk = matrix.locator(".ce-bulk");
    await expect(bulk).toHaveAttribute("data-count", "4");
    await bulk.locator(".ce-bulk-linear").click();
    expect(await plank()).toEqual([8, 6, 4, 2]);
    // 레벨 표: Lv3 = round(6 × 9 × 0.8) = 43, 합계 = 26 + 43 + 51 + 40 = 160
    await expect(levelRow(page, 3)).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "판자", qty: 43 }),
    );
    await expect(total).toContainText(
      message("ko", "dev_buildings_material_qty", { name: "판자", qty: 160 }),
    );
    await expect(stagebar(page)).toHaveAttribute("data-count", "1");
    // 고르기를 풀고 Lv2 칸 모서리를 Lv4 칸까지 끌면 같은 값(8)으로 채운다
    await bulk.locator(".ce-bulk-clear").click();
    await cell(1, "plank").locator("input").click();
    await dragTo(page, cell(1, "plank").locator(".ce-fill-handle"), cell(3, "plank"));
    expect(await plank()).toEqual([8, 8, 8, 2]);
    // Ctrl+Z = 끌어 채우기 되돌리기
    await detail(page).locator(".be-level-table").click();
    await page.keyboard.press("Control+z");
    expect(await plank()).toEqual([8, 6, 4, 2]);
    await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
    await stagebar(page)
      .getByRole("button", { name: message("ko", "dev_content_discard_all"), exact: true })
      .click();
    await stagebar(page).locator(".ce-confirm-yes").click();
    await expect(stagebar(page)).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC buildings.list·buildings.save는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/buildings");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(screen(page)).toHaveCount(0);
    expect((await trpc(page, "buildings.list")).status).toBe(403);
    const save = await trpc(page, "buildings.save", {
      expectedRevision: 0,
      changes: [{ op: "revert", id: "farm", baseHash: "0".repeat(64) }],
    });
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

      test("시설 표·편집 판(레벨 구간·레벨 표·채집·레시피)·담은 변경 막대: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await freshEditor(page, "/dev/buildings?facility=mine");
        await expect(detail(page)).toHaveAttribute("data-facility", "mine");
        // 담은 변경 하나(막대가 펼쳐진 모양도 찍는다)
        await band(page, 0).locator('.be-material[data-item="stone"] .be-material-qty input').fill("12");
        await expect(stagebar(page)).toHaveAttribute("data-check", "ok", { timeout: 10_000 });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const check = async (name: string): Promise<void> => {
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `${name}-${theme}-${language}-${width}`);
        };
        await check("buildings");
        // 담은 변경 막대를 펼친 모양(항목마다 바꾼 칸 수·[열기]·[×])
        await stagebar(page).locator("summary").click();
        await check("buildings-pending");
        // 레벨 표: 가운데로 올려 화면 사진으로 찍는다(요소 사진은 아래에 붙은 담은 변경 막대가 가린다)
        await detail(page)
          .locator(".be-level-table")
          .evaluate((table) => table.scrollIntoView({ block: "center" }));
        await check("buildings-levels");
        if (width < 1000) {
          await detail(page).locator(".be-back-list").click();
          await expect(row(page, "mine")).toBeVisible();
          await check("buildings-list");
          // 휴대폰 거르기 줄([거르기] 누르면 펼침)
          await page.locator(".ce-filters-toggle").click();
          await check("buildings-filters");
        } else {
          // 넓은 화면의 시설 줄은 촘촘하다(카드가 아니다)
          const box = await row(page, "smelter").boundingBox();
          expect(box?.height ?? 0).toBeLessThanOrEqual(64);
        }
        await stagebar(page)
          .getByRole("button", { name: message(language, "dev_content_discard_all"), exact: true })
          .click();
        await stagebar(page).locator(".ce-confirm-yes").click();
        await expect(stagebar(page)).toHaveCount(0);
        // 2차맵 모습: 미리 보기가 뜬 구역을 위로(휴대폰은 목록에서 광산을 다시 연다)
        if (width < 1000) await row(page, "mine").click();
        const look = detail(page).locator('[data-section="look"]');
        await expect(look.locator(".be-look-stage")).toHaveAttribute("data-preview", "ready", {
          timeout: 20_000,
        });
        await expect(look.locator(".be-look-canvas")).toHaveAttribute("data-parts", /^[1-9]/);
        await look.evaluate((section) => section.scrollIntoView({ block: "start" }));
        await check("buildings-look");
        // 수리 줄(D-512 323): 공방을 열어 수리 판을 가운데로
        await editorReady(page, "/dev/buildings?facility=workshop");
        await expect(detail(page)).toHaveAttribute("data-facility", "workshop");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await detail(page)
          .locator('[data-section="repair"]')
          .evaluate((section) => section.scrollIntoView({ block: "center" }));
        await check("buildings-repair");
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
