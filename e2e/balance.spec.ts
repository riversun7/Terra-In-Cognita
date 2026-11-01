// 밸런스 화면 시험 — /dev/balance (docs/adr/2026-11-01-balance-screen.md 7절).
// - dev: 가중치 칸(HP의 VIT)을 고치면 담기고 기여 표가 "지금 → 고침"을 보인다. [승률 돌리기]는 1차 여섯 줄(지금·고침 막대).
//   [적용]하면 그 세계에 바로 든다(세계에서 바뀐 칸 1, 시안 유닛 HP가 오름, 설정 칸 패널 머리에 가중치 칸 수). 되돌리기 → 적용이면 팩 값.
//   모든 WIS 가중치를 0으로 담으면 담은 변경 막대가 "적용하면 받지 않음(가치 없는 1차)"을 미리 보이고, 적용은 거절된다.
// - dev 프리셋(ADR "바뀜 (D-467)"): 팩 씨앗 셋, 고르면 기준 유닛 칸을 채운다. 칸을 고치면 [이 프리셋에 저장](팩에서 고침),
//   [새 프리셋](이름 ko·en 창) → [이름 바꾸기] → [지우기], 고친 팩 프리셋은 [팩 값으로].
// - player: 권한 없음 화면, tRPC balance.*는 403(프리셋 쓰기 포함).
// - 배치·사진: 390·1440 × 파스텔·다크 × 한국어·영어(새 프리셋 창 포함), 큰 숫자(1차 10,000·가중치 100,000).
//   가로 넘침(표는 안에서 민다)·작은 누르는 곳 없음.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(설정 칸 패널 시험과 같은 결).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키). 결과 data 또는 오류 코드 */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  kind: "query" | "mutation" = input === undefined ? "query" : "mutation",
): Promise<{ status: number; data: unknown; code: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, kind: how }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const field = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const query =
        how === "query" && body !== undefined ? `?input=${encodeURIComponent(JSON.stringify(body))}` : "";
      const response = await fetch(
        `/api/trpc/${name}${query}`,
        how === "mutation"
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: field(field(json, "result"), "data"),
        code: field(field(field(json, "error"), "data"), "code"),
      };
    },
    { procedure, input, kind },
  );
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 덮어쓰기를 모두 지운다(설정 칸·가중치 칸) */
async function resetTuning(page: Page): Promise<void> {
  const list = await trpc(page, "tuning.list");
  const revision = field(list.data, "revision");
  if (typeof revision !== "number") throw new Error(`tuning.list ${list.status}`);
  const entries = field(list.data, "entries");
  const changed =
    (Array.isArray(entries) && entries.some((entry: unknown) => field(entry, "override") !== null)) ||
    field(list.data, "statOverrides") !== 0;
  if (!changed) return;
  const reverted = await trpc(page, "tuning.revertAll", { expectedRevision: revision });
  if (reverted.status !== 200) throw new Error(`tuning.revertAll ${reverted.status}`);
}

/** 프리셋을 팩 씨앗으로 돌린다(화면에서 만든 것은 지우고 고친 팩 프리셋은 되돌린다) */
async function resetPresets(page: Page): Promise<void> {
  const table = await trpc(page, "balance.table");
  const presets = field(table.data, "presets");
  if (!Array.isArray(presets)) throw new Error(`balance.table ${table.status}`);
  for (const preset of presets) {
    const version = field(preset, "version");
    if (typeof version !== "number" || version === 0) continue;
    const removed = await trpc(page, "balance.deletePreset", {
      id: field(preset, "id"),
      expectedVersion: version,
    });
    if (removed.status !== 200) throw new Error(`balance.deletePreset ${removed.status}`);
  }
}

/** 시안 유닛 첫 줄의 HP(서버 화면 자료가 실효 가중치 표로 계산한다) */
async function previewHp(page: Page): Promise<number> {
  const list = await trpc(page, "units.list", { preview: true }, "query");
  const units = field(list.data, "units");
  const first: unknown = Array.isArray(units) ? units[0] : undefined;
  const secondary = field(field(first, "stats"), "secondary");
  const hp = Array.isArray(secondary)
    ? secondary.find((row: unknown) => field(row, "id") === "hp")
    : undefined;
  return Number(field(hp, "value"));
}

async function screenReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".bp-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.locator(".bp-contrib tbody tr").first()).toBeVisible({ timeout: 20_000 });
}

const cell = (page: Page, row: string, fieldName: string) =>
  page.locator(`.bp-weights tr[data-row="${row}"] td[data-field="${fieldName}"]`);

/** 칸 값을 고쳐 담는다(입력을 떠나면 담긴다) */
async function stageCell(page: Page, row: string, fieldName: string, value: string): Promise<void> {
  const input = cell(page, row, fieldName).locator("input");
  await input.fill(value);
  await input.press("Enter");
  await expect(cell(page, row, fieldName)).toHaveAttribute("data-state", "staged");
}

/** 작은 설정(판 4, 60초)으로 [승률 돌리기]. 대결 속도 제한(사용자마다 순간 2·분당 4)에 걸리면 기다렸다 한 번 더 */
async function runDuels(page: Page): Promise<void> {
  await page.locator(".bp-settings select").nth(2).selectOption("4");
  await page.locator(".bp-settings select").nth(3).selectOption("60");
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(".bp-run").click();
    await expect(page.locator(".bp-run")).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
    if ((await page.locator(".bp-duel").count()) > 0) return;
    await page.waitForTimeout(16_000);
  }
  throw new Error("duels did not finish");
}

/** 시험이 일부러 받는 거절(규칙 문제 400·권한 없음 403·대결 속도 제한 429)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[]) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        /status of (400|403|429)/.test(error.text) &&
        /\/api\/trpc\/(tuning|balance)\./.test(error.text)
      ),
  );

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("칸을 담으면 기여가 '지금 → 고침', 승률 여섯 줄, 적용하면 세계에 바로 들고 되돌리기 적용이면 팩 값", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await screenReady(page);
    await resetTuning(page);
    await page.reload();
    await expect(page.locator(".bp-screen")).toHaveAttribute("data-status", "ready");
    await expect(page.locator(".bp-weights tbody tr")).toHaveCount(18);
    const hpBefore = await previewHp(page);

    await stageCell(page, "hp", "vit", "6000");
    await expect(page.locator(".bp-staged")).toHaveAttribute("data-count", "1");
    // 기여: HP 줄 VIT 열이 +30 → +60
    await expect(page.locator(".bp-contrib td[data-changed]").first()).toBeVisible();
    await expect(page.locator(".bp-contrib")).toContainText("+30 → +60");
    await expect(page.locator(".bp-flag").first()).toHaveAttribute("data-tone", "ok");

    await runDuels(page);
    await expect(page.locator(".bp-duel")).toHaveCount(6);
    // 담은 칸이 있어 고친 표 막대도 있다
    await expect(page.locator(".bp-duel").first().locator(".bp-score")).toHaveCount(2);

    await page.locator(".bp-note-input").fill("e2e 가중치 시험");
    await page.locator(".bp-apply").click();
    await expect(page.locator(".bp-pending")).toHaveCount(0);
    await expect(cell(page, "hp", "vit")).toHaveAttribute("data-state", "override");
    await expect(page.locator(".bp-overrides")).toHaveAttribute("data-count", "1");
    // 다시 켜지 않아도 서버 화면 자료가 새 표를 쓴다(VIT 10 × 3 → × 6)
    expect(await previewHp(page)).toBeGreaterThan(hpBefore);
    // 설정 칸 패널 머리에도 보인다
    const list = await trpc(page, "tuning.list");
    expect(field(list.data, "statOverrides")).toBe(1);

    // 되돌리기(팩 값을 담음) → 적용
    await cell(page, "hp", "vit").locator(".bp-reset").click();
    await expect(cell(page, "hp", "vit")).toHaveAttribute("data-state", "staged");
    await page.locator(".bp-apply").click();
    await expect(cell(page, "hp", "vit")).toHaveAttribute("data-state", "pack");
    expect(await previewHp(page)).toBe(hpBefore);
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("모든 WIS 가중치를 0으로 담으면 가치 없는 1차: 미리 알리고 적용은 거절, 담은 칸은 남는다", async ({
    page,
    deviceErrors,
  }) => {
    await screenReady(page);
    await resetTuning(page);
    await page.reload();
    await expect(page.locator(".bp-screen")).toHaveAttribute("data-status", "ready");
    const rows = await page
      .locator(".bp-weights tbody tr")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-row") ?? ""));
    for (const row of rows) {
      const input = cell(page, row, "wis").locator("input");
      if ((await input.inputValue()) !== "0") await stageCell(page, row, "wis", "0");
    }
    const problem = message("ko", "dev_tuning_problem_stat_primary_unused");
    await expect(page.locator(".bp-pending-reject")).toContainText(problem);
    await expect(page.locator(".bp-flag[data-tone='bad']").first()).toBeVisible();
    await page.locator(".bp-apply").click();
    await expect(page.locator(".bp-screen [role='alert']").last()).toContainText(problem);
    await expect(page.locator(".bp-pending")).toBeVisible();
    await page.locator(".bp-pending-actions .button-small").first().click();
    await expect(page.locator(".bp-pending")).toHaveCount(0);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

/** 기준 유닛 1차 입력 여섯(화면 차례) */
const primaryValues = (page: Page) =>
  page
    .locator(".bp-primary-input")
    .evaluateAll((inputs) => inputs.map((input) => (input instanceof HTMLInputElement ? input.value : "")));
/** 열린 확인·이름 창의 [확인] */
const confirm = (page: Page) => page.locator(".bp-dialog .bp-dialog-confirm");

test.describe("개발자 프리셋", () => {
  test.use({ account: "dev" });

  test("팩 씨앗 셋, 고르면 칸을 채우고, 고쳐 저장·새로 만들기·이름 바꾸기·지우기, 고친 팩 프리셋은 팩 값으로", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await screenReady(page);
    await resetPresets(page);
    await page.reload();
    await expect(page.locator(".bp-screen")).toHaveAttribute("data-status", "ready");
    const select = page.locator(".bp-preset-select");
    // 자리 표시 + 팩 씨앗 셋. 처음 칸(새 사이보그 평균)과 같은 프리셋이 골라져 보인다
    await expect(select.locator("option")).toHaveCount(4);
    await expect(select).toHaveValue("new_cyborg");
    await expect(page.locator(".bp-preset-meta")).toHaveAttribute("data-source", "pack");

    // 고르기 → 칸 채움(1차 화면 차례 STR·VIT·INT·WIS·DEX·AGI, 무기)
    await select.selectOption("lv30_combat");
    expect(await primaryValues(page)).toEqual(["54", "54", "31", "31", "31", "31"]);
    await expect(page.locator(".bp-settings select").first()).toHaveValue("unarmed");
    await expect(page.locator(".bp-preset-save")).toHaveCount(0);

    // 칸을 고치면 "다름" → [이 프리셋에 저장] → 팩에서 고침
    await page.locator(".bp-primary-input").first().fill("60");
    await expect(page.locator(".bp-preset-modified")).toBeVisible();
    await page.locator(".bp-preset-save").click();
    await expect(page.locator(".bp-preset-meta")).toHaveAttribute("data-source", "edited");
    await expect(page.locator(".bp-preset-modified")).toHaveCount(0);
    await expect(select.locator("option[value='lv30_combat']")).toContainText(
      message("ko", "dev_balance_preset_source_edited"),
    );

    // 새 프리셋(지금 칸 = STR 60 전투형) → 이름 창
    await page.locator(".bp-preset-new").click();
    await expect(page.locator(".bp-dialog")).toBeVisible();
    await expect(confirm(page)).toHaveAttribute("aria-disabled", "true");
    await page.locator(".bp-preset-name-ko").fill("e2e 프리셋");
    await page.locator(".bp-preset-name-en").fill("E2E preset");
    await confirm(page).click();
    await expect(page.locator(".bp-dialog")).toBeHidden();
    await expect(page.locator(".bp-presets")).toHaveAttribute("data-selected", /^dev_[0-9a-f]{12}$/);
    await expect(page.locator(".bp-preset-meta")).toHaveAttribute("data-source", "custom");
    await expect(select.locator("option")).toHaveCount(5);

    // 이름 바꾸기
    await page.locator(".bp-preset-rename").click();
    await page.locator(".bp-preset-name-ko").fill("e2e 바꾼 이름");
    await confirm(page).click();
    await expect(page.locator(".bp-dialog")).toBeHidden();
    await expect(select.locator("option:checked")).toContainText("e2e 바꾼 이름");

    // 지우기(팀이 만든 것)
    await page.locator(".bp-preset-delete").click();
    await expect(page.locator(".bp-dialog")).toContainText("e2e 바꾼 이름");
    await confirm(page).click();
    await expect(select.locator("option")).toHaveCount(4);

    // 고친 팩 프리셋은 [팩 값으로]
    await select.selectOption("lv30_combat");
    expect((await primaryValues(page))[0]).toBe("60");
    await page.locator(".bp-preset-revert").click();
    await confirm(page).click();
    await expect(page.locator(".bp-preset-meta")).toHaveAttribute("data-source", "pack");
    await expect(page.locator(".bp-preset-revert")).toHaveCount(0);
    await resetPresets(page);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC balance.table·balance.duels는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/balance");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".bp-screen")).toHaveCount(0);
    expect((await trpc(page, "balance.table")).status).toBe(403);
    const duels = await trpc(
      page,
      "balance.duels",
      {
        primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
        weapon: "unarmed",
        count: 1,
        runs: 2,
        seed: 1,
        limitSec: 30,
        edits: [],
      },
      "query",
    );
    expect([duels.status, duels.code]).toEqual([403, "FORBIDDEN"]);
    const save = await trpc(page, "balance.savePreset", {
      id: null,
      expectedVersion: 0,
      values: {
        name: { ko: "가짜", en: "Fake" },
        primaries: { str: 10, vit: 10, int: 10, wis: 10, dex: 10, agi: 10 },
        weapon: "unarmed",
        count: 1,
        runs: 10,
        limitSec: 120,
      },
    });
    expect([save.status, save.code]).toEqual([403, "FORBIDDEN"]);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

const LAYOUTS: readonly { theme: Theme; language: Language; width: number; height: number }[] = (
  ["pastel", "dark"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390, height: 844 },
    { theme, language, width: 1440, height: 900 },
  ]),
);

async function fullShot(page: Page, name: string): Promise<void> {
  // 고정된 위 띠·하단 탭·건너뛰기 링크가 사진 가운데에 끼지 않게 숨긴다(설정 칸 패널 사진과 같은 결)
  const style = await page.addStyleTag({
    content: ".tabbar, .topbar, .frame-side, .skip-link { visibility: hidden !important; }",
  });
  await shot(page, name, { fullPage: true });
  await style.evaluate((element) => element.parentNode?.removeChild(element));
}

test.describe("배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ theme, language, viewport: { width, height } });

      test("세계 값 칸·담은 칸·기여·승률: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(180_000);
        await screenReady(page);
        await resetTuning(page);
        const list = await trpc(page, "tuning.list");
        const saved = await trpc(page, "tuning.save", {
          expectedRevision: field(list.data, "revision"),
          changes: [{ id: "evade.agi", value: 1400 }],
        });
        expect(saved.status).toBe(200);
        await page.reload();
        await expect(page.locator(".bp-screen")).toHaveAttribute("data-status", "ready");
        await stageCell(page, "hp", "vit", "4500");
        await stageCell(page, "physical_attack", "str", "2600");
        // 승률은 파스텔에서만 돌린다(대결 속도 제한), 다크는 비어 있는 상태를 찍는다
        if (theme === "pastel") await runDuels(page);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await fullShot(page, `balance-${theme}-${language}-${width}`);
        // 새 프리셋 창(이름 ko·en): 넘침·작은 누르는 곳 없음, 사진. 만들지 않고 닫는다
        await page.locator(".bp-preset-new").click();
        await expect(page.locator(".bp-dialog")).toBeVisible();
        await page
          .locator(".bp-preset-name-ko")
          .fill("아주 긴 프리셋 이름으로 넘침을 보는 시험 프리셋 하나둘");
        // 이름 상한(40자)을 꽉 채운 영어 이름: 받을 수 있는 값이라 [만들기]가 켜져 있다
        await page.locator(".bp-preset-name-en").fill("A long preset name that fits forty chars");
        await expect(page.locator(".bp-dialog .bp-dialog-confirm")).not.toHaveAttribute(
          "aria-disabled",
          "true",
        );
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `balance-preset-dialog-${theme}-${language}-${width}`);
        await page.keyboard.press("Escape");
        await expect(page.locator(".bp-dialog")).toBeHidden();
        await resetTuning(page);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }

  for (const language of ["ko", "en"] as const) {
    test.describe(`큰 숫자·${language}·390px`, () => {
      test.use({ theme: "pastel", language, viewport: { width: 390, height: 844 } });

      test("1차 10,000·가중치 100,000에서도 쪽이 가로로 밀리지 않는다", async ({ page, deviceErrors }) => {
        await screenReady(page);
        const inputs = page.locator(".bp-primary-input");
        for (let index = 0; index < 6; index++) await inputs.nth(index).fill("10000");
        await stageCell(page, "hp", "str", "100000");
        await stageCell(page, "evade", "half", "10000000");
        // HP = STR 1,000,000 + DEX 10,000 + AGI 15,000 + VIT 30,000 + INT 10,000 + WIS 12,000
        await expect(page.locator(".bp-contrib")).toContainText("1,077,000");
        expect(await horizontalOverflow(page)).toEqual([]);
        await fullShot(page, `balance-big-${language}-390`);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }
});
