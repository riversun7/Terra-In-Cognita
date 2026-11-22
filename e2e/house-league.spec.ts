// 가문 연맹 화면 시험(league-2, 사용자 결정 D-590 — 질문 2501 다·2502 다·2504 나) — 세력 화면 "내 가문" 칸의 연맹 부분(HouseLeagueBlock.tsx).
// 차례대로 도는 한 묶음이다(같은 서버·DB — 앞 시험이 남긴 값을 뒤 시험이 본다). 두 계정은 각자 가문을 만든다(ensureHouse — 서로 다른 가문).
// 1. player: [연맹 만들기] → 연맹 카드(대표 = 내 가문) → 조항 카드 [붙이기](시야 나눔) → 붙음. 390 파스텔·한국어 사진, 넘침·작은 누르는 곳 없음.
// 2. dev: 그 연맹에 [가입 신청] → "보냈습니다"(아직 들지 않음) → 신청함 줄. 390 다크·영어 사진, 넘침 없음.
// 3. player: 초대·신청 줄에 dev 가문 → [받기] → 든 가문 2곳.
// 4. dev: [나가기] → 든 가문 1곳(대표 아님 — 대표 승계는 단위·DB 시험이 본다).
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { ensureHouse } from "./helpers/wsCommands.ts";

const leagues = (page: Page): Locator => page.locator('[data-testid="house-leagues"]');
const firstLeague = (page: Page): Locator => leagues(page).locator(".fid-league").first();
const status = (page: Page): Locator => leagues(page).locator('[data-part="league-status"]');

async function openFaction(page: Page): Promise<void> {
  await ensureHouse(page);
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/faction");
  await expect(leagues(page)).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("가문 연맹 — 만들기·카드·신청·승인·나가기", () => {
  test.describe("1. player: 연맹을 만들고 조항 카드를 붙인다", () => {
    test.use({ account: "player" });

    test("[연맹 만들기] → 대표 카드 → 시야 나눔 [붙이기]", async ({ page, deviceErrors }) => {
      await openFaction(page);
      await expect(leagues(page).locator(".faction-muted").first()).toHaveText(
        message("ko", "fid_league_hint"),
      );
      await leagues(page).locator('[data-part="league-found"]').click();
      await expect(status(page)).toHaveText(message("ko", "fid_league_ok_found"));
      await expect(firstLeague(page)).toBeVisible();
      const vision = firstLeague(page).locator('[data-clause="shared_vision"]');
      await expect(vision).toHaveAttribute("data-on", "0");
      await vision.locator("button").click();
      await expect(status(page)).toHaveText(message("ko", "fid_league_ok_done"));
      await expect(vision).toHaveAttribute("data-on", "1");
      await expect(firstLeague(page).locator('[data-part="league-members"] li')).toHaveCount(1);
      expect(await horizontalOverflow(page)).toEqual([]);
      expect(await smallTapTargets(page)).toEqual([]);
      await firstLeague(page).scrollIntoViewIfNeeded();
      await shot(page, "house-league-pastel-ko-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("2. dev: 가입을 신청한다", () => {
    test.use({ account: "dev", theme: "dark", language: "en" });

    test("[Apply] → 보냄(아직 들지 않음) → 신청함 줄", async ({ page, deviceErrors }) => {
      await openFaction(page);
      const join = firstLeague(page).locator('[data-part="league-join"]');
      await join.locator("button").click();
      await expect(status(page)).toHaveText(message("en", "fid_league_ok_pending"));
      await expect(join).toContainText(message("en", "fid_league_applied"));
      await expect(firstLeague(page).locator('[data-part="league-members"] li')).toHaveCount(1);
      expect(await horizontalOverflow(page)).toEqual([]);
      await firstLeague(page).scrollIntoViewIfNeeded();
      await shot(page, "house-league-dark-en-390");
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("3. player: 신청을 받는다", () => {
    test.use({ account: "player" });

    test("초대·신청 줄 → [받기] → 든 가문 2곳", async ({ page, deviceErrors }) => {
      await openFaction(page);
      const requests = firstLeague(page).locator('[data-part="league-requests"] [data-request]');
      await expect(requests).toHaveCount(1);
      await requests.first().locator("button.button-primary").click();
      await expect(status(page)).toHaveText(message("ko", "fid_league_ok_done"));
      await expect(firstLeague(page).locator('[data-part="league-members"] li')).toHaveCount(2);
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe("4. dev: 연맹을 나간다", () => {
    test.use({ account: "dev" });

    test("[나가기] → 든 가문 1곳", async ({ page, deviceErrors }) => {
      await openFaction(page);
      await firstLeague(page).locator('[data-part="league-leave"]').click();
      await expect(status(page)).toHaveText(message("ko", "fid_league_ok_leave"));
      await expect(firstLeague(page).locator('[data-part="league-members"] li')).toHaveCount(1);
      expect(deviceErrors).toEqual([]);
    });
  });
});
