// 2차맵 소품 풍성함·유닛 앞 옅게 화면 시험 — ADR 2026-10-31-second-map-from-planet "바뀜 (2026-11-11)", 기획 질문 996 다(D-523 포인터).
// - 지도(player): 내 사이보그가 선 시작 자리(도시 가운데 나무 덤불)로 들어오면 가장 가까이(6/6)에서 사이보그와 카메라 사이 나무를 옅게
//   그린다(data-props-faded > 0). 소품·땅 잔소품이 세워진다(data-props·data-clutter는 지도 HUD에 data-props만 있어 data-props로 본다).
//   사진: 390 × 파스텔·다크(한국어).
// - 2차맵 시험(dev, /dev/second-map): 숲·초지 자리를 가까이(휠) 본 뒤 소품·잔소품 수, 그리기 호출(부품 6가지 + 지형 등), 삼각형, 엔진 p95를
//   찍는다([measure] 줄 — 헤드리스 SwiftShader라 휴대폰 값이 아니다). 사진: 숲(네온)·초지(라이트) 가까이.
import type { Page } from "@playwright/test";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

const body = (page: Page) => page.locator(".sml-body");

/** 2차맵 시험 화면 요약(1초마다 붙는다) */
interface LabStats {
  readonly props: number;
  readonly clutter: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly renderP95Ms: number;
  readonly viewSpanM: number;
}

async function labStats(page: Page): Promise<LabStats> {
  const read = async (name: string): Promise<number> => Number(await body(page).getAttribute(name));
  return {
    props: await read("data-props"),
    clutter: await read("data-clutter"),
    drawCalls: await read("data-draw-calls"),
    triangles: await read("data-triangles"),
    renderP95Ms: await read("data-render-p95"),
    viewSpanM: await read("data-view-span"),
  };
}

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

test.describe("유닛 앞 옅게: 플레이어", () => {
  test.use({ account: "player" });

  for (const theme of ["pastel", "dark"] as const) {
    test.describe(`390 ${theme}`, () => {
      test.use({ theme, language: "ko" });

      test(`6/6 진입에서 사이보그 앞 나무를 옅게 그린다 (${theme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(120_000);
        await rewriteTrpc(page, { "summary.get": hideSummary });
        await page.goto("/map?second-map-sky=off");
        const map = page.locator(".map-screen[data-map-key]");
        await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
        await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
        await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6", { timeout: 15_000 });
        await expect
          .poll(async () => Number(await map.getAttribute("data-props")), { timeout: 20_000 })
          .toBeGreaterThan(0);
        // 시작 자리는 나무 덤불 안이라(map-zoom-close 작업 기록 사진) 사이보그와 카메라 사이 나무가 있다
        await expect
          .poll(async () => Number(await map.getAttribute("data-props-faded")), { timeout: 20_000 })
          .toBeGreaterThan(0);
        console.log(
          `[measure] map ${theme} props ${await map.getAttribute("data-props")} faded ${await map.getAttribute("data-props-faded")}`,
        );
        await page.waitForTimeout(600);
        await shot(page, `map-props-fade-390-${theme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});

test.describe("소품 풍성함: 2차맵 시험", () => {
  test.use({ account: "dev" });

  const cases = [
    { preset: "forest", devTheme: "neon" },
    { preset: "grassland", devTheme: "light" },
  ] as const;
  for (const { preset, devTheme } of cases) {
    test.describe(`${preset} ${devTheme}`, () => {
      test.use({ devTheme, language: "ko" });

      test(`${preset}: 가까이·멀리 소품 측정과 사진 (${devTheme})`, async ({ page, deviceErrors }) => {
        test.setTimeout(150_000);
        await page.goto("/dev/second-map?second-map-sky=off");
        await expect(body(page)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
        await page.locator(`.sml-preset[data-preset="${preset}"]`).click();
        await expect(body(page)).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
        await expect(body(page)).toHaveAttribute("data-props", /\d+/, { timeout: 30_000 });
        await page.waitForTimeout(1_500);
        const far = await labStats(page);
        await zoomInTo(page, 60);
        await expect
          .poll(async () => Number(await body(page).getAttribute("data-props")), { timeout: 20_000 })
          .toBeGreaterThan(0);
        // 요약이 다시 붙고 엔진 p95가 가라앉을 때까지
        await page.waitForTimeout(2_500);
        const near = await labStats(page);
        console.log(`[measure] lab ${preset} far ${JSON.stringify(far)} near ${JSON.stringify(near)}`);
        // 부품 6가지 + 지형·물·하늘 등: 소품을 많이 세워도 그리기 호출이 작다
        expect(near.drawCalls).toBeLessThanOrEqual(far.drawCalls + 6);
        expect(near.clutter).toBeGreaterThan(0);
        await shot(page, `map-props-lab-${preset}-390-${devTheme}`);
        expect(deviceErrors).toEqual([]);
      });
    });
  }
});
