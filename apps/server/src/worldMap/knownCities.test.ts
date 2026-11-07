// 1차맵 도시 안개 판정 시험(docs/adr/2026-11-07-play-flow.md "WP7") — 시작 도시·내 국가·본 시야 칸·전체 보기, 껍질 거르기
import { VISION_BYTES, VISION_SIDE } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { cityVisionCell, hullKnown, isCityKnown } from "./knownCities.ts";

const city = { start: false, factionId: 7, mapKey: 100, cellX: 130, cellY: 70 };
const none = { observer: false, myFactionId: null, sighted: new Map<number, Uint8Array>() };

function bitsWith(cell: number): Uint8Array {
  const bits = new Uint8Array(VISION_BYTES);
  bits[cell >> 3] = 1 << (cell & 7);
  return bits;
}

/** 아는 도시 = 1·2 */
const known = (id: number) => id === 1 || id === 2;
/** 영토 덩이(도시 ID들 + 비콘 하나) */
const group = (factionId: number, ids: readonly number[], beacon = false) => ({
  factionId,
  members: [...ids.map((id) => ({ kind: "city", id })), ...(beacon ? [{ kind: "beacon", id: 99 }] : [])],
});

describe("내가 아는 도시", () => {
  it("시청 칸이 든 시야 칸 = 배치 칸 8×8", () => {
    expect(cityVisionCell(0, 0)).toBe(0);
    expect(cityVisionCell(130, 70)).toBe(8 * VISION_SIDE + 16);
    expect(cityVisionCell(255, 255)).toBe(VISION_SIDE * VISION_SIDE - 1);
  });

  it("시작 도시·내 국가·전체 보기는 탐사 없이 안다", () => {
    expect(isCityKnown(city, none)).toBe(false);
    expect(isCityKnown({ ...city, start: true }, none)).toBe(true);
    expect(isCityKnown(city, { ...none, myFactionId: 7 })).toBe(true);
    expect(isCityKnown(city, { ...none, myFactionId: 8 })).toBe(false);
    expect(isCityKnown(city, { ...none, observer: true })).toBe(true);
  });

  it("그 2차맵에서 시청 칸이 든 시야 칸을 봤으면 안다(다른 칸·다른 2차맵은 모른다)", () => {
    const cell = cityVisionCell(city.cellX, city.cellY);
    expect(isCityKnown(city, { ...none, sighted: new Map([[100, bitsWith(cell)]]) })).toBe(true);
    expect(isCityKnown(city, { ...none, sighted: new Map([[100, bitsWith(cell + 1)]]) })).toBe(false);
    expect(isCityKnown(city, { ...none, sighted: new Map([[101, bitsWith(cell)]]) })).toBe(false);
  });

  it("껍질: 내 국가 것이거나 그 덩이의 도시를 모두 알 때만(비콘만인 덩이는 내 국가 것만)", () => {
    expect(hullKnown(group(3, [1, 2], true), known, null)).toBe(true);
    expect(hullKnown(group(3, [1, 5]), known, null)).toBe(false);
    expect(hullKnown(group(3, [5]), known, 3)).toBe(true);
    expect(hullKnown(group(3, [], true), known, null)).toBe(false);
    expect(hullKnown(group(3, [], true), known, 3)).toBe(true);
  });
});
