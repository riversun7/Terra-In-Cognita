// 2차맵 자료 흐름 모음 — 화면 하나가 구독하는 2차맵들(지금 2차맵 + 카메라 쪽 이웃 많아야 3장 = 서버 한 연결 상한 4, gateway.ts
// MAX_MAPS_PER_SOCKET)의 자료 받기(mapFeed.ts)를 2차맵 키로 들고, 옆 2차맵으로 넘어도 살려 둔다. 사용자 지적 2026-11-11 "근처에서 미리 불러와
// 완전히 자연스럽게 연결될순 없는지"(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)").
// - 흐름 하나 = 그 2차맵의 구독·스냅샷·rev 규칙·건물·탐사 칸(mapFeed 그대로). 받은 것은 기억해 두고, 받는 쪽(attach)에 그대로 넘긴다.
//   받는 쪽을 바꾸면 기억한 것(유닛·경로·건물·탐사 칸·지형 알림)을 새 받는 쪽에 다시 넣는다.
// - 넘을 때: 이웃이던 흐름을 지금 2차맵 받는 쪽에 붙이고, 지금 2차맵이던 흐름은 이웃 받는 쪽에 붙인다. 다시 구독하지 않는다 —
//   전에는 넘을 때마다 모두 풀고 다시 구독해서, 새 스냅샷이 올 때까지 유닛이 비고 2차맵마다 구독·지형 받기가 되풀이됐다.
// - 지형 파일은 주소로 한 번만 받는다(loadTerrain — 지금 2차맵 자료와 이웃 지형 받기가 같이 쓴다). 같은 지형 자료 객체를 넘기므로 엔진이
//   이미 그린 지형인지 알아본다(다시 만들지 않는다).
// - 전체 보기(운영자 모드)를 켜고 끄면 모든 흐름을 다시 구독한다(refresh).
import type { BuildingFootprint, TerrainInput, UnitPath, UnitSpawn } from "@terra/engine";
import type { CommandReport, FeedSink, FeedStatus, MapFeed, MapFeedOptions } from "./feedTypes.ts";
import { startMapFeed } from "./mapFeed.ts";

/** 함께 여는 흐름 수(서버 한 연결 상한) */
export const MAX_CHANNELS = 4;
/** 기억해 두는 지형 파일 수(지금 2차맵 + 이웃 8장 + 넘기 전 것 조금) */
const TERRAIN_CACHE = 16;

/** 흐름이 넣는 받는 쪽: 엔진 쪽(FeedSink) + 상태·명령 결과·지형 알림 */
export interface ChannelTarget extends FeedSink {
  onStatus?(status: FeedStatus): void;
  onCommand?(report: CommandReport): void;
  /** 그 2차맵 지형 파일을 받았다(주소와 자료). 붙일 때 이미 받았으면 바로 한 번 */
  onTerrain?(url: string, terrain: TerrainInput): void;
}

export interface MapChannel {
  readonly mapKey: number;
  readonly feed: MapFeed;
  /** 받는 쪽을 바꾼다(null이면 떼어 둔다 — 받은 것은 계속 기억한다). 기억한 것을 새 받는 쪽에 다시 넣는다(지형 그리기 setTerrain은 빼고) */
  attach(target: ChannelTarget | null): void;
  /** 받은 지형(없으면 null) */
  terrain(): { readonly url: string; readonly terrain: TerrainInput } | null;
}

export interface MapFeedPoolOptions
  extends Pick<
    MapFeedOptions,
    "link" | "canCommand" | "observe" | "now" | "serverNow" | "unitCapacity" | "nextRequestId"
  > {
  readonly fetchTerrain: (url: string) => Promise<TerrainInput>;
  /** 함께 여는 흐름 수(기본 MAX_CHANNELS) */
  readonly maxChannels?: number;
}

export interface MapFeedPool {
  /** 그 2차맵 흐름(없으면 구독을 보내고 만든다). 자리가 없으면(상한) null — 먼저 keep으로 줄인다 */
  open(mapKey: number): MapChannel | null;
  get(mapKey: number): MapChannel | undefined;
  /** 열려 있는 2차맵 키 */
  keys(): number[];
  /** 이 2차맵들만 남기고 나머지는 닫는다(구독 해제) */
  keep(mapKeys: readonly number[]): void;
  /** 모든 흐름을 다시 구독한다(전체 보기를 켜고 끌 때) */
  refresh(): void;
  /** 지형 파일(주소마다 한 번만 받는다. 실패는 기억하지 않는다) */
  loadTerrain(url: string): Promise<TerrainInput>;
  /** 모두 닫는다 */
  stop(): void;
}

export function createMapFeedPool(options: MapFeedPoolOptions): MapFeedPool {
  const limit = options.maxChannels ?? MAX_CHANNELS;
  const channels = new Map<number, MapChannel>();
  const terrains = new Map<string, Promise<TerrainInput>>();
  let stopped = false;

  const loadTerrain = (url: string): Promise<TerrainInput> => {
    const known = terrains.get(url);
    if (known) return known;
    const loading = options.fetchTerrain(url);
    terrains.set(url, loading);
    loading.catch(() => {
      if (terrains.get(url) === loading) terrains.delete(url);
    });
    // 오래된 것부터 버린다(넣은 차례)
    for (const key of terrains.keys()) {
      if (terrains.size <= TERRAIN_CACHE) break;
      terrains.delete(key);
    }
    return loading;
  };

  const create = (mapKey: number): MapChannel => {
    let target: ChannelTarget | null = null;
    let spawns: readonly UnitSpawn[] | null = null;
    const paths = new Map<number, UnitPath>();
    let buildings: readonly BuildingFootprint[] | null = null;
    /** 받기 전 undefined, 전체 보기면 null */
    let explored: Uint8Array | null | undefined;
    let terrain: { url: string; terrain: TerrainInput } | null = null;
    const sink: FeedSink = {
      setTerrain: (input) => target?.setTerrain(input) ?? Promise.resolve(),
      setUnits: (list) => {
        spawns = list;
        paths.clear();
        target?.setUnits(list);
      },
      setUnitPath: (id, path) => {
        paths.set(id, path);
        target?.setUnitPath(id, path);
      },
      setBuildings: (list) => {
        buildings = list;
        target?.setBuildings(list);
      },
      setExplored: (bits) => {
        explored = bits;
        target?.setExplored(bits);
      },
      select: (id) => target?.select(id),
      selected: () => target?.selected() ?? null,
    };
    const feed = startMapFeed({
      link: options.link,
      mapKey,
      sink,
      loadTerrain: async (url) => {
        const input = await loadTerrain(url);
        terrain = { url, terrain: input };
        target?.onTerrain?.(url, input);
        return input;
      },
      canCommand: options.canCommand,
      ...(options.observe ? { observe: options.observe } : {}),
      now: options.now,
      serverNow: options.serverNow,
      ...(options.unitCapacity === undefined ? {} : { unitCapacity: options.unitCapacity }),
      ...(options.nextRequestId ? { nextRequestId: options.nextRequestId } : {}),
      onStatus: (status) => target?.onStatus?.(status),
      onCommand: (report) => target?.onCommand?.(report),
    });
    return {
      mapKey,
      feed,
      attach(next) {
        target = next;
        if (!next) return;
        next.onStatus?.(feed.status());
        if (terrain) next.onTerrain?.(terrain.url, terrain.terrain);
        if (spawns) {
          next.setUnits(spawns);
          for (const [id, path] of paths) next.setUnitPath(id, path);
        }
        if (buildings) next.setBuildings(buildings);
        if (explored !== undefined) next.setExplored(explored);
      },
      terrain: () => terrain,
    };
  };

  const close = (mapKey: number): void => {
    const channel = channels.get(mapKey);
    if (!channel) return;
    channels.delete(mapKey);
    channel.attach(null);
    channel.feed.stop();
  };

  return {
    open(mapKey) {
      const known = channels.get(mapKey);
      if (known) return known;
      if (stopped || channels.size >= limit) return null;
      const channel = create(mapKey);
      channels.set(mapKey, channel);
      return channel;
    },
    get: (mapKey) => channels.get(mapKey),
    keys: () => [...channels.keys()],
    keep(mapKeys) {
      // Map은 도는 중에 지나온 항목을 지워도 된다
      for (const key of channels.keys()) if (!mapKeys.includes(key)) close(key);
    },
    refresh() {
      for (const channel of channels.values()) channel.feed.refresh();
    },
    loadTerrain,
    stop() {
      stopped = true;
      for (const key of channels.keys()) close(key);
    },
  };
}
