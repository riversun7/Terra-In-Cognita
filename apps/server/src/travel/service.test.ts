// 2차맵 사이 이동 서비스 시험(DB 없음, 가짜 시계) — 평평한 시험 2차맵 셋을 한 줄로 두고 내 유닛이 변 끝까지 걸어 옆 2차맵으로 넘어가고(실제 유닛·
// 지나는 2차맵 시야), 넘기 직전 정산, 마지막 2차맵에서 목표 둘레 설 칸에 닿아 끝난다. 확인 단계·멈추기·길에서 벗어남·소유 확인·쓰기 대기열 줄
// (docs/adr/2026-11-07-play-flow.md "WP9", 질문 571 가·582)
import { performance } from "node:perf_hooks";
import { CELL_UNITS, WALK_SPEED, anchorCenter, arrivalAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type SecondMap, type UnitRow, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_BOT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { type TravelService, createTravelService } from "./service.ts";

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
}

/** 띄운 2차맵 셋(K[0] ~ K[2]) + 같은 스레드 길 찾기 + 이동 서비스. 유닛 행·길 줄 쓰기를 모은다 */
function rig(): Rig {
  const maps = new Map<number, SecondMap>();
  const units: UnitRow[] = [];
  const travels: Rig["travels"] = [];
  const settled: Rig["settled"] = [];
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  for (const mapKey of K) {
    maps.set(
      mapKey,
      createSecondMap({
        mapKey,
        terrain: mapTerrainFromTemp(mapKey, flatTerrain()),
        paths,
        now: () => Date.now(),
        stats: emptyWorldStats(),
        log: silentLog,
        persist: { saveUnit: (row) => units.push(row), saveBuilding: () => {}, removeBuilding: () => {} },
      }),
    );
  }
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
    ready: () => true,
  });
  return { maps, travel, units, travels, settled };
}

function mapAt(r: Rig, index: number): SecondMap {
  const map = r.maps.get(K[index] ?? 0);
  if (!map) throw new Error("no map");
  return map;
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

    expect(
      await r.travel.start(USER, { unitId: 1, mapKey: K[2] ?? 0, x: 10, y: 100, kind: "scout" }),
    ).toEqual({
      ok: true,
      maps: 3,
      arriveAt: START + durationMs,
    });
    expect(r.travels.at(-1)).toMatchObject({ op: "upsert", row: { unit_id: 1, leg: 0, kind: "scout" } });
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
      { unitId: 1, state: "arrived", stop: null, mapKey: K[2], cellX: 10, cellY: 100 },
    ]);
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
