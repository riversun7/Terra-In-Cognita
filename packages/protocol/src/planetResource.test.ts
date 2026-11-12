import { describe, expect, it } from "vitest";
import { ProtocolError } from "./errors.ts";
import {
  PLANET_RESOURCE_HEADER_BYTES,
  decodePlanetResource,
  encodePlanetResource,
  planetResourcePath,
  pmToByte,
} from "./planetResource.ts";

const planes = (level: number, fill: number): Uint8Array => new Uint8Array(6 * 4 ** level).fill(fill);

describe("1차맵 자원 분포 지도 이진 형식", () => {
  it("몫 → 바이트: 0 → 0, 1000 → 255, 반올림, 범위 밖은 자른다", () => {
    expect(pmToByte(0)).toBe(0);
    expect(pmToByte(1000)).toBe(255);
    expect(pmToByte(500)).toBe(128);
    expect(pmToByte(-5)).toBe(0);
    expect(pmToByte(4000)).toBe(255);
  });

  it("판 하나·둘을 그대로 되돌린다", () => {
    const share = planes(2, 7);
    const one = decodePlanetResource(
      encodePlanetResource({ faceLevel: 9, level: 2, material: 1, share, high: null }),
    );
    expect(one).toEqual({ faceLevel: 9, level: 2, material: 1, share, high: null });
    const high = planes(2, 255);
    const two = decodePlanetResource(
      encodePlanetResource({ faceLevel: 9, level: 2, material: 0, share, high }),
    );
    expect(two.high).toEqual(high);
    expect(two.share).toEqual(share);
  });

  it("틀린 머리·길이는 ProtocolError, 틀린 입력은 RangeError", () => {
    const bytes = encodePlanetResource({
      faceLevel: 4,
      level: 1,
      material: 5,
      share: planes(1, 1),
      high: null,
    });
    expect(() => decodePlanetResource(bytes.slice(0, bytes.length - 1))).toThrow(ProtocolError);
    const wrong = bytes.slice();
    wrong[0] = 0;
    expect(() => decodePlanetResource(wrong)).toThrow(ProtocolError);
    const badMaterial = bytes.slice();
    badMaterial[10] = 6;
    expect(() => decodePlanetResource(badMaterial)).toThrow(ProtocolError);
    expect(() => decodePlanetResource(new Uint8Array(PLANET_RESOURCE_HEADER_BYTES - 1))).toThrow(
      ProtocolError,
    );
    expect(() =>
      encodePlanetResource({ faceLevel: 4, level: 5, material: 0, share: planes(5, 0), high: null }),
    ).toThrow(RangeError);
    expect(() =>
      encodePlanetResource({ faceLevel: 9, level: 2, material: 0, share: planes(1, 0), high: null }),
    ).toThrow(RangeError);
  });

  it("주소", () => {
    expect(planetResourcePath("s2_test_planet", "ore")).toBe("/api/planets/s2_test_planet/resources/ore");
  });
});
