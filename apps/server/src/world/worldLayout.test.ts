// 세계 배치 시험(docs/adr/2026-11-07-world-layout.md) — 가짜 행성 값(면 레벨 6, 땅·물 무늬)으로 국가 수도가 서로 멀고, 시작 도시가 2차맵마다
// 하나·수도와 붙은 2차맵 먼저·알맞은 땅·다른 세력 영향권 밖에 서는지, 같은 입력이면 같은 결과인지 본다.
import { type CellKey, cellKey, decodeCellKey, neighbors4 } from "@terra/planet";
import { territoryMetric } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { START_WORLD_SEED } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  CITY_CELL,
  type LayoutInput,
  type LayoutLand,
  isSettleLand,
  planWorldLayout,
  ringOffsets,
  sampleLand,
  seedOfText,
  spotPoint,
  walkCell,
} from "./worldLayout.ts";

const LEVEL = 6;
const metric = territoryMetric(LEVEL);
const GRASS: LayoutLand = {
  biomeId: "grassland",
  elevationM: 100,
  temperatureC: 15,
  precipitationMm: 400,
  water: 0,
};
/** 가짜 행성: 면 5는 바다, 면 0의 i < 8은 높은 산, 나머지는 j % 9 == 4인 줄이 강(물) */
function land(key: CellKey): LayoutLand {
  const { face, i, j } = decodeCellKey(key);
  if (face === 5) return { ...GRASS, water: 1, elevationM: -200 };
  if (face === 0 && i < 8) return { ...GRASS, elevationM: 3000 };
  if (j % 9 === 4) return { ...GRASS, water: 4 };
  return GRASS;
}

const seed = { ...START_WORLD_SEED, layoutRegionCells: 12, layoutNationGapCells: 10 };
const base = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({
  faceLevel: LEVEL,
  land,
  seed,
  worldSeed: seedOfText("s2_test_planet"),
  nations: [
    { factionId: 1, missing: 2, placed: [] },
    { factionId: 2, missing: 4, placed: [] },
    { factionId: 3, missing: 3, placed: [] },
    { factionId: 4, missing: 2, placed: [] },
  ],
  obstacles: [],
  newRadiusMilli: 100,
  ...overrides,
});

describe("세계 배치(국가 자리·시작 도시)", () => {
  it("알맞은 땅: 물·높은 산·추위·바이옴 없음은 뺀다", () => {
    expect(isSettleLand(GRASS, seed)).toBe(true);
    expect(isSettleLand({ ...GRASS, water: 8 }, seed)).toBe(false);
    expect(isSettleLand({ ...GRASS, elevationM: 0 }, seed)).toBe(false);
    expect(isSettleLand({ ...GRASS, elevationM: 1600 }, seed)).toBe(false);
    expect(isSettleLand({ ...GRASS, temperatureC: -5 }, seed)).toBe(false);
    expect(isSettleLand({ ...GRASS, biomeId: null }, seed)).toBe(false);
    expect(isSettleLand({ ...GRASS, precipitationMm: 120 }, seed)).toBe(false);
    expect(isSettleLand(undefined, seed)).toBe(false);
    expect(sampleLand({ faceLevel: LEVEL, land, seed }).every((key) => isSettleLand(land(key), seed))).toBe(
      true,
    );
  });

  it("걸음·고리: 변 이웃 먼저, 여러 칸 걸음은 한 칸씩(면 경계를 넘는다)", () => {
    expect(ringOffsets(1).slice(0, 4)).toEqual([
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(ringOffsets(2)).toHaveLength(8 + 16);
    const home = cellKey(0, LEVEL, 63, 20);
    const east = walkCell(home, 1, 0);
    expect(east).not.toBeNull();
    expect(decodeCellKey(east ?? home).face).not.toBe(0);
    expect(walkCell(home, -2, 0)).toBe(cellKey(0, LEVEL, 61, 20));
  });

  it("국가 넷: 수도는 서로 국가 간격 이상, 도시는 2차맵마다 하나·알맞은 땅·수도와 붙은 2차맵", () => {
    const result = planWorldLayout(base());
    expect(result.short).toBe(0);
    expect(result.homes.size).toBe(4);
    expect(result.minGapCells).not.toBeNull();
    expect(result.minGapCells ?? 0).toBeGreaterThanOrEqual(seed.layoutNationGapCells);
    expect(result.spots.map((entry) => entry.factionId)).toEqual([1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4]);
    const maps = result.spots.map((entry) => entry.spot.mapKey);
    expect(new Set(maps).size).toBe(maps.length);
    for (const { factionId, spot } of result.spots) {
      expect(spot.x).toBe(CITY_CELL);
      expect(spot.y).toBe(CITY_CELL);
      expect(isSettleLand(land(spot.mapKey as CellKey), seed)).toBe(true);
      const home = result.homes.get(factionId);
      // 첫 도시 = 수도, 나머지는 수도의 변 이웃(이 가짜 땅에서는 넉넉하다)
      if (spot.mapKey !== home) expect(neighbors4(home as CellKey)).toContain(spot.mapKey);
    }
    // 다른 국가 도시끼리는 국가 간격의 절반보다 멀다(영토가 닿지 않는다)
    for (const a of result.spots)
      for (const b of result.spots)
        if (a.factionId !== b.factionId)
          expect(territoryDistanceMilli(spotPoint(a.spot), spotPoint(b.spot), metric)).toBeGreaterThan(
            (seed.layoutNationGapCells * 1000) / 2,
          );
  });

  it("같은 입력이면 같은 결과, 세계 시드가 다르면 첫 수도가 달라질 수 있다", () => {
    const a = planWorldLayout(base());
    const b = planWorldLayout(base());
    expect(b).toEqual(a);
    const other = planWorldLayout(base({ worldSeed: seedOfText("another_planet") }));
    expect(other.spots).toHaveLength(a.spots.length);
  });

  it("이미 선 국가는 그 첫 도시 2차맵이 수도이고 모자란 것만, 다른 세력 도시 영향권과 닿는 칸은 건너뛴다", () => {
    const home = cellKey(1, LEVEL, 30, 30);
    const placed = [{ mapKey: home, x: CITY_CELL, y: CITY_CELL }];
    const neighbour = walkCell(home, 0, -1) ?? home;
    // 그 국가 수도 북쪽 이웃 2차맵에 다른 세력의 큰 도시(영향권 1.9칸 = 이웃 두 칸까지 닿는다)
    const result = planWorldLayout(
      base({
        nations: [{ factionId: 7, missing: 2, placed }],
        obstacles: [
          { factionId: 9, spot: { mapKey: neighbour, x: CITY_CELL, y: CITY_CELL }, radiusMilli: 1900 },
        ],
      }),
    );
    expect(result.homes.get(7)).toBe(home);
    expect(result.spots).toHaveLength(2);
    for (const { spot } of result.spots) {
      expect(spot.mapKey).not.toBe(home);
      expect(spot.mapKey).not.toBe(neighbour);
      const d = territoryDistanceMilli(
        spotPoint(spot),
        spotPoint({ mapKey: neighbour, x: CITY_CELL, y: CITY_CELL }),
        metric,
      );
      expect(d).toBeGreaterThan(1900 + 100);
    }
  });

  it("시험 2차맵 줄(피할 2차맵)에는 두지 않고, 땅이 없으면 모자란 수를 알린다", () => {
    const avoid = new Set<number>(planWorldLayout(base()).spots.map((entry) => entry.spot.mapKey));
    const moved = planWorldLayout(base({ avoidMaps: avoid }));
    for (const { spot } of moved.spots) expect(avoid.has(spot.mapKey)).toBe(false);
    const none = planWorldLayout(base({ land: () => undefined }));
    expect(none.spots).toHaveLength(0);
    expect(none.short).toBe(11);
  });
});
