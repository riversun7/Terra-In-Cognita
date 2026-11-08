// 이웃 2차맵 지형: 놓는 자리(돌림·옮김), 이웃 위 땅 높이, 덮는 범위, 같은 이름은 다시 만들지 않는다
import { describe, expect, it } from "vitest";
import { type NeighbourPlacement, NeighbourTerrains, toLocal } from "./neighbourTerrains.ts";
import type { TerrainBuilder } from "./terrainBuilder.ts";
import { TERRAIN_CELLS, TERRAIN_VERTICES, type TerrainInput } from "./terrainData.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";
import { TerrainView } from "./terrainView.ts";
import { invertPlacement } from "./rebase.ts";

function flat(heightUnits: number): TerrainInput {
  return {
    heights: new Int16Array(TERRAIN_VERTICES * TERRAIN_VERTICES).fill(heightUnits),
    surface: new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS).fill(1),
    baseHeightM: 0,
    cellSizeM: 12,
    waterLevelM: 0,
  };
}

function countingBuilder(): TerrainBuilder & { builds: number } {
  const builder = {
    builds: 0,
    build: (terrain: TerrainInput) => {
      builder.builds += 1;
      return Promise.resolve({
        mesh: buildTerrainMesh(terrain),
        noise: new Uint8Array(256 * 256 * 4),
        source: "main" as const,
        buildMs: 0,
      });
    },
    dispose: () => undefined,
  };
  return builder;
}

/** 오른쪽 이웃(돌림 없음): x = c + 128 */
const RIGHT: NeighbourPlacement = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
/** 아래 이웃, 90° 돌림: x = 128 − r, z = c + 128 */
const BELOW_TURNED: NeighbourPlacement = { a: 0, b: -1, cc: 1, d: 0, tx: 128, tz: 128 };

describe("이웃 2차맵 지형", () => {
  it("자리 역변환: 놓은 자리의 좌표가 이웃 칸 좌표로 돌아온다", () => {
    expect(toLocal(RIGHT, 130, 5)).toEqual({ c: 2, r: 5 });
    // 이웃 칸 (c 3, r 10) → (128 − 10, 3 + 128) = (118, 131)
    expect(toLocal(BELOW_TURNED, 118, 131)).toEqual({ c: 3, r: 10 });
  });

  it("이웃 위 높이와 덮는 범위, 칸 크기는 지금 2차맵 값", async () => {
    const builder = countingBuilder();
    const neighbours = new NeighbourTerrains(builder);
    await neighbours.set(
      [
        { id: "right", terrain: { ...flat(50), cellSizeM: 99 }, placement: RIGHT },
        { id: "below", terrain: flat(70), placement: BELOW_TURNED },
      ],
      12,
    );
    expect(neighbours.count).toBe(2);
    expect(neighbours.heightAt(130 * 12, 5 * 12)).toBeCloseTo(5);
    expect(neighbours.heightAt(100 * 12, 140 * 12)).toBeCloseTo(7);
    expect(neighbours.heightAt(-50, -50)).toBeNull();
    expect(neighbours.bounds(128 * 12)).toEqual({ minX: 0, maxX: 256 * 12, minZ: 0, maxZ: 256 * 12 });
    // 같은 이름은 다시 만들지 않고, 빠진 것은 버린다
    await neighbours.set([{ id: "right", terrain: flat(50), placement: RIGHT }], 12);
    expect(builder.builds).toBe(2);
    expect(neighbours.count).toBe(1);
    neighbours.dispose();
    expect(neighbours.count).toBe(0);
  });

  it("넘기(WP-3): 이웃을 꺼내고 남은 이웃을 새 틀로 옮기고 옛 지금 2차맵을 들인다 — 다시 만들지 않는다", async () => {
    const builder = countingBuilder();
    const neighbours = new NeighbourTerrains(builder);
    await neighbours.set(
      [
        { id: "right", terrain: flat(50), placement: RIGHT },
        { id: "below", terrain: flat(70), placement: BELOW_TURNED },
      ],
      12,
    );
    neighbours.setExplored("right", new Uint8Array(128).fill(255));
    const taken = neighbours.take("right");
    expect(taken?.placement).toEqual(RIGHT);
    expect(taken?.explored?.[0]).toBe(255);
    expect(neighbours.take("right")).toBeNull();
    // 새 틀 = 오른쪽 이웃: 옛 지금 2차맵은 왼쪽(x −128), 아래 이웃도 128 왼쪽으로
    const back = invertPlacement(RIGHT);
    neighbours.reframe(back);
    neighbours.adopt("old", new TerrainView(), flat(30), back, null);
    expect(neighbours.count).toBe(2);
    expect(neighbours.heightAt(-10 * 12, 5 * 12)).toBeCloseTo(3);
    expect(neighbours.heightAt((100 - 128) * 12, 140 * 12)).toBeCloseTo(7);
    expect(builder.builds).toBe(2);
    taken?.view.dispose();
    neighbours.dispose();
  });
});
