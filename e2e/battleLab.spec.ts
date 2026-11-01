// 전투 실험실 시험 — /dev/balance [전투 실험실] 탭 (docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)").
// - dev: 처음 열면 샘플 파티 둘(팀 A Lv 30 혼성 4명, 팀 B 크리쳐 무리 4명). 유닛을 고르고 레벨을 바꾸면 서버 미리 보기의 성장이 바뀐다.
//   [한 판]은 이긴 팀·유닛 8줄·사건 기록, [몬테카를로]는 팀 승률 막대 둘·유닛 8줄. 3D 관람은 재생 기록기 전에는 꺼져 있고 "준비 중".
//   유닛 프리셋: 새로 저장(이름 ko·en 창) → 이름 바꾸기 → 복제 → 지우기(확인 창). 샘플을 고르면 덮어쓰기·이름 바꾸기·지우기는 꺼진다.
//   새로 고치면 팀이 이 기기에 남아 있다(localStorage).
// - player: 권한 없음, tRPC battleLab.*는 403.
// - 배치·사진: 390·1440 × 파스텔·다크 × 한국어·영어. 가로 넘침·작은 누르는 곳 없음.
// 팀 프리셋은 시험끼리 DB를 같이 쓴다: 만든 프리셋은 시험 안에서 지운다.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";

/** 화면 안에서 tRPC를 부른다(같은 출처, 화면과 같은 쿠키) */
async function trpcStatus(page: Page, procedure: string, input?: unknown): Promise<number> {
  return page.evaluate(
    async ({ procedure: name, input: body }) => {
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = await fetch(`/api/trpc/${name}${query}`);
      return response.status;
    },
    { procedure, input },
  );
}

async function labReady(page: Page): Promise<void> {
  await page.goto("/dev/balance");
  await expect(page.locator(".bl-lab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(page.locator(".bl-preview .bl-secondary li").first()).toBeVisible({ timeout: 20_000 });
}

/** 시험이 일부러 받는 거절(권한 없음 403·속도 제한 429)의 브라우저 줄을 뺀 기기 오류 */
const unexpected = (errors: readonly { kind: string; text: string }[]) =>
  errors.filter(
    (error) =>
      !(
        error.kind === "console" &&
        /status of (403|429)/.test(error.text) &&
        /\/api\/trpc\/(battleLab|balance|tuning)\./.test(error.text)
      ),
  );

/** 단추를 누르고 결과가 뜰 때까지. 서버 전체 하나·사용자 속도 제한에 걸리면 기다렸다 한 번 더 */
async function runUntil(page: Page, button: string, result: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(button).click();
    await expect(page.locator(button)).not.toHaveAttribute("aria-disabled", "true", { timeout: 90_000 });
    if ((await page.locator(result).count()) > 0) return;
    await page.waitForTimeout(8_000);
  }
  throw new Error(`${button} did not finish`);
}

test.describe("개발자", () => {
  test.use({ account: "dev" });

  test("샘플 파티 둘, 레벨을 바꾸면 미리 보기 성장이 바뀌고, 한 판·몬테카를로 결과가 뜬다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    await labReady(page);
    await expect(page.locator(".bl-team[data-team='a'] .bl-unit")).toHaveCount(4);
    await expect(page.locator(".bl-team[data-team='b'] .bl-unit")).toHaveCount(4);
    // 3D 관람은 재생 기록기 전에는 꺼져 있다
    await expect(page.locator(".bl-watch")).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".bl-watch-hint")).toHaveText(message("ko", "dev_lab_watch_pending"));

    // 팀 A 둘째 유닛(전사)을 고르고 레벨 30 → 10
    await page.locator(".bl-team[data-team='a'] .bl-unit-pick").nth(1).click();
    await expect(page.locator(".bl-editor")).toHaveAttribute("data-unit", "A2");
    const str = page.locator(".bl-primary-view tr[data-field='str'] td").nth(1);
    await expect(str).toHaveText("58");
    const level = page.locator(".bl-level input");
    await level.fill("10");
    await level.press("Enter");
    // 14 × (1000 + 100 × 1100 × 9 ÷ 1000) ÷ 1000 = 27
    await expect(str).toHaveText("27");
    await expect(page.locator(".bl-team[data-team='a'] .bl-unit-name").nth(1)).toContainText("Lv 10");

    await runUntil(page, ".bl-battle", ".bl-result");
    await expect(page.locator(".bl-result .bl-summary-table tbody tr")).toHaveCount(8);
    await expect(page.locator(".bl-log li").first()).toBeVisible();
    await expect(page.locator(".bl-result")).toHaveAttribute("data-winner", /^(a|b|even)$/);

    await page.locator(".bl-runs").selectOption("10");
    await runUntil(page, ".bl-monte-run", ".bl-monte");
    await expect(page.locator(".bl-monte .bl-score")).toHaveCount(2);
    await expect(page.locator(".bl-monte .bl-summary-table tbody tr")).toHaveCount(8);

    // 팀을 고치면 결과는 "지난 입력"
    await level.fill("11");
    await level.press("Enter");
    await expect(page.locator(".bl-result-block[data-stale]").first()).toBeVisible();

    // 새로 고쳐도 팀이 이 기기에 남는다
    await page.reload();
    await expect(page.locator(".bl-lab")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator(".bl-team[data-team='a'] .bl-unit-name").nth(1)).toContainText("Lv 11");
    expect(unexpected(deviceErrors)).toEqual([]);
  });

  test("유닛 프리셋: 새로 저장 → 이름 바꾸기 → 복제 → 지우기, 샘플은 읽기 전용", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(120_000);
    await labReady(page);
    const bar = page.locator(".bl-editor .bl-presets");
    const select = bar.locator(".bl-preset-select");
    // 샘플을 고르면 고치는 단추는 꺼진다
    await select.selectOption("sample_lv30_tank");
    await expect(bar.locator(".bl-preset-overwrite")).toHaveAttribute("aria-disabled", "true");
    await expect(bar.locator(".bl-preset-delete")).toHaveAttribute("aria-disabled", "true");
    await bar.locator(".bl-preset-load").click();
    await expect(page.locator(".bl-kind-select")).toHaveValue("cyborg");

    // 새로 저장(이름 창)
    await select.selectOption("");
    await bar.locator(".bl-preset-new").click();
    const dialog = page.locator(".bl-dialog[open]");
    await dialog.locator("input").nth(0).fill("시험 탱커");
    await dialog.locator("input").nth(1).fill("E2E tank");
    await dialog.locator("button[type='submit']").click();
    await expect(page.locator(".bl-lab [role='status']").first()).toContainText("시험 탱커");
    await expect(select).not.toHaveValue("");
    // 이름 바꾸기
    await bar.locator(".bl-preset-rename").click();
    await dialog.locator("input").nth(0).fill("시험 탱커 2");
    await dialog.locator("button[type='submit']").click();
    await expect(select.locator("option:checked")).toHaveText("시험 탱커 2");
    // 복제
    await bar.locator(".bl-preset-copy").click();
    await expect(select.locator("option", { hasText: "시험 탱커 2 복사" })).toHaveCount(1);
    // 지우기 둘(확인 창)
    for (const name of ["시험 탱커 2 복사", "시험 탱커 2"]) {
      const value = await select.locator("option", { hasText: name }).first().getAttribute("value");
      await select.selectOption(value ?? "");
      await bar.locator(".bl-preset-delete").click();
      await page.locator(".bl-dialog[open] .bl-confirm").click();
      await expect(select.locator("option", { hasText: name })).toHaveCount(0);
    }
    expect(unexpected(deviceErrors)).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC battleLab.catalog·presets는 403", async ({ page, deviceErrors }) => {
    await page.goto("/dev/balance");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    expect(await trpcStatus(page, "battleLab.catalog")).toBe(403);
    expect(await trpcStatus(page, "battleLab.presets")).toBe(403);
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

      test("팀·유닛 편집·미리 보기·전투장(결과 포함): 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(150_000);
        await labReady(page);
        // 펼칠 수 있는 칸을 모두 펼친다(넘침·누르는 곳을 다 본다)
        await page.locator(".bl-lab details:not([open]) > summary").evaluateAll((elements) => {
          for (const element of elements) element.parentElement?.setAttribute("open", "");
        });
        await page.locator(".bl-weapon-select").selectOption("custom");
        await runUntil(page, ".bl-battle", ".bl-result");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        const style = await page.addStyleTag({
          content: ".tabbar, .topbar, .frame-side, .skip-link { visibility: hidden !important; }",
        });
        await shot(page, `battle-lab-${theme}-${language}-${width}`, { fullPage: true });
        await style.evaluate((element) => element.parentNode?.removeChild(element));
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }

  for (const language of ["ko", "en"] as const) {
    test.describe(`나쁜 값·${language}·390px`, () => {
      test.use({ theme: "pastel", language, viewport: { width: 390, height: 844 } });

      test("6 대 6, 이름 40자, Lv 999, 1차 10,000, 스킬 칸 넘침에서도 쪽이 가로로 밀리지 않는다", async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(150_000);
        // 기기 저장 팀(화면이 읽는 자료 입구)에 가장 나쁜 실제 값을 넣는다: 이름 상한 40자, 레벨·1차·K 상한, 속성 모두 10
        await page.addInitScript(
          (teams) => localStorage.setItem("terra.battleLab.teams.v1", JSON.stringify(teams)),
          worstTeams(),
        );
        await labReady(page);
        await expect(page.locator(".bl-team[data-team='a'] .bl-unit")).toHaveCount(6);
        await page.locator(".bl-lab details:not([open]) > summary").evaluateAll((elements) => {
          for (const element of elements) element.parentElement?.setAttribute("open", "");
        });
        await page.locator(".bl-limit").selectOption("60");
        await runUntil(page, ".bl-battle", ".bl-result");
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        const style = await page.addStyleTag({
          content: ".tabbar, .topbar, .frame-side, .skip-link { visibility: hidden !important; }",
        });
        await shot(page, `battle-lab-worst-${language}-390`, { fullPage: true });
        await style.evaluate((element) => element.parentNode?.removeChild(element));
        expect(unexpected(deviceErrors)).toEqual([]);
      });
    });
  }
});

/** 가장 나쁜 실제 값의 팀(이름 40자·Lv 999·1차 10,000·K 10,000·속성 10·스킬 칸 넘침·직접 값 무기 큰 수) */
function worstTeams() {
  const zeros = Array.from({ length: 12 }, () => 0);
  const tens = Array.from({ length: 12 }, () => 10);
  const max = { str: 10_000, vit: 10_000, int: 10_000, wis: 10_000, dex: 10_000, agi: 10_000 };
  const labels = [
    "Aleksandra Wiśniewska-Kowalczyk 근위대장",
    "북부 산악 연합 제3 기계화 정찰대 선임 조종사",
    "Jo",
    "",
    "Bartholomew Fitzgerald-Northwind III",
    "ㅇ",
  ];
  const unit = (index: number) => ({
    label: labels[index] ?? "",
    kind: index % 2 === 0 ? "cyborg" : "creature",
    level: 999,
    rebirths: 0,
    initial: max,
    kPm: max,
    elements: index === 2 ? zeros : tens,
    weapon:
      index % 2 === 0
        ? {
            kind: "custom",
            spec: {
              physical: { attack: 1_000_000, appropriate: 1 },
              elemental: { attack: 999_999, appropriate: 1 },
              basic: "elemental",
              hitPm: 1_000_000,
              hitAppropriate: 1,
              critPm: 1_000_000,
              critAppropriate: 1,
              intervalMs: 60_000,
              speedAppropriate: 1_000_000,
              range: 32,
              arc: true,
              staminaCost: 1_000_000,
              mpCost: 1_000_000,
              elementsPm: tens.map(() => 1_000_000),
            },
          }
        : { kind: "natural" },
    equipment: [],
    gear: {
      rows: [{ id: "hp", value: 1_000_000 }],
      defenseFlat: 1_000_000,
      penetrationPm: 1000,
      resistPm: tens.map(() => -1000),
      primaries: { str: -10_000, vit: 0, int: 0, wis: 0, dex: 0, agi: 10_000 },
    },
    skills: ["power_strike", "fire_bolt", "shock_bash", "war_cry", "first_aid", "iron_skin"].map((id) => ({
      id,
      grade: 10,
    })),
    row: (["front", "middle", "back"] as const)[index % 3],
  });
  const party = { units: Array.from({ length: 6 }, (_, index) => unit(index)), retreatHpPct: 99 };
  return { a: party, b: party };
}
