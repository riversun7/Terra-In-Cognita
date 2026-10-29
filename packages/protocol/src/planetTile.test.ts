// 행성 타일 이진 형식 시험 — 왕복, 작은 끝 바이트 배치, 틀린 입력 거부, 주소
import { describe, expect, it } from "vitest";
import { ProtocolError } from "./codec.ts";
import {
  PLANET_TILE_FORMAT_VERSION,
  PLANET_TILE_HEADER_BYTES,
  type PlanetTileData,
  decodePlanetTile,
  encodePlanetTile,
  planetManifestPath,
  planetTileByteLength,
  planetTilePath,
  planetTileUrlTemplate,
  planetTileVersion,
} from "./planetTile.ts";

const HASH = "0123456789abcdef".repeat(4);

function sample(overrides: Partial<PlanetTileData> = {}): PlanetTileData {
  const size = overrides.size ?? 32;
  const corners = (size + 1) * (size + 1);
  const cells = size * size;
  return {
    faceLevel: 9,
    mapLevel: 7,
    face: 4,
    i0: 64,
    j0: 96,
    size,
    heightsM: Int16Array.from({ length: corners }, (_, i) => (i % 3 === 0 ? -i * 7 : i * 11) % 32_000),
    biome: Uint8Array.from({ length: cells }, (_, i) => i % 14),
    water: Uint8Array.from({ length: cells }, (_, i) => (i * 37) % 64),
    temperatureC: Int8Array.from({ length: cells }, (_, i) => (i % 100) - 50),
    humidity: Uint8Array.from({ length: cells }, (_, i) => (i * 5) % 256),
    forest: Uint8Array.from({ length: cells }, (_, i) => 255 - (i % 256)),
    river: Uint8Array.from({ length: cells }, (_, i) => i % 4),
    generatorVersion: 3,
    definitionHash: HASH,
    ...overrides,
  };
}

describe("행성 타일 이진 형식", () => {
  it("왕복하면 같은 값이 나온다 (32×32 타일, 압축 전 8,378바이트)", () => {
    const tile = sample();
    const bytes = encodePlanetTile(tile);
    expect(bytes.byteLength).toBe(planetTileByteLength(32));
    expect(bytes.byteLength).toBe(56 + 33 * 33 * 2 + 6 * 1024);
    expect(decodePlanetTile(bytes)).toEqual(tile);
  });

  it("면 전체 타일(면이 32칸보다 작은 맵 레벨)도 왕복한다", () => {
    const tile = sample({ faceLevel: 6, mapLevel: 3, face: 1, i0: 0, j0: 0, size: 8 });
    expect(decodePlanetTile(encodePlanetTile(tile))).toEqual(tile);
  });

  it("머리는 작은 끝(little-endian) 순서로 정해진 자리에 쓴다", () => {
    const bytes = encodePlanetTile(sample());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("TCPT");
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(4, true)).toBe(PLANET_TILE_FORMAT_VERSION);
    expect(view.getUint16(6, true)).toBe(PLANET_TILE_HEADER_BYTES);
    expect([view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)]).toEqual([9, 7, 4, 0]);
    expect([view.getUint16(12, true), view.getUint16(14, true), view.getUint16(16, true)]).toEqual([
      64, 96, 32,
    ]);
    expect(view.getUint32(20, true)).toBe(3);
    expect(Array.from(bytes.slice(24, 28))).toEqual([0x01, 0x23, 0x45, 0x67]);
    // 첫 꼭짓점 높이 0, 둘째 11 (i16 작은 끝), 셋째 22
    expect(Array.from(bytes.slice(56, 62))).toEqual([0, 0, 11, 0, 22, 0]);
    // 넷째 꼭짓점 -21 = 0xffeb
    expect([view.getInt16(62, true), bytes[62], bytes[63]]).toEqual([-21, 0xeb, 0xff]);
    // 기온(i8)은 2의 보수 바이트: 첫 칸 -50 = 0xce
    const temperatureAt = 56 + 33 * 33 * 2 + 2 * 1024;
    expect(bytes[temperatureAt]).toBe(0xce);
  });

  it("Buffer처럼 큰 배열의 일부(byteOffset)여도 읽고, 결과는 받은 버퍼와 나뉜다", () => {
    const encoded = encodePlanetTile(sample());
    const padded = new Uint8Array(encoded.byteLength + 8);
    padded.set(encoded, 8);
    const decoded = decodePlanetTile(padded.subarray(8));
    expect(decoded).toEqual(sample());
    padded.fill(0);
    expect(decoded).toEqual(sample());
  });

  it("마법 값·형식 버전·길이·머리 값이 틀리면 ProtocolError", () => {
    const good = encodePlanetTile(sample());
    const broken = (edit: (view: DataView) => void) => {
      const copy = good.slice();
      edit(new DataView(copy.buffer));
      return copy;
    };
    expect(() => decodePlanetTile(broken((v) => v.setUint8(0, 0x58)))).toThrow(ProtocolError);
    expect(() =>
      decodePlanetTile(broken((v) => v.setUint16(4, PLANET_TILE_FORMAT_VERSION + 1, true))),
    ).toThrow(ProtocolError);
    expect(() => decodePlanetTile(broken((v) => v.setUint16(6, 40, true)))).toThrow(ProtocolError);
    expect(() => decodePlanetTile(broken((v) => v.setUint8(8, 3)))).toThrow(ProtocolError); // 면 레벨
    expect(() => decodePlanetTile(broken((v) => v.setUint8(9, 10)))).toThrow(ProtocolError); // 맵 레벨 > F
    expect(() => decodePlanetTile(broken((v) => v.setUint8(9, 4)))).toThrow(ProtocolError); // 맵 레벨 < F − 4
    expect(() => decodePlanetTile(broken((v) => v.setUint8(10, 6)))).toThrow(ProtocolError); // 면
    expect(() => decodePlanetTile(broken((v) => v.setUint16(12, 65, true)))).toThrow(ProtocolError); // 경계 아님
    expect(() => decodePlanetTile(broken((v) => v.setUint16(14, 128, true)))).toThrow(ProtocolError); // 면 밖
    expect(() => decodePlanetTile(broken((v) => v.setUint16(16, 16, true)))).toThrow(ProtocolError); // 한 변
    expect(() => decodePlanetTile(good.slice(0, good.byteLength - 1))).toThrow(ProtocolError);
    expect(() => decodePlanetTile(new Uint8Array([...good, 0]))).toThrow(ProtocolError);
    expect(() => decodePlanetTile(good.slice(0, 20))).toThrow(ProtocolError);
    expect(() => decodePlanetTile(new ArrayBuffer(0))).toThrow(ProtocolError);
  });

  it("머리를 늘린 파일(머리 길이 > 56)은 늘어난 만큼 건너뛰고 읽는다", () => {
    const good = encodePlanetTile(sample());
    const longer = new Uint8Array(good.byteLength + 8);
    longer.set(good.subarray(0, PLANET_TILE_HEADER_BYTES), 0);
    longer.set(good.subarray(PLANET_TILE_HEADER_BYTES), PLANET_TILE_HEADER_BYTES + 8);
    new DataView(longer.buffer).setUint16(6, PLANET_TILE_HEADER_BYTES + 8, true);
    expect(decodePlanetTile(longer)).toEqual(sample());
  });

  it("배열 크기·머리 값·해시가 틀리면 만들지 않는다", () => {
    expect(() => encodePlanetTile(sample({ biome: new Uint8Array(3) }))).toThrow(RangeError);
    expect(() => encodePlanetTile(sample({ heightsM: new Int16Array(4) }))).toThrow(RangeError);
    expect(() => encodePlanetTile(sample({ i0: 16 }))).toThrow(RangeError);
    expect(() => encodePlanetTile(sample({ mapLevel: 10 }))).toThrow(RangeError);
    expect(() => encodePlanetTile(sample({ generatorVersion: -1 }))).toThrow(RangeError);
    expect(() => encodePlanetTile(sample({ definitionHash: "abc" }))).toThrow(RangeError);
    expect(() => encodePlanetTile(sample({ definitionHash: HASH.toUpperCase() }))).toThrow(RangeError);
  });

  it("주소: 목록 정보, 버전(형식.생성기.정의 해시 앞 16자), 타일 주소 틀", () => {
    expect(planetManifestPath("s2_synthetic")).toBe("/api/planets/s2_synthetic");
    const version = planetTileVersion(3, HASH);
    expect(version).toBe(`${PLANET_TILE_FORMAT_VERSION}.3.0123456789abcdef`);
    const template = planetTileUrlTemplate("s2_synthetic", version);
    expect(template).toBe(`/api/planets/s2_synthetic/tiles/{tileKey}?v=${version}`);
    expect(planetTilePath(template, 281_474_976_710_665)).toBe(
      `/api/planets/s2_synthetic/tiles/281474976710665?v=${version}`,
    );
  });
});
