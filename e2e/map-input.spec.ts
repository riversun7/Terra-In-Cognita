// 2차맵 지도 조작 화면 시험 — 사용자 지적 2026-11-08 "맵조작시 오브젝트가 걸려 드래그가 안되고 계속 오브트가 잘못눌린다", "화면은 선택된 유닛으로
// 고정되어야함", "화면 축소확대배율 표시 없음"(docs/adr/2026-11-08-map-input.md).
// - 채집 표시 위에서 시작한 끌기: 카메라가 움직이고 아무것도 고르지 않고 판도 열리지 않는다. 표시를 짧게 누르면 그 표시의 판이 열린다.
// - 따라가기: 목록에서 내 사이보그를 고르면 카메라가 따라가고(data-follow="on"), 보내면 가는 동안 카메라 목표가 사이보그 자리를 따라간다
//   (1초 요약의 같은 순간: 카메라 목표(m) ÷ 사이보그 자리(배치 칸) = 칸 크기가 x·z 같고 시간이 지나도 같다). 끌면 끊기고(lost) [따라가기]로 다시.
// - 확대 단계: 사다리 "2차맵 n/5"(data-stage), [−]·[+]가 한 단계씩, 가장 가까이에서 [+]는 그대로.
// - 사진: 사다리·[따라가기] 390 × 파스텔·다크.
// 바뀜(docs/adr/2026-11-08-seamless-second-map.md WP-1·2): 늘 유닛 하나가 골라져 있고(들어오면 내 사이보그) 카메라가 그 유닛을 따라간다. 끌기는
// 따라가기를 끊지 않고 카메라를 돌린다(목표점은 그대로, 방위가 바뀐다). [따라가기]·[선택 해제]는 없다. 채집 표시는 근처 판 자원 탭일 때만 보인다.
// 사진은 사다리·근처 판 자원 탭.
import type { Locator, Page } from "@playwright/test";
import { groundOffsets } from "./helpers/mapGround.ts";
import { message } from "./helpers/messages.ts";
import { collapseNearby, openNearby, pickMyUnit } from "./helpers/nearby.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

const READY_MARKER = '.gather-marker[data-state="ready"]:not([hidden])';

/** 2차맵을 열고 자료·지형이 서기를 기다린다(카메라 맞추기·1초 요약까지) */
async function openMap(page: Page): Promise<Locator> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map");
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await page.waitForTimeout(1_200);
  return map;
}

/** 지도 캔버스 상자 */
async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  return box;
}

/** 카메라 목표(m)·방위(rad) — 1초 요약 */
async function cameraTarget(map: Locator): Promise<{ x: number; z: number; yaw: number }> {
  const [x = 0, z = 0, yaw = 0] = ((await map.getAttribute("data-camera")) ?? "").split(",").map(Number);
  return { x, z, yaw };
}

/**
 * 판에 가리지 않은(표시 가운데 아래가 지도 캔버스인) 채집할 수 있는 오브젝트 표시 하나: 화면 가운데(카메라를 맞춘 내 사이보그)에서 70px 넘게
 * 떨어진 것. 없으면 null
 */
async function freeMarker(page: Page): Promise<{ x: number; y: number; id: string } | null> {
  const found = await page.locator(READY_MARKER).evaluateAll((elements) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (Math.hypot(x - cx, y - cy) < 70) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit instanceof HTMLCanvasElement && hit.closest(".map-view"))
        return { x, y, id: element.getAttribute("data-object") ?? "" };
    }
    return null;
  });
  return found;
}

/** 표시가 화면에 설 때까지 기다리고, 가리지 않은 것이 없으면 휠로 조금씩 멀리 본다(헤드리스 휠 이벤트는 합쳐지므로 단계마다 띄운다) */
async function findMarker(page: Page): Promise<{ x: number; y: number; id: string }> {
  await expect(page.locator(READY_MARKER).first()).toBeVisible({ timeout: 30_000 });
  const box = await canvasBox(page);
  for (let step = 0; step < 6; step++) {
    const found = await freeMarker(page);
    if (found) return found;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(500);
  }
  throw new Error("가리지 않은 채집 표시가 없습니다");
}

/** 카메라 목표(m) ÷ 고른 유닛 자리(배치 칸): x·z 몫(칸 크기). 같은 1초 요약에서 읽는다 */
async function followRatio(map: Locator): Promise<{ qx: number; qz: number; at: string }> {
  const camera = await cameraTarget(map);
  const at = (await map.getAttribute("data-selected-at")) ?? "";
  const [ux = 1, uy = 1] = at.split(",").map(Number);
  return { qx: camera.x / ux, qz: camera.z / uy, at };
}

/** 카메라 목표가 고른 유닛 자리에 있다(x·z 몫이 1% 안에서 같다) */
const centred = (ratio: { qx: number; qz: number }): boolean =>
  Number.isFinite(ratio.qx) && Math.abs(ratio.qx - ratio.qz) / ratio.qx < 0.01;

/** 지도 캔버스 가운데(카메라 목표점)에서 (dx, dy) CSS px 떨어진 곳을 누른다 */
async function tapMap(page: Page, dx: number, dy: number): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
}

/** 지도 가운데 띠에서 왼쪽으로 한 번 끈다 */
async function dragMap(page: Page): Promise<void> {
  const box = await canvasBox(page);
  const y = box.y + box.height * 0.45;
  await page.mouse.move(box.x + box.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y + 10, { steps: 8 });
  await page.mouse.up();
}

/** 근처 판 유닛 탭에서 내 사이보그를 고른다 */
async function pickCyborg(page: Page, map: Locator): Promise<string> {
  const cyborg = (await map.getAttribute("data-cyborg")) ?? "";
  expect(cyborg).toMatch(/^\d+$/);
  await pickMyUnit(page, cyborg);
  await expect(map).toHaveAttribute("data-selected", cyborg);
  return cyborg;
}

/** 근처 판 자원 탭을 열고 목록을 접는다(지도에 자원 표시가 보이고 목록이 지도를 가리지 않게) */
async function showResourceMarkers(page: Page): Promise<void> {
  await openNearby(page, "resources");
  await collapseNearby(page);
}

test.describe("지도 조작: 플레이어", () => {
  test.use({ account: "player" });

  test("채집 표시는 자원 탭일 때만, 표시 위에서 시작한 끌기는 카메라를 돌리고 고르기는 그대로, 짧게 누르면 그 표시의 판", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    const map = await openMap(page);
    const panel = page.locator(".gather-panel");
    // 판이 닫혀 있으면 표시가 없다. 들어오면 내 사이보그가 골라져 있다
    const cyborg = (await map.getAttribute("data-cyborg")) ?? "";
    await expect(map).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
    await expect(page.locator(READY_MARKER)).toHaveCount(0);
    await showResourceMarkers(page);
    const marker = await findMarker(page);
    await page.waitForTimeout(1_100);
    const before = await cameraTarget(map);
    const box = await canvasBox(page);
    // 표시 위에서 누르고 화면 가운데 쪽으로 120px 끈다
    const dx = marker.x > box.x + box.width / 2 ? -120 : 120;
    await page.mouse.move(marker.x, marker.y);
    await page.mouse.down();
    await page.mouse.move(marker.x + dx, marker.y + 15, { steps: 10 });
    await page.mouse.up();
    // 돌리기: 방위가 바뀌고 목표점(내 사이보그)은 그대로
    await expect
      .poll(async () => Math.abs((await cameraTarget(map)).yaw - before.yaw), { timeout: 5_000 })
      .toBeGreaterThan(0.05);
    const turned = await cameraTarget(map);
    expect(Math.hypot(turned.x - before.x, turned.z - before.z)).toBeLessThan(2);
    await expect(map).toHaveAttribute("data-selected", cyborg);
    await expect(map).toHaveAttribute("data-follow", "on");
    await expect(panel).toHaveAttribute("data-sheet", "none");

    // 짧게 누르면(움직인 뒤 다시 찾은 표시) 그 오브젝트의 판이 열린다
    const again = await findMarker(page);
    await page.mouse.click(again.x, again.y);
    await expect(panel).toHaveAttribute("data-sheet", "object");
    await expect(page.locator(".gather-sheet[data-object]")).toHaveAttribute("data-object", again.id);
    await expect(map).toHaveAttribute("data-selected", cyborg);
    expect(deviceErrors).toEqual([]);
  });

  test("고른 내 사이보그를 카메라가 따라가고(data-follow), 끌어도 끊기지 않고 돌기만 한다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(150_000);
    const map = await openMap(page);
    const cyborg = await pickCyborg(page, map);
    await expect(map).toHaveAttribute("data-follow", "on");
    await expect.poll(async () => centred(await followRatio(map)), { timeout: 10_000 }).toBe(true);

    // 보낸다: 갈 수 있는 곳이 나올 때까지 카메라 목표점(= 내 사이보그) 둘레의 빈 땅(표시·건물을 피한 곳)을 눌러 본다
    let sent = false;
    for (const { dx, dy } of (await groundOffsets(page)).slice(0, 8)) {
      await tapMap(page, dx, dy);
      await page.waitForTimeout(300);
      await expect(map).not.toHaveAttribute("data-command", "sent", { timeout: 20_000 });
      if ((await map.getAttribute("data-command")) === "ok") {
        sent = true;
        break;
      }
    }
    expect(sent).toBe(true);
    // 가는 동안: 카메라 목표가 사이보그 자리에 있고, 사이보그가 움직여도 몫(칸 크기)이 그대로다
    await expect(map).toHaveAttribute("data-follow", "on");
    const first = await followRatio(map);
    await expect
      .poll(
        async () => {
          const now = await followRatio(map);
          return now.at !== first.at && centred(now) && Math.abs(now.qx - first.qx) / first.qx < 0.01;
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    // 끌어도 따라가기는 그대로(돌리기), [따라가기]·[선택 해제]는 없다
    const yawBefore = (await cameraTarget(map)).yaw;
    await dragMap(page);
    await expect(map).toHaveAttribute("data-follow", "on");
    await expect
      .poll(async () => Math.abs((await cameraTarget(map)).yaw - yawBefore), { timeout: 5_000 })
      .toBeGreaterThan(0.05);
    await expect.poll(async () => centred(await followRatio(map)), { timeout: 10_000 }).toBe(true);
    await expect(page.locator(".map-unit-follow")).toHaveCount(0);
    await expect(page.locator(".map-back-anchor")).toHaveCount(0);

    // 세운다(다른 시험이 쓰는 내 사이보그를 그 자리에)
    const stop = page.locator(".map-unit-stop");
    if (await stop.count()) await stop.click();
    await expect(map).toHaveAttribute("data-selected", cyborg);
    expect(cyborg).not.toBe("");
    expect(deviceErrors).toEqual([]);
  });

  test("확대 사다리: 2차맵 n/5, [−]·[+]가 한 단계씩, 가장 가까이에서 [+]는 그대로", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    await openMap(page);
    const ladder = page.locator(".zoom-ladder");
    await expect(ladder).toHaveAttribute("data-rung", "local");
    await expect(ladder).toHaveAttribute("data-stage", /^[1-5]$/);
    await expect(ladder.locator(".zoom-ladder-caption")).toHaveText(message("ko", "zoom_caption_local"));
    await expect(ladder.locator(".zoom-ladder-dots .zoom-ladder-dot")).toHaveCount(5);
    // 카메라 범위(내 유닛 둘레)가 걸리면 가장 멀리가 바뀐다: 한 번 더 기다린 뒤 잰다
    await page.waitForTimeout(1_500);
    const start = Number(await ladder.getAttribute("data-stage"));
    const out = ladder.locator(".zoom-ladder-out");
    const zoomIn = ladder.locator(".zoom-ladder-in");
    if (start > 1) {
      await out.click();
      await expect(ladder).toHaveAttribute("data-stage", String(start - 1));
      await zoomIn.click();
      await expect(ladder).toHaveAttribute("data-stage", String(start));
    }
    for (let i = 0; i < 6; i++) {
      await zoomIn.click();
      await page.waitForTimeout(150);
    }
    await expect(ladder).toHaveAttribute("data-stage", "5");
    await expect(ladder.locator(".zoom-ladder-value")).toHaveText(
      message("ko", "zoom_value_stage", { stage: 5 }),
    );
    await expect(page).toHaveURL((url) => url.pathname === "/map");
    // [−] 두 번 = 3단계
    await out.click();
    await page.waitForTimeout(150);
    await out.click();
    await expect(ladder).toHaveAttribute("data-stage", "3");
    await expect(ladder.locator(".zoom-ladder-dot[data-on]")).toHaveCount(3);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("지도 조작 사진", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    for (const language of ["ko", "en"] as const) {
      test.describe(`390 ${theme} ${language}`, () => {
        test.use({ theme, language });

        test(`사다리·근처 판 자원 탭 (390·${theme}·${language})`, async ({ page, deviceErrors }) => {
          test.setTimeout(120_000);
          const map = await openMap(page);
          await pickCyborg(page, map);
          await expect(map).toHaveAttribute("data-follow", "on");
          await openNearby(page, "resources");
          await expect(page.locator(".map-nearby-tab[aria-pressed=true]")).toContainText(
            message(language, "nearby_tab_resources"),
          );
          await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", /^[1-5]$/);
          await page.waitForTimeout(1_200);
          expect(await horizontalOverflow(page)).toEqual([]);
          expect(await smallTapTargets(page)).toEqual([]);
          await shot(page, `map-input-nearby-390-${theme}-${language}`);
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  }
});
