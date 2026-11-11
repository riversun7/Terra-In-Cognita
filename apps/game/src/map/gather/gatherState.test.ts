// 2차맵 채집 화면 상태 시험 — 서버 응답 풀기, 누른 칸 → 오브젝트·건물 판, 건물 돌림(docs/adr/2026-11-07-gather-objects.md 6절)
import type { BuildingFootprint } from "@terra/engine";
import { describe, expect, it } from "vitest";
import { kindClass, pickHit } from "./gatherOverlay.ts";
import { buildingAt, createGatherState, decodeObjects, nearestObject } from "./gatherState.ts";

const building = (over: Partial<BuildingFootprint>): BuildingFootprint => ({
  id: 1,
  cellX: 50,
  cellY: 50,
  width: 4,
  depth: 2,
  rotation: 0,
  heightM: 4,
  ...over,
});

describe("채집 화면 상태", () => {
  it("오브젝트 풀기: 번호 → 칸, 걸음이 틀리면 빈 목록", () => {
    expect(decodeObjects({ objects: [16 * 256 + 20, 0, 5, 0, 300, 1, 0, 1_800_000_000_000] })).toEqual([
      { id: 4116, kind: 0, x: 20, y: 16, usesLeft: 5, regrowAtMs: 0 },
      { id: 300, kind: 1, x: 44, y: 1, usesLeft: 0, regrowAtMs: 1_800_000_000_000 },
    ]);
    expect(decodeObjects({ objects: [1, 2, 3] })).toEqual([]);
  });

  it("칸 둘레 오브젝트(반경 2칸), 누른 칸은 돌린 건물 칸만 판을 연다(없으면 false)", () => {
    const objects = decodeObjects({ objects: [16 * 256 + 20, 0, 5, 0, 16 * 256 + 23, 0, 5, 0] });
    expect(nearestObject(objects, { x: 21.6, y: 16.2 })?.id).toBe(16 * 256 + 20);
    expect(nearestObject(objects, { x: 22.5, y: 16.5 })?.id).toBe(16 * 256 + 23);
    expect(nearestObject(objects, { x: 26.5, y: 16.5 })).toBeUndefined();
    // 90° 돌린 4×2 건물은 2×4 칸을 차지한다
    expect(buildingAt([building({ rotation: 1 })], { x: 51.5, y: 53.5 })?.id).toBe(1);
    expect(buildingAt([building({ rotation: 1 })], { x: 53.5, y: 50.5 })).toBeUndefined();
    expect(buildingAt([building({})], { x: 53.5, y: 50.5 })?.id).toBe(1);

    const state = createGatherState();
    let calls = 0;
    const off = state.subscribe(() => {
      calls += 1;
    });
    state.setObjects({
      status: "ok",
      mapKey: 1,
      kinds: [],
      objects: [16 * 256 + 20, 0, 5, 0],
      generatedAt: 0,
    });
    state.setBuildings([building({ id: 9 })]);
    // 오브젝트 둘레 땅을 눌러도 판을 열지 않는다(표시는 화면 거리로 고른다 — 사용자 지적 2026-11-08)
    expect(state.tapCell({ x: 20.5, y: 17.5 })).toBe(false);
    expect(state.sheet).toBeNull();
    expect(state.tapCell({ x: 51.5, y: 50.5 })).toBe(true);
    expect(state.sheet).toEqual({ kind: "building", id: 9 });
    expect(state.tapCell({ x: 120.5, y: 120.5 })).toBe(false);
    state.open({ kind: "object", id: 4116 });
    expect(state.sheet).toEqual({ kind: "object", id: 4116 });
    expect(calls).toBe(4);
    off();
  });

  it("표시 누르기: 화면 거리 22px(누름 영역 44px의 반) 안 가장 가까운 표시, 밖이면 없음", () => {
    const hits = [
      { x: 100, y: 100, sheet: { kind: "object", id: 1 } as const },
      { x: 130, y: 100, sheet: { kind: "building", id: 2 } as const },
    ];
    expect(pickHit(hits, { x: 104, y: 103 })?.sheet).toEqual({ kind: "object", id: 1 });
    expect(pickHit(hits, { x: 120, y: 100 })?.sheet).toEqual({ kind: "building", id: 2 });
    expect(pickHit(hits, { x: 100, y: 122 })?.sheet).toEqual({ kind: "object", id: 1 });
    expect(pickHit(hits, { x: 100, y: 123 })).toBeNull();
    expect(pickHit([], { x: 0, y: 0 })).toBeNull();
  });

  it("표시 무리: 원목·돌·광석·약초", () => {
    expect(["pine_log", "stone", "copper_ore", "wild_herb"].map((item) => kindClass(item))).toEqual([
      "wood",
      "stone",
      "ore",
      "herb",
    ]);
  });

  it("표시 무리: 밭·목초지·물터는 맡는 시설로", () => {
    expect([
      kindClass("barley", "farm"),
      kindClass("raw_meat", "ranch"),
      kindClass("loach", "fishing_spot"),
    ]).toEqual(["crop", "animal", "fish"]);
    expect(kindClass("pine_log", "lumber_camp")).toBe("wood");
  });
});
