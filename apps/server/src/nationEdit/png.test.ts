// 올린 국가 마크 검사 시험 — PNG 서명·IHDR 크기·바이트 상한(docs/adr/2026-11-10-nation-editor.md 4절). 그림은 시험용 한 색이다.
import { NATION_EMBLEM_UPLOAD } from "@terra/shared/nationEditor";
import { describe, expect, it } from "vitest";
import { checkEmblemPng, decodeBase64 } from "./png.ts";
import { makeTestPng } from "./testPng.ts";

describe("checkEmblemPng", () => {
  it("256 × 256 PNG는 받는다", () => {
    const png = makeTestPng(256, 256);
    expect(png.length).toBeLessThan(NATION_EMBLEM_UPLOAD.maxBytes);
    expect(checkEmblemPng(png)).toBeNull();
  });

  it("서명이 틀리면(JPEG·글·빈 것) PNG가 아니다", () => {
    expect(checkEmblemPng(new Uint8Array(0))).toBe("emblem_not_png");
    expect(checkEmblemPng(Buffer.from("<svg onload=alert(1)></svg>".padEnd(64, " ")))).toBe("emblem_not_png");
    const jpeg = new Uint8Array(64);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(checkEmblemPng(jpeg)).toBe("emblem_not_png");
    const broken = Uint8Array.from(makeTestPng(256, 256));
    broken[1] = 0x51;
    expect(checkEmblemPng(broken)).toBe("emblem_not_png");
  });

  it("첫 청크가 IHDR이 아니면 PNG가 아니다", () => {
    const png = Uint8Array.from(makeTestPng(256, 256));
    png[12] = 0x49; // I
    png[13] = 0x44; // D
    png[14] = 0x41; // A
    png[15] = 0x54; // T
    expect(checkEmblemPng(png)).toBe("emblem_not_png");
  });

  it("크기가 256 × 256이 아니면 거절", () => {
    expect(checkEmblemPng(makeTestPng(128, 128))).toBe("emblem_wrong_size");
    expect(checkEmblemPng(makeTestPng(256, 255))).toBe("emblem_wrong_size");
    expect(checkEmblemPng(makeTestPng(512, 512))).toBe("emblem_wrong_size");
  });

  it("바이트 상한을 넘으면 거절(크기가 맞아도)", () => {
    const big = makeTestPng(256, 256, [10, 10, 10, 255], 200);
    expect(big.length).toBeGreaterThan(NATION_EMBLEM_UPLOAD.maxBytes);
    expect(checkEmblemPng(big)).toBe("emblem_too_large");
  });
});

describe("decodeBase64", () => {
  it("base64 글을 바이트로 푼다", () => {
    const png = makeTestPng(4, 4);
    expect(Buffer.from(decodeBase64(png.toString("base64")) ?? [])).toEqual(png);
  });

  it("base64가 아닌 글은 null", () => {
    expect(decodeBase64("not base64!")).toBeNull();
    expect(decodeBase64("abc")).toBeNull();
    expect(decodeBase64("data:image/png;base64,AAAA")).toBeNull();
  });
});
