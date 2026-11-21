// 정부 지분 시장·증권 거래소 판·지분 호가창 화면 시험(기획 D-583 — 질문 2438 답, docs/adr/2026-11-21-share-market.md).
// - 정부 대화상자 [정부 지분 시장] 칸: 주주 전체(이 도시·나라 전체)·호가창·다음 체결 시계·주문(WebSocket city_share_order — 나라 화폐가 없으면
//   서버가 insufficient_funds로 거절)·국고 지분 칸.
// - 건물 판 [지분] 칸: 사업장 지분 호가창(사기 주문을 걸면 살 쪽 값 줄이 생기고, 거두면 사라진다).
// - 증권 거래소 건물 판: 시험 세계에 증권 거래소가 없어 건물 판 응답을 증권 거래소로 바꾸고 거래소 목록을 견본으로 채운다(도시 줄을 누르면 진짜
//   도시 지분 시장이 열린다).
// 사진: 390 파스텔·다크(한국어) + 파스텔 영어(긴 문구), E2E_SHOTS_DIR.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { collapseNearby, nearbyBuildingIds, openBuildingFromList, openNearby } from "./helpers/nearby.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** tRPC 조회 하나(이 화면의 쿠키로)의 data */
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

async function openMap(page: Page, path = "/map"): Promise<number> {
  await page.goto(path);
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  return Number(await map.getAttribute("data-map-key"));
}

/** 이 2차맵의 행정 건물(정부 판이 ready) */
async function findHall(page: Page, mapKey: number): Promise<{ id: number; data: unknown }> {
  for (let id = 1; id <= 200; id++) {
    const data = await trpcData(page, "world.government", { buildingId: id });
    if (field(data, "status") === "ready" && field(field(data, "city"), "mapKey") === String(mapKey))
      return { id, data };
  }
  throw new Error("no government hall on this second map");
}

/** 견본 도시 지분 시장(사진·주문 시험용): 서버 답 모양 그대로 두고 지갑·호가창·내 주문만 채운다 */
function sampleCity(withBook: boolean) {
  return (data: unknown): void => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "status") !== "ok") return;
    const me = field(data, "me");
    if (typeof me === "object" && me !== null) Reflect.set(me, "cash", "250000");
    if (!withBook) return;
    Reflect.set(data, "book", {
      asks: [
        { price: "1180", shares: "40", orders: 2 },
        { price: "1240", shares: "15", orders: 1 },
        { price: "1300", shares: "120", orders: 3 },
      ],
      bids: [
        { price: "1150", shares: "60", orders: 2 },
        { price: "1100", shares: "25", orders: 1 },
        { price: "990", shares: "300", orders: 4 },
      ],
    });
    Reflect.set(data, "expected", null);
    Reflect.set(data, "bidShares", "385");
    Reflect.set(data, "askShares", "175");
    Reflect.set(data, "lastPrice", "1165");
    Reflect.set(data, "myOrders", [{ id: 901, side: "buy", price: "1100", shares: "25", as: "me" }]);
  };
}

/** 정부 작은 판 → [정부 열기] → 정부 지분 칸. 행정 건물 */
async function openShares(page: Page, withBook: boolean) {
  await rewriteTrpc(page, { "summary.get": hideSummary, "shares.city": sampleCity(withBook) });
  const mapKey = await openMap(page);
  const hall = await findHall(page, mapKey);
  const cell = field(hall.data, "building");
  await openMap(page, `/map?key=${mapKey}&at=${String(field(cell, "x"))},${String(field(cell, "y"))}`);
  await openBuildingFromList(page, hall.id);
  await expect(page.locator(`.gov-sheet[data-building="${hall.id}"]`)).toBeVisible({ timeout: 15_000 });
  await page.locator(".gov-open").click();
  const dialog = page.locator("dialog.gov-dialog[open]");
  await expect(dialog).toBeVisible();
  const market = dialog.locator('[data-part="city-share-market"]');
  await market.scrollIntoViewIfNeeded();
  await expect(market.locator('[data-part="city-share-holders"] li').first()).toBeVisible({
    timeout: 20_000,
  });
  return { hall, dialog, market, cityId: Number(field(field(hall.data, "city"), "id")) };
}

/** 내 2차맵 시작 도시의 사업장 하나(장부가 ok) 건물 판. edits = 더 바꿀 tRPC 답 */
async function openBusiness(page: Page, edits: Readonly<Record<string, (data: unknown) => void>> = {}) {
  await rewriteTrpc(page, { "summary.get": hideSummary, ...edits });
  await openMap(page);
  await openNearby(page, "buildings");
  await expect(page.locator('.map-nearby-row[data-kind="building"]').first()).toBeVisible({
    timeout: 30_000,
  });
  const ids = await nearbyBuildingIds(page);
  let found: number | null = null;
  for (const id of ids) {
    const data = await trpcData(page, "facilities.books", { buildingId: id, days: 7 });
    if (field(data, "status") === "ok") {
      found = id;
      break;
    }
  }
  expect(found).not.toBeNull();
  await collapseNearby(page);
  await openBuildingFromList(page, found ?? 0);
  const sheet = page.locator(`.gather-sheet[data-building="${String(found)}"]`);
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return { id: found ?? 0, sheet };
}

/** 증권 거래소 견본(건물 판 응답 → 증권 거래소, 거래소 목록 = 진짜 도시 하나 + 견본 사업장) */
function exchangeEdits(cityId: () => number) {
  return {
    "gather.building": (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      Reflect.set(data, "facilityId", "stock_exchange");
      Reflect.set(data, "name", { ko: "증권 거래소", en: "Stock exchange" });
      if (Number(field(data, "level")) < 1) Reflect.set(data, "level", 1);
    },
    "shares.hub": (data: unknown) => {
      if (typeof data !== "object" || data === null) return;
      Reflect.set(data, "status", "ok");
      Reflect.set(data, "buildingId", 1);
      Reflect.set(data, "cityId", cityId());
      Reflect.set(data, "nationName", { ko: "시험 나라", en: "Test nation" });
      Reflect.set(data, "nextRoundMs", Date.now() + 754_000);
      Reflect.set(data, "cities", [
        {
          cityId: cityId(),
          name: { ko: "첫 도시", en: "First city" },
          asset: "s3_test_credit",
          total: "1000",
          lastPrice: "1165",
          bidShares: "385",
          askShares: "175",
        },
      ]);
      Reflect.set(data, "businesses", [
        {
          buildingId: 5,
          cityId: cityId(),
          facilityId: "farm",
          name: { ko: "농장", en: "Farm" },
          issued: true,
          lastPrice: "42",
          bidShares: "10",
          askShares: "0",
        },
        {
          buildingId: 6,
          cityId: cityId(),
          facilityId: "lumber_camp",
          name: { ko: "벌목장", en: "Lumber camp" },
          issued: false,
          lastPrice: null,
          bidShares: "0",
          askShares: "0",
        },
      ]);
    },
  };
}

test.describe("지분 시장: 플레이어", () => {
  test.use({ account: "player" });

  test("정부 지분 칸: 주주 전체(도시·나라)·호가창·시계·주문은 서버가 판정(나라 화폐 없음 → 거절)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const { market, cityId } = await openShares(page, false);
    // 서버 답: 그 도시 주주(국고 포함)·나라 전체 주주
    const view = await trpcData(page, "shares.city", { cityId });
    expect(field(view, "status")).toBe("ok");
    expect(Number(field(view, "total"))).toBeGreaterThan(0);
    await expect(market).toHaveAttribute("data-city", String(cityId));
    const holders = market.locator('[data-part="city-share-holders"] li');
    expect(await holders.count()).toBeGreaterThan(0);
    await market.locator('[data-part="city-share-scope-nation"]').click();
    await expect(market.locator('[data-part="city-share-scope-nation"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(market.locator('[data-part="round-clock"]')).toContainText(/\d:\d\d/);
    // 시험 세계에는 걸린 주문이 없다 → 빈 호가창
    await expect(market.locator('[data-part="book-empty"]')).toHaveText(message("ko", "book_empty"));
    // 국고 칸: 그 나라 시민(player)은 국고 주 수만 보고 팔기 안건은 못 올린다(NPC 나라)
    const treasury = market.locator('[data-part="city-share-treasury"]');
    await expect(treasury).toBeVisible();
    await expect(treasury.locator('[data-part="city-share-treasury-submit"]')).toHaveCount(0);
    // 사기 주문: 화면 지갑은 견본으로 채웠지만 서버 지갑에는 나라 화폐가 없다 → 서버가 거절(WebSocket city_share_order)
    const order = market.locator('[data-part="city-share-order"]');
    await order.locator('[data-part="city-share-price"]').fill("3");
    await order.locator('[data-part="city-share-qty"]').fill("2");
    await expect(order.locator('[data-part="city-share-lock"]')).toContainText("6");
    await order.locator('[data-part="city-share-submit"]').click();
    await expect(order.locator(".bp-notice")).toHaveText(
      new RegExp(`${message("ko", "books_err_funds")}|${message("ko", "shares_placed")}`),
      { timeout: 20_000 },
    );
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("사업장 지분 호가창: 사기 주문을 걸면 살 쪽 값 줄, 거두면 빈 호가창", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const { sheet } = await openBusiness(page);
    await sheet.locator('.bp-tab[data-tab="shares"]').click();
    const market = sheet.locator('[data-part="share-market"]');
    const book = market.locator('[data-part="order-book"]');
    await expect(book).toBeVisible({ timeout: 20_000 });
    await market.locator('[data-part="share-price"]').fill("2");
    await market.locator('[data-part="share-qty"]').fill("3");
    await market.locator('[data-part="share-submit"]').click();
    await expect(market.locator('[data-part="share-orders"] li')).toHaveCount(1, { timeout: 20_000 });
    const bid = book.locator('.sm-level[data-side="bid"]').first();
    await expect(bid).toContainText("2");
    await expect(bid).toContainText("3");
    // 값 줄을 누르면 주문 값 칸에 들어간다
    await market.locator('[data-part="share-price"]').fill("");
    await bid.locator(".sm-price-pick").click();
    await expect(market.locator('[data-part="share-price"]')).toHaveValue("2");
    await market.locator('[data-part="share-orders"] li button').click();
    await expect(market.locator('[data-part="share-orders"]')).toHaveCount(0, { timeout: 20_000 });
    await expect(book.locator('[data-part="book-empty"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("증권 거래소 판: 정부 지분·사업장 지분 목록 → 도시 줄을 누르면 그 도시 지분 시장", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    let city = 0;
    const { sheet } = await openBusiness(
      page,
      exchangeEdits(() => city),
    );
    // 진짜 도시 하나(내 나라 첫 도시) — 견본 목록이 그 도시를 가리킨다
    const mapKey = Number(await page.locator(".map-screen").getAttribute("data-map-key"));
    city = Number(field(field((await findHall(page, mapKey)).data, "city"), "id"));
    await sheet.locator('.bp-tab[data-tab="overview"]').click();
    const hub = sheet.locator('[data-part="share-hub"]');
    await expect(hub).toBeVisible({ timeout: 20_000 });
    await expect(hub.locator('[data-part="share-hub-businesses"] li')).toHaveCount(2);
    await hub.locator(`.sm-hub-item[data-city="${city}"]`).click();
    await expect(hub).toHaveAttribute("data-open", "city");
    await expect(hub.locator('[data-part="city-share-market"]')).toHaveAttribute("data-city", String(city), {
      timeout: 20_000,
    });
    await hub.locator('[data-part="share-hub-back"]').click();
    await expect(hub.locator('[data-part="share-hub-cities"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

const SHOTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "ko" },
  { theme: "pastel", language: "en" },
];

test.describe("지분 시장 사진", () => {
  test.use({ account: "player" });

  for (const { theme, language } of SHOTS) {
    test.describe(`390 ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS.phone, theme, language });

      test(`정부 지분 칸·증권 거래소 판 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(300_000);
        const { dialog, market } = await openShares(page, true);
        await expect(market.locator('[data-part="order-book"] .sm-level')).toHaveCount(6);
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `city-shares-holders-390-${theme}-${language}`);
        await market.locator('[data-part="order-book"]').scrollIntoViewIfNeeded();
        await shot(page, `city-shares-book-390-${theme}-${language}`);
        await market.locator('[data-part="city-share-order"]').scrollIntoViewIfNeeded();
        await shot(page, `city-shares-order-390-${theme}-${language}`);
        await dialog.locator(".gov-close").click();
        expect(deviceErrors).toEqual([]);
      });

      test(`증권 거래소 판 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(300_000);
        const { sheet } = await openBusiness(
          page,
          exchangeEdits(() => 1),
        );
        await sheet.locator('.bp-tab[data-tab="overview"]').click();
        const hub = sheet.locator('[data-part="share-hub"]');
        await expect(hub).toBeVisible({ timeout: 20_000 });
        await hub.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        await shot(page, `share-hub-390-${theme}-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
