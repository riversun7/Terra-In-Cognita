// 밸런스 화면 시험 — /dev/balance [분포 상성]·[스탯 영향도] 탭 (docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)").
// [전투 보고서]·[보고서 기록]은 e2e/battleReport.spec.ts, 팀·유닛 편집·한 판은 e2e/battleLab.spec.ts. 옛 [가중치 표] 탭 시험은 탭과 함께 지웠다
// (2차 스탯 화면이 맡는다 — e2e/secondaryStats.spec.ts, docs/research/2026-11-14-dev-tools-overlap.md).
// - 분석: 작은 설정(짝마다 2판·30초)으로 돌리면 승률표·상성 요약·사양 표, 칸을 누르면 풀이. [스탯 영향도]는 순위 막대 여섯 줄·곡선·2차 변화 표.
//   결과는 서버 메모리에 남아(30분) 같은 계정이 화면을 다시 열면 이어 보인다 → 배치·사진 시험은 돌리지 않고 그 결과를 연다.
// - player: 권한 없음 화면, tRPC balance.table·balance.duels는 403.
import type { Locator, Page } from "@playwright/test";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { createTrpcReplay, replayTrpc } from "./helpers/trpc.ts";

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키, 묶지 않음 → replayTrpc를 거치지 않는다). 결과 data 또는 오류 코드·까닭 */
async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  kind: "query" | "mutation" = input === undefined ? "query" : "mutation",
): Promise<{ status: number; data: unknown; code: unknown; reason: unknown }> {
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
        reason: field(field(field(json, "error"), "data"), "reason"),
      };
    },
    { procedure, input, kind },
  );
}

/** 시험이 일부러 받는 거절(규칙 문제 400·권한 없음 403·대결 속도 제한 429)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[]) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        /status of (400|403|429)/.test(error.text) &&
        /\/api\/trpc\/(tuning|balance|balanceAnalysis)\./.test(error.text)
      ),
  );

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
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

// ── 분석 탭(분포 상성·스탯 영향도) ──

/** 배치·사진 묶음(개발 화면 테마 둘 × 언어 둘 × 390·1440) */
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = (
  ["neon", "light"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390, height: 844 },
    { theme, language, width: 1440, height: 900 },
  ]),
);

/** 배치·사진 시험이 함께 쓰는 서버 답(서버 상태를 바꾸지 않는 조회) */
const layoutReplay = createTrpcReplay();

/** 2차 스탯 화면 맨 아래 [스탯 영향도](기획 D-560 1376 — 밸런스 화면에서 옮김)를 연다 */
async function openInfluence(page: Page): Promise<Locator> {
  await page.goto("/dev/secondary-stats");
  const section = page.locator(".sec-influence");
  await section.locator(".sec-influence-toggle").click();
  await expect(section).toHaveAttribute("data-open", "true");
  const tab = section.locator(".an-sensitivity");
  await expect(tab).toBeVisible({ timeout: 30_000 });
  return tab;
}

/** 분석 탭을 열고 결과가 뜰 때까지(서버가 이 계정의 최근 일을 이어 보인다) */
async function analysisReady(page: Page, tab: "matrix" | "sensitivity"): Promise<void> {
  if (tab === "sensitivity") {
    await expect(await openInfluence(page)).toHaveAttribute("data-status", "done", { timeout: 60_000 });
    return;
  }
  await page.goto(`/dev/balance?tab=${tab}`);
  await expect(page.locator(`.an-${tab}`)).toHaveAttribute("data-status", "done", { timeout: 60_000 });
}

test.describe("분석", () => {
  test.use({ account: "admin" });

  test("분포 상성: 짝마다 2판·30초로 돌리면 승률표 6×6·상성 요약·사양 표, 칸을 누르면 풀이", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    // 기본 탭은 [전투 보고서](2026-11-14 개편) → 주소로 분포 상성 탭
    await page.goto("/dev/balance?tab=matrix");
    await expect(page.locator("#bp-tab-matrix")).toHaveAttribute("aria-selected", "true");
    const tab = page.locator(".an-matrix");
    await tab.locator('[data-field="runs"] select').selectOption("2");
    await tab.locator('[data-field="limit"] select').selectOption("30");
    await expect(tab.locator(".an-cost")).toContainText("30");
    await tab.locator(".an-run").click();
    await expect(tab).toHaveAttribute("data-status", "done", { timeout: 60_000 });
    await expect(tab.locator(".an-heat tbody tr")).toHaveCount(6);
    await expect(tab.locator(".an-heat-self")).toHaveCount(6);
    await tab.locator('.an-heat tbody tr[data-row="0"] td[data-col="1"] button').click();
    await expect(tab.locator(".an-detail")).toBeVisible();
    await expect(tab.locator(".an-rps-table tbody tr")).toHaveCount(6);
    await expect(tab.locator(".an-specs tbody tr")).toHaveCount(6);
    await expect(tab.locator(".an-progress-text")).toContainText("30");
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("스탯 영향도(2차 스탯 화면, D-560 1376): 변형마다 2판으로 돌리면 순위 막대 6줄·곡선·2차 변화 표·대조, 지표를 바꿔도 막대 6줄", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    // 옛 밸런스 탭 주소는 2차 스탯 화면으로 간다. 밸런스 화면에는 그 탭이 없다
    await page.goto("/dev/balance?tab=sensitivity");
    await expect(page).toHaveURL((url) => url.pathname === "/dev/secondary-stats");
    await page.goto("/dev/balance");
    await expect(page.locator("#bp-tab-sensitivity")).toHaveCount(0);
    const tab = await openInfluence(page);
    await tab.locator('.an-run-panel [data-field="runs"] select').selectOption("2");
    await tab.locator('[data-field="limit"] select').selectOption("30");
    await tab.locator(".an-run").click();
    await expect(tab).toHaveAttribute("data-status", "done", { timeout: 60_000 });
    await expect(tab.locator(".an-bar-row")).toHaveCount(6);
    await expect(tab.locator(".an-curve-svg")).toBeVisible();
    await expect(tab.locator(".an-curve .an-line")).toHaveCount(12);
    await expect(tab.locator('.an-effects tbody tr[data-row="hp"]')).toBeVisible();
    await expect(tab.locator(".an-control")).toBeVisible();
    await tab.locator('[data-field="metric"] select').selectOption("ehp");
    await expect(tab.locator(".an-bar-row")).toHaveCount(6);
    await expect(tab.locator('.an-bar-row[data-stat="vit"] .an-bar-fill')).toBeVisible();
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("분석 배치·사진", () => {
  test.use({ account: "admin" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({ devTheme: theme, language, viewport: { width, height } });

      for (const tab of ["matrix", "sensitivity"] as const)
        test(`${tab}: 결과 화면 가로 넘침·작은 누르는 곳 없음, 사진`, async ({ page, deviceErrors }) => {
          await replayTrpc(page, layoutReplay, ["battleLab.catalog", "battleLab.presets"]);
          await analysisReady(page, tab);
          if (tab === "matrix")
            await page.locator('.an-heat tbody tr[data-row="1"] td[data-col="0"] button').click();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `balance-${tab}-${theme}-${language}-${width}`);
          await elementShot(
            page.locator(".an-results"),
            `balance-${tab}-results-${theme}-${language}-${width}`,
          );
          expect(unexpected(deviceErrors)).toEqual([]);
        });
    });
  }
});

test.describe("분석 권한", () => {
  test.use({ account: "player" });

  test("tRPC balanceAnalysis.list·start는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/balance");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    expect((await trpc(page, "balanceAnalysis.list")).status).toBe(403);
    expect((await trpc(page, "balanceAnalysis.start", { kind: "matrix" })).status).toBe(403);
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("분석 나쁜 자료", () => {
  test.use({ account: "admin", devTheme: "neon", language: "en", viewport: { width: 390, height: 844 } });

  test("분포 10개·긴 이름(24자)·총합 둘(1,200·6,000): 승률표는 안에서만 밀고 쪽은 넘치지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    const labels = [
      "INT·WIS caster, staff v2 #1",
      "Glass cannon (very long)",
      "Jo",
      "균형 잡힌 기본 분포 이름이 길다",
      "STR focus warrior build",
      "DEX AGI evasive skirmisher",
      "VIT",
      "Tank with heavy armor set",
      "Striker STR DEX mix 50/50",
      "Custom 10",
    ];
    const builds = labels.map((label, index) => ({
      id: `custom_${index + 1}`,
      label: label.slice(0, 24),
      weights: {
        str: (index * 37) % 101,
        vit: (index * 53) % 97,
        int: index === 2 ? 0 : (index * 11) % 89,
        wis: (index * 29) % 83,
        dex: (index * 41) % 79,
        agi: index === 6 ? 1000 : (index * 17) % 73,
      },
      templateId: null,
    }));
    await page.addInitScript(
      (form) => {
        localStorage.setItem("terra.balanceAnalysis.v1.matrix", JSON.stringify(form));
      },
      {
        conditions: {
          templateId: "sample_new_cyborg",
          weapon: "keep",
          level: 999,
          mode: "sum",
          elements: "keep",
          skills: true,
          gear: true,
          teamSize: 1,
          limitSec: 30,
        },
        builds,
        sums: [1200, 6000],
        runs: 2,
        seed: 2_147_483_647,
      },
    );
    await page.goto("/dev/balance?tab=matrix");
    const tab = page.locator(".an-matrix");
    await expect(tab.locator(".an-build")).toHaveCount(10);
    await tab.locator(".an-run").click();
    await expect(tab).toHaveAttribute("data-status", "done", { timeout: 120_000 });
    await expect(tab.locator(".an-heat tbody tr")).toHaveCount(10);
    await page.locator(".an-results .an-chip").nth(1).click();
    await expect(tab.locator('.an-heat[data-sum="6000"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    expect(await horizontalOverflow(page)).toEqual([]);
    await elementShot(page.locator(".an-results"), "balance-matrix-worst-en-390");
    await elementShot(page.locator(".an-builds-panel"), "balance-matrix-worst-builds-en-390");
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});
