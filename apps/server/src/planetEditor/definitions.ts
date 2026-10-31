// 행성 편집기 정의 조회 자료 — 서버가 켤 때(요청을 받기 전) 한 번 만든다(ADR 2026-10-29-planet-editor-stage1 6·11절).
// 팩 버전·임시 여부·서버 생성기 판, 행성마다 원본 항목(팩 파일 JSON 그대로)·정의 해시·확인 해시, 바이옴 항목 전부,
// 2차맵 소품 규칙(map_props) 항목 전부(편집기 2차맵 미리보기).
// 행성 표본(planet_templates, "행성 표본" 절)도 같은 모양으로 싣는다. 표본은 굽지 않는다.
// 확인 해시 = 편집기 빠른 미리보기 레벨(min(5, 행성 면 레벨))로 생성한 결과 해시. 기기는 열 때 공개본을 같은 레벨로 만들어
// 견주고, 다르면 "이 기기의 미리보기는 서버와 다릅니다"를 띄우고 내보내기를 막는다. 해시 값은 코드·시험에 적지 않는다.
// 기기와 같은 길로 만든다: planetInputFromDefinition(원본 항목, 원본 바이옴 항목들, 레벨) → 생성기(기기 previewInput과 같다).
// 이 자료에는 시드가 들어 있다: 권한(planetEditor:read)을 본 뒤 감사 기록을 쓰고 나서만 보낸다(trpc/planetEditor.ts).
import { performance } from "node:perf_hooks";
import { GENERATOR_VERSION, generatePlanet, planetInputFromDefinition } from "@terra/planet/generator";
import { PLANET_EDITOR_CHECK_FACE_LEVEL } from "@terra/shared";
import type { RawPackEntries, ServerContent } from "../content.ts";
import {
  type PlanetSourceSpec,
  createPlanetSource,
  definitionHashOf,
  planetDefinitionForHash,
} from "../planet/sources.ts";
import type { JsonObject, PlanetEditorDefinitions, PlanetEditorPlanet } from "./types.ts";

/**
 * 행성 면 레벨 → 확인 레벨. 확인 레벨 = 편집기 빠른 미리보기 레벨(@terra/shared PLANET_EDITOR_CHECK_FACE_LEVEL, 기기
 * previewJobs.ts의 빠른 줄도 같은 값). 행성이 더 작으면 그 레벨(기기 빠른 줄도 min(그 값, 상한)이다)
 */
export function checkFaceLevelOf(planetFaceLevel: number): number {
  return Math.min(PLANET_EDITOR_CHECK_FACE_LEVEL, planetFaceLevel);
}

/** 행성 하나의 확인 해시를 만드는 데 걸린 시간 */
export interface PlanetCheckTiming {
  planetId: string;
  faceLevel: number;
  hash: string;
  /** 생성 시간(ms, 입력 풀기 포함) */
  ms: number;
}

export interface PlanetEditorBuild {
  definitions: PlanetEditorDefinitions;
  /** 팩 순서 */
  timings: PlanetCheckTiming[];
  /** 행성 표본 확인 해시(팩 순서) */
  templateTimings: PlanetCheckTiming[];
  /** 전체(확인 생성 + 항목 복사, ms) */
  totalMs: number;
}

export interface PlanetEditorBuildInput {
  content: ServerContent;
  /** 팩 파일의 원본 항목(src/content.ts) */
  raw: RawPackEntries;
  /** 서버가 굽는 행성 설명(src/planet/sources.ts planetSpecsFromPack, 팩 순서) */
  specs: readonly PlanetSourceSpec[];
  /** 시계(ms). 기본 performance.now */
  now?: () => number;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 원본 항목의 ID(문자열이 아니면 undefined) */
function idOf(entry: unknown): string | undefined {
  const id: unknown = isJsonObject(entry) ? entry.id : undefined;
  return typeof id === "string" ? id : undefined;
}

/** 원본 항목을 복사한다(팩 자료와 나눠 두려고). 객체가 아니면 팩이 틀린 것이라 던진다 */
function copyObject(entry: unknown, what: string): JsonObject {
  if (!isJsonObject(entry)) throw new TypeError(`${what} is not a JSON object`);
  const copy: unknown = structuredClone(entry);
  if (!isJsonObject(copy)) throw new TypeError(`${what} is not a JSON object`);
  return copy;
}

/**
 * 정의 조회 자료를 만든다. 팩 행성마다 확인 레벨로 한 번 생성한다(행성마다 약 0.2~0.4초, 같은 스레드).
 * 원본 항목이 없거나 생성기가 받지 않으면 던진다: 서버가 뜨지 않게 한다(팩이 틀린 것과 같다, main.ts)
 */
export function buildPlanetEditorDefinitions(input: PlanetEditorBuildInput): PlanetEditorBuild {
  const now = input.now ?? (() => performance.now());
  const started = now();
  const biomes = input.raw.biomes.map((entry, index) => copyObject(entry, `biomes.json entries[${index}]`));
  const rawById = new Map<string, unknown>();
  for (const entry of input.raw.planets) {
    const id = idOf(entry);
    if (id !== undefined) rawById.set(id, entry);
  }
  const timings: PlanetCheckTiming[] = [];
  const planets = input.specs.map((spec): PlanetEditorPlanet => {
    const raw = rawById.get(spec.id);
    if (raw === undefined) throw new RangeError(`planets.json has no entry for planet ${spec.id}`);
    const entry = copyObject(raw, `planets.json ${spec.id}`);
    const faceLevel = checkFaceLevelOf(spec.input.faceLevel);
    const at = now();
    // 기기 편집기와 같은 길: 원본 항목 + 원본 바이옴 항목들 → 생성기 입력(확인 레벨)
    const hash = generatePlanet(planetInputFromDefinition(entry, biomes, faceLevel)).meta.hash;
    timings.push({ planetId: spec.id, faceLevel, hash, ms: now() - at });
    return {
      id: spec.id,
      entry,
      // 목록 정보(GET /api/planets/<ID>)와 같은 값: 서버가 굽는 원본의 정의 해시
      definitionHash: createPlanetSource(spec).definitionHash,
      check: { faceLevel, hash },
    };
  });
  // 행성 표본: 서버가 굽지 않는다(원본·목록 정보·타일 없음). 정의 해시는 굽는 행성과 같은 식으로 생성기 입력에서 만들고,
  // 확인 해시도 행성처럼 확인 레벨로 한 번 만든다(표본마다 확인 레벨 생성 한 번, 굽기의 수백분의 일)
  const templateTimings: PlanetCheckTiming[] = [];
  const templates = input.raw.planetTemplates.map((raw, index): PlanetEditorPlanet => {
    const entry = copyObject(raw, `planet_templates.json entries[${index}]`);
    const id = idOf(entry);
    if (id === undefined) throw new RangeError(`planet_templates.json entries[${index}] has no id`);
    const definition = planetInputFromDefinition(entry, biomes);
    const faceLevel = checkFaceLevelOf(definition.faceLevel);
    const at = now();
    const hash = generatePlanet({ ...definition, faceLevel }).meta.hash;
    templateTimings.push({ planetId: id, faceLevel, hash, ms: now() - at });
    return {
      id,
      entry,
      definitionHash: definitionHashOf(planetDefinitionForHash(definition)),
      check: { faceLevel, hash },
    };
  });
  return {
    definitions: {
      contentVersion: input.content.version,
      placeholder: input.content.placeholder,
      generatorVersion: GENERATOR_VERSION,
      planets,
      templates,
      biomes,
      mapProps: input.raw.mapProps.map((entry, index) =>
        copyObject(entry, `map_props.json entries[${index}]`),
      ),
    },
    timings,
    templateTimings,
    totalMs: now() - started,
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

const timingFields = (timing: PlanetCheckTiming) => ({
  planetId: timing.planetId,
  checkFaceLevel: timing.faceLevel,
  checkHash: timing.hash,
  checkMs: round1(timing.ms),
});

/** 시작 로그 한 줄에 남길 값(시드·항목은 넣지 않는다): 행성·표본마다 확인 레벨·해시·걸린 시간 */
export function planetEditorLogFields(build: PlanetEditorBuild) {
  return {
    contentVersion: build.definitions.contentVersion,
    generatorVersion: build.definitions.generatorVersion,
    planets: build.timings.map(timingFields),
    templates: build.templateTimings.map(timingFields),
    totalMs: round1(build.totalMs),
  };
}

/** 시작 로그 메시지 */
export const PLANET_EDITOR_READY_MESSAGE = "planet editor definitions ready";
