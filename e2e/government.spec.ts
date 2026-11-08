// 2차맵 정부(행정 건물) 판·NPC 국가 지도자 화면 시험(docs/adr/2026-11-07-play-flow.md "WP-NPC", 사용자 지적 2026-11-08 "Npc사이보그 세력이
// 없어 기본 세력 npc존재도 없음 정부 건물의 기본 기능도 없음").
// 플레이어(가짜 계정, 첫 접속에서 국가 1의 첫 시작 도시 = 수도)가 내 사이보그 2차맵을 열면 건물 표시 가운데 행정 건물을 찾아 누른다 →
// 채집 판 아래 "정부 · 도시" 한 장 → [정부 열기] 대화상자(나라·지도자·시장·세율·행정 레벨·휴먼, 창고·거래소, 구인 카드) → [고용]이면
// WebSocket recruit_hire가 성공한다. 지도자 유닛은 수도 행정 건물 곁에 서 있고 한눈 정보가 "지도자 이름"을 준다.
// 사진: 390 파스텔·다크(한국어) + 파스텔 영어(긴 문구), E2E_SHOTS_DIR.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const BUILDING_MARKER = ".gather-building-marker:not([hidden])";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** tRPC 조회 하나(이 화면의 쿠키로)의 data. input이 있으면 GET 주소에 싣는다 */
async function trpcData(page: Page, procedure: string, input?: unknown): Promise<unknown> {
  return page.evaluate(
    async ({ name, body }) => {
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response: unknown = await fetch(`/api/trpc/${name}${query}`).then((reply) => reply.json());
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const pick = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      return pick(pick(response, "result"), "data");
    },
    { name: procedure, body: input },
  );
}

/** 내 사이보그 2차맵을 연다(지형·자료가 설 때까지) */
async function openMap(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(page.locator(BUILDING_MARKER).first()).toBeVisible({ timeout: 30_000 });
}

/** 보이는 건물 표시 가운데 정부 판이 ready인 건물(행정 건물)의 ID와 응답 */
async function findHall(page: Page): Promise<{ id: number; data: unknown }> {
  let found: { id: number; data: unknown } | null = null;
  await expect
    .poll(
      async () => {
        const ids = await page
          .locator(BUILDING_MARKER)
          .evaluateAll((elements) =>
            elements.map((element) => Number(element.getAttribute("data-building"))),
          );
        for (const id of ids) {
          const data = await trpcData(page, "world.government", { buildingId: id });
          if (field(data, "status") === "ready") {
            found = { id, data };
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  if (!found) throw new Error("no government hall on screen");
  return found;
}

/** 그 건물 표시를 누른다. 위·아래 판에 가렸으면 표시의 누름 처리만 부른다(같은 판이 열린다) */
async function tapBuilding(page: Page, id: number): Promise<void> {
  const marker = page.locator(`.gather-building-marker[data-building="${id}"]`);
  try {
    await marker.click({ timeout: 3_000 });
  } catch {
    await marker.dispatchEvent("click");
  }
}

/** 행정 건물을 눌러 정부 작은 판을 띄운다 */
async function openSheet(page: Page): Promise<{ id: number; data: unknown }> {
  await openMap(page);
  const hall = await findHall(page);
  await tapBuilding(page, hall.id);
  await expect(page.locator(`.gov-sheet[data-building="${hall.id}"]`)).toBeVisible({ timeout: 15_000 });
  return hall;
}

test.describe("정부 판·지도자: 플레이어", () => {
  test.use({ account: "player" });

  test("행정 건물 → 정부 판(나라·지도자·세율·행정 레벨·휴먼) → 구인 카드 [고용], 지도자 한눈 정보", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const hall = await openSheet(page);
    const city = field(hall.data, "city");
    const nation = field(hall.data, "nation");
    const leader = field(hall.data, "leader");
    // 첫 접속 국가 1의 첫 시작 도시 = 수도: 내 나라, 지도자가 이 2차맵에 있다
    expect(field(city, "capital")).toBe(true);
    expect(field(nation, "mine")).toBe(true);
    expect(field(nation, "fixed")).toBe(true);
    expect(field(leader, "here")).toBe(true);
    expect(String(field(field(leader, "name"), "ko"))).toContain("지도자");
    // 화면 시험 서버는 시험 봇이 없어(S1_TEST_BOTS 0) NPC 휴먼이 없다 — 수만 본다
    expect(Number.isInteger(field(city, "humans"))).toBe(true);

    const sheet = page.locator(".gov-sheet");
    await expect(sheet).toContainText(String(field(field(leader, "name"), "ko")));
    // 채집 판(건물 판)은 그대로 함께 있다
    await expect(page.locator(".gather-sheet[data-building]")).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 지도자 유닛: 수도 행정 건물 곁, 한눈 정보 = 종류 npc_leader + 지도자 이름(내 사이보그 시야 안)
    const mapKey = Number(await page.locator(".map-screen").getAttribute("data-map-key"));
    const glance = field(
      await trpcData(page, "world.unitGlance", { mapKey, unitId: Number(field(leader, "unitId")) }),
      "glance",
    );
    expect(field(glance, "kind")).toBe("npc_leader");
    expect(field(field(glance, "name"), "ko")).toBe(field(field(leader, "name"), "ko"));

    // [정부 열기] → 대화상자
    await sheet.locator(".gov-open").click();
    const dialog = page.locator("dialog.gov-dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-part="government-nation"] dd')).not.toHaveText("");
    await expect(dialog.locator('[data-part="government-leader"] dd')).toContainText("지도자");
    await expect(dialog.locator('[data-part="government-mayor"] dd')).toHaveText(
      message("ko", "government_mayor_none"),
    );
    await expect(dialog.locator('[data-part="government-admin"] dd')).toHaveText(
      message("ko", "government_admin_level", { level: Number(field(city, "adminLevel")) }),
    );
    await expect(dialog.locator(".gov-chip").first()).toHaveText(message("ko", "government_chip_mine"));
    // 구인 카드: 이 도시(고르기 없음), 살 수 있는 카드 하나를 고용
    const cards = dialog.locator('[data-part="recruit-card"]');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    await expect(dialog.locator(".eco-select")).toHaveCount(0);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    const ready = dialog.locator('[data-part="recruit-card"][data-state="ready"]').first();
    await expect(ready).toBeVisible();
    await ready.getByRole("button", { name: message("ko", "dev_recruit_hire"), exact: true }).click();
    await expect(dialog.locator(".message-success")).toBeVisible({ timeout: 20_000 });

    // [창고]: 대화상자를 닫고 경제 화면 창고 칸으로
    await dialog.locator(".gov-link").first().click();
    await expect(page).toHaveURL(/\/economy\/warehouse$/);
    expect(deviceErrors).toEqual([]);
  });
});

const SHOTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "ko" },
  { theme: "pastel", language: "en" },
];

test.describe("정부 판 사진", () => {
  test.use({ account: "player" });

  for (const { theme, language } of SHOTS) {
    test.describe(`390 ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS.phone, theme, language });

      test(`정부 작은 판·대화상자 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(240_000);
        await openSheet(page);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `government-sheet-390-${theme}-${language}`);
        await page.locator(".gov-open").click();
        const dialog = page.locator("dialog.gov-dialog[open]");
        await expect(dialog.locator('[data-part="recruit-card"]').first()).toBeVisible({ timeout: 20_000 });
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `government-dialog-390-${theme}-${language}`);
        // 아래(구인 카드)까지 내려 한 장 더
        await dialog.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
        await shot(page, `government-dialog-cards-390-${theme}-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
