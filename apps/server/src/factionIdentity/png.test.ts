// 플레이어가 올린 세력 마크 검사 시험 — 청크 허용 목록·차례, CRC, 크기, 바이트 상한, 압축 자료(크기·남는 바이트·필터 종류·압축 폭탄).
import { crc32, deflateSync } from "node:zlib";
import { FACTION_EMBLEM_UPLOAD } from "@terra/shared/factionIdentity";
import { describe, expect, it } from "vitest";
import { makeTestPng } from "../nationEdit/testPng.ts";
import { checkPlayerEmblemPng } from "./png.ts";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array = new Uint8Array(0)): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, tail]);
}

function ihdr(width = 256, height = 256, colorType = 6, bitDepth = 8, interlace = 0): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  data[12] = interlace;
  return chunk("IHDR", data);
}

/** 한 색 그림의 풀린 바이트(줄마다 필터 0) */
function rawOf(channels: number, width = 256, height = 256, filter = 0): Buffer {
  const raw = Buffer.alloc((1 + width * channels) * height, 0x40);
  for (let y = 0; y < height; y++) raw[y * (1 + width * channels)] = filter;
  return raw;
}

const idat = (raw: Uint8Array): Buffer => chunk("IDAT", deflateSync(raw));
const png = (...chunks: Buffer[]): Buffer => Buffer.concat([SIGNATURE, ...chunks]);
const GOOD = png(ihdr(), idat(rawOf(4)), chunk("IEND"));

describe("checkPlayerEmblemPng", () => {
  it("캔버스가 만든 것과 같은 256 × 256 PNG를 받는다", () => {
    expect(checkPlayerEmblemPng(GOOD)).toBeNull();
    expect(checkPlayerEmblemPng(makeTestPng(256, 256))).toBeNull();
    // RGB(2), 회색(0), 회색 + 알파(4)
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 2), idat(rawOf(3)), chunk("IEND")))).toBeNull();
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 0), idat(rawOf(1)), chunk("IEND")))).toBeNull();
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 4), idat(rawOf(2)), chunk("IEND")))).toBeNull();
  });

  it("허용한 덧붙임 청크(gAMA·sRGB·PLTE·tRNS)와 여러 IDAT를 받는다", () => {
    const gama = chunk("gAMA", Buffer.from([0, 0, 0xb1, 0x8f]));
    const srgb = chunk("sRGB", Buffer.from([0]));
    expect(checkPlayerEmblemPng(png(ihdr(), srgb, gama, idat(rawOf(4)), chunk("IEND")))).toBeNull();
    const packed = deflateSync(rawOf(4));
    const half = Math.floor(packed.length / 2);
    expect(
      checkPlayerEmblemPng(
        png(
          ihdr(),
          chunk("IDAT", packed.subarray(0, half)),
          chunk("IDAT", packed.subarray(half)),
          chunk("IEND"),
        ),
      ),
    ).toBeNull();
    const palette = chunk("PLTE", Buffer.from([255, 0, 0, 0, 255, 0]));
    const alpha = chunk("tRNS", Buffer.from([255, 128]));
    expect(
      checkPlayerEmblemPng(
        png(ihdr(256, 256, 3), palette, alpha, idat(Buffer.alloc(257 * 256)), chunk("IEND")),
      ),
    ).toBeNull();
  });

  it("PNG가 아니면 emblem_not_png", () => {
    expect(checkPlayerEmblemPng(new Uint8Array(0))).toBe("emblem_not_png");
    expect(checkPlayerEmblemPng(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"))).toBe(
      "emblem_not_png",
    );
    // JPEG 머리
    expect(
      checkPlayerEmblemPng(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])),
    ).toBe("emblem_not_png");
  });

  it("크기가 256 × 256이 아니면 emblem_wrong_size, 바이트 상한을 넘으면 emblem_too_large", () => {
    expect(checkPlayerEmblemPng(makeTestPng(128, 128))).toBe("emblem_wrong_size");
    expect(checkPlayerEmblemPng(makeTestPng(256, 255))).toBe("emblem_wrong_size");
    expect(checkPlayerEmblemPng(makeTestPng(512, 512))).toBe("emblem_wrong_size");
    const big = makeTestPng(256, 256, [10, 20, 30, 255], 200);
    expect(big.length).toBeGreaterThan(FACTION_EMBLEM_UPLOAD.maxBytes);
    expect(checkPlayerEmblemPng(big)).toBe("emblem_too_large");
  });

  it("허용 목록 밖 청크(글·EXIF·색 프로파일·모르는 청크)가 있으면 emblem_bad_chunk", () => {
    for (const type of ["tEXt", "iTXt", "zTXt", "eXIf", "iCCP", "pHYs", "tIME", "acTL", "prVt"]) {
      const extra = chunk(type, Buffer.from("Comment\0x"));
      expect(checkPlayerEmblemPng(png(ihdr(), extra, idat(rawOf(4)), chunk("IEND"))), type).toBe(
        "emblem_bad_chunk",
      );
    }
  });

  it("청크 차례·개수가 틀리면 emblem_bad_chunk", () => {
    const data = idat(rawOf(4));
    const end = chunk("IEND");
    // IHDR 둘, IHDR이 처음이 아님, IDAT 없음, IDAT 사이에 다른 청크, IDAT 뒤 sRGB, IEND에 자료
    expect(checkPlayerEmblemPng(png(ihdr(), ihdr(), data, end))).toBe("emblem_bad_chunk");
    expect(checkPlayerEmblemPng(png(chunk("sRGB", Buffer.from([0])), ihdr(), data, end))).toBe(
      "emblem_bad_chunk",
    );
    expect(checkPlayerEmblemPng(png(ihdr(), end))).toBe("emblem_bad_chunk");
    const packed = deflateSync(rawOf(4));
    expect(
      checkPlayerEmblemPng(
        png(
          ihdr(),
          chunk("IDAT", packed.subarray(0, 10)),
          chunk("sRGB", Buffer.from([0])),
          chunk("IDAT", packed.subarray(10)),
          end,
        ),
      ),
    ).toBe("emblem_bad_chunk");
    expect(checkPlayerEmblemPng(png(ihdr(), data, chunk("sRGB", Buffer.from([0])), end))).toBe(
      "emblem_bad_chunk",
    );
    expect(checkPlayerEmblemPng(png(ihdr(), data, chunk("IEND", Buffer.from([1]))))).toBe("emblem_bad_chunk");
    // 팔레트 그림인데 PLTE가 없음, RGBA인데 tRNS
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 3), idat(Buffer.alloc(257 * 256)), end))).toBe(
      "emblem_bad_chunk",
    );
    expect(checkPlayerEmblemPng(png(ihdr(), chunk("tRNS", Buffer.from([0, 0])), data, end))).toBe(
      "emblem_bad_chunk",
    );
  });

  it("CRC가 틀리거나 IEND 뒤에 바이트가 있으면 emblem_bad_chunk", () => {
    const broken = Buffer.from(GOOD);
    broken[40] = (broken[40] ?? 0) ^ 0xff;
    expect(checkPlayerEmblemPng(broken)).toBe("emblem_bad_chunk");
    expect(checkPlayerEmblemPng(Buffer.concat([GOOD, Buffer.from("PK\u0003\u0004 hidden zip")]))).toBe(
      "emblem_bad_chunk",
    );
    expect(checkPlayerEmblemPng(GOOD.subarray(0, GOOD.length - 12))).toBe("emblem_bad_chunk");
  });

  it("IHDR 값이 틀리면(16비트·인터레이스·모르는 색 종류) emblem_bad_data", () => {
    const data = idat(rawOf(4));
    const end = chunk("IEND");
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 6, 16), data, end))).toBe("emblem_bad_data");
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 6, 8, 1), data, end))).toBe("emblem_bad_data");
    expect(checkPlayerEmblemPng(png(ihdr(256, 256, 5), data, end))).toBe("emblem_bad_data");
  });

  it("압축 자료가 그림 크기와 맞지 않으면 emblem_bad_data", () => {
    const end = chunk("IEND");
    // 모자람, 넘침(압축 폭탄 — 16MB를 풀지 않고 멈춘다), 압축이 아님, 압축 자료 뒤에 숨긴 바이트, 필터 종류 5
    expect(checkPlayerEmblemPng(png(ihdr(), idat(rawOf(4, 256, 255)), end))).toBe("emblem_bad_data");
    expect(checkPlayerEmblemPng(png(ihdr(), idat(Buffer.alloc(16 * 1024 * 1024)), end))).toBe(
      "emblem_bad_data",
    );
    expect(checkPlayerEmblemPng(png(ihdr(), chunk("IDAT", Buffer.from("not deflate data")), end))).toBe(
      "emblem_bad_data",
    );
    const hidden = Buffer.concat([deflateSync(rawOf(4)), Buffer.from("secret payload")]);
    expect(checkPlayerEmblemPng(png(ihdr(), chunk("IDAT", hidden), end))).toBe("emblem_bad_data");
    expect(checkPlayerEmblemPng(png(ihdr(), idat(rawOf(4, 256, 256, 5)), end))).toBe("emblem_bad_data");
  });
});
