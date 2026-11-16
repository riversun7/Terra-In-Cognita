import { type TerritoryRules, buildTerritory, territoryDistanceMilli } from "@terra/shared/territory";
import { describe, expect, it } from "vitest";
import { type CellKey, cellFace, cellKey } from "./cellKey.ts";
import { EARTH_FACE_LEVEL, PLACEMENT_SUBLEVELS } from "./levels.ts";
import { neighbors4 } from "./neighbors.ts";
import {
  placementCellKey,
  rasterizeTerritory,
  startTerritoryRaster,
  territoryMetric,
  territoryPoint,
} from "./territory.ts";

const F = EARTH_FACE_LEVEL;
const metric = territoryMetric(F);
const rules: TerritoryRules = {
  influenceMilli: [100, 200, 500, 1100, 1900, 3600],
  beaconRangeMilli: [10_000, 10_000, 10_000, 13_333, 13_333, 13_333],
  beaconsPerCity: [3, 3, 4, 4, 5, 5],
};
/** S2 시험 행성 시험 2차맵(@terra/protocol S1_TEST_MAP_KEY) */
const MAP = cellKey(0, F, 282, 328);
const cell = (i: number, j: number, face: 0 | 1 | 2 = 0): CellKey => cellKey(face, F, i, j);

describe("행성 칸 → 영토 점·거리", () => {
  it("점은 성분 ≤ 2^16 정수이고, 이웃 칸 중심 사이는 약 1칸(1000)이다", () => {
    const p = territoryPoint(MAP);
    expect(p.every((v) => Number.isInteger(v) && Math.abs(v) <= 65_536)).toBe(true);
    for (const next of neighbors4(MAP)) {
      const d = territoryDistanceMilli(p, territoryPoint(next), metric);
      expect(d).toBeGreaterThan(850);
      expect(d).toBeLessThan(1150);
    }
    // 배치 칸(F + 8)도 점이 된다: 2차맵 가운데 배치 칸은 칸 중심에서 아주 가깝다
    const center = placementCellKey(MAP, 128, 128);
    expect(territoryDistanceMilli(p, territoryPoint(center), metric)).toBeLessThan(10);
    expect(PLACEMENT_SUBLEVELS).toBe(8);
  });

  it("평균 칸/라디안 = 2^F ÷ √(2π/3)", () => {
    expect(metric.milliPerRadian).toBeCloseTo((1000 * 512) / Math.sqrt((2 * Math.PI) / 3), 6);
  });
});

/** 시험 2차맵 가운데 마을(세력 7) + 비콘들(기준 = 그 마을) */
const layoutOf = (beacons: readonly CellKey[]) =>
  buildTerritory(
    [{ id: 1, faction: 7, point: territoryPoint(placementCellKey(MAP, 128, 128)), grade: 1 }],
    beacons.map((key, index) => ({
      id: 100 + index,
      faction: 7,
      point: territoryPoint(key),
      anchorCity: 1,
    })),
    rules,
    metric,
  );

describe("영토 칸 표(1차맵 지도대로, D-568)", () => {
  it("마을 하나: 영토 원(아래 끝 4칸) 안 칸이 모두 그 세력·그 도시의 지방이다. 같은 입력이면 같은 표", () => {
    const raster = rasterizeTerritory(layoutOf([]), [MAP], F);
    expect(raster.get(MAP)).toEqual({ faction: 7, province: 1, samples: 16 });
    expect([...raster.values()].every((c) => c.faction === 7 && c.province === 1)).toBe(true);
    // 원 넓이 π·4² ≈ 50칸
    expect(raster.size).toBeGreaterThan(40);
    expect(raster.size).toBeLessThan(62);
    expect(raster.has(cell(282, 334))).toBe(false);
  });

  it("도시 소유 비콘은 외곽선을 비콘까지 넓힌다(칸 표도 같이). 골든", () => {
    const beacons = [cell(282, 338)];
    const raster = rasterizeTerritory(layoutOf(beacons), [MAP, ...beacons], F);
    expect(raster.get(cell(282, 336))).toEqual({ faction: 7, province: 1, samples: 16 });
    expect(raster.get(cell(282, 338))?.faction).toBe(7);
    expect(raster.has(cell(282, 342))).toBe(false);
    const again = rasterizeTerritory(layoutOf(beacons.toReversed()), [...beacons, MAP].toReversed(), F);
    expect([...again.entries()]).toEqual([...raster.entries()]);
    // 골든: 칸 수와 칸 키 합(결정성, 바뀌면 영토 모양·투영·표본 규칙이 바뀐 것)
    expect([raster.size, [...raster.keys()].reduce((sum, key) => sum + (key % 1_000_003), 0)]).toEqual(
      RASTER_GOLDEN,
    );
  });

  it("나눠 셈(질문 1930): 조각 크기와 상관없이 한 번에 셈한 표와 같다", () => {
    const beacons = [cell(282, 338)];
    const whole = rasterizeTerritory(layoutOf(beacons), [MAP, ...beacons], F);
    for (const slice of [1, 7, 64]) {
      const job = startTerritoryRaster(layoutOf(beacons), [MAP, ...beacons], F);
      let steps = 0;
      while (!job.step(slice)) steps += 1;
      expect(steps).toBeGreaterThan(slice === 64 ? 0 : 10);
      expect([...job.result().entries()]).toEqual([...whole.entries()]);
      // 다 셈한 뒤 더 불러도 그대로
      expect(job.step(slice)).toBe(true);
    }
  });

  it("큐브 꼭짓점(면 0·1·2가 만나는 곳)을 넘는 영토도 세 면의 칸을 칠한다", () => {
    const n = 512;
    const corner = cell(n - 1, n - 1, 0);
    const layout = buildTerritory(
      [{ id: 1, faction: 3, point: territoryPoint(cell(n - 2, n - 2, 0)), grade: 1 }],
      [],
      rules,
      metric,
    );
    const raster = rasterizeTerritory(layout, [cell(n - 2, n - 2, 0)], F);
    expect(new Set([...raster.keys()].map((key) => cellFace(key)))).toEqual(new Set([0, 1, 2]));
    expect(raster.has(corner)).toBe(true);
  });
});

/** rasterizeTerritory 골든(2026-11-16 D-568 지도 판정으로 다시 잼: 마을 원 + 비콘 띠) */
const RASTER_GOLDEN = [85, 44_266_717];
