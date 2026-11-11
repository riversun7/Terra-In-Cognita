// 2차맵 건물 모델 화면 시험(ADR 2026-11-08-building-art) — dev(전체 보기 계정, 운영자 모드를 켜고 본다)
// - NPC 시작 도시 2차맵: tRPC facilities.mapLooks가 시설 ID(행정 건물·창고·농장·벌목장·광산 등)를 주고, 엔진이 시설 종류별 모델로 다시 그린다.
//   그리기 호출(위 판 "그리기 N회")을 기록한다(지형·소품·유닛 + 건물 도형 최대 7).
// - 건물 표시를 숨기고 그 자리(건물 모델 위)를 누르면 건물 판이 열린다(엔진 건물 누르기 → 판 안 칸).
// - 사진: 도시 2차맵(도시 칸, 처음 거리 — 최대 확대, 건물 표시가 화면 밖이면 한두 단계 줄인 거리) 390·1440 × 파스텔·다크 × 낮·밤(?second-map-time=). 세계 색은 테마와 상관없고(D-070) 위 판만
//   바뀐다. 채집 덧그림 표시는 건물을 가려 사진에서만 숨긴다.
import { buildingMarkerPoints, centreOnBuildings, openCityMap } from "./helpers/cityMap.ts";
import { shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

test.describe("건물 모델: 도시 2차맵", () => {
  test.use({ account: "dev" });

  test("시설 겉모습을 받아 그리고, 건물 모델 위를 누르면 건물 판이 열린다", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(180_000);
    const { looks } = await openCityMap(page);
    const facilities = new Set(looks.map((row) => row.facilityId));
    // NPC 시작 도시 기본 시설(ADR 2026-11-07-play-flow WP5): 행정 건물·창고
    expect(facilities.has("government_hall")).toBe(true);
    expect(facilities.has("storehouse")).toBe(true);
    const perf = (await page.locator(".map-perf").textContent()) ?? "";
    const calls = /(\d+)회/.exec(perf)?.[1];
    // 작업 기록에 옮겨 적는다(표준 출력): 위 판 "유닛 N · 그리기 N회"
    console.log(`[measure] building-art draw calls ${calls ?? "?"} — ${perf.trim()}`);
    expect(Number(calls)).toBeGreaterThan(0);

    // 건물 표시(DOM)를 숨기고 그 자리를 캔버스에서 누른다 — 표시 자리 = 건물 가운데 4m 위 = 건물 모델 위
    await centreOnBuildings(page);
    const boxes = await buildingMarkerPoints(page);
    // 채집 덧그림의 표시(오브젝트·건물)를 모두 숨긴다 → 누르기가 캔버스(엔진)로 간다
    await page.addStyleTag({ content: ".gather-overlay > * { visibility: hidden !important; }" });
    // 위 판(HUD)에 가리지 않은 표시 자리만(그 점의 맨 위 요소가 캔버스), 행정 건물 먼저
    const open: typeof boxes = [];
    for (const box of boxes)
      if (
        await page.evaluate((point) => document.elementFromPoint(point.x, point.y)?.tagName === "CANVAS", box)
      )
        open.push(box);
    const hall = looks.find((row) => row.facilityId === "government_hall")?.buildingId;
    const order = [...open.filter((box) => box.id === hall), ...open.filter((box) => box.id !== hall)];
    if (order.length === 0) throw new Error("캔버스에서 누를 수 있는 건물 표시 자리가 없습니다");
    // 누른 칸 둘레 2칸 안에 채집 오브젝트가 있으면 화면은 오브젝트 판을 먼저 연다(gatherState.tapCell) — 그때는 다음 건물로
    const sheet = page.locator(".gather-sheet");
    let opened: number | null = null;
    for (const box of order) {
      await page.mouse.click(box.x, box.y);
      await expect(sheet).toBeVisible({ timeout: 10_000 });
      if ((await sheet.getAttribute("data-building")) === String(box.id)) {
        opened = box.id;
        break;
      }
      await sheet.locator(".gather-sheet-close").click();
      await expect(sheet).toHaveCount(0);
    }
    expect(opened).not.toBeNull();
    expect(deviceErrors).toEqual([]);
  });

  for (const [width, preset] of [
    ["390", VIEWPORTS.phone],
    ["1440", VIEWPORTS.desktop],
  ] as const) {
    for (const theme of ["pastel", "dark"] as const satisfies readonly Theme[]) {
      test.describe(`${width} ${theme}`, () => {
        test.use({ ...preset, theme, language: "ko" });

        for (const [time, hour] of [
          ["day", 11],
          ["night", 22],
        ] as const) {
          test(`도시 2차맵 사진 (${width}·${theme}·${time})`, async ({ page, deviceErrors }) => {
            test.setTimeout(180_000);
            await openCityMap(page, `&second-map-time=${String(hour)}`);
            await centreOnBuildings(page);
            // 채집 덧그림 표시(오브젝트 점·건물 이름표)는 건물 모양을 가려서 사진에서만 숨긴다
            await page.addStyleTag({ content: ".gather-overlay > * { visibility: hidden !important; }" });
            await page.waitForTimeout(500);
            await shot(page, `building-art-city-${width}-${theme}-${time}`);
            expect(deviceErrors).toEqual([]);
          });
        }
      });
    }
  }
});
