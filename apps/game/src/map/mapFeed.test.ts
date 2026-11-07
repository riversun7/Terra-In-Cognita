// 2차맵 자료 받기 시험(가짜 통로·가짜 엔진) — 구독·해제, 조각 모으기, rev 규칙·빠짐, 다시 구독, 결과 코드, 지형, 명령 보내기 조건
// 가짜와 메시지 만들기는 feedTestSupport.ts에 있다
import type { TerrainInput } from "@terra/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAP,
  TERRAIN,
  URL_V1,
  URL_V2,
  building,
  ignore,
  partAt,
  paths,
  settle,
  setup,
  snapshot,
  unit,
} from "./feedTestSupport.ts";
import { createRequestIds } from "./mapFeed.ts";
import { TerrainLoadError } from "./terrainLoader.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("구독·해제", () => {
  it("열면 구독하고, 닫으면 해제를 보내고 더 듣지 않는다", async () => {
    const { net, feed } = setup();
    expect(net.sent).toEqual([{ t: "subscribe", id: 100, mapKey: MAP }]);
    expect(feed.status().phase.kind).toBe("subscribing");
    feed.stop();
    expect(net.sent.at(-1)).toEqual({ t: "unsubscribe", id: 101, mapKey: MAP });
    expect(net.listeners.size).toBe(0);
  });

  it("연결 전에 열면 기다렸다가 ready 때 구독한다", () => {
    const { net, feed } = setup({ ready: false });
    expect(net.sent).toEqual([]);
    expect(feed.status().phase.kind).toBe("connecting");
    net.up();
    expect(net.of("subscribe")).toHaveLength(1);
  });

  it("끊긴 채 닫으면 해제를 보내지 않는다(서버 구독은 연결과 함께 사라졌다)", () => {
    const { net, feed } = setup();
    net.down();
    feed.stop();
    expect(net.of("unsubscribe")).toEqual([]);
  });
});

describe("스냅샷 조각", () => {
  it("조각을 모아 다 받으면 한 번에 넣고, 지형은 첫 조각에서 받기 시작한다", async () => {
    const { net, engine, feed, loadTerrain } = setup();
    const parts = snapshot({
      rev: 10,
      units: [unit(1), unit(2), unit(3), unit(4), unit(5)],
      parts: 2,
      buildings: [building(1)],
    });
    net.receive({ t: "result", id: 100, ok: true });
    net.receive(partAt(parts, 0));
    expect(loadTerrain).toHaveBeenCalledWith(URL_V1);
    expect(engine.state.setUnitsCalls).toBe(0);
    net.receive(partAt(parts, 1));
    await settle();
    expect(engine.state.units.map((spawn) => spawn.id)).toEqual([1, 2, 3, 4, 5]);
    expect(engine.state.paths.size).toBe(5);
    expect(Array.from(engine.state.paths.get(2)?.points ?? [])).toEqual([2.5, 0.5, 2.5, 4]);
    expect(engine.state.buildings).toHaveLength(1);
    expect(engine.state.terrains).toEqual([TERRAIN]);
    expect(feed.status()).toEqual({ phase: { kind: "live" }, terrain: { kind: "ready" }, hasSnapshot: true });
    const stats = feed.stats();
    expect(stats.rev).toBe(10);
    expect(stats.snapshotParts).toBe(2);
    expect(stats.snapshotBytes).toBe(parts.reduce((sum, part) => sum + JSON.stringify(part).length, 0));
    expect(stats.readyMs).not.toBeNull();
    expect(stats.subscribes).toBe(1);
    expect(stats.resubscribes).toBe(0);
    expect(loadTerrain).toHaveBeenCalledTimes(1);
  });

  it("part 0이 오면 새로 모은다", async () => {
    const { net, engine } = setup();
    const first = snapshot({ rev: 4, units: [unit(1), unit(2)], parts: 2, snapshotId: 1 });
    const second = snapshot({ rev: 6, units: [unit(7), unit(8)], parts: 2, snapshotId: 2 });
    net.receive(partAt(first, 0));
    for (const part of second) net.receive(part);
    await settle();
    expect(engine.state.units.map((spawn) => spawn.id)).toEqual([7, 8]);
  });

  it("조각이 빠지면 버리고 다시 구독한다(앞 구독과 1초 띄운다)", async () => {
    const { net, engine, feed } = setup();
    const parts = snapshot({ rev: 4, units: [unit(1), unit(2), unit(3)], parts: 3 });
    net.receive(partAt(parts, 0));
    net.receive(partAt(parts, 2));
    expect(engine.state.setUnitsCalls).toBe(0);
    expect(feed.stats().gaps).toBe(1);
    expect(net.of("subscribe")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe")).toHaveLength(2);
  });

  it("조각 사이에 다른 메시지가 끼면 조각이 빠진 것으로 본다", () => {
    const { net, feed } = setup();
    const parts = snapshot({ rev: 4, units: [unit(1), unit(2)], parts: 2 });
    net.receive(partAt(parts, 0));
    net.receive(paths(4, 5, [unit(1)]));
    expect(feed.stats().gaps).toBe(1);
    expect(feed.status().hasSnapshot).toBe(false);
  });

  it("요청하지 않은 스냅샷(서버의 따라잡기)도 받아 통째로 바꾼다", async () => {
    const { net, engine, feed, live } = setup();
    await live(snapshot({ rev: 10, units: [unit(1)] }));
    for (const part of snapshot({ rev: 40, units: [unit(1), unit(2)], snapshotId: 2 })) net.receive(part);
    expect(engine.state.units).toHaveLength(2);
    expect(feed.stats()).toMatchObject({ rev: 40, serverResyncs: 1, subscribes: 1 });
  });

  it("우리 구독의 결과 전에 온 스냅샷(앞 구독의 것)은 그려 두되 우리 답을 계속 기다린다", async () => {
    const { net, engine, feed } = setup();
    // 개발 모드에서 두 번 연 화면처럼: 앞 구독의 스냅샷이 우리 구독(100)의 결과보다 먼저 온다
    for (const part of snapshot({ rev: 5, units: [unit(1)] })) net.receive(part);
    expect(engine.state.units).toHaveLength(1);
    expect(feed.status()).toMatchObject({ phase: { kind: "subscribing" }, hasSnapshot: true });
    // 우리 답을 받기 전에는 바뀐 것을 넣지 않는다(이 연결이 구독된 채인지 아직 모른다)
    const before = engine.state.pathCalls;
    net.receive(paths(5, 6, [unit(1)]));
    expect(engine.state.pathCalls).toBe(before);
    // 우리 구독이 거절되면 잠시 뒤 다시 구독한다
    net.receive({ t: "result", id: 100, ok: false, code: "rate_limited" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe")).toHaveLength(2);
    net.receive({ t: "result", id: 101, ok: true });
    for (const part of snapshot({ rev: 9, units: [unit(1), unit(2)], snapshotId: 2 })) net.receive(part);
    await settle();
    expect(feed.status().phase.kind).toBe("live");
    net.receive(paths(9, 10, [unit(2)]));
    expect(feed.stats().rev).toBe(10);
  });

  it("다른 2차맵의 메시지는 무시한다", async () => {
    const { net, engine } = setup();
    for (const part of snapshot({ rev: 3, units: [unit(1)] })) net.receive({ ...part, mapKey: MAP + 1 });
    await settle();
    expect(engine.state.setUnitsCalls).toBe(0);
  });
});

describe("rev 규칙", () => {
  it("unit_paths: rev ≤ 내 rev는 버리고, 겹치면 적용하고, 빠지면 다시 구독한다", async () => {
    const { net, engine, feed, live } = setup();
    await live(snapshot({ rev: 10, units: [unit(1), unit(2)] }));
    const moved = unit(1, { path: [512, 512, 8 * 1024, 512], departAtMs: 10_020 });
    net.receive(paths(5, 9, [moved]));
    expect(Array.from(engine.state.paths.get(1)?.points ?? [])).toEqual([1.5, 0.5, 1.5, 4]);
    // (8, 12]: 앞부분은 스냅샷에 이미 들어 있다 — 움직임은 통째 바꾸기라 적용해도 같다
    net.receive(paths(8, 12, [moved]));
    expect(Array.from(engine.state.paths.get(1)?.points ?? [])).toEqual([0.5, 0.5, 8, 0.5]);
    expect(feed.stats().rev).toBe(12);
    net.receive(paths(12, 13, [unit(2, { speed: 2048 })]));
    expect(engine.state.paths.get(2)?.speedCellsPerSec).toBe(2);
    expect(feed.stats().rev).toBe(13);
    // (15, 16]: 14·15가 빠졌다 → 다시 구독, 새 스냅샷 전까지 오는 변화는 버린다
    net.receive(paths(15, 16, [unit(1)]));
    expect(feed.stats().gaps).toBe(1);
    const before = engine.state.pathCalls;
    net.receive(paths(16, 17, [unit(2)]));
    expect(engine.state.pathCalls).toBe(before);
    // 첫 구독과 1초 안이라 조금 뒤에 보낸다
    expect(net.of("subscribe")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe")).toHaveLength(2);
    await live(snapshot({ rev: 30, units: [unit(1), unit(2)], snapshotId: 2 }));
    net.receive(paths(30, 31, [moved]));
    expect(feed.stats().rev).toBe(31);
  });

  it("건물 이벤트: 차례면 적용, 같거나 옛 rev는 버림, 빠지면 다시 구독", async () => {
    const { net, engine, feed, live } = setup();
    await live(snapshot({ rev: 10, buildings: [building(1)] }));
    net.receive({ t: "building_placed", mapKey: MAP, rev: 11, building: building(2) });
    expect(engine.state.buildings.map((footprint) => footprint.id)).toEqual([1, 2]);
    expect(engine.state.buildings[1]).toMatchObject({ cellX: 8, cellY: 8, width: 2, depth: 3, rotation: 1 });
    net.receive({ t: "building_placed", mapKey: MAP, rev: 11, building: building(9) });
    expect(engine.state.buildings).toHaveLength(2);
    net.receive({ t: "building_removed", mapKey: MAP, rev: 12, buildingId: 1 });
    expect(engine.state.buildings.map((footprint) => footprint.id)).toEqual([2]);
    net.receive({ t: "building_placed", mapKey: MAP, rev: 14, building: building(3) });
    expect(engine.state.buildings.map((footprint) => footprint.id)).toEqual([2]);
    expect(feed.stats()).toMatchObject({ rev: 12, gaps: 1 });
  });

  it("스냅샷 뒤에 생긴 유닛이 오면 목록을 다시 넣는다", async () => {
    const { net, engine, live } = setup();
    await live(snapshot({ rev: 10, units: [unit(1)] }));
    net.receive(paths(10, 11, [unit(5)]));
    expect(engine.state.setUnitsCalls).toBe(2);
    expect(engine.state.units.map((spawn) => spawn.id)).toEqual([1, 5]);
    expect(engine.state.paths.size).toBe(2);
  });

  it("엔진 상한을 넘는 유닛은 넣지 않고 센다", async () => {
    const { net, engine, feed, live } = setup({ capacity: 3 });
    await live(snapshot({ rev: 10, units: [unit(1), unit(2), unit(3), unit(4), unit(5)] }));
    expect(engine.state.units.map((spawn) => spawn.id)).toEqual([1, 2, 3]);
    net.receive(paths(10, 11, [unit(4), unit(9)]));
    expect(engine.state.setUnitsCalls).toBe(1);
    expect(feed.stats()).toMatchObject({ units: 3, droppedUnits: 3 });
  });

  it("다시 넣어도 고른 유닛이 남아 있으면 다시 고른다", async () => {
    const { net, engine, live } = setup();
    await live(snapshot({ rev: 10, units: [unit(1), unit(2)] }));
    engine.sink.select(2);
    for (const part of snapshot({ rev: 20, units: [unit(2), unit(3)], snapshotId: 2 })) net.receive(part);
    expect(engine.state.selected).toBe(2);
    for (const part of snapshot({ rev: 30, units: [unit(3)], snapshotId: 3 })) net.receive(part);
    expect(engine.state.selected).toBeNull();
  });
});

describe("다시 구독·결과 코드", () => {
  it("끊겼다 다시 연결되면 다시 구독하고 새 스냅샷으로 통째로 바꾼다(서버를 다시 켜 rev가 작아져도)", async () => {
    const { net, engine, feed, live, statuses } = setup();
    await live(snapshot({ rev: 500, units: [unit(1), unit(2)] }));
    net.down();
    expect(statuses.at(-1)?.phase.kind).toBe("offline");
    // 끊긴 동안에도 받은 유닛은 그대로 둔다(마지막 경로대로 그린다)
    expect(engine.state.units).toHaveLength(2);
    net.up();
    expect(net.of("subscribe")).toHaveLength(2);
    await live(snapshot({ rev: 7, units: [unit(3)], snapshotId: 1 }));
    expect(engine.state.units.map((spawn) => spawn.id)).toEqual([3]);
    expect(feed.stats()).toMatchObject({ rev: 7, subscribes: 2, resubscribes: 1 });
    net.receive(paths(7, 8, [unit(3)]));
    expect(feed.stats().rev).toBe(8);
  });

  it("바쁨·속도 제한은 잠시 뒤 저절로 다시 구독한다(기다림은 두 배씩)", async () => {
    const { net, feed } = setup();
    net.receive({ t: "result", id: 100, ok: false, code: "rate_limited" });
    expect(feed.status().phase).toEqual({ kind: "retrying", code: "rate_limited" });
    await vi.advanceTimersByTimeAsync(999);
    expect(net.of("subscribe")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(net.of("subscribe")).toHaveLength(2);
    net.receive({ t: "result", id: 101, ok: false, code: "busy" });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(net.of("subscribe")).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(net.of("subscribe")).toHaveLength(3);
  });

  it("sign_in_required: 연결을 한 번 다시 맺어(쿠키가 실린 새 연결) 다시 구독하고, 또 오면 실패", () => {
    const { net, feed } = setup();
    net.receive({ t: "result", id: 100, ok: false, code: "sign_in_required" });
    expect(net.link.reconnect).toHaveBeenCalledTimes(1);
    expect(feed.status().phase.kind).toBe("offline");
    net.up();
    expect(net.of("subscribe")).toHaveLength(2);
    net.receive({ t: "result", id: 101, ok: false, code: "sign_in_required" });
    expect(net.link.reconnect).toHaveBeenCalledTimes(1);
    expect(feed.status().phase).toEqual({ kind: "failed", code: "sign_in_required" });
  });

  it("다른 거절은 실패로 두고 [다시 시도]를 기다린다", () => {
    const { net, feed } = setup();
    net.receive({ t: "result", id: 100, ok: false, code: "forbidden" });
    expect(feed.status().phase).toEqual({ kind: "failed", code: "forbidden" });
    feed.retry();
    expect(net.of("subscribe")).toHaveLength(2);
    expect(feed.status().phase.kind).toBe("subscribing");
  });

  it("스냅샷이 오지 않으면 10초 뒤 다시 구독한다", async () => {
    const { net } = setup();
    net.receive({ t: "result", id: 100, ok: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(net.of("subscribe")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe")).toHaveLength(2);
  });

  it("해제 결과나 모르는 번호의 결과는 무시한다", async () => {
    const { net, feed, live, reports } = setup();
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    net.receive({ t: "result", id: 999, ok: false, code: "internal_error" });
    expect(feed.status().phase.kind).toBe("live");
    expect(reports).toEqual([]);
  });
});

describe("지형", () => {
  it("다시 받은 스냅샷의 주소가 같으면 다시 받지 않고, 바뀌면 받는다", async () => {
    const { net, loadTerrain, live } = setup();
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    net.down();
    net.up();
    await live(snapshot({ rev: 2, units: [unit(1)] }));
    expect(loadTerrain).toHaveBeenCalledTimes(1);
    for (const part of snapshot({ rev: 3, units: [unit(1)], snapshotId: 2, url: URL_V2 })) net.receive(part);
    await settle();
    expect(loadTerrain).toHaveBeenLastCalledWith(URL_V2);
  });

  it("받지 못하면 이유와 함께 실패로 두고, [다시 시도]·다음 스냅샷에서 다시 받는다", async () => {
    let fail = true;
    const { net, feed, live, loadTerrain } = setup({
      loadTerrain: async () => {
        if (fail) throw new TerrainLoadError("network", "offline");
        return TERRAIN;
      },
    });
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    expect(feed.status().terrain).toEqual({ kind: "failed", reason: "network" });
    expect(feed.stats().readyMs).toBeNull();
    feed.retry();
    await settle();
    expect(loadTerrain).toHaveBeenCalledTimes(2);
    fail = false;
    for (const part of snapshot({ rev: 2, units: [unit(1)], snapshotId: 2 })) net.receive(part);
    await settle();
    expect(loadTerrain).toHaveBeenCalledTimes(3);
    expect(feed.status().terrain.kind).toBe("ready");
    expect(feed.stats().readyMs).not.toBeNull();
  });

  it("404(판이 바뀜)면 한 번은 저절로 다시 구독해 새 주소를 받는다", async () => {
    const { net, feed, live } = setup({
      loadTerrain: async (url) => {
        if (url === URL_V1) throw new TerrainLoadError("not_found", "gone");
        return TERRAIN;
      },
    });
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    expect(feed.status().terrain).toEqual({ kind: "failed", reason: "not_found" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe")).toHaveLength(2);
    await live(snapshot({ rev: 2, units: [unit(1)], snapshotId: 2, url: URL_V2 }));
    expect(feed.status().terrain.kind).toBe("ready");
  });

  it("엔진이 메시를 만들지 못하면 render 실패", async () => {
    const { engine, feed, live } = setup();
    engine.failTerrain();
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    expect(feed.status().terrain).toEqual({ kind: "failed", reason: "render" });
  });

  it("닫은 뒤에 도착한 지형은 엔진에 넣지 않는다", async () => {
    let finish: (input: TerrainInput) => void = ignore;
    const { net, engine, feed } = setup({
      loadTerrain: () =>
        new Promise<TerrainInput>((resolve) => {
          finish = resolve;
        }),
    });
    for (const part of snapshot({ rev: 1, units: [unit(1)] })) net.receive(part);
    feed.stop();
    finish(TERRAIN);
    await settle();
    expect(engine.state.terrains).toEqual([]);
  });
});

describe("명령", () => {
  it("보기 전용이면 보내지 않는다", async () => {
    const { net, feed, live } = setup({ admin: false });
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    expect(feed.moveUnit(1, { x: 10.7, y: 3.2 })).toEqual({ kind: "view_only" });
    expect(net.of("move_unit")).toEqual([]);
  });

  it("스냅샷 전이거나 끊겼으면 보내지 않는다", async () => {
    const { net, feed, live } = setup();
    expect(feed.moveUnit(1, { x: 1, y: 1 })).toEqual({ kind: "offline" });
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    net.down();
    expect(feed.moveUnit(1, { x: 1, y: 1 })).toEqual({ kind: "offline" });
    expect(net.of("move_unit")).toEqual([]);
  });

  it("관리자는 누른 칸의 가운데로 보내고, 결과를 알려 준다", async () => {
    const { net, feed, live, reports } = setup();
    await live(snapshot({ rev: 1, units: [unit(1), unit(2)] }));
    const attempt = feed.moveUnit(2, { x: 10.7, y: 3.2 });
    expect(attempt).toEqual({ kind: "sent", id: 101 });
    expect(net.of("move_unit")).toEqual([
      { t: "move_unit", id: 101, mapKey: MAP, unitId: 2, x: 10 * 1024 + 512, y: 3 * 1024 + 512 },
    ]);
    await vi.advanceTimersByTimeAsync(40);
    net.receive({ t: "result", id: 101, ok: true });
    feed.moveUnit(1, { x: 0, y: 0 });
    net.receive({ t: "result", id: 102, ok: false, code: "goal_blocked" });
    expect(reports).toEqual([
      { id: 101, unitId: 2, action: "move", outcome: { ok: true }, elapsedMs: 40 },
      { id: 102, unitId: 1, action: "move", outcome: { ok: false, code: "goal_blocked" }, elapsedMs: 0 },
    ]);
    expect(feed.stats()).toMatchObject({ commands: 2, pendingCommands: 0 });
  });

  it("결과 전에 끊기면 다시 연결된 뒤 같은 번호로 다시 보낸다(서버 중복 방지)", async () => {
    const { net, feed, live, reports } = setup();
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    feed.moveUnit(1, { x: 5, y: 5 });
    net.down();
    net.up();
    const moves = net.of("move_unit");
    expect(moves).toHaveLength(2);
    expect(moves[1]).toEqual(moves[0]);
    net.receive({ t: "result", id: 101, ok: true });
    expect(reports).toHaveLength(1);
  });

  it("20초 안에 결과가 없으면 no_reply", async () => {
    const { feed, live, reports } = setup();
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    feed.moveUnit(1, { x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reports).toEqual([
      { id: 101, unitId: 1, action: "move", outcome: { ok: false, code: "no_reply" }, elapsedMs: 20_000 },
    ]);
  });

  it("권한은 보낼 때마다 다시 본다", async () => {
    const { net, feed, live, setAdmin } = setup();
    await live(snapshot({ rev: 1, units: [unit(1)] }));
    setAdmin(false);
    expect(feed.moveUnit(1, { x: 5, y: 5 }).kind).toBe("view_only");
    setAdmin(true);
    expect(feed.moveUnit(1, { x: 5, y: 5 }).kind).toBe("sent");
    expect(net.of("move_unit")).toHaveLength(1);
  });
});

describe("측정값", () => {
  it("최근 1초의 갱신 수·메시지·글자 수와 움직임 지연 중앙값", async () => {
    const { net, feed, live, setServerClock } = setup();
    await live(snapshot({ rev: 10, units: [unit(1), unit(2)] }));
    await vi.advanceTimersByTimeAsync(1_000);
    feed.stats();
    setServerClock(10_100);
    const message = paths(10, 12, [unit(1, { departAtMs: 10_000 }), unit(2, { departAtMs: 10_060 })]);
    net.receive(message);
    net.receive(paths(12, 13, [unit(1, { departAtMs: 10_080 })]));
    await vi.advanceTimersByTimeAsync(1_000);
    const stats = feed.stats();
    expect(stats.unitUpdatesPerSec).toBeCloseTo(3, 5);
    expect(stats.messagesPerSec).toBeCloseTo(2, 5);
    expect(stats.bytesPerSec).toBeGreaterThan(JSON.stringify(message).length);
    expect(stats.pathLagMs).toBe(40);
  });

  it("요청 번호는 시작 값에서 1씩 오르고 u32에서 돈다", () => {
    const next = createRequestIds(0xffff_fffe);
    expect([next(), next(), next()]).toEqual([0xffff_fffe, 0xffff_ffff, 0]);
    const random = createRequestIds();
    const first = random();
    expect(Number.isInteger(first) && first >= 0 && first <= 0xffff_ffff).toBe(true);
    expect(random()).toBe((first + 1) >>> 0);
  });
});

describe("시야 전송(S3)", () => {
  it("hidden 유닛은 지우고, vision은 안개로 넘긴다. 전체 보기 구독은 observe를 보내고 안개를 끈다", async () => {
    const { net, engine, live, setObserve, feed } = setup();
    await live(snapshot({ rev: 5, units: [unit(1), unit(2)] }));
    net.receive({ t: "unit_paths", mapKey: MAP, fromRev: 5, rev: 6, units: [], hidden: [2] });
    expect(engine.state.units.map((spawn) => spawn.id)).toEqual([1]);
    // vision 전에는 탐사 수를 모른다(null). 9 = 비트 둘
    expect(feed.stats().explored).toBeNull();
    const bits = new Uint8Array(128);
    net.receive({ t: "vision", mapKey: MAP, explored: btoa(String.fromCharCode(...bits)) });
    expect(feed.stats().explored).toBe(0);
    bits[3] = 9;
    net.receive({ t: "vision", mapKey: MAP, explored: btoa(String.fromCharCode(...bits)) });
    expect(engine.state.explored?.[3]).toBe(9);
    expect(feed.stats().explored).toBe(2);
    setObserve(true);
    feed.refresh();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe").at(-1)).toMatchObject({ observe: true });
    await live(snapshot({ rev: 9, units: [unit(1)], snapshotId: 2 }));
    expect(engine.state.explored).toBeNull();
    expect(feed.stats().explored).toBeNull();
  });

  it("관리자가 아니어도 내 유닛(own)은 움직일 수 있다", async () => {
    const { net, feed, live } = setup({ admin: false });
    await live(snapshot({ rev: 1, units: [unit(1, { own: true }), unit(2)] }));
    expect(feed.isOwn(1)).toBe(true);
    expect(feed.isOwn(2)).toBe(false);
    expect(feed.moveUnit(2, { x: 1, y: 1 })).toEqual({ kind: "view_only" });
    expect(feed.moveUnit(1, { x: 1, y: 1 }).kind).toBe("sent");
    expect(net.of("move_unit")).toHaveLength(1);
  });

  it("멈추기(stop_unit, 프로토콜 17): 내 유닛만 보내고 결과에 멈추기로 알린다", async () => {
    const { net, feed, live, reports } = setup({ admin: false });
    await live(snapshot({ rev: 1, units: [unit(1, { own: true }), unit(2)] }));
    expect(feed.stopUnit(2)).toEqual({ kind: "view_only" });
    expect(feed.stopUnit(1)).toEqual({ kind: "sent", id: 101 });
    expect(net.of("stop_unit")).toEqual([{ t: "stop_unit", id: 101, mapKey: MAP, unitId: 1 }]);
    net.receive({ t: "result", id: 101, ok: false, code: "not_owner" });
    expect(reports).toEqual([
      { id: 101, unitId: 1, action: "stop", outcome: { ok: false, code: "not_owner" }, elapsedMs: 0 },
    ]);
  });

  it("시험 일꾼 받기: 보내고, 되면 알리고 다시 구독한다", async () => {
    const { net, feed, live, devSpawns } = setup();
    await live(snapshot({ rev: 1 }));
    expect(feed.devSpawn(3)).toBe(true);
    const sent = net.of("dev_spawn_units").at(-1);
    expect(sent).toMatchObject({ mapKey: MAP, count: 3 });
    net.receive({ t: "result", id: sent?.id ?? -1, ok: true });
    expect(devSpawns).toEqual([{ ok: true }]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(net.of("subscribe")).toHaveLength(2);
  });
});
