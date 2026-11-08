// 정부 대화상자의 국적 바꾸기(귀화) 칸 화면 시험(질문 745 나, docs/adr/2026-11-08-citizenship.md).
// 플레이어(가짜 계정, 첫 접속 국가 1의 수도)가 내 사이보그 2차맵의 행정 건물을 누른다. 내 나라 정부에는 귀화 칸이 없다(실제 응답). 그다음
// 정부 판 응답만 "남의 나라"로, 귀화 조건 응답만 "신청할 수 있음"으로 고쳐(tRPC 응답 고치기) 칸을 그리고 [귀화 신청] → 확인 → [귀화 확정]을
// 누른다: 명령은 진짜 WebSocket nationality_change로 가고, 서버는 그 건물이 실제로는 내 나라 정부라 same_nation으로 거절한다 → 그 문구가 뜬다.
// 사진: 390 파스텔·다크(한국어) + 파스텔 영어(긴 문구), E2E_SHOTS_DIR.
import type { Page } from "@playwright/test";
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

async function tapBuilding(page: Page, id: number): Promise<void> {
  // 근처 판 건물 탭 목록으로 연다(카메라가 기준 유닛에 붙어 건물 표시가 화면 밖일 수 있다 — docs/adr/2026-11-08-seamless-second-map.md WP-1·2)
  await openBuildingFromList(page, id);
}

/** 고친 응답 쓰기: 켜면 정부 판은 남의 나라, 귀화 조건은 신청할 수 있음(받는 나라 이름 = 임시 국가 2) */
const mock = { on: false };
const OTHER_NATION = { ko: "임시 국가 2", en: "Placeholder nation 2" };

function asOtherNation(data: unknown): void {
  const nation = field(data, "nation");
  if (mock.on && typeof nation === "object" && nation !== null) {
    Reflect.set(nation, "mine", false);
    Reflect.set(nation, "name", OTHER_NATION);
  }
}

function asOpenTerms(data: unknown): void {
  const terms = field(data, "terms");
  if (!mock.on || typeof terms !== "object" || terms === null) return;
  Reflect.set(terms, "blocked", null);
  Reflect.set(terms, "restUntilMs", null);
  const target = field(terms, "target");
  if (typeof target === "object" && target !== null) Reflect.set(target, "name", OTHER_NATION);
}

/** 응답 고치기를 건다(시험마다 한 번 — mock.on이 켜졌을 때만 고친다) */
async function installMocks(page: Page): Promise<void> {
  await rewriteTrpc(page, {
    "summary.get": hideSummary,
    "world.government": asOtherNation,
    "world.naturalization": asOpenTerms,
  });
}

/** 내 사이보그 2차맵의 행정 건물을 화면 가운데에 두고 눌러 정부 대화상자를 연다(정부 판은 건물을 누를 때 받는다) */
async function openDialog(page: Page): Promise<{ id: number; data: unknown }> {
  const mapKey = await openMap(page);
  const hall = await findHall(page, mapKey);
  const cell = field(hall.data, "building");
  await openMap(page, `/map?key=${mapKey}&at=${String(field(cell, "x"))},${String(field(cell, "y"))}`);
  await tapBuilding(page, hall.id);
  await expect(page.locator(`.gov-sheet[data-building="${hall.id}"]`)).toBeVisible({ timeout: 15_000 });
  await page.locator(".gov-open").click();
  await expect(page.locator("dialog.gov-dialog[open]")).toBeVisible();
  return hall;
}

test.describe("귀화 칸: 플레이어", () => {
  test.use({ account: "player" });

  test("내 나라 정부에는 귀화 칸이 없고, 남의 나라 정부의 [귀화 신청] → 확정은 서버 판정 문구를 보인다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    mock.on = false;
    await installMocks(page);
    const hall = await openDialog(page);
    const dialog = page.locator("dialog.gov-dialog[open]");
    await expect(dialog.locator('[data-part="recruit-card"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(dialog.locator('[data-part="government-naturalize"]')).toHaveCount(0);
    // 실제 조건(고치지 않음): 내 나라 정부 = 같은 나라, 귀화 값은 설정 칸 출발값
    const real = field(await trpcData(page, "world.naturalization", { buildingId: hall.id }), "terms");
    expect(field(real, "blocked")).toBe("same_nation");
    expect(field(real, "fee")).toBe("100");

    // 남의 나라 정부처럼 고친 응답으로 다시 연다(지도를 다시 열어 건물을 다시 누른다 — 정부 판을 새로 받는다)
    mock.on = true;
    await openDialog(page);
    const opened = page.locator("dialog.gov-dialog[open]");
    const panel = opened.locator('[data-part="government-naturalize"]');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel.locator('[data-part="naturalize-target"] dd')).toHaveText(OTHER_NATION.ko);
    await expect(panel.locator('[data-part="naturalize-fee"] dd')).toHaveText("100");
    await expect(panel.locator('[data-part="naturalize-reason"]')).toHaveCount(0);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // [귀화 신청] → 확인 줄 → [귀화 확정]: 서버는 실제로 내 나라 정부라 same_nation
    await panel.getByRole("button", { name: message("ko", "naturalize_apply"), exact: true }).click();
    const confirm = panel.locator('[data-part="naturalize-confirm"]');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(OTHER_NATION.ko);
    await confirm
      .getByRole("button", { name: message("ko", "naturalize_confirm_button"), exact: true })
      .click();
    await expect(panel.locator(".message-error")).toContainText(message("ko", "naturalize_block_same"), {
      timeout: 20_000,
    });
    expect(deviceErrors).toEqual([]);
  });
});

const SHOTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "dark", language: "ko" },
  { theme: "pastel", language: "en" },
];

test.describe("귀화 칸 사진", () => {
  test.use({ account: "player" });

  for (const { theme, language } of SHOTS) {
    test.describe(`390 ${theme} ${language}`, () => {
      test.use({ ...VIEWPORTS.phone, theme, language });

      test(`귀화 칸·확인 줄 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
        test.setTimeout(240_000);
        mock.on = true;
        await installMocks(page);
        await openDialog(page);
        const panel = page.locator('dialog.gov-dialog[open] [data-part="government-naturalize"]');
        await expect(panel.locator('[data-part="naturalize-total"] dd')).not.toHaveText("", {
          timeout: 20_000,
        });
        await panel.scrollIntoViewIfNeeded();
        expect(await horizontalOverflow(page)).toEqual([]);
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `naturalize-panel-390-${theme}-${language}`);
        await panel.getByRole("button", { name: message(language, "naturalize_apply"), exact: true }).click();
        await expect(panel.locator('[data-part="naturalize-confirm"]')).toBeVisible();
        await panel.locator('[data-part="naturalize-confirm"]').scrollIntoViewIfNeeded();
        expect(await smallTapTargets(page)).toEqual([]);
        await shot(page, `naturalize-confirm-390-${theme}-${language}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
