// 1차맵 도시 안개 판정 시험(docs/adr/2026-11-07-play-flow.md "WP7") — 시작 도시·내 국가·본 시야 칸·전체 보기, 껍질 거르기
import { VISION_BYTES, VISION_SIDE } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { beaconKnown, cityVisionCell, hullKnown, isCityKnown } from "./knownCities.ts";
import { worldMapBeaconsOf } from "./reads.ts";

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

describe("1차맵 영토 비콘(기획 D-546 1434)", () => {
  const beacon = (id: number, factionId: number, cityId: number | null) => ({
    id,
    factionId,
    cityId,
    cellKey: 0,
    point: [1, 0, 0] as const,
    durability: 1,
    builtAtMs: 0,
  });
  const view = {
    beacons: [beacon(1, 3, 1), beacon(2, 3, 5), beacon(3, 4, 1), beacon(4, 3, null), beacon(9, 3, 1)],
    // 비콘 9는 꼭짓점이 아니다(짓는 중·상태 문턱 아래)
    groups: [1, 2, 3, 4].map((id) => ({
      factionId: 3,
      members: [{ kind: "beacon" as const, id }],
      hull: null,
    })),
  };
  const knowing = (myFactionId: number | null, observer = false) => ({
    factionKnown: (id: number) => id !== 4,
    cityKnown: (id: number) => id === 1,
    myFactionId,
    observer,
  });

  it("기준 도시를 알거나 내 국가 비콘만, 꼭짓점인 것만, 아는 국가만 — 전체 보기는 기준 도시와 상관없이", () => {
    expect(beaconKnown({ factionId: 3, cityId: 1 }, (id) => id === 1, null)).toBe(true);
    expect(beaconKnown({ factionId: 3, cityId: 5 }, (id) => id === 1, null)).toBe(false);
    expect(beaconKnown({ factionId: 3, cityId: null }, (id) => id === 1, 3)).toBe(true);
    expect(worldMapBeaconsOf(view, knowing(null)).map((entry) => entry.id)).toEqual([1]);
    expect(worldMapBeaconsOf(view, knowing(3)).map((entry) => entry.id)).toEqual([1, 2, 4]);
    expect(worldMapBeaconsOf(view, knowing(null, true)).map((entry) => entry.id)).toEqual([1, 2, 4]);
    expect(worldMapBeaconsOf(view, knowing(null))[0]).toMatchObject({ cityId: 1, latDeg: 0, lonDeg: 0 });
    expect(worldMapBeaconsOf(undefined, knowing(null))).toEqual([]);
  });
});
