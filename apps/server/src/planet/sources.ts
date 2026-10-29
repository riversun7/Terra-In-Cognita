// 행성 원본 — 서버가 굽는 행성 하나의 정보와 생성 함수(ADR 2026-10-29-s2-planet-lod "서버 굽기·전송").
// 서비스(service.ts)는 원본을 주입받는다. 시험은 합성 값을 바로 주는 원본을, 시작점(main.ts)은 [임시] TEMP_S2_PLANET을 쓴다.
// 실제 생성기가 합쳐지면 콘텐츠 팩의 행성(planets 분류)마다 원본을 만든다: 그때 PlanetSourceSpec에 종류를 더하고
// createPlanetSource가 생성기(generatePlanet)를 부르게 한다. 워커(bakeWorker.ts)도 같은 함수로 원본을 다시 만든다.
import { createHash } from "node:crypto";
import { sortKeys } from "@terra/content";
import type { PlanetFields } from "@terra/planet";
import { SYNTHETIC_BIOMES, SYNTHETIC_GENERATOR_VERSION, generateSyntheticPlanet } from "./synthetic.ts";

export interface LocalizedName {
  readonly ko: string;
  readonly en: string;
}

/** 바이옴 범례 한 줄 (목록 정보에 그대로 나간다: packages/protocol planetBiomeSchema) */
export interface PlanetBiomeLegend {
  /** 타일 바이옴 바이트 값 */
  readonly index: number;
  readonly id: string;
  /** "#rrggbb" */
  readonly colour: string;
  readonly name: LocalizedName;
}

/** [임시] 합성 행성 설명 (synthetic.ts) */
export interface SyntheticPlanetSpec {
  readonly kind: "synthetic";
  readonly id: string;
  readonly name: LocalizedName;
  readonly faceLevel: number;
  readonly seed: number;
}

/**
 * 워커가 원본을 다시 만들 수 있는 설명(구조화 복제로 보낼 수 있는 값만).
 * 실제 생성기가 합쳐지면 `{ kind: "generator", … 콘텐츠 팩 행성 정의 }`를 더한다.
 */
export type PlanetSourceSpec = SyntheticPlanetSpec;

export interface PlanetSource {
  /** 행성 ID = 콘텐츠 ID(영어 snake_case) */
  readonly id: string;
  readonly name: LocalizedName;
  /** 면 레벨(4~14). 굽기 전에 목록 정보에 쓴다 */
  readonly faceLevel: number;
  /** 생성기 버전. 캐시 키·타일 주소 버전에 들어간다 */
  readonly generatorVersion: number;
  /** 정의 해시(SHA-256 16진수 64자): 타일 내용을 정하는 입력(이름 제외). 캐시 키·타일 주소 버전에 들어간다 */
  readonly definitionHash: string;
  readonly biomes: readonly PlanetBiomeLegend[];
  /** 워커 굽기용 설명. 없으면 같은 스레드에서만 굽는다(시험) */
  readonly spec?: PlanetSourceSpec | undefined;
  /** 생성기 출력 */
  generate(): Promise<PlanetFields>;
}

/** 정의 해시: 키를 정렬한 JSON의 SHA-256 (키 순서만 다르면 같은 값) */
export function definitionHashOf(definition: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(sortKeys(definition)))
    .digest("hex");
}

/** 설명 → 원본. 메인 스레드(목록 정보·캐시 키)와 굽기 워커(생성)가 같은 함수를 쓴다 */
export function createPlanetSource(spec: PlanetSourceSpec): PlanetSource {
  // 종류가 늘면 여기서 고른다(지금은 합성 하나)
  const { id, name, faceLevel, seed } = spec;
  return {
    id,
    name,
    faceLevel,
    generatorVersion: SYNTHETIC_GENERATOR_VERSION,
    // 이름은 타일 내용과 무관해서 넣지 않는다(이름만 바꾸면 다시 굽지 않는다)
    definitionHash: definitionHashOf({ kind: spec.kind, faceLevel, seed }),
    biomes: SYNTHETIC_BIOMES,
    spec,
    generate: () => Promise.resolve(generateSyntheticPlanet({ faceLevel, seed })),
  };
}

/**
 * [임시] S2 시험 행성: 지구 크기(면 레벨 9, 칸 157만 개, 타일 2,046개)의 합성 행성.
 * 실제 생성기와 콘텐츠 팩 행성이 합쳐지면 지운다(ADR 36 "S2 시험 행성은 하나다").
 */
export const TEMP_S2_PLANET: SyntheticPlanetSpec = {
  kind: "synthetic",
  id: "s2_synthetic",
  name: { ko: "S2 합성 행성(임시)", en: "S2 synthetic planet (temporary)" },
  faceLevel: 9,
  seed: 20_261_029,
};
