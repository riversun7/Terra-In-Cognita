import { describe, expect, it } from "vitest";
import { type SecondMapLayers, arenaFromSecondMap, pickArenaOrigin } from "./arena.ts";
import { createBattleMap } from "./battleMap.ts";

/** 128칸 2차맵(지형 64): 왼쪽 위 사분면은 물(막힘), (80..95, 80..95)에 수풀 */
function layers(): SecondMapLayers {
  const size = 128;
  const costs = new Uint16Array(size * size).fill(1000);
  const cover = new Uint8Array(size * size);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) costs[y * size + x] = 0;
  for (let y = 80; y < 96; y++) for (let x = 80; x < 96; x++) cover[y * size + x] = 1;
  const terrainSize = 64;
  const vertexHeightsCm = new Int32Array((terrainSize + 1) ** 2);
  for (let y = 0; y <= terrainSize; y++)
    for (let x = 0; x <= terrainSize; x++) vertexHeightsCm[y * (terrainSize + 1) + x] = 1000 + x * 10;
  return { size, costs, cover, terrainSize, vertexHeightsCm };
}

describe("경기장 = 2차맵 구역", () => {
  it("지나갈 수 있는 칸이 가장 많고, 같으면 수풀이 많은 창을 고른다", () => {
    const origin = pickArenaOrigin(layers(), 32);
    expect(origin).toEqual({ x: 64, y: 64 });
  });

  it("통과·엄폐·높이(16배 cm, 최저점 0)를 그대로 옮긴다", () => {
    const source = layers();
    const map = arenaFromSecondMap(source, { x: 48, y: 48 }, 32);
    expect(map.size).toBe(32);
    // (48, 48)은 물 사분면 안 → 막힘, (16, 16) = 2차맵 (64, 64) → 지나감
    expect(map.passable[0]).toBe(0);
    expect(map.passable[16 * 32 + 16]).toBe(1);
    expect(map.cover.every((value) => value === 0)).toBe(true);
    expect(arenaFromSecondMap(source, { x: 64, y: 64 }, 32).cover[(80 - 64) * 32 + (80 - 64)]).toBe(1);
    // 높이: 배치 칸 x 48·49는 지형 칸 24 → 꼭짓점 24·25 평균(1245cm) × 16 − 최저점
    expect(map.height[0]).toBe(0);
    expect(map.height[2]).toBe(10 * 16);
    expect(() => createBattleMap(map)).not.toThrow();
  });

  it("2차맵 밖 구역은 거절한다", () => {
    expect(() => arenaFromSecondMap(layers(), { x: 100, y: 0 }, 32)).toThrow(RangeError);
  });
});
