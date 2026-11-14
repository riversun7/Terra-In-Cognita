// 서버 자료 → 엔진 입력 바꾸기 시험 — 고정소수점 ÷ 1024, 지형 cm → 0.1m, 건물 회전 ÷ 90, 이동 목표 칸 가운데
import {
  FIXED_POINT_SCALE,
  HEIGHT_UNIT_M,
  NO_WATER_UNITS,
  PLACEMENT_CELLS,
  TERRAIN_CELLS,
  TERRAIN_VERTICES,
  type TerrainInput,
} from "@terra/engine";
import {
  POSITION_UNITS_PER_CELL,
  TERRAIN_NO_WATER,
  TERRAIN_SURFACE,
  type TerrainData,
  decodeTerrain,
  encodeTerrain,
} from "@terra/protocol";
import { describe, expect, it } from "vitest";
import {
  ENGINE_HEIGHT_UNIT_M,
  ENGINE_NO_WATER,
  ENGINE_PLACEMENT_CELLS,
  ENGINE_TERRAIN_CELLS,
  TERRAIN_CELL_M,
  TerrainFormatError,
  VEHICLE_WIRE_KIND,
  targetUnits,
  toFootprint,
  toTerrainInput,
  toUnitPath,
  toUnitSpawn,
  unitLook,
} from "./mapWire.ts";

function terrainData(fill: (i: number) => number, size = 128): TerrainData {
  const vertices = size + 1;
  const heights = new Int32Array(vertices * vertices);
  for (let i = 0; i < heights.length; i++) heights[i] = fill(i);
  const surface = new Uint8Array(size * size);
  for (let i = 0; i < surface.length; i++) surface[i] = i % 5;
  return { mapKey: 2 ** 48 + 9, generatorVersion: 1, seed: 7, hash: 0, terrainSize: size, heights, surface };
}

describe("엔진과 같은 상수", () => {
  it("지형 칸 수·높이 단위·고정소수점이 엔진 값과 같다", () => {
    expect(ENGINE_TERRAIN_CELLS).toBe(TERRAIN_CELLS);
    expect(ENGINE_TERRAIN_CELLS + 1).toBe(TERRAIN_VERTICES);
    expect(ENGINE_HEIGHT_UNIT_M).toBe(HEIGHT_UNIT_M);
    expect(POSITION_UNITS_PER_CELL).toBe(FIXED_POINT_SCALE);
  });

  it("지표 번호가 엔진 번호와 같다(그대로 넘긴다)", async () => {
    const { SURFACE } = await import("@terra/engine");
    expect(SURFACE).toEqual(TERRAIN_SURFACE);
  });
});

describe("지형", () => {
  it("cm → 0.1m(반올림), 지표는 그대로, 칸 크기·물 높이는 정한 값", () => {
    const input: TerrainInput = toTerrainInput(terrainData((i) => (i % 2 === 0 ? 1_234 : -56)));
    expect(input.heights).toBeInstanceOf(Int16Array);
    expect(input.heights.length).toBe(129 * 129);
    expect(input.heights[0]).toBe(123);
    expect(input.heights[1]).toBe(-6);
    expect(input.baseHeightM).toBe(0);
    expect(input.surface.length).toBe(128 * 128);
    expect(input.surface[3]).toBe(3);
    expect(input.surface[4]).toBe(4);
    expect(input.cellSizeM).toBe(TERRAIN_CELL_M);
    expect(input.waterLevelM).toBe(0);
  });

  it("이진 형식을 거쳐도 같다(decodeTerrain → 엔진 입력)", () => {
    const data = terrainData((i) => (i * 37) % 9_000);
    const input = toTerrainInput(decodeTerrain(encodeTerrain(data)));
    expect(input.heights[5]).toBe(Math.round(((5 * 37) % 9_000) / 10));
    expect(Array.from(input.surface.slice(0, 6))).toEqual([0, 1, 2, 3, 4, 0]);
  });

  it("2판: 머리의 실제 칸 크기(mm → m), 꼭짓점 물 높이(cm → 0.1m, 물 없음은 엔진 값)", () => {
    const base = terrainData(() => 500);
    const waterLevels = new Int32Array(129 * 129).fill(TERRAIN_NO_WATER);
    waterLevels[10] = 1_234;
    const input = toTerrainInput(
      decodeTerrain(encodeTerrain({ ...base, cellSizeMm: 11_250, waterLevels, planetGeneratorVersion: 3 })),
    );
    expect(input.cellSizeM).toBe(11.25);
    expect(input.waterLevels?.length).toBe(129 * 129);
    expect(input.waterLevels?.[10]).toBe(123);
    expect(input.waterLevels?.[0]).toBe(ENGINE_NO_WATER);
    expect(ENGINE_NO_WATER).toBe(NO_WATER_UNITS);
    // 1판은 물 높이가 없다
    expect(toTerrainInput(base).waterLevels).toBeUndefined();
    // 소품 그림·엄폐는 배치 칸 256²일 때만 넘긴다
    const art = new Uint8Array(256 * 256).fill(2);
    const cover = new Uint8Array(256 * 256).fill(1);
    const withProps = toTerrainInput(
      decodeTerrain(encodeTerrain({ ...base, art, cover, placementSize: 256 })),
    );
    expect(withProps.art?.[5]).toBe(2);
    expect(withProps.cover?.[5]).toBe(1);
    expect(ENGINE_PLACEMENT_CELLS).toBe(PLACEMENT_CELLS);
  });

  it("int16을 넘는 높이는 가운데를 기준으로 옮긴다", () => {
    // 4,000m ~ 6,000m: 0.1m 단위로 40,000 ~ 60,000 → 기준 5,000m
    const input = toTerrainInput(terrainData((i) => (i === 0 ? 400_000 : 600_000)));
    expect(input.baseHeightM).toBeCloseTo(5_000, 6);
    expect(input.heights[0]).toBe(-10_000);
    expect(input.heights[1]).toBe(10_000);
  });

  it("엔진이 받지 않는 크기·너무 큰 높이 폭은 거절한다", () => {
    expect(() => toTerrainInput(terrainData(() => 0, 64))).toThrow(TerrainFormatError);
    expect(() => toTerrainInput(terrainData((i) => (i === 0 ? -400_000 : 400_000)))).toThrow(
      TerrainFormatError,
    );
  });
});

describe("유닛", () => {
  const walker = {
    id: 12,
    size: 1,
    speed: 437,
    departAtMs: 1_000_000,
    path: [1536, 2048, 4096, 2048],
  } as const;

  it("경로: 점 ÷ 1024 = 배치 칸, 속도 ÷ 1024 = 칸/초, 출발 시각은 그대로", () => {
    const path = toUnitPath({ ...walker, path: [...walker.path] });
    expect(Array.from(path.points)).toEqual([1.5, 2, 4, 2]);
    expect(path.speedCellsPerSec).toBeCloseTo(437 / 1024, 9);
    expect(path.departAtMs).toBe(1_000_000);
  });

  it("구간 걸음 배율(프로토콜 29)을 그대로 넘기고, 없으면 칸이 없다", () => {
    const paced = toUnitPath({ ...walker, path: [1536, 2048, 4096, 2048, 4096, 4096], pace: [1800, 1000] });
    expect(Array.from(paced.paces ?? [])).toEqual([1800, 1000]);
    expect(toUnitPath({ ...walker, path: [...walker.path] }).paces).toBeUndefined();
  });

  it("서 있는 유닛은 점 하나", () => {
    const path = toUnitPath({ ...walker, path: [512, 512] });
    expect(Array.from(path.points)).toEqual([0.5, 0.5]);
  });

  it("처음 놓는 자리는 경로의 첫 점", () => {
    const spawn = toUnitSpawn({ ...walker, path: [...walker.path] });
    expect(spawn).toMatchObject({ id: 12, x: 1.5, y: 2 });
  });

  it("겉모습: 크기 등급이 클수록 크고, 서버가 탈것이라 한 유닛만 탈것 모양·색(움직임 빠르기와 상관없다)", () => {
    const small = unitLook({ id: 1, size: 1 });
    const large = unitLook({ id: 1, size: 2 });
    const huge = unitLook({ id: 1, size: 3 });
    expect(small.heightM).toBeCloseTo(1.8);
    expect(large.heightM).toBeGreaterThan(small.heightM);
    expect(huge.heightM).toBeGreaterThan(large.heightM);
    expect(huge.heightM).toBeLessThanOrEqual(12);
    expect(small).toMatchObject({ form: "walker", sizeClass: 1 });
    const car = unitLook({ id: 1, size: 1, kind: VEHICLE_WIRE_KIND });
    expect(car).toMatchObject({ form: "vehicle", sizeClass: 1 });
    expect(car.radiusM).toBeGreaterThan(small.radiusM);
    expect(car.color).not.toBe(small.color);
    // 같은 유닛은 늘 같은 색
    expect(unitLook({ id: 5, size: 1 }).color).toBe(unitLook({ id: 5, size: 1 }).color);
  });

  it("운영자 모드처럼 아주 빠른 움직임이어도 표시 종류가 없으면 걷는 유닛이다(노란 탈것 캡슐로 바뀌지 않는다)", () => {
    const fast = toUnitSpawn({ ...walker, path: [...walker.path], speed: 43_700 });
    expect(fast.look).toMatchObject({ form: "walker", heightM: 1.8, radiusM: 0.3 });
    const leader = toUnitSpawn({ ...walker, path: [...walker.path], speed: 43_700, kind: "npc_leader" });
    expect(leader.look.form).toBe("walker");
  });
});

describe("건물", () => {
  it("rotation ÷ 90, height → depth, 기준 칸은 그대로", () => {
    const rotations = [0, 90, 180, 270] as const;
    rotations.forEach((rotation, turns) => {
      const footprint = toFootprint({ id: 3, x: 10, y: 20, width: 4, height: 2, rotation });
      expect(footprint).toMatchObject({ id: 3, cellX: 10, cellY: 20, width: 4, depth: 2, rotation: turns });
    });
  });

  it("[임시] 높이는 ID로 정한 4~14m", () => {
    for (let id = 1; id < 40; id++) {
      const { heightM } = toFootprint({ id, x: 0, y: 0, width: 1, height: 1, rotation: 0 });
      expect(heightM).toBeGreaterThanOrEqual(4);
      expect(heightM).toBeLessThanOrEqual(14);
    }
  });
});

describe("이동 목표", () => {
  it("누른 칸의 가운데(칸 × 1024 + 512)", () => {
    expect(targetUnits(0)).toBe(512);
    expect(targetUnits(10.99)).toBe(10 * 1024 + 512);
    expect(targetUnits(255.5)).toBe(255 * 1024 + 512);
  });

  it("2차맵 밖은 가장자리 칸으로", () => {
    expect(targetUnits(-3)).toBe(512);
    expect(targetUnits(300)).toBe(255 * 1024 + 512);
    expect(targetUnits(Number.NaN)).toBe(512);
  });
});
