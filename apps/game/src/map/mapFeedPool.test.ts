// 2차맵 자료 흐름 모음(mapFeedPool.ts): 흐름을 살려 두고 받는 쪽만 바꾼다(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)")
import type { TerrainInput } from "@terra/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAP,
  TERRAIN,
  URL_V1,
  fakeEngine,
  fakeLink,
  paths,
  settle,
  snapshot,
  unit,
} from "./feedTestSupport.ts";
import type { FeedStatus } from "./feedTypes.ts";
import { createRequestIds } from "./mapFeed.ts";
import { type ChannelTarget, createMapFeedPool } from "./mapFeedPool.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(options: { maxChannels?: number } = {}) {
  const net = fakeLink();
  net.up();
  const fetchTerrain = vi.fn(async (_url: string): Promise<TerrainInput> => TERRAIN);
  let observe = false;
  const pool = createMapFeedPool({
    link: net.link,
    fetchTerrain,
    canCommand: () => false,
    observe: () => observe,
    now: () => Date.now(),
    serverNow: () => 10_050,
    nextRequestId: createRequestIds(100),
    ...(options.maxChannels === undefined ? {} : { maxChannels: options.maxChannels }),
  });
  /** 구독 답 + 스냅샷을 넣는다 */
  const live = async (rev: number, units = [unit(1)]): Promise<void> => {
    const id = net.of("subscribe").at(-1)?.id ?? -1;
    net.receive({ t: "result", id, ok: true });
    for (const part of snapshot({ rev, units })) net.receive(part);
    await settle();
  };
  const target = (engine = fakeEngine()) => {
    const statuses: FeedStatus[] = [];
    const terrains: string[] = [];
    const sink: ChannelTarget = {
      ...engine.sink,
      onStatus: (status) => statuses.push(status),
      onTerrain: (url) => terrains.push(url),
    };
    return { engine, sink, statuses, terrains };
  };
  return {
    net,
    pool,
    fetchTerrain,
    live,
    target,
    setObserve: (value: boolean) => {
      observe = value;
    },
  };
}

describe("자료 흐름 모음", () => {
  it("흐름을 열면 구독하고, 받는 쪽 없이도 받아 기억했다가 붙이면 그대로 넣는다(다시 구독하지 않는다)", async () => {
    const { net, pool, live, target } = setup();
    const channel = pool.open(MAP);
    expect(channel).not.toBeNull();
    expect(net.of("subscribe").map((message) => message.mapKey)).toEqual([MAP]);
    await live(5, [unit(1), unit(2)]);
    net.receive(paths(5, 6, [unit(2, { path: [9 * 1024, 9 * 1024] })]));
    const first = target();
    channel?.attach(first.sink);
    expect(first.engine.state.units.map((spawn) => spawn.id)).toEqual([1, 2]);
    expect(first.engine.state.paths.get(2)?.points[0]).toBe(9);
    expect(first.statuses.at(-1)?.phase.kind).toBe("live");
    expect(first.terrains).toEqual([URL_V1]);
    // 지형 그리기(setTerrain)는 붙일 때 다시 하지 않는다(엔진이 이미 그리고 있다)
    expect(first.engine.state.terrains).toEqual([]);
    // 받는 쪽을 바꾼다: 새 받는 쪽에 같은 것, 앞 받는 쪽에는 더 넣지 않는다
    const second = target();
    channel?.attach(second.sink);
    net.receive(paths(6, 7, [unit(1, { path: [3 * 1024, 3 * 1024] })]));
    expect(second.engine.state.units.map((spawn) => spawn.id)).toEqual([1, 2]);
    expect(second.engine.state.paths.get(1)?.points[0]).toBe(3);
    expect(first.engine.state.paths.get(1)?.points[0]).not.toBe(3);
    expect(net.of("subscribe").length).toBe(1);
    expect(pool.open(MAP)).toBe(channel);
  });

  it("붙인 채 받으면 지형을 그리는 쪽에 넘기고, 탐사 칸(vision)도 기억한다", async () => {
    const { net, pool, live, target } = setup();
    const first = target();
    const channel = pool.open(MAP);
    channel?.attach(first.sink);
    await live(1);
    expect(first.engine.state.terrains).toEqual([TERRAIN]);
    expect(channel?.terrain()).toEqual({ url: URL_V1, terrain: TERRAIN });
    net.receive({ t: "vision", mapKey: MAP, explored: btoa("\u0001") });
    const second = target();
    channel?.attach(second.sink);
    expect(second.engine.state.explored?.[0]).toBe(1);
  });

  it("keep: 남길 2차맵 밖의 흐름은 닫는다(구독 해제). 상한을 넘으면 열지 않는다", async () => {
    const { net, pool } = setup({ maxChannels: 2 });
    pool.open(MAP);
    pool.open(MAP + 1);
    expect(pool.open(MAP + 2)).toBeNull();
    pool.keep([MAP + 1]);
    expect(pool.keys()).toEqual([MAP + 1]);
    expect(net.of("unsubscribe").map((message) => message.mapKey)).toEqual([MAP]);
    expect(pool.open(MAP + 2)).not.toBeNull();
    pool.stop();
    expect(pool.keys()).toEqual([]);
    expect(pool.open(MAP)).toBeNull();
  });

  it("refresh: 모든 흐름을 다시 구독한다(전체 보기 켬)", async () => {
    const { net, pool, live, setObserve } = setup();
    pool.open(MAP);
    await live(1);
    setObserve(true);
    await vi.advanceTimersByTimeAsync(1_500);
    pool.refresh();
    await vi.advanceTimersByTimeAsync(1_500);
    expect(net.of("subscribe").at(-1)).toMatchObject({ mapKey: MAP, observe: true });
  });

  it("지형 파일은 주소마다 한 번만 받고, 실패는 기억하지 않는다", async () => {
    const { pool, fetchTerrain } = setup();
    const [a, b] = await Promise.all([pool.loadTerrain("/t?v=1"), pool.loadTerrain("/t?v=1")]);
    expect(a).toBe(b);
    expect(fetchTerrain).toHaveBeenCalledTimes(1);
    fetchTerrain.mockRejectedValueOnce(new Error("offline"));
    await expect(pool.loadTerrain("/u?v=1")).rejects.toThrow("offline");
    await expect(pool.loadTerrain("/u?v=1")).resolves.toBe(TERRAIN);
  });
});
