// 2차맵 건물 모델 화면 시험(ADR 2026-11-08-building-art) — dev(전체 보기 계정, 운영자 모드를 켜고 본다)
// - NPC 시작 도시 2차맵: tRPC facilities.mapLooks가 시설 ID(행정 건물·창고·농장·벌목장·광산 등)를 주고, 엔진이 시설 종류별 모델로 다시 그린다.
//   그리기 호출(위 판 "그리기 N회")을 기록한다(지형·소품·유닛 + 건물 도형 최대 7).
// - 건물 표시를 숨기고 그 자리(건물 모델 위)를 누르면 건물 판이 열린다(엔진 건물 누르기 → 판 안 칸).
// - 사진: 도시 2차맵 390·1440 × 파스텔·다크 × 낮·밤(?second-map-time=). 세계 색은 테마와 상관없고(D-070) 위 판만 바뀐다.
import type { Page, Response } from "@playwright/test";
import { shot } from "./helpers/screen.ts";
import { type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 띄운 2차맵 가운데 시작 도시가 있는 것(없으면 아무 도시) */
async function cityMapKey(page: Page): Promise<number> {
  const data: unknown = await page.evaluate(async () => {
    const response: unknown = await fetch("/api/trpc/world.cities").then((reply) => reply.json());
    return response;
  });
  const list = field(field(field(data, "result"), "data"), "cities");
  if (!Array.isArray(list)) throw new Error("도시 목록이 없습니다");
  const loaded = list.filter((city: unknown) => field(city, "loaded") === true);
  const start = loaded.find((city: unknown) => field(city, "start") === true) ?? loaded[0];
  const key = Number(field(start, "mapKey"));
  if (!Number.isSafeInteger(key)) throw new Error("띄운 도시 2차맵이 없습니다");
  return key;
}

/** facilities.mapLooks 응답의 건물 줄(묶음 응답이면 그 조회만) */
async function looksOf(response: Response): Promise<{ buildingId: number; facilityId: string | null }[]> {
  const body: unknown = await response.json();
  const entries: unknown[] = Array.isArray(body) ? body : [body];
  for (const entry of entries) {
    const rows = field(field(field(entry, "result"), "data"), "buildings");
    if (Array.isArray(rows))
      return rows.map((row: unknown) => ({
        buildingId: Number(field(row, "buildingId")),
        facilityId: typeof field(row, "facilityId") === "string" ? String(field(row, "facilityId")) : null,
      }));
  }
  return [];
}

/** 도시 2차맵을 열고 운영자 모드(전체 보기 — 안개 없이 모든 건물)를 켠 뒤 건물 겉모습 응답을 기다린다 */
async function openCityMap(page: Page, query = ""): Promise<{ looks: Awaited<ReturnType<typeof looksOf>> }> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/");
  const key = await cityMapKey(page);
  await page.goto(`/map?key=${String(key)}${query}`);
  const map = page.locator(".map-screen[data-map-key]");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  // 건물 목록이 바뀌면(전체 보기 구독) 화면이 겉모습을 다시 묻는다
  const looksResponse = page.waitForResponse((response) => response.url().includes("facilities.mapLooks"), {
    timeout: 60_000,
  });
  await page.locator(".map-operator-toggle").click();
  await expect(map).toHaveAttribute("data-operator", "on");
  await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  const looks = await looksOf(await looksResponse);
  // 겉모습을 받은 뒤 엔진이 다시 그릴 틈
  await page.waitForTimeout(1_500);
  return { looks };
}

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
    const markers = page.locator(".gather-building-marker[data-building]:not([hidden])");
    await expect(markers.first()).toBeVisible({ timeout: 20_000 });
    const boxes = await markers.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          id: Number(element.getAttribute("data-building")),
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
        };
      }),
    );
    const hall = looks.find((row) => row.facilityId === "government_hall")?.buildingId;
    const target = boxes.find((box) => box.id === hall) ?? boxes[0];
    if (!target) throw new Error("보이는 건물 표시가 없습니다");
    // 채집 덧그림의 표시(오브젝트·건물)를 모두 숨긴다 → 누르기가 캔버스(엔진)로 간다
    await page.addStyleTag({ content: ".gather-overlay > * { visibility: hidden !important; }" });
    await page.mouse.click(target.x, target.y);
    const sheet = page.locator(".gather-sheet");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet).toHaveAttribute("data-building", String(target.id));
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
            // 한 단계 줄여 도시 건물이 여럿 보이게
            await page.locator(".zoom-ladder-out").click();
            await page.waitForTimeout(1_500);
            await shot(page, `building-art-city-${width}-${theme}-${time}`);
            expect(deviceErrors).toEqual([]);
          });
        }
      });
    }
  }
});
