import { describe, expect, it } from "vitest";
import { CUBE_CORNERS } from "../corners.ts";
import { FACES } from "../faces.ts";
import { allCells, cornerPoints, gridPoint } from "../testOracle.ts";
import { aggregatePlanetLevels } from "./aggregate.ts";
import { buildPlanetTile, buildPlanetTiles, type PlanetTile } from "./buildTiles.ts";
import { planetCornerHeights } from "./cornerHeights.ts";
import { flatPlanetFields, fnv1a, randomPlanetFields } from "./testFields.ts";
import { planetTileCount, planetTileIds } from "./tileIds.ts";

// 틈 없음(ADR 36 통과 기준)의 서버 쪽 몫: 같은 레벨 이웃 타일은 경계 꼭짓점 높이가 같아야 한다.
// 판정은 구현을 쓰지 않는 독립 기준(testOracle: 격자점의 정수 3D 좌표)으로 한다.

/** 정육면체 꼭짓점 8곳의 정수 3D 좌표 ([-n, n]³) */
function cubeCornerPoints(level: number): string[] {
  const n = 2 ** level;
  return CUBE_CORNERS.map((corner) => corner.axisSigns.map((sign) => sign * n).join(","));
}

/** 무작위 가짜 출력으로 만든 모든 타일 값의 FNV-1a */
function digest(faceLevel: number, seed: number): string {
  return fnv1a(
    [...buildPlanetTiles(randomPlanetFields(faceLevel, seed))].flatMap(({ tile }) => [
      tile.heightsM,
      tile.biome,
      tile.water,
      tile.temperatureC,
      tile.humidity,
      tile.forest,
      tile.river,
    ]),
  );
}

describe("꼭짓점 높이 = 그 꼭짓점을 나누는 칸들의 평균", () => {
  it("모든 면·모든 꼭짓점이 독립 기준과 같다: 면 안 4칸, 면 경계 4칸(이웃 면 포함), 큐브 꼭짓점 3칸 (레벨 0~5)", () => {
    const levels = aggregatePlanetLevels(randomPlanetFields(5, 2026));
    for (const level of levels.concat(aggregatePlanetLevels(randomPlanetFields(4, 7)).slice(0, 1))) {
      // 기준: 격자점(3D) → 그 점을 꼭짓점으로 가진 칸들의 고도
      const cellsAtPoint = new Map<string, number[]>();
      for (const cell of allCells(level.level)) {
        const value = level.elevationM[cell.face * level.n * level.n + cell.j * level.n + cell.i] ?? 0;
        for (const point of cornerPoints(cell.face, level.level, cell.i, cell.j)) {
          const list = cellsAtPoint.get(point) ?? [];
          list.push(value);
          cellsAtPoint.set(point, list);
        }
      }
      const corners = planetCornerHeights(level);
      const m = level.n + 1;
      for (const face of FACES) {
        for (let cj = 0; cj <= level.n; cj++) {
          for (let ci = 0; ci <= level.n; ci++) {
            const values = cellsAtPoint.get(gridPoint(face, level.level, ci, cj)) ?? [];
            // + 0: Math.round(-0.25)는 -0이고 Int16Array에는 0으로 들어간다
            const expected = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) + 0;
            expect(corners[face * m * m + cj * m + ci]).toBe(expected);
          }
        }
      }
      // 큐브 꼭짓점은 3칸, 나머지 점은 4칸
      const corner = new Set(cubeCornerPoints(level.level));
      for (const [point, values] of cellsAtPoint) expect(values.length).toBe(corner.has(point) ? 3 : 4);
    }
  });
});

describe("타일 만들기", () => {
  it("같은 레벨 타일은 같은 3D 꼭짓점에서 높이가 같다: 면 모서리 12개·큐브 꼭짓점 8곳 포함 (F = 5, 6, 모든 단계)", () => {
    for (const faceLevel of [5, 6]) {
      const byLevel = new Map<number, PlanetTile[]>();
      for (const { tile } of buildPlanetTiles(randomPlanetFields(faceLevel, faceLevel * 31))) {
        const list = byLevel.get(tile.mapLevel) ?? [];
        list.push(tile);
        byLevel.set(tile.mapLevel, list);
      }
      for (const [mapLevel, tiles] of byLevel) {
        // 3D 점 → (높이, 그 점을 가진 타일 키들)
        const points = new Map<string, { height: number; tiles: Set<string>; faces: Set<number> }>();
        for (const tile of tiles) {
          const name = `${tile.face}/${tile.i0}/${tile.j0}`;
          for (let cj = 0; cj <= tile.size; cj++) {
            for (let ci = 0; ci <= tile.size; ci++) {
              const point = gridPoint(tile.face, mapLevel, tile.i0 + ci, tile.j0 + cj);
              const height = tile.heightsM[cj * (tile.size + 1) + ci] ?? 0;
              const seen = points.get(point);
              if (seen) {
                expect(height, `point ${point} level ${mapLevel}`).toBe(seen.height);
                seen.tiles.add(name);
                seen.faces.add(tile.face);
              } else {
                points.set(point, { height, tiles: new Set([name]), faces: new Set([tile.face]) });
              }
            }
          }
        }
        const n = 2 ** mapLevel;
        // 정육면체 격자점 수 = 6n² + 2 (오일러 공식) — 모든 점을 덮었다
        expect(points.size).toBe(6 * n * n + 2);
        // 큐브 꼭짓점 8곳: 서로 다른 면의 타일 3개가 같은 높이를 쓴다
        for (const point of cubeCornerPoints(mapLevel)) {
          expect(points.get(point)?.faces.size).toBe(3);
          expect(points.get(point)?.tiles.size).toBe(3);
        }
        // 면 모서리 12개 위의 점(두 좌표가 ±n): 두 면 이상의 타일이 같은 높이를 쓴다
        const edgePoints = [...points].filter(
          ([point]) => point.split(",").filter((c) => Math.abs(Number(c)) === n).length >= 2,
        );
        expect(edgePoints.length).toBe(12 * (n - 1) + 8);
        for (const [, seen] of edgePoints) expect(seen.faces.size).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("타일 값 = 그 맵 레벨 값과 꼭짓점 높이를 자른 것 (무작위 F = 6)", () => {
    const fields = randomPlanetFields(6, 5);
    const levels = new Map(
      aggregatePlanetLevels(fields).map((level) => [
        level.level,
        { level, corners: planetCornerHeights(level) },
      ]),
    );
    for (const id of planetTileIds(6)) {
      const entry = levels.get(id.mapLevel);
      if (!entry) throw new Error("missing level");
      const { level, corners } = entry;
      const tile = buildPlanetTile(6, level, corners, id);
      expect(tile).toMatchObject({
        faceLevel: 6,
        mapLevel: id.mapLevel,
        face: id.face,
        i0: id.i0,
        j0: id.j0,
        size: id.size,
      });
      // 기대값을 칸 좌표로 하나씩 다시 모은다
      const { n } = level;
      const m = n + 1;
      const cells = (array: ArrayLike<number>) =>
        Array.from({ length: id.size * id.size }, (_, at) => {
          const i = at % id.size;
          const j = (at - i) / id.size;
          return array[id.face * n * n + (id.j0 + j) * n + (id.i0 + i)];
        });
      const heights = Array.from({ length: (id.size + 1) ** 2 }, (_, at) => {
        const ci = at % (id.size + 1);
        const cj = (at - ci) / (id.size + 1);
        return corners[id.face * m * m + (id.j0 + cj) * m + id.i0 + ci];
      });
      expect(Array.from(tile.heightsM)).toEqual(heights);
      expect(Array.from(tile.biome)).toEqual(cells(level.biome));
      expect(Array.from(tile.water)).toEqual(cells(level.water));
      expect(Array.from(tile.temperatureC)).toEqual(cells(level.temperatureC));
      expect(Array.from(tile.humidity)).toEqual(cells(level.humidity));
      expect(Array.from(tile.forest)).toEqual(cells(level.forest));
      expect(Array.from(tile.river)).toEqual(cells(level.river));
    }
  });

  it("같은 입력이면 같은 타일 — 골든 해시 (무작위 F = 5, 시드 42)", () => {
    expect(digest(5, 42)).toBe(digest(5, 42));
    // 모으기·꼭짓점 규칙이나 타일 순서가 바뀌면 이 값이 바뀐다 → 형식 버전(PLANET_TILE_FORMAT_VERSION)을 올릴지 본다
    expect(digest(5, 42)).toBe("52d326ee");
  });

  it("지구 크기(F = 9) 행성 하나 = 타일 2,046개, 처음 30개가 맵 레벨 5~6", () => {
    const tiles = [...buildPlanetTiles(flatPlanetFields(9, 120))];
    expect(tiles).toHaveLength(planetTileCount(9));
    expect(tiles.slice(0, 30).every(({ tile }) => tile.mapLevel <= 6)).toBe(true);
    expect(tiles.every(({ tile }) => tile.heightsM.every((height) => height === 120))).toBe(true);
  });
});
