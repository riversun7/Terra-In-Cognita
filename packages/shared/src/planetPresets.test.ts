// 프리셋 → 세부 수치 시험 — 범위·순서·축 소유·덮어쓰기·오류, 그리고 수치표 고정(바뀌면 생성 결과가 바뀐다)
import { describe, expect, it } from "vitest";
import {
  CONTINENT_COUNT_RANGE,
  CONTINENT_LAYOUTS,
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  type PlanetPresetAxis,
  type PlanetPresets,
  type PlanetSettings,
} from "./planetDefinition.ts";
import {
  CONTINENT_LAYOUT_DEFAULT_COUNTS,
  NORMAL_PRESETS,
  PLANET_PRESET_VALUES,
  presetValues,
  resolveContinentLayout,
  resolvePlanetSettings,
} from "./planetPresets.ts";

/** "보통"에서 한 축만 바꾼 프리셋으로 풀어 쓴 수치 */
function at(axis: PlanetPresetAxis, level: string): PlanetSettings {
  return resolvePlanetSettings(Object.assign({}, NORMAL_PRESETS, { [axis]: level }));
}

/** 그 축의 단계들이 정하는 수치 이름 */
function ownedKeys(axis: PlanetPresetAxis): Set<string> {
  const keys = new Set<string>();
  for (const level of PLANET_PRESET_LEVELS[axis]) {
    for (const key of Object.keys(presetValues(axis, level))) keys.add(key);
  }
  return keys;
}

describe("프리셋 → 세부 수치", () => {
  it("모든 프리셋 값과 기본값은 공용 범위(@terra/shared) 안의 정수다", () => {
    const base = resolvePlanetSettings(NORMAL_PRESETS);
    for (const key of PLANET_SETTING_KEYS) {
      const [min, max] = PLANET_SETTING_RANGES[key];
      expect(Number.isInteger(base[key]), key).toBe(true);
      expect(base[key], key).toBeGreaterThanOrEqual(min);
      expect(base[key], key).toBeLessThanOrEqual(max);
    }
    for (const axis of PLANET_PRESET_AXES) {
      for (const level of PLANET_PRESET_LEVELS[axis]) {
        const resolved = at(axis, level);
        for (const key of PLANET_SETTING_KEYS) {
          const [min, max] = PLANET_SETTING_RANGES[key];
          expect(resolved[key], `${axis}=${level} ${key}`).toBeGreaterThanOrEqual(min);
          expect(resolved[key], `${axis}=${level} ${key}`).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it("단계는 이름 순서대로 커진다(군도 < 보통 < 대륙, 추움 < 더움, 젊은 산이 늙은 산보다 높고 덜 깎인다)", () => {
    const land = PLANET_PRESET_LEVELS.seaLevel.map((level) => at("seaLevel", level).landPercent);
    expect(land).toEqual([...land].toSorted((a, b) => a - b));
    expect(new Set(land).size).toBe(3);
    const cold = at("temperature", "cold");
    const hot = at("temperature", "hot");
    expect(cold.equatorTemperatureC).toBeLessThan(hot.equatorTemperatureC);
    expect(cold.poleTemperatureC).toBeLessThan(hot.poleTemperatureC);
    expect(at("precipitation", "dry").precipitationPercent).toBeLessThan(
      at("precipitation", "wet").precipitationPercent,
    );
    const young = at("mountains", "young");
    const old = at("mountains", "old");
    expect(young.upliftPercent).toBeGreaterThan(old.upliftPercent);
    expect(young.erosionPercent).toBeLessThan(old.erosionPercent);
    expect(at("plates", "few").plateCount).toBeLessThan(at("plates", "many").plateCount);
    expect(at("volcanism", "low").hotspotCount).toBeLessThan(at("volcanism", "high").hotspotCount);
  });

  it("축마다 자기 수치만 바꾼다", () => {
    const base = resolvePlanetSettings(NORMAL_PRESETS);
    for (const axis of PLANET_PRESET_AXES) {
      const owned = ownedKeys(axis);
      expect(owned.size, axis).toBeGreaterThan(0);
      for (const level of PLANET_PRESET_LEVELS[axis]) {
        const resolved = at(axis, level);
        for (const key of PLANET_SETTING_KEYS) {
          if (!owned.has(key)) expect(resolved[key], `${axis}=${level} ${key}`).toBe(base[key]);
        }
      }
    }
  });

  it("덮어쓰기가 프리셋보다 앞선다(undefined는 덮어쓰지 않는다)", () => {
    const presets: PlanetPresets = { ...NORMAL_PRESETS, seaLevel: "archipelago" };
    const resolved = resolvePlanetSettings(presets, {
      landPercent: 52,
      lakePercent: 0,
      poleTemperatureC: undefined,
    });
    expect(resolved.landPercent).toBe(52);
    expect(resolved.lakePercent).toBe(0);
    expect(resolved.poleTemperatureC).toBe(resolvePlanetSettings(NORMAL_PRESETS).poleTemperatureC);
  });

  it("범위 밖·정수 아님·모르는 단계·극이 적도보다 따뜻함은 RangeError", () => {
    expect(() => resolvePlanetSettings(NORMAL_PRESETS, { landPercent: 96 })).toThrow(RangeError);
    expect(() => resolvePlanetSettings(NORMAL_PRESETS, { plateCount: 3.5 })).toThrow(RangeError);
    expect(() => at("plates", "lots")).toThrow(RangeError);
    expect(() => resolvePlanetSettings(NORMAL_PRESETS, { equatorTemperatureC: -30 })).toThrow(RangeError);
  });

  it("수치표 고정: 값을 바꾸면 생성 결과가 바뀐다 → @terra/planet GENERATOR_VERSION을 올리고 이 값을 고친다", () => {
    expect(PLANET_PRESET_VALUES).toEqual({
      seaLevel: {
        archipelago: { landPercent: 15, shelfPercent: 11 },
        normal: { landPercent: 30, shelfPercent: 8 },
        continent: { landPercent: 45, shelfPercent: 7 },
      },
      temperature: {
        cold: { equatorTemperatureC: 20, poleTemperatureC: -38 },
        normal: { equatorTemperatureC: 27, poleTemperatureC: -24 },
        hot: { equatorTemperatureC: 34, poleTemperatureC: -8 },
      },
      precipitation: {
        dry: { precipitationPercent: 55 },
        normal: { precipitationPercent: 100 },
        wet: { precipitationPercent: 160 },
      },
      mountains: {
        young: { upliftPercent: 135, ruggednessPercent: 125, erosionPercent: 55 },
        normal: { upliftPercent: 100, ruggednessPercent: 100, erosionPercent: 100 },
        old: { upliftPercent: 60, ruggednessPercent: 75, erosionPercent: 190 },
      },
      plates: { few: { plateCount: 7 }, normal: { plateCount: 13 }, many: { plateCount: 24 } },
      volcanism: {
        low: { hotspotCount: 2, volcanismPercent: 50 },
        normal: { hotspotCount: 5, volcanismPercent: 100 },
        high: { hotspotCount: 12, volcanismPercent: 175 },
      },
    });
    // 프리셋 축이 정하지 않는 수치의 기본값
    const base = resolvePlanetSettings(NORMAL_PRESETS);
    expect([base.riverDensityPercent, base.lakePercent]).toEqual([100, 100]);
  });
});

describe("대륙 배치 → 배치 종류·대륙 수 (ADR 2026-10-31-continent-layouts)", () => {
  it("정의에 대륙 배치가 없으면 노이즈 배치(undefined)다", () => {
    expect(resolveContinentLayout(undefined)).toBeUndefined();
  });

  it("대륙 수를 적지 않으면 배치 종류의 기본값, 적으면 그 값", () => {
    expect(resolveContinentLayout({ layout: "supercontinent" })).toEqual({
      layout: "supercontinent",
      count: 1,
    });
    expect(resolveContinentLayout({ layout: "earthlike", count: undefined })).toEqual({
      layout: "earthlike",
      count: 3,
    });
    expect(resolveContinentLayout({ layout: "scattered", count: 1 })).toEqual({
      layout: "scattered",
      count: 1,
    });
    expect(resolveContinentLayout({ layout: "hemisphere", count: 10 })).toEqual({
      layout: "hemisphere",
      count: 10,
    });
  });

  it("기본 대륙 수는 대륙 수 범위 안이다", () => {
    const [min, max] = CONTINENT_COUNT_RANGE;
    for (const layout of CONTINENT_LAYOUTS) {
      const count = CONTINENT_LAYOUT_DEFAULT_COUNTS[layout];
      expect(Number.isInteger(count), layout).toBe(true);
      expect(count, layout).toBeGreaterThanOrEqual(min);
      expect(count, layout).toBeLessThanOrEqual(max);
    }
  });

  it("모르는 배치 종류·범위 밖·정수 아닌 대륙 수는 RangeError", () => {
    // 타입 밖 값(JSON에서 온 것처럼)
    const unknownLayout: Parameters<typeof resolveContinentLayout>[0] = JSON.parse('{"layout":"pangaea"}');
    expect(() => resolveContinentLayout(unknownLayout)).toThrow(RangeError);
    expect(() => resolveContinentLayout({ layout: "earthlike", count: 0 })).toThrow(RangeError);
    expect(() => resolveContinentLayout({ layout: "earthlike", count: 11 })).toThrow(RangeError);
    expect(() => resolveContinentLayout({ layout: "earthlike", count: 2.5 })).toThrow(RangeError);
  });

  it("수치표 고정: 기본 대륙 수를 바꾸면 그 배치를 쓰는 행성의 생성 결과가 바뀐다 → GENERATOR_VERSION", () => {
    expect(CONTINENT_LAYOUTS).toEqual(["supercontinent", "earthlike", "scattered", "hemisphere"]);
    expect(CONTINENT_COUNT_RANGE).toEqual([1, 10]);
    expect(CONTINENT_LAYOUT_DEFAULT_COUNTS).toEqual({
      supercontinent: 1,
      earthlike: 3,
      scattered: 6,
      hemisphere: 3,
    });
  });
});
