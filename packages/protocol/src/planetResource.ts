// 1차맵 자원 분포 지도 이진 형식 — HTTP로 받는다(로그인 필요, 공개 행성만). ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"
// 원자재 하나의 칸 몫(서버가 행성 값과 세계 설정 칸으로 @terra/shared/catchment cellSharesPm "supply"·highOrePm을 셈한 값)을 면 레벨 격자에
// 담는다. 1차맵 타일 형식(planetTile.ts)과 따로 둔다: 몫은 설정 칸(공통 규칙)이 바뀌면 달라지는 값이라 불변 타일에 넣지 않는다.
// WebSocket 메시지가 아니라서 PROTOCOL_VERSION과 무관하다. 바이트 배치가 바뀌면 PLANET_RESOURCE_FORMAT_VERSION을 올린다.
// 진입점 "@terra/protocol/planetResource"로도 가져올 수 있다(zod 없이 이 파일만). 모든 수는 작은 끝(little-endian)이다.
//
// 머리(16바이트)
//   0  u8×4  마법 값 "TCPR"
//   4  u16   형식 버전
//   6  u16   머리 길이(바이트). 읽는 쪽은 이만큼 건너뛴다
//   8  u8    행성 면 레벨 F
//   9  u8    격자 면 레벨 L (≤ F, 면마다 2^L × 2^L)
//  10  u8    원자재 번호(서버 원자재 차례 — @terra/shared/catchment CATCHMENT_MATERIALS)
//  11  u8    판 수(1 = 몫만, 2 = 몫 + 높은 티어 광석 몫)
//  12  u32   칸 수 = 6 × 4^L
// 본문: 판마다 u8 × 칸 수(배열 번호 = 면 × n² + j × n + i). 값 0 ~ 255 = 몫 0 ~ 1000‰(pmToByte)
import { ProtocolError } from "./errors.ts";

export const PLANET_RESOURCE_FORMAT_VERSION = 1;
export const PLANET_RESOURCE_HEADER_BYTES = 16;
const MAGIC = [0x54, 0x43, 0x50, 0x52] as const;
/** 격자 면 레벨 상한(면마다 512²) */
export const PLANET_RESOURCE_MAX_LEVEL = 9;
/** 원자재 번호 상한(여섯 원자재) */
const MATERIAL_COUNT = 6;

/** 서버 경로(Fastify 형식) */
export const PLANET_RESOURCE_ROUTE = "/api/planets/:planetId/resources/:material";

/** 자원 분포 지도 주소: /api/planets/<행성 ID>/resources/<원자재> */
export function planetResourcePath(planetId: string, material: string): string {
  return `/api/planets/${planetId}/resources/${material}`;
}

/** 설정 칸이 바뀌면 내용이 바뀐다: 매번 확인하고(ETag가 같으면 304) 공유 캐시에는 두지 않는다 */
export const PLANET_RESOURCE_CACHE_CONTROL = "private, no-cache";

export interface PlanetResourceData {
  faceLevel: number;
  level: number;
  material: number;
  /** 몫 0 ~ 255(= 0 ~ 1000‰), 6 × 4^level */
  share: Uint8Array;
  /** 높은 티어 광석 몫(광석만), 없으면 null */
  high: Uint8Array | null;
}

/** 몫(‰, 0 ~ 1000) → 바이트(0 ~ 255, 반올림) */
export function pmToByte(pm: number): number {
  const clamped = Math.min(1000, Math.max(0, Math.trunc(pm)));
  return Math.floor((clamped * 255 + 500) / 1000);
}

function headerProblem(data: Pick<PlanetResourceData, "faceLevel" | "level" | "material">): string | null {
  const { faceLevel, level, material } = data;
  if (!(Number.isInteger(faceLevel) && faceLevel >= 0 && faceLevel <= 30)) return `face level ${faceLevel}`;
  if (!(Number.isInteger(level) && level >= 0 && level <= Math.min(faceLevel, PLANET_RESOURCE_MAX_LEVEL)))
    return `level ${level}`;
  if (!(Number.isInteger(material) && material >= 0 && material < MATERIAL_COUNT))
    return `material ${material}`;
  return null;
}

const cellCount = (level: number): number => 6 * (1 << level) * (1 << level);

export function encodePlanetResource(data: PlanetResourceData): Uint8Array {
  const problem = headerProblem(data);
  if (problem) throw new RangeError(`planet resource header is not valid: ${problem}`);
  const cells = cellCount(data.level);
  if (data.share.length !== cells || (data.high && data.high.length !== cells)) {
    throw new RangeError("planet resource planes do not match the level");
  }
  const planes = data.high ? 2 : 1;
  const bytes = new Uint8Array(PLANET_RESOURCE_HEADER_BYTES + planes * cells);
  const view = new DataView(bytes.buffer);
  MAGIC.forEach((byte, index) => view.setUint8(index, byte));
  view.setUint16(4, PLANET_RESOURCE_FORMAT_VERSION, true);
  view.setUint16(6, PLANET_RESOURCE_HEADER_BYTES, true);
  view.setUint8(8, data.faceLevel);
  view.setUint8(9, data.level);
  view.setUint8(10, data.material);
  view.setUint8(11, planes);
  view.setUint32(12, cells, true);
  bytes.set(data.share, PLANET_RESOURCE_HEADER_BYTES);
  if (data.high) bytes.set(data.high, PLANET_RESOURCE_HEADER_BYTES + cells);
  return bytes;
}

/** 받은 바이트를 읽는다(압축을 푼 것). 틀리면 ProtocolError. 판은 복사해서 돌려준다 */
export function decodePlanetResource(input: ArrayBuffer | Uint8Array): PlanetResourceData {
  const bytes =
    input instanceof Uint8Array
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
  if (bytes.byteLength < PLANET_RESOURCE_HEADER_BYTES)
    throw new ProtocolError("planet resource is too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (MAGIC.some((byte, index) => view.getUint8(index) !== byte)) {
    throw new ProtocolError("planet resource has a wrong magic value");
  }
  const version = view.getUint16(4, true);
  if (version !== PLANET_RESOURCE_FORMAT_VERSION) {
    throw new ProtocolError(`unsupported planet resource format version: ${version}`);
  }
  const headerBytes = view.getUint16(6, true);
  const header = { faceLevel: view.getUint8(8), level: view.getUint8(9), material: view.getUint8(10) };
  const planes = view.getUint8(11);
  const problem =
    headerBytes < PLANET_RESOURCE_HEADER_BYTES
      ? "header length"
      : planes !== 1 && planes !== 2
        ? `planes ${planes}`
        : headerProblem(header);
  if (problem) throw new ProtocolError(`planet resource header is not valid: ${problem}`);
  const cells = cellCount(header.level);
  if (view.getUint32(12, true) !== cells || bytes.byteLength !== headerBytes + planes * cells) {
    throw new ProtocolError("planet resource length does not match its header");
  }
  const share = bytes.slice(headerBytes, headerBytes + cells);
  const high = planes === 2 ? bytes.slice(headerBytes + cells, headerBytes + 2 * cells) : null;
  return { ...header, share, high };
}
