// 구인 카드 시험 화면 시험 — /dev/recruit (D-469 출생 없음, 49 N45, docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)").
// - admin: 시작 도시(행정 건물 Lv1)의 내 카드 3~5장·도시 주인(NPC) 카드 표가 보이고, 가장 싼 카드를 [고용]하면 WebSocket recruit_hire가
//   성공해 그 카드가 "고용함"이 되고 잔고가 준다(정착 지원금 약 100 ≥ Lv1 카드 최대 80). 다른 도시를 고르면 주소(?city=)가 바뀐다.
// - player: 권한 없음 화면(개발 화면), tRPC recruit.board는 받는다(고용은 플레이어 명령이라 조회도 열려 있다, 주인 카드는 없음).
// - 사진: 390·1440 × 개발 화면 테마 네온·라이트 × 한국어·영어(E2E_SHOTS_DIR, ADR 2026-11-02-dev-ui).
// 고용은 admin 계정에 휴먼 유닛 하나를 더한다. 다른 시험도 내 휴먼이 없으면 같은 창의 카드를 산다(e2e/helpers/wsCommands.ts ensureHuman)
// → 남은 카드 가운데 가장 싼 것을 고른다.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type DevTheme, type Language, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 화면 안에서 tRPC 조회를 부른다(같은 출처, 화면과 같은 쿠키) */
async function board(page: Page): Promise<{ status: number; data: unknown }> {
  return page.evaluate(async () => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const get = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    const response = await fetch("/api/trpc/recruit.board");
    const json: unknown = await response.json();
    return { status: response.status, data: get(get(json, "result"), "data") };
  });
}

const screen = (page: Page) => page.locator(".rl-screen");
const cards = (page: Page) => page.locator(".rl-card");

async function ready(page: Page, path = "/dev/recruit"): Promise<void> {
  // 앞 시험(거래·환전)이 남긴 체결이 있으면 복귀 요약이 떠서 단추를 가린다 — 뜨면 Esc로 닫는다(summary.spec.ts)
  await page.addLocatorHandler(page.locator("dialog.summary-dialog[open]"), async () => {
    await page.keyboard.press("Escape");
  });
  await page.goto(path);
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

test.describe("관리자", () => {
  test.use({ account: "admin", ...VIEWPORTS.desktop });

  test("시작 도시 카드 3~5장·NPC 카드 표, 가장 싼 카드를 고용하면 고용함·잔고가 준다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(60_000);
    await ready(page);
    const count = await cards(page).count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
    expect(await page.locator(".rl-owner tbody tr").count()).toBeGreaterThanOrEqual(3);
    const before = await board(page);
    const list = field(before.data, "cards");
    const mine = Array.isArray(list) ? list : [];
    // 다른 시험(유닛·장비·노동 계약)이 이 창의 카드를 먼저 샀을 수 있다 → 남은 카드 가운데 가장 싼 것
    const cheapest = mine
      .filter((card) => field(card, "taken") !== true)
      .map((card) => ({ slot: Number(field(card, "slot")), cost: BigInt(String(field(card, "cost"))) }))
      .toSorted((a, b) => (a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : a.slot - b.slot))[0];
    if (!cheapest) throw new Error("no card");
    const balance = BigInt(String(field(before.data, "balance")));
    expect(balance >= cheapest.cost).toBe(true);
    const card = cards(page).nth(cheapest.slot);
    await card.getByRole("button", { name: message("ko", "dev_recruit_hire"), exact: true }).click();
    await expect(page.locator(".message-success")).toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute("data-state", "taken");
    const after = await board(page);
    expect(BigInt(String(field(after.data, "balance")))).toBe(balance - cheapest.cost);
    // 다른 도시를 고르면 주소가 바뀌고 그 도시 카드를 받는다
    const other = page.locator(".rl-cities .rl-city[aria-pressed='false']").first();
    if ((await other.count()) > 0) {
      await other.click();
      await expect(page).toHaveURL(/\/dev\/recruit\?city=\d+$/);
      await expect(page.locator(".rl-cities .rl-city[aria-pressed='true']")).toHaveCount(1);
    }
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("플레이어", () => {
  test.use({ account: "player" });

  test("권한 없음 화면, tRPC recruit.board는 받는다(주인 카드 없음)", async ({ page, deviceErrors }) => {
    await page.goto("/dev/recruit");
    await expect(page.locator("#no-permission-title")).toBeVisible();
    await expect(screen(page)).toHaveCount(0);
    const result = await board(page);
    expect(result.status).toBe(200);
    expect(field(result.data, "owner")).toBeNull();
    expect(field(result.data, "hasCyborg")).toBe(true);
    expect(deviceErrors).toEqual([]);
  });
});

// 개발 화면 층(ADR 2026-11-02-dev-ui): 개발 화면 테마 둘(네온 다크·라이트)로, 보이는 화면 크기로 찍는다
const LAYOUTS: readonly { theme: DevTheme; language: Language; width: number; height: number }[] = (
  ["neon", "light"] as const
).flatMap((theme) =>
  (["ko", "en"] as const).flatMap((language) => [
    { theme, language, width: 390, height: 844 },
    { theme, language, width: 1440, height: 900 },
  ]),
);

test.describe("배치·사진", () => {
  test.use({ account: "dev" });

  for (const { theme, language, width, height } of LAYOUTS) {
    test.describe(`${theme}·${language}·${width}px`, () => {
      test.use({
        devTheme: theme,
        language,
        ...(width >= 1000 ? VIEWPORTS.desktop : { viewport: { width, height } }),
      });

      test("도시 표·카드·NPC 카드 표: 가로 넘침·작은 누르는 곳 없음, 사진", async ({
        page,
        deviceErrors,
      }) => {
        await ready(page);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `recruit-${theme}-${language}-${width}`, { fullPage: true });
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
