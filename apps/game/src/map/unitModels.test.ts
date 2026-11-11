import type { UnitModel, UnitRing, UnitSpawn } from "@terra/engine";
import { DEFAULT_CHARACTER_LOOK, characterLookForUnit } from "@terra/shared/characterLook";
import type { MapUnitLooksResponse } from "@terra/shared/mapUnits";
import type { WorldMapFaction } from "@terra/shared/worldMap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedSink } from "./feedTypes.ts";
import {
  UNIT_LOOKS_POLL_MS,
  UNIT_LOOKS_SETTLE_MS,
  isWalker,
  startUnitModels,
  unitModelsOf,
  unitRingsOf,
  wantsUnitModels,
} from "./unitModels.ts";

const walker = (id: number): UnitSpawn => ({
  id,
  look: { heightM: 1.8, radiusM: 0.3, color: 0xffffff },
  x: id,
  y: 0,
});
const vehicle = (id: number): UnitSpawn => ({
  id,
  look: { heightM: 1.44, radiusM: 0.75, color: 0xffffff },
  x: id,
  y: 0,
});
const giant = (id: number): UnitSpawn => ({
  id,
  look: { heightM: 6, radiusM: 1.6, color: 0xffffff },
  x: id,
  y: 0,
});

const response = (units: MapUnitLooksResponse["units"]): MapUnitLooksResponse => ({
  status: "ready",
  mapKey: 1,
  units,
  generatedAt: 0,
});

function fakeEngine() {
  const calls: string[] = [];
  const models: UnitModel[][] = [];
  const rings: UnitRing[][] = [];
  const engine: FeedSink & {
    setUnitModels(list: readonly UnitModel[]): void;
    setUnitRings(list: readonly UnitRing[]): void;
  } = {
    setTerrain: () => Promise.resolve(),
    setUnits: (list) => {
      calls.push(`units:${list.length}`);
    },
    setUnitPath: () => undefined,
    setBuildings: () => undefined,
    setExplored: () => undefined,
    select: () => undefined,
    selected: () => null,
    setUnitModels: (list) => {
      calls.push(`models:${list.length}`);
      models.push([...list]);
    },
    setUnitRings: (list) => {
      calls.push(`rings:${list.length}`);
      rings.push([...list]);
    },
  };
  return { engine, calls, models, rings };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("2차맵 유닛 외형 잇기", () => {
  it("걷는 사람 크기 유닛만 모델이 된다(탈것·큰 유닛은 캡슐 그대로)", () => {
    expect(isWalker(walker(1))).toBe(true);
    expect(isWalker(vehicle(2))).toBe(false);
    expect(isWalker(giant(3))).toBe(false);
    const known = new Map([[1, DEFAULT_CHARACTER_LOOK]]);
    const list = unitModelsOf([walker(1), vehicle(2), giant(3), walker(4)], known, (id) =>
      characterLookForUnit(id, "commoner"),
    );
    expect(list).toEqual([
      { id: 1, look: DEFAULT_CHARACTER_LOOK },
      { id: 4, look: characterLookForUnit(4, "commoner") },
    ]);
  });

  it("유닛 목록이 오면 기본 외형을 먼저 넣고(유닛보다 앞), 서버 답이 오면 그 외형으로 바꾼다", async () => {
    const { engine, calls, models } = fakeEngine();
    const load = vi.fn(() =>
      Promise.resolve(response([{ unitId: 7, kind: "cyborg_body", look: DEFAULT_CHARACTER_LOOK }])),
    );
    const link = startUnitModels(engine, 1, { load });
    link.sink.setUnits([walker(7), walker(8)]);
    expect(calls).toEqual(["models:2", "units:2"]);
    expect(models[0]?.[0]?.look).toEqual(characterLookForUnit(7, "commoner"));
    await vi.advanceTimersByTimeAsync(0);
    // 처음 물은 답이 왔다: 유닛 7은 서버가 준 외형, 8은 기본 외형
    expect(load).toHaveBeenCalledTimes(1);
    expect(models.at(-1)).toEqual([
      { id: 7, look: DEFAULT_CHARACTER_LOOK },
      { id: 8, look: characterLookForUnit(8, "commoner") },
    ]);
    link.stop();
  });

  it("유닛 ID 묶음이 바뀌면 조금 뒤 다시 묻고, 같으면 묻지 않는다. 그 밖에는 60초마다", async () => {
    const { engine } = fakeEngine();
    const load = vi.fn(() => Promise.resolve(response([])));
    const link = startUnitModels(engine, 1, { load });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    link.sink.setUnits([walker(1)]);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_SETTLE_MS);
    expect(load).toHaveBeenCalledTimes(2);
    // 같은 묶음(차례만 다름·탈것이 늘어남)은 묻지 않는다
    link.sink.setUnits([walker(1), vehicle(9)]);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_SETTLE_MS);
    expect(load).toHaveBeenCalledTimes(2);
    link.sink.setUnits([walker(1), walker(2)]);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_SETTLE_MS);
    expect(load).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_POLL_MS);
    expect(load).toHaveBeenCalledTimes(4);
    link.stop();
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_POLL_MS * 2);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("맞지 않는 외형·실패한 답은 버린다(기본 외형으로 그린다)", async () => {
    const { engine, models } = fakeEngine();
    const bad = { ...DEFAULT_CHARACTER_LOOK, head: "tophat" };
    const load = vi
      .fn<(mapKey: number, signal: AbortSignal) => Promise<MapUnitLooksResponse>>()
      // @ts-expect-error 목록 밖 머리 모양(서버가 틀린 값을 줬을 때)
      .mockResolvedValueOnce(response([{ unitId: 1, kind: "cyborg_body", look: bad }]))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ status: "not_ready", mapKey: 1, units: [], generatedAt: 0 });
    const link = startUnitModels(engine, 1, { load });
    link.sink.setUnits([walker(1)]);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_SETTLE_MS);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_POLL_MS);
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(3);
    for (const list of models) expect(list).toEqual([{ id: 1, look: characterLookForUnit(1, "commoner") }]);
    link.stop();
  });

  it("[시험용] ?unit-models=0이면 외형을 넘기지 않는다(유닛 목록·나라 색 고리만 지나간다)", async () => {
    expect(wantsUnitModels("")).toBe(true);
    expect(wantsUnitModels("?unit-models=1")).toBe(true);
    expect(wantsUnitModels("?pixel-ratio=2&unit-models=0")).toBe(false);
    const { engine, calls } = fakeEngine();
    const load = vi.fn(() => Promise.resolve(response([])));
    const link = startUnitModels(engine, 1, { load, enabled: false });
    link.sink.setUnits([walker(1)]);
    await vi.advanceTimersByTimeAsync(UNIT_LOOKS_POLL_MS);
    expect(calls.filter((call) => call.startsWith("models"))).toEqual([]);
    expect(calls).toContain("units:1");
    expect(calls).toContain("rings:0");
    link.stop();
  });

  it("나라 색 고리(질문 963 나): 나라마다 유닛을 건물과 같은 국가 색 번호로 넘긴다. 국가 차례를 받으면 다시 칠한다", async () => {
    const factions: readonly WorldMapFaction[] = [
      { id: 4, code: "a", kind: "npc", name: null },
      { id: 2, code: "b", kind: "npc", name: null },
    ];
    // 국가 차례 안의 나라 = 차례 번호, 밖의 나라 = 세력 ID로 돌려 쓴다(buildingLooks.ts accentOf와 같다)
    expect(
      unitRingsOf(
        [
          { factionId: 2, unitIds: [5, 6] },
          { factionId: 9, unitIds: [7] },
        ],
        factions,
      ),
    ).toEqual([
      { id: 5, accent: 1 },
      { id: 6, accent: 1 },
      { id: 7, accent: 3 },
    ]);
    const { engine, rings } = fakeEngine();
    const load = vi.fn(() => Promise.resolve({ ...response([]), nations: [{ factionId: 2, unitIds: [5] }] }));
    const link = startUnitModels(engine, 1, { load });
    await vi.advanceTimersByTimeAsync(0);
    // 국가 차례를 모르면 세력 ID로 돌려 쓴다
    expect(rings.at(-1)).toEqual([{ id: 5, accent: 2 }]);
    link.setFactions(factions);
    expect(rings.at(-1)).toEqual([{ id: 5, accent: 1 }]);
    link.stop();
  });
});
