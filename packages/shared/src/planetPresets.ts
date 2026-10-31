// 세계 설정 프리셋 → 세부 수치 (기획 D-154, ADR 2026-10-29-s2-planet-lod "행성 정의")
// 콘텐츠 팩 검증(@terra/content 스키마)과 행성 생성기(@terra/planet/generator)가 같은 표·같은 함수를 쓴다:
// 검증이 생성기와 같은 값으로 풀어 보고(극 기온 ≤ 적도 기온) 막을 수 있게 여기 둔다. 이름·범위는 planetDefinition.ts.
// 모든 값은 S2 임시값이다(placeholder). 값을 바꾸면 같은 정의의 생성 결과가 바뀌므로 @terra/planet GENERATOR_VERSION을
// 올리고 생성기 골든 해시와 이 표의 고정 시험(planetPresets.test.ts)을 함께 고친다(PROTECTED).
//
// 세부 수치의 뜻(단위)
// - landPercent(%): 육지 면적 비율. 해수면을 고도 분포의 이 백분위로 정한다.
// - shelfPercent(%): 바다 밑 대륙 지각(대륙붕) 면적. 대륙 지각 = 육지 + 이 값.
// - plateCount: 판 개수. upliftPercent(%): 판 경계 산맥·해구 세기. ruggednessPercent(%): 노이즈 기복.
// - erosionPercent(%): 침식 세기(강이 골짜기를 깎는 정도).
// - hotspotCount: 열점(화산섬 사슬) 개수. volcanismPercent(%): 화산호·열점 높이.
// - equatorTemperatureC·poleTemperatureC(°C, 절대값): 해수면 연평균 기온. 고도는 실제 환산 고도로 기온을 낮춘다.
// - precipitationPercent(%): 강수 배율. riverDensityPercent(%): 강 밀도. lakePercent(%): 웅덩이가 호수로 남는 정도.
import {
  CONTINENT_COUNT_RANGE,
  type ContinentLayout,
  type ContinentLayoutDefinition,
  type ContinentLayoutKind,
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_RANGES,
  isContinentLayoutKind,
  isPlanetPresetLevel,
  type PlanetPresetAxis,
  type PlanetPresetLevel,
  type PlanetPresets,
  type PlanetSettingKey,
  type PlanetSettingOverrides,
  type PlanetSettings,
} from "./planetDefinition.ts";

/** 모든 축 "보통" */
export const NORMAL_PRESETS: PlanetPresets = {
  seaLevel: "normal",
  temperature: "normal",
  precipitation: "normal",
  mountains: "normal",
  plates: "normal",
  volcanism: "normal",
};

/** 프리셋 축이 정하지 않는 수치의 기본값 */
const UNPRESET_DEFAULTS: Partial<PlanetSettings> = {
  riverDensityPercent: 100,
  lakePercent: 100,
};

type PresetTable = {
  readonly [A in PlanetPresetAxis]: { readonly [L in PlanetPresetLevel<A>]: Partial<PlanetSettings> };
};

/** 축 → 단계 → 그 단계가 정하는 수치 (S2 임시값) */
export const PLANET_PRESET_VALUES: PresetTable = {
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
  plates: {
    few: { plateCount: 7 },
    normal: { plateCount: 13 },
    many: { plateCount: 24 },
  },
  volcanism: {
    low: { hotspotCount: 2, volcanismPercent: 50 },
    normal: { hotspotCount: 5, volcanismPercent: 100 },
    high: { hotspotCount: 12, volcanismPercent: 175 },
  },
};

/** 한 축의 한 단계가 정하는 수치(편집기가 "이 단계는 무엇을 바꾸나"를 보여 줄 때도 쓴다) */
export function presetValues<A extends PlanetPresetAxis>(
  axis: A,
  level: PlanetPresetLevel<A>,
): Partial<PlanetSettings> {
  const table: Readonly<Record<string, Partial<PlanetSettings>>> = PLANET_PRESET_VALUES[axis];
  return table[level] ?? {};
}

/**
 * 프리셋 + 덮어쓰기 → 세부 수치(모든 이름). 값은 정수이고 공용 범위 안이어야 하며, 극 기온 ≤ 적도 기온이다.
 * 틀리면 RangeError. 콘텐츠 팩 검증(@terra/content planets.ts)이 같은 표로 범위와 극 ≤ 적도를 먼저 막는다.
 * 생성기는 팩을 거치지 않는 입력(편집기 슬라이더·시험)도 받으므로 여기서 한 번 더 본다.
 */
export function resolvePlanetSettings(
  presets: PlanetPresets,
  overrides: PlanetSettingOverrides = {},
): PlanetSettings {
  const values: Partial<Record<PlanetSettingKey, number>> = { ...UNPRESET_DEFAULTS };
  for (const axis of PLANET_PRESET_AXES) {
    const level: unknown = presets[axis];
    if (!isPlanetPresetLevel(axis, level)) {
      throw new RangeError(
        `unknown ${axis} preset "${String(level)}" (${PLANET_PRESET_LEVELS[axis].join(", ")})`,
      );
    }
    Object.assign(values, presetValues(axis, level));
  }
  const read = (key: PlanetSettingKey): number => {
    const value = overrides[key] ?? values[key];
    const [min, max] = PLANET_SETTING_RANGES[key];
    if (value === undefined || !Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`setting ${key} must be an integer in [${min}, ${max}]: ${String(value)}`);
    }
    return value;
  };
  const settings: PlanetSettings = {
    landPercent: read("landPercent"),
    shelfPercent: read("shelfPercent"),
    plateCount: read("plateCount"),
    upliftPercent: read("upliftPercent"),
    ruggednessPercent: read("ruggednessPercent"),
    erosionPercent: read("erosionPercent"),
    hotspotCount: read("hotspotCount"),
    volcanismPercent: read("volcanismPercent"),
    equatorTemperatureC: read("equatorTemperatureC"),
    poleTemperatureC: read("poleTemperatureC"),
    precipitationPercent: read("precipitationPercent"),
    riverDensityPercent: read("riverDensityPercent"),
    lakePercent: read("lakePercent"),
  };
  if (settings.poleTemperatureC > settings.equatorTemperatureC) {
    throw new RangeError(
      `poleTemperatureC (${settings.poleTemperatureC}) must not exceed equatorTemperatureC (${settings.equatorTemperatureC})`,
    );
  }
  return settings;
}

/**
 * 대륙 배치 종류 → 기본 대륙 수(ADR 2026-10-31-continent-layouts). 정의가 대륙 수를 적지 않으면 이 값이다.
 * 값을 바꾸면 그 배치를 쓰는 행성의 생성 결과가 바뀐다: GENERATOR_VERSION과 고정 시험을 함께 고친다(위 수치표와 같다)
 */
export const CONTINENT_LAYOUT_DEFAULT_COUNTS: { readonly [K in ContinentLayoutKind]: number } = {
  supercontinent: 1,
  earthlike: 3,
  scattered: 6,
  hemisphere: 3,
};

/**
 * 대륙 배치 정의 → 풀어 쓴 대륙 배치. 정의가 없으면 undefined(노이즈 배치). 대륙 수를 적지 않으면 종류의 기본값이다.
 * 모르는 종류, 범위(CONTINENT_COUNT_RANGE) 밖이거나 정수가 아닌 대륙 수는 RangeError
 */
export function resolveContinentLayout(
  definition: ContinentLayoutDefinition | undefined,
): ContinentLayout | undefined {
  if (definition === undefined) return undefined;
  const layout: unknown = definition.layout;
  if (!isContinentLayoutKind(layout)) throw new RangeError(`unknown continent layout "${String(layout)}"`);
  const count = definition.count ?? CONTINENT_LAYOUT_DEFAULT_COUNTS[layout];
  const [min, max] = CONTINENT_COUNT_RANGE;
  if (!Number.isInteger(count) || count < min || count > max) {
    throw new RangeError(`continent count must be an integer in [${min}, ${max}]: ${String(count)}`);
  }
  return { layout, count };
}
