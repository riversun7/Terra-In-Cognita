// 바다 건너기 시험(기획 D-541 1283 나, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)") — 배가 2차맵 사이 이동으로 물 변을 지나 옆 2차맵 바다로
// 넘어가고(승객도 함께, 다시 태운 채), 승객에게 보낸 길은 그 배의 길이며, 띄우지 않은 2차맵은 건너뛰지 않고, 물이 끊긴 변은 넘지 않는다.
// 먼 바다(기획 D-553 1329 "먼바다로 순간이동하는기능은 없다"): 띄우지 않은 바다 2차맵은 닿을 때 띄우고 실제로 항해한다(사라졌다 나타나지 않는다).
import { performance } from "node:perf_hooks";
import { START_BOATS, SURFACE_WATER, type TempTerrain, arrivalAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import { type SecondMap, type UnitRow, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { createTravelService } from "./service.ts";

const START = 1_798_000_000_000;
const OWNER = 7;
const USER = "user-a";
const K = [testMapKey(0), testMapKey(1), testMapKey(2)];

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => vi.useRealTimers());

/** 지형 칸 x ≥ fromX가 바다 */
function seaFrom(fromX: number): TempTerrain {
  const terrain = flatTerrain();
  for (let ty = 0; ty < 128; ty++)
    for (let tx = fromX; tx < 128; tx++) terrain.surface[ty * 128 + tx] = SURFACE_WATER;
  return terrain;
}

/** K[i] 지형(seas[i] = 바다가 시작하는 지형 칸 x, 128이면 바다 없음)과 이동 서비스 */
function rig(seas: readonly number[], loaded: readonly number[] = [0, 1, 2]) {
  const maps = new Map<number, SecondMap>();
  const rows: UnitRow[] = [];
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const make = (index: number, mapKey: number): SecondMap =>
    createSecondMap({
      mapKey,
      terrain: mapTerrainFromTemp(mapKey, seaFrom(seas[index] ?? 128)),
      paths,
      now: () => Date.now(),
      stats: emptyWorldStats(),
      log: silentLog,
      persist: { saveUnit: (row) => rows.push(row), saveBuilding: () => {}, removeBuilding: () => {} },
    });
  for (const [index, mapKey] of K.entries()) {
    if (!loaded.includes(index)) continue;
    maps.set(mapKey, make(index, mapKey));
  }
  paths.start();
  /** 그때 띄우기(가짜 — 닿을 때 그 2차맵을 만든다) */
  const opened: number[] = [];
  const spawn = {
    canOpen: (mapKey: number) => K.includes(mapKey) && !maps.has(mapKey),
    hasRoom: () => true,
    open: (mapKey: number) => {
      const index = K.indexOf(mapKey);
      const built = make(index, mapKey);
      maps.set(mapKey, built);
      paths.add(built.replicaInit());
      opened.push(mapKey);
      return Promise.resolve("ok" as const);
    },
    prefetch: () => {},
  };
  const travel = createTravelService({
    maps,
    planetId: "s2_test_planet",
    now: () => Date.now(),
    log: silentLog,
    ownerOf: (userId) => (userId === USER ? OWNER : undefined),
    ready: () => true,
  });
  const map = (index: number): SecondMap => {
    const found = maps.get(K[index] ?? 0);
    if (!found) throw new Error("no map");
    return found;
  };
  const whereIs = (unitId: number): number =>
    K.findIndex((key) => maps.get(key)?.unitInfo(unitId) !== undefined);
  return { maps, rows, travel, map, whereIs, spawn, opened };
}

describe("바다 건너기", () => {
  it("배가 물 변을 지나 옆 2차맵 바다로 넘어가고, 승객은 배에 탄 채 함께 넘는다", async () => {
    // K[0]: 지형 x ≥ 64(배치 128~)가 바다, K[1]: 온통 바다
    const r = rig([64, 0, 0]);
    expect(
      r.map(0).addBoat({ id: 1, ownerId: OWNER, speed: START_BOATS.speed, cellX: 200, cellY: 100 }),
    ).toBe(true);
    r.map(0).addUnit({
      id: 2,
      size: 1,
      speed: 437,
      cellX: 126,
      cellY: 100,
      ownerId: OWNER,
      kind: UNIT_KIND_HUMAN,
    });
    r.map(0).addBoat({ id: 3, ownerId: OWNER, speed: START_BOATS.speed, cellX: 129, cellY: 100 });
    expect(r.map(0).board(2, 3)).toBe(true);
    // 승객에게 보낸 길 = 그 배의 길
    const plan = r.travel.plan(USER, { unitId: 2, mapKey: K[1] ?? 0, x: 60, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { unitId: 3, route: [K[0], K[1]] } });
    expect(
      await r.travel.start(USER, { unitId: 2, mapKey: K[1] ?? 0, x: 60, y: 100, kind: "move" }),
    ).toMatchObject({
      ok: true,
      maps: 2,
    });
    const first = r.map(0).unitInfo(3);
    if (!first) throw new Error("no boat");
    await vi.advanceTimersByTimeAsync(arrivalAt(first.motion) - Date.now() + 1);
    expect(r.whereIs(3)).toBe(1);
    expect(r.whereIs(2)).toBe(1);
    expect(r.map(1).unitInfo(2)?.aboard).toBe(3);
    expect(r.map(1).unitInfo(3)?.domain).toBe("sea");
    // 저장 줄: 배와 승객 모두 새 2차맵 키, 승객은 배에 탄 채
    expect(r.rows.findLast((row) => row.id === 3)).toMatchObject({ mapKey: K[1], domain: "sea" });
    expect(r.rows.findLast((row) => row.id === 2)).toMatchObject({ mapKey: K[1], aboardId: 3 });
    // 마지막 2차맵 목표까지 간다(승객은 배를 따라간다)
    await vi.advanceTimersByTimeAsync(120_000);
    expect(r.travel.list(USER)).toMatchObject([{ unitId: 3, state: "arrived" }]);
    expect(r.map(1).unitInfo(2)?.motion).toBe(r.map(1).unitInfo(3)?.motion);
    // 승객 혼자서는 2차맵을 넘지 않는다
    expect(r.map(1).transferOut(2)).toBeUndefined();
    r.travel.stop();
  });

  it("물이 끊긴 변은 넘지 않고, 띄우지 않은 2차맵은 건너뛰지 않는다", async () => {
    // K[1]은 땅뿐 → 넘는 자리가 없다
    const dry = rig([64, 128, 0]);
    dry.map(0).addBoat({ id: 1, ownerId: OWNER, speed: START_BOATS.speed, cellX: 200, cellY: 100 });
    expect(dry.travel.plan(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 60, y: 100 })).toEqual({
      ok: false,
      problem: "border_blocked",
    });
    dry.travel.stop();
    // K[1]을 띄우지 않았다 → K[2]로 가는 배는 길이 없다(건너뛰지 않는다)
    const gap = rig([64, 0, 0], [0, 2]);
    gap.map(0).addBoat({ id: 1, ownerId: OWNER, speed: START_BOATS.speed, cellX: 200, cellY: 100 });
    expect(gap.travel.plan(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 60, y: 100 })).toEqual({
      ok: false,
      problem: "no_route",
    });
    gap.travel.stop();
  });

  it("행성 값이 바다인 띄우지 않은 2차맵은 닿을 때 띄우고 항해한다(D-553 1329, 건너뛰지 않음) — 승객도 함께, 땅이면 no_route", async () => {
    const gap = rig([64, 0, 0], [0, 2]);
    gap.travel.attachSpawn(gap.spawn);
    gap.map(0).addBoat({ id: 1, ownerId: OWNER, speed: START_BOATS.speed, cellX: 240, cellY: 100 });
    gap
      .map(0)
      .addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 100, ownerId: OWNER, kind: UNIT_KIND_HUMAN });
    gap.map(0).addBoat({ id: 3, ownerId: OWNER, speed: START_BOATS.speed, cellX: 129, cellY: 100 });
    expect(gap.map(0).board(2, 3)).toBe(true);
    // 땅으로 본다(바다 아님) → 길이 없다
    gap.travel.attachSea((key) => key !== K[1]);
    expect(gap.travel.plan(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 60, y: 100 })).toEqual({
      ok: false,
      problem: "no_route",
    });
    gap.travel.attachSea((key) => key === K[1]);
    const plan = gap.travel.plan(USER, { unitId: 2, mapKey: K[2] ?? 0, x: 60, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { unitId: 3, route: [K[0], K[1], K[2]] } });
    expect(
      await gap.travel.start(USER, { unitId: 2, mapKey: K[2] ?? 0, x: 60, y: 100, kind: "move" }),
    ).toMatchObject({ ok: true, maps: 3 });
    const first = gap.map(0).unitInfo(3);
    if (!first) throw new Error("no boat");
    // 변 끝에 닿으면 사라지지 않고 K[1]을 띄워 넘어간다(배와 승객 모두)
    await vi.advanceTimersByTimeAsync(arrivalAt(first.motion) - Date.now() + 1);
    expect(gap.opened).toEqual([K[1]]);
    expect(gap.travel.hiddenAt(3)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(gap.whereIs(3)).toBe(1);
    expect(gap.map(1).unitInfo(2)?.aboard).toBe(3);
    // K[1]을 실제로 항해해 K[2]로 넘어가 도착한다
    await vi.advanceTimersByTimeAsync(600_000);
    expect(gap.whereIs(3)).toBe(2);
    expect(gap.map(2).unitInfo(2)?.aboard).toBe(3);
    expect(gap.travel.list(USER)).toMatchObject([{ unitId: 3, state: "arrived" }]);
    gap.travel.stop();
  });
});
