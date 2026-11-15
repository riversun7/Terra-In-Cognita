// 2차맵 가시거리 화면 시험 — 사용자 지적 2026-11-09 "주변시야가 왜 확대하면 더 안보이냐 오히려 축소하면 더 보이고 fps충분하면 가시거리 늘려라"
// (docs/adr/2026-10-28-s1-second-map.md "바뀜 (2026-11-09)").
// - 가까이(5/6 — 962 나 전의 가장 가까이쯤): 그린 기울기가 45°보다 낮고(가까이 눕힘) 화면 위 끝 땅이 화면 가운데 땅에서 200m 넘게 앞이다(전에는 약 120m).
//   가시거리 단계 표지(data-view-level·data-view-reach)가 붙는다.
// - 측정(E2E_MEASURE=1, 작업 기록용): 5/6·3/6에서 화면 가운데 → 위 끝 땅 거리, 소품 모델 수, 가시거리 단계, 끄는 동안 fps·엔진 p95, 사진.
//   헤드리스 Chromium(SwiftShader) 값이라 휴대폰 값이 아니다.
import { closeOperatorMenu, setOperatorMode } from "./helpers/mapHud.ts";
import type { Locator, Page } from "@playwright/test";
import { type CameraState, groundUnder } from "../packages/engine/src/camera/cameraMath.ts";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

const DEG = 180 / Math.PI;

/** 2차맵을 열고(낮밤 끔) 운영자 보기를 켠 뒤 확대 단계 stage로 간다 */
async function openAt(page: Page, stage: number): Promise<Locator> {
  await page.goto("/map?second-map-sky=off");
  const screen = page.locator(".map-screen");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await setOperatorMode(page, true);
  await closeOperatorMenu(page);
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  await goStage(page, stage);
  return screen;
}

/** 확대 단계를 [+]·[−]로 맞춘다 */
async function goStage(page: Page, stage: number): Promise<void> {
  const ladder = page.locator(".zoom-ladder");
  await expect(ladder).toHaveAttribute("data-stage", /^[1-6]$/, { timeout: 15_000 });
  for (let k = 0; k < 8; k++) {
    const now = Number(await ladder.getAttribute("data-stage"));
    if (now === stage) break;
    await ladder.locator(now < stage ? ".zoom-ladder-in" : ".zoom-ladder-out").click();
    await page.waitForTimeout(700);
  }
  await expect(ladder).toHaveAttribute("data-stage", String(stage));
  // 미끄러짐·1초 요약·소품 다시 세우기를 기다린다
  await page.waitForTimeout(1_500);
}

/** 1초 요약의 카메라와 캔버스 크기로 화면 위 끝 가운데 땅이 화면 가운데 땅에서 얼마나 앞인지(m, 목표점 높이 평면) */
async function view(
  page: Page,
  screen: Locator,
): Promise<{ pitchDeg: number; aheadM: number; cornerM: number }> {
  const [targetX = 0, targetZ = 0, yaw = 0, pitch = 0, distance = 0] = (
    (await screen.getAttribute("data-camera")) ?? ""
  )
    .split(",")
    .map(Number);
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const viewport = { width: box.width, height: box.height };
  const state: CameraState = { targetX, targetY: 0, targetZ, yaw, pitch, distance };
  const top = groundUnder(state, viewport, { x: viewport.width / 2, y: 0 });
  const corner = groundUnder(state, viewport, { x: 0, y: 0 });
  if (!top || !corner) throw new Error("화면 위 끝이 땅에 닿지 않습니다(지평선)");
  return {
    pitchDeg: pitch * DEG,
    aheadM: Math.hypot(top.x - targetX, top.z - targetZ),
    cornerM: Math.hypot(corner.x - targetX, corner.z - targetZ),
  };
}

test.describe("dev", () => {
  test.use({ account: "dev" });

  test("가까이(5/6)에서 더 눕혀 화면 위 끝까지 200m 넘게 보이고, 가시거리 단계 표지가 붙는다", async ({
    page,
    deviceErrors,
  }) => {
    const screen = await openAt(page, 5);
    const near = await view(page, screen);
    expect(near.pitchDeg).toBeLessThan(40);
    expect(near.pitchDeg).toBeGreaterThan(27.9);
    expect(near.aheadM).toBeGreaterThan(200);
    await expect(screen).toHaveAttribute("data-view-level", /^[0-4]$/);
    expect(Number(await screen.getAttribute("data-view-reach"))).toBeGreaterThanOrEqual(120);
    // 멀리(3/6)는 기본 기울기 45°로 돌아간다
    await goStage(page, 3);
    expect((await view(page, screen)).pitchDeg).toBeCloseTo(45, 0);
    expect(deviceErrors).toEqual([]);
  });

  test("측정: 5/6·3/6 위 끝 거리·소품·가시거리·끄는 동안 fps(E2E_MEASURE=1)", async ({ page }) => {
    test.skip(process.env.E2E_MEASURE !== "1", "E2E_MEASURE=1일 때만 돈다");
    test.setTimeout(240_000);
    const tag = process.env.E2E_VIEWDIST_TAG ?? "after";
    const screen = await openAt(page, 5);
    const rows: Record<string, unknown>[] = [];
    for (const stage of [5, 3]) {
      await goStage(page, stage);
      const geometry = await view(page, screen);
      await shot(page, `viewdist-${tag}-${stage}6`);
      // 좌우로 끄는 6초(끌기는 따라가는 중이면 돌리기) 동안 그린 프레임 수와 엔진 p95
      const box = await page.locator(".map-view canvas").boundingBox();
      if (!box) throw new Error("no canvas");
      const y = box.y + box.height * 0.55;
      const framesBefore = Number(await screen.getAttribute("data-frames"));
      const p95: number[] = [];
      const started = Date.now();
      let lastRead = started;
      let flip = false;
      await page.mouse.move(box.x + box.width * 0.45, y);
      await page.mouse.down();
      while (Date.now() - started < 6_000) {
        flip = !flip;
        await page.mouse.move(box.x + box.width * (flip ? 0.55 : 0.45), y, { steps: 8 });
        if (Date.now() - lastRead >= 1_000) {
          p95.push(Number(await screen.getAttribute("data-engine-p95")));
          lastRead = Date.now();
        }
      }
      await page.mouse.up();
      const seconds = (Date.now() - started) / 1_000;
      await page.waitForTimeout(1_100);
      const sorted = p95.toSorted((a, b) => a - b);
      rows.push({
        tag,
        stage,
        pitchDeg: Number(geometry.pitchDeg.toFixed(1)),
        topAheadM: Math.round(geometry.aheadM),
        topCornerM: Math.round(geometry.cornerM),
        props: Number(await screen.getAttribute("data-props")),
        viewLevel: await screen.getAttribute("data-view-level"),
        viewReachM: await screen.getAttribute("data-view-reach"),
        framesPerSecond: Math.round(
          (Number(await screen.getAttribute("data-frames")) - framesBefore) / seconds,
        ),
        engineP95MedianMs: sorted[Math.floor(sorted.length / 2)] ?? null,
      });
    }
    console.log(`[measure] ${JSON.stringify(rows)}`);
  });
});
