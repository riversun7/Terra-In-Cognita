// 2차맵 원자재 오브젝트 채집·건물 들어가기 화면 시험(docs/adr/2026-11-07-gather-objects.md, 사용자 지적 2026-11-07 문제 2·3).
// 플레이어(가짜 계정)가 내 사이보그 2차맵을 열면 오브젝트 표시가 보이고, 누르면 아래 판(채집·정보·닫기), [채집]이면 내 사이보그가 오브젝트로 걸어가는
// 채집 줄이 뜨고 [멈추기]로 멈춘다. 건물 표시를 누르면 건물 판(들어가기·안에 있는 유닛). 사진은 390 파스텔·다크(ko·en).
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const READY_MARKER = '.gather-marker[data-state="ready"]:not([hidden])';
const BUILDING_MARKER = ".gather-building-marker:not([hidden])";
/** [선택 해제](한국어·영어) */
const DESELECT = new RegExp(`^(${message("ko", "map_deselect")}|${message("en", "map_deselect")})$`);

/** tRPC 조회 하나(로그인한 이 화면의 쿠키로)의 data */
async function trpcData(page: Page, procedure: string): Promise<unknown> {
  return page.evaluate(async (name) => {
    const response: unknown = await fetch(`/api/trpc/${name}`).then((reply) => reply.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, key: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
    return pick(pick(response, "result"), "data");
  }, procedure);
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 내 채집 줄(서버) 단계·끝난 까닭 */
async function myLoop(page: Page): Promise<{ phase: unknown; stop: unknown } | null> {
  const loops = field(await trpcData(page, "gather.loops"), "loops");
  if (!Array.isArray(loops) || loops.length === 0) return null;
  const first: unknown = loops[0];
  return { phase: field(first, "phase"), stop: field(first, "stop") };
}

/** 내 사이보그 2차맵을 열고 오브젝트 자료·표시가 설 때까지 */
async function openMap(page: Page): Promise<void> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect
    .poll(async () => Number(await page.locator(".gather-panel").getAttribute("data-objects")), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  await expect(page.locator(READY_MARKER).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * 위·아래 판(HUD)에 가리지 않은 표시를 누른다(표시는 화면 가운데에 가까운 차례로 놓인다).
 * 표시는 누르기를 지도로 지나보내므로(사용자 지적 2026-11-08, docs/adr/2026-11-08-map-input.md) 표시 가운데 아래가 지도 캔버스인 것을 고르고
 * 그 자리를 짧게 누른다 — 엔진이 누르기로 판정해 유닛 → 표시(화면 거리) 차례로 고른다. 화면 가운데(카메라를 맞춘 내 사이보그)에서 먼 표시를
 * 먼저 누르고, 유닛이 먼저 골라졌으면 풀고 다시 잰 뒤 다음 표시를 누른다. 판이 열리지 않으면 false
 */
async function clickFreeMarker(page: Page, selector: string): Promise<boolean> {
  const panel = page.locator(".gather-panel");
  for (let attempt = 0; attempt < 4; attempt++) {
    const points = await page.locator(selector).evaluateAll((elements) =>
      elements.flatMap((element) => {
        const box = element.getBoundingClientRect();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        const near = Math.hypot(x - window.innerWidth / 2, y - window.innerHeight / 2) < 70;
        return hit instanceof HTMLCanvasElement && hit.closest(".map-view") ? [{ x, y, near }] : [];
      }),
    );
    const point = points.toSorted((a, b) => Number(a.near) - Number(b.near))[attempt];
    if (!point) return false;
    await page.mouse.click(point.x, point.y);
    try {
      await expect(panel).not.toHaveAttribute("data-sheet", "none", { timeout: 1_500 });
      return true;
    } catch {
      // 유닛을 골랐으면(따라가기로 카메라가 움직일 수 있다) 풀고 다시 잰다
      if (await page.locator(".map-screen[data-selected]").count()) {
        await page.locator(".map-actions button", { hasText: DESELECT }).click();
        await page.waitForTimeout(300);
      }
    }
  }
  return false;
}

/** 지도를 아래로 조금 끈다(위 판 밑에 깔린 표시를 끌어내린다 — 표시 위에서 시작해도 끌린다) */
async function nudgeMapDown(page: Page): Promise<void> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

/** 가리지 않은 건물 표시를 누른다. 판에 가렸으면 지도를 조금씩 끌어내리며 다시 */
async function clickBuildingMarker(page: Page, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await clickFreeMarker(page, BUILDING_MARKER)) return true;
    await nudgeMapDown(page);
  }
  return false;
}

/**
 * 화면 가운데에 가장 가까운(판에 가리지 않은) 채집할 수 있는 오브젝트 판을 연다. 둘레(시작 도시 초지)에 오브젝트가 드물어 판에 가린 것뿐이면
 * 휠로 조금씩 멀리 본다(헤드리스 휠 이벤트는 합쳐지므로 단계마다 띄운다)
 */
async function openObjectSheet(page: Page): Promise<void> {
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  let opened = false;
  for (let step = 0; step < 8 && !opened; step++) {
    opened = await clickFreeMarker(page, READY_MARKER);
    if (opened) break;
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
  }
  expect(opened).toBe(true);
  await expect(page.locator(".gather-sheet[data-object]")).toBeVisible();
}

test.describe("원자재 오브젝트 채집·건물 들어가기: 플레이어", () => {
  test.use({ account: "player" });

  test("오브젝트 표시 → 판([정보]) → [채집] → 채집 줄 → [멈추기], 건물 표시 → 건물 판", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(240_000);
    await openMap(page);
    await openObjectSheet(page);
    const sheet = page.locator(".gather-sheet[data-object]");
    await expect(sheet).toHaveAttribute("data-state", "ready");
    await sheet.locator(".gather-sheet-info").click();
    await expect(sheet.locator(".gather-details")).toBeVisible();
    await sheet.locator(".gather-sheet-gather").click();
    // 보낸 뒤: 판이 닫히고 채집 줄(내 사이보그가 오브젝트로 가는 중·캐는 중)
    await expect(page.locator(".gather-panel")).toHaveAttribute("data-sheet", "none");
    const loop = page.locator(".gather-loop");
    await expect(loop).toHaveAttribute("data-phase", /^(to_object|gathering|to_deposit)$/, {
      timeout: 20_000,
    });
    const server = await myLoop(page);
    expect(server?.stop ?? null).toBeNull();
    expect(["to_object", "gathering", "to_deposit"]).toContain(server?.phase);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);

    // [멈추기]: 그 자리에 서고 줄이 "멈췄습니다"로 끝난다
    await loop.locator(".gather-stop").click();
    await expect(loop).toHaveAttribute("data-stop", "stopped", { timeout: 15_000 });
    expect(await myLoop(page)).toEqual({ phase: "done", stop: "stopped" });

    // 건물 표시(시작 도시의 시설) → 건물 판: 들어가면 하는 일·안에 있는 유닛·[들어가기]
    await expect(page.locator(BUILDING_MARKER).first()).toBeVisible({ timeout: 15_000 });
    expect(await clickBuildingMarker(page, 6)).toBe(true);
    const buildingSheet = page.locator(".gather-sheet[data-building]");
    await expect(buildingSheet).toBeVisible();
    await expect(buildingSheet.locator(".gather-inside-title")).toBeVisible({ timeout: 10_000 });
    await expect(buildingSheet.locator(".gather-sheet-enter")).toBeEnabled();
    await buildingSheet.locator(".gather-sheet-close").click();
    await expect(page.locator(".gather-panel")).toHaveAttribute("data-sheet", "none");
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("채집 사진", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`390 ${theme} ${language}`, () => {
        test.use({ ...VIEWPORTS.phone, theme, language });

        test(`오브젝트 판·채집 줄 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
          test.setTimeout(240_000);
          await openMap(page);
          await openObjectSheet(page);
          await page.locator(".gather-sheet-info").click();
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `gather-object-390-${theme}-${language}`);
          await page.locator(".gather-sheet-gather").click();
          const loop = page.locator(".gather-loop");
          await expect(loop).toHaveAttribute("data-phase", /^(to_object|gathering|to_deposit)$/, {
            timeout: 20_000,
          });
          expect(await horizontalOverflow(page)).toEqual([]);
          await shot(page, `gather-loop-390-${theme}-${language}`);
          await loop.locator(".gather-stop").click();
          await expect(loop).toHaveAttribute("data-stop", "stopped", { timeout: 15_000 });
          if (await clickBuildingMarker(page, 2)) {
            await expect(page.locator(".gather-sheet[data-building] .gather-inside-title")).toBeVisible({
              timeout: 10_000,
            });
            await shot(page, `gather-building-390-${theme}-${language}`);
          }
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
});
