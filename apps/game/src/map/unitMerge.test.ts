// 지금 2차맵 + 옆 2차맵 유닛 합치기(docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜 2")와 넘는 순간 이어 보이기("바뀜 (2026-11-11)")
import type { UnitPath, UnitSpawn } from "@terra/engine";
import { describe, expect, it, vi } from "vitest";
import type { FeedSink } from "./feedTypes.ts";
import { BLEND_WINDOW_MS, GHOST_CELLS, GHOST_MS, createUnitMerger } from "./unitMerge.ts";

const EAST = { a: 1, b: 0, cc: 0, d: 1, tx: 128, tz: 0 };
const LOOK = { heightM: 1.8, radiusM: 0.3, color: 0 };
const spawn = (id: number, x: number, y: number): UnitSpawn => ({ id, look: LOOK, x, y });
const walk = (points: number[], departAtMs = 0, speedCellsPerSec = 1): UnitPath => ({
  points,
  departAtMs,
  speedCellsPerSec,
});

/** 가짜 엔진: 넣은 목록·경로를 기억하고, 지금 시각의 자리를 경로에서 셈한다(곧은 한 구간만) */
function fakeEngine() {
  const state = {
    units: [] as UnitSpawn[],
    paths: new Map<number, UnitPath>(),
    setUnitsCalls: 0,
    now: 0,
  };
  let selected: number | null = null;
  const sink: FeedSink = {
    setTerrain: () => Promise.resolve(),
    setUnits: (list) => {
      state.units = [...list];
      state.paths.clear();
      state.setUnitsCalls += 1;
      selected = null;
    },
    setUnitPath: (id, path) => {
      if (state.units.some((unit) => unit.id === id)) state.paths.set(id, path);
    },
    setBuildings: () => undefined,
    setExplored: () => undefined,
    select: (id) => {
      selected = id;
    },
    selected: () => selected,
  };
  const unitAt = (id: number): { x: number; y: number } | null => {
    const unit = state.units.find((item) => item.id === id);
    if (!unit) return null;
    const path = state.paths.get(id);
    if (!path || path.points.length < 4) {
      return path ? { x: Number(path.points[0]), y: Number(path.points[1]) } : { x: unit.x, y: unit.y };
    }
    const [x0, y0, x1, y1] = Array.from(path.points);
    const length = Math.hypot((x1 ?? 0) - (x0 ?? 0), (y1 ?? 0) - (y0 ?? 0));
    const gone = Math.min(length, (Math.max(0, state.now - path.departAtMs) / 1000) * path.speedCellsPerSec);
    const t = length > 0 ? gone / length : 0;
    return { x: (x0 ?? 0) + ((x1 ?? 0) - (x0 ?? 0)) * t, y: (y0 ?? 0) + ((y1 ?? 0) - (y0 ?? 0)) * t };
  };
  return { sink, state, unitAt, ids: () => state.units.map((unit) => unit.id) };
}

function setup(options: { carry?: number | null; crossing?: boolean; capacity?: number } = {}) {
  const engine = fakeEngine();
  const gone: { id: number; last: { x: number; y: number } }[] = [];
  const merger = createUnitMerger({
    capacity: options.capacity ?? 100,
    unitAt: engine.unitAt,
    now: () => engine.state.now,
    carry: () => options.carry ?? null,
    onCarryGone: (id, last) => {
      gone.push({ id, last });
      return options.crossing ?? true;
    },
  });
  return { engine, merger, gone, main: merger.wrap(engine.sink) };
}

describe("옆 2차맵 유닛 합치기", () => {
  it("지금 2차맵 유닛과 옆 유닛을 함께 넣고(옆 틀 → 지금 틀), 경로만 바뀌면 그 경로만, 같은 ID는 지금 2차맵 것만", () => {
    const { engine, merger, main } = setup();
    main.setUnits([spawn(1, 5, 5)]);
    main.setUnitPath(1, walk([5, 5]));
    main.select(1);
    const east = merger.neighbourSink(9, EAST);
    east.setUnits([spawn(7, 10, 20), spawn(1, 0, 0)]);
    east.setUnitPath(7, walk([10, 20, 12, 20]));
    east.setUnitPath(1, walk([0, 0]));
    expect(engine.ids()).toEqual([1, 7]);
    // 옆 유닛은 한 변(배치 칸 256)만큼 오른쪽, 같은 ID는 지금 2차맵 경로 그대로
    expect(engine.state.units[1]).toMatchObject({ x: 266, y: 20 });
    expect(Array.from(engine.state.paths.get(7)?.points ?? [])).toEqual([266, 20, 268, 20]);
    expect(Array.from(engine.state.paths.get(1)?.points ?? [])).toEqual([5, 5]);
    // 다시 넣어도 고른 유닛은 그대로
    expect(engine.sink.selected()).toBe(1);
    expect(merger.isNeighbourUnit(7)).toBe(true);
    expect(merger.isNeighbourUnit(1)).toBe(false);
    expect(merger.mainPath(1)?.points.length).toBe(2);
    expect(merger.mainPath(7)).toBeNull();
    const calls = engine.state.setUnitsCalls;
    east.setUnitPath(7, walk([11, 20, 13, 20]));
    expect(engine.state.setUnitsCalls).toBe(calls);
    expect(Array.from(engine.state.paths.get(7)?.points ?? [])).toEqual([267, 20, 269, 20]);
    merger.clearNeighbour(9);
    expect(engine.ids()).toEqual([1]);
  });

  it("엔진 상한을 넘는 옆 유닛은 넣지 않는다", () => {
    const { engine, merger, main } = setup({ capacity: 2 });
    main.setUnits([spawn(1, 5, 5)]);
    merger.neighbourSink(9, EAST).setUnits([spawn(7, 1, 1), spawn(8, 2, 2)]);
    expect(engine.ids()).toEqual([1, 7]);
  });
});

describe("이어 보이기(카메라가 따라가는 유닛)", () => {
  it("지금 2차맵에서 사라지면 알리고, 넘는 중이면 걷던 쪽으로 계속 걷는 남은 그림을 둔다", () => {
    const { engine, main, gone } = setup({ carry: 1 });
    main.setUnits([spawn(1, 250, 100), spawn(2, 9, 9)]);
    main.setUnitPath(1, walk([250, 100, 255.5, 100], 0, 1));
    engine.state.now = 5_500;
    // 서버가 옆 2차맵으로 넘겼다: 목록에서 빠진다
    main.setUnits([spawn(2, 9, 9)]);
    expect(gone).toEqual([{ id: 1, last: { x: 255.5, y: 100 } }]);
    expect(engine.ids()).toEqual([2, 1]);
    const ghost = engine.state.paths.get(1);
    expect(Array.from(ghost?.points ?? [])).toEqual([255.5, 100, 255.5 + GHOST_CELLS, 100]);
    expect(ghost?.speedCellsPerSec).toBe(1);
  });

  it("넘는 것이 아니면(변에서 멀다) 남은 그림을 두지 않는다", () => {
    const { engine, main } = setup({ carry: 1, crossing: false });
    main.setUnits([spawn(1, 100, 100)]);
    main.setUnitPath(1, walk([100, 100, 110, 100]));
    main.setUnits([]);
    expect(engine.ids()).toEqual([]);
  });

  it("남은 그림은 옆 2차맵 목록에 나타나면 사라지고, 새 경로는 보이던 자리에서 잇는다", () => {
    const { engine, merger, main } = setup({ carry: 1 });
    main.setUnits([spawn(1, 250, 100)]);
    main.setUnitPath(1, walk([250, 100, 255.5, 100], 0, 1));
    engine.state.now = 5_500;
    main.setUnits([]);
    engine.state.now = 5_700;
    // 옆 2차맵 첫 칸(그 틀 0.5 = 지금 틀 256.5)에 서 있다: 보이던 자리(255.7)에서 걸어간다
    const east = merger.neighbourSink(9, EAST);
    east.setUnits([spawn(1, 0.5, 100)]);
    east.setUnitPath(1, walk([0.5, 100], 5_600, 1));
    expect(engine.ids()).toEqual([1]);
    const path = engine.state.paths.get(1);
    const points = Array.from(path?.points ?? []);
    expect(points[0]).toBeCloseTo(255.7, 6);
    expect(points.slice(1)).toEqual([100, 256.5, 100]);
    expect(path?.departAtMs).toBe(5_700);
  });

  it("넘어온 뒤(carryIn): 새 자료가 오기 전에는 남은 그림, 오면 그 자리에서 잇고, 시간이 지나면 잇지 않는다", () => {
    const { engine, merger, main } = setup({ carry: 1 });
    engine.state.now = 1_000;
    merger.carryIn({ id: 1, look: LOOK, at: { x: -0.4, y: 100 }, heading: { x: 1, y: 0 }, speed: 1 });
    expect(engine.ids()).toEqual([1]);
    engine.state.now = 1_200;
    // 새 2차맵 자료: 첫 칸에 서 있다
    main.setUnits([spawn(1, 0.5, 100), spawn(3, 50, 50)]);
    main.setUnitPath(1, walk([0.5, 100], 1_100, 1));
    main.setUnitPath(3, walk([50, 50]));
    expect(engine.ids()).toEqual([1, 3]);
    const first = Array.from(engine.state.paths.get(1)?.points ?? []);
    expect(first[0]).toBeCloseTo(-0.2, 6);
    expect(first.slice(1)).toEqual([100, 0.5, 100]);
    // 곧 온 다음 경로도 보이던 자리에서 잇는다
    engine.state.now = 1_300;
    main.setUnitPath(1, walk([0.5, 100, 20.5, 100], 1_300, 1));
    const second = Array.from(engine.state.paths.get(1)?.points ?? []);
    expect(second[0]).toBeCloseTo(-0.1, 6);
    expect(second.slice(1)).toEqual([100, 0.5, 100, 20.5, 100]);
    // 잇는 시간이 지나면 받은 그대로
    engine.state.now = 1_000 + BLEND_WINDOW_MS + 1;
    main.setUnitPath(1, walk([30, 100, 40, 100], engine.state.now, 1));
    expect(Array.from(engine.state.paths.get(1)?.points ?? [])).toEqual([30, 100, 40, 100]);
  });

  it("남은 그림은 GHOST_MS 뒤에 사라진다", () => {
    vi.useFakeTimers();
    try {
      const { engine, merger, main } = setup({ carry: 1 });
      main.setUnits([]);
      merger.carryIn({ id: 1, look: LOOK, at: { x: 3, y: 3 }, heading: null, speed: 0 });
      expect(engine.ids()).toEqual([1]);
      engine.state.now = GHOST_MS + 100;
      vi.advanceTimersByTime(GHOST_MS + 100);
      expect(engine.ids()).toEqual([]);
      merger.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dropGhost: 넘는 것이 아니었으면 남은 그림을 바로 거둔다", () => {
    const { engine, merger, main } = setup({ carry: 1 });
    main.setUnits([spawn(1, 250, 100)]);
    main.setUnitPath(1, walk([250, 100, 255.5, 100], 0, 1));
    engine.state.now = 5_500;
    main.setUnits([]);
    expect(engine.ids()).toEqual([1]);
    merger.dropGhost();
    expect(engine.ids()).toEqual([]);
    merger.stop();
  });

  it("carryOut: 보이던 자리·걷던 쪽·속도", () => {
    const { engine, merger, main } = setup({ carry: 1 });
    expect(merger.carryOut()).toBeNull();
    main.setUnits([spawn(1, 250, 100)]);
    main.setUnitPath(1, walk([250, 100, 250, 110], 0, 2));
    engine.state.now = 1_000;
    expect(merger.carryOut()).toEqual({
      id: 1,
      look: LOOK,
      at: { x: 250, y: 102 },
      heading: { x: 0, y: 1 },
      speed: 2,
    });
  });
});
