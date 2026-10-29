// 1차맵 행성 타일 이진 형식 — HTTP로 받는다(버전 붙은 불변 주소, 로그인 필요). ADR 2026-10-29-s2-planet-lod(36) "타일"
// WebSocket 메시지가 아니라서 PROTOCOL_VERSION과 무관하다. 바이트 배치나 타일 값 규칙(모으기·꼭짓점 높이,
// packages/planet tiles)이 바뀌면 PLANET_TILE_FORMAT_VERSION을 올린다(타일 주소의 버전도 함께 바뀐다).
// 브라우저·Node 공통 코드(DataView만 쓴다). 모든 수는 작은 끝(little-endian)이다.
//
// 머리(56바이트)
//   0  u8×4  마법 값 "TCPT"
//   4  u16   형식 버전 (PLANET_TILE_FORMAT_VERSION)
//   6  u16   머리 길이(바이트). 읽는 쪽은 이만큼 건너뛰고 본문을 읽는다(머리를 늘려도 옛 기기가 읽게)
//   8  u8    면 레벨 F (4~14)
//   9  u8    맵 레벨 L (F−4 ~ F)
//  10  u8    면 (0~5)
//  11  u8    예약(0)
//  12  u16   첫 칸 i0 (맵 레벨 칸 좌표)
//  14  u16   첫 칸 j0
//  16  u16   한 변 칸 수 size = min(32, 2^L)
//  18  u16   예약(0)
//  20  u32   생성기 버전
//  24  u8×32 정의 해시(SHA-256)
// 본문
//  꼭짓점 높이 i16 × (size+1)²  (게임 m, 해수면 0, 행 우선 cj × (size+1) + ci.
//                                꼭짓점 (ci, cj) = 그 면의 st 점 ((i0+ci)/2^L, (j0+cj)/2^L))
//  칸 값 size²씩 차례로(행 우선 j × size + i): 바이옴 u8, 물 비트 u8, 기온 i8(°C), 습도 u8, 숲 u8, 하천 등급 u8
// 숨김 정보(자원·크리쳐)는 넣지 않는다(ADR 2026-10-28-fog-and-map-visibility).
import { ProtocolError } from "./codec.ts";

export const PLANET_TILE_FORMAT_VERSION = 1;
export const PLANET_TILE_HEADER_BYTES = 56;
/** 마법 값 "TCPT"(Terra Cognita Planet Tile)의 바이트 */
const MAGIC = [0x54, 0x43, 0x50, 0x54] as const;
/** 타일 한 변 칸 수 상한 (packages/planet PLANET_TILE_CELLS와 같다 — 서버 시험이 확인) */
export const PLANET_TILE_MAX_CELLS = 32;
/** 면 레벨 범위 (packages/planet MIN_FACE_LEVEL·MAX_FACE_LEVEL과 같다 — 서버 시험이 확인) */
export const PLANET_FACE_LEVEL_MIN = 4;
export const PLANET_FACE_LEVEL_MAX = 14;
/** 1차맵 단계 수 (맵 레벨 F−4 ~ F) */
const MAP_LEVEL_COUNT = 5;
const HASH_BYTES = 32;

/** 서버 경로(Fastify 형식). 주소는 planetManifestPath·planetTilePath로 만든다 */
export const PLANET_MANIFEST_ROUTE = "/api/planets/:planetId";
export const PLANET_TILE_ROUTE = "/api/planets/:planetId/tiles/:tileKey";
/** 타일 주소 틀에서 타일 ID(셀 키, 10진수)가 들어갈 자리 */
export const PLANET_TILE_KEY_PLACEHOLDER = "{tileKey}";

/** 버전이 붙은 주소는 내용이 바뀌지 않는다. 로그인한 사람에게만 주므로 공유 캐시(프록시)에는 두지 않는다 */
export const PLANET_TILE_CACHE_CONTROL = "private, max-age=31536000, immutable";

/** 목록 정보 주소: /api/planets/<행성 ID> */
export function planetManifestPath(planetId: string): string {
  return `/api/planets/${planetId}`;
}

/**
 * 타일 주소에 붙는 버전 = "<형식 버전>.<생성기 버전>.<정의 해시 앞 16자>".
 * 셋 중 하나라도 바뀌면 주소가 바뀌어 기기 캐시(1년, immutable)를 새로 받는다.
 */
export function planetTileVersion(generatorVersion: number, definitionHash: string): string {
  return `${PLANET_TILE_FORMAT_VERSION}.${generatorVersion}.${definitionHash.slice(0, 16)}`;
}

/** 타일 주소 틀: /api/planets/<행성 ID>/tiles/{tileKey}?v=<버전> */
export function planetTileUrlTemplate(planetId: string, version: string): string {
  return `/api/planets/${planetId}/tiles/${PLANET_TILE_KEY_PLACEHOLDER}?v=${version}`;
}

/** 주소 틀에 타일 ID를 넣는다 */
export function planetTilePath(template: string, tileKey: number): string {
  return template.replace(PLANET_TILE_KEY_PLACEHOLDER, String(tileKey));
}

/**
 * 타일 하나 — 렌더러가 받는 모양(이름을 바꾸지 않는다. packages/planet PlanetTile과 같은 필드 + 머리 값).
 * 배열은 모두 행 우선(j 다음 i)이다.
 */
export interface PlanetTileData {
  faceLevel: number;
  mapLevel: number;
  face: number;
  i0: number;
  j0: number;
  size: number;
  /** 꼭짓점 높이(게임 m) (size+1)² */
  heightsM: Int16Array;
  /** 칸 값 size² */
  biome: Uint8Array;
  water: Uint8Array;
  temperatureC: Int8Array;
  humidity: Uint8Array;
  forest: Uint8Array;
  river: Uint8Array;
  /** 생성기 버전(u32) */
  generatorVersion: number;
  /** 정의 해시(SHA-256, 소문자 16진수 64자) */
  definitionHash: string;
}

/** 한 변 칸 수 `size` 타일의 바이트 수 (압축 전) */
export function planetTileByteLength(size: number): number {
  return PLANET_TILE_HEADER_BYTES + 2 * (size + 1) * (size + 1) + 6 * size * size;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function isInt(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** 머리 값이 맞는 조합인지: 면 레벨·맵 레벨·면·한 변·첫 칸 위치. 틀린 이유(문장) 또는 undefined */
function headerProblem(tile: Pick<PlanetTileData, "faceLevel" | "mapLevel" | "face" | "i0" | "j0" | "size">) {
  const { faceLevel, mapLevel, face, i0, j0, size } = tile;
  if (!isInt(faceLevel, PLANET_FACE_LEVEL_MIN, PLANET_FACE_LEVEL_MAX)) return `face level ${faceLevel}`;
  if (!isInt(mapLevel, faceLevel - (MAP_LEVEL_COUNT - 1), faceLevel)) return `map level ${mapLevel}`;
  if (!isInt(face, 0, 5)) return `face ${face}`;
  // 맵 레벨은 14 이하라 32비트 시프트로 정확하다
  const n = 1 << mapLevel;
  if (size !== Math.min(PLANET_TILE_MAX_CELLS, n)) return `size ${size}`;
  if (!isInt(i0, 0, n - size) || !isInt(j0, 0, n - size) || i0 % size !== 0 || j0 % size !== 0) {
    return `first cell (${i0}, ${j0})`;
  }
  return undefined;
}

export function encodePlanetTile(tile: PlanetTileData): Uint8Array {
  const problem = headerProblem(tile);
  if (problem) throw new RangeError(`planet tile header is not valid: ${problem}`);
  const { size } = tile;
  const corners = (size + 1) * (size + 1);
  const cells = size * size;
  const cellArrays = [tile.biome, tile.water, tile.temperatureC, tile.humidity, tile.forest, tile.river];
  if (tile.heightsM.length !== corners || cellArrays.some((array) => array.length !== cells)) {
    throw new RangeError("planet tile arrays do not match the tile size");
  }
  if (!isInt(tile.generatorVersion, 0, 0xffff_ffff)) {
    throw new RangeError(`generator version must be a 32-bit unsigned integer: ${tile.generatorVersion}`);
  }
  if (!HASH_PATTERN.test(tile.definitionHash)) {
    throw new RangeError("definition hash must be 64 lowercase hex characters (SHA-256)");
  }
  const bytes = new Uint8Array(planetTileByteLength(size));
  const view = new DataView(bytes.buffer);
  MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint16(4, PLANET_TILE_FORMAT_VERSION, true);
  view.setUint16(6, PLANET_TILE_HEADER_BYTES, true);
  view.setUint8(8, tile.faceLevel);
  view.setUint8(9, tile.mapLevel);
  view.setUint8(10, tile.face);
  view.setUint16(12, tile.i0, true);
  view.setUint16(14, tile.j0, true);
  view.setUint16(16, size, true);
  view.setUint32(20, tile.generatorVersion, true);
  for (let index = 0; index < HASH_BYTES; index++) {
    view.setUint8(24 + index, Number.parseInt(tile.definitionHash.slice(index * 2, index * 2 + 2), 16));
  }
  let offset = PLANET_TILE_HEADER_BYTES;
  for (let index = 0; index < corners; index++) {
    view.setInt16(offset, tile.heightsM[index] ?? 0, true);
    offset += 2;
  }
  for (const array of cellArrays) {
    // Int8Array(기온)는 같은 바이트(2의 보수)로 넣는다
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    offset += cells;
  }
  return bytes;
}

/** 받은 바이트를 읽는다(압축을 푼 것). 마법 값·형식 버전·머리 값·길이가 틀리면 ProtocolError */
export function decodePlanetTile(input: ArrayBuffer | Uint8Array): PlanetTileData {
  // 일반 Uint8Array 보기로 바꾼다: Node Buffer의 slice는 복사가 아니라 보기라서 그대로 쓰면 결과가 원본을 가리킨다
  const bytes =
    input instanceof Uint8Array
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
  if (bytes.byteLength < PLANET_TILE_HEADER_BYTES) throw new ProtocolError("planet tile is too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (MAGIC.some((byte, index) => view.getUint8(index) !== byte)) {
    throw new ProtocolError("planet tile has a wrong magic value");
  }
  const formatVersion = view.getUint16(4, true);
  if (formatVersion !== PLANET_TILE_FORMAT_VERSION) {
    throw new ProtocolError(`unsupported planet tile format version: ${formatVersion}`);
  }
  const headerBytes = view.getUint16(6, true);
  const header = {
    faceLevel: view.getUint8(8),
    mapLevel: view.getUint8(9),
    face: view.getUint8(10),
    i0: view.getUint16(12, true),
    j0: view.getUint16(14, true),
    size: view.getUint16(16, true),
  };
  const problem = headerBytes < PLANET_TILE_HEADER_BYTES ? "header length" : headerProblem(header);
  if (problem) throw new ProtocolError(`planet tile header is not valid: ${problem}`);
  const { size } = header;
  const corners = (size + 1) * (size + 1);
  const cells = size * size;
  if (bytes.byteLength !== headerBytes + 2 * corners + 6 * cells) {
    throw new ProtocolError("planet tile length does not match its header");
  }
  let definitionHash = "";
  for (let index = 0; index < HASH_BYTES; index++) {
    definitionHash += view
      .getUint8(24 + index)
      .toString(16)
      .padStart(2, "0");
  }
  const heightsM = new Int16Array(corners);
  let offset = headerBytes;
  for (let index = 0; index < corners; index++) {
    heightsM[index] = view.getInt16(offset, true);
    offset += 2;
  }
  // 칸 값은 복사해서 돌려준다(받은 버퍼를 다시 써도 결과가 바뀌지 않게)
  const take = (): Uint8Array<ArrayBuffer> => {
    const part = bytes.slice(offset, offset + cells);
    offset += cells;
    return part;
  };
  const biome = take();
  const water = take();
  const temperature = take();
  const humidity = take();
  const forest = take();
  const river = take();
  return {
    ...header,
    heightsM,
    biome,
    water,
    temperatureC: new Int8Array(temperature.buffer, temperature.byteOffset, temperature.byteLength),
    humidity,
    forest,
    river,
    generatorVersion: view.getUint32(20, true),
    definitionHash,
  };
}
