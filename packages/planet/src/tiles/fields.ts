// 행성 생성기 출력(PlanetFields)과 물 비트 — ADR 2026-10-29-s2-planet-lod(36) "생성기 1판"의 출력 모양.
// 이 파일이 하나뿐인 정의다: 생성기(@terra/planet/generator)가 이 모양으로 내고, 타일 만들기(이 폴더)가 읽고,
// 렌더러(@terra/engine/planet)·서버가 물 비트를 여기서 가져온다. 모양을 바꾸면 생성기 결과 해시(generator/hash.ts)·
// 골든 해시·타일 형식(packages/protocol planetTile.ts)과 함께 고친다(PROTECTED).
// 타일 코드가 메타에서 읽는 값은 faceLevel뿐이다(generatorVersion·해시는 서버가 캐시 키·머리에 쓴다).
//
// 칸 순서: 면 레벨 F의 칸마다 index = 면 × n² + j × n + i (n = 2^F). 면·i·j는 @terra/planet의 칸 좌표와 같다.
import type { ContinentLayout, PlanetSettings } from "@terra/shared";
import { assertFaceLevel, cellsPerSide, isIntegerInRange } from "../levels.ts";

// ── water 비트 (ADR 36) ──
/** 바다 */
export const WATER_OCEAN = 1;
/** 호수 */
export const WATER_LAKE = 2;
/** 강(하천 등급 > 0인 육지 칸) */
export const WATER_RIVER = 4;
/** 해안: 바다와 맞닿은(8이웃) 바다가 아닌 칸 */
export const WATER_COAST = 8;
/** 수심 등급(2비트, 0~3)이 시작하는 비트: 등급 = (water & WATER_DEPTH_MASK) >> WATER_DEPTH_SHIFT */
export const WATER_DEPTH_SHIFT = 4;
/** 수심 등급 비트(4~5번) */
export const WATER_DEPTH_MASK = 0b11 << WATER_DEPTH_SHIFT;
/** 수심 등급: 0 바다 아님(모름), 1 연안, 2 대륙붕, 3 심해. 바다 칸에만 있다 */
export const DEPTH_NONE = 0;
export const DEPTH_COASTAL = 1;
export const DEPTH_SHELF = 2;
export const DEPTH_DEEP = 3;

export interface PlanetFieldsMeta {
  /** 생성기 버전(출력이 바뀌면 오른다). u32 */
  readonly generatorVersion: number;
  /** 시드(u32) */
  readonly seed: number;
  /** 면 레벨 F (4~14, 생성기 1판은 4~10) */
  readonly faceLevel: number;
  /** 생성에 쓴 세부 수치(프리셋 + 덮어쓰기를 풀어 쓴 값). 타일은 읽지 않는다 */
  readonly settings: PlanetSettings;
  /** 생성에 쓴 대륙 배치(정의에 있을 때만, ADR 2026-10-31-continent-layouts). 타일은 읽지 않는다 */
  readonly continents?: ContinentLayout | undefined;
  /**
   * 결과 해시: 모든 필드를 정해진 바이트 순서로 이은 FNV-1a 32비트(16진수 8자리, generator/hash.ts).
   * 타일은 읽지 않는다(서버는 캐시 목록에 적는다)
   */
  readonly hash: string;
}

/** 면 레벨 F 칸마다의 행성 값. 배열 길이는 모두 6 × 4^F */
export interface PlanetFields {
  /** 고도(게임 m, 해수면 0 기준. 실제 환산은 × 12, ADR 36). 바다·호수는 바닥 높이 */
  readonly elevationM: Int16Array;
  /** 바이옴 표 번호(행성 정의의 biomes 순서) */
  readonly biome: Uint8Array;
  /** 연평균 기온(°C) */
  readonly temperatureC: Int8Array;
  /** 연 강수(mm). 타일에는 넣지 않는다 */
  readonly precipitationMm: Uint16Array;
  /** 습도(0~255): 강수 ÷ 증발 가능량 + 강·호수 주변 */
  readonly humidity: Uint8Array;
  /** 물 비트: WATER_OCEAN·WATER_LAKE·WATER_RIVER·WATER_COAST + 4~5비트 수심 등급(DEPTH_*) */
  readonly water: Uint8Array;
  /** 하천 등급(Strahler 차수, 0 = 강 없음) */
  readonly river: Uint8Array;
  /** 숲 밀도(0~255) */
  readonly forest: Uint8Array;
  readonly meta: PlanetFieldsMeta;
}

/** 면 레벨 `faceLevel` 행성의 칸 수 = 6 × 4^F */
export function planetCellCount(faceLevel: number): number {
  const n = cellsPerSide(faceLevel);
  return 6 * n * n;
}

/** 배열 길이와 면 레벨이 맞는지 확인한다. 틀리면 RangeError */
export function assertPlanetFields(fields: PlanetFields): void {
  const { faceLevel, generatorVersion } = fields.meta;
  assertFaceLevel(faceLevel);
  if (!isIntegerInRange(generatorVersion, 0, 0xffff_ffff)) {
    throw new RangeError(`generator version must be a 32-bit unsigned integer: ${generatorVersion}`);
  }
  const count = planetCellCount(faceLevel);
  const arrays: readonly (readonly [string, ArrayLike<number>])[] = [
    ["elevationM", fields.elevationM],
    ["biome", fields.biome],
    ["temperatureC", fields.temperatureC],
    ["precipitationMm", fields.precipitationMm],
    ["humidity", fields.humidity],
    ["water", fields.water],
    ["river", fields.river],
    ["forest", fields.forest],
  ];
  for (const [name, array] of arrays) {
    if (array.length !== count) {
      throw new RangeError(`${name} has ${array.length} cells, face level ${faceLevel} needs ${count}`);
    }
  }
}
