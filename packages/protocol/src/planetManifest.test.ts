// 행성 목록 정보 스키마 시험
import { describe, expect, it } from "vitest";
import { type PlanetManifest, canReadPlanetTiles, planetManifestSchema } from "./planetManifest.ts";
import { PLANET_TILE_FORMAT_VERSION, planetTileUrlTemplate, planetTileVersion } from "./planetTile.ts";

const HASH = "fe".repeat(32);

function manifest(): PlanetManifest {
  return {
    id: "s2_synthetic",
    name: { ko: "S2 합성 행성", en: "S2 synthetic planet" },
    faceLevel: 9,
    radiusM: 530_917.4,
    generatorVersion: 1,
    definitionHash: HASH,
    status: "ready",
    tileFormatVersion: PLANET_TILE_FORMAT_VERSION,
    tileUrlTemplate: planetTileUrlTemplate("s2_synthetic", planetTileVersion(1, HASH)),
    biomes: [
      { index: 0, id: "ice_sheet", colour: "#eef6ff", name: { ko: "빙상", en: "Ice sheet" } },
      { index: 12, id: "ocean_deep", colour: "#1b3a6b", name: { ko: "심해", en: "Deep ocean" } },
    ],
  };
}

describe("행성 목록 정보", () => {
  it("맞는 값은 그대로 통과하고, 모르는 필드는 버린다(새 서버 + 옛 기기)", () => {
    expect(planetManifestSchema.parse(manifest())).toEqual(manifest());
    expect(planetManifestSchema.parse({ ...manifest(), futureField: 1 })).toEqual(manifest());
    expect(planetManifestSchema.parse({ ...manifest(), status: "generating" }).status).toBe("generating");
  });

  it.each([
    ["ID 형식", { id: "S2 Planet" }],
    ["이름 영어 빠짐", { name: { ko: "행성" } }],
    ["면 레벨 범위", { faceLevel: 15 }],
    ["반지름", { radiusM: 0 }],
    ["생성기 버전", { generatorVersion: 1.5 }],
    ["정의 해시", { definitionHash: "FE".repeat(32) }],
    ["상태", { status: "failed" }],
    ["형식 버전", { tileFormatVersion: 0 }],
    ["주소 틀에 {tileKey}가 없음", { tileUrlTemplate: "/api/planets/x/tiles/1" }],
    ["다른 출처 주소 틀", { tileUrlTemplate: "//evil.example/{tileKey}" }],
    ["바이옴 색", { biomes: [{ index: 0, id: "ice", colour: "#FFF", name: { ko: "a", en: "b" } }] }],
    [
      "바이옴 번호 겹침",
      {
        biomes: [
          { index: 1, id: "a1", colour: "#000000", name: { ko: "a", en: "a" } },
          { index: 1, id: "b1", colour: "#000000", name: { ko: "b", en: "b" } },
        ],
      },
    ],
    [
      "바이옴 ID 겹침",
      {
        biomes: [
          { index: 1, id: "a1", colour: "#000000", name: { ko: "a", en: "a" } },
          { index: 2, id: "a1", colour: "#000000", name: { ko: "b", en: "b" } },
        ],
      },
    ],
  ])("%s → 거절", (_name, patch) => {
    expect(planetManifestSchema.safeParse({ ...manifest(), ...patch }).success).toBe(false);
  });

  it("가장 높은 땅(maxElevationM)은 선택이고, 있으면 0 이상 정수다", () => {
    expect(planetManifestSchema.parse({ ...manifest(), maxElevationM: 830 }).maxElevationM).toBe(830);
    expect(planetManifestSchema.parse(manifest()).maxElevationM).toBeUndefined();
    for (const maxElevationM of [-1, 1.5, 40_000]) {
      expect(
        planetManifestSchema.safeParse({ ...manifest(), maxElevationM }).success,
        `${maxElevationM}`,
      ).toBe(false);
    }
  });

  it("기기가 아는 타일 형식 버전이어야 타일을 읽는다", () => {
    expect(canReadPlanetTiles(manifest())).toBe(true);
    expect(canReadPlanetTiles({ tileFormatVersion: PLANET_TILE_FORMAT_VERSION + 1 })).toBe(false);
  });
});
