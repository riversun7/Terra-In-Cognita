// 낚시터 물 종류와 티어 범위(기획 D-542 질문 1365 나) — 칸 물 종류(수심 등급·바이옴·물 비트), 여러 칸 고르기, 범위 접기
import { describe, expect, it } from "vitest";
import {
  FISH_WATERS,
  type FishTierRanges,
  fishTierRangeOf,
  fishWaterCellOf,
  fishWaterOfLand,
  fishWaterRangeViews,
  foldFishTier,
  foldTierPm,
  isShoreLand,
  normalizeFishRange,
  spotFishWater,
} from "./fishWater.ts";

/** 바다 칸 물 비트(바다 1 + 수심 등급 << 4) */
const sea = (depth: number) => 1 | (depth << 4);

const RANGES: FishTierRanges = {
  fresh: { min: 0, max: 2 },
  coast: { min: 0, max: 4 },
  shelf: { min: 2, max: 6 },
  deep: { min: 4, max: 8 },
};

describe("칸 하나의 물 종류", () => {
  it("바다 칸은 수심 등급(연안 1·대륙붕 2·심해 3), 등급이 없으면 바이옴", () => {
    expect(fishWaterOfLand({ water: sea(1) })).toBe("coast");
    expect(fishWaterOfLand({ water: sea(2), biomeId: "ocean_deep" })).toBe("shelf");
    expect(fishWaterOfLand({ water: sea(3) })).toBe("deep");
    expect(fishWaterOfLand({ water: 1, biomeId: "ocean_deep" })).toBe("deep");
    expect(fishWaterOfLand({ water: 1, biomeId: "ocean_shelf" })).toBe("shelf");
    expect(fishWaterOfLand({ water: 1 })).toBe("coast");
  });

  it("땅 칸: 해안 비트면 연안, 강·호수 비트면 민물, 호수·습지 바이옴이면 민물, 물이 없으면 없음", () => {
    expect(fishWaterOfLand({ water: 8, biomeId: "grassland" })).toBe("coast");
    expect(fishWaterOfLand({ water: 8 | 4, biomeId: "grassland" })).toBe("coast");
    expect(fishWaterOfLand({ water: 4, biomeId: "temperate_forest" })).toBe("fresh");
    expect(fishWaterOfLand({ water: 2, biomeId: "lake" })).toBe("fresh");
    expect(fishWaterOfLand({ water: 0, biomeId: "wetland" })).toBe("fresh");
    expect(fishWaterOfLand({ water: 0, biomeId: "grassland" })).toBeUndefined();
    expect(fishWaterOfLand(undefined)).toBeUndefined();
  });

  it("낚시터가 설 땅 = 바다·호수에 잠기지 않은 칸", () => {
    expect(isShoreLand({ water: 8, biomeId: "grassland" })).toBe(true);
    expect(isShoreLand({ water: 4 })).toBe(true);
    expect(isShoreLand({ water: sea(2) })).toBe(false);
    expect(isShoreLand({ water: 2, biomeId: "lake" })).toBe(false);
    expect(isShoreLand({ water: 0, biomeId: "ocean_coastal" })).toBe(false);
    expect(isShoreLand(undefined)).toBe(false);
  });
});

describe("여러 칸에서 하나 고르기", () => {
  it("땅 칸의 물 종류가 먼저다 — 바다 칸이 더 많아도 해안 땅이면 연안", () => {
    const cells = [
      fishWaterCellOf({ water: 8, biomeId: "grassland" }),
      fishWaterCellOf({ water: sea(2) }),
      fishWaterCellOf({ water: sea(3) }),
      fishWaterCellOf({ water: sea(3) }),
    ];
    expect(spotFishWater(cells)).toBe("coast");
  });

  it("가장 많은 종류, 같으면 더 깊은 쪽", () => {
    const fresh = fishWaterCellOf({ water: 4 });
    const coast = fishWaterCellOf({ water: 8 });
    expect(spotFishWater([fresh, fresh, coast])).toBe("fresh");
    expect(spotFishWater([fresh, coast])).toBe("coast");
  });

  it("땅 칸이 없으면 모든 칸(바다·호수), 물이 하나도 없으면 undefined", () => {
    expect(spotFishWater([fishWaterCellOf({ water: sea(2) }), fishWaterCellOf({ water: 0 })])).toBe("shelf");
    expect(spotFishWater([fishWaterCellOf({ water: 0, biomeId: "desert" })])).toBeUndefined();
    expect(spotFishWater([])).toBeUndefined();
  });
});

describe("티어 범위 접기", () => {
  it("물 종류의 범위(모르면 undefined), 어긋난 설정 칸은 다듬는다", () => {
    expect(fishTierRangeOf(RANGES, "shelf")).toEqual({ min: 2, max: 6 });
    expect(fishTierRangeOf(RANGES, undefined)).toBeUndefined();
    expect(normalizeFishRange({ min: 7, max: 3 })).toEqual({ min: 7, max: 7 });
    expect(normalizeFishRange({ min: -2, max: 20 })).toEqual({ min: 0, max: 9 });
    expect(fishWaterRangeViews(RANGES).map((view) => view.water)).toEqual([...FISH_WATERS]);
  });

  it("티어 하나와 확률표(합은 그대로)", () => {
    expect(foldFishTier(0, { min: 2, max: 6 })).toBe(2);
    expect(foldFishTier(9, { min: 2, max: 6 })).toBe(6);
    expect(foldFishTier(4, { min: 2, max: 6 })).toBe(4);
    expect(foldFishTier(9, undefined)).toBe(9);
    const pm = [400, 300, 150, 100, 50, 0, 0, 0, 0, 0];
    expect(foldTierPm(pm, { min: 0, max: 2 })).toEqual([400, 300, 300, 0, 0, 0, 0, 0, 0, 0]);
    expect(foldTierPm(pm, { min: 4, max: 8 })).toEqual([0, 0, 0, 0, 1000, 0, 0, 0, 0, 0]);
    expect(foldTierPm(pm, undefined)).toEqual(pm);
  });
});
