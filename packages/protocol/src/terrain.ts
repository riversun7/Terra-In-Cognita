// 2차맵 지형 이진 형식 — HTTP로 받는다(버전 붙은 불변 주소, 로그인 필요). ADR 2026-10-28-s1-second-map.md
// WebSocket 메시지가 아니라서 PROTOCOL_VERSION과 무관하다. 형식이 바뀌면 TERRAIN_FORMAT_VERSION을 올린다.
// 브라우저·Node 공통 코드(DataView만 쓴다). 모든 수는 작은 끝(little-endian)이다.
//
// 머리(32바이트)
//   0  u8×4  마법 값 "TCTR"
//   4  u16   형식 버전 (TERRAIN_FORMAT_VERSION)
//   6  u16   머리 길이(바이트). 읽는 쪽은 이만큼 건너뛰고 본문을 읽는다(머리를 늘려도 옛 기기가 읽게)
//   8  u32   생성기 버전 (S1 임시 지형 = packages/sim TEMP_TERRAIN_GENERATOR_VERSION)
//  12  u32   시드
//  16  u16   지형 칸 수 한 변 N (128)
//  18  u16   꼭짓점 수 한 변 N + 1 (129)
//  20  u32   결과 해시(packages/sim terrainHash, FNV-1a 32비트)
//  24  u32   2차맵 키 아래 32비트
//  28  u32   2차맵 키 위 비트(셀 키는 2^52 미만)
// 본문
//  꼭짓점 높이 i32 × (N + 1)²  (cm, 해수면 0 기준, 행 우선 y × (N + 1) + x)
//  지표 종류   u8  × N²        (TERRAIN_SURFACE, 행 우선 y × N + x)
// 숨김 정보(자원·크리쳐)는 넣지 않는다(ADR 2026-10-28-fog-and-map-visibility).
//
// 2판(행성 값에서 만든 2차맵, ADR 2026-10-31-second-map-from-planet 6절): 머리 64바이트. 앞 32바이트는 1판과 같은 뜻이다
// (생성기 버전 = 2차맵 생성기 판, 시드 = 행성 시드). 더한 머리:
//  32  u32   행성 생성기 판(GENERATOR_VERSION)
//  36  u32   행성 정의 해시(16진수 앞 8자리)
//  40  u32   지형 칸 한 변 실제 길이(mm, 표시용)
//  44  u16   배치 칸 수 한 변 P(256, 엄폐·소품 층이 없으면 0)
//  46  u16   깃발: 1 = 물 높이 층, 2 = 엄폐 층, 4 = 소품 그림 층
//  48~63     예약(0)
// 본문: 높이 → (깃발 1) 꼭짓점 물 높이 i32 × (N + 1)²(cm, 물 없음 = −2^31) → 지표 → (깃발 2) 배치 칸 엄폐 값 u8 × P²
//  → (깃발 4) 배치 칸 소품 그림 번호 u8 × P²(@terra/shared MAP_PROP_ARTS, 기기 장식용. 판정에 쓰지 않는다).
// 읽는 쪽은 1판·2판을 모두 읽는다.
import { ProtocolError } from "./errors.ts";

/** 쓰는 형식의 가장 새 판(2판 칸이 있으면 2판, 없으면 1판으로 쓴다) */
export const TERRAIN_FORMAT_VERSION = 2;
/** 1판 형식 번호·머리 길이(S1 임시 지형) */
export const TERRAIN_FORMAT_V1 = 1;
export const TERRAIN_HEADER_BYTES = 32;
/** 2판 머리 길이 */
export const TERRAIN_HEADER_BYTES_V2 = 64;
/** 물이 없는 꼭짓점의 물 높이 */
export const TERRAIN_NO_WATER = -2_147_483_648;
const FLAG_WATER = 1;
const FLAG_COVER = 2;
const FLAG_ART = 4;
/** 마법 값 "TCTR"(Terra Cognita TeRrain)의 바이트 */
const MAGIC = [0x54, 0x43, 0x54, 0x52] as const;

/**
 * 지표 종류 번호. 0~3은 S1 임시 지형(packages/sim SURFACE_*)과 같고, 전체는 2차맵 생성기(packages/planet SM_SURFACE)와 같다
 * — 서버 시험이 둘 다 확인한다. 한 번 쓴 번호는 다른 뜻으로 다시 쓰지 않는다(기획 질문 124 기술 기본안).
 */
export const TERRAIN_SURFACE = {
  water: 0,
  grass: 1,
  dirt: 2,
  rock: 3,
  sand: 4,
  gravel: 5,
  snow: 6,
  ice: 7,
  mud: 8,
  ash: 9,
  shallowWater: 10,
} as const;

/** 서버 경로(Fastify 형식). 주소는 terrainPath로 만든다 */
export const TERRAIN_ROUTE = "/api/maps/:mapKey/terrain";

/** 버전이 붙은 주소는 내용이 바뀌지 않는다. 로그인한 사람에게만 주므로 공유 캐시(프록시)에는 두지 않는다 */
export const TERRAIN_CACHE_CONTROL = "private, max-age=31536000, immutable";

/** 지형 주소: /api/maps/<2차맵 키>/terrain?v=<생성기 버전> */
export function terrainPath(mapKey: number, generatorVersion: number): string {
  return `/api/maps/${mapKey}/terrain?v=${generatorVersion}`;
}

export interface TerrainData {
  mapKey: number;
  generatorVersion: number;
  seed: number;
  /** 결과 해시(32비트 부호 없는 정수) */
  hash: number;
  /** 지형 칸 수 한 변 */
  terrainSize: number;
  /** 꼭짓점 높이(cm) (terrainSize + 1)² */
  heights: Int32Array;
  /** 지표 종류 terrainSize² */
  surface: Uint8Array;
  /** (2판) 꼭짓점 물 높이(cm, 물 없음 = TERRAIN_NO_WATER) (terrainSize + 1)² */
  waterLevels?: Int32Array | undefined;
  /** (2판) 배치 칸 엄폐 값(0·1·2) placementSize² */
  cover?: Uint8Array | undefined;
  /** (2판) 배치 칸 소품 그림 번호 placementSize² */
  art?: Uint8Array | undefined;
  /** (2판) 배치 칸 수 한 변(엄폐·소품 층이 있으면) */
  placementSize?: number | undefined;
  /** (2판) 지형 칸 한 변 실제 길이(mm) */
  cellSizeMm?: number | undefined;
  /** (2판) 행성 생성기 판 */
  planetGeneratorVersion?: number | undefined;
  /** (2판) 행성 정의 해시 앞 8자리(u32) */
  definitionHash?: number | undefined;
}

/** 2판 칸이 하나라도 있으면 2판으로 쓴다 */
const isV2 = (data: TerrainData): boolean =>
  data.waterLevels !== undefined ||
  data.cover !== undefined ||
  data.art !== undefined ||
  data.cellSizeMm !== undefined ||
  data.planetGeneratorVersion !== undefined ||
  data.definitionHash !== undefined;

const TWO_POW_32 = 0x1_0000_0000;

function isU32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < TWO_POW_32;
}

export function encodeTerrain(data: TerrainData): Uint8Array {
  const size = data.terrainSize;
  const vertices = size + 1;
  if (!Number.isInteger(size) || size < 1 || vertices > 0xffff) {
    throw new RangeError(`terrain size must be an integer in [1, 65534]: ${size}`);
  }
  if (data.heights.length !== vertices * vertices || data.surface.length !== size * size) {
    throw new RangeError("terrain arrays do not match the terrain size");
  }
  if (!isU32(data.generatorVersion) || !isU32(data.seed) || !isU32(data.hash)) {
    throw new RangeError("generatorVersion, seed and hash must be 32-bit unsigned integers");
  }
  if (!Number.isSafeInteger(data.mapKey) || data.mapKey < 0) {
    throw new RangeError(`map key must be a non-negative safe integer: ${data.mapKey}`);
  }
  const v2 = isV2(data);
  const placement = data.cover || data.art ? (data.placementSize ?? 0) : 0;
  if (data.waterLevels && data.waterLevels.length !== vertices * vertices) {
    throw new RangeError("water levels do not match the terrain size");
  }
  for (const layer of [data.cover, data.art]) {
    if (
      layer &&
      (!Number.isInteger(placement) ||
        placement < 1 ||
        placement > 0xffff ||
        layer.length !== placement * placement)
    ) {
      throw new RangeError("cover or art does not match the placement size");
    }
  }
  for (const value of [data.cellSizeMm, data.planetGeneratorVersion, data.definitionHash]) {
    if (value !== undefined && !isU32(value))
      throw new RangeError("v2 header values must be 32-bit unsigned integers");
  }
  const headerBytes = v2 ? TERRAIN_HEADER_BYTES_V2 : TERRAIN_HEADER_BYTES;
  const heightsOffset = headerBytes;
  const waterOffset = heightsOffset + data.heights.length * 4;
  const surfaceOffset = waterOffset + (data.waterLevels ? data.waterLevels.length * 4 : 0);
  const coverOffset = surfaceOffset + data.surface.length;
  const artOffset = coverOffset + (data.cover ? data.cover.length : 0);
  const bytes = new Uint8Array(artOffset + (data.art ? data.art.length : 0));
  const view = new DataView(bytes.buffer);
  MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint16(4, v2 ? TERRAIN_FORMAT_VERSION : TERRAIN_FORMAT_V1, true);
  view.setUint16(6, headerBytes, true);
  view.setUint32(8, data.generatorVersion, true);
  view.setUint32(12, data.seed, true);
  view.setUint16(16, size, true);
  view.setUint16(18, vertices, true);
  view.setUint32(20, data.hash, true);
  view.setUint32(24, data.mapKey % TWO_POW_32, true);
  view.setUint32(28, Math.floor(data.mapKey / TWO_POW_32), true);
  for (let i = 0; i < data.heights.length; i++) {
    view.setInt32(heightsOffset + i * 4, data.heights[i] ?? 0, true);
  }
  if (v2) {
    view.setUint32(32, data.planetGeneratorVersion ?? 0, true);
    view.setUint32(36, data.definitionHash ?? 0, true);
    view.setUint32(40, data.cellSizeMm ?? 0, true);
    view.setUint16(44, placement, true);
    view.setUint16(
      46,
      (data.waterLevels ? FLAG_WATER : 0) | (data.cover ? FLAG_COVER : 0) | (data.art ? FLAG_ART : 0),
      true,
    );
  }
  if (data.waterLevels) {
    for (let i = 0; i < data.waterLevels.length; i++) {
      view.setInt32(waterOffset + i * 4, data.waterLevels[i] ?? TERRAIN_NO_WATER, true);
    }
  }
  bytes.set(data.surface, surfaceOffset);
  if (data.cover) bytes.set(data.cover, coverOffset);
  if (data.art) bytes.set(data.art, artOffset);
  return bytes;
}

/** 받은 바이트를 읽는다. 마법 값·형식 버전·길이가 틀리면 ProtocolError */
export function decodeTerrain(input: ArrayBuffer | Uint8Array): TerrainData {
  // 일반 Uint8Array 보기로 바꾼다: Node Buffer의 slice는 복사가 아니라 보기라서 그대로 쓰면 결과가 원본을 가리킨다
  const bytes =
    input instanceof Uint8Array
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
  if (bytes.byteLength < TERRAIN_HEADER_BYTES) throw new ProtocolError("terrain data is too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (MAGIC.some((byte, index) => view.getUint8(index) !== byte)) {
    throw new ProtocolError("terrain data has a wrong magic value");
  }
  const formatVersion = view.getUint16(4, true);
  if (formatVersion !== TERRAIN_FORMAT_V1 && formatVersion !== TERRAIN_FORMAT_VERSION) {
    throw new ProtocolError(`unsupported terrain format version: ${formatVersion}`);
  }
  const v2 = formatVersion === TERRAIN_FORMAT_VERSION;
  const headerBytes = view.getUint16(6, true);
  const size = view.getUint16(16, true);
  const vertices = view.getUint16(18, true);
  const minHeader = v2 ? TERRAIN_HEADER_BYTES_V2 : TERRAIN_HEADER_BYTES;
  if (headerBytes < minHeader || bytes.byteLength < headerBytes || size < 1 || vertices !== size + 1) {
    throw new ProtocolError("terrain header is not valid");
  }
  const flags = v2 ? view.getUint16(46, true) : 0;
  const placement = v2 ? view.getUint16(44, true) : 0;
  const hasWater = (flags & FLAG_WATER) !== 0;
  const hasCover = (flags & FLAG_COVER) !== 0;
  const hasArt = (flags & FLAG_ART) !== 0;
  if ((hasCover || hasArt) && placement < 1) throw new ProtocolError("terrain header is not valid");
  const heightCount = vertices * vertices;
  const waterOffset = headerBytes + heightCount * 4;
  const surfaceOffset = waterOffset + (hasWater ? heightCount * 4 : 0);
  const coverOffset = surfaceOffset + size * size;
  const artOffset = coverOffset + (hasCover ? placement * placement : 0);
  if (bytes.byteLength !== artOffset + (hasArt ? placement * placement : 0)) {
    throw new ProtocolError("terrain data length does not match its header");
  }
  const heights = new Int32Array(heightCount);
  for (let i = 0; i < heightCount; i++) heights[i] = view.getInt32(headerBytes + i * 4, true);
  const data: TerrainData = {
    mapKey: view.getUint32(28, true) * TWO_POW_32 + view.getUint32(24, true),
    generatorVersion: view.getUint32(8, true),
    seed: view.getUint32(12, true),
    hash: view.getUint32(20, true),
    terrainSize: size,
    heights,
    surface: bytes.slice(surfaceOffset, surfaceOffset + size * size),
  };
  if (!v2) return data;
  data.planetGeneratorVersion = view.getUint32(32, true);
  data.definitionHash = view.getUint32(36, true);
  data.cellSizeMm = view.getUint32(40, true);
  if (hasWater) {
    const waterLevels = new Int32Array(heightCount);
    for (let i = 0; i < heightCount; i++) waterLevels[i] = view.getInt32(waterOffset + i * 4, true);
    data.waterLevels = waterLevels;
  }
  if (hasCover || hasArt) data.placementSize = placement;
  if (hasCover) data.cover = bytes.slice(coverOffset, coverOffset + placement * placement);
  if (hasArt) data.art = bytes.slice(artOffset, artOffset + placement * placement);
  return data;
}
