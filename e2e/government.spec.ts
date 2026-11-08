// 2차맵 정부(행정 건물) 판·NPC 국가 지도자 화면 시험(docs/adr/2026-11-07-play-flow.md "WP-NPC", 사용자 지적 2026-11-08 "Npc사이보그 세력이
// 없어 기본 세력 npc존재도 없음 정부 건물의 기본 기능도 없음").
// 플레이어(가짜 계정, 첫 접속에서 국가 1의 첫 시작 도시 = 수도)가 내 사이보그 2차맵을 열면 건물 표시 가운데 행정 건물을 찾아 누른다 →
// 채집 판 아래 "정부 · 도시" 한 장 → [정부 열기] 대화상자(나라·지도자·시장(자동 지정 휴먼, WP-NPC2 — 이름·처음 인구 스탯, WP-NPC4)·세율·행정 레벨·휴먼,
// 창고·거래소, 구인 카드) → [고용]이면
// WebSocket recruit_hire가 성공한다. 지도자 유닛은 수도 행정 건물 곁에 서 있고 한눈 정보가 "지도자 이름"을 준다.
// 지도자 창구("WP-NPC3", 기획 정리 742 나·743 나·748 나): 지도자 머리 위 이름표(지도자 표시 + 이름)가 늘 보이고, 이름표를 누르면 그 지도자를 고르고
// 지도자 판 → [지도자와 이야기] → 수도 정부 판(머리 = 지도자, 도시 하루 값, 창구: 외교·의뢰·국적 상담).
// 사진: 390 파스텔·다크(한국어) + 파스텔 영어(긴 문구), E2E_SHOTS_DIR.
import type { Locator, Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { openBuildingFromList } from "./helpers/nearby.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

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

/** 2차맵을 연다(지형·자료가 설 때까지). path 없으면 내 사이보그 2차맵 */
async function openMap(page: Page, path = "/map"): Promise<number> {
  await page.goto(path);
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  return Number(await map.getAttribute("data-map-key"));
}

/** 이 2차맵의 행정 건물(정부 판이 ready) — 서버 건물 ID를 차례로 물어 찾는다(씨앗 시설은 작은 ID) */
async function findHall(page: Page, mapKey: number): Promise<{ id: number; data: unknown }> {
  for (let id = 1; id <= 200; id++) {
    const data = await trpcData(page, "world.government", { buildingId: id });
    if (field(data, "status") === "ready" && field(field(data, "city"), "mapKey") === String(mapKey))
      return { id, data };
  }
  throw new Error("no government hall on this second map");
}

/** 그 건물 표시를 누른다. 위·아래 판에 가렸으면 표시의 누름 처리만 부른다(같은 판이 열린다) */
async function tapBuilding(page: Page, id: number): Promise<void> {
  // 근처 판 건물 탭 목록으로 연다(카메라가 기준 유닛에 붙어 건물 표시가 화면 밖일 수 있다 — docs/adr/2026-11-08-seamless-second-map.md WP-1·2)
  await openBuildingFromList(page, id);
}

/**
 * 내 사이보그 2차맵의 행정 건물을 찾아 그 자리로 카메라를 옮겨(주소 ?at= — 행정 건물은 사이보그 자리에서 화면 밖일 수 있다) 누르고
 * 정부 작은 판을 띄운다
 */
async function openSheet(page: Page): Promise<{ id: number; data: unknown }> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  const mapKey = await openMap(page);
  const hall = await findHall(page, mapKey);
  const cell = field(hall.data, "building");
  await openMap(page, `/map?key=${mapKey}&at=${String(field(cell, "x"))},${String(field(cell, "y"))}`);
  await tapBuilding(page, hall.id);
  await expect(page.locator(`.gov-sheet[data-building="${hall.id}"]`)).toBeVisible({ timeout: 15_000 });
  return hall;
}

/** 내 사이보그 2차맵(수도)을 행정 건물 자리로 열고 지도자 이름표가 설 때까지(이름표·지도자 유닛·이름) */
async function openLeaderTag(page: Page, language: Language) {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  const mapKey = await openMap(page);
  const hall = await findHall(page, mapKey);
  const cell = field(hall.data, "building");
  await openMap(page, `/map?key=${mapKey}&at=${String(field(cell, "x"))},${String(field(cell, "y"))}`);
  const leader = field(hall.data, "leader");
  const unitId = Number(field(leader, "unitId"));
  const name = String(field(field(leader, "name"), language));
  const tag = page.locator(`.leader-tag[data-unit="${unitId}"]:not([hidden])`);
  // 카메라는 내 사이보그를 따라간다(?at= 자리로 가지 않는다 — docs/adr/2026-11-08-seamless-second-map.md WP-1): 지도자가 화면에 들 때까지 멀리 본다
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  for (let step = 0; step < 8 && (await tag.count()) === 0; step++) {
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
  }
  await expect(tag).toBeVisible({ timeout: 30_000 });
  // 이름은 한눈 정보로 받는다(받기 전엔 "지도자")
  await expect(tag).toContainText(name, { timeout: 15_000 });
  return { mapKey, hall, unitId, name, tag };
}

/** 이름표를 누른다(이름표는 손가락을 받지 않는다 — 그 자리를 누르면 지도가 받아 덧그림 층이 고른다) */
async function tapTag(page: Page, tag: Locator): Promise<void> {
  const box = await tag.boundingBox();
  if (!box) throw new Error("leader tag has no box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
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
    // 처음 인구(WP-NPC2, 749 다): 시험 봇과 상관없이 시작 도시마다 주거 × 비율(팩 출발값 40 × 750‰ = 30, 설 곳이 모자라면 조금 적다)
    expect(Number(field(city, "humans"))).toBeGreaterThanOrEqual(25);
    // 자동 시장(744 나): 그 도시 휴먼 하나. 처음 인구도 행정 레벨 구인 카드 규칙의 스탯(774 나 — 기본값 아님), 이름은 그 나라 팩 목록(773 나)
    const mayor = field(hall.data, "mayor");
    expect(Number.isInteger(field(mayor, "unitId"))).toBe(true);
    expect(field(mayor, "baseline")).toBe(false);
    const mayorName = field(mayor, "name");
    expect(typeof mayorName).toBe("string");

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
    await expect(dialog.locator('[data-part="government-mayor"] dd')).toContainText(
      message("ko", "government_mayor_named", {
        name: String(mayorName),
        level: Number(field(mayor, "level")),
      }),
    );
    // 스탯이 있어 기본값 안내는 없다
    await expect(dialog.locator('[data-part="government-mayor"] .gov-mayor-note')).toHaveCount(0);
    await expect(dialog.locator('[data-part="government-mayor"] .recruit-stat')).toHaveCount(6);
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

    // 도시 하루 값(743 나): 세 줄이 있다(값이 아직 없으면 —)
    await expect(dialog.locator('[data-part="government-satisfaction"] dd')).not.toHaveText("");
    await expect(dialog.locator('[data-part="government-development"] dd')).not.toHaveText("");
    await expect(dialog.locator('[data-part="government-necessities"] dd')).not.toHaveText("");

    // [창고]: 대화상자를 닫고 경제 화면 창고 칸으로
    await dialog.locator(".gov-link").first().click();
    await expect(page).toHaveURL(/\/economy\/warehouse$/);
    expect(deviceErrors).toEqual([]);
  });

  test("지도자 이름표(748 나) → 누르면 지도자 판 → 수도 정부 판(지도자 머리·도시 하루 값·창구), 외교 → 세력 화면", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const { mapKey, hall, unitId, name, tag } = await openLeaderTag(page, "ko");
    // 지도자 창구 조회 = 수도 행정 건물의 정부 판
    const viaLeader = await trpcData(page, "world.leaderGovernment", { mapKey, unitId });
    expect(field(viaLeader, "status")).toBe("ready");
    expect(field(viaLeader, "buildingId")).toBe(hall.id);
    const day = field(field(viaLeader, "city"), "day");
    expect(Number.isInteger(field(day, "development"))).toBe(true);
    // 지도자가 아닌 유닛(내 사이보그)으로 물으면 unknown_unit
    const cyborg = Number(await page.locator(".map-screen").getAttribute("data-cyborg"));
    if (cyborg > 0)
      expect(
        field(await trpcData(page, "world.leaderGovernment", { mapKey, unitId: cyborg }), "status"),
      ).toBe("unknown_unit");

    await tapTag(page, tag);
    await expect(page.locator(".map-screen")).toHaveAttribute("data-selected", String(unitId));
    const sheet = page.locator(`[data-part="leader-sheet"][data-unit="${unitId}"]`);
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet).toContainText(name);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    await sheet.locator(".gov-open").click();
    const dialog = page.locator("dialog.gov-dialog[open]");
    await expect(dialog.locator('[data-part="government-leader-head"]')).toContainText(name);
    await expect(
      dialog.locator(".gov-chip").filter({ hasText: message("ko", "government_chip_capital") }),
    ).toHaveCount(1);
    await expect(dialog.locator('[data-part="government-development"] dd')).toHaveText(
      message("ko", "government_points", { value: Number(field(day, "development")) }),
    );
    await expect(dialog.locator('[data-part="government-citizenship"]')).toContainText(
      message("ko", "government_desk_citizenship_note"),
    );
    await expect(dialog.locator('[data-part="recruit-card"]').first()).toBeVisible({ timeout: 20_000 });
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    // 외교: 대화상자를 닫고 세력 화면으로
    await dialog.locator('[data-part="government-diplomacy"] button').click();
    await expect(page).toHaveURL(/\/faction$/);
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

      test(`지도자 이름표·지도자 판·지도자 정부 판 (390·${theme}·${language})`, async ({
        page,
        deviceErrors,
      }) => {
        test.setTimeout(240_000);
        const { unitId, tag } = await openLeaderTag(page, language);
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `leader-tag-390-${theme}-${language}`);
        await tapTag(page, tag);
        const sheet = page.locator(`[data-part="leader-sheet"][data-unit="${unitId}"]`);
        await expect(sheet).toBeVisible({ timeout: 15_000 });
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `leader-sheet-390-${theme}-${language}`);
        await sheet.locator(".gov-open").click();
        const dialog = page.locator("dialog.gov-dialog[open]");
        await expect(dialog.locator('[data-part="government-leader-head"]')).toBeVisible();
        await expect(dialog.locator('[data-part="recruit-card"]').first()).toBeVisible({ timeout: 20_000 });
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `leader-dialog-390-${theme}-${language}`);
        // 도시 하루 값·창구까지 내려 한 장 더
        await dialog.locator('[data-part="government-desk"]').scrollIntoViewIfNeeded();
        await shot(page, `leader-dialog-desk-390-${theme}-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
