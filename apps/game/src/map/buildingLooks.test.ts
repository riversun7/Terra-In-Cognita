import type { BuildingFootprint } from "@terra/engine";
import type { MapLooksResponse } from "@terra/shared/mapLooks";
import type { WorldMapFaction } from "@terra/shared/worldMap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOOKS_POLL_MS,
  LOOKS_SETTLE_MS,
  accentOf,
  idsKey,
  startBuildingLooks,
  withLooks,
} from "./buildingLooks.ts";
import type { FeedSink } from "./feedTypes.ts";

const faction = (id: number): WorldMapFaction => ({ id, code: null, kind: "npc", name: null });
const building = (id: number): BuildingFootprint => ({
  id,
  cellX: id * 4,
  cellY: 0,
  width: 3,
  depth: 3,
  rotation: 0,
  heightM: 6,
});

const response = (rows: MapLooksResponse["buildings"]): MapLooksResponse => ({
  status: "ok",
  mapKey: 1,
  buildings: rows,
  generatedAt: 0,
});

function fakeEngine(): FeedSink & { sets: BuildingFootprint[][] } {
  const sets: BuildingFootprint[][] = [];
  return {
    sets,
    setTerrain: () => Promise.resolve(),
    setUnits: () => undefined,
    setUnitPath: () => undefined,
    setBuildings: (list) => {
      sets.push([...list]);
    },
    setExplored: () => undefined,
    select: () => undefined,
    selected: () => null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("건물 겉모습 잇기", () => {
  it("국가 색 번호는 world.cities 국가 차례(0~5), 없는 국가는 세력 ID로 돌려 쓰고, 국가 없음은 null", () => {
    const factions = [faction(40), faction(7), faction(9)];
    expect(accentOf(factions, 7)).toBe(1);
    expect(accentOf(factions, 40)).toBe(0);
    expect(accentOf(factions, 13)).toBe(1);
    expect(accentOf(factions, null)).toBeNull();
  });

  it("겉모습을 아는 건물에만 붙이고, ID 묶음 표지는 차례와 상관없다", () => {
    const merged = withLooks([building(1), building(2)], new Map([[2, { facility: "farm", level: 1 }]]));
    expect(merged[0]?.look).toBeUndefined();
    expect(merged[1]?.look).toEqual({ facility: "farm", level: 1 });
    expect(idsKey([building(3), building(1)])).toBe(idsKey([building(1), building(3)]));
  });

  it("건물 목록이 오면 그대로 넘기고, 조금 뒤 겉모습을 물어 다시 넘긴다. 같은 답이면 다시 넘기지 않는다", async () => {
    const engine = fakeEngine();
    const load = vi.fn(() =>
      Promise.resolve(
        response([
          { buildingId: 2, facilityId: "mine", level: 0, state: "building", upgrading: false, factionId: 9 },
        ]),
      ),
    );
    const looks = startBuildingLooks(engine, 1, {
      load,
      loadFactions: () => Promise.resolve([faction(40), faction(9)]),
    });
    // 국가 차례를 받은 뒤 한 번 묻는다(아직 건물이 없어도)
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    looks.sink.setBuildings([building(1), building(2)]);
    expect(engine.sets.at(-1)?.map((b) => b.look)).toEqual([
      undefined,
      expect.objectContaining({ facility: "mine" }),
    ]);
    await vi.advanceTimersByTimeAsync(LOOKS_SETTLE_MS);
    expect(load).toHaveBeenCalledTimes(2);
    expect(engine.sets.at(-1)?.[1]?.look).toEqual({
      facility: "mine",
      level: 0,
      state: "building",
      upgrading: false,
      accent: 1,
    });
    const count = engine.sets.length;
    await vi.advanceTimersByTimeAsync(LOOKS_POLL_MS);
    expect(load).toHaveBeenCalledTimes(3);
    expect(engine.sets.length).toBe(count);
    looks.stop();
    await vi.advanceTimersByTimeAsync(LOOKS_POLL_MS * 2);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("답이 실패해도 건물은 그대로 넘긴다(일반 집)", async () => {
    const engine = fakeEngine();
    const looks = startBuildingLooks(engine, 1, {
      load: () => Promise.reject(new Error("offline")),
      loadFactions: () => Promise.reject(new Error("offline")),
    });
    looks.sink.setBuildings([building(5)]);
    await vi.advanceTimersByTimeAsync(LOOKS_SETTLE_MS);
    expect(engine.sets.at(-1)).toEqual([building(5)]);
    looks.stop();
  });
});
