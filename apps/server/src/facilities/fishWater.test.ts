// 플레이어 낚시터 물 종류(기획 D-542 질문 1365 나) — 건물이 선 2차맵 칸, 물 표시가 없으면 둘레 한 칸, 그래도 없으면 민물, 행성 값이 없으면 모름
import { cellKey, decodeCellKey } from "@terra/planet";
import type { FishWaterLand } from "@terra/shared/fishWater";
import { describe, expect, it } from "vitest";
import { spotWaterOfMap } from "./fishWater.ts";

const LEVEL = 9;
const center = cellKey(0, LEVEL, 20, 20);
/** (i, j)로 칸 값 표 */
const lands = (rows: ReadonlyMap<string, FishWaterLand>, fallback?: FishWaterLand) => (key: number) => {
  const { i, j } = decodeCellKey(key);
  return rows.get(`${String(i)},${String(j)}`) ?? fallback;
};

describe("플레이어 낚시터 물 종류", () => {
  it("그 칸에 물 표시가 있으면 그 칸 — 해안 땅은 연안, 강가는 민물, 섬(대륙붕 바다 바이옴)은 대륙붕", () => {
    expect(spotWaterOfMap(center, () => ({ water: 8, biomeId: "grassland" }))).toBe("coast");
    expect(spotWaterOfMap(center, () => ({ water: 4, biomeId: "grassland" }))).toBe("fresh");
    expect(spotWaterOfMap(center, () => ({ water: 0, biomeId: "ocean_shelf" }))).toBe("shelf");
  });

  it("물 표시가 없으면 둘레 한 칸의 땅 칸 다수결, 둘레에도 없으면 민물", () => {
    const coastNeighbour = new Map<string, FishWaterLand>([
      ["21,20", { water: 8, biomeId: "grassland" }],
      ["22,20", { water: 1 | (3 << 4) }],
    ]);
    expect(spotWaterOfMap(center, lands(coastNeighbour, { water: 0, biomeId: "grassland" }))).toBe("coast");
    expect(spotWaterOfMap(center, () => ({ water: 0, biomeId: "grassland" }))).toBe("fresh");
  });

  it("행성 값이 없으면 모름(접지 않는다)", () => {
    expect(spotWaterOfMap(center, () => undefined)).toBeUndefined();
  });
});
