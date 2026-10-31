import { describe, expect, it } from "vitest";
import { cellsPerSide } from "../levels.ts";
import { NO_RECEIVER, decodePlanetValues, encodePlanetValues } from "./planetValues.ts";
import { receiverOf } from "./rivers.ts";
import { testPlanetValues } from "./testPlanetValues.ts";

describe("행성 값", () => {
  const values = testPlanetValues(5);

  it("파일로 썼다 읽으면 모든 배열·바이옴 ID·시드가 같다", () => {
    const bytes = encodePlanetValues(values);
    const n = cellsPerSide(5);
    expect(bytes.length).toBe(
      16 + values.biomeIds.reduce((sum, id) => sum + 1 + id.length, 0) + 6 * n * n * 14,
    );
    const back = decodePlanetValues(bytes);
    expect(back.faceLevel).toBe(5);
    expect(back.seed).toBe(values.seed);
    expect(back.biomeIds).toEqual(values.biomeIds);
    for (const name of [
      "elevationM",
      "biome",
      "temperatureC",
      "precipitationMm",
      "humidity",
      "water",
      "river",
      "forest",
      "receiverDir",
      "lakeSurfaceM",
      "basinKind",
    ] as const) {
      expect([...back[name]], name).toEqual([...values[name]]);
    }
  });

  it("틀린 파일은 거절한다", () => {
    const bytes = encodePlanetValues(values);
    expect(() => decodePlanetValues(bytes.subarray(0, 100))).toThrow(RangeError);
    const bad = bytes.slice();
    bad[0] = 0;
    expect(() => decodePlanetValues(bad)).toThrow(/not a planet values file/);
  });

  it("흐름 방향: 땅 칸은 이웃 하나로 흐르고, 바다 칸은 없다", () => {
    let land = 0;
    for (let cell = 0; cell < values.water.length; cell++) {
      const ocean = ((values.water[cell] ?? 0) & 1) !== 0;
      if (ocean) {
        expect(values.receiverDir[cell]).toBe(NO_RECEIVER);
        continue;
      }
      land += 1;
      expect(receiverOf(values, cell)).toBeGreaterThanOrEqual(0);
    }
    expect(land).toBeGreaterThan(0);
  });
});
