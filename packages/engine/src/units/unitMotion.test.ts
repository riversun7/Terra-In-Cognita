import { describe, expect, it } from "vitest";
import { UnitMotionStore } from "./unitMotion.ts";

// 경로 (0,0) → (10,0) → (10,10), 2칸/초, 1초에 출발
const L_PATH = { points: [0, 0, 10, 0, 10, 10], departAtMs: 1000, speedCellsPerSec: 2 };

function at(store: UnitMotionStore, slot: number): [number, number] {
  return [store.x[slot] ?? Number.NaN, store.y[slot] ?? Number.NaN];
}

describe("UnitMotionStore", () => {
  it("꺾이는 점을 따라 시간에 맞게 간다", () => {
    const store = new UnitMotionStore(4);
    store.resize(1);
    store.setPath(0, L_PATH);
    expect(store.update(3500)).toBe(1); // 2.5초 × 2 = 5칸
    expect(at(store, 0)).toEqual([5, 0]);
    store.update(7000); // 6초 × 2 = 12칸 → 둘째 구간 2칸
    expect(at(store, 0)).toEqual([10, 2]);
    expect(store.moving[0]).toBe(1);
  });

  it("도착하면 마지막 점에 서고 가는 중이 아니다", () => {
    const store = new UnitMotionStore(1);
    store.resize(1);
    store.setPath(0, L_PATH);
    expect(store.update(20_000)).toBe(0);
    expect(at(store, 0)).toEqual([10, 10]);
    expect(store.moving[0]).toBe(0);
    expect(store.destination(0)).toEqual({ x: 10, y: 10 });
  });

  it("출발 전에는 출발점에 있고, 곧 움직이므로 가는 중으로 센다", () => {
    const store = new UnitMotionStore(1);
    store.resize(1);
    store.setPath(0, L_PATH);
    expect(store.update(500)).toBe(1);
    expect(at(store, 0)).toEqual([0, 0]);
  });

  it("점 하나 또는 속도 0이면 서 있다", () => {
    const store = new UnitMotionStore(2);
    store.resize(2);
    store.setPath(0, { points: [3, 4], departAtMs: 0, speedCellsPerSec: 1 });
    store.setPath(1, { points: [0, 0, 5, 5], departAtMs: 0, speedCellsPerSec: 0 });
    expect(store.update(10_000)).toBe(0);
    expect(at(store, 0)).toEqual([3, 4]);
    expect(at(store, 1)).toEqual([0, 0]);
  });

  it("시계가 뒤로 가도 맞는 구간을 찾는다", () => {
    const store = new UnitMotionStore(1);
    store.resize(1);
    store.setPath(0, L_PATH);
    store.update(7000);
    store.update(3500);
    expect(at(store, 0)).toEqual([5, 0]);
  });

  it("칸 하나만 계산할 수 있다(compute)", () => {
    const store = new UnitMotionStore(2);
    store.resize(2);
    store.setPath(0, L_PATH);
    store.setPath(1, { ...L_PATH, departAtMs: 0 });
    expect(store.compute(1, 1000)).toBe(true);
    expect(at(store, 1)).toEqual([2, 0]);
    // 칸 0은 그대로(출발점)
    expect(at(store, 0)).toEqual([0, 0]);
  });

  it("경로를 많이 바꿔도(저장소 모아 담기·키우기) 위치가 맞다", () => {
    const store = new UnitMotionStore(10);
    store.resize(10);
    for (let round = 0; round < 500; round++) {
      for (let slot = 0; slot < 10; slot++) {
        const points: number[] = [];
        for (let i = 0; i <= 20 + (round % 7); i++) points.push(slot + i, round);
        store.setPath(slot, { points, departAtMs: 0, speedCellsPerSec: 1 });
      }
    }
    store.update(3000); // 3칸 갔다
    for (let slot = 0; slot < 10; slot++) expect(at(store, slot)).toEqual([slot + 3, 499]);
  });

  it("칸 수를 줄였다 늘리면 새 칸은 비어 있다", () => {
    const store = new UnitMotionStore(3);
    store.resize(3);
    store.setPath(2, L_PATH);
    store.resize(1);
    store.resize(3);
    expect(store.destination(2)).toBeNull();
    expect(store.update(5000)).toBe(0);
  });

  it("범위 밖 칸과 빈 경로는 오류", () => {
    const store = new UnitMotionStore(1);
    store.resize(1);
    expect(() => store.setPath(1, L_PATH)).toThrow(RangeError);
    expect(() => store.setPath(0, { points: [], departAtMs: 0, speedCellsPerSec: 1 })).toThrow();
    expect(() => store.resize(2)).toThrow(RangeError);
  });
  it("경로 점·간 길이·경로 판을 읽는다(경로 표시용)", () => {
    const store = new UnitMotionStore(2);
    store.resize(2);
    const before = store.revision(0);
    store.setPath(0, L_PATH);
    expect(store.revision(0)).not.toBe(before);
    expect(Array.from(store.pathPoints(0) ?? [])).toEqual(Array.from(L_PATH.points));
    expect(store.pathPoints(1)).toBeNull();
    expect(store.travelled(0, L_PATH.departAtMs - 500)).toBe(0);
    expect(store.travelled(0, L_PATH.departAtMs + 1_000)).toBeCloseTo(L_PATH.speedCellsPerSec);
    expect(store.travelled(0, L_PATH.departAtMs + 1e9)).toBeCloseTo(20);
    expect(store.revision(5)).toBe(0);
  });
});
