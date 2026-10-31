// 소품 규칙 컴파일 시험 — 시험 사본이 팩과 같은지, 틀린 입력 거부, 곡선 값, 규칙 해시
import { describe, expect, it } from "vitest";
import mapPropsJson from "../../../../content/core/map_props.json";
import { AXIS, compileMapProps, curveValue, emptyPropRules, mapPropInputsFromJson } from "./props.ts";
import { TEST_MAP_PROPS } from "./testMapProps.ts";

const BIOMES = ["ocean_deep", "taiga", "desert"] as const;

const boulder = {
  id: "boulder",
  placement: "scatter",
  art: "boulder",
  cover: 2,
  biomes: [{ biome: "desert", weight: 10 }],
  curves: { slopePct: { min: 0, idealMin: 10, idealMax: 200, max: 600 } },
  clump: { cells: 16, threshold: 600 },
  maxShare: 30,
};

describe("2차맵 소품 규칙", () => {
  it("시험 사본이 팩 map_props와 같다(이름·설명 뺌). 다르면 사본을 고치고 골든 해시를 고친다", () => {
    const pack = mapPropsJson.entries.map(({ name: _name, ...rest }) => rest);
    expect(TEST_MAP_PROPS).toEqual(pack);
  });

  it("팩 규칙이 컴파일된다: 숲 항목과 흩기 항목, 쓰는 곡선 축", () => {
    const rules = compileMapProps(TEST_MAP_PROPS, ["taiga", "temperate_forest", "wetland"]);
    expect(rules.forest.length).toBeGreaterThan(0);
    expect(rules.scatter.length).toBeGreaterThan(0);
    expect(rules.axes & (1 << AXIS.temperature)).not.toBe(0);
    expect(rules.axes & (1 << AXIS.waterDistance)).not.toBe(0);
  });

  it("행성에 없는 바이옴 비중은 버리고, 팩 참조 모양({id})도 받는다", () => {
    const rules = compileMapProps(
      [
        {
          ...boulder,
          biomes: [
            { biome: { id: "desert" }, weight: 10 },
            { biome: "jungle", weight: 5 },
          ],
        },
      ],
      BIOMES,
    );
    expect([...(rules.scatter[0]?.biomeWeight ?? [])]).toEqual([0, 0, 10]);
    expect(rules.scatter[0]?.clumpLog2).toBe(4);
    expect(rules.scatter[0]?.maxShareCells).toBe(Math.floor((30 * 65_536) / 1000));
    expect(rules.scatter[0]?.curves[0]).toEqual({
      axis: AXIS.slope,
      min: 0,
      idealMin: 10,
      idealMax: 200,
      max: 600,
    });
  });

  it("곡선 단위: 기온은 1/100°C, 위도는 1/1000도로 바꿔 둔다", () => {
    const rules = compileMapProps(
      [
        {
          ...boulder,
          curves: {
            temperatureC: { min: -5, idealMin: 0, idealMax: 10, max: 20 },
            absLatitude: { min: 0, idealMin: 10, idealMax: 30, max: 60 },
          },
        },
      ],
      BIOMES,
    );
    expect(rules.scatter[0]?.curves).toEqual([
      { axis: AXIS.temperature, min: -500, idealMin: 0, idealMax: 1000, max: 2000 },
      { axis: AXIS.latitude, min: 0, idealMin: 10_000, idealMax: 30_000, max: 60_000 },
    ]);
  });

  it("틀린 입력은 RangeError: 그림·배치 방식·곡선 축·곡선 순서·엄폐·덩이·같은 ID", () => {
    const bad = [
      { ...boulder, art: "cactus" },
      { ...boulder, art: "none" },
      { ...boulder, placement: "grid" },
      { ...boulder, curves: { wind: { min: 0, idealMin: 1, idealMax: 2, max: 3 } } },
      { ...boulder, curves: { humidity: { min: 50, idealMin: 40, idealMax: 60, max: 90 } } },
      { ...boulder, curves: { humidity: { min: 0, idealMin: 0, idealMax: 0, max: 300 } } },
      { ...boulder, cover: 3 },
      { ...boulder, clump: { cells: 12, threshold: 500 } },
      { ...boulder, biomes: [{ biome: "desert", weight: 0 }] },
    ];
    for (const prop of bad)
      expect(() => compileMapProps([prop], BIOMES), JSON.stringify(prop)).toThrow(RangeError);
    expect(() => compileMapProps([boulder, boulder], BIOMES)).toThrow(RangeError);
  });

  it("곡선 값: min 이하·max 이상 0, 알맞은 범위 1000, 사이는 곧게(내림)", () => {
    const curve = { axis: 0, min: 0, idealMin: 10, idealMax: 20, max: 40 };
    expect([-1, 0, 5, 10, 15, 20, 30, 40, 41].map((value) => curveValue(curve, value))).toEqual([
      0, 0, 500, 1000, 1000, 1000, 500, 0, 0,
    ]);
    // min = idealMin이면 min에서 바로 1000
    expect(curveValue({ axis: 0, min: 5, idealMin: 5, idealMax: 9, max: 9 }, 5)).toBe(1000);
    expect(curveValue({ axis: 0, min: 5, idealMin: 5, idealMax: 9, max: 9 }, 9)).toBe(1000);
  });

  it("규칙 해시: 같은 규칙이면 같고, 값·차례·바이옴 표가 바뀌면 바뀐다", () => {
    const base = compileMapProps(TEST_MAP_PROPS, BIOMES).hash;
    expect(compileMapProps(TEST_MAP_PROPS, BIOMES).hash).toBe(base);
    expect(compileMapProps(TEST_MAP_PROPS.toReversed(), BIOMES).hash).not.toBe(base);
    expect(compileMapProps(TEST_MAP_PROPS, [...BIOMES, "tundra"]).hash).not.toBe(base);
    const edited = TEST_MAP_PROPS.map((prop) =>
      prop.id === "bush" ? { ...prop, biomes: [{ biome: "desert", weight: 9 }] } : prop,
    );
    expect(compileMapProps(edited, BIOMES).hash).not.toBe(base);
    expect(emptyPropRules(BIOMES).forest).toEqual([]);
  });
});

describe("map_props 원본 항목 읽기(편집기 2차맵 미리보기)", () => {
  it("팩 파일 항목이 시험 사본과 같은 규칙이 된다(이름·설명은 버린다)", () => {
    const biomes = ["taiga", "temperate_forest", "wetland", "desert"];
    const fromJson = compileMapProps(mapPropInputsFromJson(mapPropsJson.entries), biomes);
    expect(fromJson.hash).toBe(compileMapProps(TEST_MAP_PROPS, biomes).hash);
  });

  it("모양이 틀리면 TypeError", () => {
    expect(() => mapPropInputsFromJson([1])).toThrow(TypeError);
    expect(() => mapPropInputsFromJson([{ id: "a", art: "bush", placement: "scatter" }])).toThrow(TypeError);
    expect(() =>
      mapPropInputsFromJson([
        { id: "a", art: "bush", placement: "scatter", biomes: [{ biome: 3, weight: 1 }] },
      ]),
    ).toThrow(TypeError);
    expect(() =>
      mapPropInputsFromJson([
        { id: "a", art: "bush", placement: "scatter", biomes: [], curves: { humidity: { min: 1 } } },
      ]),
    ).toThrow(TypeError);
    expect(() =>
      mapPropInputsFromJson([{ id: "a", art: "bush", placement: "scatter", biomes: [], cover: "2" }]),
    ).toThrow(TypeError);
  });
});
