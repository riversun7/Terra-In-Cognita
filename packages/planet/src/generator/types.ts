// 행성 생성기 입력·출력 모양 — ADR 2026-10-29-s2-planet-lod "생성기 1판"
// 출력(PlanetFields)은 타일 굽기(서버)·편집기 미리보기가 함께 쓰는 약속이다. 모양을 바꾸면 그쪽과 함께 고친다.
import type { OceanDepthClass, PlanetSettings } from "@terra/shared";

/** 정수 범위: min은 포함, max는 포함하지 않는다. 없는 쪽은 끝이 없다 (콘텐츠 팩 biomes.json 규칙과 같은 모양) */
export interface BiomeRange {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

/**
 * 바이옴 규칙. 칸마다 바이옴 표를 앞에서부터 보고 처음 맞는 것을 고른다.
 * - ocean: 그 수심 등급의 바다. lake: 호수.
 * - land: 육지 중 연평균 기온(°C, 저장 값)·습도(0~255, 저장 값)·실제 환산 고도(게임 m × 12) 조건이 모두 맞는 칸.
 *   아무 육지 규칙도 맞지 않으면 표의 마지막 육지 바이옴이다.
 */
export type BiomeRule =
  | { readonly kind: "ocean"; readonly depthClass: OceanDepthClass }
  | { readonly kind: "lake" }
  | {
      readonly kind: "land";
      readonly temperatureC?: BiomeRange | undefined;
      readonly humidity?: BiomeRange | undefined;
      readonly realElevationM?: BiomeRange | undefined;
    };

/** 바이옴 표 한 줄 — 콘텐츠 팩 바이옴 항목에서 생성기가 쓰는 것만 (구조만 맞으면 항목을 그대로 넘겨도 된다) */
export interface PlanetBiome {
  readonly id: string;
  /** 기본 숲 밀도(0~255). 칸마다 습도에 따라 줄인다 */
  readonly forestDensity: number;
  readonly rule: BiomeRule;
}

/** 생성기 입력 = 풀어 쓴 행성 정의 */
export interface PlanetGeneratorInput {
  /**
   * 출력 해상도(면 레벨, 4~10): 면당 2^F × 2^F칸. 모양은 해상도와 무관하게 정해진다(길이는 모두 구 위 각도).
   * 그래서 편집기 미리보기는 같은 정의를 작은 면 레벨로 생성한다(ADR 36).
   */
  readonly faceLevel: number;
  /** 시드(u32) */
  readonly seed: number;
  /** 프리셋 + 덮어쓰기를 풀어 쓴 세부 수치(resolvePlanetSettings) */
  readonly settings: PlanetSettings;
  /** 바이옴 표. 출력 biome 값 = 이 배열의 위치. 바다·호수·육지 규칙이 하나씩은 있어야 한다 */
  readonly biomes: readonly PlanetBiome[];
}

export interface PlanetMeta {
  readonly generatorVersion: number;
  readonly seed: number;
  readonly faceLevel: number;
  /** 생성에 쓴 세부 수치(풀어 쓴 값) */
  readonly settings: PlanetSettings;
  /** 결과 해시: 모든 필드를 정해진 바이트 순서로 이은 FNV-1a 32비트(16진수 8자리, hash.ts) */
  readonly hash: string;
}

/**
 * 생성 결과. 칸 순서 = 면 × n² + j × n + i (n = 2^F, @terra/planet의 면·i·j와 같다). 배열 길이는 모두 6n².
 */
export interface PlanetFields {
  /** 고도(게임 m, 해수면 0 기준. 실제 환산은 × 12, ADR 36). 바다·호수는 바닥 높이 */
  readonly elevationM: Int16Array;
  /** 바이옴 표 번호 */
  readonly biome: Uint8Array;
  /** 연평균 기온(°C) */
  readonly temperatureC: Int8Array;
  /** 연 강수(mm) */
  readonly precipitationMm: Uint16Array;
  /** 습도(0~255): 강수 ÷ 증발 가능량 + 강·호수 주변 */
  readonly humidity: Uint8Array;
  /** 물 비트: WATER_OCEAN·WATER_LAKE·WATER_RIVER·WATER_COAST + 4~5비트 수심 등급(DEPTH_*) */
  readonly water: Uint8Array;
  /** 하천 등급(Strahler 차수, 0 = 강 없음) */
  readonly river: Uint8Array;
  /** 숲 밀도(0~255) */
  readonly forest: Uint8Array;
  readonly meta: PlanetMeta;
}

// ── water 바이트 ──
/** 바다 */
export const WATER_OCEAN = 1;
/** 호수 */
export const WATER_LAKE = 2;
/** 강(river > 0인 육지 칸) */
export const WATER_RIVER = 4;
/** 해안: 바다와 맞닿은(8이웃) 바다가 아닌 칸 */
export const WATER_COAST = 8;
/** 수심 등급 자리: (water >> 4) & 3 */
export const DEPTH_CLASS_SHIFT = 4;
export const DEPTH_CLASS_MASK = 0b11_0000;
/** 수심 등급: 0 바다 아님, 1 연안, 2 대륙붕, 3 심해 */
export const DEPTH_NONE = 0;
export const DEPTH_COASTAL = 1;
export const DEPTH_SHELF = 2;
export const DEPTH_DEEP = 3;

/** 생성 단계 이름 (진행 알림·측정용, 순서대로) */
export type GeneratorStage =
  | "grid"
  | "tectonics"
  | "seaLevel"
  | "flowDirections"
  | "climate"
  | "erosion"
  | "hydrology"
  | "surface"
  | "hash";
