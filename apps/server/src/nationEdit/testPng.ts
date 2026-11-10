// 시험용 PNG 만들기 — 올린 국가 마크 검사 시험이 쓴다(서버 시험·화면 시험). 한 색으로 채운 RGBA 그림(압축 = node:zlib).
// 시험 도우미라 시험이 아닌 파일은 가져오지 않는다.
import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([head.subarray(4), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([head.subarray(0, 4), body, tail]);
}

/** 가로 × 세로 한 색 PNG(RGBA 8비트). noise > 0이면 잘 줄지 않는 무늬를 섞어 파일을 키운다(바이트 상한 시험) */
export function makeTestPng(
  width: number,
  height: number,
  rgba: readonly [number, number, number, number] = [200, 60, 40, 255],
  noise = 0,
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  const row = 1 + width * 4;
  const raw = Buffer.alloc(row * height);
  let state = 12345;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * row + 1 + x * 4;
      for (let c = 0; c < 4; c++) {
        state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
        const jitter = noise > 0 && c < 3 ? (state >>> 16) % noise : 0;
        raw[at + c] = Math.min(255, (rgba[c] ?? 0) + jitter);
      }
    }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
