// 행성 생성기 입력 모양 — ADR 2026-10-29-s2-planet-lod "생성기 1판"
// 출력(PlanetFields)과 물 비트는 @terra/planet 정수 진입점(tiles/fields.ts)에 하나만 정의한다. 타일 굽기(서버)·
// 편집기 미리보기·렌더러가 같은 정의를 쓴다. 모양을 바꾸면 그쪽과 함께 고친다.
import type { ContinentLayout, OceanDepthClass, PlanetSettings } from "@terra/shared";

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
   * 출력 해상도(면 레벨, @terra/shared PLANET_GENERATOR_FACE_LEVELS = 4~9): 면당 2^F × 2^F칸. 모양은 해상도와 무관하게
   * 정해진다(길이는 모두 구 위 각도).
   * 그래서 편집기 미리보기는 같은 정의를 작은 면 레벨로 생성한다(ADR 36).
   */
  readonly faceLevel: number;
  /** 시드(u32) */
  readonly seed: number;
  /** 프리셋 + 덮어쓰기를 풀어 쓴 세부 수치(resolvePlanetSettings) */
  readonly settings: PlanetSettings;
  /** 바이옴 표. 출력 biome 값 = 이 배열의 위치. 바다·호수·육지 규칙이 하나씩은 있어야 한다 */
  readonly biomes: readonly PlanetBiome[];
  /**
   * 대륙 배치(resolveContinentLayout, ADR 2026-10-31-continent-layouts). 없으면 대륙성 노이즈 배치(출력 판 3 그대로)다.
   * 서버 정의 해시는 이 값이 있을 때만 넣는다(없는 행성의 해시·캐시가 그대로)
   */
  readonly continents?: ContinentLayout | undefined;
}

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
