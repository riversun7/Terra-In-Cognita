// 세력 화면 시험 — /faction(D-439, 기획 46). 실제 자료만 보는 플레이어와 시안 자료를 켠 dev.
// - 플레이어: 세력 없음(개인), 여섯 칸은 "곧 열림", 시안 자료 스위치 없음. faction.overview를 preview 없이 묻는다.
// - dev + 시안 자료(test.use의 preview): 시안 장면(apps/server/src/factionScreen/preview.ts) — 나라 Solace, 도시 3, 외교 4 + 정원사,
//   전쟁 2, 투표 3(열린 2), 지분 3, 점령 처리 2. 칸마다 "시험 자료". 곧 열림 단추는 WebSocket 명령을 보내지 않는다.
// - 긴 이름·큰 수는 faction.overview 응답을 고쳐 넣는다(helpers/trpc.ts rewriteTrpc).
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어, 탭 다섯(E2E_SHOTS_DIR).
// 자리는 화면 부품의 class·role로 찾는다(apps/game/src/faction/*.tsx, sections/screenParts.tsx). 문구는 메시지 원본.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc, watchTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const TABS = ["cities", "diplomacy", "wars", "votes", "shares"] as const;
type Tab = (typeof TABS)[number];

/**
 * 화면 전체 사진: 화면 높이를 문서 높이로 늘려 찍는다(fullPage는 고정된 위 띠·하단 탭을 스크롤 자리에 그려 가운데에 겹친다).
 * 찍은 뒤 원래 크기로 돌린다
 */
async function tallShot(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error("화면 크기를 모릅니다");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 12_000) });
  await shot(page, name);
  await page.setViewportSize(size);
}

/** 화면이 WebSocket으로 보낸 기능 메시지(연결 인사·시계 맞추기는 뺀다) */
function watchCommands(page: Page): string[] {
  const sent: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      let type: unknown = null;
      try {
        const value: unknown = JSON.parse(text);
        type = typeof value === "object" && value !== null ? Reflect.get(value, "t") : null;
      } catch {
        type = null;
      }
      if (type !== "hello" && type !== "ping") sent.push(text);
    });
  });
  return sent;
}

const tabOf = (page: Page, language: Language, tab: Tab) =>
  page
    .locator("section.faction")
    .getByRole("tab", { name: new RegExp(`^${message(language, `faction_tab_${tab}`)}`) });

/** /faction을 열고 본문(옆 판)이 그려질 때까지 */
async function openFaction(page: Page): Promise<void> {
  await page.goto("/faction");
  await expect(page.locator("section.faction .faction-side")).toBeVisible({ timeout: 20_000 });
}

test.describe("플레이어(실제 자료만)", () => {
  test.use({ account: "player" });

  test("세력 없음(개인), 여섯 칸은 곧 열림, 시안 스위치 없음, 곧 열림 단추는 명령을 보내지 않는다", async ({
    page,
    deviceErrors,
  }) => {
    const calls = watchTrpc(page);
    const commands = watchCommands(page);
    await openFaction(page);
    const screen = page.locator("section.faction");
    await expect(screen.locator("h1")).toHaveText(message("ko", "nav_faction"));
    await expect(screen.getByRole("heading", { name: message("ko", "faction_none_title") })).toBeVisible();
    await expect(screen.locator(".screen-switch")).toHaveCount(0);
    await expect(screen.locator(".preview-notice")).toHaveCount(0);
    for (const tab of TABS) {
      await tabOf(page, "ko", tab).click();
      await expect(screen.getByRole("tabpanel")).toContainText(message("ko", "screen_soon_section"));
    }
    // 요청은 preview 없이(플레이어는 시안 자료를 묻지 않는다)
    const inputs = calls.flatMap((call) =>
      call.procedures.flatMap((name, index) => (name === "faction.overview" ? [call.inputs[index]] : [])),
    );
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.every((input) => input === undefined)).toBe(true);

    // 곧 열림 단추는 aria-disabled라 Playwright가 누를 수 없는 것으로 본다 → force(사람은 누를 수 있다)
    await screen
      .getByRole("button", { name: new RegExp(message("ko", "faction_found_family")) })
      .click({ force: true });
    await expect(screen.locator(".soon-live")).toContainText(message("ko", "screen_soon_pressed"));
    expect(commands).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await tallShot(page, "faction-player-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev 시안 자료", () => {
  test.use({ account: "dev", preview: "dev" });

  test("시안 장면: 요약·잠긴 메뉴·탭 다섯의 내용, 칸마다 시험 자료, 곧 열림은 명령 없음, 탭은 화살표로 옮긴다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    const commands = watchCommands(page);
    await openFaction(page);
    const screen = page.locator("section.faction");
    await expect(screen.locator(".preview-notice")).toContainText(message("ko", "faction_preview_notice"));
    await expect(screen.locator(".faction-name-text")).toHaveText("Solace");
    await expect(screen.locator(".faction-card")).toContainText(message("ko", "faction_stage_nation"));
    await expect(screen.locator(".faction-card")).toContainText(message("ko", "faction_regime_capitalism"));
    // 잠긴 메뉴: 국가 채권은 도시 5개가 필요(지금 3)
    await expect(screen.locator(".faction-locks")).toContainText(
      message("ko", "faction_lock_need_cities", { need: 5, current: 3 }),
    );

    // 도시: 세 민심 단계
    const panel = screen.getByRole("tabpanel");
    await expect(panel.locator(".faction-city")).toHaveCount(3);
    for (const key of ["faction_unrest_calm", "faction_unrest_slowdown", "faction_unrest_rebellion"]) {
      await expect(panel).toContainText(message("ko", key));
    }
    await expect(panel.locator(".preview-tag")).toHaveCount(1);

    // 화살표로 다음 탭(외교) — 고르고 초점도 옮긴다
    await tabOf(page, "ko", "cities").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabOf(page, "ko", "diplomacy")).toBeFocused();
    await expect(tabOf(page, "ko", "diplomacy")).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator("tbody tr")).toHaveCount(5);
    await expect(panel).toContainText(message("ko", "faction_gardener_note"));
    await expect(panel).toContainText(message("ko", "faction_treaty_tariff", { from: "10%", to: "3%" }));

    await page.keyboard.press("End");
    await expect(tabOf(page, "ko", "shares")).toHaveAttribute("aria-selected", "true");
    await expect(panel.locator(".faction-step")).toHaveCount(10);
    await expect(panel).toContainText(message("ko", "faction_occ_offer_hint"));

    await tabOf(page, "ko", "wars").click();
    await expect(panel).toContainText(message("ko", "faction_casus_none"));
    await expect(panel).toContainText(message("ko", "faction_war_stage_siege_scheduled"));

    await tabOf(page, "ko", "votes").click();
    await expect(panel).toContainText(message("ko", "faction_rule_by_shares"));
    await expect(panel).toContainText(message("ko", "faction_vote_passed"));
    await panel
      .getByRole("button", { name: new RegExp(message("ko", "faction_vote_cast_yes")) })
      .first()
      .click({ force: true });
    await expect(screen.locator(".soon-live")).toContainText(message("ko", "screen_soon_pressed"));
    expect(commands).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("시안 스위치를 끄면 실제 자료(세력 없음)로 다시 묻고, 켜면 시안 장면으로 돌아온다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openFaction(page);
    const screen = page.locator("section.faction");
    const toggle = screen.locator(".screen-switch input[role=switch]");
    await expect(toggle).toBeChecked();
    await screen.locator(".screen-switch").click();
    await expect(toggle).not.toBeChecked();
    await expect(screen.getByRole("heading", { name: message("ko", "faction_none_title") })).toBeVisible();
    await expect(screen.locator(".preview-notice")).toHaveCount(0);
    await screen.locator(".screen-switch").click();
    await expect(screen.locator(".faction-name-text")).toHaveText("Solace");
    expect(deviceErrors).toEqual([]);
  });

  test("긴 이름·큰 수(390px): 가로 넘침·작은 누르는 곳 없음", async ({ page, deviceErrors }) => {
    const LONG = "Gloriously_Overlong_Faction_Name_Without_Spaces_Anywhere";
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "faction.overview": (data) => {
        if (typeof data !== "object" || data === null)
          throw new Error("faction.overview 응답 모양이 다릅니다");
        const faction: unknown = Reflect.get(data, "faction");
        if (typeof faction === "object" && faction !== null) {
          Reflect.set(faction, "name", LONG);
          Reflect.set(faction, "leader", LONG);
          Reflect.set(faction, "treasury", [
            { asset: "preview_sol_mark", name: LONG, amount: "999999999999999999999999" },
          ]);
        }
        const cities: unknown = Reflect.get(data, "cities");
        const rows: unknown =
          typeof cities === "object" && cities !== null ? Reflect.get(cities, "data") : null;
        if (Array.isArray(rows))
          for (const row of rows) {
            Reflect.set(row, "name", LONG);
            Reflect.set(row, "mayor", LONG);
            Reflect.set(row, "population", 123456789);
            Reflect.set(row, "dailyBudget", "999999999999999999");
          }
      },
    });
    await openFaction(page);
    for (const tab of TABS) {
      await tabOf(page, "ko", tab).click();
      expect(await horizontalOverflow(page), tab).toEqual([]);
      expect(await smallTapTargets(page), tab).toEqual([]);
    }
    expect(deviceErrors).toEqual([]);
  });
});

const LAYOUTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "ko" },
  { theme: "dark", language: "en" },
];

for (const [size, preset] of [
  ["390", VIEWPORTS.phone],
  ["1440", VIEWPORTS.desktop],
] as const) {
  test.describe(`사진 ${size}px`, () => {
    test.use({ account: "dev", preview: "dev", ...preset });
    for (const { theme, language } of LAYOUTS) {
      test.describe(`${theme}·${language}`, () => {
        test.use({ theme, language });

        test("탭 다섯: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "summary.get": hideSummary });
          await openFaction(page);
          await expect(page.locator("section.faction .faction-name-text")).toHaveText("Solace");
          for (const tab of TABS) {
            await tabOf(page, language, tab).click();
            await expect(tabOf(page, language, tab)).toHaveAttribute("aria-selected", "true");
            expect(await horizontalOverflow(page), tab).toEqual([]);
            await tallShot(page, `faction-${tab}-${theme}-${language}-${size}`);
          }
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  });
}

test.describe("사진 1440px 플레이어", () => {
  test.use({ account: "player", theme: "dark", language: "en", ...VIEWPORTS.desktop });

  test("실제 자료만: 곧 열림, 사진", async ({ page, deviceErrors }) => {
    await openFaction(page);
    await expect(page.locator("section.faction .soon-panel")).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    await tallShot(page, "faction-player-dark-en-1440");
    expect(deviceErrors).toEqual([]);
  });
});
