// 플레이어가 올린 세력 마크 검사 — docs/adr/2026-11-11-faction-identity.md 3절. 사용자 콘텐츠라 운영진 올리기(nationEdit/png.ts: 서명·IHDR·
// 바이트 상한)보다 엄격하다. 새 의존성 없이(청크 걷기 = @terra/shared/pngChunks, 압축 풀기 = node:zlib) 다음을 모두 본다.
// 1. 바이트 상한(20만) → emblem_too_large
// 2. 서명 + 모든 청크의 길이·이름·CRC-32, IEND로 끝나고 그 뒤에 바이트 없음 → emblem_not_png(서명)·emblem_bad_chunk
// 3. 청크 허용 목록(IHDR·PLTE·IDAT·IEND·tRNS·gAMA·sRGB)과 차례·개수: 글(tEXt·iTXt)·EXIF(eXIf)·색 프로파일(iCCP) 같은 덧붙임 자료가
//    있으면 거절한다(기기가 올리기 전에 덜어 낸다) → emblem_bad_chunk
// 4. IHDR: 256 × 256(→ emblem_wrong_size), 8비트, 색 종류 0·2·3·4·6, 인터레이스 없음 → emblem_bad_data
// 5. IDAT를 이어 풀면 정확히 세로 × (1 + 가로 × 채널) 바이트이고(더 크면 풀다 멈춘다 — 압축 폭탄을 막는다), 압축 자료 뒤에 남는 바이트가
//    없고, 줄마다 필터 종류가 0~4다 → emblem_bad_data
// 그림 내용(무엇이 그려졌는지)은 보지 않는다 — 그것은 운영자 검수(마크 관리)가 맡는다.
import { inflateSync } from "node:zlib";
import { FACTION_EMBLEM_CHUNKS, FACTION_EMBLEM_UPLOAD } from "@terra/shared/factionIdentity";
import { type PngChunk, readPngHeader, walkPng } from "@terra/shared/pngChunks";

export type PlayerEmblemProblem =
  | "emblem_not_png"
  | "emblem_wrong_size"
  | "emblem_too_large"
  | "emblem_bad_chunk"
  | "emblem_bad_data";

/** 색 종류 → 화소마다 바이트 수(8비트 깊이) */
const CHANNELS: ReadonlyMap<number, number> = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

/** 청크 차례·개수 규칙(PNG 명세 5.6): IHDR 처음 → (gAMA·sRGB) → PLTE → tRNS → IDAT(잇달아) → IEND */
function orderProblem(chunks: readonly PngChunk[], colorType: number): boolean {
  const counts = new Map<string, number>();
  let stage = 0; // 0 = IHDR 전, 1 = PLTE 전, 2 = PLTE 뒤, 3 = IDAT, 4 = IDAT 뒤
  let paletteEntries = 0;
  for (const chunk of chunks) {
    if (!FACTION_EMBLEM_CHUNKS.has(chunk.type)) return true;
    const seen = counts.get(chunk.type) ?? 0;
    counts.set(chunk.type, seen + 1);
    switch (chunk.type) {
      case "IHDR":
        if (stage !== 0 || chunk.length !== 13) return true;
        stage = 1;
        break;
      case "gAMA":
        if (stage !== 1 || seen > 0 || chunk.length !== 4) return true;
        break;
      case "sRGB":
        if (stage !== 1 || seen > 0 || chunk.length !== 1) return true;
        break;
      case "PLTE":
        // 회색 그림(0·4)에는 팔레트가 없다
        if (stage !== 1 || chunk.length === 0 || chunk.length % 3 !== 0 || chunk.length > 768) return true;
        if (colorType === 0 || colorType === 4) return true;
        paletteEntries = chunk.length / 3;
        stage = 2;
        break;
      case "tRNS": {
        if ((stage !== 1 && stage !== 2) || seen > 0) return true;
        // 알파가 있는 색 종류(4·6)에는 쓰지 않는다. 팔레트 그림은 팔레트 뒤에, 항목 수 이하
        if (colorType === 4 || colorType === 6) return true;
        if (colorType === 3 && (stage !== 2 || chunk.length > paletteEntries)) return true;
        if (colorType === 0 && chunk.length !== 2) return true;
        if (colorType === 2 && chunk.length !== 6) return true;
        break;
      }
      case "IDAT":
        if (stage === 0 || stage === 4) return true;
        stage = 3;
        break;
      case "IEND":
        if (stage !== 3 || chunk.length !== 0) return true;
        stage = 4;
        break;
      default:
        return true;
    }
    // IDAT가 끝난 뒤에는 IEND만 온다
    if (stage === 3 && chunk.type !== "IDAT") return true;
  }
  if (colorType === 3 && paletteEntries === 0) return true;
  return stage !== 4 || counts.get("IHDR") !== 1;
}

/** 플레이어가 올린 PNG 바이트를 본다. 받으면 null, 아니면 까닭 */
export function checkPlayerEmblemPng(bytes: Uint8Array): PlayerEmblemProblem | null {
  if (bytes.length > FACTION_EMBLEM_UPLOAD.maxBytes) return "emblem_too_large";
  const walked = walkPng(bytes);
  if (!walked.ok) return walked.problem === "not_png" ? "emblem_not_png" : "emblem_bad_chunk";
  const first = walked.chunks[0];
  const header = first ? readPngHeader(bytes, first) : null;
  if (!header) return "emblem_bad_chunk";
  if (header.width !== FACTION_EMBLEM_UPLOAD.size || header.height !== FACTION_EMBLEM_UPLOAD.size)
    return "emblem_wrong_size";
  const channels = CHANNELS.get(header.colorType);
  if (
    channels === undefined ||
    header.bitDepth !== 8 ||
    header.compression !== 0 ||
    header.filter !== 0 ||
    header.interlace !== 0
  )
    return "emblem_bad_data";
  if (orderProblem(walked.chunks, header.colorType)) return "emblem_bad_chunk";

  // IDAT 자료를 이어 붙여 푼다. 기대 크기를 넘으면 zlib이 멈춘다(maxOutputLength)
  const parts = walked.chunks
    .filter((chunk) => chunk.type === "IDAT")
    .map((chunk) => bytes.subarray(chunk.dataStart, chunk.dataStart + chunk.length));
  const compressed = Buffer.concat(parts);
  const row = 1 + header.width * channels;
  const expected = row * header.height;
  let raw: Buffer;
  let consumed: number;
  try {
    // info: true면 { buffer, engine }을 돌려준다(engine.bytesWritten = 읽은 압축 바이트 수). 타입 선언에는 이 모양이 없어 값으로 확인한다
    const result: unknown = inflateSync(compressed, { maxOutputLength: expected, info: true });
    if (typeof result !== "object" || result === null || !("buffer" in result) || !("engine" in result))
      return "emblem_bad_data";
    const { buffer, engine } = result;
    if (!Buffer.isBuffer(buffer) || typeof engine !== "object" || engine === null) return "emblem_bad_data";
    if (!("bytesWritten" in engine) || typeof engine.bytesWritten !== "number") return "emblem_bad_data";
    raw = buffer;
    consumed = engine.bytesWritten;
  } catch {
    return "emblem_bad_data";
  }
  // 압축 자료 뒤에 남는 바이트(숨긴 자료)가 없어야 하고, 푼 크기가 그림 크기와 같아야 한다
  if (consumed !== compressed.length || raw.length !== expected) return "emblem_bad_data";
  for (let y = 0; y < header.height; y++) if ((raw[y * row] ?? 255) > 4) return "emblem_bad_data";
  return null;
}
