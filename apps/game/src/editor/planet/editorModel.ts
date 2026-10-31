// 초안 모델(순수) — ADR 38 2절, 설계 D.7 "Model rules". 화면은 이 함수들로만 초안 항목을 바꾼다.
// 초안 항목 = 콘텐츠 팩 planets.json 항목 모양의 JSON 객체(서버 초안 표·내보내기에 그대로 간다). 이 모델이 고치는 것은
// 프리셋(presets)·덮어쓰기(overrides)·시드(seed)뿐이고, 나머지 필드(ID·이름·면 레벨·바이옴 표 등)는 그대로 둔다.
// - 보이는 값 = resolvePlanetSettings(프리셋, 덮어쓰기). 슬라이더는 overrides[키]를 쓰고, 프리셋 값과 같아지면 지운다.
// - 프리셋 단계를 바꾸면 그 축이 정하는 키의 덮어쓰기를 지운다(presetValues).
// - 극 기온 ≤ 적도 기온을 지킨다(쓸 때 맞춘다). 시드는 u32.
// - 슬라이더 범위는 생성기 입력 확인(validatePlanetInput)과 같은 표(PLANET_SETTING_RANGES)에서 읽는다. 표에 줄이 늘면
//   (생성기 다양성 고침) 여기는 그대로 따라간다.
// - "다시 배치" 표시: 바꾸면 땅·바다 배치가 새로 바뀌는 값(육지 %, 대륙붕 %, 판 개수, 시드, 해수면·판 프리셋, 대륙 모양·수).
// - 대륙 모양(ADR 2026-10-31-continent-layouts): 정의의 continents {layout, count?}. "노이즈"는 필드가 없는 것(팩 행성과 같은
//   정의)이다. 대륙 수는 종류의 기본값과 같으면 count를 지운다(세부 수치 덮어쓰기와 같은 규칙). 프리셋 줄에서는 판 개수 축을
//   빼고(데이터의 presets.plates는 그대로 둔다) 대륙 모양 줄을 그 자리에 둔다. 판 개수는 세부 수치(plateCount)로 바꾼다.
import { parseContinentLayout, parsePlanetOverrides, parsePlanetPresets } from "@terra/planet/generator";
import {
  CONTINENT_COUNT_RANGE,
  CONTINENT_LAYOUTS,
  CONTINENT_LAYOUT_DEFAULT_COUNTS,
  type ContinentLayoutDefinition,
  type ContinentLayoutKind,
  PLANET_PRESET_AXES,
  PLANET_PRESET_LEVELS,
  PLANET_SETTING_KEYS,
  PLANET_SETTING_RANGES,
  type PlanetPresetAxis,
  type PlanetPresetLevel,
  type PlanetPresets,
  type PlanetSettingKey,
  type PlanetSettingOverrides,
  type PlanetSettings,
  presetValues,
  resolveContinentLayout,
  resolvePlanetSettings,
} from "@terra/shared";
import { stableJson } from "./stableJson.ts";

/** 초안 항목(planets.json 항목 모양의 JSON 객체) */
export type DraftEntry = Readonly<Record<string, unknown>>;

/** 초안을 시작한 공개본(서버 초안 표 base, 없을 수 있다) */
export interface DraftBase {
  /** 콘텐츠 버전 "<팩 ID>@<팩 버전>" */
  readonly contentVersion: string;
  /** 공개본 정의 해시(서버가 준 값) */
  readonly definitionHash: string;
  readonly generatorVersion: number;
}

/** 서버에 두는 초안 한 벌: 항목 + 기준 */
export interface DraftDocument {
  readonly entry: DraftEntry;
  readonly base: DraftBase | null;
}

/** 바꾸면 배치가 새로 바뀌는 세부 수치·프리셋 축(설계 C.2 4) */
export const RELAYOUT_SETTING_KEYS: ReadonlySet<PlanetSettingKey> = new Set<PlanetSettingKey>([
  "landPercent",
  "shelfPercent",
  "plateCount",
]);
export const RELAYOUT_PRESET_AXES: ReadonlySet<PlanetPresetAxis> = new Set<PlanetPresetAxis>([
  "seaLevel",
  "plates",
]);
/** 시드를 바꾸면 늘 배치가 새로 바뀐다 */
export const SEED_RELAYOUT = true;

/** 편집기 프리셋 줄에 보이는 축: 판 개수 축은 뺀다(대륙 모양 줄이 그 자리. 데이터의 presets.plates는 그대로 둔다) */
export const EDITOR_PRESET_AXES: readonly PlanetPresetAxis[] = PLANET_PRESET_AXES.filter(
  (axis) => axis !== "plates",
);

/** 대륙 모양 선택지: 노이즈(정의에 continents가 없음, 지금까지의 방식) + 배치 종류 */
export const CONTINENT_CHOICES = ["noise", ...CONTINENT_LAYOUTS] as const;
export type ContinentChoice = (typeof CONTINENT_CHOICES)[number];

const SEED_MAX = 0xffff_ffff;

export function isDraftEntry(value: unknown): value is DraftEntry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 프리셋(틀리면 RangeError) */
export function entryPresets(entry: DraftEntry): PlanetPresets {
  return parsePlanetPresets(entry.presets);
}

/** 덮어쓰기(모르는 키·정수 아님은 RangeError, 범위는 entrySettings가 본다) */
export function entryOverrides(entry: DraftEntry): PlanetSettingOverrides {
  return parsePlanetOverrides(entry.overrides);
}

export function isSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= SEED_MAX;
}

/** 시드(u32가 아니면 RangeError) */
export function entrySeed(entry: DraftEntry): number {
  const { seed } = entry;
  if (!isSeed(seed)) throw new RangeError("seed must be a u32 integer");
  return seed;
}

/** 프리셋만으로 정한 값(덮어쓰기 없음, 프리셋이 정하지 않는 키는 기본값) */
export function presetSettings(presets: PlanetPresets): PlanetSettings {
  return resolvePlanetSettings(presets);
}

/** 보이는 값 = 프리셋 + 덮어쓰기(틀리면 RangeError) */
export function entrySettings(entry: DraftEntry): PlanetSettings {
  return resolvePlanetSettings(entryPresets(entry), entryOverrides(entry));
}

type MutableOverrides = Partial<Record<PlanetSettingKey, number>>;

function copyOverrides(overrides: PlanetSettingOverrides): MutableOverrides {
  const copy: MutableOverrides = {};
  for (const key of PLANET_SETTING_KEYS) {
    const value = overrides[key];
    if (value !== undefined) copy[key] = value;
  }
  return copy;
}

/** 항목의 필드 하나를 바꾼 새 항목(value가 undefined면 필드를 뺀다) */
function withField(entry: DraftEntry, name: string, value: unknown): DraftEntry {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(entry)) if (key !== name) next[key] = item;
  if (value !== undefined) next[name] = value;
  return next;
}

/** 덮어쓰기를 표 순서로 적은 새 항목(비면 overrides 필드를 뺀다) */
function withOverrides(entry: DraftEntry, overrides: MutableOverrides): DraftEntry {
  const ordered: MutableOverrides = {};
  for (const key of PLANET_SETTING_KEYS) {
    const value = overrides[key];
    if (value !== undefined) ordered[key] = value;
  }
  return withField(entry, "overrides", Object.keys(ordered).length > 0 ? ordered : undefined);
}

/** 극 > 적도가 되면 두 기온 덮어쓰기를 모두 지운다(프리셋 값은 늘 극 ≤ 적도다) */
function keepTemperatureOrder(presets: PlanetPresets, overrides: MutableOverrides): MutableOverrides {
  const baseline = presetSettings(presets);
  const equator = overrides.equatorTemperatureC ?? baseline.equatorTemperatureC;
  const pole = overrides.poleTemperatureC ?? baseline.poleTemperatureC;
  if (pole <= equator) return overrides;
  const next = { ...overrides };
  delete next.equatorTemperatureC;
  delete next.poleTemperatureC;
  return next;
}

/**
 * 세부 수치 하나를 쓴다: 정수로 반올림하고 표 범위로 묶는다. 극 기온은 적도 기온을, 적도 기온은 극 기온을 넘지 않게 맞춘다.
 * 프리셋 값과 같으면 덮어쓰기를 지운다. 수가 아니면 그대로 둔다
 */
export function withSetting(entry: DraftEntry, key: PlanetSettingKey, value: number): DraftEntry {
  if (!Number.isFinite(value)) return entry;
  const [min, max] = PLANET_SETTING_RANGES[key];
  let next = Math.min(max, Math.max(min, Math.round(value)));
  const current = entrySettings(entry);
  if (key === "poleTemperatureC") next = Math.min(next, current.equatorTemperatureC);
  if (key === "equatorTemperatureC") next = Math.max(next, current.poleTemperatureC);
  const presets = entryPresets(entry);
  const overrides = copyOverrides(entryOverrides(entry));
  if (next === presetSettings(presets)[key]) delete overrides[key];
  else overrides[key] = next;
  return withOverrides(entry, overrides);
}

/** 세부 수치 하나를 프리셋 값으로 되돌린다(덮어쓰기를 지운다) */
export function withoutSetting(entry: DraftEntry, key: PlanetSettingKey): DraftEntry {
  const presets = entryPresets(entry);
  const overrides = copyOverrides(entryOverrides(entry));
  delete overrides[key];
  return withOverrides(entry, keepTemperatureOrder(presets, overrides));
}

function isSettingKey(value: string): value is PlanetSettingKey {
  const keys: readonly string[] = PLANET_SETTING_KEYS;
  return keys.includes(value);
}

/** 한 축이 (어느 단계에서든) 정하는 세부 수치 키 */
export function axisSettingKeys(axis: PlanetPresetAxis): PlanetSettingKey[] {
  const keys = new Set<PlanetSettingKey>();
  const levels: readonly PlanetPresetLevel<PlanetPresetAxis>[] = PLANET_PRESET_LEVELS[axis];
  for (const level of levels) {
    for (const key of Object.keys(presetValues(axis, level))) if (isSettingKey(key)) keys.add(key);
  }
  return PLANET_SETTING_KEYS.filter((key) => keys.has(key));
}

/** 프리셋 축의 단계를 바꾼다: 그 축이 정하는 키의 덮어쓰기를 지운다. 모르는 단계면 RangeError */
export function withPreset<A extends PlanetPresetAxis>(
  entry: DraftEntry,
  axis: A,
  level: PlanetPresetLevel<A>,
): DraftEntry {
  const checked = parsePlanetPresets({ ...entryPresets(entry), [axis]: level });
  const overrides = copyOverrides(entryOverrides(entry));
  for (const key of axisSettingKeys(axis)) delete overrides[key];
  const ordered: Record<string, string> = {};
  for (const name of PLANET_PRESET_AXES) ordered[name] = checked[name];
  return withOverrides(withField(entry, "presets", ordered), keepTemperatureOrder(checked, overrides));
}

/** 시드를 바꾼다(u32가 아니면 RangeError) */
export function withSeed(entry: DraftEntry, seed: number): DraftEntry {
  if (!isSeed(seed)) throw new RangeError("seed must be a u32 integer");
  return withField(entry, "seed", seed);
}

/** 대륙 배치 정의(없으면 undefined = 노이즈). 모르는 종류·필드·범위 밖 대륙 수는 RangeError */
export function entryContinents(entry: DraftEntry): ContinentLayoutDefinition | undefined {
  const definition = parseContinentLayout(entry.continents);
  resolveContinentLayout(definition);
  return definition;
}

/** 대륙 모양 줄: 고른 것, 보이는 대륙 수(노이즈는 null), 종류의 기본 대륙 수, 슬라이더 범위, 선택지 */
export interface ContinentRow {
  readonly choice: ContinentChoice;
  readonly count: number | null;
  readonly defaultCount: number | null;
  readonly overridden: boolean;
  readonly min: number;
  readonly max: number;
  readonly relayout: boolean;
  readonly choices: readonly { readonly choice: ContinentChoice; readonly defaultCount: number | null }[];
}

/** 대륙 모양 줄(틀린 대륙 배치면 RangeError) */
export function continentRow(entry: DraftEntry): ContinentRow {
  const definition = entryContinents(entry);
  const resolved = resolveContinentLayout(definition);
  const [min, max] = CONTINENT_COUNT_RANGE;
  return {
    choice: definition?.layout ?? "noise",
    count: resolved?.count ?? null,
    defaultCount: definition ? CONTINENT_LAYOUT_DEFAULT_COUNTS[definition.layout] : null,
    overridden: definition?.count !== undefined,
    min,
    max,
    relayout: true,
    choices: CONTINENT_CHOICES.map((choice) => ({
      choice,
      defaultCount: choice === "noise" ? null : CONTINENT_LAYOUT_DEFAULT_COUNTS[choice],
    })),
  };
}

/** 대륙 배치를 적은 새 항목(undefined면 필드를 뺀다 = 노이즈) */
function withContinents(entry: DraftEntry, definition: ContinentLayoutDefinition | undefined): DraftEntry {
  return withField(entry, "continents", definition);
}

/** 대륙 모양을 고른다(누르는 조작). 노이즈면 필드를 빼고, 종류면 {layout}(대륙 수는 그 종류의 기본값) */
export function withContinentChoice(entry: DraftEntry, choice: ContinentChoice): DraftEntry {
  return withContinents(entry, choice === "noise" ? undefined : { layout: choice });
}

/**
 * 대륙 수를 쓴다(슬라이더): 정수로 반올림하고 범위로 묶는다. 종류의 기본값과 같으면 count를 지운다. 노이즈이거나 수가
 * 아니면 그대로
 */
export function withContinentCount(entry: DraftEntry, value: number): DraftEntry {
  const definition = entryContinents(entry);
  if (!definition || !Number.isFinite(value)) return entry;
  const [min, max] = CONTINENT_COUNT_RANGE;
  const count = Math.min(max, Math.max(min, Math.round(value)));
  const layout: ContinentLayoutKind = definition.layout;
  return withContinents(
    entry,
    count === CONTINENT_LAYOUT_DEFAULT_COUNTS[layout] ? { layout } : { layout, count },
  );
}

/** 대륙 수를 종류의 기본값으로 되돌린다 */
export function withoutContinentCount(entry: DraftEntry): DraftEntry {
  const definition = entryContinents(entry);
  return definition ? withContinents(entry, { layout: definition.layout }) : entry;
}

/** 슬라이더 한 줄 */
export interface SettingRow {
  readonly key: PlanetSettingKey;
  /** 표 범위(생성기 입력 확인과 같은 표) */
  readonly min: number;
  readonly max: number;
  /** 보이는 값(프리셋 + 덮어쓰기) */
  readonly value: number;
  /** 프리셋만의 값 */
  readonly presetValue: number;
  readonly overridden: boolean;
  /** 바꾸면 배치가 새로 바뀐다 */
  readonly relayout: boolean;
}

/** 세부 수치 슬라이더 줄(표 순서). 항목이 틀리면 RangeError */
export function settingRows(entry: DraftEntry): SettingRow[] {
  const presets = entryPresets(entry);
  const overrides = entryOverrides(entry);
  const values = resolvePlanetSettings(presets, overrides);
  const baseline = presetSettings(presets);
  return PLANET_SETTING_KEYS.map((key) => {
    const [min, max] = PLANET_SETTING_RANGES[key];
    return {
      key,
      min,
      max,
      value: values[key],
      presetValue: baseline[key],
      overridden: overrides[key] !== undefined,
      relayout: RELAYOUT_SETTING_KEYS.has(key),
    };
  });
}

/** 프리셋 한 줄: 축, 고른 단계, 단계마다 정하는 값 */
export interface PresetRow {
  readonly axis: PlanetPresetAxis;
  readonly level: PlanetPresetLevel<PlanetPresetAxis>;
  readonly choices: readonly {
    readonly level: PlanetPresetLevel<PlanetPresetAxis>;
    readonly values: Partial<PlanetSettings>;
  }[];
  readonly relayout: boolean;
}

/** 프리셋 줄(편집기 축 순서, 판 개수 축 빼고). 항목이 틀리면 RangeError */
export function presetRows(entry: DraftEntry): PresetRow[] {
  const presets = entryPresets(entry);
  return EDITOR_PRESET_AXES.map((axis) => {
    const levels: readonly PlanetPresetLevel<PlanetPresetAxis>[] = PLANET_PRESET_LEVELS[axis];
    return {
      axis,
      level: presets[axis],
      choices: levels.map((level) => ({ level, values: presetValues(axis, level) })),
      relayout: RELAYOUT_PRESET_AXES.has(axis),
    };
  });
}

/** 두 항목이 같은가(키 순서 무관) */
export function sameEntry(a: DraftEntry, b: DraftEntry): boolean {
  return stableJson(a) === stableJson(b);
}

/** 두 초안 한 벌이 같은가(항목·기준) */
export function sameDocument(a: DraftDocument, b: DraftDocument): boolean {
  return stableJson(a) === stableJson(b);
}

/**
 * 적용 전 변경 수(설정 판의 "바뀐 값 N개") — 적용한 초안(applied)과 적용 전 초안(pending)에서 다른 조작부 수:
 * 프리셋 축마다 단계, 세부 수치마다 덮어쓰기(값·있고 없음), 시드, 대륙 모양, 대륙 수. 프리셋 단계를 바꿔 그 축의 덮어쓰기가 지워지면 그 줄도 센다.
 * 둘 중 하나가 틀린 항목이면(서버에 남은 옛 초안 등) 다른 키 수를 센다(0이 아니면 적용할 것이 있다)
 */
export function pendingChangeCount(applied: DraftEntry, pending: DraftEntry): number {
  try {
    const presetsA = entryPresets(applied);
    const presetsB = entryPresets(pending);
    const overridesA = entryOverrides(applied);
    const overridesB = entryOverrides(pending);
    let count = 0;
    for (const axis of PLANET_PRESET_AXES) if (presetsA[axis] !== presetsB[axis]) count++;
    for (const key of PLANET_SETTING_KEYS) if (overridesA[key] !== overridesB[key]) count++;
    if (applied.seed !== pending.seed) count++;
    const continentsA = entryContinents(applied);
    const continentsB = entryContinents(pending);
    if (continentsA?.layout !== continentsB?.layout) count++;
    if (continentsA?.count !== continentsB?.count) count++;
    return count;
  } catch {
    const keys = new Set([...Object.keys(applied), ...Object.keys(pending)]);
    let count = 0;
    for (const key of keys) if (stableJson(applied[key]) !== stableJson(pending[key])) count++;
    return count;
  }
}
