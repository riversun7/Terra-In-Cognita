// 2차 스탯 에디터 화면 시험 — /dev/secondary-stats:
// - dev: 대상 목록(walk_speed 제외, stat_rows + 파생 전투식 구분), 초기 스탯 합 프리셋(30~80, 100), 4종 차트·비교표,
//   가중치 초안 담기·비우기, 모바일(390)·데스크톱(1440) 가로 넘침·작은 누르는 곳 없음.
// - 밸런스 화면에서 옮긴 판(docs/research/2026-11-14-dev-tools-overlap.md 5절): 무기별 스태미나·적정치 표(담은 식·가중치가 바로 든다),
//   1차 +10 대결 승률(지금 표 vs 담은 가중치 칸, 서버 balance.duels).
// - 식 글(사용자 결정 D-556): 편집 카드·차트 머리·목록 줄·비교표 줄에 값을 낸 식("크리 확률 = AGI + DEX (‰)"),
//   영향 카드는 식의 가중치(1차가 모두 같을 때 +10)와 이 분포에서의 기여 몫을 나눠 보인다. 390 × 네온·라이트 사진.
// - player: 권한 없음 화면.
import { elementShot, horizontalOverflow, smallTapTargets } from "./helpers/screen.ts";
import { message } from "./helpers/messages.ts";
import { expect, test } from "./helpers/test.ts";

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("목록·walk_speed 제외·초기 스탯 합 100·차트·가중치 담기/비우기", async ({ page, deviceErrors }) => {
    await page.goto("/dev/secondary-stats");
    await expect(page.locator(".sec-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator('.sec-target-btn[data-target="walk_speed"]')).toHaveCount(0);
    await expect(page.locator('.sec-target-btn[data-target="hp"]')).toBeVisible();
    await expect(page.locator('.sec-target-btn[data-target="combat:crit_multiplier"]')).toBeVisible();

    // 초기 스탯 합 프리셋 100 누르기 → 차트·시뮬레이션 반영
    const sum100 = page.locator(".sec-sum-btn", { hasText: "100" });
    await sum100.click();
    await expect(sum100).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".sec-chart-card svg.sec-svg")).toHaveCount(2);
    await expect(page.locator(".sec-matrix-table tbody tr")).not.toHaveCount(0);

    // HP의 VIT 가중치 수정 → 담기 막대 표시 → 모두 취소
    const vitInput = page.locator('.sec-cell[data-cell-key="hp.vit"] .sec-cell-input');
    const prevValue = await vitInput.inputValue();
    const nextValue = String(Number(prevValue) + 500);
    await vitInput.fill(nextValue);
    await vitInput.blur();
    await expect(page.locator(".sec-pending-bar")).toBeVisible();
    await page.locator(".sec-pending-actions button").first().click();
    await expect(page.locator(".sec-pending-bar")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("옮긴 판: 스태미나·적정치 표와 1차 +10 대결(담은 가중치 칸이 든 표와 견줌)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/dev/secondary-stats");
    await expect(page.locator(".sec-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const sustain = page.locator("[data-testid='sec-sustain']");
    await expect(sustain.locator("tbody tr").first()).toBeVisible();
    await expect(sustain.locator("tbody tr[data-weapon]")).not.toHaveCount(0);
    // 가중치 칸 하나를 담으면 대결 판이 "담은 칸 1개"로 견준다
    const vitInput = page.locator('.sec-cell[data-cell-key="hp.vit"] .sec-cell-input');
    await vitInput.fill(String(Number(await vitInput.inputValue()) + 2000));
    await vitInput.blur();
    const duels = page.locator("[data-testid='sec-duels']");
    await duels.locator(".sec-duel-runs").selectOption("4");
    await duels.locator(".sec-duel-run").click();
    await expect(duels.locator(".sec-duel-table tbody tr")).toHaveCount(6, { timeout: 90_000 });
    await expect(duels.locator(".sec-duel-table tbody tr").first().locator("td").nth(1)).toHaveText(/%$/);
    await page.locator(".sec-pending-actions button").first().click();
    expect(deviceErrors).toEqual([]);
  });

  for (const devTheme of ["neon", "light"] as const) {
    test.describe(`식 글 (${devTheme})`, () => {
      test.use({ devTheme });
      test(`식 글·식의 가중치·기여 몫 (390 ${devTheme})`, async ({ page, deviceErrors }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto("/dev/secondary-stats");
        await expect(page.locator(".sec-screen")).toHaveAttribute("data-status", "ready", {
          timeout: 20_000,
        });
        // 목록 줄에도 식 글(가중치 행 → 판정과 같은 행 식)
        await expect(page.locator('.sec-target-btn[data-target="hp"] .sec-formula-compact')).toContainText(
          "VIT × 3",
        );
        // 맨손 크리 대상: 편집 카드 = AGI + DEX(이름에 ‰가 있어 다시 붙이지 않는다), 0 아래면 0 한 줄
        await page.locator('.sec-target-btn[data-target="combat:bare_crit"]').click();
        const card = page.locator(".sec-edit-card [data-testid='sec-formula']");
        await expect(card.locator(".sec-formula-line")).toContainText(/= AGI \+ DEX$/);
        await expect(card.locator(".sec-formula-note")).toHaveText(
          message("ko", "formula_floor_note", { names: "AGI·DEX" }),
        );
        // 재능계: 기여 몫은 DEX가 크지만 식의 가중치는 AGI·DEX가 50%로 같다
        await page.locator(".sec-arch-btn", { hasText: message("ko", "dev_sec_arch_talent") }).click();
        const weight = page.locator('.sec-inf-part[data-kind="weight"]');
        const share = page.locator('.sec-inf-part[data-kind="share"]');
        await expect(weight.locator('.sec-inf-row[data-stat="agi"] .sec-inf-share')).toHaveText("50.0%");
        await expect(weight.locator('.sec-inf-row[data-stat="dex"] .sec-inf-share')).toHaveText("50.0%");
        await expect(weight.locator('.sec-inf-row[data-stat="str"] .sec-inf-share')).toHaveText("0.0%");
        const pct = async (stat: string) =>
          Number.parseFloat(
            (await share.locator(`.sec-inf-row[data-stat="${stat}"] .sec-inf-share`).textContent()) ?? "0",
          );
        expect(await pct("dex")).toBeGreaterThan(await pct("agi"));
        await expect(share.locator(".sec-inf-part-title")).toHaveText(
          message("ko", "dev_sec_chart_share_title"),
        );
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await elementShot(page.locator(".sec-edit-card"), `secondary-stats-formula-card-390-${devTheme}`);
        await elementShot(
          page.locator(".sec-chart-card").first(),
          `secondary-stats-formula-influence-390-${devTheme}`,
        );
        expect(deviceErrors).toEqual([]);
      });
    });
  }

  for (const width of [390, 1440] as const) {
    test(`배치: 폭 ${width}에서 가로 넘침·작은 누르는 곳 없음`, async ({ page, deviceErrors }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/dev/secondary-stats");
      await expect(page.locator(".sec-screen")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      await elementShot(page.locator(".sec-extras"), `secondary-stats-extras-${width}`);
      expect(deviceErrors).toEqual([]);
    });
  }
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면", async ({ page, deviceErrors }) => {
    await page.goto("/dev/secondary-stats");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(page.locator(".sec-layout")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });
});
