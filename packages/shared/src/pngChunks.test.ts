// PNG 청크 걷기 시험 — 서명·청크 길이·이름·CRC·IEND 뒤 바이트·청크 수 상한, IHDR 읽기, 허용 목록 밖 청크 덜어 내기.
import { describe, expect, it } from "vitest";
import { PNG_SIGNATURE, crc32, readPngHeader, stripPngChunks, walkPng } from "./pngChunks.ts";

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));
const u32 = (value: number): number[] => [
  value >>> 24,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];

function chunk(type: string, data: readonly number[] = []): number[] {
  const body = [...ascii(type), ...data];
  return [...u32(data.length), ...body, ...u32(crc32(new Uint8Array(body)))];
}

const IHDR = [...u32(256), ...u32(256), 8, 6, 0, 0, 0];
const png = (...chunks: number[][]): Uint8Array => new Uint8Array([...PNG_SIGNATURE, ...chunks.flat()]);
const BASE = png(chunk("IHDR", IHDR), chunk("IDAT", [1, 2, 3]), chunk("IEND"));

describe("crc32", () => {
  it("알려진 값과 같다", () => {
    // PNG 명세의 IEND 청크 CRC(ae 42 60 82)와 "123456789"의 CRC-32 검사 값
    expect(crc32(new Uint8Array(ascii("IEND")))).toBe(0xae42_6082);
    expect(crc32(new Uint8Array(ascii("123456789")))).toBe(0xcbf4_3926);
  });
});

describe("walkPng", () => {
  it("청크를 차례로 돌려준다", () => {
    const walked = walkPng(BASE);
    expect(walked.ok && walked.chunks.map((c) => `${c.type}:${c.length}`)).toEqual([
      "IHDR:13",
      "IDAT:3",
      "IEND:0",
    ]);
    const first = walked.ok ? walked.chunks[0] : undefined;
    expect(first && readPngHeader(BASE, first)).toEqual({
      width: 256,
      height: 256,
      bitDepth: 8,
      colorType: 6,
      compression: 0,
      filter: 0,
      interlace: 0,
    });
  });

  it("서명이 아니거나 너무 짧으면 not_png", () => {
    expect(walkPng(new Uint8Array(4))).toEqual({ ok: false, problem: "not_png" });
    const broken = BASE.slice();
    broken[1] = 0x51;
    expect(walkPng(broken)).toEqual({ ok: false, problem: "not_png" });
    // GIF 머리
    expect(walkPng(new Uint8Array([...ascii("GIF89a"), ...Array.from({ length: 40 }, () => 0)]))).toEqual({
      ok: false,
      problem: "not_png",
    });
  });

  it("CRC가 틀리면 bad_crc", () => {
    const broken = BASE.slice();
    // IDAT 자료 한 바이트를 바꾼다(CRC는 그대로)
    const at = PNG_SIGNATURE.length + 12 + 13 + 8;
    broken[at] = (broken[at] ?? 0) ^ 0xff;
    expect(walkPng(broken)).toEqual({ ok: false, problem: "bad_crc" });
  });

  it("길이가 파일 끝을 넘거나 이름이 글자가 아니면 bad_chunk", () => {
    const cut = BASE.slice(0, BASE.length - 6);
    expect(walkPng(cut)).toEqual({ ok: false, problem: "bad_chunk" });
    const odd = png(chunk("IHDR", IHDR), [...u32(0), 0x49, 0x44, 0x31, 0x54, 0, 0, 0, 0], chunk("IEND"));
    expect(walkPng(odd)).toEqual({ ok: false, problem: "bad_chunk" });
    const huge = png(chunk("IHDR", IHDR), [0xff, 0xff, 0xff, 0xff, ...ascii("IDAT"), 0, 0, 0, 0]);
    expect(walkPng(huge)).toEqual({ ok: false, problem: "bad_chunk" });
  });

  it("IEND 뒤에 바이트가 있으면 trailing_bytes, IEND가 없으면 no_end", () => {
    expect(walkPng(new Uint8Array([...BASE, 0]))).toEqual({ ok: false, problem: "trailing_bytes" });
    // IEND 뒤에 붙인 다른 파일(폴리글랏)
    expect(walkPng(new Uint8Array([...BASE, ...ascii("<script>alert(1)</script>")]))).toEqual({
      ok: false,
      problem: "trailing_bytes",
    });
    expect(walkPng(png(chunk("IHDR", IHDR), chunk("IDAT", [1])))).toEqual({ ok: false, problem: "no_end" });
  });

  it("청크가 상한보다 많으면 too_many_chunks", () => {
    const many = png(
      chunk("IHDR", IHDR),
      ...Array.from({ length: 8 }, () => chunk("IDAT", [1])),
      chunk("IEND"),
    );
    expect(walkPng(many, 4)).toEqual({ ok: false, problem: "too_many_chunks" });
    expect(walkPng(many, 10).ok).toBe(true);
  });
});

describe("stripPngChunks", () => {
  const allowed = new Set(["IHDR", "IDAT", "IEND"]);

  it("허용 목록 밖 청크만 덜어 낸다(남은 청크는 그대로)", () => {
    const withText = png(
      chunk("IHDR", IHDR),
      chunk("tEXt", ascii("Comment\0hello")),
      chunk("eXIf", [1, 2, 3, 4]),
      chunk("IDAT", [1, 2, 3]),
      chunk("IEND"),
    );
    const stripped = stripPngChunks(withText, allowed);
    expect(stripped && [...stripped]).toEqual([...BASE]);
  });

  it("덜어 낼 것이 없으면 같은 배열, 걷지 못하면 null", () => {
    expect(stripPngChunks(BASE, allowed)).toBe(BASE);
    expect(stripPngChunks(new Uint8Array([1, 2, 3]), allowed)).toBeNull();
  });
});
