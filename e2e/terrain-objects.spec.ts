// 지형별 2차맵 오브젝트 화면 시험 — 기획 D-536("각각의 지형에는 최소 5가지 이상의 2차맵 오브젝트"), ADR 2026-11-07-gather-objects "바뀜 (2026-11-12)".
// - 2차맵 시험(dev, /dev/second-map): 바닷가(시험 자리 coast)·사막·빙상 2차맵(키 = bench:terrain-objects가 고른 S2 시험 행성 F9 첫 2차맵)을
//   가까이 본 뒤 소품 수·그리기 호출·엔진 p95를 찍고([measure], 헤드리스 SwiftShader라 휴대폰 값 아님) 사진을 남긴다. 개발 화면 층 테마
//   둘(네온 다크·라이트). 세계 색은 화면 테마와 상관없다(D-070) — 파스텔·다크 게임 테마는 지도 틀만 바뀐다.
// - 지형 오브젝트 편집기(dev, /dev/terrain-objects): 지형 칩 14개가 모두 5종 이상이고, 양을 고치면 바뀐 항목이 1개가 된다.
//   사막의 모래언덕은 느려짐 줄(느림 배율 1500‰, 기획 D-540 질문 1223 나)이고 배율을 비우면 장식 줄이 된다(테마 둘 사진).
// - 지도 6/6(E2E_MEASURE=1): 가장 가까이에서 끄는 6초 동안 프레임 수·엔진 p95.
import type { Page } from "@playwright/test";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";

const body = (page: Page) => page.locator(".sml-body");

/** S2 시험 행성 F9의 사막·빙상 2차맵 키(pnpm --filter @terra/server bench:terrain-objects 첫 2차맵) */
const DESERT_KEY = "350735619325961";
const ICE_KEY = "3272080032268297";

/** 지도 가운데에서 휠로 확대해 화면 짧은 변이 spanM 아래가 될 때까지(휠 단계가 합쳐지지 않게 띄운다) */
async function zoomInTo(page: Page, spanM: number): Promise<void> {
  const view = page.locator(".sml-view canvas");
  const box = await view.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 40; step++) {
    const span = Number(await body(page).getAttribute("data-view-span"));
    if (span > 0 && span <= spanM) return;
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(150);
  }
}

async function openLab(page: Page, place: "coast" | "desert" | "ice"): Promise<void> {
  await page.goto("/dev/second-map?second-map-sky=off");
  await expect(body(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  if (place === "coast") {
    await page.locator('.sml-preset[data-preset="coast"]').click();
  } else {
    await page.locator('[data-input="key"]').fill(place === "desert" ? DESERT_KEY : ICE_KEY);
    await page.locator(".sml-open-key").click();
    await expect(body(page)).toHaveAttribute("data-map-key", place === "desert" ? DESERT_KEY : ICE_KEY, {
      timeout: 60_000,
    });
  }
  await expect(body(page)).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(body(page)).toHaveAttribute("data-props", /\d+/, { timeout: 30_000 });
}

test.describe("지형별 오브젝트: 2차맵 시험", () => {
  test.use({ account: "dev" });

  for (const devTheme of ["neon", "light"] as const) {
    test.describe(devTheme, () => {
      test.use({ devTheme, language: "ko" });

      for (const place of ["coast", "desert", "ice"] as const) {
        test(`${place}: 가까이 소품과 사진 (${devTheme})`, async ({ page, deviceErrors }) => {
          test.setTimeout(180_000);
          await openLab(page, place);
          await zoomInTo(page, 120);
          await expect
            .poll(async () => Number(await body(page).getAttribute("data-props")), { timeout: 20_000 })
            .toBeGreaterThan(0);
          await page.waitForTimeout(2_500);
          const read = async (name: string) => Number(await body(page).getAttribute(name));
          console.log(
            `[measure] lab ${place} ${devTheme} props ${await read("data-props")} clutter ${await read("data-clutter")} draw ${await read("data-draw-calls")} tris ${await read("data-triangles")} p95 ${await read("data-render-p95")} span ${await read("data-view-span")}`,
          );
          await shot(page, `terrain-objects-${place}-390-${devTheme}`);
          expect(deviceErrors).toEqual([]);
        });
      }
    });
  }
});

test.describe("지형 오브젝트 편집기", () => {
  test.use({ account: "dev" });

  test("지형 칩 14개가 모두 5종 이상이고, 양을 고치면 바뀐 항목이 생긴다", async ({ page, deviceErrors }) => {
    await page.goto("/dev/terrain-objects");
    const screen = page.locator(".to-screen");
    await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
    await expect(page.locator(".to-biome")).toHaveCount(14);
    await expect(page.locator('.to-biome[data-low=""]')).toHaveCount(0);
    await page.locator('.to-biome[data-biome="ocean_deep"]').click();
    await expect(screen).toHaveAttribute("data-biome", "ocean_deep");
    const whale = page.locator('tr[data-row="whale_pod"] input');
    await whale.fill("3");
    await expect(screen).toHaveAttribute("data-changes", "1");
    await page.locator(".to-pending .button-small").first().click();
    await expect(screen).toHaveAttribute("data-changes", "0");
    expect(deviceErrors).toEqual([]);
  });

  for (const devTheme of ["neon", "light"] as const) {
    test.describe(devTheme, () => {
      test.use({ devTheme, language: "ko" });
      test(`사막 모래언덕 느림 배율을 고치고 비운다 (${devTheme})`, async ({ page, deviceErrors }) => {
        await page.goto("/dev/terrain-objects");
        const screen = page.locator(".to-screen");
        await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
        await page.locator('.to-biome[data-biome="desert"]').click();
        const dune = page.locator('tr[data-row="sand_dune"]');
        await expect(dune).toHaveAttribute("data-kind", "slow");
        const slow = dune.locator("td").nth(2).locator("input");
        await expect(slow).toHaveValue("1500");
        await slow.fill("2000");
        await expect(screen).toHaveAttribute("data-changes", "1");
        await shot(page, `terrain-objects-slow-390-${devTheme}`);
        await slow.fill("");
        await expect(dune).toHaveAttribute("data-kind", "decor");
        // 차폐 소품(사막에는 없을 수 있다)·채집 자리는 칸이 없다
        await expect(page.locator('tr[data-kind="site"] td:nth-child(4) input')).toHaveCount(0);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

test.describe("지도 6/6 측정", () => {
  test.use({ account: "dev" });

  test("가장 가까이에서 끄는 동안 프레임·엔진 p95(E2E_MEASURE=1)", async ({ page }) => {
    test.skip(process.env.E2E_MEASURE !== "1", "E2E_MEASURE=1일 때만 돈다");
    test.setTimeout(180_000);
    await page.goto("/map?second-map-sky=off");
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
    await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6", { timeout: 15_000 });
    await page.waitForTimeout(2_000);
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
    const sorted = p95.toSorted((a, b) => a - b);
    console.log(
      `[measure] map 6/6 fps ${Math.round((Number(await screen.getAttribute("data-frames")) - framesBefore) / seconds)} engineP95Median ${sorted[Math.floor(sorted.length / 2)] ?? "?"} props ${await screen.getAttribute("data-props")}`,
    );
  });
});
