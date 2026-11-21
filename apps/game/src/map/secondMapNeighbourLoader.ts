// 이웃 2차맵 지형 받기 — 카메라가 경계에 다가오면 그쪽 이웃 지형을 받아 엔진에 넘긴다(secondMapNeighbours.ts의 규칙).
// React와 상관없다(화면이 엔진 onView에서 부른다, 프레임마다 불려도 가볍다: 새로 받을 이웃이 있을 때만 일한다).
// 받은 이웃은 그 2차맵을 떠날 때까지 둔다(많아야 8장, 한 장 약 50KB gzip). 지금 2차맵 지형의 판 표지가 바뀌면 처음부터 다시 받는다.
// 미리 받기("바뀜 (2026-11-11)"): 멀리 보면 받기 시작하는 거리를 넓히고(onView의 marginM — secondMapNeighbours.ts nearMarginM), 기준 유닛이
// 가는 쪽 이웃은 카메라와 상관없이 받는다(want — 운영자 100배처럼 변까지 몇 초 안에 닿을 때).
import type { NeighbourTerrain, TerrainInput } from "@terra/engine";
import {
  type NeighbourSpot,
  neighbourSpots,
  neighbourTerrainUrl,
  terrainVersionOf,
  wantedDirections,
} from "./secondMapNeighbours.ts";

/** 못 받은 이웃을 다시 바랄 수 있게 되기까지(ms)와 다시 해 보는 횟수 상한(사용자 지적 2026-11-21 회색 2차맵 — 전에는 다시 묻지 않았다) */
export const NEIGHBOUR_RETRY_MS = 8_000;
export const NEIGHBOUR_TRIES = 3;

export interface NeighbourLoaderOptions {
  mapKey: number;
  /** true면 지금 2차맵 지형이 오자마자 이웃을 모두 받는다(개발자 3×3 이어 보기) */
  all: boolean;
  setNeighbours: (list: readonly NeighbourTerrain[]) => Promise<void>;
  fetchTerrain: (url: string) => Promise<TerrainInput>;
  /** 받은 이웃 수가 바뀌었을 때 */
  onChange?: (loaded: number) => void;
  /**
   * 카메라 쪽 이웃(변 이웃 먼저, 많아야 3장 — all이어도 카메라 쪽만)이 바뀌었을 때. 이웃 안개 구독(neighbourVision.ts)이 쓴다
   * (docs/adr/2026-11-08-seamless-second-map.md WP-3)
   */
  onNear?: (mapKeys: readonly number[]) => void;
  /**
   * 옆 2차맵으로 넘어온 뒤(엔진 rebase) 이미 가진 지형(2차맵 키 → 지형, 옛 2차맵 포함). 이 2차맵의 이웃이면 받지 않고 처음부터 받은 것으로 둔다
   * (엔진에 같은 id로 이미 놓여 있다 — 다시 만들지 않는다, docs/adr/2026-11-08-seamless-second-map.md WP-3)
   */
  seed?: ReadonlyMap<number, TerrainInput> | null;
}

export interface NeighbourLoader {
  /** 지금 2차맵 지형을 받았을 때: 그 주소(판 표지)와 2차맵 변 길이(m) */
  setMain(url: string, mapSizeM: number): void;
  /** 카메라 목표점(m)이 바뀌었을 때. marginM = 이웃을 받기 시작하는 거리(없으면 변의 NEAR_EDGE) */
  onView(targetX: number, targetZ: number, marginM?: number): void;
  /** 카메라와 상관없이 받아 둘 이웃(기준 유닛이 가는 쪽). 지금 2차맵의 이웃이 아니면 무시한다 */
  want(mapKeys: readonly number[]): void;
  /** 받은 이웃 지형(2차맵 키 → 지형) — 옆 2차맵으로 넘을 때 다음 받기에 넘긴다 */
  terrains(): Map<number, TerrainInput>;
  stop(): void;
}

export function createNeighbourLoader(options: NeighbourLoaderOptions): NeighbourLoader {
  const spots = neighbourSpots(options.mapKey);
  const loaded = new Map<number, NeighbourTerrain>();
  const requested = new Set<number>();
  /** 이웃마다 받기 시도 수(실패해도 NEIGHBOUR_TRIES까지는 NEIGHBOUR_RETRY_MS 뒤 다시 바랄 수 있다) */
  const tries = new Map<number, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let mainUrl: string | null = null;
  let mapSizeM = 0;
  let generation = 0;
  let stopped = false;
  // 처음 알림은 빈 목록이어도 보낸다(넘어온 직후 붙여 둔 흐름을 카메라 쪽 것으로 맞춘다)
  let nearKey: string | null = null;
  let extra: readonly number[] = [];

  const request = (spot: NeighbourSpot): void => {
    if (!mainUrl || requested.has(spot.key)) return;
    const url = neighbourTerrainUrl(mainUrl, spot.key);
    if (!url) return;
    requested.add(spot.key);
    tries.set(spot.key, (tries.get(spot.key) ?? 0) + 1);
    const mine = generation;
    options
      .fetchTerrain(url)
      .then(async (terrain) => {
        if (stopped || mine !== generation) return;
        loaded.set(spot.key, { id: String(spot.key), terrain, placement: spot.placement });
        await options.setNeighbours([...loaded.values()]);
        options.onChange?.(loaded.size);
      })
      .catch(() => {
        // 못 받은 이웃은 그리지 않는다(볼 수 없는 이웃·네트워크). 잠시 뒤 다시 바랄 수 있게 한다(다음 onView·want가 다시 받는다)
        if (stopped || mine !== generation || (tries.get(spot.key) ?? 0) >= NEIGHBOUR_TRIES) return;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!stopped && mine === generation) requested.delete(spot.key);
        }, NEIGHBOUR_RETRY_MS);
        timers.add(timer);
      });
  };

  const want = (targetX: number, targetZ: number, marginM?: number): void => {
    if (!mainUrl || stopped) return;
    const wanted = wantedDirections(targetX, targetZ, mapSizeM, marginM);
    if (options.onNear) {
      const near = wanted.flatMap((direction) => {
        const spot = spots.find((item) => `${item.ox},${item.oy}` === direction);
        return spot ? [spot.key] : [];
      });
      const key = near.join(",");
      if (key !== nearKey) {
        nearKey = key;
        options.onNear(near);
      }
    }
    const directions = new Set(options.all ? spots.map((spot) => `${spot.ox},${spot.oy}`) : wanted);
    for (const spot of spots)
      if (directions.has(`${spot.ox},${spot.oy}`) || extra.includes(spot.key)) request(spot);
  };

  return {
    setMain(url, size) {
      const first = mainUrl === null;
      const changed = first || terrainVersionOf(url) !== terrainVersionOf(mainUrl ?? "");
      mainUrl = url;
      mapSizeM = size;
      if (changed) {
        generation += 1;
        requested.clear();
        tries.clear();
        if (loaded.size > 0) {
          loaded.clear();
          void options.setNeighbours([]);
          options.onChange?.(0);
        }
      }
      // 넘어온 2차맵: 엔진에 이미 놓인 이웃은 받은 것으로 둔다(같은 판 표지 — 같은 서버 지형)
      if (first && options.seed) {
        for (const spot of spots) {
          const terrain = options.seed.get(spot.key);
          if (!terrain) continue;
          loaded.set(spot.key, { id: String(spot.key), terrain, placement: spot.placement });
          requested.add(spot.key);
        }
        if (loaded.size > 0) {
          void options.setNeighbours([...loaded.values()]);
          options.onChange?.(loaded.size);
        }
      }
      for (const spot of spots) if (extra.includes(spot.key)) request(spot);
      if (options.all) want(size / 2, size / 2);
    },
    onView: want,
    want(mapKeys) {
      extra = mapKeys;
      if (!mainUrl || stopped) return;
      for (const spot of spots) if (extra.includes(spot.key)) request(spot);
    },
    terrains: () => new Map([...loaded].map(([key, item]) => [key, item.terrain])),
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
