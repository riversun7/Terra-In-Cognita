// 지형 오브젝트 3D 미리 보기 순수 계산 시험 — 모든 쓸 수 있는 그림(어군 포함)의 부품·경계 상자·통계·바탕 고르기
import { MAP_PROP_ARTS, RETIRED_MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { collectPropParts, defaultGroundForArt } from "./propPreview.ts";

describe("지형 오브젝트 3D 미리 보기", () => {
  it("쓸 수 있는 모든 소품 그림과 어군이 유효한 부품·경계·통계를 만든다", () => {
    for (let code = 1; code < MAP_PROP_ARTS.length; code++) {
      const art = MAP_PROP_ARTS[code];
      if (!art || RETIRED_MAP_PROP_ARTS.includes(art)) continue;
      const built = collectPropParts(art, { seed: 0, snowy: false });
      expect(built.parts.length, art).toBeGreaterThan(0);
      expect(built.stats.triangles, art).toBeGreaterThan(0);
      expect(built.stats.widthM, art).toBeGreaterThan(0);
      expect(built.stats.depthM, art).toBeGreaterThan(0);
      expect(built.stats.heightM, art).toBeGreaterThan(0);
      for (const value of Object.values(built.bounds)) {
        expect(Number.isFinite(value), `${art} bounds`).toBe(true);
      }
    }
  });

  it("어군(fish_school·fish_school_big·whale_pod)은 물 위 fish 부품 무리로 짓는다", () => {
    const small = collectPropParts("fish_school");
    const big = collectPropParts("fish_school_big");
    const whale = collectPropParts("whale_pod");
    expect(small.isWater).toBe(true);
    expect(small.parts.every((item) => item.part === "fish")).toBe(true);
    expect(small.parts).toHaveLength(9);
    expect(big.parts).toHaveLength(12);
    expect(whale.parts).toHaveLength(3);
    expect(whale.stats.widthM).toBeGreaterThan(small.stats.widthM);
  });

  it("모르는 그림·none은 빈 부품 목록을 안전하게 돌려준다", () => {
    expect(collectPropParts("none").parts).toHaveLength(0);
    expect(collectPropParts("unknown_art").parts).toHaveLength(0);
  });

  it("바탕 종류는 물 위 소품·어군이면 water, 그 밖은 바이옴 성격을 따른다", () => {
    expect(defaultGroundForArt("iceberg", "desert")).toBe("water");
    expect(defaultGroundForArt("whale_pod", "desert")).toBe("water");
    expect(defaultGroundForArt("cactus", "desert")).toBe("sand");
    expect(defaultGroundForArt("snowdrift", "ice_sheet")).toBe("snow");
    expect(defaultGroundForArt("rock_spire", "alpine")).toBe("rock");
    expect(defaultGroundForArt("mud_pool", "wetland")).toBe("swamp");
    expect(defaultGroundForArt("tree_broadleaf", "temperate_forest")).toBe("grass");
  });
});
