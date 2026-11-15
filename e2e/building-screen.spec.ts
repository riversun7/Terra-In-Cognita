// 건물 판·재무 화면 시험 — 사용자 요청 2026-11-15(건물 판 개편: 주인 이름표·칸·임금형/임대형·관리·재무 화면·지분 사고팔기),
// docs/adr/2026-11-15-building-screen.md. (옛 사업장 장부 시험 business-books.spec.ts를 이어 받았다 — D-548·D-555 장부 공개)
// - player: 시작 도시 NPC 사업장 건물 판 — 머리 이름표가 "남의 건물"이 아니라 주인(NPC 나라) 이름, 칸 개요·일꾼·창고·장부·지분(관리 칸 없음).
//   [장부] 칸: 금고·기간(30일 누름) → [재무 보기] → 재무 화면(손익계산서·재무상태·지분 시장). [지분] 칸: 주주(NPC 100%), 사기 주문 1주를 걸고
//   거둔다(프로토콜 38). [일꾼] 칸: 일자리·임대·계약 카드. 가로 넘침·작은 단추 없음.
// - dev(운영자 모드): 남의 사업장에도 [관리] 칸 + 운영자 표시, 임대료를 정하면 [일꾼] 칸에 시간당 임대료가 보인다(서버가 주인 대신 처리).
// - dev(운영자 모드): [관리] 칸 지급준비금(D-564 1623) 비율을 골라 저장되고 기본값으로 되돌린다.
// - 사진(E2E_SHOTS_DIR): 건물 판 개요·지분·장부 칸과 재무 화면, [관리] 칸 지급준비금, 390 파스텔 한국어·다크 영어. 장부 사진은 응답에 견본 장부를 얹는다(rewriteTrpc —
//   화면 모양 확인용, 판정은 위 시험이 실제 서버 값으로 본다).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { setOperatorMode } from "./helpers/mapHud.ts";
import { collapseNearby, nearbyBuildingIds, openBuildingFromList, openNearby } from "./helpers/nearby.ts";
import { elementShot, horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const DAY = 86_400_000;

/** 견본 장부(사진용): 서버 답의 모양을 그대로 두고 칸만 채운다 */
function sampleBooks(data: unknown): void {
  if (typeof data !== "object" || data === null || Reflect.get(data, "status") !== "ok") return;
  const now = Number(Reflect.get(data, "toMs"));
  const today = Math.floor(now / DAY) * DAY;
  Reflect.set(data, "vault", [{ asset: "s3_test_credit", amount: "12840" }]);
  Reflect.set(data, "debt", [{ asset: "s3_test_credit", amount: "600" }]);
  Reflect.set(data, "debtSinceMs", now - 3_600_000);
  Reflect.set(data, "goods", [
    { asset: "item:pine_log", qty: "340", price: "4", name: { ko: "소나무 통나무", en: "Pine log" } },
    { asset: "item:stone", qty: "1250", price: null, name: { ko: "돌", en: "Stone" } },
  ]);
  Reflect.set(data, "totals", [
    {
      asset: "s3_test_credit",
      columns: {
        income: "18200",
        sales: "1360",
        tax: "-392",
        wages: "-6000",
        upkeep: "-240",
        settlement: "-9000",
      },
      profit: "12928",
    },
  ]);
  Reflect.set(data, "days", [
    { dayMs: today - 2 * DAY, asset: "s3_test_credit", income: "5200", spend: "2100" },
    { dayMs: today - DAY, asset: "s3_test_credit", income: "7400", spend: "3300" },
    { dayMs: today, asset: "s3_test_credit", income: "6960", spend: "1232" },
  ]);
  Reflect.set(data, "entries", [
    {
      txId: 9,
      atMs: now - 60_000,
      kind: "lodging_fee",
      column: "income",
      asset: "s3_test_credit",
      amount: "120",
    },
    {
      txId: 8,
      atMs: now - 61_000,
      kind: "business_tax",
      column: "tax",
      asset: "s3_test_credit",
      amount: "-2",
    },
    {
      txId: 7,
      atMs: now - 3_600_000,
      kind: "labor_deposit",
      column: "wages",
      asset: "s3_test_credit",
      amount: "-600",
    },
    {
      txId: 6,
      atMs: now - 7_200_000,
      kind: "storage_move",
      column: "goods",
      asset: "item:pine_log",
      amount: "40",
    },
  ]);
  Reflect.set(data, "firstMs", today - 2 * DAY);
  // 지급준비금(D-564 1623): 필요액 6,200 × 1.2 × 150%
  Reflect.set(data, "reserve", {
    ratioPm: 1500,
    chosen: true,
    marginPm: 200,
    lines: [{ asset: "s3_test_credit", needed: "6200", keep: "11160" }],
  });
}

/** 내 2차맵을 열고 시작 도시 시설(사업장) 하나의 건물 판을 연다. 건물 ID */
async function openFacilitySheet(page: Page, sample: boolean, operator = false): Promise<number> {
  await rewriteTrpc(page, {
    "summary.get": hideSummary,
    ...(sample ? { "facilities.books": sampleBooks } : {}),
  });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  if (operator) await setOperatorMode(page, true);
  await openNearby(page, "buildings");
  await expect(page.locator('.map-nearby-row[data-kind="building"]').first()).toBeVisible({
    timeout: 30_000,
  });
  const ids = await nearbyBuildingIds(page);
  // 사업장(시설 줄이 있는 건물)인 첫 건물
  const found = await page.evaluate(async (list) => {
    for (const id of list) {
      const input = encodeURIComponent(JSON.stringify({ buildingId: id, days: 7 }));
      const reply: unknown = await fetch(`/api/trpc/facilities.books?input=${input}`).then((r) => r.json());
      const data: unknown =
        typeof reply === "object" && reply !== null
          ? Reflect.get(Reflect.get(reply, "result") ?? {}, "data")
          : undefined;
      if (typeof data === "object" && data !== null && Reflect.get(data, "status") === "ok") return id;
    }
    return null;
  }, ids);
  expect(found).not.toBeNull();
  await collapseNearby(page);
  await openBuildingFromList(page, found ?? 0);
  return found ?? 0;
}

const sheetOf = (page: Page, id: number) => page.locator(`.gather-sheet[data-building="${String(id)}"]`);

test.describe("건물 판: 플레이어", () => {
  test.use({ account: "player" });

  test("NPC 사업장: 주인 이름표·칸·장부 → 재무 화면, 관리 칸 없음", async ({ page, deviceErrors }) => {
    test.setTimeout(240_000);
    const id = await openFacilitySheet(page, false);
    const sheet = sheetOf(page, id);
    const owner = sheet.locator('[data-part="building-owner"]');
    await expect(owner).toBeVisible({ timeout: 20_000 });
    await expect(owner).toHaveAttribute("data-kind", "npc");
    await expect(owner).not.toContainText(message("ko", "gather_building_other"));
    await expect(sheet.locator('[data-part="building-mine"]')).toHaveCount(0);
    for (const tab of ["overview", "work", "storage", "books", "shares"])
      await expect(sheet.locator(`.bp-tab[data-tab="${tab}"]`)).toBeVisible();
    await expect(sheet.locator('.bp-tab[data-tab="manage"]')).toHaveCount(0);
    // [장부]: 금고·기간 30일
    await sheet.locator('.bp-tab[data-tab="books"]').click();
    await expect(sheet.locator('[data-part="books-vault"]')).toBeVisible({ timeout: 20_000 });
    const month = sheet.getByRole("button", { name: message("ko", "books_days", { days: 30 }) });
    await month.click();
    await expect(month).toHaveAttribute("aria-pressed", "true");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    // [재무 보기] → 재무 화면(누구나)
    await sheet.locator('[data-part="books-open"]').click();
    await expect(page).toHaveURL(new RegExp(`/buildings/${String(id)}/books$`));
    const screen = page.locator(`.bbs[data-building="${String(id)}"]`);
    await expect(screen.locator('[data-part="income-statement"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(screen.locator('[data-part="balance-sheet"]')).toBeVisible();
    await expect(screen.locator('[data-part="share-market"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("지분 칸: 주주·사기 주문 걸고 거두기(프로토콜 38), 일꾼 칸 카드", async ({ page, deviceErrors }) => {
    test.setTimeout(240_000);
    const id = await openFacilitySheet(page, false);
    const sheet = sheetOf(page, id);
    await sheet.locator('.bp-tab[data-tab="shares"]').click();
    const market = sheet.locator('[data-part="share-market"]');
    await expect(market.locator('[data-part="share-holders"] li')).toHaveCount(1, { timeout: 20_000 });
    await expect(market.locator('[data-part="share-holders"] li').first()).toHaveAttribute(
      "data-kind",
      "npc",
    );
    await market.locator('[data-part="share-price"]').fill("1");
    await market.locator('[data-part="share-qty"]').fill("1");
    await market.locator('[data-part="share-submit"]').click();
    await expect(market.locator('[data-part="share-orders"] li')).toHaveCount(1, { timeout: 20_000 });
    await expect(market.locator(".bp-notice")).toHaveText(message("ko", "shares_placed"));
    await market.locator('[data-part="share-orders"] li button').click();
    await expect(market.locator('[data-part="share-orders"]')).toHaveCount(0, { timeout: 20_000 });
    await sheet.locator('.bp-tab[data-tab="work"]').click();
    await expect(sheet.locator('[data-part="labor-offers"]')).toBeVisible({ timeout: 20_000 });
    await expect(sheet.locator('[data-part="labor-contracts"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("건물 판: 운영자 모드", () => {
  test.use({ account: "dev" });

  test("남의 사업장 [관리] 칸·운영자 표시, 임대료 정하기 → [일꾼] 칸에 보인다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const id = await openFacilitySheet(page, false, true);
    const sheet = sheetOf(page, id);
    await expect(sheet.locator(".bp-operator")).toBeVisible({ timeout: 20_000 });
    await sheet.locator('.bp-tab[data-tab="manage"]').click();
    await expect(sheet.locator('[data-part="labor-terms"]')).toBeVisible({ timeout: 20_000 });
    await sheet.locator('[data-part="labor-rent-input"]').fill("7");
    await sheet.locator('[data-part="labor-set-rent"]').click();
    await expect(sheet.locator(".bp-notice")).toHaveText(message("ko", "blabor_rent_set"), {
      timeout: 20_000,
    });
    await sheet.locator('.bp-tab[data-tab="work"]').click();
    await expect(sheet.locator('[data-part="labor-rent"]')).toContainText("7", { timeout: 20_000 });
    // 되돌리기: 0 = 빌려주지 않음(같은 세계의 다른 시험 — labor.spec 임대 목록 — 이 NPC 건물을 보지 않게)
    await sheet.locator('.bp-tab[data-tab="manage"]').click();
    await sheet.locator('[data-part="labor-rent-input"]').fill("0");
    await sheet.locator('[data-part="labor-set-rent"]').click();
    await expect(sheet.locator(".bp-notice")).toHaveText(message("ko", "blabor_rent_stopped"), {
      timeout: 20_000,
    });
    await sheet.locator('.bp-tab[data-tab="work"]').click();
    await expect(sheet.locator('[data-part="labor-rent"]')).toHaveText(message("ko", "blabor_rent_none"), {
      timeout: 20_000,
    });
    // 지급준비금(D-564 1623, 프로토콜 40): 비율을 고르면 서버가 저장하고, 기본값으로 되돌린다
    await sheet.locator('.bp-tab[data-tab="manage"]').click();
    const reserve = sheet.locator('[data-part="books-reserve"]');
    await expect(reserve).toBeVisible({ timeout: 20_000 });
    await reserve.locator('[data-reserve="500"]').click();
    await expect(reserve.locator(".bp-notice")).toHaveText(message("ko", "reserve_saved"), {
      timeout: 20_000,
    });
    await expect(reserve.locator('[data-reserve="500"]')).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
    await reserve.locator('[data-reserve="default"]').click();
    await expect(reserve.locator('[data-reserve="default"]')).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
    expect(deviceErrors).toEqual([]);
  });
});

const LOOKS = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "en" },
] as const satisfies readonly { theme: Theme; language: Language }[];

for (const look of LOOKS) {
  test.describe(`건물 판 사진 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`건물 판 칸·재무 화면 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(240_000);
      const id = await openFacilitySheet(page, true);
      const sheet = sheetOf(page, id);
      await expect(sheet.locator('[data-part="building-owner"]')).toBeVisible({ timeout: 20_000 });
      await shot(page, `building-panel-390-${look.theme}-${look.language}`);
      await sheet.locator('.bp-tab[data-tab="books"]').click();
      await expect(sheet.locator('[data-part="books-debt"]')).toBeVisible({ timeout: 20_000 });
      await expect(sheet.locator('[data-part="books-bars"] li')).toHaveCount(3);
      expect(await horizontalOverflow(page)).toEqual([]);
      await elementShot(sheet, `building-books-390-${look.theme}-${look.language}`);
      await sheet.locator('.bp-tab[data-tab="shares"]').click();
      await expect(sheet.locator('[data-part="share-market"]')).toBeVisible({ timeout: 20_000 });
      await elementShot(sheet, `building-shares-390-${look.theme}-${look.language}`);
      // [창고] 칸 판매(기획 D-569 1781): 값이 있는 물건만 [사기] — 주인도 같은 판매(값 0·없음이면 단추 없음)
      await sheet.locator('.bp-tab[data-tab="storage"]').click();
      const goods = sheet.locator('[data-part="books-goods"]');
      await expect(goods).toBeVisible({ timeout: 20_000 });
      const buy = message(look.language, "books_buy");
      await expect(
        goods.locator('[data-asset="item:pine_log"]').getByRole("button", { name: buy }),
      ).toBeVisible();
      await expect(goods.locator('[data-asset="item:stone"]').getByRole("button", { name: buy })).toHaveCount(
        0,
      );
      expect(await horizontalOverflow(page)).toEqual([]);
      await goods.scrollIntoViewIfNeeded();
      await elementShot(goods, `building-goods-390-${look.theme}-${look.language}`);
      await sheet.locator('.bp-tab[data-tab="books"]').click();
      await sheet.locator('[data-part="books-open"]').click();
      const screen = page.locator(`.bbs[data-building="${String(id)}"]`);
      await expect(screen.locator('[data-part="income-statement"]').first()).toBeVisible({ timeout: 20_000 });
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, `building-finance-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });

  test.describe(`건물 판 관리 사진 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "dev", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`[관리] 칸 지급준비금 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(240_000);
      const id = await openFacilitySheet(page, true, true);
      const sheet = sheetOf(page, id);
      await sheet.locator('.bp-tab[data-tab="manage"]').click();
      const reserve = sheet.locator('[data-part="books-reserve"]');
      await expect(reserve.locator('[data-part="reserve-line"]')).toHaveCount(1, { timeout: 20_000 });
      await expect(reserve.locator('[data-reserve="1500"]')).toHaveAttribute("aria-pressed", "true");
      expect(await horizontalOverflow(page)).toEqual([]);
      await reserve.scrollIntoViewIfNeeded();
      await elementShot(reserve, `building-reserve-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
