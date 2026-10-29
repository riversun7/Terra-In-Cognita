import { WATER_COAST, WATER_DEPTH_SHIFT, WATER_LAKE, WATER_OCEAN, WATER_RIVER } from "@terra/planet";
import { decodePlanetTile, encodePlanetTile } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import { type DecodedTile, WATER_BITS, waterDepthClass } from "./planetTypes.ts";
import { EARTH_RADIUS_M, makeTile } from "./testSupport.ts";
import { createTileBuilder } from "./tileBuilder.ts";
import { buildTileMesh } from "./tileMesh.ts";

describe("타일 메시 맡기기", () => {
  it("워커가 없으면(시험·옛 브라우저) 화면 스레드에서 같은 메시를 만들고, 받은 타일을 그대로 돌려준다", async () => {
    const builder = createTileBuilder();
    const tile = makeTile(1, 8, 64, 32, 32);
    const built = await builder.build(tile, EARTH_RADIUS_M);
    expect(builder.source()).toBe("main");
    expect(built.tile).toBe(tile);
    expect(built.mesh.positions.length).toBe((33 * 33 + 4 * 33) * 3);
    builder.dispose();
    await expect(builder.build(tile, EARTH_RADIUS_M)).rejects.toThrow(/disposed/);
  });

  it("모양이 틀린 타일은 거절한다", async () => {
    const builder = createTileBuilder();
    const tile = { ...makeTile(1, 8, 64, 32, 32), water: new Uint8Array(3) };
    await expect(builder.build(tile, EARTH_RADIUS_M)).rejects.toThrow(/water/);
    builder.dispose();
  });

  it("서버 이진은 protocol 해석기로 풀어 만든다: 푼 타일을 그대로 쓰고, 메시는 풀어 둔 타일과 같다", async () => {
    const builder = createTileBuilder();
    const tile = makeTile(4, 9, 96, 160, 32);
    const bytes = encodePlanetTile({ ...tile, generatorVersion: 3, definitionHash: "0f".repeat(32) });
    const built = await builder.build(
      { kind: "encoded", bytes: Uint8Array.from(bytes).buffer },
      EARTH_RADIUS_M,
    );
    // 해석기 결과(PlanetTileData)가 바꾸지 않고 DecodedTile로 들어간다
    const decoded: DecodedTile = decodePlanetTile(bytes);
    expect(built.tile).toEqual(decoded);
    expect(built.tile).toMatchObject({ generatorVersion: 3, definitionHash: "0f".repeat(32) });
    expect(built.mesh).toEqual(buildTileMesh(tile, EARTH_RADIUS_M));
    await expect(
      builder.build({ kind: "encoded", bytes: new Uint8Array(10).buffer }, EARTH_RADIUS_M),
    ).rejects.toThrow(/too short/);
    builder.dispose();
  });
});

describe("물 비트", () => {
  it("엔진의 이름 붙인 물 비트·수심 등급은 @terra/planet 정의와 같다", () => {
    expect(WATER_BITS).toEqual({
      ocean: WATER_OCEAN,
      lake: WATER_LAKE,
      river: WATER_RIVER,
      coast: WATER_COAST,
    });
    expect(waterDepthClass(WATER_OCEAN | (3 << WATER_DEPTH_SHIFT) | WATER_COAST)).toBe(3);
    expect(waterDepthClass(WATER_LAKE | WATER_RIVER)).toBe(0);
  });
});
