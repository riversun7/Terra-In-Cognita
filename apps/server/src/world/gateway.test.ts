// 연결별 2차맵 요청 처리 시험 — 로그인·권한(기본 거부), 2차맵 키, 구독 → 스냅샷, 속도 제한, 명령 중복 방지, 밀림
import { type ServerMessage, decodeServerMessage } from "@terra/protocol";
import { anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import {
  type SecondMapClientMessage,
  type SocketLink,
  type WorldDirectory,
  cacheViewer,
  createCommandDedup,
  createWorldGateway,
} from "./gateway.ts";
import { createTestMap } from "./testSupport.ts";

// 2^48 + 9: 셀 키 검사를 통과하는 키(시험 2차맵 키와 같은 값을 쓴다)
const MAP_KEY = 281_474_976_710_665;
const ADMIN: Viewer = {
  id: "00000000-0000-4000-8000-000000000001",
  loginId: "Fake_Admin",
  roles: ["player", "admin"],
};
const PLAYER: Viewer = {
  id: "00000000-0000-4000-8000-000000000002",
  loginId: "Fake_Player",
  roles: ["player"],
};

/** 사용자 → 소유 주체(시야 시험). 시험 맵의 유닛은 소유 주체를 주지 않으면 0이다 */
const OWNERS = new Map([[PLAYER.id, 5]]);

function setup() {
  const test = createTestMap({ mapKey: MAP_KEY });
  const world: WorldDirectory = {
    map: (key) => (key === MAP_KEY ? test.map : undefined),
    stats: test.stats,
    ownerOfUser: (userId) => OWNERS.get(userId),
  };
  const gateway = createWorldGateway({ world, now: () => Date.now(), log: { error: () => {} } });
  return { ...test, gateway };
}

function link(viewer: Viewer | null): SocketLink & { received: ServerMessage[] } {
  const received: ServerMessage[] = [];
  return {
    received,
    send: (text) => received.push(decodeServerMessage(text)),
    bufferedAmount: () => 0,
    viewer: () => Promise.resolve(viewer),
  };
}

const results = (messages: ServerMessage[]) => messages.filter((m) => m.t === "result");

beforeEach(() => {
  vi.useFakeTimers({ now: 1_798_000_000_000 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("구독", () => {
  it("로그인하지 않으면 sign_in_required, 해제는 늘 ok", async () => {
    const { gateway, map } = setup();
    const socket = link(null);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    session.handle({ t: "unsubscribe", id: 2, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.received).toEqual([
      { t: "result", id: 1, ok: false, code: "sign_in_required" },
      { t: "result", id: 2, ok: true },
    ]);
    map.stop();
  });

  it("없는 2차맵·셀 키가 아닌 값은 unknown_map", async () => {
    const { gateway, map } = setup();
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: 12345 });
    session.handle({ t: "subscribe", id: 2, mapKey: MAP_KEY + 32 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received)).toEqual([
      { t: "result", id: 1, ok: false, code: "unknown_map" },
      { t: "result", id: 2, ok: false, code: "unknown_map" },
    ]);
    map.stop();
  });

  it("전체 보기(관리자)는 ok 다음 스냅샷을 받고, 그 뒤 바뀐 것을 받는다", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10 });
    const socket = link(ADMIN);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY, observe: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.received.map((m) => m.t)).toEqual(["result", "map_snapshot"]);
    expect(socket.received[1]).toMatchObject({
      t: "map_snapshot",
      mapKey: MAP_KEY,
      rev: 1,
      units: [{ id: 1 }],
    });
    map.placeBuilding({ x: 50, y: 50, width: 2, height: 2, rotation: 0 });
    expect(socket.received.at(-1)).toMatchObject({ t: "building_placed", rev: 2, building: { id: 1 } });
    session.close();
    map.placeBuilding({ x: 60, y: 60, width: 2, height: 2, rotation: 0 });
    expect(socket.received.at(-1)).toMatchObject({ t: "building_placed", rev: 2 });
    map.stop();
  });

  it("구독은 사용자별로 순간 10번까지", async () => {
    const { gateway, map } = setup();
    const socket = link(ADMIN);
    const session = gateway.open(socket);
    for (let id = 1; id <= 11; id++) session.handle({ t: "subscribe", id, mapKey: MAP_KEY, observe: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received).at(-1)).toEqual({ t: "result", id: 11, ok: false, code: "rate_limited" });
    map.stop();
  });
});

describe("명령", () => {
  const place: SecondMapClientMessage = {
    t: "place_building",
    id: 7,
    mapKey: MAP_KEY,
    x: 20,
    y: 20,
    width: 3,
    height: 2,
    rotation: 0,
  };

  it("관리자가 아니면 forbidden(기본 거부), 관리자는 건물 ID를 받는다", async () => {
    const { gateway, map } = setup();
    const player = link(PLAYER);
    const admin = link(ADMIN);
    gateway.open(player).handle(place);
    gateway.open(admin).handle(place);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.received).toEqual([{ t: "result", id: 7, ok: false, code: "forbidden" }]);
    expect(admin.received).toEqual([{ t: "result", id: 7, ok: true, buildingId: 1 }]);
    map.stop();
  });

  it("같은 요청 번호를 다시 보내면(끊긴 뒤 다시 보냄) 한 번만 실행하고 같은 결과를 준다", async () => {
    const { gateway, map } = setup();
    const first = link(ADMIN);
    const again = link(ADMIN);
    gateway.open(first).handle(place);
    await vi.advanceTimersByTimeAsync(0);
    gateway.open(again).handle(place);
    await vi.advanceTimersByTimeAsync(0);
    expect(again.received).toEqual([{ t: "result", id: 7, ok: true, buildingId: 1 }]);
    expect(map.replicaInit().buildings).toHaveLength(1);
    // 다른 번호는 새 명령(같은 자리라 겹침)
    gateway.open(again).handle({ ...place, id: 8 });
    await vi.advanceTimersByTimeAsync(0);
    expect(again.received.at(-1)).toEqual({ t: "result", id: 8, ok: false, code: "overlaps_building" });
    map.stop();
  });

  it("이동 명령은 경로가 정해진 뒤 결과를 주고, 그 움직임이 전송된다", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10 });
    const admin = link(ADMIN);
    const session = gateway.open(admin);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY, observe: true });
    const target = anchorCenter(30, 10, 1);
    session.handle({ t: "move_unit", id: 2, mapKey: MAP_KEY, unitId: 1, x: target.x, y: target.y });
    session.handle({ t: "move_unit", id: 3, mapKey: MAP_KEY, unitId: 99, x: 0, y: 0 });
    await vi.advanceTimersByTimeAsync(200);
    expect(results(admin.received)).toEqual([
      { t: "result", id: 1, ok: true },
      { t: "result", id: 2, ok: true },
      { t: "result", id: 3, ok: false, code: "unknown_unit" },
    ]);
    const paths = admin.received.find((m) => m.t === "unit_paths");
    expect(paths).toMatchObject({
      units: [{ id: 1, path: [10 * 1024 + 512, 10 * 1024 + 512, target.x, target.y] }],
    });
    map.stop();
  });

  it("명령은 사용자별 순간 30개까지, 연결 하나에 밀린 요청은 16개까지", async () => {
    const { gateway, map } = setup();
    const admin = link(ADMIN);
    const session = gateway.open(admin);
    for (let id = 1; id <= 40; id++)
      session.handle({ t: "remove_building", id, mapKey: MAP_KEY, buildingId: 1 });
    await vi.advanceTimersByTimeAsync(0);
    const codes = results(admin.received).map((m) => (m.ok ? "ok" : m.code));
    // 처음 16개만 받아들이고 나머지는 busy
    expect(codes.filter((code) => code === "busy")).toHaveLength(24);
    expect(codes.filter((code) => code === "unknown_building")).toHaveLength(16);
    for (let id = 41; id <= 60; id++) {
      session.handle({ t: "remove_building", id, mapKey: MAP_KEY, buildingId: 1 });
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(results(admin.received).at(-1)).toMatchObject({ ok: false, code: "rate_limited" });
    map.stop();
  });
});

describe("도우미", () => {
  it("cacheViewer: 기간 안에는 한 번만 조회하고, 실패하면 로그인하지 않은 것으로", async () => {
    let calls = 0;
    let time = 0;
    const viewer = cacheViewer(
      () => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error("db down")) : Promise.resolve(ADMIN);
      },
      () => time,
      1_000,
    );
    expect(await viewer()).toBe(ADMIN);
    expect(await viewer()).toBe(ADMIN);
    time = 1_000;
    expect(await viewer()).toBeNull();
    expect(calls).toBe(2);
  });

  it("중복 방지: 다시 해 볼 수 있는 실패(busy)는 기억하지 않는다, 기간이 지나면 잊는다", async () => {
    let time = 0;
    const dedup = createCommandDedup(() => time, 1_000, 10);
    let runs = 0;
    const busy = () => {
      runs += 1;
      return Promise.resolve({ ok: false as const, code: "busy" as const });
    };
    await dedup.run("a", busy);
    await dedup.run("a", busy);
    expect(runs).toBe(2);
    const ok = () => {
      runs += 1;
      return Promise.resolve({ ok: true as const });
    };
    await dedup.run("b", ok);
    await dedup.run("b", ok);
    expect(runs).toBe(3);
    time = 1_000;
    await dedup.run("b", ok);
    expect(runs).toBe(4);
  });
});

describe("시야 전송(S3)", () => {
  const SIDE = 32;
  /** 시야 칸 (cx, cy)가 (ox, oy)의 반지름 3 안인가(sim stampVision과 같은 식) */
  const near = (cell: number, own: number) => {
    const dx = (cell % SIDE) - (own % SIDE);
    const dy = Math.floor(cell / SIDE) - Math.floor(own / SIDE);
    return dx * dx + dy * dy <= 12;
  };
  const cellOf = (x: number, y: number) => Math.floor(y / 8192) * SIDE + Math.floor(x / 8192);

  it("내 유닛도 탐사도 없으면 not_visible", async () => {
    const { gateway, map } = setup();
    const socket = link(PLAYER);
    gateway.open(socket).handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received)).toEqual([{ t: "result", id: 1, ok: false, code: "not_visible" }]);
    map.stop();
  });

  it("내 유닛 둘레의 남의 유닛만 오고, 멀리 가면 hidden. 남의 경로의 모든 점은 그때 내 시야 칸 안(누출 없음)", async () => {
    const { gateway, map, paths } = setup();
    // 내 유닛(주체 5)은 (10, 10)에 서 있다. 남의 유닛 2는 가까이, 3은 멀리
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    map.addUnit({ id: 2, size: 1, speed: 4813, cellX: 14, cellY: 10 });
    map.addUnit({ id: 3, size: 1, speed: 437, cellX: 200, cellY: 200 });
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.received.map((m) => m.t)).toEqual(["result", "map_snapshot", "vision"]);
    const snapshot = socket.received[1];
    expect(
      snapshot?.t === "map_snapshot" ? snapshot.units.map((u) => u.id).toSorted((a, b) => a - b) : [],
    ).toEqual([1, 2]);

    // 남의 유닛 2가 멀리(오른쪽 끝) 간다 → 앞부분만, 시야를 벗어나면 hidden
    const own = cellOf(10 * 1024 + 512, 10 * 1024 + 512);
    await map.moveUnit(2, { x: 250 * 1024 + 512, y: 10 * 1024 + 512 });
    paths.release();
    for (let second = 0; second < 30; second++) {
      map.vision.tick();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    const sent = socket.received.filter((m) => m.t === "unit_paths");
    const foreignPoints = sent.flatMap((m) =>
      m.t === "unit_paths" ? m.units.filter((u) => u.id !== 1).flatMap((u) => u.path) : [],
    );
    expect(foreignPoints.length).toBeGreaterThan(0);
    for (let i = 0; i + 1 < foreignPoints.length; i += 2) {
      expect(near(cellOf(foreignPoints[i] ?? 0, foreignPoints[i + 1] ?? 0), own)).toBe(true);
    }
    expect(sent.some((m) => m.t === "unit_paths" && m.hidden?.includes(2))).toBe(true);
    expect(sent.some((m) => m.t === "unit_paths" && m.units.some((u) => u.id === 3))).toBe(false);
    session.close();
    map.stop();
  });

  it("자기 유닛은 움직일 수 있고 남의 유닛은 forbidden, 시험 명령은 dev-spawn 권한", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 30, cellY: 30 });
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "move_unit", id: 1, mapKey: MAP_KEY, unitId: 2, x: 20 * 1024, y: 20 * 1024 });
    session.handle({ t: "dev_spawn_units", id: 2, mapKey: MAP_KEY, count: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received)).toEqual([
      { t: "result", id: 1, ok: false, code: "forbidden" },
      { t: "result", id: 2, ok: false, code: "forbidden" },
    ]);
    const own = map.moveUnit(1, { x: 20 * 1024 + 512, y: 10 * 1024 + 512 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await own).toEqual({ ok: true });
    map.stop();
  });
});
