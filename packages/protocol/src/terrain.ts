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
import { ProtocolError } from "./codec.ts";

export const TERRAIN_FORMAT_VERSION = 1;
export const TERRAIN_HEADER_BYTES = 32;
/** 마법 값 "TCTR"(Terra Cognita TeRrain)의 바이트 */
const MAGIC = [0x54, 0x43, 0x54, 0x52] as const;

/** 지표 종류 번호 (packages/sim SURFACE_*와 같다 — 서버 시험이 확인) */
export const TERRAIN_SURFACE = { water: 0, grass: 1, dirt: 2, rock: 3 } as const;

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
}

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
  const heightsOffset = TERRAIN_HEADER_BYTES;
  const surfaceOffset = heightsOffset + data.heights.length * 4;
  const bytes = new Uint8Array(surfaceOffset + data.surface.length);
  const view = new DataView(bytes.buffer);
  MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint16(4, TERRAIN_FORMAT_VERSION, true);
  view.setUint16(6, TERRAIN_HEADER_BYTES, true);
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
  bytes.set(data.surface, surfaceOffset);
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
  if (formatVersion !== TERRAIN_FORMAT_VERSION) {
    throw new ProtocolError(`unsupported terrain format version: ${formatVersion}`);
  }
  const headerBytes = view.getUint16(6, true);
  const size = view.getUint16(16, true);
  const vertices = view.getUint16(18, true);
  if (headerBytes < TERRAIN_HEADER_BYTES || size < 1 || vertices !== size + 1) {
    throw new ProtocolError("terrain header is not valid");
  }
  const heightCount = vertices * vertices;
  const surfaceOffset = headerBytes + heightCount * 4;
  if (bytes.byteLength !== surfaceOffset + size * size) {
    throw new ProtocolError("terrain data length does not match its header");
  }
  const heights = new Int32Array(heightCount);
  for (let i = 0; i < heightCount; i++) heights[i] = view.getInt32(headerBytes + i * 4, true);
  return {
    mapKey: view.getUint32(28, true) * TWO_POW_32 + view.getUint32(24, true),
    generatorVersion: view.getUint32(8, true),
    seed: view.getUint32(12, true),
    hash: view.getUint32(20, true),
    terrainSize: size,
    heights,
    surface: bytes.slice(surfaceOffset, surfaceOffset + size * size),
  };
}
