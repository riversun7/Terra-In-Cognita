// 2차맵 캐릭터 3D 모델 화면 시험 — docs/adr/2026-11-11-character-3d.md 4절(사용자 요청 2026-11-11 "캐릭터 … 폴리곤 3d로 … 2차맵에서도 사용가능하게").
// - player: 2차맵에 들어오면(내 사이보그가 골라져 있고 가장 가까운 확대) 내 사이보그는 캡슐이 아니라 3D 모델로 그려진다
//   (data-selected-draw = character0·character1, data-characters ≥ 1). 멀리 줄이면 캡슐·점으로 돌아간다(모델 0).
//   넓은 화면(1440)은 가까운 단계(character0), 좁은 화면(390)은 키가 작아 먼 단계(character1)다.
// - 서버: world.unitLooks가 내 사이보그의 외형을 준다(맞는 외형 모양).
// - 측정(E2E_MEASURE=1, 작업 기록용): 도시 2차맵에서 가까이·멀리 그리기 호출·삼각형·엔진 p95·JS 메모리(헤드리스 SwiftShader라 휴대폰 값 아님).
// - 사진: 가까이 본 2차맵 390·1440 × 파스텔.
import type { Page } from "@playwright/test";
import { shot } from "./helpers/screen.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/** 2차맵을 열고 자료·지형이 서고 내 사이보그가 골라질 때까지 기다린다 */
async function openMap(page: Page, search = ""): Promise<string> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto(`/map${search}`);
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 20_000 });
  const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
  expect(cyborg).toMatch(/^\d+$/);
  await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
  await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "5", { timeout: 15_000 });
  return cyborg;
}

const stat = async (page: Page, name: string): Promise<number> =>
  Number(await page.locator(".map-screen").getAttribute(name));

/** 확대 사다리의 [−]를 눌러 단계 stage까지 줄인다 */
async function zoomOutTo(page: Page, stage: number): Promise<void> {
  const ladder = page.locator(".zoom-ladder");
  for (let i = 0; i < 6; i++) {
    if (Number(await ladder.getAttribute("data-stage")) <= stage) break;
    await ladder.locator(".zoom-ladder-out").click();
    await page.waitForTimeout(600);
  }
  await expect(ladder).toHaveAttribute("data-stage", String(stage));
}

/** 끌어서 이어 그리게 한 뒤 1초 요약(유닛·모델 수, 그리기 호출, 삼각형, 엔진 p95, JS 힙)을 적는다 */
async function readStats(page: Page, label: string): Promise<void> {
  const screen = page.locator(".map-screen");
  const box = await page.locator(".map-screen canvas").first().boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(cx + ((i % 10) - 5) * 3, cy + ((i % 6) - 3) * 2);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(1_200);
  const names = [
    "data-units",
    "data-drawn-units",
    "data-characters",
    "data-character-lod0",
    "data-draw-calls",
    "data-triangles",
    "data-engine-p95",
    "data-view-level",
    "data-unit-mode",
    "data-props",
  ];
  const values: string[] = [];
  for (const name of names) values.push(`${name.slice(5)}=${String(await screen.getAttribute(name))}`);
  const heapMb = await page.evaluate(() => {
    const memory: unknown = Reflect.get(performance, "memory");
    const used: unknown =
      typeof memory === "object" && memory !== null ? Reflect.get(memory, "usedJSHeapSize") : null;
    return typeof used === "number" ? Math.round(used / 1024 / 1024) : null;
  });
  console.log(`[character-3d] ${label} ${values.join(" ")} jsHeapMB=${String(heapMb)}`);
}

/** 측정: 모델 켬(기본)·끔(?unit-models=0)으로 2차맵을 열어 5/5·3/5·1/5에서 잰다 */
async function measure(page: Page, models: boolean): Promise<void> {
  await openMap(page, models ? "" : "?unit-models=0");
  const label = models ? "models on" : "models off";
  await readStats(page, `${label} 5/5`);
  await zoomOutTo(page, 3);
  await readStats(page, `${label} 3/5`);
  await zoomOutTo(page, 1);
  await readStats(page, `${label} 1/5`);
}

test.describe("2차맵 캐릭터 모델: 넓은 화면", () => {
  test.use({ account: "player", ...VIEWPORTS.desktop });

  test("내 사이보그는 가까이서 3D 모델(가까운 단계), 멀리 줄이면 캡슐·점으로 돌아간다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(90_000);
    const cyborg = await openMap(page);
    const screen = page.locator(".map-screen");
    // 가까이(5/5): 고른 유닛(내 사이보그)이 가까운 단계 모델이다. 모델 수 ≥ 1, 가까운 단계 수 ≥ 1
    await expect(screen).toHaveAttribute("data-selected-draw", "character0", { timeout: 15_000 });
    expect(await stat(page, "data-characters")).toBeGreaterThanOrEqual(1);
    expect(await stat(page, "data-character-lod0")).toBeGreaterThanOrEqual(1);
    // 모델로 그린 유닛도 그린 유닛 수에 든다
    expect(await stat(page, "data-drawn-units")).toBeGreaterThanOrEqual(await stat(page, "data-characters"));
    await shot(page, "character-3d-map-close-1440-pastel");

    // 서버가 내 사이보그의 외형을 준다(world.unitLooks)
    const mapKey = (await screen.getAttribute("data-map-key")) ?? "";
    const looks = await page.evaluate(async (key) => {
      const input = encodeURIComponent(JSON.stringify({ mapKey: Number(key) }));
      const response: unknown = await fetch(`/api/trpc/world.unitLooks?input=${input}`).then((reply) =>
        reply.json(),
      );
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const pick = (value: unknown, name: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
      return pick(pick(pick(response, "result"), "data"), "units");
    }, mapKey);
    expect(looks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unitId: Number(cyborg),
          kind: "cyborg_body",
          look: expect.objectContaining({ v: 2 }),
        }),
      ]),
    );

    // 멀리(1/5): 모델을 그리지 않는다 — 내 사이보그는 캡슐이나 점
    await zoomOutTo(page, 1);
    await expect(screen).toHaveAttribute("data-selected-draw", /^(capsule|icon)$/, { timeout: 15_000 });
    await expect(screen).toHaveAttribute("data-characters", "0");
    expect(deviceErrors).toEqual([]);
  });

  for (const models of ["off", "on"] as const) {
    test(`측정(모델 ${models}): 가까이·중간·멀리 그리기 호출·삼각형·엔진 p95(E2E_MEASURE=1)`, async ({
      page,
    }) => {
      test.skip(process.env["E2E_MEASURE"] !== "1", "E2E_MEASURE=1일 때만 돈다");
      test.setTimeout(120_000);
      await measure(page, models === "on");
    });
  }
});

test.describe("2차맵 캐릭터 모델: 좁은 화면", () => {
  test.use({ account: "player", ...VIEWPORTS.phone });

  test("390에서는 키가 작아 먼 단계 모델로 그린다", async ({ page, deviceErrors }) => {
    test.setTimeout(90_000);
    await openMap(page);
    const screen = page.locator(".map-screen");
    await expect(screen).toHaveAttribute("data-selected-draw", /^character[01]$/, { timeout: 15_000 });
    expect(await stat(page, "data-characters")).toBeGreaterThanOrEqual(1);
    await shot(page, "character-3d-map-close-390-pastel");
    expect(deviceErrors).toEqual([]);
  });
});
