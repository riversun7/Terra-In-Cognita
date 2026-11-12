// 2차맵 유닛 겉모습 화면 시험 — 사용자 지적 2026-11-12(NAS 휴대폰): "내 사이보그도 갑자기 기존 노란원통 모델로 돌아가는 문제"
// (docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)").
// 원인: 기기가 유닛 전송의 움직임 빠르기(speed)로 탈것을 갈랐다(2칸/초 이상이면 낮고 넓은 노란 캡슐, 모델 대상 아님). 운영자 모드 이동은
// 빠르기 100배라 내 사이보그가 탈것으로 보였고, 도착한 뒤에도 그 움직임이 남아(다시 들어와도·새로 고쳐도) 다음 보통 이동까지 노란 캡슐이었다.
// - dev(운영자): 내 사이보그를 운영자 빠르기로 옮긴 뒤 2차맵을 열면 내 사이보그가 3D 모델(가까운 단계)이다 → 새로 고쳐도 그대로 →
//   운영자 빠르기로 동쪽 2차맵으로 넘은 뒤에도 그대로(넘은 2차맵 외형 조회).
// - 이름표: 가장 가까이(6/6)에서 내 사이보그 머리 위에 이름이 보이고, 멀리(1/6)에서도 내 사이보그 이름은 남는다.
import type { Page } from "@playwright/test";
import { isCellKey, stepCell } from "../packages/planet/src/index.ts";
import { type Place, fastMove, fastTravel, myPosition, waitAt } from "./helpers/cyborgTravel.ts";
import { expect, test } from "./helpers/test.ts";
import { shot } from "./helpers/screen.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";

/** 2차맵을 열고 자료·지형이 서고 내 사이보그가 골라질 때까지 기다린다(가장 가까이 6/6) */
async function openMap(page: Page): Promise<string> {
  await rewriteTrpc(page, { "summary.get": hideSummary });
  await page.goto("/map?second-map-sky=off");
  const screen = page.locator(".map-screen[data-map-key]");
  await expect(screen).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await expect(screen).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
  const cyborg = (await screen.getAttribute("data-cyborg")) ?? "";
  expect(cyborg).toMatch(/^\d+$/);
  await expect(screen).toHaveAttribute("data-selected", cyborg, { timeout: 15_000 });
  await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6", { timeout: 15_000 });
  return cyborg;
}

/** 옮겨 볼 칸(지금 자리에서 조금 떨어진 곳 — 막힌 칸이면 다음) */
const NUDGES = [
  [4, 0],
  [-4, 0],
  [0, 4],
  [0, -4],
  [6, 6],
] as const;
/** 동쪽 변 앞에 세울 줄 후보와 넘은 뒤 설 칸 */
const EDGE_ROWS = [128, 100, 156, 72, 184] as const;
const EDGE_COLUMN = 251;
const EAST_COLUMNS = [6, 40, 20] as const;

test.describe("2차맵 유닛 겉모습: 운영자 빠르기", () => {
  test.use({ account: "dev" });

  test("운영자 빠르기로 옮긴 내 사이보그도 노란 캡슐이 아니라 3D 모델이다(새로 고침·2차맵 넘기 뒤에도)", async ({
    page,
    deviceErrors,
  }) => {
    test.setTimeout(360_000);
    const side = await page.context().newPage();
    await side.goto("/health");
    const home = await myPosition(side);
    if (!home) throw new Error("dev 사이보그 자리를 모릅니다");
    const east = isCellKey(home.mapKey) ? stepCell(home.mapKey, 1, 0) : null;
    if (east === null) throw new Error("동쪽 이웃이 없습니다");
    try {
      // 1. 같은 2차맵 안에서 운영자 빠르기로 옮긴다(도착한 뒤에도 그 움직임 — 빠르기 100배 — 이 전송에 남는다)
      let moved: Place | null = null;
      for (const [index, [dx, dy]] of NUDGES.entries()) {
        const target = { mapKey: home.mapKey, cellX: home.cellX + dx, cellY: home.cellY + dy };
        if (!(await fastMove(side, home.unitId, target, 9100 + index * 10))) continue;
        await waitAt(side, target);
        moved = target;
        break;
      }
      if (!moved) throw new Error("옮길 칸이 없습니다");

      const cyborg = await openMap(page);
      expect(cyborg).toBe(String(home.unitId));
      const screen = page.locator(".map-screen");
      // 고치기 전: 탈것 겉모습(낮고 넓은 노란 캡슐)이라 모델 대상이 아니어서 "capsule"
      await expect(screen).toHaveAttribute("data-selected-draw", "character0", { timeout: 20_000 });
      // 이름표: 내 사이보그 머리 위에 사이보그 이름(전역 준비가 만든 이름)
      const ownTag = page.locator(`.unit-name[data-role="own"][data-unit="${cyborg}"]`);
      await expect(ownTag).toBeVisible({ timeout: 20_000 });
      await expect(ownTag).toHaveText("E2EDev");
      await expect(page.locator(".unit-name-overlay")).toHaveAttribute("aria-hidden", "true");

      // 2. 새로 고쳐도(다시 구독 — 같은 움직임을 다시 받는다) 그대로
      await page.reload();
      await openMap(page);
      await expect(screen).toHaveAttribute("data-selected-draw", "character0", { timeout: 20_000 });

      // 3. 운영자 빠르기로 동쪽 변 앞에 세운 뒤 동쪽 2차맵으로 넘는다(화면 안에서 넘음) — 넘은 뒤에도 그대로
      let row = 0;
      for (const candidate of EDGE_ROWS) {
        const target = { mapKey: home.mapKey, cellX: EDGE_COLUMN, cellY: candidate };
        if (!(await fastTravel(side, home.mapKey, home.unitId, target))) continue;
        await waitAt(side, target);
        row = candidate;
        break;
      }
      if (row === 0) throw new Error("동쪽 변 앞에 설 자리가 없습니다");
      await openMap(page);
      const map = page.locator(".map-screen[data-map-key]");
      await expect
        .poll(async () => Number(await map.getAttribute("data-neighbours")), { timeout: 30_000 })
        .toBeGreaterThan(0);
      let crossed = false;
      let from = home.mapKey;
      for (const column of EAST_COLUMNS) {
        const target = { mapKey: east, cellX: column, cellY: row };
        if (!(await fastTravel(side, from, home.unitId, target))) continue;
        from = east;
        await expect(map).toHaveAttribute("data-map-key", String(east), { timeout: 120_000 });
        await waitAt(side, target);
        crossed = true;
        break;
      }
      expect(crossed).toBe(true);
      await expect(map).toHaveAttribute("data-switched", "in-place");
      await expect(screen).toHaveAttribute("data-selected-draw", "character0", { timeout: 20_000 });
      // 넘은 2차맵에서도 이름표가 따라온다. 멀리(1/6) 줄여도 내 사이보그 이름은 남는다
      await expect(ownTag).toBeVisible({ timeout: 20_000 });
      const ladder = page.locator(".zoom-ladder");
      for (let i = 0; i < 6 && Number(await ladder.getAttribute("data-stage")) > 1; i++) {
        await ladder.locator(".zoom-ladder-out").click();
        await page.waitForTimeout(600);
      }
      await expect(ladder).toHaveAttribute("data-stage", "1");
      await expect(ownTag).toBeVisible();
      await expect(page.locator('.unit-name[data-role="other"]:visible')).toHaveCount(0);
      expect(deviceErrors).toEqual([]);
    } finally {
      const now = await myPosition(side);
      if (now && (await fastTravel(side, now.mapKey, home.unitId, home))) await waitAt(side, home, 4);
      await side.close();
    }
  });
});

/** 끌어서 이어 그리게 한 뒤 1초 요약(유닛·모델 수, 그리기 호출, 삼각형, 엔진 p95, 이름표 수)을 적는다 */
async function readStats(page: Page, label: string): Promise<void> {
  const box = await page.locator(".map-screen canvas").first().boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(cx + ((i % 10) - 5) * 3, cy + ((i % 6) - 3) * 2);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(1_200);
  const screen = page.locator(".map-screen");
  const names = [
    "data-units",
    "data-drawn-units",
    "data-characters",
    "data-character-lod0",
    "data-draw-calls",
    "data-triangles",
    "data-engine-p95",
    "data-view-level",
  ];
  const values: string[] = [];
  for (const name of names) values.push(`${name.slice(5)}=${String(await screen.getAttribute(name))}`);
  const tags = await page.locator(".unit-name-overlay").getAttribute("data-names");
  console.log(`[unit-looks] ${label} ${values.join(" ")} names=${String(tags)}`);
}

for (const theme of ["pastel", "dark"] as const) {
  test.describe(`2차맵 유닛 겉모습: 390 ${theme}`, () => {
    test.use({ account: "player", theme });

    test(`가장 가까이(6/6)에서 내 사이보그 모델·이름표(지도자 이름표와 겹치지 않음), 다른 유닛 이름은 상한 안 — 사진 390 ${theme}`, async ({
      page,
      deviceErrors,
    }) => {
      test.setTimeout(120_000);
      const cyborg = await openMap(page);
      const screen = page.locator(".map-screen");
      await expect(screen).toHaveAttribute("data-selected-draw", "character0", { timeout: 20_000 });
      await expect(page.locator(`.unit-name[data-role="own"][data-unit="${cyborg}"]`)).toHaveText(
        "E2EPlayer",
        {
          timeout: 20_000,
        },
      );
      // 지도자 옆에 서 있어도 내 사이보그 이름표는 지도자 이름표와 겹치지 않는다(위로 비킨다)
      const ownBox = await page.locator(`.unit-name[data-role="own"][data-unit="${cyborg}"]`).boundingBox();
      for (const pill of await page.locator(".leader-tag:not([hidden]) .leader-tag-pill").all()) {
        const leaderBox = await pill.boundingBox();
        if (!ownBox || !leaderBox) continue;
        const apart =
          ownBox.x + ownBox.width <= leaderBox.x ||
          leaderBox.x + leaderBox.width <= ownBox.x ||
          ownBox.y + ownBox.height <= leaderBox.y ||
          leaderBox.y + leaderBox.height <= ownBox.y;
        expect(apart).toBe(true);
      }
      // 다른 유닛 이름표는 상한(10) 안
      await page.waitForTimeout(1_500);
      const others = await page.locator('.unit-name[data-role="other"]:visible').count();
      expect(others).toBeLessThanOrEqual(10);
      await readStats(page, `6/6 ${theme}`);
      await shot(page, `unit-looks-map-390-${theme}`);
      expect(deviceErrors).toEqual([]);
    });
  });
}
