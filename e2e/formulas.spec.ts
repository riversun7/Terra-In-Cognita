// 계산식 탭 시험 — 밸런스 화면(/dev/balance)의 [계산식] 탭(docs/adr/2026-11-01-formula-editor.md "화면", 사용자 결정 D-488).
// - dev: [계산식] 탭을 연다. HP 행 식에 오타(STRR)를 넣으면 위치와 "STR로 고치기"가 뜨고 담기가 막힌다 → 고치면 "식이 맞습니다", 결과·항마다 풀이·1차 영향
//   여섯 줄. 담기 → [적용]이면 그 세계에 바로 든다(세계에서 바꾼 식 1, 시안 유닛 HP가 오름, [가중치 표]의 HP 행에 계산식 표시).
//   팩 식으로 되돌리기 → 적용이면 HP가 돌아온다.
//   이름 자동 완성(fl → floor(), Enter). 맨손 일반 공격 식: Lv 30 균형형·맨손이면 굴림 0 → 13, 9999 → 27(10 상한 없음).
//   적정 STA 식(D-511): Lv 1 → 10, Lv 30 → 39. 스태미나 표: 보통 표본은 모든 무기로 일반 공격이 이어진다.
// - player: tRPC formulas.list는 403.
// - 배치·사진: 390·1440 × 네온·라이트 × 한국어·영어(오류 상태를 펼친 채). 가로 넘침·작은 누르는 곳 없음.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(밸런스 화면 시험과 같은 결).
// 사용자별 조회 속도 제한(설정 칸 계열 순간 30·분당 120)도 같이 쓴다: 배치·사진 시험은 서버 상태를 바꾸지 않으므로 화면을 여는
// 조회를 처음 한 번만 서버에 묻는다(replayTrpc, 밸런스 화면 시험과 같은 결).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { createTrpcReplay, replayTrpc } from "./helpers/trpc.ts";

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

/** 덮어쓰기를 모두 지운다(설정 칸·가중치 칸·계산식) */
async function resetTuning(page: Page): Promise<void> {
  const list = await trpc(page, "tuning.list");
  const revision = field(list.data, "revision");
  if (typeof revision !== "number") throw new Error(`tuning.list ${list.status}`);
  const reverted = await trpc(page, "tuning.revertAll", { expectedRevision: revision });
  if (reverted.status !== 200) throw new Error(`tuning.revertAll ${reverted.status}`);
}

/** 시안 유닛 첫 줄의 HP(서버 화면 자료가 실효 표·행 식으로 계산한다) */
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

/** [계산식] 탭을 열고 식 목록이 뜰 때까지(밸런스 화면은 [전투 실험실] 탭으로 열린다) */
async function openFormulas(page: Page): Promise<void> {
  await page.locator("#bp-tab-formulas").click();
  await expect(page.locator(".fx-tab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

async function tabReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".bp-screen")).toBeVisible({ timeout: 20_000 });
  await openFormulas(page);
}

/** 칸을 고른다(칸이 바뀌면 입력 칸을 새로 만든다) */
async function pick(page: Page, key: string): Promise<void> {
  await page.locator(".fx-slot-select").selectOption(key);
  await expect(page.locator(`.fx-slot[data-slot="${key}"]`)).toBeVisible();
}

/** 시험이 일부러 받는 거절(403)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[]) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        /status of (400|403)/.test(error.text) &&
        /\/api\/trpc\/(tuning|formulas|balance)\./.test(error.text)
      ),
  );

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("오타는 위치와 고치기, 맞으면 풀이·1차 영향, 적용하면 세계에 바로 들고 되돌리기 적용이면 팩 식", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await tabReady(page);
    await resetTuning(page);
    await page.reload();
    await openFormulas(page);
    const hpBefore = await previewHp(page);
    await pick(page, "hp.formula");
    const input = page.locator(".fx-input");
    await expect(input).toHaveValue("STR * 1.5 + DEX + AGI * 1.5 + VIT * 3 + INT + WIS * 1.2 + GEAR + BUFF");
    // 새 사이보그: 15 + 10 + 15 + 30 + 10 + 12 = 92
    await expect(page.locator(".fx-result-value")).toHaveText(/^92/);
    await expect(page.locator(".fx-influence > li")).toHaveCount(6);
    await expect(page.locator(".fx-terms").last()).toContainText("VIT(10) × 3");

    await input.fill("VIT * 10 + STRR + DEX + AGI + INT + WIS");
    await expect(page.locator(".fx-issues li[data-code='unknown_name']")).toContainText("STRR");
    await expect(page.locator(".fx-stage")).toHaveAttribute("aria-disabled", "true");
    await page.locator(".fx-fix").click();
    await expect(input).toHaveValue("VIT * 10 + STR + DEX + AGI + INT + WIS");
    await expect(page.locator(".fx-ok")).toHaveText(message("ko", "dev_formula_ok"));
    await expect(page.locator(".fx-result-value")).toHaveText(/^150/);

    await page.locator(".fx-stage").click();
    await expect(page.locator(".fx-staged")).toHaveAttribute("data-count", "1");
    await page.locator(".fx-note-input").fill("e2e 식 시험");
    await page.locator(".fx-apply").click();
    await expect(page.locator(".fx-pending")).toHaveCount(0);
    await expect(page.locator(".fx-overrides")).toHaveAttribute("data-count", "1");
    expect(await previewHp(page)).toBeGreaterThan(hpBefore);
    // [가중치 표] 탭은 식으로 셈하는 행을 표시한다(그 행의 가중치 칸은 듣지 않는다)
    await page.locator("#bp-tab-weights").click();
    await expect(page.locator('.bp-weights tr[data-row="hp"]')).toHaveAttribute("data-formula", "world", {
      timeout: 20_000,
    });
    await expect(page.locator('.bp-weights tr[data-row="hp"] .bp-formula')).toBeVisible();
    await expect(page.locator('.bp-weights tr[data-row="mp"]')).not.toHaveAttribute("data-formula");
    await expect(page.locator('.bp-legend [data-state="formula"]')).toBeVisible();
    await page.locator("#bp-tab-formulas").click();

    await pick(page, "hp.formula");
    await page.locator(".fx-revert").click();
    await page.locator(".fx-apply").click();
    await expect(page.locator(".fx-overrides")).toHaveAttribute("data-count", "0");
    expect(await previewHp(page)).toBe(hpBefore);
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("이름 자동 완성과 맨손 적정 식(D-502: 레벨 × 1.5 + 10)", async ({ page, deviceErrors }) => {
    await tabReady(page);
    await pick(page, "crit_multiplier");
    const input = page.locator(".fx-input");
    await input.fill("fl");
    await expect(page.locator(".fx-suggest li").first()).toContainText("floor()");
    await input.press("Enter");
    await expect(input).toHaveValue("floor(");

    await pick(page, "bare_appropriate");
    await page.locator(".fx-controls select").nth(1).selectOption("even_lv30");
    // Lv 30 맨손 적정 = 30 × 1.5 + 10 = 55
    await expect(page.locator(".fx-result-value")).toHaveText(/^55/);
    await expect(page.locator(".fx-unused")).toHaveCount(0);
    // 맨손 명중(Lv 30 균형형 DEX 39) = 850 × 39 ÷ 55 → 602‰
    await pick(page, "real_hit");
    await expect(page.locator(".fx-result-value")).toHaveText(/^602/);
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("적정 STA 식(D-511: 보통 유닛 STA 점수, Lv 1 → 10·Lv 30 → 39)과 스태미나 표(일반 공격 이어짐)", async ({
    page,
    deviceErrors,
  }) => {
    await tabReady(page);
    await pick(page, "stamina_appropriate");
    await expect(page.locator(".fx-result-value")).toHaveText(/^10(?!\d)/);
    const stamina = page.getByTestId("formula-stamina");
    await expect(stamina.getByTestId("formula-stamina-unit")).toContainText("10");
    await page.locator(".fx-controls select").nth(1).selectOption("even_lv30");
    await expect(page.locator(".fx-result-value")).toHaveText(/^39(?!\d)/);
    // Lv 30 균형형: 소모 10·회복 초당 12 → 모든 무기 줄이 이어짐
    const rows = stamina.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(3);
    await expect(stamina.locator('tbody tr[data-sustain="drains"]')).toHaveCount(0);
    await expect(stamina.locator('tr[data-weapon="test_sword"] td').first()).toHaveText("10");
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("tRPC formulas.list는 403", async ({ page, deviceErrors }) => {
    await page.goto("/");
    const list = await trpc(page, "formulas.list");
    expect([list.status, list.code]).toEqual([403, "FORBIDDEN"]);
    expect(unexpected(deviceErrors)).toEqual([]);
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

/** 배치·사진 시험(admin)이 함께 쓰는 서버 답 */
const layoutReplay = createTrpcReplay();
/** 화면을 열 때 부르는 조회: 실험실 목록·프리셋·미리 보기(기본 탭), 식 목록 */
const LAYOUT_READS = [
  "battleLab.catalog",
  "battleLab.presets",
  "battleLab.preview",
  "formulas.list",
] as const;

test.describe("배치·사진", () => {
  test.use({ account: "admin" });
  test.beforeEach(async ({ page }) => {
    await replayTrpc(page, layoutReplay, LAYOUT_READS);
  });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ devTheme: theme, language, viewport: { width, height } });

      test("오류를 펼친 식 칸·미리 보기·적정치 표: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(90_000);
        await tabReady(page);
        await pick(page, "bare_appropriate");
        await page.locator(".fx-controls select").nth(1).selectOption("even_lv30");
        await expect(page.locator(".fx-result-value")).toBeVisible();
        await page.locator(".fx-tab").scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `formulas-${theme}-${language}-${width}`);
        // 적정 STA 식과 스태미나 표(D-511)
        await pick(page, "stamina_appropriate");
        await expect(page.locator(".fx-result-value")).toHaveText(/^39/);
        await page.getByTestId("formula-stamina").scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `formulas-stamina-${theme}-${language}-${width}`);
        // 오류 상태
        await pick(page, "hp.formula");
        await page.locator(".fx-input").fill("VIT * 3 + STRR");
        await expect(page.locator(".fx-issues li").first()).toBeVisible();
        await page.locator(".fx-slot").scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `formulas-error-${theme}-${language}-${width}`);
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }
});
