// 지금 2차맵 + 옆 2차맵 유닛 합치기(docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜 2")
import type { UnitPath, UnitSpawn } from "@terra/engine";
import type { UnitMotionWire } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { FeedSink } from "./feedTypes.ts";
import { createUnitMerger, wireToMainFrame } from "./unitMerge.ts";

const EAST = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
const wire = (id: number, x: number, y: number): UnitMotionWire => ({
  id,
  size: 1,
  speed: 437,
  departAtMs: 1,
  path: [x * 1024, y * 1024],
});

function fakeSink() {
  const calls = { units: [] as number[][], paths: [] as [number, number][] };
  let selected: number | null = null;
  const sink: FeedSink = {
    setTerrain: () => Promise.resolve(),
    setUnits: (list: readonly UnitSpawn[]) => {
      calls.units.push(list.map((unit) => unit.id));
      selected = null;
    },
    setUnitPath: (id: number, path: UnitPath) => calls.paths.push([id, path.points[0] ?? -1]),
    setBuildings: () => undefined,
    setExplored: () => undefined,
    select: (id) => {
      selected = id;
    },
    selected: () => selected,
  };
  return { sink, calls };
}

describe("옆 2차맵 유닛 합치기", () => {
  it("옆 틀의 경로는 지금 틀로 옮긴다(동쪽 이웃 = 한 변만큼 오른쪽)", () => {
    expect(wireToMainFrame(wire(1, 10, 20), EAST).path).toEqual([266 * 1024, 20 * 1024]);
  });

  it("지금 2차맵 유닛과 옆 유닛을 함께 넣고, 경로만 바뀌면 그 경로만, 같은 ID는 지금 2차맵 것만", () => {
    const { sink, calls } = fakeSink();
    const merger = createUnitMerger();
    const wrapped = merger.wrap(sink);
    wrapped.setUnits([{ id: 1, look: { heightM: 1, radiusM: 0.3, color: 0 }, x: 5, y: 5 }]);
    wrapped.setUnitPath(1, { points: [5, 5], departAtMs: 0, speedCellsPerSec: 0.4 });
    wrapped.select(1);
    merger.setNeighbour(
      9,
      EAST,
      new Map([
        [7, wire(7, 10, 20)],
        [1, wire(1, 0, 0)],
      ]),
      null,
    );
    expect(calls.units.at(-1)).toEqual([1, 7]);
    // 다시 넣을 때 지금 2차맵 경로도 다시 건다, 고른 유닛은 그대로
    expect(calls.paths.filter(([id]) => id === 1).length).toBe(2);
    expect(sink.selected()).toBe(1);
    expect(merger.isNeighbourUnit(7)).toBe(true);
    expect(merger.isNeighbourUnit(1)).toBe(false);
    const before = calls.units.length;
    merger.setNeighbour(9, EAST, new Map([[7, wire(7, 11, 20)]]), [7]);
    expect(calls.units.length).toBe(before);
    expect(calls.paths.at(-1)).toEqual([7, 267]);
    merger.clearNeighbour(9);
    expect(calls.units.at(-1)).toEqual([1]);
  });
});
