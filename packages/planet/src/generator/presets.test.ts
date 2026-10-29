import {
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  type PlanetPresetAxis,
  type PlanetPresets,
  type PlanetSettings,
} from "@terra/shared";
import { describe, expect, it } from "vitest";
import { NORMAL_PRESETS, presetValues, resolvePlanetSettings } from "./presets.ts";

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
});
