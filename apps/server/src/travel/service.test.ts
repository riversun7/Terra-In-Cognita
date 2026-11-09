// 2차맵 사이 이동 서비스 시험(DB 없음, 가짜 시계) — 평평한 시험 2차맵 셋을 한 줄로 두고 내 유닛이 변 끝까지 걸어 옆 2차맵으로 넘어가고(실제 유닛·
// 지나는 2차맵 시야), 넘기 직전 정산, 마지막 2차맵에서 목표 둘레 설 칸에 닿아 끝난다. 확인 단계·멈추기·길에서 벗어남·소유 확인·쓰기 대기열 줄
// (docs/adr/2026-11-07-play-flow.md "WP9", 질문 571 가·582). WP11: 정찰은 닿으면 돌아오고 탐사 기록을 남긴다(591 나), 띄우지 않은 2차맵은
// 건너뛴다(593 나 — 사라졌다 나타남·멈추기·다시 켜면 다시 숨김). WP13: 건너뛰는 동안 확률 습격(610 나 — 지면 부상으로 그 자리에 멈춤)
import { performance } from "node:perf_hooks";
import { CELL_UNITS, WALK_SPEED, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
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
function rig(loaded: readonly number[] = [0, 1, 2], pool?: QueryPool): Rig {
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
      terrain: mapTerrainFromTemp(mapKey, flatTerrain()),
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

/** 그때 띄우기(가짜 — 부르면 같은 모양 2차맵을 만들어 목록·경로 사본에 넣는다). full이면 상한 */
function spawnFor(r: Rig, options: { full?: boolean } = {}) {
  const opened: number[] = [];
  const spawn: TravelSpawn = {
    canOpen: (mapKey) => !r.maps.has(mapKey) && K.some((key) => key === mapKey),
    hasRoom: () => !options.full,
    open: async (mapKey) => {
      await Promise.resolve();
      if (options.full) return "full";
      const map = r.makeMap(mapKey);
      r.maps.set(mapKey, map);
      r.paths.add(map.replicaInit());
      opened.push(mapKey);
      return "ok";
    },
    prefetch: () => {},
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
    // 유닛이 없는 사람(소유 주체 없음)으로 보면 K[1]은 탐사 기록이 있어야 볼 수 있다
    expect(await mapAt(r, 1).vision.canView({ userId: USER, ownerId: undefined })).toBe(false);
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
    expect(await mapAt(r, 1).vision.canView({ userId: USER, ownerId: undefined })).toBe(true);
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

  it("건너뛰는 중 멈추기: 다음 띄운 2차맵에 나타난 자리에서 선다", async () => {
    const r = rig([0, 2]);
    placeMine(r, 250, 100);
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 100, y: 100, kind: "scout" })).ok,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(whereIs(r, 1)).toBe(-1);
    expect(r.travel.cancel(USER, 1)).toEqual({ ok: true });
    expect(r.travel.list(USER)).toMatchObject([{ state: "going", hidden: true }]);
    await vi.advanceTimersByTimeAsync(700_000);
    expect(r.maps.get(K[2] ?? 0)?.unitInfo(1)).toBeDefined();
    expect(r.travel.list(USER)).toMatchObject([
      { state: "stopped", stop: "cancelled", mapKey: K[2], cellX: 0, cellY: 100 },
    ]);
    expect(r.travels.at(-1)).toEqual({ op: "remove", row: { unit_id: 1 } });
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

describe("730 다: 띄우지 않은 목적 2차맵은 닿을 때 띄운다(WP15)", () => {
  it("옆 2차맵을 띄우지 않았어도 보낼 수 있고(opensMap), 변 끝에 닿으면 띄운 뒤 넘어가 목표에 선다", async () => {
    const r = rig([0]);
    const opened = spawnFor(r);
    placeMine(r, 250, 100);
    const plan = r.travel.plan(USER, { mapKey: K[1] ?? 0, x: 10, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { route: [K[0], K[1]], hiddenMaps: 0, opensMap: true } });
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[1] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    expect(r.travel.touches(K[1] ?? 0)).toBe(true);
    expect(opened).toEqual([]);
    // 변 끝(5칸) → 띄우고 넘는다 → (10, 100)에 닿는다
    for (let step = 0; step < 6 && r.travel.active > 0; step++) {
      await vi.advanceTimersByTimeAsync(15_000);
      await flush();
    }
    expect(opened).toEqual([K[1]]);
    expect(whereIs(r, 1)).toBe(1);
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[1], cellX: 10, cellY: 100 }]);
    expect(r.travel.touches(K[1] ?? 0)).toBe(false);
    r.travel.stop();
  });

  it("지나는 2차맵(중간)은 건너뛰고 마지막 2차맵은 나타날 때 띄운다", async () => {
    const r = rig([0]);
    const spawn = spawnFor(r);
    // K[1]은 지나는 2차맵이라 띄우지 않는다(canOpen이어도 목적지가 아니면 건너뛴다)
    placeMine(r, 250, 100);
    const plan = r.travel.plan(USER, { mapKey: K[2] ?? 0, x: 10, y: 100 });
    expect(plan).toMatchObject({ ok: true, plan: { route: K, hiddenMaps: 1, opensMap: true } });
    expect(
      (await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "move" })).ok,
    ).toBe(true);
    let hiddenSeen = false;
    // 건너뛰기 = 2차맵 한 장(약 1.5km) ÷ 걷는 속도 — 몇십 분
    for (let step = 0; step < 300 && r.travel.active > 0; step++) {
      await vi.advanceTimersByTimeAsync(15_000);
      await flush();
      if (r.travel.list(USER)[0]?.hidden) hiddenSeen = true;
    }
    expect(hiddenSeen).toBe(true);
    expect(spawn).toEqual([K[2]]);
    expect(r.maps.has(K[1] ?? 0)).toBe(false);
    expect(whereIs(r, 1)).toBe(2);
    expect(r.travel.list(USER)).toMatchObject([{ state: "arrived", mapKey: K[2] }]);
    r.travel.stop();
  });

  it("더 띄울 수 없으면 확인 단계 map_full·보내기 busy, 닿을 때 꽉 찼으면 변 앞에 멈춘다(map_full)", async () => {
    const r = rig([0]);
    const options = { full: true };
    spawnFor(r, options);
    placeMine(r, 250, 100);
    const to = { mapKey: K[1] ?? 0, x: 10, y: 100 };
    expect(r.travel.plan(USER, to)).toEqual({ ok: false, problem: "map_full" });
    expect(await r.travel.start(USER, { ...to, unitId: 1, kind: "move" })).toEqual({
      ok: false,
      code: "busy",
    });
    // 보낼 때는 자리가 있었는데 닿을 때 꽉 찼다
    const late = { full: false };
    const spawn: TravelSpawn = {
      canOpen: (mapKey) => !r.maps.has(mapKey) && K.some((key) => key === mapKey),
      hasRoom: () => !late.full,
      open: async () => "full",
      prefetch: () => {},
    };
    r.travel.attachSpawn(spawn);
    expect((await r.travel.start(USER, { ...to, unitId: 1, kind: "move" })).ok).toBe(true);
    late.full = true;
    for (let step = 0; step < 4 && r.travel.active > 0; step++) {
      await vi.advanceTimersByTimeAsync(15_000);
      await flush();
    }
    expect(whereIs(r, 1)).toBe(0);
    expect(r.travel.list(USER)).toMatchObject([{ state: "stopped", stop: "map_full", mapKey: K[0] }]);
    r.travel.stop();
  });
});
