import { type TerritoryRules, buildTerritory, territoryDistanceMilli } from "@terra/shared/territory";
import { describe, expect, it } from "vitest";
import { type CellKey, cellFace, cellKey } from "./cellKey.ts";
import { EARTH_FACE_LEVEL, PLACEMENT_SUBLEVELS } from "./levels.ts";
import { neighbors4 } from "./neighbors.ts";
import { placementCellKey, rasterizeTerritory, territoryMetric, territoryPoint } from "./territory.ts";

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

describe("영토 칸 표", () => {
  it("도시 + 비콘 셋(사각형): 안쪽·가장자리 칸이 모두 그 세력·그 도시의 지방이다. 같은 입력이면 같은 표", () => {
    const beacons = [cell(288, 328), cell(282, 334), cell(288, 334)];
    const layout = layoutOf(beacons);
    expect(layout.groups[0]?.hull).toHaveLength(4);
    const raster = rasterizeTerritory(layout, [MAP, ...beacons], F);
    // 꼭짓점 칸(도시 칸)은 넓이의 1/4만 도형 안 → 표본 4곳 → 소속 없음이 이긴다. 가장자리 칸은 절반 → 같으면 세력
    expect(raster.has(MAP)).toBe(false);
    expect(raster.get(cell(285, 328))?.samples).toBe(8);
    expect(raster.get(cell(283, 329))).toEqual({ faction: 7, province: 1, samples: 16 });
    expect([...raster.values()].every((c) => c.faction === 7 && c.province === 1)).toBe(true);
    // 도형 = 칸 중심 (282,328)~(288,334) 정사각형(넓이 36칸) → 가장자리 칸의 반쯤이 들어가 칸 수가 그 근처다
    expect(raster.size).toBeGreaterThan(25);
    expect(raster.size).toBeLessThan(55);
    const again = rasterizeTerritory(layoutOf(beacons.toReversed()), [...beacons, MAP].toReversed(), F);
    expect([...again.entries()]).toEqual([...raster.entries()]);
    // 골든: 칸 수와 칸 키 합(결정성, 바뀌면 껍질·투영·표본 규칙이 바뀐 것)
    expect([raster.size, [...raster.keys()].reduce((sum, key) => sum + (key % 1_000_003), 0)]).toEqual(
      RASTER_GOLDEN,
    );
  });

  it("도시 하나 + 비콘 하나(꼭짓점 둘)는 껍질 없이 영향권만", () => {
    const one = layoutOf([cell(288, 328)]);
    expect(one.groups[0]?.hull).toBeNull();
    // 마을 영향권(0.1칸)은 칸 하나의 표본 16곳 중 가운데 근처만 → 가장 많은 쪽이 소속 없음
    expect(rasterizeTerritory(one, [MAP], F).size).toBe(0);
  });

  it("큐브 꼭짓점(면 0·1·2가 만나는 곳)을 넘는 껍질도 세 면의 칸을 칠한다", () => {
    const n = 512;
    const corner = cell(n - 1, n - 1, 0);
    const layout = buildTerritory(
      [{ id: 1, faction: 3, point: territoryPoint(cell(n - 3, n - 3, 0)), grade: 1 }],
      [
        { id: 11, faction: 3, point: territoryPoint(cell(2, n - 3, 1)), anchorCity: 1 },
        { id: 12, faction: 3, point: territoryPoint(cell(n - 3, 2, 2)), anchorCity: 1 },
        { id: 13, faction: 3, point: territoryPoint(cell(n - 6, n - 6, 0)), anchorCity: 1 },
      ],
      rules,
      metric,
    );
    expect(layout.groups[0]?.hull).not.toBeNull();
    const raster = rasterizeTerritory(layout, [corner, cell(n - 3, n - 3, 0)], F);
    expect(new Set([...raster.keys()].map((key) => cellFace(key)))).toEqual(new Set([0, 1, 2]));
    expect(raster.has(corner)).toBe(true);
  });
});

/** rasterizeTerritory 골든(2026-11-03 처음 실행에서 잰 값: 안쪽 25칸 + 가장자리 20칸) */
const RASTER_GOLDEN = [45, 23_373_753];
