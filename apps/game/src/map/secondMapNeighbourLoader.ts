// 이웃 2차맵 지형 받기 — 카메라가 경계에 다가오면 그쪽 이웃 지형을 받아 엔진에 넘긴다(secondMapNeighbours.ts의 규칙).
// React와 상관없다(화면이 엔진 onView에서 부른다, 프레임마다 불려도 가볍다: 새로 받을 이웃이 있을 때만 일한다).
// 받은 이웃은 그 2차맵을 떠날 때까지 둔다(많아야 8장, 한 장 약 50KB gzip). 지금 2차맵 지형의 판 표지가 바뀌면 처음부터 다시 받는다.
import type { NeighbourTerrain, TerrainInput } from "@terra/engine";
import {
  type NeighbourSpot,
  neighbourSpots,
  neighbourTerrainUrl,
  terrainVersionOf,
  wantedDirections,
} from "./secondMapNeighbours.ts";

export interface NeighbourLoaderOptions {
  mapKey: number;
  /** true면 지금 2차맵 지형이 오자마자 이웃을 모두 받는다(개발자 3×3 이어 보기) */
  all: boolean;
  setNeighbours: (list: readonly NeighbourTerrain[]) => Promise<void>;
  fetchTerrain: (url: string) => Promise<TerrainInput>;
  /** 받은 이웃 수가 바뀌었을 때 */
  onChange?: (loaded: number) => void;
}

export interface NeighbourLoader {
  /** 지금 2차맵 지형을 받았을 때: 그 주소(판 표지)와 2차맵 변 길이(m) */
  setMain(url: string, mapSizeM: number): void;
  /** 카메라 목표점(m)이 바뀌었을 때 */
  onView(targetX: number, targetZ: number): void;
  stop(): void;
}

export function createNeighbourLoader(options: NeighbourLoaderOptions): NeighbourLoader {
  const spots = neighbourSpots(options.mapKey);
  const loaded = new Map<number, NeighbourTerrain>();
  const requested = new Set<number>();
  let mainUrl: string | null = null;
  let mapSizeM = 0;
  let generation = 0;
  let stopped = false;

  const request = (spot: NeighbourSpot): void => {
    if (!mainUrl || requested.has(spot.key)) return;
    const url = neighbourTerrainUrl(mainUrl, spot.key);
    if (!url) return;
    requested.add(spot.key);
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
        // 못 받은 이웃은 그리지 않는다(볼 수 없는 이웃·네트워크). 다음 판 표지에서 다시 해 본다
      });
  };

  const want = (targetX: number, targetZ: number): void => {
    if (!mainUrl || stopped) return;
    const directions = new Set(
      options.all
        ? spots.map((spot) => `${spot.ox},${spot.oy}`)
        : wantedDirections(targetX, targetZ, mapSizeM),
    );
    for (const spot of spots) if (directions.has(`${spot.ox},${spot.oy}`)) request(spot);
  };

  return {
    setMain(url, size) {
      const changed = mainUrl === null || terrainVersionOf(url) !== terrainVersionOf(mainUrl);
      mainUrl = url;
      mapSizeM = size;
      if (changed) {
        generation += 1;
        requested.clear();
        if (loaded.size > 0) {
          loaded.clear();
          void options.setNeighbours([]);
          options.onChange?.(0);
        }
      }
      if (options.all) want(size / 2, size / 2);
    },
    onView: want,
    stop() {
      stopped = true;
    },
  };
}
