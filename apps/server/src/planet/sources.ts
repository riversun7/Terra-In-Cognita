// 행성 원본 — 서버가 굽는 행성 하나의 정보와 생성 함수(ADR 2026-10-29-s2-planet-lod "서버 굽기·전송").
// 원본은 콘텐츠 팩의 행성(planets 분류)마다 하나다(planetSpecsFromPack). 생성은 생성기 1판(@terra/planet/generator)이다.
// 서비스(service.ts)는 원본을 주입받는다. 굽기 워커(bakeWorker.ts)는 설명(spec)만 받아 같은 함수(createPlanetSource)로
// 원본을 다시 만든다: 설명 = 생성기 입력(풀어 쓴 정의, 구조화 복제할 수 있는 순수 JSON) + 범례.
import { createHash } from "node:crypto";
import { type ContentPack, biomeEntrySchema, localizedText, sortKeys } from "@terra/content";
import type { PlanetFields } from "@terra/planet";
import {
  GENERATOR_VERSION,
  type PlanetGeneratorInput,
  planetInputFromDefinition,
  runPlanetGenerator,
  validatePlanetInput,
} from "@terra/planet/generator";

export interface LocalizedName {
  readonly ko: string;
  readonly en: string;
}

/** 바이옴 범례 한 줄 (목록 정보에 그대로 나간다: packages/protocol planetBiomeSchema) */
export interface PlanetBiomeLegend {
  /** 타일 바이옴 바이트 값 = 행성 정의 biomes 안의 위치 */
  readonly index: number;
  readonly id: string;
  /** "#rrggbb" */
  readonly colour: string;
  readonly name: LocalizedName;
}

/** 워커가 원본을 다시 만들 수 있는 설명(구조화 복제로 보낼 수 있는 값만) */
export interface PlanetSourceSpec {
  readonly kind: "generator";
  /** 행성 ID = 콘텐츠 ID */
  readonly id: string;
  readonly name: LocalizedName;
  /** 생성기 입력(planetInputFromDefinition 결과). 타일 내용은 이것과 생성기 버전·타일 형식 버전으로 정해진다 */
  readonly input: PlanetGeneratorInput;
  /** 바이옴 범례(행성 biomes 순서) */
  readonly biomes: readonly PlanetBiomeLegend[];
}

export interface PlanetSource {
  /** 행성 ID = 콘텐츠 ID(영어 snake_case) */
  readonly id: string;
  readonly name: LocalizedName;
  /** 면 레벨(4~14). 굽기 전에 목록 정보에 쓴다 */
  readonly faceLevel: number;
  /** 생성기 버전. 캐시 키·타일 주소 버전에 들어간다 */
  readonly generatorVersion: number;
  /** 정의 해시(SHA-256 16진수 64자): 타일 내용을 정하는 입력(이름·설명·색 제외). 캐시 키·타일 주소 버전에 들어간다 */
  readonly definitionHash: string;
  readonly biomes: readonly PlanetBiomeLegend[];
  /** 워커 굽기용 설명. 없으면 같은 스레드에서만 굽는다(시험) */
  readonly spec?: PlanetSourceSpec | undefined;
  /** 생성기 출력. onStage는 생성 단계가 끝날 때마다 불린다(워커가 그때 메모리를 잰다) */
  generate(onStage?: () => void): Promise<PlanetFields>;
}

/** 정의 해시: 키를 정렬한 JSON의 SHA-256 (키 순서만 다르면 같은 값) */
export function definitionHashOf(definition: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeys(definition)))
    .digest("hex");
}

/**
 * 정의 해시에 넣는 값 = 타일 내용을 정하는 것 모두: 면 레벨, 시드, 풀어 쓴 세부 수치(프리셋 + 덮어쓰기),
 * 바이옴 표(행성 biomes 순서의 ID·숲 밀도·판정 규칙), 대륙 배치(있을 때만, ADR 2026-10-31-continent-layouts).
 * 대륙 배치가 없는 행성은 칸을 아예 두지 않아 해시가 대륙 배치를 더하기 전과 같다(캐시를 다시 굽지 않는다).
 * 이름·설명·색은 넣지 않는다(바꿔도 다시 굽지 않는다. 범례는 목록 정보로 나가고 목록 정보는 늘 새로 확인한다).
 * 생성기 버전·타일 형식 버전은 캐시 키에 따로 있다.
 */
export function planetDefinitionForHash(input: PlanetGeneratorInput): unknown {
  const definition = {
    kind: "generator",
    faceLevel: input.faceLevel,
    seed: input.seed,
    settings: input.settings,
    biomes: input.biomes.map(({ id, forestDensity, rule }) => ({ id, forestDensity, rule })),
  };
  const { continents } = input;
  return continents === undefined
    ? definition
    : { ...definition, continents: { layout: continents.layout, count: continents.count } };
}

/** 설명 → 원본. 메인 스레드(목록 정보·캐시 키)와 굽기 워커(생성)가 같은 함수를 쓴다 */
export function createPlanetSource(spec: PlanetSourceSpec): PlanetSource {
  const { id, name, input, biomes } = spec;
  return {
    id,
    name,
    faceLevel: input.faceLevel,
    generatorVersion: GENERATOR_VERSION,
    definitionHash: definitionHashOf(planetDefinitionForHash(input)),
    biomes,
    spec,
    generate: (onStage) => Promise.resolve(runPlanetGenerator(input, { onStage: () => onStage?.() }).fields),
  };
}

/** 검증을 통과한 팩 항목에서 이름(ko·en)을 읽는다 */
function nameOf(entry: { id: string }): LocalizedName {
  return localizedText.parse("name" in entry ? entry.name : undefined);
}

/**
 * 콘텐츠 팩(1·2·4a단계를 통과한 것) → 행성 설명들(팩 순서). 서버가 시작할 때 부른다.
 * 생성기가 받지 않는 정의(면 레벨·세부 수치 범위, 바다·호수·육지 규칙이 없는 바이옴 표 등)면 RangeError를 던진다:
 * 굽기를 거듭 실패하느니 서버가 뜨지 않게 한다(팩이 틀린 것과 같다).
 */
export function planetSpecsFromPack(pack: ContentPack): PlanetSourceSpec[] {
  const biomeEntries = pack.entries.get("biomes") ?? [];
  const biomesById = new Map(biomeEntries.map((entry) => [entry.id, biomeEntrySchema.parse(entry)]));
  return (pack.entries.get("planets") ?? []).map((planet) => {
    const input = planetInputFromDefinition(planet, biomeEntries);
    validatePlanetInput(input);
    const biomes = input.biomes.map((biome, index): PlanetBiomeLegend => {
      const entry = biomesById.get(biome.id);
      if (!entry) throw new RangeError(`planet ${planet.id} refers to a missing biome ${biome.id}`);
      return { index, id: entry.id, colour: entry.color, name: { ko: entry.name.ko, en: entry.name.en } };
    });
    return { kind: "generator", id: planet.id, name: nameOf(planet), input, biomes };
  });
}
