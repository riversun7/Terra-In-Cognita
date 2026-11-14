// 도시 건물 배치 땅의 원자재 오브젝트 시험(질문 1230 가) — 채집과 같은 바이옴·물 비트를 넘겨 지형별 자리(site)도 본다
import { TERRAIN_SURFACE, encodeTerrain } from "@terra/protocol";
import { START_WORLD_SEED } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { GatherKind } from "../gather/kinds.ts";
import { layoutObjectsOf } from "./cityLayoutGround.ts";

const site: GatherKind = {
  id: "sandstone",
  name: { ko: "사암", en: "Sandstone" },
  source: "site",
  arts: [],
  chancePm: 0,
  art: 30,
  surfaces: [TERRAIN_SURFACE.sand],
  minCells: 0,
  material: null,
  biomes: new Map([["desert", 1000]]),
  direct: true,
  item: "stone",
  lots: 1,
  workMs: 20_000,
  uses: 5,
  regrowMs: 1_800_000,
  facility: "mine",
  primary: "str",
  secondary: "vit",
};

/** 모두 모래인 2차맵(지형 128, 배치 256) */
function sandMap() {
  const terrainSize = 128;
  const file = encodeTerrain({
    mapKey: 91,
    generatorVersion: 1,
    seed: 3,
    hash: 0,
    terrainSize,
    heights: new Int32Array((terrainSize + 1) ** 2),
    surface: new Uint8Array(terrainSize * terrainSize).fill(TERRAIN_SURFACE.sand),
    cover: new Uint8Array(256 * 256),
    placementSize: 256,
  });
  const raw = Buffer.from(file);
  return { mapKey: 91, terrainFile: () => ({ raw, gzip: raw }) };
}

describe("도시 배치 땅의 원자재 오브젝트(1230 가)", () => {
  it("땅 값의 바이옴이 사막이면 사막 지형별 자리가 서고, 다른 바이옴·모르는 땅이면 없다", () => {
    const land = { elevationM: 20, temperatureC: 30, precipitationMm: 50, forest: 0 };
    const desert = layoutObjectsOf(sandMap(), [site], { ...land, biomeId: "desert" }, START_WORLD_SEED);
    expect(desert.length).toBeGreaterThan(0);
    expect(desert.every((object) => object.kind === 0)).toBe(true);
    expect(layoutObjectsOf(sandMap(), [site], { ...land, biomeId: "taiga" }, START_WORLD_SEED)).toHaveLength(
      0,
    );
    expect(layoutObjectsOf(sandMap(), [site], undefined, START_WORLD_SEED)).toHaveLength(0);
  });
});
