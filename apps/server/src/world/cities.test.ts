import { describe, expect, it } from "vitest";
import { type CityRow, nearestSafeCity } from "./cities.ts";

const city = (id: number, factionId: number, cellX: number, cellY: number, start = false): CityRow => ({
  id,
  factionId,
  planetId: "p",
  mapKey: 1,
  cellX,
  cellY,
  start,
});

describe("가장 가까운 안전 도시", () => {
  it("같은 2차맵의 자기 세력 도시나 시작 도시 가운데 가장 가까운 것, 같으면 작은 ID", () => {
    const cities = [city(1, 9, 128, 128, true), city(2, 5, 10, 10), city(3, 6, 12, 12), city(4, 5, 250, 250)];
    expect(nearestSafeCity(cities, "p", 1, { x: 15, y: 15 }, 5)?.id).toBe(2);
    // 남의 세력 도시(3)는 안전하지 않다 → 시작 도시
    expect(nearestSafeCity(cities, "p", 1, { x: 15, y: 15 }, null)?.id).toBe(1);
    expect(nearestSafeCity(cities, "p", 2, { x: 15, y: 15 }, 5)).toBeUndefined();
    expect(nearestSafeCity([city(7, 5, 0, 10), city(6, 5, 10, 0)], "p", 1, { x: 0, y: 0 }, 5)?.id).toBe(6);
  });
});
