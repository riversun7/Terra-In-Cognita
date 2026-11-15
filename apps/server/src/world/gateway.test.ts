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
import { createOperatorPace } from "./operatorPace.ts";
import { createTestMap } from "./testSupport.ts";
import { UNIT_KIND_GUARDIAN, UNIT_KIND_NPC_LEADER } from "./unitKinds.ts";

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
const DEV: Viewer = {
  id: "00000000-0000-4000-8000-000000000003",
  loginId: "Fake_Dev",
  roles: ["player", "dev"],
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
  /** 운영자 명령 감사 기록(남의 유닛에 된 명령만) */
  const audits: string[] = [];
  const gateway = createWorldGateway({
    world,
    now: () => Date.now(),
    log: { error: () => {} },
    onOperatorCommand: (viewer, command) =>
      audits.push(`${viewer.loginId}:${command.t}:${command.unitId}:${command.ownerId}`),
  });
  return { ...test, gateway, audits };
}

function link(viewer: Viewer | null, protocolVersion?: number): SocketLink & { received: ServerMessage[] } {
  const received: ServerMessage[] = [];
  return {
    received,
    send: (text) => received.push(decodeServerMessage(text)),
    bufferedAmount: () => 0,
    viewer: () => Promise.resolve(viewer),
    protocolVersion,
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

  it("띄우지 않은 2차맵을 구독하면 보는 사람이 띄운다(openForView — 좌표 유닛, ADR 2026-11-15), 상한이면 busy, 까닭이 없으면 unknown_map", async () => {
    const test = createTestMap({ mapKey: MAP_KEY });
    const live = { loaded: false };
    const asked: string[] = [];
    const answer: { next: "ok" | "refused" | "busy" } = { next: "busy" };
    const world: WorldDirectory = {
      map: (key) => (key === MAP_KEY && live.loaded ? test.map : undefined),
      stats: test.stats,
      ownerOfUser: (userId) => OWNERS.get(userId),
      openForView: (userId, mapKey, observe) => {
        asked.push(`${userId === PLAYER.id ? "player" : "admin"}:${mapKey === MAP_KEY}:${observe}`);
        if (answer.next === "ok") live.loaded = true;
        return Promise.resolve(answer.next);
      },
    };
    test.map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    const gateway = createWorldGateway({ world, now: () => Date.now(), log: { error: () => {} } });
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    answer.next = "refused";
    session.handle({ t: "subscribe", id: 2, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    answer.next = "ok";
    session.handle({ t: "subscribe", id: 3, mapKey: MAP_KEY });
    // 명령은 띄우지 않는다
    session.handle({ t: "stop_unit", id: 4, mapKey: MAP_KEY + 32, unitId: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received)).toEqual([
      { t: "result", id: 1, ok: false, code: "busy" },
      { t: "result", id: 2, ok: false, code: "unknown_map" },
      { t: "result", id: 3, ok: true },
      { t: "result", id: 4, ok: false, code: "unknown_map" },
    ]);
    expect(asked).toEqual(["player:true:false", "player:true:false", "player:true:false"]);
    expect(socket.received.some((message) => message.t === "map_snapshot")).toBe(true);
    session.close();
    test.map.stop();
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

  it("시야 안 NPC 국가 지도자는 스냅샷과 자른 경로 모두 표시 종류 npc_leader를 단다(프로토콜 18, WP-NPC3)", async () => {
    const { gateway, map, paths } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    map.addUnit({
      id: 2,
      size: 1,
      speed: 4813,
      cellX: 14,
      cellY: 10,
      ownerId: 8,
      kind: UNIT_KIND_NPC_LEADER,
    });
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    const snapshot = socket.received.find((m) => m.t === "map_snapshot");
    const units = snapshot?.t === "map_snapshot" ? snapshot.units : [];
    expect(units.find((u) => u.id === 2)?.kind).toBe("npc_leader");
    expect(units.find((u) => u.id === 1)).not.toHaveProperty("kind");
    // 지도자가 멀리 가면(자른 경로) 그 경로에도 종류가 남는다
    await map.moveUnit(2, { x: 250 * 1024 + 512, y: 10 * 1024 + 512 });
    paths.release();
    map.vision.tick();
    await vi.advanceTimersByTimeAsync(1_000);
    const clipped = socket.received.flatMap((m) =>
      m.t === "unit_paths" ? m.units.filter((u) => u.id === 2) : [],
    );
    expect(clipped.length).toBeGreaterThan(0);
    expect(clipped.every((u) => u.kind === "npc_leader" && u.until !== undefined)).toBe(true);
    session.close();
    map.stop();
  });

  it("자기 유닛은 움직일 수 있고 남의 유닛·내 수호신(그 도시에 머묾)은 forbidden", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 30, cellY: 30 });
    map.addUnit({ id: 3, size: 1, speed: 437, cellX: 12, cellY: 12, ownerId: 5, kind: UNIT_KIND_GUARDIAN });
    const socket = link(PLAYER);
    const session = gateway.open(socket);
    session.handle({ t: "move_unit", id: 1, mapKey: MAP_KEY, unitId: 2, x: 20 * 1024, y: 20 * 1024 });
    session.handle({ t: "move_unit", id: 3, mapKey: MAP_KEY, unitId: 3, x: 20 * 1024, y: 20 * 1024 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received)).toEqual([
      { t: "result", id: 1, ok: false, code: "forbidden" },
      { t: "result", id: 3, ok: false, code: "forbidden" },
    ]);
    const own = map.moveUnit(1, { x: 20 * 1024 + 512, y: 10 * 1024 + 512 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await own).toEqual({ ok: true });
    map.stop();
  });
});

const move = (id: number, unitId: number) =>
  ({ t: "move_unit", id, mapKey: MAP_KEY, unitId, x: 20 * 1024 + 512, y: 20 * 1024 + 512 }) as const;
const stop = (id: number, unitId: number) => ({ t: "stop_unit", id, mapKey: MAP_KEY, unitId }) as const;

/** 내 유닛 1(주체 5), 남의 유닛 2, 내 수호신 3 */
function threeUnits() {
  const test = setup();
  test.map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
  test.map.addUnit({ id: 2, size: 1, speed: 437, cellX: 30, cellY: 30 });
  test.map.addUnit({
    id: 3,
    size: 1,
    speed: 437,
    cellX: 12,
    cellY: 12,
    ownerId: 5,
    kind: UNIT_KIND_GUARDIAN,
  });
  return test;
}

describe("유닛 조종 권한(docs/adr/2026-11-07-unit-control.md, 프로토콜 17)", () => {
  it("17판 플레이어: 남의 유닛·없는 유닛은 같은 not_owner, 내 수호신은 unit_stays, 내 유닛은 옮기고 세운다", async () => {
    const { gateway, map, paths } = threeUnits();
    const socket = link(PLAYER, 17);
    const session = gateway.open(socket);
    session.handle(move(1, 2));
    session.handle(stop(2, 2));
    session.handle(move(3, 99));
    session.handle(move(4, 3));
    session.handle(stop(5, 3));
    session.handle(move(6, 1));
    await vi.advanceTimersByTimeAsync(0);
    paths.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received).map((m) => (m.ok ? "ok" : m.code))).toEqual([
      "not_owner",
      "not_owner",
      "not_owner",
      "unit_stays",
      "unit_stays",
      "ok",
    ]);
    // 가는 중인 내 유닛을 멈추면 그 자리에 선다(경로 점 하나)
    expect(map.unitInfo(1)?.motion.waypoints.length).toBeGreaterThan(1);
    session.handle(stop(7, 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received).at(-1)).toEqual({ t: "result", id: 7, ok: true });
    expect(map.unitInfo(1)?.motion.waypoints.length).toBe(1);
    map.stop();
  });

  it("16판 연결은 새 코드 대신 forbidden을 받는다", async () => {
    const { gateway, map } = threeUnits();
    const socket = link(PLAYER, 16);
    const session = gateway.open(socket);
    session.handle(move(1, 2));
    session.handle(move(2, 3));
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received).map((m) => (m.ok ? "ok" : m.code))).toEqual(["forbidden", "forbidden"]);
    map.stop();
  });

  it("운영자(dev)는 남의 유닛·수호신도 옮기고, 없는 유닛은 unknown_unit, 서버 봇은 세우지 않는다", async () => {
    // 봇을 먼저 만든다(봇 ID는 2차맵이 정한다), 시험 유닛은 그 뒤 겹치지 않는 ID로
    const { gateway, map, paths, audits } = setup();
    map.spawnBots(1);
    let bot = 0;
    map.forEachUnit((unit) => {
      bot = unit.id;
    });
    expect(bot).toBeGreaterThan(0);
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 30, cellY: 30 });
    map.addUnit({ id: 3, size: 1, speed: 437, cellX: 12, cellY: 12, ownerId: 5, kind: UNIT_KIND_GUARDIAN });
    const socket = link(DEV, 17);
    const session = gateway.open(socket);
    session.handle(move(1, 2));
    session.handle(move(2, 3));
    session.handle(stop(3, 99));
    session.handle(stop(4, bot));
    await vi.advanceTimersByTimeAsync(0);
    paths.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(results(socket.received).map((m) => (m.ok ? "ok" : m.code))).toEqual([
      "ok",
      "ok",
      "unknown_unit",
      "invalid_request",
    ]);
    // 운영자 권한으로만 된 명령(남의 유닛 2, 남의 수호신 3)만 감사 기록. 없는 유닛·거절된 봇 멈추기는 남기지 않는다
    expect(audits).toEqual(["Fake_Dev:move_unit:2:0", "Fake_Dev:move_unit:3:5"]);
    map.stop();
  });
});

/** 유닛을 (x, 10)으로 옮기는 이동 명령 */
const moveTo = (id: number, unitId: number, x: number): SecondMapClientMessage => {
  const target = anchorCenter(x, 10, 1);
  return { t: "move_unit", id, mapKey: MAP_KEY, unitId, x: target.x, y: target.y };
};
/** 명령 없이 그 유닛을 걷게 하는 길(채집 줄·들어가기·운반꾼처럼 moveUnit을 빠르기 없이 부른다)의 빠르기 */
const followUpSpeed = async (map: ReturnType<typeof setup>["map"], x: number) => {
  const result = map.moveUnit(1, anchorCenter(x, 10, 1));
  await vi.advanceTimersByTimeAsync(0);
  expect(await result).toEqual({ ok: true });
  return map.unitInfo(1)?.motion.speed;
};

describe("운영자 빠르기 표시(operatorPace.ts, 사용자 지적 2026-11-12)", () => {
  it("운영자 배율 기본은 1(D-560 1246) — 고르지 않으면 운영자 모드 이동도 보통. 전체 보기가 아닌 연결의 배율 바꾸기는 forbidden", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    const admin = { ...link(ADMIN), operatorPace: createOperatorPace() };
    const operator = gateway.open(admin);
    operator.handle({ t: "operator_pace", id: 1, mapKey: MAP_KEY, factor: 100 });
    operator.handle({ t: "subscribe", id: 2, mapKey: MAP_KEY, observe: true });
    operator.handle(moveTo(3, 1, 30));
    await vi.advanceTimersByTimeAsync(0);
    expect(results(admin.received).map((m) => (m.ok ? "ok" : m.code))).toEqual(["forbidden", "ok", "ok"]);
    expect(map.unitInfo(1)?.motion.speed).toBe(437);
    expect(map.paceOf(1)).toBe(1);
    // 플레이어는 전체 보기 구독을 못 하므로 배율도 못 바꾼다
    const player = { ...link(PLAYER), operatorPace: createOperatorPace() };
    const own = gateway.open(player);
    own.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    own.handle({ t: "operator_pace", id: 2, mapKey: MAP_KEY, factor: 10 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(player.received).map((m) => (m.ok ? "ok" : m.code))).toEqual(["ok", "forbidden"]);
    map.stop();
  });

  it("운영자 모드를 끄면(전체 보기 구독을 풀면) 빠른 상태가 바로 풀린다(D-560 1248)", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    const pace = createOperatorPace();
    const admin = { ...link(ADMIN), operatorPace: pace };
    const operator = gateway.open(admin);
    operator.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY, observe: true });
    operator.handle({ t: "operator_pace", id: 2, mapKey: MAP_KEY, factor: 10 });
    operator.handle(moveTo(3, 1, 30));
    await vi.advanceTimersByTimeAsync(0);
    expect(map.unitInfo(1)?.motion.speed).toBe(4370);
    expect(map.paceOf(1)).toBe(10);
    // 운영자 모드 끄기 = 플레이어 보기로 다시 구독
    operator.handle({ t: "subscribe", id: 4, mapKey: MAP_KEY });
    await vi.advanceTimersByTimeAsync(0);
    expect(map.paceOf(1)).toBe(1);
    expect(pace.factor()).toBe(1);
    expect(await followUpSpeed(map, 40)).toBe(437);
    map.stop();
  });

  it("운영자 모드 이동 명령 뒤로 그 유닛을 걷게 하는 다른 길도 고른 배율(100배), 주인의 보통 명령이 오면 다시 보통", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    const admin = { ...link(ADMIN), operatorPace: createOperatorPace() };
    const operator = gateway.open(admin);
    operator.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY, observe: true });
    operator.handle({ t: "operator_pace", id: 3, mapKey: MAP_KEY, factor: 100 });
    operator.handle(moveTo(2, 1, 30));
    await vi.advanceTimersByTimeAsync(0);
    expect(results(admin.received).map((m) => m.ok)).toEqual([true, true, true]);
    expect(map.unitInfo(1)?.motion.speed).toBe(437 * 100);
    expect(await followUpSpeed(map, 40)).toBe(437 * 100);
    // 주인(플레이어 보기)이 보낸 명령은 표시를 지운다 — 그 이동도, 뒤의 다른 길도 보통
    const player = link(PLAYER);
    const own = gateway.open(player);
    own.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY });
    own.handle(moveTo(2, 1, 20));
    await vi.advanceTimersByTimeAsync(0);
    expect(results(player.received).map((m) => m.ok)).toEqual([true, true]);
    expect(map.unitInfo(1)?.motion.speed).toBe(437);
    expect(await followUpSpeed(map, 50)).toBe(437);
    map.stop();
  });

  it("운영자 모드 멈추기도 표시를 단다. 전체 보기가 아닌 운영자의 명령은 보통", async () => {
    const { gateway, map } = setup();
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 5 });
    const admin = { ...link(ADMIN), operatorPace: createOperatorPace() };
    const operator = gateway.open(admin);
    operator.handle({ t: "subscribe", id: 1, mapKey: MAP_KEY, observe: true });
    operator.handle({ t: "operator_pace", id: 3, mapKey: MAP_KEY, factor: 100 });
    operator.handle({ t: "stop_unit", id: 2, mapKey: MAP_KEY, unitId: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(results(admin.received).map((m) => m.ok)).toEqual([true, true, true]);
    expect(map.paceOf(1)).toBe(100);
    expect(await followUpSpeed(map, 30)).toBe(437 * 100);
    // 같은 운영자라도 그 2차맵을 전체 보기로 보지 않는 연결이면 운영자 모드가 아니다
    const plain = link(DEV);
    gateway.open(plain).handle(moveTo(1, 1, 20));
    await vi.advanceTimersByTimeAsync(0);
    expect(results(plain.received).map((m) => m.ok)).toEqual([true]);
    expect(map.unitInfo(1)?.motion.speed).toBe(437);
    expect(map.paceOf(1)).toBe(1);
    map.stop();
  });
});
