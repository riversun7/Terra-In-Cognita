// 사업장 장부 화면 시험 — 기획 D-548·D-555(1513 "장부는 모두에게 공개, 건물 판 개편"), docs/adr/2026-11-15-business-ledger.md.
// - player: 내 사이보그 2차맵의 시작 도시 시설(NPC 사업장) 건물 판에서 [장부]를 펼치면 서버 장부(facilities.books)가 보인다: 주인 = NPC 나라,
//   소득세·금고·기간(1·7·30일) 단추. 기간을 바꾸면 다시 읽는다. 남의 사업장이라 정산 단추는 없다. 가로 넘침·작은 단추 없음.
// - 사진(E2E_SHOTS_DIR): 장부 칸 390 파스텔 한국어·다크 영어(합계 쪽·물건·거래 쪽 둘씩). 기록이 많은 모양을 보이려고 사진 시험만 응답에 견본 장부를 얹는다(rewriteTrpc —
//   화면 모양 확인용, 판정은 위 시험이 실제 서버 값으로 본다).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { collapseNearby, nearbyBuildingIds, openBuildingFromList, openNearby } from "./helpers/nearby.ts";
import { elementShot, horizontalOverflow, smallTapTargets } from "./helpers/screen.ts";
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
}

/** 내 2차맵을 열고 시작 도시 시설 하나의 건물 판을 연다. 건물 ID */
async function openFacilitySheet(page: Page, sample: boolean): Promise<number> {
  await rewriteTrpc(page, {
    "summary.get": hideSummary,
    ...(sample ? { "facilities.books": sampleBooks } : {}),
  });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
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

test.describe("사업장 장부: 플레이어", () => {
  test.use({ account: "player" });

  test("NPC 사업장 건물 판 [장부]: 주인·금고·기간, 남의 것이라 정산 단추 없음", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    const id = await openFacilitySheet(page, false);
    const books = page.locator(`.gather-sheet[data-building="${String(id)}"] [data-part="business-books"]`);
    await expect(books).toBeVisible({ timeout: 20_000 });
    await books.locator(".books-summary").click();
    await expect(books.locator(".books-body")).toBeVisible({ timeout: 20_000 });
    await expect(books).toContainText(message("ko", "books_owner_npc"));
    await expect(books.locator('[data-part="books-vault"]')).toBeVisible();
    await expect(books.locator('[data-part="books-settle"]')).toHaveCount(0);
    // 기간 30일로 바꾸면 그 단추가 눌린 상태
    const month = books.getByRole("button", { name: message("ko", "books_days", { days: 30 }) });
    await month.click();
    await expect(month).toHaveAttribute("aria-pressed", "true");
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

const LOOKS = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "en" },
] as const satisfies readonly { theme: Theme; language: Language }[];

for (const look of LOOKS) {
  test.describe(`사업장 장부 사진 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language, ...VIEWPORTS.phone });

    test(`장부 칸 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(240_000);
      const id = await openFacilitySheet(page, true);
      const books = page.locator(`.gather-sheet[data-building="${String(id)}"] [data-part="business-books"]`);
      await books.locator(".books-summary").click();
      await expect(books.locator('[data-part="books-totals"]')).toBeVisible({ timeout: 20_000 });
      await expect(books.locator('[data-part="books-debt"]')).toBeVisible();
      await expect(books.locator('[data-part="books-bars"] li')).toHaveCount(3);
      expect(await horizontalOverflow(page)).toEqual([]);
      // 건물 판은 스크롤하는 판이라 판 전체를 두 번 찍는다(합계 쪽·창고 물건·최근 거래 쪽)
      const sheet = page.locator(`.gather-sheet[data-building="${String(id)}"]`);
      await books.locator('[data-part="books-totals"]').scrollIntoViewIfNeeded();
      await elementShot(sheet, `business-books-390-${look.theme}-${look.language}`);
      await books.locator('[data-part="books-entries"]').scrollIntoViewIfNeeded();
      await elementShot(sheet, `business-books-goods-390-${look.theme}-${look.language}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
