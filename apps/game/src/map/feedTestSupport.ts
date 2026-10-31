// 2차맵 자료 받기 시험 도우미 — 가짜 통로(serverLink 모양)·가짜 엔진, 서버 메시지 만들기, 자료 받기 켜기(setup)
// 시험 파일(*.test.ts)만 쓴다. 화면 코드는 가져오지 않는다.
import type { BuildingFootprint, TerrainInput, UnitPath, UnitSpawn } from "@terra/engine";
import type { BuildingWire, ServerMessageOf, UnitMotionWire } from "@terra/protocol";
import { vi } from "vitest";
import type { FeatureClientMessage, FeatureServerMessage, LinkEvent } from "../net/serverLink.ts";
import type { CommandOutcome, CommandReport, FeedSink, FeedStatus, MapFeedOptions } from "./feedTypes.ts";
import { createRequestIds, startMapFeed } from "./mapFeed.ts";

export const MAP = 2 ** 48 + 9;
export const URL_V1 = `/api/maps/${MAP}/terrain?v=1`;
export const URL_V2 = `/api/maps/${MAP}/terrain?v=2`;
export const TERRAIN: TerrainInput = {
  heights: new Int16Array(129 * 129),
  surface: new Uint8Array(128 * 128),
  baseHeightM: 0,
  cellSizeM: 11.72,
  waterLevelM: 0,
};
/** 끝난 약속·아무것도 하지 않는 함수(가짜 엔진·지형의 기본값) */
export const resolved = (): Promise<void> => Promise.resolve();
export const ignore = (): void => undefined;
/** 조각 목록의 i번째(없으면 시험 실패) */
export function partAt(
  parts: ServerMessageOf<"map_snapshot">[],
  index: number,
): ServerMessageOf<"map_snapshot"> {
  const part = parts[index];
  if (!part) throw new Error(`no snapshot part ${index}`);
  return part;
}

export const unit = (id: number, overrides: Partial<UnitMotionWire> = {}): UnitMotionWire => ({
  id,
  size: 1,
  speed: 437,
  departAtMs: 10_000,
  path: [id * 1024 + 512, 512, id * 1024 + 512, 4096],
  ...overrides,
});
export const building = (id: number): BuildingWire => ({
  id,
  x: id * 4,
  y: 8,
  width: 2,
  height: 3,
  rotation: 90,
});

export function snapshot(options: {
  rev: number;
  units?: UnitMotionWire[];
  buildings?: BuildingWire[];
  parts?: number;
  snapshotId?: number;
  url?: string;
}): ServerMessageOf<"map_snapshot">[] {
  const units = options.units ?? [];
  const parts = options.parts ?? 1;
  const per = Math.ceil(units.length / parts);
  return Array.from({ length: parts }, (_, part) => ({
    t: "map_snapshot",
    mapKey: MAP,
    snapshotId: options.snapshotId ?? 1,
    part,
    parts,
    rev: options.rev,
    serverTime: 9_000,
    terrain: { url: options.url ?? URL_V1, generatorVersion: 1 },
    units: units.slice(part * per, (part + 1) * per),
    buildings: part === parts - 1 ? (options.buildings ?? []) : [],
  }));
}
export const paths = (
  fromRev: number,
  rev: number,
  units: UnitMotionWire[],
): ServerMessageOf<"unit_paths"> => ({
  t: "unit_paths",
  mapKey: MAP,
  fromRev,
  rev,
  units,
});

export function fakeLink() {
  const listeners = new Set<(event: LinkEvent) => void>();
  const sent: FeatureClientMessage[] = [];
  let ready = false;
  const emit = (event: LinkEvent): void => {
    for (const listener of listeners) listener(event);
  };
  const link = {
    send: (message: FeatureClientMessage) => {
      if (!ready) return false;
      sent.push(message);
      return true;
    },
    isReady: () => ready,
    listen: (listener: (event: LinkEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // 진짜 연결처럼: 끊김을 알리고 나중에 다시 준비된다(up)
    reconnect: vi.fn(() => {
      ready = false;
      emit({ kind: "down" });
    }),
  };
  return {
    link,
    sent,
    listeners,
    up() {
      ready = true;
      emit({ kind: "ready" });
    },
    down() {
      ready = false;
      emit({ kind: "down" });
    },
    receive(message: FeatureServerMessage, size = JSON.stringify(message).length) {
      emit({ kind: "message", message, size });
    },
    of<T extends FeatureClientMessage["t"]>(t: T) {
      return sent.filter((message): message is Extract<FeatureClientMessage, { t: T }> => message.t === t);
    },
  };
}

export function fakeEngine() {
  const state = {
    units: [] as UnitSpawn[],
    paths: new Map<number, UnitPath>(),
    buildings: [] as BuildingFootprint[],
    /** 안개(탐사 칸). undefined = 받은 적 없음, null = 끔 */
    explored: undefined as Uint8Array | null | undefined,
    selected: null as number | null,
    setUnitsCalls: 0,
    pathCalls: 0,
    terrains: [] as TerrainInput[],
  };
  let terrainResult: () => Promise<void> = resolved;
  const sink: FeedSink = {
    setTerrain: (input) => {
      state.terrains.push(input);
      return terrainResult();
    },
    setUnits: (units) => {
      state.units = [...units];
      state.paths.clear();
      state.selected = null;
      state.setUnitsCalls += 1;
    },
    setUnitPath: (id, path) => {
      state.pathCalls += 1;
      if (state.units.some((spawn) => spawn.id === id)) state.paths.set(id, path);
    },
    setBuildings: (buildings) => {
      state.buildings = [...buildings];
    },
    setExplored: (bits) => {
      state.explored = bits;
    },
    select: (id) => {
      state.selected = id;
    },
    selected: () => state.selected,
  };
  return {
    sink,
    state,
    failTerrain() {
      terrainResult = () => Promise.reject(new Error("mesh failed"));
    },
  };
}

/** 약속(지형 받기 등)이 끝나게 둔다 */
export async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

export interface SetupOptions {
  ready?: boolean;
  admin?: boolean;
  /** 전체 보기로 구독(시야 전송) */
  observe?: boolean;
  capacity?: number;
  loadTerrain?: MapFeedOptions["loadTerrain"];
}

export function setup(options: SetupOptions = {}) {
  const net = fakeLink();
  const engine = fakeEngine();
  const statuses: FeedStatus[] = [];
  const reports: CommandReport[] = [];
  const loadTerrain = vi.fn(options.loadTerrain ?? (async () => TERRAIN));
  let admin = options.admin ?? true;
  let observe = options.observe ?? false;
  const devSpawns: CommandOutcome[] = [];
  let serverClock = 10_050;
  if (options.ready ?? true) net.up();
  const feed = startMapFeed({
    link: net.link,
    mapKey: MAP,
    sink: engine.sink,
    loadTerrain,
    canCommand: () => admin,
    observe: () => observe,
    onDevSpawn: (outcome) => devSpawns.push(outcome),
    now: () => Date.now(),
    serverNow: () => serverClock,
    nextRequestId: createRequestIds(100),
    ...(options.capacity === undefined ? {} : { unitCapacity: options.capacity }),
    onStatus: (status) => statuses.push(status),
    onCommand: (report) => reports.push(report),
  });
  const subscribeIds = () => net.of("subscribe").map((message) => message.id);
  const lastSubscribeId = () => subscribeIds().at(-1) ?? -1;
  return {
    net,
    engine,
    feed,
    statuses,
    reports,
    loadTerrain,
    subscribeIds,
    setAdmin: (value: boolean) => {
      admin = value;
    },
    setObserve: (value: boolean) => {
      observe = value;
    },
    devSpawns,
    setServerClock: (value: number) => {
      serverClock = value;
    },
    /** 지금 구독에 ok를 주고 스냅샷 조각을 보낸다 */
    live: async (parts: ServerMessageOf<"map_snapshot">[]) => {
      net.receive({ t: "result", id: lastSubscribeId(), ok: true });
      for (const part of parts) net.receive(part);
      await settle();
    },
  };
}
