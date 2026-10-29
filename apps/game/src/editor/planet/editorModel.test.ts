// 초안 모델 시험 — 프리셋 + 덮어쓰기, 프리셋 값과 같으면 덮어쓰기 지움, 프리셋 바꾸면 그 축 키 지움, 극 ≤ 적도, 시드 u32,
// 다시 배치 표시, 슬라이더 범위 = 생성기 입력 확인 표, 다른 필드는 그대로. 무작위로 고쳐도 늘 생성기가 받는 항목이다
import { planetInputFromDefinition, validatePlanetInput } from "@terra/planet/generator";
import {
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  presetValues,
  resolvePlanetSettings,
} from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  type DraftEntry,
  RELAYOUT_PRESET_AXES,
  RELAYOUT_SETTING_KEYS,
  SEED_RELAYOUT,
  axisSettingKeys,
  entryPresets,
  entrySeed,
  entrySettings,
  isSeed,
  presetRows,
  presetSettings,
  sameEntry,
  settingRows,
  withPreset,
  withSeed,
  withSetting,
  withoutSetting,
} from "./editorModel.ts";
import { PACK_BIOMES, TEST_PLANET } from "./testDefinitions.ts";

/** 프리셋만의 값 */
const presetOf = (entry: DraftEntry) => presetSettings(entryPresets(entry));

describe("세부 수치", () => {
  it("슬라이더 줄: 표 순서, 범위는 생성기 입력 확인과 같은 표, 값은 프리셋 + 덮어쓰기", () => {
    const rows = settingRows(TEST_PLANET);
    expect(rows.map((row) => row.key)).toEqual([...PLANET_SETTING_KEYS]);
    for (const row of rows) {
      expect([row.min, row.max]).toEqual([...PLANET_SETTING_RANGES[row.key]]);
      expect(row.value).toBe(entrySettings(TEST_PLANET)[row.key]);
      expect(row.overridden).toBe(false);
      expect(row.relayout).toBe(RELAYOUT_SETTING_KEYS.has(row.key));
    }
  });

  it("프리셋 값과 다르면 덮어쓰고, 같아지면 지운다(빈 덮어쓰기는 필드째 뺀다)", () => {
    const preset = entrySettings(TEST_PLANET).landPercent;
    const changed = withSetting(TEST_PLANET, "landPercent", preset + 5);
    expect(changed.overrides).toEqual({ landPercent: preset + 5 });
    expect(settingRows(changed).find((row) => row.key === "landPercent")).toMatchObject({
      value: preset + 5,
      presetValue: preset,
      overridden: true,
    });
    const back = withSetting(changed, "landPercent", preset);
    expect("overrides" in back).toBe(false);
    expect(sameEntry(back, TEST_PLANET)).toBe(true);
  });

  it("정수로 반올림하고 표 범위로 묶는다. 수가 아니면 그대로", () => {
    const [min, max] = PLANET_SETTING_RANGES.plateCount;
    expect(withSetting(TEST_PLANET, "plateCount", 1e9).overrides).toEqual({ plateCount: max });
    expect(withSetting(TEST_PLANET, "plateCount", -5).overrides).toEqual({ plateCount: min });
    expect(withSetting(TEST_PLANET, "erosionPercent", 150.4).overrides).toEqual({ erosionPercent: 150 });
    expect(withSetting(TEST_PLANET, "erosionPercent", Number.NaN)).toBe(TEST_PLANET);
  });

  it("극 기온은 적도를, 적도 기온은 극을 넘지 않는다", () => {
    const { equatorTemperatureC, poleTemperatureC } = entrySettings(TEST_PLANET);
    const hotPole = withSetting(TEST_PLANET, "poleTemperatureC", equatorTemperatureC + 10);
    expect(entrySettings(hotPole).poleTemperatureC).toBe(equatorTemperatureC);
    const coldEquator = withSetting(TEST_PLANET, "equatorTemperatureC", poleTemperatureC - 10);
    expect(entrySettings(coldEquator).equatorTemperatureC).toBe(poleTemperatureC);
  });

  it("되돌리기: 덮어쓰기를 지운다. 그래서 극 > 적도가 되면 두 기온을 모두 프리셋으로", () => {
    let entry = withSetting(TEST_PLANET, "poleTemperatureC", -40);
    entry = withSetting(entry, "equatorTemperatureC", -30);
    entry = withSetting(entry, "riverDensityPercent", 150);
    expect(entrySettings(entry)).toMatchObject({ poleTemperatureC: -40, equatorTemperatureC: -30 });
    const reset = withoutSetting(entry, "poleTemperatureC");
    expect(reset.overrides).toEqual({ riverDensityPercent: 150 });
    expect(withoutSetting(reset, "riverDensityPercent").overrides).toBeUndefined();
  });
});

describe("프리셋", () => {
  it("프리셋 줄: 축 순서, 단계마다 정하는 값, 다시 배치 표시", () => {
    const rows = presetRows(TEST_PLANET);
    expect(rows.map((row) => row.axis)).toEqual([...PLANET_PRESET_AXES]);
    for (const row of rows) {
      expect(row.choices.map((choice) => choice.level)).toEqual([...PLANET_PRESET_LEVELS[row.axis]]);
      for (const choice of row.choices) {
        expect(choice.values).toEqual(presetValues(row.axis, choice.level));
      }
      expect(row.relayout).toBe(RELAYOUT_PRESET_AXES.has(row.axis));
    }
    expect([...RELAYOUT_PRESET_AXES]).toEqual(["seaLevel", "plates"]);
    expect([...RELAYOUT_SETTING_KEYS]).toEqual(["landPercent", "shelfPercent", "plateCount"]);
    expect(SEED_RELAYOUT).toBe(true);
  });

  it("축 키: 그 축의 어느 단계든 정하는 키", () => {
    expect(axisSettingKeys("seaLevel")).toEqual(["landPercent", "shelfPercent"]);
    expect(axisSettingKeys("temperature")).toEqual(["equatorTemperatureC", "poleTemperatureC"]);
  });

  it("단계를 바꾸면 그 축 키의 덮어쓰기만 지운다", () => {
    let entry = withSetting(TEST_PLANET, "landPercent", 12);
    entry = withSetting(entry, "plateCount", 40);
    const next = withPreset(entry, "seaLevel", "continent");
    expect(next.presets).toMatchObject({ seaLevel: "continent" });
    expect(next.overrides).toEqual({ plateCount: 40 });
    expect(entrySettings(next).landPercent).toBe(presetValues("seaLevel", "continent").landPercent);
    // 프리셋 키 순서는 축 순서
    expect(Object.keys(entryPresets(next))).toEqual([...PLANET_PRESET_AXES]);
    expect(presetOf(next)).toEqual(resolvePlanetSettings(entryPresets(next)));
  });

  it("틀린 항목(모르는 단계)은 RangeError", () => {
    const broken: DraftEntry = {
      ...TEST_PLANET,
      presets: { ...entryPresets(TEST_PLANET), seaLevel: "ocean" },
    };
    expect(() => settingRows(broken)).toThrow(RangeError);
    expect(() => withSetting(broken, "landPercent", 20)).toThrow(RangeError);
  });
});

describe("시드와 다른 필드", () => {
  it("시드는 u32만", () => {
    expect(entrySeed(withSeed(TEST_PLANET, 0xffff_ffff))).toBe(0xffff_ffff);
    expect(() => withSeed(TEST_PLANET, -1)).toThrow(RangeError);
    expect(() => withSeed(TEST_PLANET, 2 ** 32)).toThrow(RangeError);
    expect(() => withSeed(TEST_PLANET, 1.5)).toThrow(RangeError);
    expect(isSeed(7)).toBe(true);
    expect(isSeed("7")).toBe(false);
  });

  it("모델이 고치지 않는 필드(ID·이름·면 레벨·바이옴 표·모르는 필드)는 그대로", () => {
    const entry: DraftEntry = { ...TEST_PLANET, extra: { kept: true } };
    const next = withSeed(withPreset(withSetting(entry, "lakePercent", 300), "plates", "many"), 5);
    for (const key of ["id", "name", "description", "faceLevel", "biomes", "extra"]) {
      expect(next[key]).toEqual(entry[key]);
    }
  });

  it("같은지: 키 순서와 무관", () => {
    const reordered: DraftEntry = Object.fromEntries(Object.entries(TEST_PLANET).toReversed());
    expect(sameEntry(reordered, TEST_PLANET)).toBe(true);
    expect(sameEntry(withSeed(TEST_PLANET, 1), TEST_PLANET)).toBe(false);
  });
});

describe("무작위로 고쳐도", () => {
  it("늘 생성기가 받는 항목이다(프리셋·슬라이더·되돌리기 500번)", () => {
    // 작은 선형 합동 난수(시험 재현용)
    let state = 12345;
    const next = (): number => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31;
    };
    let entry: DraftEntry = TEST_PLANET;
    for (let step = 0; step < 500; step++) {
      const choice = next();
      const key = PLANET_SETTING_KEYS[Math.floor(next() * PLANET_SETTING_KEYS.length)] ?? "landPercent";
      const [min, max] = PLANET_SETTING_RANGES[key];
      if (choice < 0.6) {
        entry = withSetting(entry, key, min - 10 + next() * (max - min + 20));
      } else if (choice < 0.8) {
        entry = withoutSetting(entry, key);
      } else {
        const axis = PLANET_PRESET_AXES[Math.floor(next() * PLANET_PRESET_AXES.length)] ?? "seaLevel";
        const levels = PLANET_PRESET_LEVELS[axis];
        entry = withPreset(entry, axis, levels[Math.floor(next() * levels.length)] ?? levels[0]);
      }
      const input = planetInputFromDefinition(entry, PACK_BIOMES, 5);
      expect(() => validatePlanetInput(input)).not.toThrow();
      // 덮어쓰기에 프리셋 값과 같은 값은 없다
      const preset = presetOf(entry);
      const overrides = settingRows(entry).filter((row) => row.overridden);
      for (const row of overrides) expect(row.value).not.toBe(preset[row.key]);
    }
  });
});
