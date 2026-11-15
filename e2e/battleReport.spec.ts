// 전투 보고서 시험 — /dev/balance [전투 보고서]·[보고서 기록] (docs/adr/2026-11-14-battle-report.md).
// - dev: 파티 대 파티 20판 → 보고서(점수·신뢰 구간·전투 시간·편·유닛 표·피해 흐름 16단계·가장 크게 줄인 단계·표본 한 대 풀이) →
//   [보고서 기록]에서 이름으로 찾기 → 열기 → N번째 판 한 대 풀이 → 다시 돌리기 → 둘 골라 견주기. 웨이브 공성 4판은 공성 칸이 나온다.
// - 실제 세계 도시(기획 D-543·D-545 1383): 도시 고르기(찾기 목록) → 실제 도시 수비·팀 A 군단 파티 둘로 파티 공성 4판 → 보고서의 도시 칸
//   (스냅숏·지금 도시와 같음)·군단 모양. 웨이브 팀 수비(1384): 팀 B 군단이 지키는 웨이브 4판 → 파티 유닛 줄.
// - 파티·군단 명령(기획 D-549): 팀 A 파티 둘 + 군단 전진·2번 파티 자리 지키기, 팀 B 목표 공격 → 20판 보고서의 명령 거절 칸·군단 모양,
//   한 판도 군단 전체(사용자 1469 — 2번 파티 유닛 A2·1이 결과 표에). 공성은 공격 변 무작위(1465)라 보고서에 변마다 판 수.
// - player: tRPC battleReport.*는 403.
// - 사진: 보고서(피해 흐름 포함)·기록 목록·실제 도시 설정 판·명령 칸 × 네온 다크·라이트 × 390·1440. 가로 넘침 없음.
// 보고서 일은 서버 전체 한 번에 하나라 같은 파일 안 시험은 차례로 돈다(describe.serial).
import type { Page } from "@playwright/test";
import { elementShot, horizontalOverflow, shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

/** 이 실행만의 이름(시험끼리 DB를 같이 쓴다) */
const RUN_TAG = `E2E ${Date.now().toString(36)}`;

async function reportReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".bl-lab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

/** 공성 종류에서 실제 세계 도시를 고른다(목록 첫 고를 수 있는 도시). 고른 도시 ID */
async function pickWorldCity(page: Page): Promise<string> {
  await page.locator(".rp-layout").selectOption("world");
  const city = page.locator(".rp-city");
  await expect(city).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  const item = city.locator(".rp-city-item:not([disabled])").first();
  await item.click();
  await expect(item).toHaveAttribute("aria-pressed", "true");
  return (await item.getAttribute("data-city-id")) ?? "";
}

/** 보고서 시작이 바쁨·속도 제한(429)으로 한 번 밀린 기록은 뺀다(runReport가 기다렸다 다시 누른다 — 같은 계정이 앞 시험에서 여러 번 돌렸다) */
const withoutBusy = (errors: readonly { readonly text: string }[]) =>
  errors.filter((error) => !(error.text.includes("429") && error.text.includes("battleReport.start")));

/** 보고서를 돌리고 끝날 때까지(바쁘면 기다렸다 다시) */
async function runReport(page: Page, name: string): Promise<void> {
  await page.locator(".rp-name").fill(name);
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.locator(".rp-run").click();
    await expect(page.locator(".rp-run")).not.toHaveAttribute("aria-disabled", "true", { timeout: 120_000 });
    if ((await page.locator(".rp-latest .rp-report").count()) > 0) return;
    await page.waitForTimeout(5_000);
  }
  throw new Error("report did not finish");
}

test.describe
  .serial("개발자", () => {
    test.use({ account: "dev" });

    test("파티 대 파티 20판 보고서: 승패·표·피해 흐름·한 대 풀이, 기록에서 찾기·열기·다시 돌리기·견주기", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(300_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='arena']").click();
      await page.locator(".rp-runs").selectOption("20");
      await runReport(page, `${RUN_TAG} arena`);
      const report = page.locator(".rp-latest .rp-report");
      await expect(report.locator("[data-testid='report-score']")).toHaveText(/%$/);
      await expect(report.locator(".rp-sides tbody tr")).toHaveCount(2);
      await expect(report.locator(".rp-units tbody tr")).toHaveCount(8);
      // 피해 흐름: 판정 차례 16단계, 가장 크게 줄인 단계 표시
      await expect(report.locator(".rp-flow-step")).toHaveCount(16);
      await expect(report.locator(".rp-flow-step[data-extreme='loss']")).toHaveCount(1);
      await expect(report.locator(".rp-flow-step").first()).toHaveAttribute("data-stage", "attack");
      await expect(report.locator(".rp-flow-step").last()).toHaveAttribute("data-stage", "applied");
      // 표본 한 대 풀이
      await report.locator(".rp-sample").first().click();
      await expect(report.locator(".rp-trace .rp-trace-step").first()).toBeVisible();
      // 기록: 이름으로 찾기 → 열기 → 2번 판 한 대 풀이
      await page.locator("#bp-tab-log").click();
      const log = page.locator(".rp-log");
      await expect(log).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
      await log.locator(".rp-log-name").fill(RUN_TAG);
      await expect(log.locator(".rp-log-item")).toHaveCount(1, { timeout: 20_000 });
      await log.locator(".rp-log-open").first().click();
      const opened = log.locator(".rp-report");
      await expect(opened.locator(".rp-flow-step")).toHaveCount(16, { timeout: 20_000 });
      await opened.locator(".rp-trace-load input").fill("2");
      await opened.locator(".rp-trace-load input").press("Enter");
      await opened.locator(".rp-trace-run").click();
      await expect(opened.locator(".rp-trace-pick .rp-trace-step").first()).toBeVisible({ timeout: 60_000 });
      // 다시 돌리기 → 보고서 탭에서 같은 입력으로 돈다 → 기록이 둘
      await log.locator(".rp-log-rerun").first().click();
      await expect(page.locator("#bp-tab-report")).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".rp-run")).not.toHaveAttribute("aria-disabled", "true", {
        timeout: 120_000,
      });
      await expect(page.locator(".rp-latest .rp-report")).toBeVisible();
      await page.locator("#bp-tab-log").click();
      await page.locator(".rp-log .rp-log-name").fill(RUN_TAG);
      await expect(page.locator(".rp-log .rp-log-item")).toHaveCount(2, { timeout: 20_000 });
      for (const pick of await page.locator(".rp-log .rp-log-pick input").all()) await pick.check();
      await page.locator(".rp-compare-run").click();
      // 같은 설정·같은 시드 → 견주기 차이는 모두 0
      const deltas = page.locator(".rp-compare-view .rp-compare td[data-sign]");
      await expect(deltas.first()).toBeVisible({ timeout: 20_000 });
      for (const sign of await deltas.evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute("data-sign")),
      ))
        expect(sign).toBe("zero");
      expect(deviceErrors).toEqual([]);
    });

    test("A/B의 B 계산식(D-560 1381): 식 칸을 고르면 지금 식이 채워지고, 같은 식이면 B 결과가 A와 같다", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(300_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='arena']").click();
      await page.locator(".rp-runs").selectOption("20");
      await page.locator(".rp-variant-toggle").check();
      await page.locator(".rp-formula-add").click();
      const row = page.locator(".rp-formula-row").first();
      const key = row.locator(".rp-formula-key");
      // 식 칸 목록(formulas.list)이 오면 첫 칸을 고른다 → 지금 세계 식이 글에 채워진다
      await expect(key.locator("option")).not.toHaveCount(1, { timeout: 20_000 });
      const first = await key.locator("option").nth(1).getAttribute("value");
      await key.selectOption(first ?? "");
      await expect(row.locator(".rp-formula-source")).not.toHaveValue("");
      await runReport(page, `${RUN_TAG} formula ab`);
      const report = page.locator(".rp-latest .rp-report");
      await expect(report.locator(".rp-show[data-which='b']")).toBeVisible();
      // 같은 식(공통 난수) → A와 B의 점수가 같다
      const scoreA = await report.locator("[data-testid='report-score']").textContent();
      await report.locator(".rp-show[data-which='b']").click();
      await expect(report.locator("[data-testid='report-score']")).toHaveText(scoreA ?? "");
      // 읽히지 않는 식은 시작이 거절되고 까닭을 보인다
      await row.locator(".rp-formula-source").fill("((");
      await page.locator(".rp-run").click();
      await expect(page.locator(".bl-lab")).toContainText(/변수로 읽히지 않습니다|does not parse/, {
        timeout: 20_000,
      });
      // 다음 시험을 위해 A/B를 끈다(폼은 기기에 남는다)
      await page.locator(".rp-formula-row button").first().click();
      await page.locator(".rp-variant-toggle").uncheck();
      expect(
        deviceErrors.filter(
          (error) => !(error.text.includes("400") && error.text.includes("battleReport.start")),
        ),
      ).toEqual([]);
    });

    test("웨이브 공성 4판: 공성 칸(넥서스·성벽)과 무리 줄", async ({ page, deviceErrors }) => {
      test.setTimeout(300_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='wave']").click();
      await page.locator(".rp-runs").selectOption("4");
      await page.locator(".rp-limit").selectOption("300");
      await runReport(page, `${RUN_TAG} wave`);
      const report = page.locator(".rp-latest .rp-report");
      await expect(report.locator(".rp-siege")).toBeVisible();
      await expect(report.locator(".rp-units tbody tr")).toHaveCount(3);
      await page.locator(".rp-mode[data-mode='arena']").click();
      // 앞 시험(A/B 계산식)이 시작을 여러 번 눌러 속도 제한(429)에 한 번 밀릴 수 있다 — runReport가 기다렸다 다시 누른다
      expect(withoutBusy(deviceErrors)).toEqual([]);
    });
  });

test.describe
  .serial("개발자: 실제 도시·웨이브 팀 수비·군단", () => {
    test.use({ account: "dev" });

    test("파티·군단 명령 20판·군단 전체 한 판: 명령 칸 → 보고서 명령 칸·군단 모양, 한 판에 2번 파티 유닛", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(300_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='arena']").click();
      const teamA = page.locator(".rp-legion-team[data-team='a']");
      await teamA.locator(".rp-party-add").click();
      const ordersA = page.locator(".rp-orders[data-team='a']");
      // 군단 전체 진형 전진(새 명령 기본값) + 2번 파티 자리 지키기
      await ordersA.locator(".rp-order-add").click();
      await ordersA.locator(".rp-order-add").click();
      const hold = ordersA.locator(".rp-order").nth(1);
      await hold.locator(".rp-order-who").selectOption("1");
      await hold.locator(".rp-order-kind").selectOption("hold");
      // 팀 B: 목표 공격(상대 1번 파티 첫 유닛)
      const ordersB = page.locator(".rp-orders[data-team='b']");
      await ordersB.locator(".rp-order-add").click();
      await ordersB.locator(".rp-order").first().locator(".rp-order-kind").selectOption("attack");
      await expect(ordersB.locator(".rp-order-target")).toHaveValue("0.0");
      await page.locator(".rp-runs").selectOption("20");
      await runReport(page, `${RUN_TAG} orders`);
      const report = page.locator(".rp-latest .rp-report");
      await expect(report.locator(".rp-orders-result")).toBeVisible();
      await expect(report.locator(".rp-legion-view li[data-team='a']")).toContainText("2");
      // 한 판도 군단 전체(1469): 결과 표에 2번 파티 유닛
      await page.locator(".bl-battle").click();
      await expect(page.locator(".bl-result")).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(".bl-unit-key", { hasText: "A2·1" })).toHaveCount(1);
      // 다음 시험을 위해 명령·파티를 거둔다(명령은 이 기기에 남는다)
      for (const orders of [ordersA, ordersB])
        while ((await orders.locator(".rp-order-remove").count()) > 0)
          await orders.locator(".rp-order-remove").first().click();
      await teamA.locator(".rp-party-remove").click();
      expect(withoutBusy(deviceErrors)).toEqual([]);
    });

    test("실제 도시 파티 공성 4판: 도시 고르기·실제 수비·팀 A 군단 파티 둘 → 도시 칸(지금과 같음)·군단 모양", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(300_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='siege']").click();
      const cityId = await pickWorldCity(page);
      await page.locator(".rp-defense-btn[data-defense='world']").click();
      await expect(page.locator(".rp-legion-team[data-team='b']")).toHaveCount(0);
      // 팀 A 군단: 파티 더하기 → 파티 2 탭이 골라진다
      const teamA = page.locator(".rp-legion-team[data-team='a']");
      await teamA.locator(".rp-party-add").click();
      await expect(teamA.locator(".rp-party-tab[data-party='1']")).toHaveAttribute("aria-selected", "true");
      await page.locator(".rp-runs").selectOption("4");
      await page.locator(".rp-limit").selectOption("300");
      await runReport(page, `${RUN_TAG} city`);
      const report = page.locator(".rp-latest .rp-report");
      await expect(report.locator(".rp-city-info")).toHaveAttribute("data-city-id", cityId);
      await expect(report.locator(".rp-city-check")).toHaveAttribute("data-state", /same|changed/, {
        timeout: 20_000,
      });
      await expect(report.locator(".rp-legion-view li[data-team='a']")).toContainText("2");
      await expect(report.locator(".rp-units tbody tr[data-row='defenders']")).toHaveCount(1);
      await expect(report.locator(".rp-siege")).toBeVisible();
      // 공격 변 무작위(1465 — 새 폼 기본값): 변마다 판 수
      await expect(report.locator(".rp-edges")).toBeVisible();
      expect(withoutBusy(deviceErrors)).toEqual([]);
    });

    test("웨이브 팀 수비 4판: 팀 B 군단이 지킨다(파티 유닛 줄)", async ({ page, deviceErrors }) => {
      test.setTimeout(300_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='wave']").click();
      await page.locator(".rp-layout").selectOption("city");
      await page.locator(".rp-defense-btn[data-defense='party']").click();
      await expect(page.locator(".rp-legion-team[data-team='b']")).toBeVisible();
      await expect(page.locator(".rp-legion-team[data-team='a']")).toHaveCount(0);
      await page.locator(".rp-runs").selectOption("4");
      await page.locator(".rp-limit").selectOption("300");
      await runReport(page, `${RUN_TAG} wave team`);
      const report = page.locator(".rp-latest .rp-report");
      await expect(report.locator(".rp-units tbody tr[data-row^='b0.']").first()).toBeVisible();
      await expect(report.locator(".rp-units tbody tr[data-row='defenders']")).toHaveCount(0);
      await page.locator(".rp-defense-btn[data-defense='sim']").click();
      await page.locator(".rp-mode[data-mode='arena']").click();
      expect(withoutBusy(deviceErrors)).toEqual([]);
    });
  });

test.describe("권한", () => {
  test.use({ account: "player" });
  test("player는 battleReport 목록 403", async ({ page }) => {
    await page.goto("/");
    const status = await page.evaluate(async () => {
      const response = await fetch(
        `/api/trpc/battleReport.list?input=${encodeURIComponent(JSON.stringify({}))}`,
      );
      return response.status;
    });
    expect(status).toBe(403);
  });
});

for (const { theme, width, height } of [
  { theme: "neon", width: 390, height: 844 },
  { theme: "light", width: 390, height: 844 },
  { theme: "neon", width: 1440, height: 900 },
  { theme: "light", width: 1440, height: 900 },
] as const) {
  test.describe(`사진·${theme}·${width}px`, () => {
    test.use({ account: "dev", devTheme: theme, viewport: { width, height } });

    test("기록에서 연 보고서(피해 흐름·한 대 풀이)와 기록 목록: 가로 넘침 없음, 사진", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(120_000);
      await page.goto("/dev/balance?tab=log");
      const log = page.locator(".rp-log");
      await expect(log).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
      await expect(log.locator(".rp-log-item").first()).toBeVisible({ timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `battle-report-log-${theme}-${width}`);
      await log.locator(".rp-log-open").first().click();
      const opened = log.locator(".rp-report");
      await expect(opened.locator(".rp-flow-step").first()).toBeVisible({ timeout: 20_000 });
      const sample = opened.locator(".rp-sample").first();
      if ((await sample.count()) > 0) await sample.click();
      await opened.locator(".rp-report-head").scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `battle-report-${theme}-${width}`);
      await elementShot(opened.locator(".rp-flow-section"), `battle-report-flow-${theme}-${width}`);
      expect(deviceErrors).toEqual([]);
    });

    test("실제 도시 설정 판(도시 고르기·수비·군단 파티 탭): 가로 넘침 없음, 사진", async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(120_000);
      await reportReady(page);
      await page.locator(".rp-mode[data-mode='siege']").click();
      await pickWorldCity(page);
      await page.locator(".rp-defense-btn[data-defense='world']").click();
      await page.locator(".rp-legion-team[data-team='a'] .rp-party-add").click();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(page.locator(".rp-panel"), `battle-report-city-${theme}-${width}`);
      await elementShot(
        page.locator(".rp-legion-team[data-team='a']"),
        `battle-report-legion-${theme}-${width}`,
      );
      // 파티·군단 명령 칸(D-549): 군단 전진 + 2번 파티 자리 지키기, 공격 변 고르기(1465)
      const orders = page.locator(".rp-orders[data-team='a']");
      await orders.locator(".rp-order-add").click();
      await orders.locator(".rp-order-add").click();
      await orders.locator(".rp-order").nth(1).locator(".rp-order-who").selectOption("1");
      await orders.locator(".rp-order").nth(1).locator(".rp-order-kind").selectOption("hold");
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(page.locator(".rp-legion"), `battle-report-orders-${theme}-${width}`);
      await elementShot(page.locator(".rp-edge"), `battle-report-edge-${theme}-${width}`);
      while ((await orders.locator(".rp-order-remove").count()) > 0)
        await orders.locator(".rp-order-remove").first().click();
      // 다음 시험을 위해 파티 공성·시뮬 도시로 되돌린다(폼은 이 기기에 남는다)
      await page.locator(".rp-layout").selectOption("city");
      await page.locator(".rp-mode[data-mode='arena']").click();
      expect(deviceErrors).toEqual([]);
    });
  });
}
