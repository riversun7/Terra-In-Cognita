// 계산식 탭 시험 — 밸런스 화면(/dev/balance) 안 계산식 탭(docs/adr/2026-11-01-formula-editor.md "화면", 사용자 결정 D-488).
// - dev: HP 행 식에 오타(STRR)를 넣으면 위치와 "STR로 고치기"가 뜨고 담기가 막힌다 → 고치면 "식이 맞습니다", 결과·항마다 풀이·1차 영향
//   여섯 줄. 담기 → [적용]이면 그 세계에 바로 든다(세계에서 바꾼 식 1, 시안 유닛 HP가 오름). 팩 식으로 되돌리기 → 적용이면 HP가 돌아온다.
//   이름 자동 완성(fl → floor(), Enter). 맨손 일반 공격 식: Lv 30 균형형·맨손이면 굴림 0 → 13, 9999 → 27(10 상한 없음).
// - player: tRPC formulas.list는 403.
// - 배치·사진: 390·1440 × 파스텔·다크 × 한국어·영어(오류 상태를 펼친 채). 가로 넘침·작은 누르는 곳 없음.
// 시험끼리 서버·DB를 같이 쓴다: 바꾸는 시험은 처음과 끝에 덮어쓰기를 모두 지운다(밸런스 화면 시험과 같은 결).
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

async function tabReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".fx-tab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
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
    await expect(page.locator(".fx-tab")).toHaveAttribute("data-status", "ready");
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

    await pick(page, "hp.formula");
    await page.locator(".fx-revert").click();
    await page.locator(".fx-apply").click();
    await expect(page.locator(".fx-overrides")).toHaveAttribute("data-count", "0");
    expect(await previewHp(page)).toBe(hpBefore);
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("이름 자동 완성과 맨손 일반 공격(10 상한 없음)", async ({ page, deviceErrors }) => {
    await tabReady(page);
    await pick(page, "crit_multiplier");
    const input = page.locator(".fx-input");
    await input.fill("fl");
    await expect(page.locator(".fx-suggest li").first()).toContainText("floor()");
    await input.press("Enter");
    await expect(input).toHaveValue("floor(");

    await pick(page, "bare_attack");
    await page.locator(".fx-controls select").nth(1).selectOption("even_lv30");
    // 굴림 중간 5000: 13.806 + 13.845 × 0.5 = 20.7 → 20, 굴림 0 → 13, 9999 → 27
    await expect(page.locator(".fx-result-value")).toHaveText(/^20/);
    await expect(page.locator(".fx-preview")).toContainText("13");
    await expect(page.locator(".fx-preview")).toContainText("27");
    await expect(page.locator(".fx-unused")).toHaveCount(0);
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

const LAYOUTS: readonly { theme: Theme; language: Language; width: number; height: number }[] = (
  ["pastel", "dark"] as const
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
      test.use({ theme, language, viewport: { width, height } });

      test("오류를 펼친 식 칸·미리 보기·적정치 표: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(90_000);
        await tabReady(page);
        await pick(page, "bare_attack");
        await page.locator(".fx-controls select").nth(1).selectOption("even_lv30");
        await expect(page.locator(".fx-result-value")).toBeVisible();
        await page.locator(".fx-tab").scrollIntoViewIfNeeded();
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `formulas-${theme}-${language}-${width}`);
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
