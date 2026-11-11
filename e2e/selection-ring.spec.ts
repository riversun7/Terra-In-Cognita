// 고른 표시 고리 화면 시험 — docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 962)".
// 고른 표시 고리(노랑, packages/engine/src/units/unitView.ts)는 깊이를 쓰지 않는다. 그리는 차례가 땅과 같으면(renderOrder 0) 불투명 물체는
// 재질 번호 차례라, 고리보다 나중에 만든 지형 재질(이웃 2차맵 지형 — 걸어 넘으면 그것을 지금 지형으로 들인다)이 고리를 덮었다.
// - dev: 내 사이보그를 운영자 빠르기로 동쪽 변 앞에 세우고 2차맵을 연 뒤(이웃 지형을 받음) 동쪽 2차맵의 빈 풀밭으로 보낸다 →
//   화면 안에서 넘은(data-switched = in-place) 뒤 가장 가까이(6/6)에서 사이보그 둘레 화소를 본다: 캡슐 외곽선(노랑) 바깥, 고리가 있을
//   좌우 띠에 노란 화소가 있어야 한다(고치기 전 0 — 화소로 확인). 나무가 가리면 다음 칸으로.
import type { Page } from "@playwright/test";
import { isCellKey, stepCell } from "../packages/planet/src/index.ts";
import { expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { sendCommands } from "./helpers/wsCommands.ts";

interface Place {
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 내 사이보그 자리(tRPC world.myPosition, seamless.spec.ts와 같다). 건너뛰는 중이거나 없으면 null */
async function myPosition(side: Page): Promise<(Place & { unitId: number }) | null> {
  const reply: unknown = await side.evaluate(() =>
    fetch("/api/trpc/world.myPosition").then((response) => response.json()),
  );
  const position = field(field(field(reply, "result"), "data"), "position");
  if (position === undefined || position === null || field(position, "hidden") === true) return null;
  return {
    mapKey: Number(field(position, "mapKey")),
    cellX: Number(field(position, "cellX")),
    cellY: Number(field(position, "cellY")),
    unitId: Number(field(position, "unitId")),
  };
}

/** 운영자 빠르기(전체 보기로 구독한 연결의 명령)로 내 사이보그를 보낸다. 결과가 ok면 true */
async function fastTravel(side: Page, from: number, unitId: number, to: Place): Promise<boolean> {
  const replies = await sendCommands(side, [
    { t: "subscribe", mapKey: from, observe: true },
    { t: "travel_start", unitId, mapKey: to.mapKey, x: to.cellX, y: to.cellY, kind: "move" },
  ]);
  return field(replies[1], "ok") === true;
}

/** 내 사이보그가 그 칸 둘레(반지름 칸)에 설 때까지 */
async function waitAt(side: Page, target: Place, radius = 3): Promise<void> {
  await expect
    .poll(
      async () => {
        const at = await myPosition(side);
        if (!at || at.mapKey !== target.mapKey) return 999;
        return Math.max(Math.abs(at.cellX - target.cellX), Math.abs(at.cellY - target.cellY));
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBeLessThanOrEqual(radius);
}

/**
 * 화면 가운데(따라가는 사이보그) 둘레 좌우 띠(가운데에서 30~58 CSS px, 위아래 20px)의 고리 노란 화소 수. 캡슐 외곽선은 띠 안쪽이다
 * (6/6 휴대폰: 1m = 26px, 캡슐 반지름 약 0.8m → 외곽선 약 24px, 고리 바깥 반지름 = 몸 × 2.4 ≈ 50px)
 */
async function ringPixels(page: Page): Promise<number> {
  const box = await page.locator(".map-view canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  const half = { x: 60, y: 20 };
  const clip = {
    x: box.x + box.width / 2 - half.x,
    y: box.y + box.height / 2 - half.y,
    width: half.x * 2,
    height: half.y * 2,
  };
  const png = await page.screenshot({ clip });
  return page.evaluate(
    async ({ data, inner }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) return -1;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      // 화면 배율(사진 화소 / CSS px)
      const scale = image.width / 120;
      let count = 0;
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          if (Math.abs(x - image.width / 2) < inner * scale) continue;
          const i = (y * image.width + x) * 4;
          const r = pixels[i] ?? 0;
          const g = pixels[i + 1] ?? 0;
          const b = pixels[i + 2] ?? 0;
          // 고리 색 HIGHLIGHT_COLOR #ffd66e 둘레(빛에 따라 조금 어둡거나 밝다)
          if (r > 220 && g > 180 && g < 240 && b > 60 && b < 170 && r - b > 80) count++;
        }
      }
      return count;
    },
    { data: png.toString("base64"), inner: 30 },
  );
}

/** 동쪽 변 앞에 세울 줄 후보와 넘은 뒤 설 칸(빈 풀밭을 찾을 때까지) */
const EDGE_ROWS = [128, 100, 156, 72, 184] as const;
const EDGE_COLUMN = 251;
const EAST_COLUMNS = [6, 40, 20] as const;

test.describe("고른 표시 고리", () => {
  test.use({ account: "dev" });

  test("옆 2차맵으로 넘은 뒤에도 고른 표시 고리가 땅에 가려지지 않는다", async ({ page, deviceErrors }) => {
    test.setTimeout(300_000);
    const side = await page.context().newPage();
    await side.goto("/health");
    const home = await myPosition(side);
    if (!home) throw new Error("dev 사이보그 자리를 모릅니다");
    const east = isCellKey(home.mapKey) ? stepCell(home.mapKey, 1, 0) : null;
    if (east === null) throw new Error("동쪽 이웃이 없습니다");
    try {
      let row = 0;
      for (const candidate of EDGE_ROWS) {
        const target = { mapKey: home.mapKey, cellX: EDGE_COLUMN, cellY: candidate };
        if (!(await fastTravel(side, home.mapKey, home.unitId, target))) continue;
        await waitAt(side, target);
        row = candidate;
        break;
      }
      if (row === 0) throw new Error("동쪽 변 앞에 설 자리가 없습니다");

      await rewriteTrpc(page, { "summary.get": hideSummary });
      await page.goto("/map?second-map-sky=off");
      const map = page.locator(".map-screen[data-map-key]");
      await expect(map).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
      await expect(map).toHaveAttribute("data-feed", "live", { timeout: 30_000 });
      await expect(map).toHaveAttribute("data-follow", "on", { timeout: 15_000 });
      await expect
        .poll(async () => Number(await map.getAttribute("data-neighbours")), { timeout: 30_000 })
        .toBeGreaterThan(0);
      await page.waitForTimeout(1_500);

      const counts: number[] = [];
      let from = home.mapKey;
      for (const column of EAST_COLUMNS) {
        const target = { mapKey: east, cellX: column, cellY: row };
        if (!(await fastTravel(side, from, home.unitId, target))) continue;
        from = east;
        await expect(map).toHaveAttribute("data-map-key", String(east), { timeout: 120_000 });
        await waitAt(side, target);
        await page.waitForTimeout(2_500);
        await expect(map).toHaveAttribute("data-switched", "in-place");
        await expect(page.locator(".zoom-ladder")).toHaveAttribute("data-stage", "6");
        counts.push(await ringPixels(page));
        if ((counts.at(-1) ?? 0) > 0) break;
      }
      console.log(`[selection-ring] ring pixels per spot ${JSON.stringify(counts)}`);
      expect(Math.max(0, ...counts)).toBeGreaterThan(0);
      expect(deviceErrors).toEqual([]);
    } finally {
      const now = await myPosition(side);
      if (now && (await fastTravel(side, now.mapKey, home.unitId, home))) await waitAt(side, home, 4);
      await side.close();
    }
  });
});
