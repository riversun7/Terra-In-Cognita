// 콘텐츠 팩(content/core)의 행성 정의를 생성기 입력으로 — 측정·그림 스크립트 전용.
// @terra/planet은 @terra/content를 가져올 수 없어서(경계 규칙) JSON을 직접 읽고 planetInputFromDefinition으로 확인한다.
// 팩 전체 검증(스키마·참조)은 pnpm check:content가 한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ContinentLayout, resolveContinentLayout } from "@terra/shared";
import {
  type PlanetGeneratorInput,
  parseContinentLayout,
  planetInputFromDefinition,
} from "../src/generator/index.ts";

const PACK_DIR = fileURLToPath(new URL("../../../content/core/", import.meta.url));

export interface TestPlanet {
  readonly input: PlanetGeneratorInput;
  /** 바이옴 번호 → 표시 색 "#rrggbb" */
  readonly colors: readonly string[];
  readonly biomeIds: readonly string[];
}

function entriesOf(file: string): readonly unknown[] {
  const parsed: unknown = JSON.parse(readFileSync(`${PACK_DIR}${file}`, "utf8"));
  const entries: unknown =
    parsed !== null && typeof parsed === "object" && "entries" in parsed ? parsed.entries : undefined;
  if (!Array.isArray(entries)) throw new Error(`${file} has no entries array`);
  return entries;
}

function field(value: unknown, name: string): unknown {
  return value !== null && typeof value === "object" ? Reflect.get(value, name) : undefined;
}

/** 팩의 행성 하나(기본 S2 시험 행성)를 읽는다. faceLevel을 주면 그 해상도로 바꾼다(편집기 미리보기와 같다) */
export function loadPackPlanet(id = "s2_test_planet", faceLevel?: number): TestPlanet {
  const planets = entriesOf("planets.json");
  const biomes = entriesOf("biomes.json");
  const planet = planets.find((entry) => field(entry, "id") === id);
  if (!planet) throw new Error(`planet ${id} is not in content/core/planets.json`);
  const input = planetInputFromDefinition(planet, biomes, faceLevel);
  const colors = input.biomes.map((biome) => {
    const color = field(
      biomes.find((entry) => field(entry, "id") === biome.id),
      "color",
    );
    return typeof color === "string" ? color : "#ff00ff";
  });
  return { input, colors, biomeIds: input.biomes.map((biome) => biome.id) };
}

/**
 * 측정 스크립트의 --continents 값 "<배치 종류>[:대륙 수]"(예: supercontinent, earthlike:4) → 풀어 쓴 대륙 배치.
 * 값이 없으면 undefined(팩 정의 그대로 = 노이즈 배치). 틀리면 RangeError
 */
export function continentsArgument(value: string | undefined): ContinentLayout | undefined {
  if (value === undefined) return undefined;
  const [layout, count] = value.split(":");
  return resolveContinentLayout(
    parseContinentLayout(count === undefined ? { layout } : { layout, count: Number(count) }),
  );
}

/** 입력에 대륙 배치를 얹는다(없으면 그대로) */
export function withContinents(
  input: PlanetGeneratorInput,
  continents: ContinentLayout | undefined,
): PlanetGeneratorInput {
  return continents === undefined ? input : { ...input, continents };
}
