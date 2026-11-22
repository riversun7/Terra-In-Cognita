// NPC 2차맵 사이 이동 시험(DB 없음, 가짜 시계) — 사용자 결정 D-591("어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다"), 질문 2651 나·
// 2654 가(줄기 no-teleport-b). NPC 휴먼(봇)이 플레이어 이동과 같은 길·시간으로 걸어서 옆 2차맵으로 넘어가고(정산 없음, 스스로 걷기 멈춤), 띄우지 않은
// 2차맵은 건너뛰고(좌표 유닛 목록·조우 밖), 닿으면 알림. 플레이어 유닛·띄우지 않은 목적지는 받지 않는다. 다시 켜면 봇 길은 둘째 복구에서 잇고, 건너뛰는
// 동안 죽은 휴먼은 나타나지 않는다. 지도자는 수도를 따라 걸어간다(npc/leaderTravel.ts).
import { performance } from "node:perf_hooks";
import { CELL_UNITS, WALK_SPEED, anchorAt, arrivalAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CareNpcTravel, CareNpcTravelDone } from "../labor/stewardCare.ts";
import { leaderToCapital } from "../npc/leaderTravel.ts";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type SecondMap, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_BOT, UNIT_KIND_HUMAN, UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import type { NpcTravelDone } from "./npcJourney.ts";
import { npcTravelOf } from "./npcTravel.ts";
import { type TravelService, createTravelService } from "./service.ts";

const START = 1_798_000_000_000;
const NPC_OWNER = 40;
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
  writes: { op: "upsert" | "remove"; table: string; row: Record<string, unknown> }[];
  settled: number[];
}

function rig(loaded: readonly number[] = [0, 1, 2], pool?: QueryPool): Rig {
  const maps = new Map<number, SecondMap>();
  const writes: Rig["writes"] = [];
  const settled: number[] = [];
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  for (const mapKey of K.filter((_, index) => loaded.includes(index)))
    maps.set(
      mapKey,
      createSecondMap({
        mapKey,
        terrain: mapTerrainFromTemp(mapKey, flatTerrain()),
        paths,
        now: () => Date.now(),
        stats: emptyWorldStats(),
        log: silentLog,
      }),
    );
  paths.start();
  const writer: Pick<WorldWriter, "upsert" | "remove"> = {
    upsert: (table, row) => writes.push({ op: "upsert", table, row }),
    remove: (table, row) => writes.push({ op: "remove", table, row }),
  };
  const travel = createTravelService({
    maps,
    planetId: "s2_test_planet",
    now: () => Date.now(),
    log: silentLog,
    ownerOf: () => undefined,
    settle: (ownerId) => settled.push(ownerId),
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 시험: 이동 서비스는 upsert·remove만 쓴다
    writer: writer as WorldWriter,
    pool,
    ready: () => true,
  });
  return { maps, travel, writes, settled };
}

const mapAt = (r: Rig, index: number): SecondMap => {
  const map = r.maps.get(K[index] ?? 0);
  if (!map) throw new Error("no map");
  return map;
};
const whereIs = (r: Rig, unitId: number): number =>
  K.findIndex((key) => r.maps.get(key)?.unitInfo(unitId) !== undefined);

/** NPC 유닛을 K[index]의 칸에 세운다 */
function place(r: Rig, id: number, x: number, y: number, kind = UNIT_KIND_BOT, index = 0): void {
  expect(
    mapAt(r, index).addUnit({ id, size: 1, speed: WALK_SPEED, cellX: x, cellY: y, ownerId: NPC_OWNER, kind }),
  ).toBe(true);
}

describe("NPC 2차맵 사이 이동 (D-591, 질문 2651 나)", () => {
  it("봇이 변 끝까지 걷고 옆 2차맵으로 넘어가 목표에 닿는다 — 정산 없음, 가는 동안 스스로 걷지 않음, 닿으면 알림", async () => {
    const r = rig();
    place(r, 501, 250, 100);
    const done: NpcTravelDone[] = [];
    const npc = npcTravelOf(r.travel);
    let landed: { x: number; y: number } | undefined;
    const sent = await npc.send(501, { mapKey: K[2] ?? 0, x: 10, y: 100 }, (event) => {
      done.push(event);
      const info = mapAt(r, 2).unitInfo(501);
      landed = info && anchorAt(positionAt(info.motion, Date.now()), 1);
    });
    const durationMs = Math.ceil(((5 + 255 + 10) * CELL_UNITS * 1000) / WALK_SPEED);
    expect(sent).toEqual({ ok: true, arriveAt: START + durationMs });
    // 순간이동 없음: 보낸 때는 아직 출발 2차맵에 있다
    expect(whereIs(r, 501)).toBe(0);
    expect(npc.trip(501)).toEqual({ mapKey: K[2], arriveAt: START + durationMs, hidden: false });
    expect(r.writes.find((w) => w.table === "travels")?.row).toMatchObject({
      unit_id: 501,
      owner_id: NPC_OWNER,
      user_id: null,
    });
    const first = mapAt(r, 0).unitInfo(501);
    await vi.advanceTimersByTimeAsync((first ? arrivalAt(first.motion) : 0) - Date.now() + 1);
    expect(whereIs(r, 501)).toBe(1);
    // 넘어간 봇은 스스로 걷지 않는다: 다음 구간 길(목표 쪽 변)만 걷는다
    expect(mapAt(r, 1).missingEvents()).toBe(0);
    // 닿을 때까지(닿은 칸 = 목표 칸 — 닿은 뒤에는 다시 스스로 걷는다)
    for (let step = 0; step < 200 && done.length === 0; step++) await vi.advanceTimersByTimeAsync(5_000);
    expect(whereIs(r, 501)).toBe(2);
    expect(landed).toEqual({ x: 10, y: 100 });
    expect(Date.now()).toBeGreaterThanOrEqual(START + durationMs);
    expect(done).toEqual([{ unitId: 501, state: "arrived", stop: null, mapKey: K[2] }]);
    expect(npc.trip(501)).toBeUndefined();
    expect(r.settled).toEqual([]);
    expect(r.writes.filter((w) => w.table === "travels").at(-1)).toEqual({
      op: "remove",
      table: "travels",
      row: { unit_id: 501 },
    });
    // 닿은 뒤에는 다시 스스로 걷는다(깨울 예약이 있다)
    expect(mapAt(r, 2).missingEvents()).toBe(0);
    r.travel.stop();
  });

  it("띄우지 않은 2차맵은 건너뛴다(그동안 2차맵에도 좌표 유닛 목록·조우에도 없다)", async () => {
    const r = rig([0, 2]);
    place(r, 502, 250, 100);
    const npc = npcTravelOf(r.travel);
    expect((await npc.send(502, { mapKey: K[2] ?? 0, x: 10, y: 100 })).ok).toBe(true);
    const first = mapAt(r, 0).unitInfo(502);
    await vi.advanceTimersByTimeAsync((first ? arrivalAt(first.motion) : 0) - Date.now() + 1);
    expect(whereIs(r, 502)).toBe(-1);
    expect(npc.trip(502)?.hidden).toBe(true);
    expect(r.travel.coordinateUnits(null)).toEqual([]);
    expect(r.travel.haltOn(K[1] ?? 0, new Set([502]))).toEqual([]);
    await vi.advanceTimersByTimeAsync(700_000);
    expect(whereIs(r, 502)).toBe(2);
    r.travel.stop();
  });

  it("플레이어 유닛·띄우지 않은 목적지·없는 유닛은 받지 않는다", async () => {
    const r = rig([0, 1]);
    place(r, 503, 100, 100, UNIT_KIND_HUMAN);
    place(r, 504, 120, 100);
    const npc = npcTravelOf(r.travel);
    expect(await npc.send(503, { mapKey: K[1] ?? 0, x: 10, y: 10 })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await npc.send(504, { mapKey: K[2] ?? 0, x: 10, y: 10 })).toEqual({
      ok: false,
      code: "unknown_map",
    });
    expect(await npc.send(999, { mapKey: K[1] ?? 0, x: 10, y: 10 })).toEqual({
      ok: false,
      code: "unknown_unit",
    });
    r.travel.stop();
  });

  it("다친 NPC 휴먼 병원 다녀오기 길(league-3 CareNpcTravel, 묶음 1117i hospital/attach.ts): 같은 NPC 이동이 그 꼴로 보내고 닿으면 알린다", async () => {
    const r = rig();
    place(r, 507, 250, 100);
    // hospital/attach.ts가 넘기는 것과 같다 — NpcTravel을 CareNpcTravel 자리에 그대로 쓴다(타입 검사가 꼴을 본다)
    const care: CareNpcTravel = npcTravelOf(r.travel);
    const done: CareNpcTravelDone[] = [];
    const sent = await care.send(507, { mapKey: K[1] ?? 0, x: 20, y: 100 }, (event) => done.push(event));
    expect(sent.ok).toBe(true);
    // 순간이동 없음: 보낸 때는 아직 출발 2차맵
    expect(whereIs(r, 507)).toBe(0);
    for (let step = 0; step < 200 && done.length === 0; step++) await vi.advanceTimersByTimeAsync(5_000);
    expect(whereIs(r, 507)).toBe(1);
    expect(done).toEqual([{ unitId: 507, state: "arrived", stop: null, mapKey: K[1] }]);
    r.travel.stop();
  });

  it("멈추기: 그 자리에 서고 알림(stopped). 사망(drop)은 건너뛰던 행을 버리고 유닛 행을 지운다", async () => {
    const r = rig([0, 2]);
    place(r, 505, 250, 100);
    place(r, 506, 250, 120);
    const npc = npcTravelOf(r.travel);
    const done: NpcTravelDone[] = [];
    await npc.send(505, { mapKey: K[2] ?? 0, x: 10, y: 100 }, (event) => done.push(event));
    await npc.send(506, { mapKey: K[2] ?? 0, x: 10, y: 120 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(npc.trip(506)?.hidden).toBe(true);
    expect(npc.cancel(505)).toBe(true);
    expect(done).toMatchObject([{ unitId: 505, state: "stopped", stop: "cancelled" }]);
    expect(npc.cancel(506, true)).toBe(true);
    expect(r.writes).toContainEqual({ op: "remove", table: "units", row: { id: 506 } });
    await vi.advanceTimersByTimeAsync(400_000);
    expect(whereIs(r, 506)).toBe(-1);
    expect(npc.cancel(506)).toBe(false);
    r.travel.stop();
  });
});

/** 저장한 봇 길 한 줄(건너뛰는 중 — K[1]) */
const saved = (unitId: number) => ({
  unit_id: unitId,
  owner_id: NPC_OWNER,
  user_id: null,
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
  hidden_until_ms: START + 300_000,
});

describe("다시 켜기 (npcJourney.ts — 봇 길은 둘째 복구)", () => {
  it("첫 복구는 봇 길을 남겨 두고, 둘째 복구가 다시 숨겨 잇는다. 죽은 휴먼은 나타나지 않는다", async () => {
    const r = rig([0, 2], { query: () => Promise.resolve({ rows: [saved(507), saved(508)] }) });
    place(r, 507, 255, 100);
    place(r, 508, 255, 110);
    expect(await r.travel.restore()).toBe(0);
    expect(whereIs(r, 507)).toBe(0);
    expect(r.writes.filter((w) => w.table === "travels" && w.op === "remove")).toEqual([]);
    expect(await r.travel.restoreNpc((id) => id !== 508)).toBe(2);
    expect(whereIs(r, 507)).toBe(-1);
    await vi.advanceTimersByTimeAsync(300_000 + 60_000);
    expect(whereIs(r, 507)).toBe(2);
    expect(whereIs(r, 508)).toBe(-1);
    expect(r.writes).toContainEqual({ op: "remove", table: "units", row: { id: 508 } });
    r.travel.stop();
  });
});

describe("지도자가 수도를 따라 걸어간다 (D-528, 질문 2654 가)", () => {
  it("새 수도 2차맵의 행정 건물 곁으로 걸어가고(바로 옮기지 않음), 이미 수도면 stay, 띄우지 않은 수도면 blocked", async () => {
    const r = rig();
    place(r, 900, 250, 100, UNIT_KIND_NPC_LEADER);
    expect(mapAt(r, 2).placeBuilding({ x: 60, y: 100, width: 6, height: 6, rotation: 0 }, NPC_OWNER)).toEqual(
      {
        ok: true,
        buildingId: 1,
      },
    );
    const facilities = {
      service: { facilities: new Map([[1, { facilityId: "government_hall", cityId: 5 }]]) },
    };
    const capital = { id: 5, mapKey: K[2] ?? 0, cellX: 128, cellY: 128 };
    const input = { maps: r.maps, facilities, travel: r.travel, ownerId: NPC_OWNER, capital };
    expect(await leaderToCapital(input)).toBe("sent");
    expect(whereIs(r, 900)).toBe(0);
    await vi.advanceTimersByTimeAsync(900_000);
    expect(whereIs(r, 900)).toBe(2);
    const at = mapAt(r, 2).unitInfo(900);
    const cell = at ? anchorAt(positionAt(at.motion, Date.now()), 1) : { x: 0, y: 0 };
    expect(Math.max(Math.abs(cell.x - 60), Math.abs(cell.y - 100))).toBeLessThanOrEqual(8);
    expect(await leaderToCapital(input)).toBe("stay");
    expect(await leaderToCapital({ ...input, capital: { ...capital, mapKey: 12345 } })).toBe("blocked");
    expect(await leaderToCapital({ ...input, ownerId: 41 })).toBe("pending");
    r.travel.stop();
  });
});
