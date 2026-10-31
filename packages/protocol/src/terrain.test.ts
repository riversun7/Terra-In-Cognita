// 지형 이진 형식 시험 — 왕복, 작은 끝 바이트 배치, 틀린 입력 거부
import { describe, expect, it } from "vitest";
import { ProtocolError } from "./codec.ts";
import {
  TERRAIN_FORMAT_V1,
  TERRAIN_FORMAT_VERSION,
  TERRAIN_HEADER_BYTES,
  TERRAIN_HEADER_BYTES_V2,
  TERRAIN_NO_WATER,
  type TerrainData,
  decodeTerrain,
  encodeTerrain,
  terrainPath,
} from "./terrain.ts";

function sample(size = 4): TerrainData {
  const vertices = size + 1;
  return {
    mapKey: 281_474_976_710_665,
    generatorVersion: 1,
    seed: 0xdead_beef,
    hash: 0x9671_0fb5,
    terrainSize: size,
    heights: Int32Array.from({ length: vertices * vertices }, (_, i) => (i % 2 === 0 ? -i * 100 : i * 7)),
    surface: Uint8Array.from({ length: size * size }, (_, i) => i % 4),
  };
}

describe("지형 이진 형식", () => {
  it("왕복하면 같은 값이 나온다", () => {
    const data = sample();
    expect(decodeTerrain(encodeTerrain(data))).toEqual(data);
  });

  it("머리는 작은 끝(little-endian) 순서로 정해진 자리에 쓴다", () => {
    const bytes = encodeTerrain(sample(2));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("TCTR");
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(4, true)).toBe(TERRAIN_FORMAT_V1);
    expect(view.getUint16(6, true)).toBe(TERRAIN_HEADER_BYTES);
    expect(view.getUint32(12, true)).toBe(0xdead_beef);
    expect([view.getUint16(16, true), view.getUint16(18, true)]).toEqual([2, 3]);
    // 2차맵 키 2^48 + 9 = 아래 32비트 9, 위 0x10000
    expect([view.getUint32(24, true), view.getUint32(28, true)]).toEqual([9, 0x1_0000]);
    // 첫 높이 0, 둘째 높이 7 (i32 작은 끝)
    expect(Array.from(bytes.slice(TERRAIN_HEADER_BYTES, TERRAIN_HEADER_BYTES + 8))).toEqual([
      0, 0, 0, 0, 7, 0, 0, 0,
    ]);
    expect(bytes.byteLength).toBe(TERRAIN_HEADER_BYTES + 9 * 4 + 4);
  });

  it("Buffer처럼 큰 배열의 일부(byteOffset)여도 읽는다", () => {
    const encoded = encodeTerrain(sample());
    const padded = new Uint8Array(encoded.byteLength + 8);
    padded.set(encoded, 8);
    expect(decodeTerrain(padded.subarray(8))).toEqual(sample());
  });

  it("마법 값·형식 버전·길이가 틀리면 ProtocolError", () => {
    const good = encodeTerrain(sample());
    const wrongMagic = good.slice();
    wrongMagic[0] = 0x58;
    expect(() => decodeTerrain(wrongMagic)).toThrow(ProtocolError);
    const wrongVersion = good.slice();
    new DataView(wrongVersion.buffer).setUint16(4, TERRAIN_FORMAT_VERSION + 1, true);
    expect(() => decodeTerrain(wrongVersion)).toThrow(ProtocolError);
    expect(() => decodeTerrain(good.slice(0, good.byteLength - 1))).toThrow(ProtocolError);
    expect(() => decodeTerrain(good.slice(0, 10))).toThrow(ProtocolError);
  });

  it("배열 크기가 맞지 않으면 만들지 않는다", () => {
    expect(() => encodeTerrain({ ...sample(), surface: new Uint8Array(3) })).toThrow(RangeError);
    expect(() => encodeTerrain({ ...sample(), seed: -1 })).toThrow(RangeError);
  });

  it("주소에 2차맵 키와 생성기 버전이 붙는다", () => {
    expect(terrainPath(281_474_976_710_665, 3)).toBe("/api/maps/281474976710665/terrain?v=3");
  });

  it("2판: 물 높이·엄폐·실제 칸 크기·판을 왕복한다. 1판 칸만 있으면 1판으로 쓴다", () => {
    const base = sample(4);
    const v2: TerrainData = {
      ...base,
      waterLevels: Int32Array.from({ length: 25 }, (_, i) => (i % 3 === 0 ? TERRAIN_NO_WATER : i * 10)),
      cover: Uint8Array.from({ length: 64 }, (_, i) => i % 3),
      placementSize: 8,
      cellSizeMm: 11_720,
      planetGeneratorVersion: 3,
      definitionHash: 0x6fe8_8527,
    };
    const bytes = encodeTerrain(v2);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(4, true)).toBe(TERRAIN_FORMAT_VERSION);
    expect(view.getUint16(6, true)).toBe(TERRAIN_HEADER_BYTES_V2);
    expect(bytes.byteLength).toBe(TERRAIN_HEADER_BYTES_V2 + 25 * 4 * 2 + 16 + 64);
    expect(decodeTerrain(bytes)).toEqual(v2);
    // 물 높이만, 엄폐 없음
    const waterOnly: TerrainData = { ...base, waterLevels: new Int32Array(25).fill(5), cellSizeMm: 11_000 };
    const back = decodeTerrain(encodeTerrain(waterOnly));
    expect(back.cover).toBeUndefined();
    expect([...(back.waterLevels ?? [])]).toEqual(Array.from({ length: 25 }, () => 5));
    expect(new DataView(encodeTerrain(base).buffer).getUint16(4, true)).toBe(TERRAIN_FORMAT_V1);
  });

  it("2판: 소품 그림 층(깃발 4)은 엄폐 층 뒤에 오고, 엄폐 없이도 쓴다", () => {
    const base = sample(4);
    const art = Uint8Array.from({ length: 64 }, (_, i) => i % 8);
    const both: TerrainData = {
      ...base,
      cover: Uint8Array.from({ length: 64 }, (_, i) => i % 3),
      art,
      placementSize: 8,
      cellSizeMm: 11_720,
    };
    const bytes = encodeTerrain(both);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(46, true)).toBe(2 | 4);
    expect(bytes.byteLength).toBe(TERRAIN_HEADER_BYTES_V2 + 25 * 4 + 16 + 64 + 64);
    expect(Array.from(bytes.subarray(bytes.length - 64))).toEqual([...art]);
    expect(decodeTerrain(bytes)).toEqual({
      ...both,
      planetGeneratorVersion: 0,
      definitionHash: 0,
    });
    const artOnly: TerrainData = { ...base, art, placementSize: 8, cellSizeMm: 1 };
    const back = decodeTerrain(encodeTerrain(artOnly));
    expect(back.cover).toBeUndefined();
    expect([...(back.art ?? [])]).toEqual([...art]);
    expect(() => encodeTerrain({ ...artOnly, art: new Uint8Array(10) })).toThrow(RangeError);
  });

  it("2판: 길이·엄폐 크기가 틀리면 거부한다", () => {
    const v2: TerrainData = { ...sample(4), cover: new Uint8Array(64), placementSize: 8, cellSizeMm: 1 };
    const bytes = encodeTerrain(v2);
    expect(() => decodeTerrain(bytes.slice(0, bytes.length - 1))).toThrow(ProtocolError);
    expect(() => encodeTerrain({ ...v2, placementSize: 9 })).toThrow(RangeError);
    expect(() => encodeTerrain({ ...v2, waterLevels: new Int32Array(3) })).toThrow(RangeError);
  });
});
