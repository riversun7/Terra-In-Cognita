// 2차맵 전송 시험 — 묶어 보내기(같은 유닛은 마지막 것만), rev 순서, 건물 이벤트 전 비우기, 느린 연결 다시 맞춤
import { type ServerMessage, type UnitMotionWire, decodeServerMessage } from "@terra/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BATCH_INTERVAL_MS,
  MAX_BUFFERED_BYTES,
  RESYNC_CHECK_MS,
  type StreamState,
  type StreamSubscriber,
  createMapStream,
  emptyStreamStats,
} from "./mapStream.ts";
import { sized } from "./wire.ts";

const TERRAIN = { url: "/api/maps/9/terrain?v=1", generatorVersion: 1 };

function unit(id: number, departAtMs: number, pathLength = 2): UnitMotionWire {
  return {
    id,
    size: 1,
    speed: 437,
    departAtMs,
    path: Array.from({ length: pathLength * 2 }, (_, i) => (i * 1024 + 512) % 262_144),
  };
}

/** 받은 메시지를 모으는 가짜 구독자 */
function fakeSubscriber(): StreamSubscriber & { received: ServerMessage[]; buffered: number } {
  const received: ServerMessage[] = [];
  return {
    received,
    buffered: 0,
    send(text) {
      received.push(decodeServerMessage(text));
    },
    bufferedAmount() {
      return this.buffered;
    },
  };
}

function setup(initial: Partial<StreamState> = {}) {
  const state: StreamState = { rev: 0, units: [], buildings: [], ...initial };
  const stats = emptyStreamStats();
  const stream = createMapStream({
    mapKey: 9,
    terrain: TERRAIN,
    now: () => 1_000,
    state: () => state,
    stats,
  });
  return { stream, state, stats };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("구독", () => {
  it("구독하면 지금 상태의 스냅샷을 보낸다", () => {
    const { stream } = setup({ rev: 7, units: [sized(unit(1, 0))] });
    const sub = fakeSubscriber();
    stream.subscribe(sub);
    expect(sub.received).toEqual([
      {
        t: "map_snapshot",
        mapKey: 9,
        snapshotId: 1,
        part: 0,
        parts: 1,
        rev: 7,
        serverTime: 1_000,
        terrain: TERRAIN,
        units: [unit(1, 0)],
        buildings: [],
      },
    ]);
  });

  it("rev가 같으면 같은 스냅샷(같은 번호)을 다시 쓰고, 바뀌면 새 번호", () => {
    const { stream, state } = setup({ rev: 3 });
    const a = fakeSubscriber();
    const b = fakeSubscriber();
    stream.subscribe(a);
    stream.subscribe(b);
    state.rev = 4;
    stream.subscribe(a);
    const ids = [...a.received, ...b.received].map((m) => (m.t === "map_snapshot" ? m.snapshotId : -1));
    expect(ids).toEqual([1, 2, 1]);
  });
});

describe("유닛 움직임 묶음", () => {
  it("BATCH_INTERVAL_MS 동안 모아 한 번에 보내고, 같은 유닛은 마지막 것만", async () => {
    const { stream } = setup();
    const sub = fakeSubscriber();
    stream.subscribe(sub);
    sub.received.length = 0;
    stream.unitChanged(1, sized(unit(1, 10)));
    stream.unitChanged(2, sized(unit(2, 20)));
    stream.unitChanged(3, sized(unit(1, 30)));
    expect(sub.received).toEqual([]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(sub.received).toEqual([
      { t: "unit_paths", mapKey: 9, fromRev: 0, rev: 3, units: [unit(1, 30), unit(2, 20)] },
    ]);
  });

  it("다음 묶음의 fromRev는 앞 묶음의 rev", async () => {
    const { stream } = setup();
    const sub = fakeSubscriber();
    stream.subscribe(sub);
    sub.received.length = 0;
    stream.unitChanged(1, sized(unit(1, 10)));
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    stream.unitChanged(2, sized(unit(1, 20)));
    stream.unitChanged(3, sized(unit(2, 30)));
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(sub.received.map((m) => (m.t === "unit_paths" ? [m.fromRev, m.rev] : []))).toEqual([
      [0, 1],
      [1, 3],
    ]);
  });

  it("모은 것이 상한에 가까우면 기다리지 않고 바로 보낸다(메시지는 늘 상한 안)", () => {
    const { stream, stats } = setup();
    const sub = fakeSubscriber();
    stream.subscribe(sub);
    sub.received.length = 0;
    // 점 400개 유닛(약 4KB) 40개 → 묶음 여러 개
    for (let i = 1; i <= 40; i++) stream.unitChanged(i, sized(unit(i, i, 400)));
    const batches = sub.received.filter((m) => m.t === "unit_paths");
    expect(batches.length).toBeGreaterThan(1);
    expect(stats.bytes).toBeGreaterThan(0);
    // 이어지는 rev
    let rev = 0;
    for (const batch of batches) {
      if (batch.t !== "unit_paths") continue;
      expect(batch.fromRev).toBe(rev);
      rev = batch.rev;
    }
  });

  it("건물 이벤트는 모아 둔 유닛을 먼저 보낸 뒤 바로 보낸다", () => {
    const { stream } = setup();
    const sub = fakeSubscriber();
    stream.subscribe(sub);
    sub.received.length = 0;
    stream.unitChanged(1, sized(unit(1, 10)));
    stream.buildingPlaced(2, { id: 5, x: 1, y: 1, width: 2, height: 2, rotation: 0 });
    stream.buildingRemoved(3, 5);
    expect(sub.received.map((m) => [m.t, "rev" in m ? m.rev : -1])).toEqual([
      ["unit_paths", 1],
      ["building_placed", 2],
      ["building_removed", 3],
    ]);
  });

  it("구독자가 없으면 아무것도 보내지 않는다", async () => {
    const { stream, stats } = setup();
    stream.unitChanged(1, sized(unit(1, 10)));
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(stats.messages).toBe(0);
  });
});

describe("느린 연결", () => {
  it("버퍼가 상한을 넘으면 보내지 않고, 내려가면 새 스냅샷을 보낸다", async () => {
    const { stream, state, stats } = setup();
    const slow = fakeSubscriber();
    const fast = fakeSubscriber();
    stream.subscribe(slow);
    stream.subscribe(fast);
    slow.received.length = 0;
    fast.received.length = 0;
    slow.buffered = MAX_BUFFERED_BYTES + 1;
    state.rev = 1;
    stream.unitChanged(1, sized(unit(1, 10)));
    stream.flush();
    expect(fast.received).toHaveLength(1);
    expect(slow.received).toEqual([]);
    expect(stats.slowMarked).toBe(1);
    // 아직 버퍼가 차 있으면 기다린다
    await vi.advanceTimersByTimeAsync(RESYNC_CHECK_MS);
    expect(slow.received).toEqual([]);
    // 다시 맞출 때까지 묶음도 보내지 않는다
    slow.buffered = 0;
    state.rev = 2;
    stream.unitChanged(2, sized(unit(2, 20)));
    stream.flush();
    expect(slow.received).toEqual([]);
    await vi.advanceTimersByTimeAsync(RESYNC_CHECK_MS);
    expect(slow.received).toMatchObject([{ t: "map_snapshot", rev: 2 }]);
    expect(stats.resyncs).toBe(1);
    // 그다음부터는 다시 받는다
    stream.unitChanged(3, sized(unit(1, 30)));
    stream.flush();
    expect(slow.received.at(-1)).toMatchObject({ t: "unit_paths", fromRev: 2, rev: 3 });
  });

  it("구독을 풀면 더 보내지 않는다", () => {
    const { stream } = setup();
    const sub = fakeSubscriber();
    stream.subscribe(sub);
    stream.unsubscribe(sub);
    sub.received.length = 0;
    stream.unitChanged(1, sized(unit(1, 10)));
    stream.flush();
    expect(sub.received).toEqual([]);
    expect(stream.subscriberCount).toBe(0);
  });
});
