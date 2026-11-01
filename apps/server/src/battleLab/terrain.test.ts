import { createBattleMap, generateTempTerrain, seedFromCellKey } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { ARENA_SIZE } from "./arena.ts";
import { arenaMapFromLayers, createArenaTerrains } from "./terrain.ts";

const layers = () => generateTempTerrain(seedFromCellKey(123_456));

describe("전투장 지형(시험 2차맵에서 자름)", () => {
  it("48칸 창: 전투맵 검사를 지나고, 높이는 창의 최저점이 0, 같은 지형이면 같은 결과", () => {
    const map = arenaMapFromLayers(layers());
    expect(map.size).toBe(ARENA_SIZE);
    expect(() => createBattleMap(map)).not.toThrow();
    expect(Math.min(...map.height)).toBe(0);
    let open = 0;
    for (const value of map.passable) open += value;
    // 통과 몫이 가장 큰 창을 고른다
    expect(open / map.passable.length).toBeGreaterThan(0.5);
    expect(arenaMapFromLayers(layers())).toEqual(map);
  });

  it("엄폐 층이 있으면 그대로 옮기고 차폐는 막힘", () => {
    const base = layers();
    const cover = new Uint8Array(256 * 256).fill(1);
    cover[0] = 2;
    const map = arenaMapFromLayers({ ...base, cover });
    expect(map.cover.every((value) => value === 1 || value === 2)).toBe(true);
  });

  it("목록: 지형 서비스가 없으면 평지·시험 2차맵만, 있으면 시험 자리 종류도. 모르는 ID는 null", async () => {
    const plain = createArenaTerrains({ test: () => Promise.resolve({ layers: layers() }) });
    expect(plain.list().map((entry) => entry.id)).toEqual(["flat", "test"]);
    expect(await plain.map("preset_river")).toBeNull();
    expect(await plain.map("nope")).toBeNull();
    expect((await plain.map("flat"))?.map.passable.every((value) => value === 1)).toBe(true);
    expect((await plain.map("test"))?.ref).toBeNull();
    const withPresets = createArenaTerrains({
      test: () => Promise.resolve({ layers: layers(), source: { mapKey: 77, terrainVersion: "v1" } }),
      preset: (preset) => Promise.resolve(preset === "lake" ? null : { layers: layers() }),
    });
    expect(withPresets.list()).toContainEqual({ id: "preset_forest", kind: "preset", preset: "forest" });
    expect(await withPresets.map("preset_lake")).toBeNull();
    expect((await withPresets.map("preset_forest"))?.map.size).toBe(ARENA_SIZE);
    // 2차맵 구역이면 3D 관람 참조(키·판 표지·창 원점)
    const test = await withPresets.map("test");
    expect(test?.ref).toMatchObject({ mapKey: 77, terrainVersion: "v1" });
    expect((test?.ref?.originX ?? -1) % 8).toBe(0);
  });
});
