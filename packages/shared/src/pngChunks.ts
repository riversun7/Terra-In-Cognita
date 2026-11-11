// PNG 청크 걷기 — 올린 세력 마크 검사(서버)와 올리기 전 청크 덜어 내기(기기)가 같이 쓴다. docs/adr/2026-11-11-faction-identity.md 3절.
// 그림을 풀지 않는다(순수 함수, 의존성 없음): 서명 8바이트 → [길이 4][이름 4][자료][CRC 4] 청크를 끝까지 걷고 CRC-32를 견준다.
// 허용 목록 밖 청크(tEXt·eXIf·iCCP 같은 덧붙임 자료)를 걸러 내는 데 쓴다. IDAT 압축 자료가 맞는지는 서버가 따로 푼다(node:zlib).

export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 청크 하나의 자리(바이트 배열 안) */
export interface PngChunk {
  /** 청크 이름 4글자(예: IHDR) */
  readonly type: string;
  /** 청크 시작(길이 칸의 첫 바이트) */
  readonly start: number;
  /** 자료 시작·길이 */
  readonly dataStart: number;
  readonly length: number;
  /** 청크 끝 다음 자리(CRC 다음) */
  readonly end: number;
}

export type PngWalkProblem =
  /** 서명이 아니거나 너무 짧다 */
  | "not_png"
  /** 청크 길이·이름이 틀리거나 파일이 중간에 끊겼다 */
  | "bad_chunk"
  /** CRC가 맞지 않는다 */
  | "bad_crc"
  /** IEND 뒤에 바이트가 더 있다 */
  | "trailing_bytes"
  /** IEND가 없다 */
  | "no_end"
  /** 청크가 상한보다 많다 */
  | "too_many_chunks";

export type PngWalkResult =
  | { readonly ok: true; readonly chunks: readonly PngChunk[] }
  | { readonly ok: false; readonly problem: PngWalkProblem };

/** 걷는 청크 수 상한(256 × 256 그림의 IDAT는 보통 몇 개다. 아주 잘게 쪼갠 파일을 막는다) */
export const PNG_MAX_CHUNKS = 512;

let table: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (table) return table;
  const made = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb8_8320 ^ (c >>> 1) : c >>> 1;
    made[n] = c >>> 0;
  }
  table = made;
  return made;
}

/** CRC-32(ISO 3309, PNG 명세 부록 D). bytes[from, to) */
export function crc32(bytes: Uint8Array, from = 0, to = bytes.length): number {
  const lookup = crcTable();
  let crc = 0xffff_ffff;
  for (let at = from; at < to; at++) crc = (lookup[(crc ^ (bytes[at] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}

export const readU32 = (bytes: Uint8Array, at: number): number =>
  (((bytes[at] ?? 0) << 24) |
    ((bytes[at + 1] ?? 0) << 16) |
    ((bytes[at + 2] ?? 0) << 8) |
    (bytes[at + 3] ?? 0)) >>>
  0;

const isLetter = (code: number): boolean => (code >= 65 && code <= 90) || (code >= 97 && code <= 122);

/** 서명과 모든 청크를 걷는다. IEND에서 끝나고 그 뒤에 바이트가 없어야 한다 */
export function walkPng(bytes: Uint8Array, maxChunks = PNG_MAX_CHUNKS): PngWalkResult {
  if (bytes.length < PNG_SIGNATURE.length + 12) return { ok: false, problem: "not_png" };
  for (let i = 0; i < PNG_SIGNATURE.length; i++)
    if (bytes[i] !== PNG_SIGNATURE[i]) return { ok: false, problem: "not_png" };
  const chunks: PngChunk[] = [];
  let at = PNG_SIGNATURE.length;
  while (at < bytes.length) {
    if (chunks.length >= maxChunks) return { ok: false, problem: "too_many_chunks" };
    if (at + 12 > bytes.length) return { ok: false, problem: "bad_chunk" };
    const length = readU32(bytes, at);
    // PNG 명세: 길이는 2^31 − 1 이하. 파일 끝을 넘으면 끊긴 파일이다
    if (length > 0x7fff_ffff || at + 12 + length > bytes.length) return { ok: false, problem: "bad_chunk" };
    let type = "";
    for (let i = 0; i < 4; i++) {
      const code = bytes[at + 4 + i] ?? 0;
      if (!isLetter(code)) return { ok: false, problem: "bad_chunk" };
      type += String.fromCharCode(code);
    }
    const dataStart = at + 8;
    const end = dataStart + length + 4;
    if (crc32(bytes, at + 4, dataStart + length) !== readU32(bytes, dataStart + length))
      return { ok: false, problem: "bad_crc" };
    chunks.push({ type, start: at, dataStart, length, end });
    at = end;
    if (type === "IEND") {
      if (at !== bytes.length) return { ok: false, problem: "trailing_bytes" };
      return { ok: true, chunks };
    }
  }
  return { ok: false, problem: "no_end" };
}

/** IHDR 13바이트 */
export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly compression: number;
  readonly filter: number;
  readonly interlace: number;
}

/** IHDR 청크를 읽는다(길이가 13이 아니면 null) */
export function readPngHeader(bytes: Uint8Array, chunk: PngChunk): PngHeader | null {
  if (chunk.type !== "IHDR" || chunk.length !== 13) return null;
  const at = chunk.dataStart;
  return {
    width: readU32(bytes, at),
    height: readU32(bytes, at + 4),
    bitDepth: bytes[at + 8] ?? 0,
    colorType: bytes[at + 9] ?? 0,
    compression: bytes[at + 10] ?? 0,
    filter: bytes[at + 11] ?? 0,
    interlace: bytes[at + 12] ?? 0,
  };
}

/**
 * 허용 목록 밖 청크를 덜어 낸 새 PNG(청크마다 CRC가 따로라 남은 청크는 그대로 옮긴다). 걷지 못하는 파일이면 null.
 * 기기가 캔버스로 다시 그린 PNG를 올리기 전에 쓴다(브라우저마다 덧붙이는 청크가 다르다)
 */
export function stripPngChunks(bytes: Uint8Array, allowed: ReadonlySet<string>): Uint8Array | null {
  const walked = walkPng(bytes);
  if (!walked.ok) return null;
  const kept = walked.chunks.filter((chunk) => allowed.has(chunk.type));
  if (kept.length === walked.chunks.length) return bytes;
  let size = PNG_SIGNATURE.length;
  for (const chunk of kept) size += chunk.end - chunk.start;
  const out = new Uint8Array(size);
  out.set(bytes.subarray(0, PNG_SIGNATURE.length), 0);
  let at = PNG_SIGNATURE.length;
  for (const chunk of kept) {
    out.set(bytes.subarray(chunk.start, chunk.end), at);
    at += chunk.end - chunk.start;
  }
  return out;
}
