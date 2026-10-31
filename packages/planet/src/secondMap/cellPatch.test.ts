import { describe, expect, it } from "vitest";
import { cellKey } from "../cellKey.ts";
import { planetCornerHeights } from "../tiles/cornerHeights.ts";
import { NET_SCALE, bernsteinTable, controlNet, netSum, netValue } from "./cellPatch.ts";
import { mapCoords, neighbourhood } from "./layout.ts";
import { testPlanetValues } from "./testPlanetValues.ts";

describe("칸 값 → 2차 조각", () => {
  const values = testPlanetValues(5);
  const n = 32;
  const level = {
    level: 5,
    n,
    elevationM: values.elevationM,
    biome: values.biome,
    temperatureC: values.temperatureC,
    humidity: values.humidity,
    forest: values.forest,
    water: values.water,
    river: values.river,
  };
  const corners = planetCornerHeights(level);
  const table = bernsteinTable(7);

  it("2차맵 꼭짓점의 값은 1차맵 타일의 꼭짓점 높이(둘레 칸 평균)와 같다(반올림 차이 1m 안)", () => {
    for (const [face, i, j] of [
      [0, 3, 4],
      [2, 0, 0],
      [5, 31, 17],
      [3, 31, 31],
    ] as const) {
      const map = mapCoords(cellKey(face, 5, i, j));
      const net = controlNet(neighbourhood(map), (cell) => (values.elevationM[cell] ?? 0) * 100);
      // 칸 (i, j)의 (I, J) 작은 쪽 꼭짓점 = 1차맵 꼭짓점 (i, j)
      const atCorner = netValue(netSum(net, table, 0, 0), 7);
      const tile = (corners[face * 33 * 33 + j * 33 + i] ?? 0) * 100;
      expect(Math.abs(atCorner - tile)).toBeLessThanOrEqual(100);
    }
  });

  it("고른 값은 어디서나 그 값, 가운데 꼭짓점 무게는 그 칸이 가장 크다", () => {
    const flat = controlNet(neighbourhood(mapCoords(cellKey(1, 5, 9, 9))), () => 7);
    for (const [x, y] of [
      [0, 0],
      [64, 64],
      [128, 17],
    ] as const) {
      expect(netValue(netSum(flat, table, x, y), 7)).toBe(7);
    }
    const net = new Float64Array(9);
    net[4] = NET_SCALE;
    expect(netValue(netSum(net, table, 64, 64) * 1000, 7)).toBe(250);
  });
});
