// 시험 봇 목적지 고르기 시험 — 집이 있는 봇(NPC 휴먼, docs/adr/2026-11-07-play-flow.md "WP-NPC")의 목적지 네모(homeArea)
import { createRng } from "@terra/shared";
import { anchorCenter, createPlacementGrid } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { HOME_RADIUS_CELLS, TRIP_RADIUS_CELLS, homeArea, pickDestination } from "./bots.ts";

const at = (x: number, y: number) => anchorCenter(x, y, 1);

describe("homeArea", () => {
  it("집 반경 안이면 집 둘레 네모", () => {
    expect(homeArea(at(130, 120), 1, { x: 128, y: 128 })).toEqual({
      x: 128,
      y: 128,
      radius: HOME_RADIUS_CELLS,
    });
  });

  it("멀면 집 쪽으로 TRIP_RADIUS_CELLS만큼 다가간 칸 둘레(작은 반경)", () => {
    const area = homeArea(at(10, 128), 1, { x: 200, y: 128 });
    expect(area.x).toBe(10 + TRIP_RADIUS_CELLS);
    expect(area.y).toBe(128);
    expect(area.radius).toBeLessThan(HOME_RADIUS_CELLS);
    // 대각선: 체비셰프 거리로 나눈다(두 축 모두 다가간다)
    const diagonal = homeArea(at(0, 0), 1, { x: 200, y: 100 });
    expect(diagonal.x).toBe(TRIP_RADIUS_CELLS);
    expect(diagonal.y).toBe(TRIP_RADIUS_CELLS / 2);
  });
});

describe("pickDestination", () => {
  it("네모를 주면 그 안에서, 안 주면 지금 자리 둘레 TRIP_RADIUS_CELLS 안에서 고른다(난수 차례는 예전과 같다)", () => {
    const grid = createPlacementGrid();
    for (let seed = 1; seed <= 40; seed++) {
      const inside = pickDestination(grid, createRng(seed), 1, at(20, 20), { x: 128, y: 128, radius: 10 });
      expect(inside).toBeDefined();
      const x = Math.floor((inside?.x ?? 0) / 1024);
      const y = Math.floor((inside?.y ?? 0) / 1024);
      expect(Math.abs(x - 128)).toBeLessThanOrEqual(10);
      expect(Math.abs(y - 128)).toBeLessThanOrEqual(10);
      // 네모 없이 = 지금 자리 둘레(옛 규칙과 같은 값)
      const plain = pickDestination(grid, createRng(seed), 1, at(128, 128));
      const sameAsArea = pickDestination(grid, createRng(seed), 1, at(128, 128), {
        x: 128,
        y: 128,
        radius: TRIP_RADIUS_CELLS,
      });
      expect(plain).toEqual(sameAsArea);
    }
  });
});
