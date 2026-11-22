// 2차맵 사이 이동 서비스 시험(DB 없음, 가짜 시계) — 평평한 시험 2차맵 셋을 한 줄로 두고 내 유닛이 변 끝까지 걸어 옆 2차맵으로 넘어가고(실제 유닛·
// 지나는 2차맵 시야), 넘기 직전 정산, 마지막 2차맵에서 목표 둘레 설 칸에 닿아 끝난다. 확인 단계·멈추기·길에서 벗어남·소유 확인·쓰기 대기열 줄
// (docs/adr/2026-11-07-play-flow.md "WP9", 질문 571 가·582). WP11: 정찰은 닿으면 돌아오고 탐사 기록을 남긴다(591 나), 띄우지 않은 2차맵은
// 건너뛴다(593 나 — 사라졌다 나타남·멈추기·다시 켜면 다시 숨김). WP13: 건너뛰는 동안 확률 습격(610 나 — 지면 부상으로 그 자리에 멈춤).
// 좌표 이동(docs/adr/2026-11-15-unloaded-second-maps.md): 띄우지 않은 목적지는 띄우지 않고 좌표 유닛으로 서고, 좌표 유닛을 보내고, 멈추면 그 좌표에
// 선다. 2차맵을 띄울 때 장부 줄을 꺼내고(claim), 내리기 전 쉬는 유닛을 좌표 유닛으로(parkAll), 다시 켜면 장부를 채운다(restore orphans).
import { performance } from "node:perf_hooks";
import { CELL_UNITS, SURFACE_ROCK, WALK_SPEED, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { QueryPool } from "../world/persist/load.ts";
import { type SecondMap, type UnitRow, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_BOT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { type TravelService, createTravelService } from "./service.ts";
import type { TravelSpawn } from "./serviceTypes.ts";

const START = 1_798_000_000_000;
const OWNER = 7;
const USER = "user-a";
const OTHER_USER = "user-b";
const K = [testMapKey(0), testMapKey(1), testMapKey(2)];

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

interface Rig {
  maps: Map<number, SecondMap>;
  travel: TravelService;
  units: UnitRow[];
  travels: { op: "upsert" | "remove"; row: Record<string, unknown> }[];
  settled: { ownerId: number; atMs: number }[];
  /** 같은 모양의 2차맵을 하나 더 만든다(그때 띄우기 시험 — 목록에 넣지 않는다) */
  makeMap: (mapKey: number) => SecondMap;
  paths: ReturnType<typeof createInlinePathService>;
}

/** 띄운 2차맵(기본 K[0] ~ K[2], loaded 차례만) + 같은 스레드 길 찾기 + 이동 서비스. 유닛 행·길 줄 쓰기를 모은다 */
function rig(loaded: readonly number[] = [0, 1, 2], pool?: QueryPool, terrain = flatTerrain): Rig {
  const maps = new Map<number, SecondMap>();
  const units: UnitRow[] = [];
  const travels: Rig["travels"] = [];
  const settled: Rig["settled"] = [];
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const makeMap = (mapKey: number): SecondMap =>
    createSecondMap({
      mapKey,
      terrain: mapTerrainFromTemp(mapKey, terrain()),
      paths,
      now: () => Date.now(),
      stats: emptyWorldStats(),
      log: silentLog,
      persist: { saveUnit: (row) => units.push(row), saveBuilding: () => {}, removeBuilding: () => {} },
    });
  for (const mapKey of K.filter((_, index) => loaded.includes(index))) maps.set(mapKey, makeMap(mapKey));
  paths.start();
  const writer: Pick<WorldWriter, "upsert" | "remove"> = {
    upsert: (table, row) => {
      if (table === "travels") travels.push({ op: "upsert", row });
    },
    remove: (table, row) => {
      if (table === "travels") travels.push({ op: "remove", row });
    },
  };
  const travel = createTravelService({
    maps,
    planetId: "s2_test_planet",
    now: () => Date.now(),
    log: silentLog,
    ownerOf: (userId) => (userId === USER ? OWNER : userId === OTHER_USER ? 8 : undefined),
    cyborgUnitOf: (userId) => (userId === USER ? 1 : null),
    settle: (ownerId, atMs) => settled.push({ ownerId, atMs }),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 이동 서비스는 upsert·remove만 쓴다
    writer: writer as WorldWriter,
    pool,
    ready: () => true,
  });
  return { maps, travel, units, travels, settled, makeMap, paths };
}

/** 2차맵 띄우기(가짜 — 부르면 같은 모양 2차맵을 만들어 목록·경로 사본에 넣는다). full이면 상한 */
function spawnFor(r: Rig, options: { full?: boolean } = {}) {
  const opened: number[] = [];
  const spawn: TravelSpawn = {
    canOpen: (mapKey) => !r.maps.has(mapKey) && K.some((key) => key === mapKey),
    open: async (mapKey) => {
      await Promise.resolve();
      if (options.full) return "full";
      const map = r.makeMap(mapKey);
      r.maps.set(mapKey, map);
      r.paths.add(map.replicaInit());
      opened.push(mapKey);
      return "ok";
    },
  };
  r.travel.attachSpawn(spawn);
  return opened;
}

function mapAt(r: Rig, index: number): SecondMap {
  const map = r.maps.get(K[index] ?? 0);
  if (!map) throw new Error("no map");
  return map;
}

/** 쌓인 약속(탐사 기록 저장 등)을 몇 바퀴 돌린다 */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

/** 내 유닛(ID 1)을 K[0]의 칸 (x, y)에 세운다 */
function placeMine(r: Rig, x: number, y: number, id = 1, ownerId = OWNER): void {
  expect(
    mapAt(r, 0).addUnit({
      id,
      size: 1,
      speed: WALK_SPEED,
      cellX: x,
      cellY: y,
      ownerId,
      kind: UNIT_KIND_HUMAN,
    }),
  ).toBe(true);
}

/** 유닛이 선 2차맵 차례(없으면 −1) */
function whereIs(r: Rig, unitId: number): number {
  return K.findIndex((key) => r.maps.get(key)?.unitInfo(unitId) !== undefined);
}

describe("2차맵 사이 이동", () => {
  it("변 끝까지 걷고 옆 2차맵으로 넘어가(넘기 직전 정산) 마지막 2차맵 목표 칸에 닿는다", async () => {
    const r = rig();
    placeMine(r, 250, 100);
    // 확인 단계: 지나는 2차맵 셋, 곧은 거리 = (255 − 250) + 255 + 10칸
    const plan = r.travel.plan(USER, { mapKey: K[2] ?? 0, x: 10, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { unitId: 1, route: K, working: false } });
    const distance = (5 + 255 + 10) * CELL_UNITS;
    const durationMs = Math.ceil((distance * 1000) / WALK_SPEED);
    expect(plan.ok && plan.plan.durationMs).toBe(durationMs);

    expect(await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" })).toEqual(
      {
        ok: true,
        maps: 3,
        arriveAt: START + durationMs,
      },
    );
    expect(r.travels.at(-1)).toMatchObject({
      op: "upsert",
      row: { unit_id: 1, leg: 0, kind: "move", user_id: USER, origin_map_key: K[0], origin_x: 250 },
    });
    const first = mapAt(r, 0).unitInfo(1);
    expect(first && positionAt(first.motion, arrivalAt(first.motion))).toEqual(anchorCenter(255, 100, 1));
    expect(r.travel.list(USER)).toMatchObject([{ unitId: 1, state: "going", leg: 0, mapKey: K[0] }]);
    expect(r.travel.list(OTHER_USER)).toEqual([]);

    // 변 끝(5칸, 약 12초) → K[1]의 (0, 100)에 실제 유닛으로 선다. 행은 새 2차맵 키, 길 줄은 다음 구간
    const crossAt = first ? arrivalAt(first.motion) : 0;
    await vi.advanceTimersByTimeAsync(crossAt - Date.now() + 1);
    expect(whereIs(r, 1)).toBe(1);
    expect(r.settled).toEqual([{ ownerId: OWNER, atMs: crossAt }]);
    expect(r.units.at(-1)).toMatchObject({ id: 1, mapKey: K[1], kind: UNIT_KIND_HUMAN });
    expect(r.travels.at(-1)).toMatchObject({ op: "upsert", row: { unit_id: 1, leg: 1 } });
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", leg: 1, mapKey: K[1] }]);
    // 지나는 2차맵에서 내 유닛이 보인다(그 2차맵 시야 규칙)
    expect(await mapAt(r, 1).vision.canView({ userId: USER, ownerId: OWNER })).toBe(true);

    // 한 장 더 지나 마지막 2차맵 (10, 100)에 닿으면 끝(줄을 지운다, 최근 목록에 도착)
    await vi.advanceTimersByTimeAsync(durationMs + 5_000);
    expect(whereIs(r, 1)).toBe(2);
    const last = mapAt(r, 2).unitInfo(1);
    expect(last && positionAt(last.motion, Date.now())).toEqual(anchorCenter(10, 100, 1));
    expect(r.settled.map((entry) => entry.ownerId)).toEqual([OWNER, OWNER]);
    expect(r.travels.at(-1)).toEqual({ op: "remove", row: { unit_id: 1 } });
    expect(r.travel.active).toBe(0);
    expect(r.travel.list(USER)).toMatchObject([
      { unitId: 1, state: "arrived", stop: null, mapKey: K[2], cellX: 10, cellY: 100, returning: false },
    ]);
    r.travel.stop();
  });

  it("운영자 빠르기 배수로 보낸 길은 넘은 뒤 구간까지 그 배수로 걷고, 도착 예상도 그만큼 짧다", async () => {
    const r = rig();
    placeMine(r, 250, 100);
    const distance = (5 + 255 + 10) * CELL_UNITS;
    const fast = WALK_SPEED * 10;
    const result = await r.travel.start(
      USER,
      { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" },
      { speedFactor: 10 },
    );
    expect(result).toEqual({ ok: true, maps: 3, arriveAt: START + Math.ceil((distance * 1000) / fast) });
    const first = mapAt(r, 0).unitInfo(1);
    expect(first?.motion.speed).toBe(fast);
    // 유닛 속도는 그대로(그 이동 하나만 빠르다)
    expect(first?.speed).toBe(WALK_SPEED);
    // 변 끝에서 넘은 뒤 다음 구간도 같은 배수
    const crossAt = first ? arrivalAt(first.motion) : 0;
    await vi.advanceTimersByTimeAsync(crossAt - Date.now() + 1);
    expect(whereIs(r, 1)).toBe(1);
    expect(mapAt(r, 1).unitInfo(1)?.motion.speed).toBe(fast);
    r.travel.stop();
  });

  it("591 나: 정찰은 목표에 닿으면 출발한 자리로 돌아오고, 본 2차맵에 탐사 기록이 남는다(구독하지 않아도)", async () => {
    const r = rig();
    placeMine(r, 250, 100);
    // 유닛이 없는 사람(소유 주체 없음)으로 보면 K[1]의 탐사 기록이 비어 있다
    const known = async () =>
      (await mapAt(r, 1).vision.sighted({ userId: USER, ownerId: undefined })).some((byte) => byte !== 0);
    expect(await known()).toBe(false);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 100, kind: "scout" })).ok,
    ).toBe(true);
    // 변 끝(5칸) → K[1] → 목표 (10, 100)에 닿으면 돌아오는 길로 바뀐다
    for (let step = 0; step < 4 && r.travel.list(USER)[0]?.returning !== true; step++) {
      await vi.advanceTimersByTimeAsync(20_000);
      await flush();
    }
    expect(r.travel.list(USER)).toMatchObject([
      {
        state: "going",
        returning: true,
        scoutedMapKey: K[1],
        route: [K[1], K[0]],
        targetX: 250,
        targetY: 100,
      },
    ]);
    expect(r.travels.at(-1)).toMatchObject({
      op: "upsert",
      row: { scouted_map_key: K[1], leg: 0, target_x: 250, target_y: 100 },
    });
    // 탐사 기록은 남지만 탐사만으로는 열리지 않는다(D-564 1642 — 내 유닛이 있어야)
    expect(await known()).toBe(true);
    expect(await mapAt(r, 1).vision.canView({ userId: USER, ownerId: undefined })).toBe(false);
    // 돌아와서 출발 자리에 선다
    await vi.advanceTimersByTimeAsync(120_000);
    expect(whereIs(r, 1)).toBe(0);
    expect(r.travel.list(USER)).toMatchObject([
      { state: "arrived", returning: true, scoutedMapKey: K[1], mapKey: K[0], cellX: 250, cellY: 100 },
    ]);
    r.travel.stop();
  });

  it("593 나: 띄우지 않은 2차맵은 변 끝에서 사라져 곧은 거리 ÷ 속도 뒤 다음 띄운 2차맵 변에 나타난다", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    const plan = r.travel.plan(USER, { mapKey: K[2] ?? 0, x: 10, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { route: K, hiddenMaps: 1, cost: "walk" } });
    const hopMs = Math.ceil((257 * CELL_UNITS * 1000) / WALK_SPEED);
    expect(plan.ok && plan.plan.durationMs).toBe(
      Math.ceil(((5 + 257 + 10) * CELL_UNITS * 1000) / WALK_SPEED),
    );
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    const first = mapAt(r, 0).unitInfo(1);
    const goneAt = first ? arrivalAt(first.motion) : 0;
    await vi.advanceTimersByTimeAsync(goneAt - Date.now() + 1);
    // 사라졌다: 어느 2차맵에도 없고, 길 줄은 건너뛰는 중(나타나는 시각), 자리는 곧은 선 위
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.settled).toEqual([{ ownerId: OWNER, atMs: goneAt }]);
    expect(r.travels.at(-1)).toMatchObject({
      op: "upsert",
      row: { leg: 1, hidden_until_ms: goneAt + hopMs },
    });
    await vi.advanceTimersByTimeAsync(hopMs / 2);
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", hidden: true, leg: 1, mapKey: K[1] }]);
    expect(r.travel.hiddenAt(1)).toMatchObject({ mapKey: K[1], cellY: 100 });
    // 보내기·확인 단계는 나타난 뒤에
    expect(r.travel.plan(USER, { mapKey: K[0] ?? 0, x: 1, y: 1 })).toEqual({
      ok: false,
      problem: "in_transit",
    });
    expect(await r.travel.start(USER, { unitId: 1, mapKey: K[0] ?? 0, x: 1, y: 1, kind: "move" })).toEqual({
      ok: false,
      code: "busy",
    });
    // 나타나 (0, 100)에서 목표 (10, 100)까지 걷는다
    await vi.advanceTimersByTimeAsync(hopMs / 2 + 5_000);
    expect(whereIs(r, 1)).toBe(2);
    expect(r.travels.find((entry) => entry.row.leg === 2)).toMatchObject({ row: { hidden_until_ms: null } });
    await vi.advanceTimersByTimeAsync(60_000);
    const last = mapAt(r, 2).unitInfo(1);
    expect(last && positionAt(last.motion, Date.now())).toEqual(anchorCenter(10, 100, 1));
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", hidden: false, mapKey: K[2] }]);
    r.travel.stop();
  });

  it("운영자 텔레포트: 건너뛰는 중(in_transit)이어도 가던 길을 버리고 목적 칸에 바로 놓는다(사용자 지적 2026-11-15)", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    const first = mapAt(r, 0).unitInfo(1);
    await vi.advanceTimersByTimeAsync((first ? arrivalAt(first.motion) : 0) - Date.now() + 1_000);
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", hidden: true }]);
    expect(await r.travel.teleport(USER, { unitId: 1, mapKey: K[0] ?? 0, x: 40, y: 60 })).toMatchObject({
      ok: true,
    });
    expect(whereIs(r, 1)).toBe(0);
    const placed = mapAt(r, 0).unitInfo(1);
    expect(placed && positionAt(placed.motion, Date.now())).toEqual(anchorCenter(40, 60, 1));
    // 가던 길은 버렸다(나중에 다른 2차맵에 나타나지 않는다)
    expect(r.travel.list(USER)).toEqual([]);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(whereIs(r, 1)).toBe(0);
    r.travel.stop();
  });

  it("건너뛰는 중 멈추기: 지금 좌표(띄우지 않은 2차맵)의 좌표 유닛으로 선다(ADR 2026-11-15 4절)", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 100, y: 100, kind: "scout" })).ok,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(whereIs(r, 1)).toBe(-1);
    await vi.advanceTimersByTimeAsync(200_000);
    const place = r.travel.hiddenAt(1);
    expect(place?.mapKey).toBe(K[1]);
    expect(r.travel.cancel(USER, 1)).toEqual({ ok: true });
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.travel.parkedAt(1)).toEqual(place);
    expect(r.travel.list(USER)).toMatchObject([
      { state: "stopped", stop: "cancelled", mapKey: K[1], cellX: place?.cellX, cellY: place?.cellY },
    ]);
    expect(r.travels.at(-1)).toEqual({ op: "remove", row: { unit_id: 1 } });
    expect(r.travel.coordinateUnits(new Set([OWNER]))).toMatchObject([
      { unitId: 1, ownerId: OWNER, mapKey: K[1], moving: false },
    ]);
    r.travel.stop();
  });

  it("610 나: 건너뛴 2차맵에서 습격이 나면 나타난 자리에서 싸우고, 지면 부상으로 그 자리에 멈춘다(raided)", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    const rolled: { skipped: readonly number[]; seed: number }[] = [];
    const fought: { mapKey: number; unitId: number; seed: number }[] = [];
    r.travel.attachRaids({
      raidAt: (skipped, seed) => {
        rolled.push({ skipped, seed });
        return skipped[0] ?? null;
      },
      fight: (map, unitId, seed, nowMs) => {
        fought.push({ mapKey: map.mapKey, unitId, seed });
        const info = map.unitInfo(unitId);
        if (info) map.setCondition(unitId, { ...info.condition, injury: 2, injuryUntilMs: nowMs + 60_000 });
        return { lost: true, creatures: 2, ticks: 100 };
      },
    });
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 100, y: 100, kind: "move" })).ok,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(700_000);
    // 건너뛴 2차맵(K[1])을 굴렸고, 나타난 K[2]에서 싸웠다(같은 씨앗)
    expect(rolled.map((entry) => entry.skipped)).toEqual([[K[1]]]);
    expect(fought).toEqual([{ mapKey: K[2], unitId: 1, seed: rolled[0]?.seed }]);
    expect(r.maps.get(K[2] ?? 0)?.unitInfo(1)?.condition.injury).toBe(2);
    expect(r.travel.list(USER)).toMatchObject([
      { state: "stopped", stop: "raided", mapKey: K[2], cellX: 0, cellY: 100 },
    ]);
    expect(r.travels.at(-1)).toEqual({ op: "remove", row: { unit_id: 1 } });
    r.travel.stop();
  });

  it("610 나: 습격이 나지 않거나 이기면 그대로 간다", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    let fights = 0;
    r.travel.attachRaids({
      raidAt: (skipped) => skipped[0] ?? null,
      fight: () => {
        fights += 1;
        return { lost: false, creatures: 2, ticks: 50 };
      },
    });
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(800_000);
    expect(fights).toBe(1);
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[2] }]);
    r.travel.stop();
  });

  it("다시 켜면 건너뛰던 유닛(사라진 자리에 다시 놓임)을 다시 숨기고 남은 시간 뒤에 나타낸다", async () => {
    const until = START + 300_000;
    const saved = {
      unit_id: 1,
      owner_id: OWNER,
      user_id: USER,
      kind: "move",
      route: K.map(String),
      leg: 1,
      target_x: 10,
      target_y: 100,
      started_at_ms: START - 400_000,
      arrive_at_ms: START + 330_000,
      origin_map_key: K[0],
      origin_x: 200,
      origin_y: 100,
      scouted_map_key: null,
      hidden_until_ms: until,
    };
    const r = rig([0, 2], { query: () => Promise.resolve({ rows: [saved] }) });
    placeMine(r, 255, 100);
    expect(await r.travel.restore()).toBe(1);
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", hidden: true, leg: 1 }]);
    expect(r.travel.hiddenAt(1)?.mapKey).toBe(K[1]);
    await vi.advanceTimersByTimeAsync(until - Date.now() + 1);
    expect(r.maps.get(K[2] ?? 0)?.unitInfo(1)).toBeDefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[2], cellX: 10, cellY: 100 }]);
    r.travel.stop();
  });

  it("멈추기: 그 자리에 서고 줄을 지운다. 가는 중이 아니면 not_traveling", async () => {
    const r = rig();
    placeMine(r, 100, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 10, kind: "move" })).ok,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(r.travel.cancel(OTHER_USER, 1)).toEqual({ ok: false, code: "not_traveling" });
    expect(r.travel.cancel(USER, 1)).toEqual({ ok: true });
    const info = mapAt(r, 0).unitInfo(1);
    expect(info && arrivalAt(info.motion)).toBe(Date.now());
    expect(r.travel.list(USER)).toMatchObject([{ state: "stopped", stop: "cancelled", mapKey: K[0] }]);
    expect(r.travels.at(-1)).toEqual({ op: "remove", row: { unit_id: 1 } });
    expect(r.travel.cancel(USER, 1)).toEqual({ ok: false, code: "not_traveling" });
    // 걷던 길은 끝났다: 한참 지나도 그 자리
    await vi.advanceTimersByTimeAsync(600_000);
    expect(whereIs(r, 1)).toBe(0);
    r.travel.stop();
  });

  it("다른 이동 명령으로 길에서 벗어나면 확인 때 멈춤(interrupted), 새 보내기는 앞 길을 바꾼다", async () => {
    const r = rig();
    placeMine(r, 200, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 10, kind: "move" })).ok,
    ).toBe(true);
    expect((await mapAt(r, 0).moveUnit(1, anchorCenter(190, 90, 1))).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(whereIs(r, 1)).toBe(0);
    expect(r.travel.list(USER)).toMatchObject([{ state: "stopped", stop: "interrupted" }]);

    // 새 보내기 두 번: 뒤 것이 앞 것을 바꾼다(가는 중인 길은 하나)
    expect((await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 5, y: 5, kind: "move" })).ok).toBe(
      true,
    );
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[0] ?? 0, x: 60, y: 60, kind: "move" })).ok,
    ).toBe(true);
    expect(r.travel.active).toBe(1);
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", route: [K[0]] }]);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[0], cellX: 60, cellY: 60 }]);
    r.travel.stop();
  });

  it("남의 유닛·봇은 forbidden, 띄우지 않은 2차맵은 unknown_map, 사이보그가 없으면 확인 단계 no_cyborg", async () => {
    const r = rig();
    placeMine(r, 100, 100);
    placeMine(r, 110, 100, 2, 99);
    expect(
      mapAt(r, 0).addUnit({ id: 3, size: 1, speed: WALK_SPEED, cellX: 120, cellY: 100, kind: UNIT_KIND_BOT }),
    ).toBe(true);
    const to = { mapKey: K[1] ?? 0, x: 10, y: 10, kind: "move" as const };
    expect(await r.travel.start(USER, { ...to, unitId: 2 })).toEqual({ ok: false, code: "forbidden" });
    expect(await r.travel.start(USER, { ...to, unitId: 3 })).toEqual({ ok: false, code: "forbidden" });
    expect(await r.travel.start(OTHER_USER, { ...to, unitId: 1 })).toEqual({ ok: false, code: "forbidden" });
    expect(await r.travel.start(USER, { ...to, unitId: 77 })).toEqual({ ok: false, code: "unknown_unit" });
    expect(await r.travel.start(USER, { ...to, unitId: 1, mapKey: testMapKey(40) })).toEqual({
      ok: false,
      code: "unknown_map",
    });
    expect(r.travel.plan(OTHER_USER, { mapKey: K[1] ?? 0, x: 1, y: 1 })).toEqual({
      ok: false,
      problem: "no_cyborg",
    });
    expect(r.travel.active).toBe(0);
    r.travel.stop();
  });
});

/** 좌표 이동을 끝까지 돌린다(15초씩, 약속도 돌린다) */
async function runOut(r: Rig, steps = 300): Promise<void> {
  for (let step = 0; step < steps && r.travel.active > 0; step++) {
    await vi.advanceTimersByTimeAsync(15_000);
    await flush();
  }
}

describe("좌표 이동: 아무도 보지 않는 2차맵은 띄우지 않는다(docs/adr/2026-11-15-unloaded-second-maps.md)", () => {
  it("띄우지 않은 옆 2차맵으로 보내면 띄우지 않고 목표 칸의 좌표 유닛으로 선다(map_full 없음)", async () => {
    const r = rig([0]);
    const opened = spawnFor(r, { full: true });
    placeMine(r, 250, 100);
    const plan = r.travel.plan(USER, { mapKey: K[1] ?? 0, x: 10, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { route: [K[0], K[1]], hiddenMaps: 0 } });
    expect(plan.ok && plan.plan.durationMs).toBe(Math.ceil(((5 + 1 + 10) * CELL_UNITS * 1000) / WALK_SPEED));
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    expect(r.travel.touches(K[1] ?? 0)).toBe(false);
    await runOut(r);
    expect(opened).toEqual([]);
    expect(r.maps.has(K[1] ?? 0)).toBe(false);
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.travel.parkedAt(1)).toEqual({ mapKey: K[1], cellX: 10, cellY: 100 });
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[1], cellX: 10, cellY: 100 }]);
    expect(r.travel.carries(1)).toBe(true);
    expect(r.travel.takeMetrics()).toMatchObject({ coordUnits: 1, coordParked: 1, coordLands: 1 });
    r.travel.stop();
  });

  it("좌표 유닛을 보내면 그 자리에서 좌표로 가 띄운 2차맵 변에 나타나 걷는다", async () => {
    const r = rig([0]);
    spawnFor(r);
    placeMine(r, 250, 100);
    await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 100, kind: "move" });
    await runOut(r);
    expect(r.travel.parkedAt(1)?.mapKey).toBe(K[1]);
    // 좌표 유닛도 확인 단계·보내기를 받는다
    expect(r.travel.plan(USER, { unitId: 1, mapKey: K[0] ?? 0, x: 200, y: 100 })).toMatchObject({
      ok: true,
      plan: { route: [K[1], K[0]] },
    });
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[0] ?? 0, x: 200, y: 100, kind: "move" })).ok,
    ).toBe(true);
    expect(r.travel.parkedAt(1)).toBeUndefined();
    expect(r.travel.coordinateUnits(new Set([OWNER]))).toMatchObject([{ unitId: 1, moving: true }]);
    await runOut(r);
    expect(whereIs(r, 1)).toBe(0);
    const info = mapAt(r, 0).unitInfo(1);
    expect(info && positionAt(info.motion, Date.now())).toEqual(anchorCenter(200, 100, 1));
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[0] }]);
    r.travel.stop();
  });

  it("띄우지 않은 목적지에서 도중 습격이 나면 그 2차맵을 띄워 싸운다(전투 = 띄우는 까닭)", async () => {
    const r = rig([0]);
    const opened = spawnFor(r);
    placeMine(r, 250, 100);
    const fought: number[] = [];
    r.travel.attachRaids({
      raidAt: (skipped) => skipped[0] ?? null,
      fight: (map) => {
        fought.push(map.mapKey);
        return { lost: false, creatures: 1, ticks: 10 };
      },
    });
    await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" });
    await runOut(r);
    expect(opened).toEqual([K[2]]);
    expect(fought).toEqual([K[2]]);
    expect(whereIs(r, 1)).toBe(2);
    expect(r.travel.parkedAt(1)).toBeUndefined();
    r.travel.stop();
  });

  it("2차맵을 띄우면 장부 줄을 꺼내 놓고(claim), 내리기 전에는 쉬는 유닛만 좌표 유닛으로 옮긴다(parkAll)", async () => {
    const r = rig([0]);
    placeMine(r, 100, 100);
    const map0 = mapAt(r, 0);
    expect(r.travel.parkable(map0)).toBe(true);
    expect(map0.moveUnit(1, anchorCenter(120, 100, 1))).toBeDefined();
    await flush();
    expect(r.travel.parkable(map0)).toBe(false);
    expect(r.travel.parkAll(map0)).toBe(-1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.travel.parkAll(map0)).toBe(1);
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.travel.parkedAt(1)).toEqual({ mapKey: K[0], cellX: 120, cellY: 100 });
    expect(r.travel.hasParked(K[0] ?? 0, OWNER)).toBe(true);
    expect(r.travel.hasParked(K[0] ?? 0, 99)).toBe(false);
    // 다시 띄운다: 장부 줄을 꺼내 놓는다
    const again = r.makeMap(K[1] ?? 0);
    expect(r.travel.claim(K[1] ?? 0, again)).toEqual([]);
    const rows = r.travel.claim(K[0] ?? 0, map0);
    expect(rows.map((row) => row.id)).toEqual([1]);
    map0.restore(rows, []);
    expect(map0.unitInfo(1)).toBeDefined();
    expect(r.travel.parkedAt(1)).toBeUndefined();
    r.travel.stop();
  });

  it("다시 켜면 띄우지 않은 2차맵의 유닛 행은 좌표 유닛이 되고, 그 유닛의 저장한 길은 좌표 이동으로 잇는다", async () => {
    const saved = {
      unit_id: 1,
      owner_id: OWNER,
      user_id: USER,
      kind: "move",
      route: [K[1], K[0]].map(String),
      leg: 0,
      target_x: 200,
      target_y: 100,
      started_at_ms: START - 10_000,
      arrive_at_ms: START + 100_000,
      origin_map_key: K[1],
      origin_x: 10,
      origin_y: 100,
      scouted_map_key: null,
      hidden_until_ms: null,
    };
    const r = rig([0], { query: () => Promise.resolve({ rows: [saved] }) });
    spawnFor(r);
    const row = (id: number, mapKey: number, kind = UNIT_KIND_HUMAN): UnitRow => ({
      id,
      ownerId: OWNER,
      kind,
      size: 1,
      speed: WALK_SPEED,
      mapKey,
      planetId: "s2_test_planet",
      domain: "land",
      path: [anchorCenter(10, 100, 1).x, anchorCenter(10, 100, 1).y],
      departAtMs: START - 50_000,
      wakeAtMs: null,
      aiStep: 0,
      job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
      condition: { injury: 0, injuryUntilMs: null, injuryHealPm: 1000, heldBy: null },
    });
    expect(
      await r.travel.restore([row(1, K[1] ?? 0), row(2, K[2] ?? 0), row(3, K[2] ?? 0, UNIT_KIND_BOT)]),
    ).toBe(1);
    expect(r.travel.parkedAt(2)).toEqual({ mapKey: K[2], cellX: 10, cellY: 100 });
    expect(r.travel.parkedAt(3)).toBeUndefined();
    expect(r.travel.list(USER)).toMatchObject([{ unitId: 1, state: "going", hidden: true }]);
    await runOut(r);
    expect(whereIs(r, 1)).toBe(0);
    r.travel.stop();
  });
});

/** 지형 칸 x 60 ~ 69(배치 칸 120 ~ 139)이 위아래 끝까지 바위(1300) */
function rockStrip() {
  const terrain = flatTerrain();
  for (let y = 0; y < 128; y++) for (let x = 60; x < 70; x++) terrain.surface[y * 128 + x] = SURFACE_ROCK;
  return terrain;
}

describe("구간 빠르기와 도착 예상(docs/adr/2026-11-14-segment-speed.md 8절)", () => {
  it("같은 2차맵 안 이동: 바위 띠를 1.3배 느리게 건너고, 목록의 도착 예상 = 움직임의 실제 도착", async () => {
    const r = rig([0], undefined, rockStrip);
    placeMine(r, 100, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[0] ?? 0, x: 160, y: 100, kind: "move" })).ok,
    ).toBe(true);
    await flush();
    const info = mapAt(r, 0).unitInfo(1);
    if (!info) throw new Error("no unit");
    expect(info.motion.paces).toEqual([1000, 1300, 1000]);
    // 곧은 60칸 중 20칸이 바위: 시간 거리 = (40 + 20 × 1.3)칸
    const expected = START + Math.ceil(((40 * 1000 + 20 * 1300) * CELL_UNITS) / WALK_SPEED);
    expect(arrivalAt(info.motion)).toBe(expected);
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", arriveAt: expected }]);
    await vi.advanceTimersByTimeAsync(expected - START - 1);
    expect(r.travel.list(USER)).toMatchObject([{ state: "going" }]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", cellX: 160, cellY: 100 }]);
    r.travel.stop();
  });
});

describe('좌표 이동 2(기획 D-564 1641·1643, docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)")', () => {
  it("1643: 좌표 구간은 지나는 띄우지 않은 2차맵의 걸음 배율만큼 느리다(띄운 출발·도착 2차맵은 빼고)", async () => {
    const r = rig([0, 2]);
    r.travel.attachPace((key) => (key === K[1] ? 1800 : 1250));
    placeMine(r, 250, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    const first = mapAt(r, 0).unitInfo(1);
    const goneAt = first ? arrivalAt(first.motion) : 0;
    await vi.advanceTimersByTimeAsync(goneAt - Date.now() + 1);
    expect(whereIs(r, 1)).toBe(-1);
    const hopMs = Math.ceil((Math.ceil((257 * CELL_UNITS * 1800) / 1000) * 1000) / WALK_SPEED);
    expect(r.travels.at(-1)).toMatchObject({
      op: "upsert",
      row: { leg: 1, hidden_until_ms: goneAt + hopMs },
    });
    // 배율 없이 걸리는 시간에는 아직 나타나지 않는다
    await vi.advanceTimersByTimeAsync(Math.ceil((257 * CELL_UNITS * 1000) / WALK_SPEED) + 1_000);
    expect(whereIs(r, 1)).toBe(-1);
    await vi.advanceTimersByTimeAsync(hopMs);
    expect(whereIs(r, 1)).toBe(2);
    r.travel.stop();
  });

  it("1641: 좌표로 지나는 유닛을 그 2차맵에서 멈추면(조우) 그 자리의 좌표 유닛이 되고 길은 encounter로 끝난다", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" });
    await vi.advanceTimersByTimeAsync(230_000);
    const place = r.travel.hiddenAt(1);
    expect(place?.mapKey).toBe(K[1]);
    // 다른 2차맵·다른 유닛이면 멈추지 않는다
    expect(r.travel.haltOn(K[0] ?? 0, new Set([1]))).toEqual([]);
    expect(r.travel.haltOn(K[1] ?? 0, new Set([2]))).toEqual([]);
    expect(r.travel.haltOn(K[1] ?? 0, new Set([1]))).toEqual([
      {
        unitId: 1,
        ownerId: OWNER,
        userId: USER,
        kind: "move",
        origin: { mapKey: K[0], x: 250, y: 100 },
        target: { mapKey: K[2], x: 10, y: 100 },
      },
    ]);
    expect(r.travel.parkedAt(1)).toEqual(place);
    expect(r.travel.list(USER)).toMatchObject([{ state: "stopped", stop: "encounter", mapKey: K[1] }]);
    expect(r.travels.at(-1)).toEqual({ op: "remove", row: { unit_id: 1 } });
    expect(r.travel.coordinateUnits(null)).toMatchObject([
      { unitId: 1, mapKey: K[1], moving: false, sea: false },
    ]);
    r.travel.stop();
  });

  it("1901: 띄운 2차맵을 걷는 유닛도 조우로 멈추면 그 자리에 서고 길은 encounter로 끝난다(다시 판단 자료를 돌려준다)", async () => {
    const r = rig();
    placeMine(r, 100, 100);
    await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 10, kind: "scout" });
    await vi.advanceTimersByTimeAsync(20_000);
    // 다른 2차맵이면 멈추지 않는다
    expect(r.travel.haltOn(K[1] ?? 0, new Set([1]))).toEqual([]);
    expect(r.travel.haltOn(K[0] ?? 0, new Set([1]))).toMatchObject([
      { unitId: 1, kind: "scout", target: { mapKey: K[1], x: 10, y: 10 } },
    ]);
    const info = mapAt(r, 0).unitInfo(1);
    expect(info && arrivalAt(info.motion)).toBe(Date.now());
    expect(r.travel.list(USER)).toMatchObject([{ state: "stopped", stop: "encounter", mapKey: K[0] }]);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(whereIs(r, 1)).toBe(0);
    r.travel.stop();
  });

  it("holdMap: 그 시각까지 그 2차맵을 내리지 않는다(touches)", async () => {
    const r = rig([0]);
    r.travel.holdMap(K[1] ?? 0, START + 60_000);
    expect(r.travel.touches(K[1] ?? 0)).toBe(true);
    expect(r.travel.touches(K[2] ?? 0)).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.travel.touches(K[1] ?? 0)).toBe(false);
    r.travel.stop();
  });
});
