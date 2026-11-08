// 근처 목록 계산·상태 시험(docs/adr/2026-11-08-seamless-second-map.md WP-2)
import { describe, expect, it } from "vitest";
import { buildingCentre, distanceParts, nearListEnd, rankByDistance } from "./nearbyData.ts";
import { NEARBY_PAGE, createNearbyState } from "./nearbyState.ts";

const items = [
  { id: 5, x: 10, y: 10 },
  { id: 2, x: 0, y: 3 },
  { id: 9, x: 3, y: 0 },
  { id: 1, x: 50, y: 50 },
];
const point = (item: { x: number; y: number }) => item;
const id = (item: { id: number }) => item.id;

describe("근처 차례", () => {
  it("기준점에서 가까운 차례, 같은 거리는 작은 ID 먼저, limit개", () => {
    const ranked = rankByDistance(items, { x: 0, y: 0 }, point, id, 3);
    expect(ranked.map((row) => row.item.id)).toEqual([2, 9, 5]);
    expect(ranked[0]?.cells).toBe(3);
  });

  it("기준점이 없으면 원래 차례", () => {
    expect(rankByDistance(items, null, point, id).map((row) => row.item.id)).toEqual([5, 2, 9, 1]);
  });

  it("건물 가운데는 돌림을 본다", () => {
    const base = { id: 1, cellX: 10, cellY: 20, width: 4, depth: 2, heightM: 3 } as const;
    expect(buildingCentre({ ...base, rotation: 0 })).toEqual({ x: 12, y: 21 });
    expect(buildingCentre({ ...base, rotation: 1 })).toEqual({ x: 11, y: 22 });
  });
});

describe("거리 글자 값", () => {
  it("1km 아래는 m, 넘으면 km 소수 한 자리, 칸 크기를 모르면 없음", () => {
    expect(distanceParts(10, 5.86)).toEqual({ unit: "m", value: 59 });
    expect(distanceParts(200, 5.86)).toEqual({ unit: "km", value: 1.2 });
    expect(distanceParts(10, 0)).toBeNull();
  });

  it("목록 끝 가까이", () => {
    expect(nearListEnd({ scrollTop: 180, clientHeight: 100, scrollHeight: 300 })).toBe(true);
    expect(nearListEnd({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 })).toBe(false);
  });
});

describe("근처 상태", () => {
  it("탭 고르기·같은 탭은 접기/펴기·닫기, 탭을 바꾸면 줄 수가 돌아간다", () => {
    const state = createNearbyState({ tab: null, expanded: false });
    let calls = 0;
    state.subscribe(() => {
      calls += 1;
    });
    state.setTab("resources");
    expect([state.tab, state.expanded, state.limit]).toEqual(["resources", true, NEARBY_PAGE]);
    state.more();
    expect(state.limit).toBe(NEARBY_PAGE * 2);
    state.setTab("resources");
    expect(state.expanded).toBe(false);
    state.setTab("units");
    expect([state.tab, state.expanded, state.limit]).toEqual(["units", true, NEARBY_PAGE]);
    state.setTab(null);
    expect([state.tab, state.expanded]).toEqual([null, false]);
    expect(calls).toBe(5);
  });
});
