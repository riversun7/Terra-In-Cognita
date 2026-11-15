// 옆 2차맵을 그때 띄우기 시험(DB 없음, docs/adr/2026-11-07-play-flow.md "WP15", 기획 답 730 다) — 띄우기(지형 → 행 놓기 → 목록·경로 사본),
// 같은 2차맵을 함께 띄우면 한 번, 상한(빈 것을 내리고 띄움·빈 것이 없으면 full), 비어 있은 지 오래면 내리기(유닛·건물·구독·붙잡음이 있으면
// 내리지 않음), 부팅이 함께 띄울 2차맵 고르기(건물만). 좌표 유닛(docs/adr/2026-11-15-unloaded-second-maps.md): 쉬는 유닛만 있으면 내리며 좌표 유닛으로
// 옮기고(park), 쉬지 않는 유닛이 있으면 내리지 않는다, 보는 사람이 띄우면 mapViewOpens.
import { performance } from "node:perf_hooks";
import { WALK_SPEED, anchorCenter } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { MapFactory } from "./mapFactory.ts";
import {
  type MapSpawnDeps,
  type MapSpawnRules,
  bootExtraMaps,
  createMapSpawner,
  sameLevelAs,
} from "./mapSpawn.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { createInlinePathService } from "./pathService.ts";
import { type BuildingRow, type SecondMap, type UnitRow, createSecondMap } from "./secondMap.ts";
import { flatTerrain, silentLog } from "./testSupport.ts";
import { UNIT_KIND_HUMAN } from "./unitKinds.ts";
import { testMapKey } from "./world.ts";
import { emptyWorldStats } from "./worldStats.ts";

const SEED = testMapKey(0);
const A = testMapKey(1);
const B = testMapKey(2);
const C = testMapKey(3);

interface Rig {
  maps: Map<number, SecondMap>;
  spawner: ReturnType<typeof createMapSpawner>;
  rules: { maxLoaded: number; idleMs: number };
  held: Set<number>;
  builds: number[];
  rows: Map<number, { units: UnitRow[]; buildings: BuildingRow[] }>;
  paths: ReturnType<typeof createInlinePathService>;
  clock: { now: number };
}

function rig(
  rules: MapSpawnRules = { maxLoaded: 2, idleMs: 10 * 60_000 },
  extra: Pick<MapSpawnDeps, "parkable" | "park"> = {},
): Rig {
  const maps = new Map<number, SecondMap>();
  const clock = { now: 1_800_000_000_000 };
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const make = (mapKey: number) =>
    createSecondMap({
      mapKey,
      terrain: mapTerrainFromTemp(mapKey, flatTerrain()),
      paths,
      now: () => clock.now,
      stats: emptyWorldStats(),
      log: silentLog,
    });
  maps.set(SEED, make(SEED));
  paths.start();
  const builds: number[] = [];
  const factory: MapFactory = {
    attach: () => {},
    createMaps: async () => {},
    build: async (mapKey) => {
      builds.push(mapKey);
      await Promise.resolve();
      return { map: make(mapKey), source: "temp" };
    },
    prefetchAround: () => {},
    prefetch: () => {},
  };
  const held = new Set<number>();
  const rows = new Map<number, { units: UnitRow[]; buildings: BuildingRow[] }>();
  const live = { ...rules };
  const spawner = createMapSpawner({
    maps,
    factory,
    paths,
    isMapKey: sameLevelAs(SEED),
    rows: async (mapKey) => rows.get(mapKey) ?? { units: [], buildings: [] },
    holds: (mapKey) => held.has(mapKey),
    rules: () => live,
    now: () => clock.now,
    log: silentLog,
    ...extra,
  });
  return { maps, spawner, rules: live, held, builds, rows, paths, clock };
}

const standingRow = (id: number, mapKey: number, ownerId = 7): UnitRow => {
  const at = anchorCenter(100, 100, 1);
  return {
    id,
    ownerId,
    kind: UNIT_KIND_HUMAN,
    size: 1,
    speed: WALK_SPEED,
    mapKey,
    planetId: "s2_test_planet",
    domain: "land",
    path: [at.x, at.y],
    departAtMs: 0,
    wakeAtMs: null,
    aiStep: 0,
    job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
    condition: { injury: 0, injuryUntilMs: null, heldBy: null },
  };
};

describe("그때 띄우기(WP15)", () => {
  it("띄우면 목록·경로 사본에 들고 DB에 남아 있던 행을 놓는다, 함께 부르면 한 번만 만든다", async () => {
    const r = rig();
    r.rows.set(A, { units: [standingRow(41, A)], buildings: [] });
    expect(r.spawner.canOpen(A)).toBe(true);
    expect(r.spawner.canOpen(SEED)).toBe(false);
    expect(r.spawner.canOpen(-5)).toBe(false);
    const [first, second] = await Promise.all([r.spawner.open(A), r.spawner.open(A)]);
    expect([first, second]).toEqual(["ok", "ok"]);
    expect(r.builds).toEqual([A]);
    expect(r.maps.has(A)).toBe(true);
    expect(r.spawner.onDemand.has(A)).toBe(true);
    expect(r.maps.get(A)?.unitInfo(41)?.ownerId).toBe(7);
    // 경로 사본이 있어 그 2차맵 안 이동 명령이 풀린다
    const moved = await r.maps.get(A)?.moveUnit(41, anchorCenter(140, 100, 1));
    expect(moved).toEqual({ ok: true });
    expect(await r.spawner.open(A)).toBe("ok");
    expect(r.builds).toEqual([A]);
    expect(r.spawner.takeMetrics()).toMatchObject({ mapsOnDemand: 1, mapOpens: 1, mapCloses: 0 });
  });

  it("비어 있은 지 idle 넘게 지나면 내린다 — 유닛·붙잡음(도시·이동)·구독이 있으면 내리지 않는다", async () => {
    const r = rig();
    await r.spawner.open(A);
    await r.spawner.open(B);
    r.held.add(B);
    r.maps.get(A)?.addUnit({ id: 5, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10, ownerId: 7 });
    r.clock.now += 11 * 60_000;
    expect(r.spawner.sweep()).toBe(0);
    expect(r.maps.has(A) && r.maps.has(B)).toBe(true);
    // 유닛이 떠나고 붙잡음이 풀린다 → 그때부터 idle을 센다(살필 때 처음 본 빔)
    r.maps.get(A)?.transferOut(5);
    r.held.delete(B);
    expect(r.spawner.sweep()).toBe(0);
    r.clock.now += 9 * 60_000;
    expect(r.spawner.sweep()).toBe(0);
    r.clock.now += 60_000;
    expect(r.spawner.sweep()).toBe(2);
    expect(r.maps.has(A) || r.maps.has(B)).toBe(false);
    expect(r.spawner.onDemand.size).toBe(0);
    // 내린 2차맵의 경로 사본도 버렸다
    const gone = await r.paths.request({
      mapKey: A,
      from: anchorCenter(10, 10, 1),
      to: anchorCenter(20, 10, 1),
      size: 1,
      nodeBudget: 1000,
      priority: "command",
      isCurrent: () => true,
    });
    expect(gone.status).toBe("unknown_map");
    // 씨앗 2차맵은 내리지 않는다
    expect(r.maps.has(SEED)).toBe(true);
    // 다시 띄울 수 있다
    expect(await r.spawner.open(A)).toBe("ok");
  });

  it("상한이면 가장 오래 빈 그때 띄운 2차맵을 내리고 띄운다, 빈 것이 없으면 full", async () => {
    const r = rig({ maxLoaded: 2, idleMs: 60 * 60_000 });
    await r.spawner.open(A);
    r.clock.now += 1_000;
    await r.spawner.open(B);
    expect(r.spawner.hasRoom()).toBe(true);
    expect(await r.spawner.open(C)).toBe("ok");
    expect([...r.spawner.onDemand].toSorted((x, y) => x - y)).toEqual([B, C].toSorted((x, y) => x - y));
    expect(r.maps.has(A)).toBe(false);
    // 둘 다 붙잡히면 자리가 없다
    r.held.add(B);
    r.held.add(C);
    expect(r.spawner.hasRoom()).toBe(false);
    expect(await r.spawner.open(A)).toBe("full");
    expect(r.maps.has(A)).toBe(false);
    expect(r.spawner.takeMetrics()).toMatchObject({ mapOpenRefused: 1 });
    // 상한을 올리면(설정 칸 실효 값) 다시 띄운다
    r.rules.maxLoaded = 3;
    expect(await r.spawner.open(A)).toBe("ok");
  });

  it("건물이 선 2차맵은 비어도 내리지 않는다, 부팅이 함께 띄운 2차맵도 그때 띄운 것으로 센다", async () => {
    const r = rig({ maxLoaded: 4, idleMs: 0 });
    r.rows.set(A, {
      units: [],
      buildings: [
        {
          id: 3,
          mapKey: A,
          planetId: "s2_test_planet",
          domain: "land",
          ownerId: 7,
          placement: { x: 40, y: 40, width: 2, height: 2, rotation: 0 },
        },
      ],
    });
    await r.spawner.open(A);
    r.spawner.sweep();
    r.spawner.sweep();
    expect(r.maps.has(A)).toBe(true);
    // 부팅이 함께 띄운 2차맵(여기서는 씨앗 자리를 빌려 본다)
    r.spawner.adopt([SEED]);
    expect(r.spawner.onDemand.has(SEED)).toBe(true);
    r.spawner.sweep();
    expect(r.maps.has(SEED)).toBe(false);
  });

  it("부팅이 함께 띄울 2차맵 = 건물이 선 이 행성의 2차맵(씨앗 빼고, 키 차례). 유닛만 선 2차맵은 띄우지 않는다(좌표 유닛)", () => {
    const planetId = "s2_test_planet";
    const extra = bootExtraMaps(
      {
        buildings: [
          { mapKey: C, planetId },
          { mapKey: A, planetId },
          { mapKey: SEED, planetId },
          { mapKey: B, planetId: "other_planet" },
          { mapKey: 12345, planetId },
        ],
      },
      [SEED],
      planetId,
      sameLevelAs(SEED),
    );
    expect(extra).toEqual([A, C].toSorted((x, y) => x - y));
  });

  it("쉬는 유닛만 있으면 한가한 2차맵으로 보고 내리며 좌표 유닛으로 옮긴다(park). 쉬지 않으면 그대로", async () => {
    const parked: number[] = [];
    const resting = { value: false };
    const r = rig(
      { maxLoaded: 2, idleMs: 60_000 },
      {
        parkable: () => resting.value,
        park: (map) => {
          let moved = 0;
          map.forEachUnit(() => {
            moved += 1;
          });
          parked.push(map.mapKey);
          return moved;
        },
      },
    );
    r.rows.set(A, { units: [standingRow(41, A)], buildings: [] });
    expect(await r.spawner.open(A, "view")).toBe("ok");
    r.spawner.sweep();
    r.clock.now += 120_000;
    r.spawner.sweep();
    expect(r.maps.has(A)).toBe(true);
    resting.value = true;
    r.spawner.sweep();
    r.clock.now += 120_000;
    expect(r.spawner.sweep()).toBe(1);
    expect(r.maps.has(A)).toBe(false);
    expect(parked).toEqual([A]);
    expect(r.spawner.takeMetrics()).toMatchObject({ mapOpens: 1, mapCloses: 1, mapViewOpens: 1 });
  });
});
