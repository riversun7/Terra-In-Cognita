// 2차맵 화면 시험의 "빈 땅" 누를 자리 — 사용자 지적 2026-11-08 지도 조작(docs/adr/2026-11-08-map-input.md).
// 채집 표시는 누르기를 지도로 지나보내고 엔진이 유닛 → 표시(화면 거리 22px) → 건물 모델 → 땅 차례로 고른다. 그래서 "땅을 눌러 보낸다"는 시험은
// 표시·건물에서 떨어진 자리를 눌러야 한다(표시 바로 위를 누르면 채집 판이 열리는 것이 맞는 동작이다).
import type { Page } from "@playwright/test";
import { collapseNearby, openNearby } from "./nearby.ts";

/**
 * 땅을 누를 자리(화면 가운데에서 떨어진 거리 px): 가운데 둘레 고리(먼 것 먼저) 가운데 지도 캔버스 위이고 채집 표시·건물 표시에서 떨어진 곳.
 * 표시는 누르기를 지나보내고 엔진이 화면 거리 22px로 고르며(docs/adr/2026-11-08-map-input.md), 건물 모델을 누르면 건물 판이 열린다 —
 * 그 자리를 누르면 땅 누르기(이동)가 아니다
 */
export async function groundOffsets(page: Page): Promise<{ dx: number; dy: number }[]> {
  // 건물 표시는 근처 판 건물 탭일 때만 보인다(docs/adr/2026-11-08-seamless-second-map.md WP-2): 접힌 건물 탭으로 표시를 띄워 건물을 피한다
  await openNearby(page, "buildings");
  await collapseNearby(page);
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const canvas = document.querySelector(".map-view canvas");
    if (!canvas) return [];
    const box = canvas.getBoundingClientRect();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const centres = (selector: string): { x: number; y: number }[] =>
      [...document.querySelectorAll(selector)].flatMap((element) => {
        if (element instanceof HTMLElement && element.hidden) return [];
        const rect = element.getBoundingClientRect();
        return [{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }];
      });
    const objects = centres(".gather-marker");
    const buildings = centres(".gather-building-marker");
    const out: { dx: number; dy: number }[] = [];
    for (const radius of [150, 110]) {
      for (let step = 0; step < 12; step++) {
        const angle = (step * Math.PI) / 6 - Math.PI / 2;
        const dx = Math.round(Math.cos(angle) * radius);
        const dy = Math.round(Math.sin(angle) * radius);
        const x = cx + dx;
        const y = cy + dy;
        const hit = document.elementFromPoint(x, y);
        if (!(hit instanceof HTMLCanvasElement) || !hit.closest(".map-view")) continue;
        if (objects.some((point) => Math.hypot(point.x - x, point.y - y) < 34)) continue;
        if (buildings.some((point) => Math.hypot(point.x - x, point.y - y) < 80)) continue;
        out.push({ dx, dy });
      }
    }
    return out;
  });
}
