// 행성 생성기 출력(PlanetFields) — ADR 2026-10-29-s2-planet-lod(36) "생성기 1판"의 출력 모양. 타일 만들기(이 폴더)가 읽는다.
// 생성기 코드는 아직 main에 없다. 이 정의는 ADR이 정한 모양을 그대로 적은 것이고, 생성기가 합쳐질 때 하나로 맞춘다.
// 타일 코드가 메타에서 읽는 값은 faceLevel뿐이다(generatorVersion·해시는 서버가 캐시 키·머리에 쓴다).
//
// 칸 순서: 면 레벨 F의 칸마다 index = 면 × n² + j × n + i (n = 2^F). 면·i·j는 @terra/planet의 칸 좌표와 같다.
import { assertFaceLevel, cellsPerSide, isIntegerInRange } from "../levels.ts";

// ── water 비트 (ADR 36) ──
/** 바다 */
export const WATER_OCEAN = 1;
/** 호수 */
export const WATER_LAKE = 2;
/** 강 */
export const WATER_RIVER = 4;
/** 해안 */
export const WATER_COAST = 8;
/** 수심 등급(2비트, 0~3)이 시작하는 비트 */
export const WATER_DEPTH_SHIFT = 4;
/** 수심 등급 비트(4~5번) */
export const WATER_DEPTH_MASK = 0b11 << WATER_DEPTH_SHIFT;

export interface PlanetFieldsMeta {
  /** 생성기 버전(출력이 바뀌면 오른다). u32 */
  readonly generatorVersion: number;
  /** 시드(u32) */
  readonly seed: number;
  /** 면 레벨 F (4~14) */
  readonly faceLevel: number;
  /** 풀어 쓴 설정값(프리셋 + 덮어쓰기). 타일은 읽지 않는다 */
  readonly settings: Readonly<Record<string, unknown>>;
  /** 결과 해시(FNV-1a, 16진수). 타일은 읽지 않는다 */
  readonly hash: string;
}

/** 면 레벨 F 칸마다의 행성 값. 배열 길이는 모두 6 × 4^F */
export interface PlanetFields {
  /** 고도(게임 m, 해수면 0) */
  readonly elevationM: Int16Array;
  /** 바이옴 표 번호 */
  readonly biome: Uint8Array;
  /** 연평균 기온(°C) */
  readonly temperatureC: Int8Array;
  /** 연 강수(mm). 타일에는 넣지 않는다 */
  readonly precipitationMm: Uint16Array;
  /** 습도(0~255) */
  readonly humidity: Uint8Array;
  /** 물 비트(WATER_*) */
  readonly water: Uint8Array;
  /** 하천 등급(0 없음) */
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
