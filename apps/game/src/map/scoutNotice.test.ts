// 정찰 끝 화면 알림 도우미 시험(기획 답 612 나, docs/adr/2026-11-07-play-flow.md "WP13") — 돌아선 정찰만 고르고, 아직 닿지 않은 정찰이 있으면 계속
// 묻고, 알린 길은 기기에 기억한다(저장소가 막혀도 넘어간다)
import type { WorldTravel } from "@terra/shared/worldMap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSeenScouts, rememberScout, scoutPending, scoutTurns } from "./scoutNotice.ts";

function travel(overrides: Partial<WorldTravel>): WorldTravel {
  return {
    unitId: 5,
    kind: "scout",
    route: [1, 2],
    leg: 0,
    mapKey: 1,
    cellX: 0,
    cellY: 0,
    latDeg: 0,
    lonDeg: 0,
    targetX: 0,
    targetY: 0,
    startedAt: 1_000,
    arriveAt: 2_000,
    state: "going",
    stop: null,
    returning: false,
    scoutedMapKey: null,
    hidden: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("정찰 끝 알림", () => {
  it("돌아선 정찰만(돌아오는 중·돌아옴), 열쇠 = 유닛·보낸 시각", () => {
    expect(
      scoutTurns([
        travel({ unitId: 5 }),
        travel({ unitId: 6, returning: true, scoutedMapKey: 77 }),
        travel({ unitId: 7, kind: "move", state: "arrived" }),
        travel({ unitId: 8, state: "arrived", returning: true, scoutedMapKey: 78, startedAt: 9 }),
      ]),
    ).toEqual([
      { key: "6:1000", unitId: 6, mapKey: 77 },
      { key: "8:9", unitId: 8, mapKey: 78 },
    ]);
  });

  it("목표에 닿기 전인 정찰이 있을 때만 계속 묻는다", () => {
    expect(scoutPending([travel({})])).toBe(true);
    expect(scoutPending([travel({ returning: true, scoutedMapKey: 2 })])).toBe(false);
    expect(scoutPending([travel({ kind: "move" })])).toBe(false);
    expect(scoutPending([travel({ state: "stopped" })])).toBe(false);
  });

  it("알린 길을 기억한다(최근 20개), 저장소가 막혀도 실패하지 않는다", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    let seen = readSeenScouts();
    expect(seen).toEqual([]);
    for (let i = 0; i < 25; i++) seen = rememberScout(seen, `k${i}`);
    expect(readSeenScouts()).toHaveLength(20);
    expect(readSeenScouts().at(-1)).toBe("k24");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readSeenScouts()).toEqual([]);
    expect(rememberScout([], "x")).toEqual(["x"]);
  });
});
