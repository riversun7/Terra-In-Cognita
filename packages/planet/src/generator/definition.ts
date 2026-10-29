// 행성 정의(JSON 모양) → 생성기 입력 — 타입이 없는 값을 확인하며 바꾼다. 모양은 팩 planets.json·biomes.json과 같다.
// 받는 것: 파일에서 읽은 JSON, 편집기 가져오기, 콘텐츠 팩 검증 결과 항목(@terra/content `pack.entries`의 planets·biomes).
// 검증 결과에서는 바이옴 참조가 ID 문자열이 아니라 참조 객체(ContentRef, `id` 필드)라 둘 다 받는다.
import { OCEAN_DEPTH_CLASSES, PLANET_PRESET_AXES, isPlanetPresetLevel } from "@terra/shared";
import type { OceanDepthClass, PlanetPresets, PlanetSettingKey, PlanetSettingOverrides } from "@terra/shared";
import { PLANET_SETTING_KEYS } from "@terra/shared";
import { resolvePlanetSettings } from "./presets.ts";
import type { BiomeRange, BiomeRule, PlanetBiome, PlanetGeneratorInput } from "./types.ts";

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, what: string): Json {
  if (!isRecord(value)) throw new RangeError(`${what} must be an object`);
  return value;
}

function integer(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new RangeError(`${what} must be an integer`);
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== "string") throw new RangeError(`${what} must be a string`);
  return value;
}

function isDepthClass(value: unknown): value is OceanDepthClass {
  const classes: readonly unknown[] = OCEAN_DEPTH_CLASSES;
  return classes.includes(value);
}

/** 프리셋 {축: 단계} — 모르는 단계는 RangeError */
export function parsePlanetPresets(value: unknown): PlanetPresets {
  const raw = record(value, "presets");
  const level = <A extends (typeof PLANET_PRESET_AXES)[number]>(axis: A) => {
    const found = raw[axis];
    if (!isPlanetPresetLevel(axis, found)) throw new RangeError(`unknown ${axis} preset "${String(found)}"`);
    return found;
  };
  return {
    seaLevel: level("seaLevel"),
    temperature: level("temperature"),
    precipitation: level("precipitation"),
    mountains: level("mountains"),
    plates: level("plates"),
    volcanism: level("volcanism"),
  };
}

/** 덮어쓸 세부 수치 — 모르는 이름은 RangeError(범위는 resolvePlanetSettings가 본다) */
export function parsePlanetOverrides(value: unknown): PlanetSettingOverrides {
  if (value === undefined) return {};
  const raw = record(value, "overrides");
  const known: readonly string[] = PLANET_SETTING_KEYS;
  for (const key of Object.keys(raw))
    if (!known.includes(key)) throw new RangeError(`unknown setting "${key}"`);
  const overrides: Partial<Record<PlanetSettingKey, number>> = {};
  for (const key of PLANET_SETTING_KEYS) {
    if (raw[key] !== undefined) overrides[key] = integer(raw[key], `overrides.${key}`);
  }
  return overrides;
}

function parseRange(value: unknown, what: string): BiomeRange | undefined {
  if (value === undefined) return undefined;
  const raw = record(value, what);
  return {
    min: raw.min === undefined ? undefined : integer(raw.min, `${what}.min`),
    max: raw.max === undefined ? undefined : integer(raw.max, `${what}.max`),
  };
}

function parseRule(value: unknown, what: string): BiomeRule {
  const raw = record(value, what);
  if (raw.kind === "ocean") {
    if (!isDepthClass(raw.depthClass))
      throw new RangeError(`${what}.depthClass must be coastal, shelf or deep`);
    return { kind: "ocean", depthClass: raw.depthClass };
  }
  if (raw.kind === "lake") return { kind: "lake" };
  if (raw.kind === "land") {
    return {
      kind: "land",
      temperatureC: parseRange(raw.temperatureC, `${what}.temperatureC`),
      humidity: parseRange(raw.humidity, `${what}.humidity`),
      realElevationM: parseRange(raw.realElevationM, `${what}.realElevationM`),
    };
  }
  throw new RangeError(`${what}.kind must be ocean, lake or land`);
}

/** 바이옴 항목(biomes.json entries[]) → 생성기 바이옴 */
export function parsePlanetBiome(value: unknown): PlanetBiome {
  const raw = record(value, "biome");
  const id = text(raw.id, "biome.id");
  return {
    id,
    forestDensity: integer(raw.forestDensity, `biome ${id} forestDensity`),
    rule: parseRule(raw.rule, `biome ${id} rule`),
  };
}

/** 바이옴 참조 → ID: JSON의 ID 문자열, 또는 콘텐츠 팩 검증 결과의 참조 객체(ContentRef처럼 `id`가 문자열인 객체) */
function referenceId(value: unknown): string {
  if (isRecord(value)) return text(value.id, "planet.biomes[].id");
  return text(value, "planet.biomes[]");
}

/**
 * 행성 항목(planets.json entries[]) + 팩의 바이옴 항목들 → 생성기 입력. 바이옴 표는 행성의 biomes 순서다.
 * 서버 굽기는 콘텐츠 팩 검증 결과를 그대로 넘긴다: `planetInputFromDefinition(행성, pack.entries.get("biomes") ?? [])`.
 * @param faceLevel 주면 그 해상도로 생성한다(편집기 미리보기). 없으면 행성의 면 레벨
 */
export function planetInputFromDefinition(
  planet: unknown,
  biomeEntries: readonly unknown[],
  faceLevel?: number,
): PlanetGeneratorInput {
  const raw = record(planet, "planet");
  const byId = new Map<string, unknown>();
  for (const entry of biomeEntries) byId.set(text(record(entry, "biome").id, "biome.id"), entry);
  const list: unknown = raw.biomes;
  if (!Array.isArray(list)) throw new RangeError("planet.biomes must be an array");
  const refs: readonly unknown[] = list;
  const biomes = refs.map((reference) => {
    const id = referenceId(reference);
    const entry = byId.get(id);
    if (entry === undefined) throw new RangeError(`planet.biomes refers to a missing biome "${id}"`);
    return parsePlanetBiome(entry);
  });
  return {
    faceLevel: faceLevel ?? integer(raw.faceLevel, "planet.faceLevel"),
    seed: integer(raw.seed, "planet.seed"),
    settings: resolvePlanetSettings(parsePlanetPresets(raw.presets), parsePlanetOverrides(raw.overrides)),
    biomes,
  };
}
