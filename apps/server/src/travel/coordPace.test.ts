// 좌표 이동 지형 빠르기(D-564 1643) — 행성 값 → 2차맵 평균 걸음 배율, 좌표 구간 시간 거리
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { FOREST_COST_PM, SURFACE_COST } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  ROCK_FULL_RELIEF_M,
  RIVER_DETOUR_PM,
  RIVER_SHALLOW_PM,
  coordPacePm,
  hopPaceDistance,
  neighborMapKeys,
  slopeRockPm,
} from "./coordPace.ts";
import { cellKey } from "@terra/planet";

const cell = (patch: Partial<PlanetCellValues>): PlanetCellValues => ({
  mapKey: 1,
  face: 0,
  i: 0,
  j: 0,
  biomeId: "grassland",
  elevationM: 100,
  temperatureC: 15,
  humidity: 100,
  precipitationMm: 500,
  water: 0,
  riverOrder: 0,
  forest: 0,
  ...patch,
});

describe("coordPacePm 강·비탈(1903)", () => {
  it("얕은 강(등급 1~2)은 등급 × 몫만 얕은 물 비용, 깊은 강(3 이상)은 돌아가는 몫만큼 배율이 는다", () => {
    const base = coordPacePm(cell({}));
    const shallow = SURFACE_COST[10] ?? 0;
    expect(coordPacePm(cell({ riverOrder: 2 }))).toBe(
      Math.floor((base * (1000 - 2 * RIVER_SHALLOW_PM) + shallow * 2 * RIVER_SHALLOW_PM) / 1000),
    );
    expect(coordPacePm(cell({ riverOrder: 4 }))).toBe(
      Math.floor((base * (1000 + 4 * RIVER_DETOUR_PM)) / 1000),
    );
    // 바다·호수 2차맵은 강을 따로 보지 않는다
    expect(coordPacePm(cell({ water: 1, riverOrder: 4 }))).toBe(SURFACE_COST[10]);
  });

  it("비탈: 이웃 고도 차 가장 큰 값 ÷ 576m 몫만 바위 비용(해수면 아래는 0으로)", () => {
    const here = cell({ elevationM: 100 });
    expect(slopeRockPm(here, [])).toBe(0);
    expect(slopeRockPm(here, [cell({ elevationM: 100 + ROCK_FULL_RELIEF_M / 2 }), undefined])).toBe(500);
    expect(slopeRockPm(here, [cell({ elevationM: 5000 })])).toBe(1000);
    expect(slopeRockPm(cell({ elevationM: 0 }), [cell({ elevationM: -3000 })])).toBe(0);
    const flat = coordPacePm(here);
    const steep = coordPacePm(here, [cell({ elevationM: 100 + ROCK_FULL_RELIEF_M })]);
    expect(steep).toBe(SURFACE_COST[3]);
    expect(steep).toBeGreaterThan(flat);
  });

  it("이웃 2차맵 키는 넷(같은 면 안), 셀 키가 아니면 빈 목록", () => {
    const keys = neighborMapKeys(cellKey(0, 9, 100, 100));
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);
    expect(keys).toContain(cellKey(0, 9, 101, 100));
    expect(neighborMapKeys(-1)).toEqual([]);
  });
});

describe("coordPacePm", () => {
  it("모르는 값은 1000, 초지는 바닥 비중(풀 80·흙 20)의 지표 비용 평균", () => {
    expect(coordPacePm(undefined)).toBe(1000);
    const grass = SURFACE_COST[1] ?? 0;
    const dirt = SURFACE_COST[2] ?? 0;
    expect(coordPacePm(cell({}))).toBe(Math.floor((80 * grass + 20 * dirt) / 100));
  });

  it("숲 밀도만큼 숲 비용 배율, 눈 문턱 아래는 눈 비용, 바다·호수는 얕은 물 비용", () => {
    const base = coordPacePm(cell({}));
    expect(coordPacePm(cell({ forest: 255 }))).toBe(Math.floor((base * FOREST_COST_PM) / 1000));
    expect(coordPacePm(cell({ forest: 0 }))).toBeLessThan(coordPacePm(cell({ forest: 128 })));
    expect(coordPacePm(cell({ temperatureC: -10 }))).toBe(SURFACE_COST[6]);
    expect(coordPacePm(cell({ water: 1 }))).toBe(SURFACE_COST[10]);
    expect(coordPacePm(cell({ biomeId: "desert" }))).toBeGreaterThan(base);
    // 표에 없는 바이옴은 기본 비중
    expect(coordPacePm(cell({ biomeId: "unknown_biome" }))).toBeGreaterThanOrEqual(1000);
  });
});

const loaded = (key: number) => key === 10 || key === 13;

describe("hopPaceDistance", () => {
  const pace = new Map([
    [10, 1000],
    [11, 2000],
    [12, 1500],
    [13, 1000],
  ]);
  const paceOf = (key: number) => pace.get(key) ?? 1000;
  it("띄운 출발·도착 2차맵은 빼고 지나는 2차맵 배율을 고르게 평균해 곧은 거리에 곱한다", () => {
    expect(hopPaceDistance([10, 11, 12, 13], { from: 0, to: 3, distance: 1000 }, paceOf, loaded)).toBe(1750);
    // 띄우지 않은 목적지(좌표 유닛으로 섬)는 넣는다
    expect(hopPaceDistance([10, 11, 12], { from: 0, to: 2, distance: 1000 }, paceOf, loaded)).toBe(1750);
    // 셀 2차맵이 없으면 곧은 거리
    expect(hopPaceDistance([10, 13], { from: 0, to: 1, distance: 1000 }, paceOf, loaded)).toBe(1000);
  });
});
