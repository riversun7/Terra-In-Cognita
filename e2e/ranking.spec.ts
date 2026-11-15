// 랭킹 화면 시험 — /cyborg/ranking·/faction/ranking(docs/adr/2026-11-07-ranking.md, D-040·D-041·D-392·D-6010).
// - 플레이어(실제 자료): 서버가 켜질 때 센 첫 집계(바로 앞 하루 + 지금 재고). 세력 화면 옆 판의 세력 순위 칸 → 세력 순위표(내 세력 줄),
//   판 고르기로 정복자(NPC 세력이 도시를 가져 판에 있다)·안 연 경로(곧 열림)로 옮긴다. 사이보그 화면 랭킹 칸 → 모든 경로 순위.
// - dev + 시안 자료: 50줄 + 내 줄(63위, 위 50줄 밖이라 끝에 한 줄 더), 세력 판 16줄·세력 명성(위 12개만, 나머지 "아직 없음").
// - 긴 이름·큰 수는 ranking.board 응답을 고쳐 넣는다(helpers/trpc.ts rewriteTrpc).
// - 사진: 390·1440 × 파스텔·다크(경로 판·세력 판, 390은 한국어·1440은 영어) + 세력 화면 옆 판(E2E_SHOTS_DIR).
// 자리는 화면 부품의 class로 찾는다(apps/game/src/ranking/RankingScreen.tsx, faction/FactionRanking.tsx). 문구는 메시지 원본.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 화면 전체 사진: 화면 높이를 문서 높이로 늘려 찍고 되돌린다(faction.spec.ts와 같다) */
async function tallShot(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error("화면 크기를 모릅니다");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 12_000) });
  await shot(page, name);
  await page.setViewportSize(size);
}

/** 랭킹 화면이 판을 그릴 때까지(고르기 칸) */
async function rankingReady(page: Page): Promise<void> {
  await expect(page.locator("section.ranking .ranking-picker select")).toBeVisible({ timeout: 20_000 });
}

/** 첫 집계가 끝날 때까지 다시 연다(서버가 켜진 직후 뒤에서 센다) */
async function openWhenTallied(page: Page, path: string): Promise<void> {
  await expect(async () => {
    await page.goto(path);
    await rankingReady(page);
    await expect(page.locator("section.ranking .ranking-notes")).not.toContainText(
      message("ko", "ranking_pending"),
      { timeout: 1_000 },
    );
  }).toPass({ timeout: 30_000 });
}

/** ranking.board 응답 → 긴 이름·큰 수(넘침 시험) */
const worstCase = (data: unknown): void => {
  if (typeof data !== "object" || data === null) throw new Error("ranking.board 응답 모양이 다릅니다");
  const long = {
    ko: "고대 정원사의 강화 인공 심장을 단 아주 긴 이름의 사이보그",
    en: "An Extremely Long Cyborg Name With An Ancient Gardener Heart",
  };
  Reflect.set(data, "total", 123_456_789);
  for (const key of ["rows", "me"]) {
    const value: unknown = Reflect.get(data, key);
    for (const row of Array.isArray(value) ? value : value === null ? [] : [value]) {
      if (typeof row !== "object" || row === null) continue;
      Reflect.set(row, "name", long);
      Reflect.set(row, "faction", long);
      Reflect.set(row, "score", 98_765_432_109);
      Reflect.set(row, "rank", 123_456_789);
      Reflect.set(row, "prevRank", 1);
    }
  }
};

test.describe("플레이어(실제 자료)", () => {
  test.use({ account: "player" });

  test("세력 화면 세력 순위 칸 → 세력 순위표(내 세력 줄) → 정복자 판 → 안 연 경로(곧 열림)", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openWhenTallied(page, "/faction/ranking");
    await page.goto("/faction");
    const card = page.locator("section.faction .faction-ranking");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByRole("heading", { name: message("ko", "faction_ranking_title") })).toBeVisible();
    await expect(card.locator(".faction-ranking-rank")).toContainText("위 / ");
    await expect(card).toContainText(message("ko", "ranking_renown_none"));
    expect(await smallTapTargets(page)).toEqual([]);

    await card.getByRole("link", { name: message("ko", "faction_ranking_open") }).click();
    await expect(page).toHaveURL(/\/faction\/ranking$/);
    await rankingReady(page);
    const screen = page.locator("section.ranking");
    await expect(screen.locator("h1")).toHaveText(message("ko", "ranking_title"));
    await expect(screen.locator(".ranking-picker select")).toHaveValue("faction:");
    await expect(screen.locator(".ranking-measures")).toContainText(
      message("ko", "ranking_faction_measures"),
    );
    await expect(screen.locator(".ranking-row[data-me]")).toHaveCount(1);
    await expect(screen.locator(".ranking-me .ranking-me-rank")).toContainText("위 / ");
    await expect(screen.locator(".ranking-notes")).toContainText(message("ko", "ranking_renown_note"));
    await expect(screen.locator(".screen-switch")).toHaveCount(0);

    // 정복자: NPC 세력이 도시를 가져 판에 있다(가진 도시 = 집계마다 쌓이는 재고)
    await screen.locator(".ranking-picker select").selectOption("path:conqueror");
    await expect(page).toHaveURL(/\/cyborg\/ranking\?path=conqueror$/);
    await rankingReady(page);
    await expect(screen.locator(".ranking-measures")).toContainText(
      message("ko", "ranking_measure_cities_held"),
    );
    await expect(screen.locator(".ranking-row").first()).toBeVisible();
    await expect(
      screen
        .locator(".ranking-row .state-chip", { hasText: message("ko", "ranking_kind_npc_faction") })
        .first(),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 안 연 경로(무역상): 곧 열림(D-392)
    await screen.locator(".ranking-picker select").selectOption("path:trader");
    await expect(page).toHaveURL(/path=trader$/);
    await expect(screen.locator(".ranking-soon")).toHaveText(message("ko", "ranking_closed"));
    await expect(screen.locator(".ranking-list")).toHaveCount(0);
    expect(deviceErrors).toEqual([]);
  });

  test("사이보그 화면 랭킹 칸 → 모든 경로 순위(경로를 고르지 않으면 서버가 고른다)", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg");
    await expect(page.locator(".cyborg-profile")).toBeVisible({ timeout: 15_000 });
    const link = page.getByRole("link", { name: message("ko", "cyborg_ranking_open_all") });
    await link.scrollIntoViewIfNeeded();
    // 새 링크(경로 줄·모든 경로 순위)도 누르는 곳 44px
    expect(await smallTapTargets(page)).toEqual([]);
    await link.click();
    await expect(page).toHaveURL(/\/cyborg\/ranking$/);
    await rankingReady(page);
    await expect(page.locator("section.ranking .ranking-picker select")).toHaveValue(/^path:[a-z_]+$/);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev 시안 자료", () => {
  test.use({ account: "dev", preview: "dev" });

  test("경로 판: 50줄 + 내 줄(63위, 끝에), 등급 문턱 넷, 시험 자료 안내 / 세력 판: 16줄·규모·세력 명성", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await page.goto("/cyborg/ranking?path=mercenary");
    await rankingReady(page);
    const screen = page.locator("section.ranking");
    await expect(screen.locator(".preview-notice")).toContainText(message("ko", "ranking_preview_notice"));
    await expect(screen.locator(".ranking-row")).toHaveCount(51);
    await expect(screen.locator(".ranking-gap")).toHaveCount(1);
    await expect(screen.locator(".ranking-row[data-me]")).toHaveCount(1);
    await expect(screen.locator(".ranking-row").last()).toHaveAttribute("data-me", "true");
    await expect(screen.locator(".ranking-me-rank")).toHaveText(
      message("ko", "ranking_rank_of", { rank: "63", total: "1,284" }),
    );
    await expect(screen.locator(".ranking-tier-cut")).toHaveCount(4);
    await expect(screen.locator(".ranking-row[data-top]")).toHaveCount(3);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    await screen.locator(".ranking-picker select").selectOption("faction:");
    await rankingReady(page);
    await expect(screen.locator(".ranking-row")).toHaveCount(16);
    await expect(screen.locator(".ranking-row[data-me]")).toHaveCount(1);
    // 명성(정원사 2 세력 명성): 시안 1위 480, 16위는 아직 없음
    await expect(screen.locator(".ranking-row").first()).toContainText(
      message("ko", "ranking_renown", { renown: "480" }),
    );
    await expect(screen.locator(".ranking-row").last()).toContainText(message("ko", "ranking_renown_none"));

    // 가문 판(D-569 1746): 경로 하나의 가문원 점수 합 — 가문 줄·소속 도시·가문원 수·내 가문 자리
    await screen.locator(".ranking-picker select").selectOption("house:mercenary");
    await rankingReady(page);
    await expect(page).toHaveURL(/\/faction\/ranking\?house=mercenary/);
    await expect(screen.locator(".ranking-row")).toHaveCount(16);
    await expect(screen.locator(".ranking-row[data-me]")).toHaveCount(1);
    await expect(screen.locator(".ranking-row").nth(1)).toContainText(
      message("ko", "ranking_house_home", { city: "Preview City 2" }),
    );
    await expect(screen.locator(".ranking-row").first()).toContainText(
      message("ko", "ranking_house_home", { city: message("ko", "ranking_house_home_unknown") }),
    );
    await expect(screen.locator("#ranking-me-title")).toHaveText(message("ko", "ranking_me_house_title"));
    await expect(screen.locator(".ranking-notes")).toContainText(message("ko", "ranking_house_note"));
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("나쁜 자료(긴 이름·큰 수) 390", () => {
  for (const language of ["ko", "en"] as const) {
    test.describe(language, () => {
      test.use({ ...VIEWPORTS.phone, account: "dev", preview: "dev", language });

      test(`넘치지 않는다 (${language})`, async ({ page, deviceErrors }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary, "ranking.board": worstCase });
        await page.goto("/cyborg/ranking?path=landlord");
        await rankingReady(page);
        await expect(page.locator("section.ranking .ranking-row").first()).toBeVisible();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

/** 사진: 390(한국어)·1440(영어) × 파스텔·다크, 경로 판·세력 판 + 세력 화면 옆 판 */
const SHOTS: readonly { viewport: keyof typeof VIEWPORTS; language: Language; theme: Theme }[] = [
  { viewport: "phone", language: "ko", theme: "pastel" },
  { viewport: "phone", language: "ko", theme: "dark" },
  { viewport: "desktop", language: "en", theme: "pastel" },
  { viewport: "desktop", language: "en", theme: "dark" },
];

test.describe("사진", () => {
  for (const { viewport, language, theme } of SHOTS) {
    const width = VIEWPORTS[viewport].viewport.width;
    test.describe(`${theme} ${language} ${String(width)}`, () => {
      test.use({ ...VIEWPORTS[viewport], account: "dev", preview: "dev", language, theme });

      test(`경로 판·세력 판·세력 화면 (${theme} ${language} ${String(width)})`, async ({
        page,
        deviceErrors,
      }) => {
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/cyborg/ranking?path=conqueror");
        await rankingReady(page);
        await expect(page.locator("section.ranking .ranking-row").first()).toBeVisible();
        await tallShot(page, `ranking-path-${theme}-${language}-${String(width)}`);
        await page.goto("/faction/ranking");
        await rankingReady(page);
        await expect(page.locator("section.ranking .ranking-row").first()).toBeVisible();
        await tallShot(page, `ranking-faction-${theme}-${language}-${String(width)}`);
        await page.goto("/faction/ranking?house=conqueror");
        await rankingReady(page);
        await expect(page.locator("section.ranking .ranking-row").first()).toBeVisible();
        await tallShot(page, `ranking-house-${theme}-${language}-${String(width)}`);
        await page.goto("/faction");
        await expect(page.locator("section.faction .faction-ranking")).toBeVisible({ timeout: 20_000 });
        await page.locator("section.faction .faction-ranking").scrollIntoViewIfNeeded();
        await shot(page, `ranking-faction-card-${theme}-${language}-${String(width)}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
