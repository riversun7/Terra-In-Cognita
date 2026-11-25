// 홈 [도시 활동] 카드 시험 — 사용자 요청 2026-11-25 "대시보드의 2차맵 없이 빠른 도시활동 메뉴"(docs/adr/2026-11-25-home-city-card.md).
// - player: 홈에 카드가 있고(기본 카드 — 처리할 일 다음), 기준 유닛(내 사이보그)이 있는 2차맵의 건물 줄이 보인다. 줄을 누르면 2차맵과 같은
//   건물 판이 대화상자로 열리고([들어가기]·[닫기]·위 줄 바로가기) [닫기]로 닫힌다. 유닛·자원 조회는 그 탭을 누르기 전에는 보내지 않는다.
//   [유닛] 탭의 주변 유닛(시야 안 남의 유닛) 줄 → 한눈 판 대화상자([공격]). [자원] 탭의 [채집] → 진행 줄 → [멈추기].
//   [정보] 탭에 미니맵(지형)·있는 곳·건물 수가 보인다. 가로 넘침·작은 단추 없음.
// - player(견본): 도시가 아닌 2차맵 모양 — 응답에서 도시·정부 건물을 빼고 땅 규칙에 "새 도시 주인"을 얹는다(rewriteTrpc — 화면 모양 확인용,
//   판정은 서버 시험). "도시 밖 지역"과 [정부 건물 건설 가능] 표시(2차맵으로 가는 링크)가 보인다.
// - 사진(E2E_SHOTS_DIR): 390 파스텔 한국어·다크 영어 — 카드, 건물 판 대화상자.
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc, watchTrpc } from "./helpers/trpc.ts";

test.describe("홈 도시 활동 카드", () => {
  test.use({ account: "player" });

  test("건물 줄 → 건물 판 대화상자, 유닛·자원은 탭을 눌러야 받는다", async ({ page, deviceErrors }) => {
    test.setTimeout(180_000);
    await rewriteTrpc(page, { "summary.get": hideSummary });
    const calls = watchTrpc(page);
    const count = (name: string): number => calls.filter((call) => call.procedures.includes(name)).length;
    const asked = (name: string): boolean => count(name) > 0;
    await page.goto("/");
    const card = page.locator('.home-card[data-card="city"]');
    await expect(card.locator(".city-card[data-map]")).toBeVisible({ timeout: 60_000 });
    const rows = card.locator(".city-card-row[data-building]");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    // 기준 유닛 = 내 사이보그(고르기 상자의 첫 줄)
    await expect(card.locator(".city-card-unit select option")).not.toHaveCount(0);
    // 탭을 누르기 전: 건물 조회는 했고 유닛·자원 조회는 없다
    expect(asked("facilities.mapLooks")).toBe(true);
    expect(asked("world.mapUnits")).toBe(false);
    expect(asked("world.nearbyUnits")).toBe(false);
    expect(asked("gather.objects")).toBe(false);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // 건물 줄 → 건물 판 대화상자(2차맵 건물 판 그대로)
    const id = await rows.first().getAttribute("data-building");
    await rows.first().click();
    const dialog = page.locator(`dialog.city-dialog[data-building="${String(id)}"]`);
    await expect(dialog.locator(`.bp[data-building="${String(id)}"]`)).toBeVisible({ timeout: 30_000 });
    await expect(dialog.locator(".gather-sheet-enter")).toBeVisible();
    await expect(dialog.locator(".city-dialog-bar a")).toHaveCount(2);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await dialog.locator(".gather-sheet-close").click();
    await expect(page.locator("dialog.city-dialog")).toHaveCount(0);

    // [유닛] 탭: 누르면 묻는다 — 내 사이보그 줄(건물 판도 보낼 유닛 이름을 알려고 한 번 물었다 — 닫힌 뒤의 수와 견준다)
    const unitsBefore = count("world.mapUnits");
    await card.locator('.city-card-tab[data-tab="units"]').click();
    await expect(card.locator(".city-card-row[data-unit]").first()).toBeVisible({ timeout: 20_000 });
    expect(count("world.mapUnits")).toBeGreaterThan(unitsBefore);
    // 주변 유닛(시야 안 남의 유닛 — 시작 도시의 NPC 휴먼): 줄을 누르면 2차맵과 같은 한눈 판(공격 단추) 대화상자, [닫기]
    const others = card.locator(".city-card-row[data-other]");
    await expect(others.first()).toBeVisible({ timeout: 20_000 });
    expect(asked("world.nearbyUnits")).toBe(true);
    await others.first().click();
    const peek = page.locator("dialog.city-dialog-unit .map-peek");
    await expect(peek).toBeVisible({ timeout: 30_000 });
    await expect(peek.locator('[data-part="unit-attack"]')).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await peek.locator(".map-peek-close").click();
    await expect(page.locator("dialog.city-dialog-unit")).toHaveCount(0);

    // [자원] 탭: 누르면 묻는다(건물 판이 열린 동안에는 2차맵 채집 판과 같이 그 판이 오브젝트를 물었다 — 닫힌 뒤의 수와 견준다)
    const objectsBefore = count("gather.objects");
    await card.locator('.city-card-tab[data-tab="resources"]').click();
    await expect.poll(() => count("gather.objects"), { timeout: 20_000 }).toBeGreaterThan(objectsBefore);
    // [채집]: 가장 가까운 곳으로 보낸다 → 진행 줄 + [멈추기] → 멈추면 단추가 사라진다(명령은 2차맵과 같은 WebSocket gather_start·gather_stop)
    const gather = card.locator('.city-card-gather[data-part="gather"]').first();
    await expect(gather).toBeVisible({ timeout: 20_000 });
    expect(await smallTapTargets(page)).toEqual([]);
    await gather.click();
    const loop = card.locator(".city-card-loop");
    await expect(loop.locator(".city-card-stop")).toBeVisible({ timeout: 20_000 });
    await expect(card.locator(".city-card-problem")).toHaveCount(0);
    await loop.locator(".city-card-stop").click();
    await expect(loop.locator(".city-card-stop")).toHaveCount(0, { timeout: 20_000 });
    // [정보] 탭: 미니맵(지형을 받아 그린다) + 사실 칸
    await card.locator('.city-card-tab[data-tab="info"]').click();
    const minimap = card.locator('.city-minimap[data-terrain="ready"]');
    await expect(minimap).toBeVisible({ timeout: 30_000 });
    // 처음에는 건물 둘레 보기(건물 자리가 또렷하게), [2차맵 전체 보기]로 바꾼다
    await expect(minimap).toHaveAttribute("data-view", "buildings");
    await minimap.locator(".city-minimap-zoom").click();
    await expect(minimap).toHaveAttribute("data-view", "all");
    await expect(card.locator(".city-card-facts")).toBeVisible();
    await expect(card.locator(".city-card-links a")).toHaveCount(2);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

/** 견본: 도시 목록에서 도시를 모두 뺀다 */
function noCities(data: unknown): void {
  if (typeof data === "object" && data !== null) Reflect.set(data, "cities", []);
}

/** 견본: 건물 목록에서 정부 건물을 뺀다 */
function noGovernment(data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  const rows: unknown = Reflect.get(data, "buildings");
  if (!Array.isArray(rows)) return;
  Reflect.set(
    data,
    "buildings",
    rows.filter(
      (row: unknown) =>
        typeof row !== "object" || row === null || Reflect.get(row, "facilityId") !== "government_hall",
    ),
  );
}

/** 견본: 정부 건물을 지으면 새 도시(1인 도시)가 되는 땅 */
function claimableLand(data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  Reflect.set(data, "status", "ready");
  Reflect.set(data, "allowed", true);
  Reflect.set(data, "reason", null);
  Reflect.set(data, "claim", "personal");
  Reflect.set(data, "governmentExists", false);
}

test.describe("홈 도시 활동 카드: 도시가 아닌 2차맵(견본)", () => {
  test.use({ account: "player" });

  test("도시 밖 지역 + 정부 건물 건설 가능 표시", async ({ page, deviceErrors }) => {
    test.setTimeout(120_000);
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "world.cities": noCities,
      "facilities.mapLooks": noGovernment,
      "facilities.landRule": claimableLand,
    });
    await page.goto("/");
    const card = page.locator('.home-card[data-card="city"]');
    await expect(card.locator(".city-card-row[data-building]").first()).toBeVisible({ timeout: 60_000 });
    await expect(card.locator('.city-card-place[data-wild="true"]')).toBeVisible({ timeout: 20_000 });
    await expect(card.locator('.city-card-row[data-facility="government_hall"]')).toHaveCount(0);
    const claim = card.locator('[data-part="claim"]');
    await expect(claim).toBeVisible({ timeout: 20_000 });
    await expect(claim).toHaveAttribute("href", /^\/map\?key=\d+$/);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    await card.scrollIntoViewIfNeeded();
    await shot(page, "home-city-card-wild-pastel-ko-390");
    expect(deviceErrors).toEqual([]);
  });
});

const LOOKS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "en" },
];

for (const look of LOOKS) {
  test.describe(`홈 도시 활동 카드 사진 390·${look.theme}·${look.language}`, () => {
    test.use({ account: "player", theme: look.theme, language: look.language });

    test(`카드·건물 판 (390·${look.theme}·${look.language})`, async ({ page, deviceErrors }) => {
      test.setTimeout(180_000);
      await rewriteTrpc(page, { "summary.get": hideSummary });
      await page.goto("/");
      const card = page.locator('.home-card[data-card="city"]');
      const rows = card.locator(".city-card-row[data-building]");
      await expect(rows.first()).toBeVisible({ timeout: 60_000 });
      await card.scrollIntoViewIfNeeded();
      await shot(page, `home-city-card-${look.theme}-${look.language}-390`);
      await rows.first().click();
      const dialog = page.locator("dialog.city-dialog");
      await expect(dialog.locator(".bp")).toBeVisible({ timeout: 30_000 });
      await expect(dialog.locator('[data-part="building-owner"]')).toBeVisible({ timeout: 20_000 });
      await shot(page, `home-city-dialog-${look.theme}-${look.language}-390`);
      expect(await horizontalOverflow(page)).toEqual([]);
      await dialog.locator(".gather-sheet-close").click();
      await expect(dialog).toHaveCount(0);
      // 유닛·자원·정보 탭
      for (const tab of ["units", "resources", "info"]) {
        await card.locator(`.city-card-tab[data-tab="${tab}"]`).click();
        if (tab === "units")
          await expect(card.locator(".city-card-row[data-other]").first()).toBeVisible({ timeout: 20_000 });
        if (tab === "resources")
          await expect(card.locator(".city-card-row[data-kind]").first()).toBeVisible({ timeout: 20_000 });
        if (tab === "info")
          await expect(card.locator('.city-minimap[data-terrain="ready"]')).toBeVisible({ timeout: 30_000 });
        await card.scrollIntoViewIfNeeded();
        await shot(page, `home-city-${tab}-${look.theme}-${look.language}-390`);
        expect(await horizontalOverflow(page)).toEqual([]);
      }
      expect(deviceErrors).toEqual([]);
    });
  });
}
