// 미리보기 타일 원천 시험 — 워커 핵심이 만든 결과(면 레벨 6)의 모든 타일이 서버 굽기와 같은 코드(buildPlanetTiles) 결과와 같다.
// 틀린 요청(없는 레벨·크기·첫 칸, 멈춘 받기)은 거절한다. 행성 설명(면 레벨·반지름·바이옴 색·가장 높은 땅)
import type { TileRequest } from "@terra/engine/planet";
import { buildPlanetTiles, planetTileCount } from "@terra/planet";
import { planetInputFromDefinition } from "@terra/planet/generator";
import { planetRadiusMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import type { PreviewResultData } from "./previewProtocol.ts";
import { biomeColoursOf, parseColour, previewPlanetDescription, previewTileSource } from "./previewTiles.ts";
import { runPreviewJob } from "./previewWork.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const LEVEL = 6;
const SLOW = 60_000;
let made: PreviewResultData | null = null;

/** 면 레벨 6 결과(한 번 만든다) */
function preview(): PreviewResultData {
  if (made) return made;
  const input = planetInputFromDefinition(TEST_PLANET, PACK_BIOMES, LEVEL);
  const { reply } = runPreviewJob({ kind: "generate", id: 1, key: "k", input });
  if (reply.kind !== "result") throw new Error("preview job failed");
  made = reply.result;
  return made;
}

const live = (): AbortSignal => new AbortController().signal;

describe("미리보기 타일 원천", () => {
  it(
    "모든 타일이 buildPlanetTiles(서버 굽기와 같은 코드) 결과와 같다",
    async () => {
      const result = preview();
      const source = previewTileSource(result);
      const expected = [...buildPlanetTiles(result.fields)];
      const tiles = await Promise.all(
        expected.map(({ id }) => {
          const request: TileRequest = {
            face: id.face,
            mapLevel: id.mapLevel,
            i0: id.i0,
            j0: id.j0,
            size: id.size,
          };
          return source(request, live());
        }),
      );
      expect(tiles).toEqual(expected.map(({ tile }) => tile));
      expect(tiles).toHaveLength(planetTileCount(LEVEL));
    },
    SLOW,
  );

  it(
    "이 결과의 타일이 아닌 요청과 멈춘 받기는 거절한다",
    async () => {
      const source = previewTileSource(preview());
      await expect(source({ face: 0, mapLevel: LEVEL + 1, i0: 0, j0: 0, size: 32 }, live())).rejects.toThrow(
        RangeError,
      );
      await expect(source({ face: 0, mapLevel: LEVEL, i0: 0, j0: 0, size: 16 }, live())).rejects.toThrow(
        RangeError,
      );
      await expect(source({ face: 0, mapLevel: LEVEL, i0: 5, j0: 0, size: 32 }, live())).rejects.toThrow(
        RangeError,
      );
      const controller = new AbortController();
      controller.abort();
      await expect(
        source({ face: 0, mapLevel: LEVEL, i0: 0, j0: 0, size: 32 }, controller.signal),
      ).rejects.toThrow("aborted");
    },
    SLOW,
  );

  it("행성 설명: 면 레벨 = 미리보기, 반지름 = 정의 면 레벨, 가장 높은 땅 ≥ 0", () => {
    const result = preview();
    const colours = biomeColoursOf(TEST_PLANET, PACK_BIOMES);
    const description = previewPlanetDescription(result, 9, colours);
    expect(description).toEqual({
      faceLevel: LEVEL,
      radiusM: planetRadiusMeters(9),
      biomeColors: colours,
      maxElevationM: Math.max(0, result.maxElevationM),
    });
    expect(previewPlanetDescription({ ...result, maxElevationM: -3 }, 9, []).maxElevationM).toBe(0);
  });
});

describe("바이옴 색", () => {
  it("행성 biomes 순서(= 결과 바이옴 번호)대로 팩의 color", () => {
    const colours = biomeColoursOf(TEST_PLANET, PACK_BIOMES);
    const refs = TEST_PLANET.biomes;
    expect(Array.isArray(refs) ? refs.length : 0).toBe(colours.length);
    expect(colours.every((colour) => Number.isInteger(colour) && colour >= 0 && colour <= 0xffffff)).toBe(
      true,
    );
  });

  it("참조 객체({ id })도 받고, 모르는 바이옴·틀린 색은 비워 둔다", () => {
    const biomes = [
      { id: "a", color: "#102030" },
      { id: "b", color: "red" },
    ];
    const colours = biomeColoursOf({ biomes: [{ id: "a" }, "b", "missing", "a"] }, biomes);
    expect(colours[0]).toBe(0x102030);
    expect(colours[1]).toBeUndefined();
    expect(colours[2]).toBeUndefined();
    expect(colours[3]).toBe(0x102030);
    expect(biomeColoursOf({}, biomes)).toEqual([]);
  });

  it("색 글자", () => {
    expect(parseColour("#1c3d6e")).toBe(0x1c3d6e);
    expect(parseColour("#ABCDEF")).toBe(0xabcdef);
    expect(parseColour("#12345")).toBeNull();
    expect(parseColour(0x123456)).toBeNull();
  });
});
