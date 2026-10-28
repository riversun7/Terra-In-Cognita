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

function setup() {
  const test = createTestMap({ mapKey: MAP_KEY });
  const world: WorldDirectory = { map: (key) => (key === MAP_KEY ? test.map : undefined), stats: test.stats };
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

  it("로그인한 사용자는 ok 다음 스냅샷을 받고, 그 뒤 바뀐 것을 받는다", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10 });
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
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
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    for (let id = 1; id <= 11; id++) session.handle({ t: "subscribe", id, mapKey: MAP_KEY });
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
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
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
