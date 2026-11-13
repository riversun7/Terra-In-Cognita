// 소품 모델 시야 필터 시험: 탐사 비트가 있으면 탐사된 시야 칸 안의 나무·잔소품만 세운다
import { MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { PLACEMENT_CELLS, TERRAIN_CELLS } from "../terrain/terrainData.ts";
import { PropView } from "./propView.ts";

function makeArea(x: number, z: number, halfSpan: number) {
  return {
    polygon: [
      { x: x - halfSpan, z: z - halfSpan },
      { x: x + halfSpan, z: z - halfSpan },
      { x: x + halfSpan, z: z + halfSpan },
      { x: x - halfSpan, z: z + halfSpan },
    ],
    nearX: x,
    nearZ: z,
  };
}

describe("PropView 시야 가시성", () => {
  it("탐사 비트가 주어지면 탐사된 시야 칸 안의 소품만 세우고 미탐사 칸은 건너뛴다", () => {
    const view = new PropView();
    const cellM = 5;
    const boulderArt = MAP_PROP_ARTS.indexOf("boulder");
    expect(boulderArt).toBeGreaterThan(0);
    const art = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
    const cover = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
    const surface = new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS);
    // 시야 칸 (0, 0) 안 배치 칸 (2, 2)와 시야 칸 (4, 0) 안 배치 칸 (34, 2)에 바위 놓기
    art[2 * PLACEMENT_CELLS + 2] = boulderArt;
    cover[2 * PLACEMENT_CELLS + 2] = 2;
    art[2 * PLACEMENT_CELLS + 34] = boulderArt;
    cover[2 * PLACEMENT_CELLS + 34] = 2;

    const area = makeArea(100, 10, 120);
    // 안개 없음 -> 둘 다 세운다
    view.setSources([{ art, cover, surface, placement: null, salt: 1, explored: null }], cellM, () => 0);
    expect(view.update(200, area)).toBe(true);
    expect(view.drawn).toBe(2);

    // 시야 칸 (0, 0)만 탐사(비트 0 = 1) -> 배치 칸 (2, 2) 1개만 세운다
    const explored = new Uint8Array(128);
    explored[0] = 1;
    view.setSources([{ art, cover, surface, placement: null, salt: 1, explored }], cellM, () => 0);
    expect(view.update(200, area)).toBe(true);
    expect(view.drawn).toBe(1);

    // 모두 미탐사 -> 0개
    view.setSources(
      [{ art, cover, surface, placement: null, salt: 1, explored: new Uint8Array(128) }],
      cellM,
      () => 0,
    );
    expect(view.update(200, area)).toBe(true);
    expect(view.drawn).toBe(0);
    view.dispose();
  });
});
