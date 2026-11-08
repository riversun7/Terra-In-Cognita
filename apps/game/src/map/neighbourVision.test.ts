// 이웃 2차맵 안개 받기 시험(docs/adr/2026-11-08-seamless-second-map.md WP-3) — 가짜 통로로 구독·풀기·거절·다시 연결을 본다
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureClientMessage, FeatureServerMessage, LinkEvent } from "../net/serverLink.ts";
import { createRequestIds } from "./mapFeed.ts";
import { MAX_NEIGHBOUR_SUBSCRIPTIONS, startNeighbourVision } from "./neighbourVision.ts";

/** 시야 칸 128바이트 base64(첫 바이트 = first) */
const exploredText = (first: number): string => {
  const bytes = new Uint8Array(128);
  bytes[0] = first;
  return btoa(String.fromCharCode(...bytes));
};

function rig() {
  const sent: FeatureClientMessage[] = [];
  const listeners = new Set<(event: LinkEvent) => void>();
  let ready = true;
  const explored: [number, number | null][] = [];
  const vision = startNeighbourVision({
    link: {
      send: (message) => {
        if (!ready) return false;
        sent.push(message);
        return true;
      },
      isReady: () => ready,
      listen: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    onExplored: (mapKey, bits) => explored.push([mapKey, bits ? (bits[0] ?? 0) : null]),
    nextRequestId: createRequestIds(100),
  });
  const emit = (event: LinkEvent): void => {
    for (const listener of listeners) listener(event);
  };
  const message = (body: FeatureServerMessage): void => emit({ kind: "message", message: body, size: 1 });
  const subscribeId = (mapKey: number): number => {
    const found = sent.findLast((item) => item.t === "subscribe" && item.mapKey === mapKey);
    if (!found) throw new Error(`no subscribe for ${mapKey}`);
    return found.id;
  };
  return {
    vision,
    sent,
    explored,
    emit,
    message,
    subscribeId,
    setReady: (on: boolean) => {
      ready = on;
    },
    listeners,
  };
}

describe("이웃 안개 받기", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("바라는 이웃을 구독하고 그 vision을 넘긴다(다른 2차맵 vision은 버린다)", () => {
    const r = rig();
    r.vision.want([11, 12]);
    expect(r.sent.map((item) => [item.t, "mapKey" in item ? item.mapKey : null])).toEqual([
      ["subscribe", 11],
      ["subscribe", 12],
    ]);
    r.message({ t: "vision", mapKey: 11, explored: exploredText(7) });
    r.message({ t: "vision", mapKey: 99, explored: exploredText(5) });
    expect(r.explored).toEqual([[11, 7]]);
  });

  it("상한(3장)까지만, 빠진 이웃은 푼다", () => {
    const r = rig();
    r.vision.want([1, 2, 3, 4]);
    expect(r.sent.filter((item) => item.t === "subscribe")).toHaveLength(MAX_NEIGHBOUR_SUBSCRIPTIONS);
    r.vision.want([2, 3, 5]);
    expect(r.sent.filter((item) => item.t === "unsubscribe").map((item) => item.mapKey)).toEqual([1]);
    expect(r.subscribeId(5)).toBeGreaterThan(0);
    // 푼 이웃의 vision은 넘기지 않는다
    r.message({ t: "vision", mapKey: 1, explored: exploredText(3) });
    expect(r.explored).toEqual([]);
  });

  it("거절(not_visible)이면 어둡게(null), 바쁨이면 잠시 뒤 다시", () => {
    const r = rig();
    r.vision.want([21, 22]);
    r.message({ t: "result", id: r.subscribeId(21), ok: false, code: "not_visible" });
    expect(r.explored).toEqual([[21, null]]);
    const first = r.subscribeId(22);
    r.message({ t: "result", id: first, ok: false, code: "busy" });
    expect(r.explored).toEqual([[21, null]]);
    vi.advanceTimersByTime(5_000);
    expect(r.subscribeId(22)).not.toBe(first);
  });

  it("연결이 다시 맺어지면 다시 구독, 멈추면 모두 푼다", () => {
    const r = rig();
    r.vision.want([31]);
    r.emit({ kind: "down" });
    r.emit({ kind: "ready" });
    expect(r.sent.filter((item) => item.t === "subscribe")).toHaveLength(2);
    r.vision.stop();
    expect(r.sent.at(-1)).toMatchObject({ t: "unsubscribe", mapKey: 31 });
    expect(r.listeners.size).toBe(0);
  });
});
