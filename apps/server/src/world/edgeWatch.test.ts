// 옆 2차맵 미리 띄우기·경계 너머 시야 시험(DB 없음, docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)") — 변 가까이 가는 플레이어
// 유닛이면 넘기 전에 그 변 너머를 띄운다(봇·NPC·가운데 이동은 띄우지 않음), 그때 띄우기 상한 안, 미리 띄운 2차맵은 변 가까운 유닛이 있는 동안
// 붙잡고 떠나면 짧게 뒤 내린다(유닛이 들어선 2차맵은 보통 idle), 부팅 색인 뒤 다시 보기가 띄운다, 경계 너머 시야는 그 몫만 보인다(구독·탐사·
// 남의 유닛).
import { performance } from "node:perf_hooks";
import { terrainPath } from "@terra/protocol";
import { VISION_SIDE, WALK_SPEED, anchorCenter, hasBit } from "@terra/sim";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { type EdgeHooks, createEdgeWatch } from "./edgeWatch.ts";
import type { MapFactory } from "./mapFactory.ts";
import { createMapSpawner, sameLevelAs } from "./mapSpawn.ts";
import type { StreamSubscriber } from "./mapStream.ts";
import { mapTerrainFromTemp } from "./mapTerrain.ts";
import { createInlinePathService } from "./pathService.ts";
import { type SecondMap, createSecondMap } from "./secondMap.ts";
import { registerTerrainRoute } from "./terrainRoute.ts";
import { flatTerrain, silentLog } from "./testSupport.ts";
import { testMapKey } from "./world.ts";
import { emptyWorldStats } from "./worldStats.ts";

/** 가운데 2차맵과 +x 쪽 이웃, 그 너머 */
const HOME = testMapKey(1);
const EAST = testMapKey(2);
const WEST = testMapKey(0);
const FAR = testMapKey(3);
/** 플레이어(사용자) 소유 주체, NPC 소유 주체 */
const PLAYER = 7;
const NPC = 9;

interface Rules {
  maxLoaded: number;
  idleMs: number;
  preopenIdleMs: number;
  preopenCells: number;
}

function rig(rules: Partial<Rules> = {}) {
  const live: Rules = {
    maxLoaded: 4,
    idleMs: 10 * 60_000,
    preopenIdleMs: 2 * 60_000,
    preopenCells: 48,
    ...rules,
  };
  const maps = new Map<number, SecondMap>();
  const clock = { now: 1_800_000_000_000 };
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const relay: { hooks?: EdgeHooks | undefined } = {};
  const edgeHooks: EdgeHooks = {
    moved: (mapKey, unit) => relay.hooks?.moved(mapKey, unit),
    sight: (mapKey, at) => relay.hooks?.sight(mapKey, at) ?? [],
  };
  const make = (mapKey: number) =>
    createSecondMap({
      mapKey,
      terrain: mapTerrainFromTemp(mapKey, flatTerrain()),
      paths,
      now: () => clock.now,
      stats: emptyWorldStats(),
      log: silentLog,
      edge: edgeHooks,
    });
  maps.set(HOME, make(HOME));
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
  const isMapKey = sameLevelAs(HOME);
  const held = new Set<number>();
  const opens: Promise<unknown>[] = [];
  const box: { spawner?: ReturnType<typeof createMapSpawner> } = {};
  const edge = createEdgeWatch({
    maps,
    isPlayer: (ownerId) => ownerId === PLAYER,
    preopenCells: () => live.preopenCells,
    canOpen: (mapKey) => !maps.has(mapKey) && isMapKey(mapKey),
    openEarly: (mapKey) => {
      if (box.spawner) opens.push(box.spawner.openEarly(mapKey));
    },
  });
  const spawner = createMapSpawner({
    maps,
    factory,
    paths,
    isMapKey,
    holds: (mapKey) => held.has(mapKey) || edge.holds(mapKey, clock.now),
    rules: () => live,
    afterSweep: () => edge.reconcile(clock.now),
    now: () => clock.now,
    log: silentLog,
  });
  box.spawner = spawner;
  relay.hooks = edge;
  /** 미리 띄우기가 끝날 때까지 */
  const settle = async (): Promise<void> => {
    while (opens.length > 0) await Promise.all(opens.splice(0));
  };
  return { maps, spawner, edge, clock, live, held, builds, settle, make, relay, edgeHooks };
}

/** 유닛 하나를 칸 (x, y)에 세운다 */
function place(map: SecondMap | undefined, id: number, x: number, y: number, ownerId = PLAYER): void {
  expect(map?.addUnit({ id, size: 1, speed: WALK_SPEED, cellX: x, cellY: y, ownerId })).toBe(true);
}

/** 보낸 메시지를 모으는 구독자 */
function collector(): StreamSubscriber & { messages: Record<string, unknown>[] } {
  const messages: Record<string, unknown>[] = [];
  return {
    messages,
    send: (text) => {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null)
        messages.push(Object.fromEntries(Object.entries(parsed)));
    },
    bufferedAmount: () => 0,
  };
}

const visionBits = (message: Record<string, unknown> | undefined): Uint8Array => {
  const text = message?.explored;
  return new Uint8Array(Buffer.from(typeof text === "string" ? text : "", "base64"));
};

describe("옆 2차맵 미리 띄우기(2026-11-12)", () => {
  it("플레이어 유닛이 변 가까이 가는 길을 받으면 넘기 전에 그 변 너머를 띄운다 — 가운데 이동·NPC 유닛은 띄우지 않는다", async () => {
    const r = rig();
    const home = r.maps.get(HOME);
    place(home, 1, 128, 128);
    place(home, 2, 128, 140, NPC);
    await r.settle();
    expect(r.builds).toEqual([]);
    // 가운데에서 가운데로: 띄우지 않는다
    expect(await home?.moveUnit(1, anchorCenter(150, 128, 1))).toEqual({ ok: true });
    // NPC 유닛이 서쪽 변으로 간다: 띄우지 않는다
    expect(await home?.moveUnit(2, anchorCenter(3, 140, 1))).toEqual({ ok: true });
    await r.settle();
    expect(r.builds).toEqual([]);
    // 플레이어 유닛이 동쪽 변 앞(변에서 5칸)으로 간다: 길을 받는 순간 동쪽 이웃을 띄운다(아직 가운데에 있다)
    expect(await home?.moveUnit(1, anchorCenter(250, 128, 1))).toEqual({ ok: true });
    await r.settle();
    expect(r.builds).toEqual([EAST]);
    expect(r.maps.has(EAST)).toBe(true);
    expect(r.spawner.early.has(EAST)).toBe(true);
    expect(r.spawner.onDemand.has(EAST)).toBe(true);
    expect(r.spawner.takeMetrics()).toMatchObject({ mapsOnDemand: 1, mapsPreopened: 1, mapPreopens: 1 });
    // 같은 길을 다시 받아도 다시 만들지 않는다
    expect(await home?.moveUnit(1, anchorCenter(252, 128, 1))).toEqual({ ok: true });
    await r.settle();
    expect(r.builds).toEqual([EAST]);
    // 미리 띄우기 거리 밖(변에서 60칸)이면 띄우지 않는다 — 서쪽
    expect(await home?.moveUnit(1, anchorCenter(60, 128, 1))).toEqual({ ok: true });
    await r.settle();
    expect(r.maps.has(WEST)).toBe(false);
  });

  it("설정 칸 map_preopen_cells = 0이면 미리 띄우지 않는다", async () => {
    const r = rig({ preopenCells: 0 });
    const home = r.maps.get(HOME);
    place(home, 1, 250, 128);
    expect(await home?.moveUnit(1, anchorCenter(254, 128, 1))).toEqual({ ok: true });
    r.edge.reconcile(r.clock.now);
    await r.settle();
    expect(r.builds).toEqual([]);
  });

  it("그때 띄우기 상한 안에서만 — 꽉 차고 비운 것이 없으면 띄우지 않고 센다, 자리가 나면 다시 보기가 띄운다", async () => {
    const r = rig({ maxLoaded: 1 });
    expect(await r.spawner.open(FAR)).toBe("ok");
    r.held.add(FAR);
    const home = r.maps.get(HOME);
    place(home, 1, 250, 128);
    await r.settle();
    expect(r.maps.has(EAST)).toBe(false);
    expect(r.spawner.takeMetrics()).toMatchObject({ mapsOnDemand: 1, mapPreopenRefused: 1 });
    // 붙잡음이 풀린 빈 2차맵은 내리고 띄운다(1분마다 다시 보기)
    r.held.delete(FAR);
    r.spawner.sweep();
    await r.settle();
    expect(r.maps.has(EAST)).toBe(true);
    expect(r.maps.has(FAR)).toBe(false);
    expect(r.spawner.onDemand.size).toBe(1);
  });

  it("미리 띄운 2차맵은 변 가까운 유닛이 있는 동안 붙잡고, 떠나 비면 짧게(map_preopen_idle_ms) 뒤 내린다", async () => {
    const r = rig();
    const home = r.maps.get(HOME);
    place(home, 1, 250, 128);
    await r.settle();
    expect(r.maps.has(EAST)).toBe(true);
    // 변 가까이 서 있는 동안: 오래 지나도 내리지 않는다
    r.clock.now += 30 * 60_000;
    expect(r.spawner.sweep()).toBe(0);
    expect(r.maps.has(EAST)).toBe(true);
    // 가운데로 떠난다 → 처음 본 빔부터 2분
    expect(await home?.moveUnit(1, anchorCenter(128, 128, 1))).toEqual({ ok: true });
    r.clock.now += 10 * 60_000;
    expect(r.spawner.sweep()).toBe(0);
    r.clock.now += 60_000;
    expect(r.spawner.sweep()).toBe(0);
    r.clock.now += 60_000;
    expect(r.spawner.sweep()).toBe(1);
    expect(r.maps.has(EAST)).toBe(false);
    expect(r.spawner.early.size).toBe(0);
  });

  it("유닛이 들어선 미리 띄운 2차맵은 보통 그때 띄운 2차맵으로 센다(비면 map_spawn_idle_ms)", async () => {
    const r = rig();
    const home = r.maps.get(HOME);
    place(home, 1, 250, 128);
    await r.settle();
    const east = r.maps.get(EAST);
    // 넘어간다(2차맵 사이 이동이 하는 것처럼)
    const row = home?.transferOut(1);
    if (!row) throw new Error("no row");
    expect(east?.transferIn(row, 2, 128)).toBe(true);
    r.spawner.sweep();
    expect(r.spawner.early.has(EAST)).toBe(false);
    // 다시 돌아와 가운데로 간다 — 동쪽은 이제 보통 idle(10분)
    const back = east?.transferOut(1);
    if (!back) throw new Error("no row");
    expect(home?.transferIn(back, 128, 128)).toBe(true);
    r.spawner.sweep();
    r.clock.now += 3 * 60_000;
    expect(r.spawner.sweep()).toBe(0);
    r.clock.now += 7 * 60_000;
    expect(r.spawner.sweep()).toBe(1);
  });

  it("부팅 색인(seed)은 띄우지 않고, 다시 보기(reconcile)가 띄운다", async () => {
    const r = rig();
    // 고리 없이 만든 것처럼: 잇기 전에 변 가까이 선 유닛
    r.relay.hooks = undefined;
    place(r.maps.get(HOME), 1, 3, 128);
    r.relay.hooks = r.edge;
    r.edge.seed(r.maps.values());
    await r.settle();
    expect(r.builds).toEqual([]);
    expect(r.edge.takeMetrics()).toMatchObject({ edgeUnits: 1 });
    expect(r.edge.reconcile(r.clock.now)).toBe(1);
    await r.settle();
    expect(r.builds).toEqual([WEST]);
    expect(r.edge.reconcile(r.clock.now)).toBe(0);
  });
});

describe("경계 너머 시야(2026-11-12)", () => {
  it("옆 2차맵 변 가까이 선 내 유닛의 시야 몫만 보인다: 구독할 수 있고, 그 몫이 탐사되고, 그 안의 남의 유닛이 보인다", async () => {
    const r = rig();
    const home = r.maps.get(HOME);
    // 동쪽 변에서 3칸(배치 칸 252) — 시야(24칸)가 동쪽 이웃 안으로 약 21칸 넘는다
    place(home, 1, 252, 128);
    await r.settle();
    const east = r.maps.get(EAST);
    if (!east) throw new Error("east not opened");
    // 이웃 안: 경계 바로 안(4칸)의 NPC 유닛은 보이고, 가운데 것은 보이지 않는다
    place(east, 50, 4, 128, NPC);
    place(east, 51, 128, 128, NPC);
    const me = { userId: "u-player", ownerId: PLAYER };
    expect(await east.vision.canView(me)).toBe(true);
    expect(await east.vision.canView({ userId: "u-other", ownerId: 8 })).toBe(false);
    const sub = collector();
    east.vision.subscribe(sub, me);
    const bits = visionBits(sub.messages.find((message) => message.t === "vision"));
    const row = 16;
    // 경계 쪽 시야 칸(0~2열)만 켜졌다, 3열부터는 어둡다
    expect(hasBit(bits, row * VISION_SIDE + 0)).toBe(true);
    expect(hasBit(bits, row * VISION_SIDE + 2)).toBe(true);
    for (let x = 3; x < VISION_SIDE; x++) expect(hasBit(bits, row * VISION_SIDE + x)).toBe(false);
    const snapshot = sub.messages.find((message) => message.t === "map_snapshot");
    const ids = Array.isArray(snapshot?.units)
      ? snapshot.units.map((unit: unknown) => Number(Reflect.get(Object(unit), "id")))
      : [];
    expect(ids).toContain(50);
    expect(ids).not.toContain(51);
    expect(east.vision.sees(me, 50)).toBe(true);
    expect(east.vision.sees(me, 51)).toBe(false);
  });

  it("시야가 닿지 않는 거리(변에서 40칸)면 미리 띄운 이웃도 볼 수 없다(not_visible과 같은 답)", async () => {
    const r = rig();
    const home = r.maps.get(HOME);
    place(home, 1, 215, 128);
    await r.settle();
    const east = r.maps.get(EAST);
    expect(east).toBeDefined();
    expect(await east?.vision.canView({ userId: "u-player", ownerId: PLAYER })).toBe(false);
    // 경계 앞 20칸까지 오면 보인다
    const moved = await home?.moveUnit(1, anchorCenter(236, 128, 1));
    expect(moved).toEqual({ ok: true });
    r.clock.now += 60 * 60_000;
    expect(await east?.vision.canView({ userId: "u-player", ownerId: PLAYER })).toBe(true);
  });

  it("지형 경로: 볼 수 없는 미리 띄운 2차맵도 볼 수 있는 2차맵의 이웃이면 지형을 준다(띄우기 전과 같다), 이웃이 아니면 404", async () => {
    const r = rig();
    const home = r.maps.get(HOME);
    place(home, 1, 128, 128);
    expect(await r.spawner.openEarly(EAST)).toBe("ok");
    expect(await r.spawner.open(FAR)).toBe("ok");
    const east = r.maps.get(EAST);
    const far = r.maps.get(FAR);
    if (!east || !far) throw new Error("not opened");
    const directory = {
      map: (key: number) => r.maps.get(key),
      stats: emptyWorldStats(),
      ownerOfUser: () => PLAYER,
    };
    expect(await east.vision.canView({ userId: "u-player", ownerId: PLAYER })).toBe(false);
    const app = Fastify({ logger: false });
    registerTerrainRoute(app, {
      world: directory,
      viewer: () => Promise.resolve({ id: "u-player", loginId: "Fake_Player", roles: ["player"] }),
    });
    const get = (key: number, v: string) => app.inject({ method: "GET", url: terrainPath(key, v) });
    expect((await get(HOME, home?.terrainVersion ?? "")).statusCode).toBe(200);
    expect((await get(EAST, east.terrainVersion)).statusCode).toBe(200);
    // 두 장 너머(FAR = HOME + 2)는 이웃이 아니다
    expect((await get(FAR, far.terrainVersion)).statusCode).toBe(404);
    await app.close();
  });
});
