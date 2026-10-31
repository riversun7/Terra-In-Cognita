// 초안 모델 시험 — 프리셋 + 덮어쓰기, 프리셋 값과 같으면 덮어쓰기 지움, 프리셋 바꾸면 그 축 키 지움, 극 ≤ 적도, 시드 u32,
// 다시 배치 표시, 슬라이더 범위 = 생성기 입력 확인 표, 다른 필드는 그대로. 무작위로 고쳐도 늘 생성기가 받는 항목이다
import { planetInputFromDefinition, validatePlanetInput } from "@terra/planet/generator";
import {
  CONTINENT_COUNT_RANGE,
  CONTINENT_LAYOUTS,
  CONTINENT_LAYOUT_DEFAULT_COUNTS,
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  presetValues,
  resolvePlanetSettings,
} from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  CONTINENT_CHOICES,
  type DraftEntry,
  EDITOR_PRESET_AXES,
  RELAYOUT_PRESET_AXES,
  RELAYOUT_SETTING_KEYS,
  SEED_RELAYOUT,
  axisSettingKeys,
  continentRow,
  entryPresets,
  entrySeed,
  entrySettings,
  isSeed,
  pendingChangeCount,
  presetRows,
  presetSettings,
  sameEntry,
  settingRows,
  withContinentChoice,
  withContinentCount,
  withPreset,
  withSeed,
  withSetting,
  withoutContinentCount,
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
  it("프리셋 줄: 축 순서(판 개수 축은 빼고 — 대륙 모양 줄이 그 자리), 단계마다 정하는 값, 다시 배치 표시", () => {
    const rows = presetRows(TEST_PLANET);
    expect(EDITOR_PRESET_AXES).toEqual([
      "seaLevel",
      "temperature",
      "precipitation",
      "mountains",
      "volcanism",
    ]);
    expect(rows.map((row) => row.axis)).toEqual([...EDITOR_PRESET_AXES]);
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

describe("대륙 모양·대륙 수 (ADR 2026-10-31-continent-layouts)", () => {
  it("대륙 모양 줄: 노이즈(정의에 continents 없음) + 배치 종류 넷, 종류마다 기본 대륙 수, 노이즈는 대륙 수 없음", () => {
    expect(CONTINENT_CHOICES).toEqual(["noise", ...CONTINENT_LAYOUTS]);
    const row = continentRow(TEST_PLANET);
    expect(row).toMatchObject({
      choice: "noise",
      count: null,
      defaultCount: null,
      overridden: false,
      relayout: true,
    });
    expect([row.min, row.max]).toEqual([...CONTINENT_COUNT_RANGE]);
    expect(row.choices).toEqual([
      { choice: "noise", defaultCount: null },
      ...CONTINENT_LAYOUTS.map((layout) => ({
        choice: layout,
        defaultCount: CONTINENT_LAYOUT_DEFAULT_COUNTS[layout],
      })),
    ]);
  });

  it("종류를 고르면 continents = {layout}(대륙 수는 기본값), 노이즈를 고르면 필드를 뺀다(팩 행성과 같은 정의)", () => {
    const earth = withContinentChoice(TEST_PLANET, "earthlike");
    expect(earth.continents).toEqual({ layout: "earthlike" });
    expect(continentRow(earth)).toMatchObject({
      choice: "earthlike",
      count: 3,
      defaultCount: 3,
      overridden: false,
    });
    const back = withContinentChoice(earth, "noise");
    expect("continents" in back).toBe(false);
    expect(sameEntry(back, TEST_PLANET)).toBe(true);
  });

  it("대륙 수: 범위로 묶고 정수로, 기본값과 같으면 count를 지운다. 종류를 바꾸면 count도 지운다. 노이즈면 그대로", () => {
    const earth = withContinentChoice(TEST_PLANET, "earthlike");
    expect(withContinentCount(earth, 1).continents).toEqual({ layout: "earthlike", count: 1 });
    expect(withContinentCount(earth, 99).continents).toEqual({ layout: "earthlike", count: 10 });
    expect(withContinentCount(earth, 4.6).continents).toEqual({ layout: "earthlike", count: 5 });
    expect(withContinentCount(earth, 3).continents).toEqual({ layout: "earthlike" });
    expect(continentRow(withContinentCount(earth, 1))).toMatchObject({ count: 1, overridden: true });
    expect(withoutContinentCount(withContinentCount(earth, 1)).continents).toEqual({ layout: "earthlike" });
    expect(withContinentChoice(withContinentCount(earth, 1), "scattered").continents).toEqual({
      layout: "scattered",
    });
    expect(withContinentCount(TEST_PLANET, 2)).toBe(TEST_PLANET);
    expect(withContinentCount(earth, Number.NaN)).toBe(earth);
  });

  it("고친 항목은 생성기 입력이 되고, 판 개수 덮어쓰기와 프리셋은 그대로다", () => {
    const entry = withContinentCount(
      withContinentChoice(withSetting(TEST_PLANET, "plateCount", 30), "hemisphere"),
      5,
    );
    const input = planetInputFromDefinition(entry, PACK_BIOMES, 5);
    expect(input.continents).toEqual({ layout: "hemisphere", count: 5 });
    expect(input.settings.plateCount).toBe(30);
    expect(entryPresets(entry)).toEqual(entryPresets(TEST_PLANET));
  });

  it("틀린 대륙 배치는 RangeError", () => {
    expect(() => continentRow({ ...TEST_PLANET, continents: { layout: "pangaea" } })).toThrow(RangeError);
    expect(() => continentRow({ ...TEST_PLANET, continents: { layout: "earthlike", count: 0 } })).toThrow(
      RangeError,
    );
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

describe("적용 전 변경 수", () => {
  it("프리셋 축·덮어쓰기·시드마다 하나씩 센다(되돌리면 0)", () => {
    expect(pendingChangeCount(TEST_PLANET, TEST_PLANET)).toBe(0);
    const land = withSetting(TEST_PLANET, "landPercent", entrySettings(TEST_PLANET).landPercent + 3);
    expect(pendingChangeCount(TEST_PLANET, land)).toBe(1);
    const both = withSeed(withSetting(land, "plateCount", 30), 7);
    expect(pendingChangeCount(TEST_PLANET, both)).toBe(3);
    // 해수면 프리셋을 바꾸면 그 축의 덮어쓰기(육지 비율)가 지워진다 → 프리셋 1 + 지워진 덮어쓰기 1
    expect(pendingChangeCount(land, withPreset(land, "seaLevel", "continent"))).toBe(2);
    expect(pendingChangeCount(TEST_PLANET, withoutSetting(land, "landPercent"))).toBe(0);
    // 대륙 모양 하나, 대륙 수 하나
    const earth = withContinentChoice(TEST_PLANET, "earthlike");
    expect(pendingChangeCount(TEST_PLANET, earth)).toBe(1);
    expect(pendingChangeCount(earth, withContinentCount(earth, 5))).toBe(1);
    expect(pendingChangeCount(TEST_PLANET, withContinentCount(earth, 5))).toBe(2);
  });

  it("틀린 항목이면 다른 키 수를 센다", () => {
    const broken: DraftEntry = { ...TEST_PLANET, presets: { seaLevel: "nope" } };
    expect(pendingChangeCount(TEST_PLANET, broken)).toBe(1);
  });
});
