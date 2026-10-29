// 칸 정보 시험 — 위도·경도 → 칸 되돌림(모든 칸 가운데, 면 가장자리 칸의 안쪽 끝, 극), 결과 값 읽기, 물 비트 풀기, 설명 묶음
import {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  DEPTH_SHELF,
  FACES,
  WATER_COAST,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
  cellKey,
  cellsPerSide,
  decodeCellKey,
} from "@terra/planet";
import { VERTICAL_SCALE, generatePlanet, planetInputFromDefinition } from "@terra/planet/generator";
import { type Vec3, cellCenter, cellCorners, faceUVToXYZ, stToUV } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import { cellAtLatLon, cellReport, decodeWater, directionOfLatLon, readCell } from "./cellReport.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

const SLOW = 60_000;

/** 방향 → 위도·경도(°) — 엔진 latLonOf와 같은 식 */
function latLonOf(direction: Vec3): { latDeg: number; lonDeg: number } {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z);
  return {
    latDeg: (Math.asin(Math.min(1, Math.max(-1, z / length))) * 180) / Math.PI,
    lonDeg: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

/** 면의 (s, t) 점(정규화 칸 좌표)의 위도·경도 */
function latLonAt(face: (typeof FACES)[number], s: number, t: number): { latDeg: number; lonDeg: number } {
  return latLonOf(faceUVToXYZ(face, stToUV(s), stToUV(t)));
}

describe("위도·경도 → 칸", () => {
  it("방향 식은 엔진과 같다(적도 0°, 극)", () => {
    expect(directionOfLatLon(0, 0)).toEqual([1, 0, 0]);
    const [x, y, z] = directionOfLatLon(90, 0);
    expect(Math.abs(x) + Math.abs(y)).toBeLessThan(1e-15);
    expect(z).toBe(1);
  });

  it("모든 칸 가운데가 제 칸으로 돌아온다(면 레벨 4·5)", () => {
    for (const level of [4, 5]) {
      const n = cellsPerSide(level);
      for (const face of FACES) {
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const key = cellKey(face, level, i, j);
            const { latDeg, lonDeg } = latLonOf(cellCenter(key));
            const found = cellAtLatLon(level, latDeg, lonDeg);
            if (found.key !== key) throw new Error(`level ${level} face ${face} (${i}, ${j}) → ${found.key}`);
            expect(found.index).toBe(face * n * n + j * n + i);
          }
        }
      }
    }
  });

  it("면 가장자리 칸: 경계 바로 안쪽 점은 그 칸이다(면 레벨 5, 칸의 1%)", () => {
    const level = 5;
    const n = cellsPerSide(level);
    const inset = 0.01 / n;
    for (const face of FACES) {
      for (let k = 0; k < n; k++) {
        const edges: [number, number, number, number][] = [
          [0, k, inset, (k + 0.5) / n],
          [n - 1, k, 1 - inset, (k + 0.5) / n],
          [k, 0, (k + 0.5) / n, inset],
          [k, n - 1, (k + 0.5) / n, 1 - inset],
        ];
        for (const [i, j, s, t] of edges) {
          const { latDeg, lonDeg } = latLonAt(face, s, t);
          const found = cellAtLatLon(level, latDeg, lonDeg);
          expect(decodeCellKey(found.key)).toEqual({ face, level, i, j });
        }
      }
    }
  });

  it("극: 북극은 면 2, 남극은 면 5의 극을 꼭짓점으로 가진 칸", () => {
    const level = 5;
    for (const [latDeg, face, pole] of [
      [90, 2, 1],
      [-90, 5, -1],
    ] as const) {
      for (const lonDeg of [-180, -90, 0, 45, 90, 180]) {
        const found = cellAtLatLon(level, latDeg, lonDeg);
        expect(found.face).toBe(face);
        const touchesPole = cellCorners(found.key).some(
          ([x, y, z]) => Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12 && Math.abs(z - pole) < 1e-12,
        );
        expect(touchesPole).toBe(true);
      }
    }
  });

  it("경도는 360°마다 같은 칸(칸 경계 밖에서), 수가 아니면 RangeError", () => {
    // 경도 ±180°는 면 3 가운데 칸 경계 위라 어느 쪽 칸이 될지 sin(±π)의 부호가 정한다. 경계 밖 점으로 본다
    expect(cellAtLatLon(6, 10, 179.9).key).toBe(cellAtLatLon(6, 10, -180.1).key);
    expect(cellAtLatLon(6, -33, 12.3).key).toBe(cellAtLatLon(6, -33, 372.3).key);
    expect(() => cellAtLatLon(6, Number.NaN, 0)).toThrow(RangeError);
    expect(() => cellAtLatLon(6, 0, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("물 비트", () => {
  it("바다 + 수심 등급(4~5비트), 호수, 강, 해안", () => {
    expect(decodeWater(WATER_OCEAN | (DEPTH_COASTAL << WATER_DEPTH_SHIFT)).depthClass).toBe("coastal");
    expect(decodeWater(WATER_OCEAN | (DEPTH_SHELF << WATER_DEPTH_SHIFT)).depthClass).toBe("shelf");
    expect(decodeWater(WATER_OCEAN | (DEPTH_DEEP << WATER_DEPTH_SHIFT))).toEqual({
      ocean: true,
      lake: false,
      river: false,
      coast: false,
      depthClass: "deep",
    });
    expect(decodeWater(WATER_LAKE)).toMatchObject({ ocean: false, lake: true, depthClass: null });
    expect(decodeWater(WATER_RIVER | WATER_COAST)).toMatchObject({ river: true, coast: true, ocean: false });
    // 바다가 아닌데 등급 비트가 있으면 등급은 없다
    expect(decodeWater(DEPTH_SHELF << WATER_DEPTH_SHIFT).depthClass).toBeNull();
    expect(decodeWater(WATER_OCEAN).depthClass).toBeNull();
  });
});

describe("칸 값", () => {
  it(
    "생성 결과 배열의 정확한 값과 설명 묶음",
    () => {
      const input = planetInputFromDefinition(TEST_PLANET, PACK_BIOMES, 5);
      const fields = generatePlanet(input);
      const n = cellsPerSide(5);
      const pick = (face: (typeof FACES)[number], i: number, j: number) => {
        const { latDeg, lonDeg } = latLonOf(cellCenter(cellKey(face, 5, i, j)));
        return { latDeg, lonDeg, index: face * n * n + j * n + i };
      };
      let ocean = 0;
      let land = 0;
      for (const face of FACES) {
        for (let j = 0; j < n; j += 3) {
          for (let i = 0; i < n; i += 3) {
            const { latDeg, lonDeg, index } = pick(face, i, j);
            const values = readCell(fields, input.biomes, latDeg, lonDeg);
            expect(values.location.index).toBe(index);
            expect(values.elevationM).toBe(fields.elevationM[index]);
            expect(values.realElevationM).toBe((fields.elevationM[index] ?? 0) * VERTICAL_SCALE);
            expect(values.temperatureC).toBe(fields.temperatureC[index]);
            expect(values.precipitationMm).toBe(fields.precipitationMm[index]);
            expect(values.humidity).toBe(fields.humidity[index]);
            expect(values.forest).toBe(fields.forest[index]);
            expect(values.riverOrder).toBe(fields.river[index]);
            expect(values.biomeId).toBe(input.biomes[fields.biome[index] ?? -1]?.id);
            expect(values.water).toEqual(decodeWater(fields.water[index] ?? 0));
            expect(values.generatorVersion).toBe(fields.meta.generatorVersion);
            if (values.water.ocean) {
              ocean += 1;
              // 바다 칸은 수심 등급이 있다
              expect(values.water.depthClass).not.toBeNull();
            } else {
              land += 1;
            }
          }
        }
      }
      expect(ocean).toBeGreaterThan(0);
      expect(land).toBeGreaterThan(0);
      const { latDeg, lonDeg } = pick(0, 1, 2);
      const report = cellReport<{ name: string; biome?: string | null; size?: number }>(
        fields,
        input.biomes,
        latDeg,
        lonDeg,
        [
          (values) => ({ name: "first", biome: values.biomeId }),
          () => null,
          (_values, biomes) => ({ name: "table", size: biomes.length }),
        ],
      );
      expect(report.sections).toEqual([
        { name: "first", biome: report.values.biomeId },
        { name: "table", size: input.biomes.length },
      ]);
      expect(cellReport(fields, input.biomes, latDeg, lonDeg).sections).toEqual([]);
    },
    SLOW,
  );
});
