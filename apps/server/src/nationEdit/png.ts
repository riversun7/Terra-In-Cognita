// 올린 국가 마크 검사 — PNG 서명·IHDR(크기)·바이트 상한. docs/adr/2026-11-10-nation-editor.md 4절.
// 그림을 풀지 않는다(풀기 도구 없음 — 새 의존성 없이): 서명 8바이트와 첫 청크 IHDR의 길이·이름·가로·세로만 본다. 내줄 때 content-type을
// image/png로 고정하고 nosniff를 달아, 뒤가 깨진 파일이어도 브라우저가 그림이 아닌 것으로 읽지 않는다.
import { NATION_EMBLEM_UPLOAD } from "@terra/shared/nationEditor";

export type EmblemPngProblem = "emblem_not_png" | "emblem_wrong_size" | "emblem_too_large";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
/** "IHDR" */
const IHDR = [0x49, 0x48, 0x44, 0x52] as const;
/** 서명 8 + 길이 4 + 이름 4 + IHDR 13 + CRC 4 */
const MIN_BYTES = 33;

const u32 = (bytes: Uint8Array, at: number): number =>
  (((bytes[at] ?? 0) << 24) |
    ((bytes[at + 1] ?? 0) << 16) |
    ((bytes[at + 2] ?? 0) << 8) |
    (bytes[at + 3] ?? 0)) >>>
  0;

/** PNG 바이트를 본다. 받으면 null, 아니면 까닭 */
export function checkEmblemPng(bytes: Uint8Array): EmblemPngProblem | null {
  if (bytes.length > NATION_EMBLEM_UPLOAD.maxBytes) return "emblem_too_large";
  if (bytes.length < MIN_BYTES) return "emblem_not_png";
  for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) return "emblem_not_png";
  // 첫 청크는 IHDR(길이 13)이어야 한다
  if (u32(bytes, 8) !== 13) return "emblem_not_png";
  for (let i = 0; i < IHDR.length; i++) if (bytes[12 + i] !== IHDR[i]) return "emblem_not_png";
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (width !== NATION_EMBLEM_UPLOAD.size || height !== NATION_EMBLEM_UPLOAD.size) return "emblem_wrong_size";
  return null;
}

/** base64 글 → 바이트(글자가 틀리면 null). 길이는 부르는 쪽이 먼저 막는다 */
export function decodeBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const buffer = Buffer.from(text, "base64");
  // Buffer는 보기라서 일반 Uint8Array로 옮긴다
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}
