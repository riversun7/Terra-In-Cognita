// 다시보기 지형 — 경기장 참조가 있으면 그 2차맵 지형 파일을 받고(terrainPath, 브라우저 캐시), 없으면 통과·엄폐 층으로 평지를 만든다.
// docs/adr/2026-11-01-battle-replay.md 3·7절. 돌려주는 원점 = 전투맵 (0, 0)이 놓인 2차맵 배치 칸(엔진 좌표 = 원점 + 전투맵 칸).
import type { TerrainInput } from "@terra/engine";
import { terrainPath } from "@terra/protocol";
import type { ReplayArena } from "@terra/protocol/battleReplay";
import { mapPropArtCode } from "@terra/shared";
import { fetchTerrain } from "../map/terrainLoader.ts";

/** 2차맵 격자(엔진 terrainData.ts와 같다) */
const TERRAIN_CELLS = 128;
const PLACEMENT_CELLS = 256;
/** 평지 지형 칸 한 변(m, 2차맵 평균) */
const PLAIN_CELL_M = 11.7;
const SURFACE_GRASS = 1;
const SURFACE_ROCK = 3;

export interface ReplayGround {
  readonly terrain: TerrainInput;
  readonly originX: number;
  readonly originY: number;
}

/** 평지: 2차맵 가운데에 경기장을 놓고, 막힌 칸은 바위 지표·큰 바위 소품, 수풀은 덤불 소품 */
export function plainGround(arena: ReplayArena): ReplayGround {
  const origin = Math.max(0, Math.floor((PLACEMENT_CELLS - arena.size) / 2));
  const surface = new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS).fill(SURFACE_GRASS);
  const cover = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
  const art = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
  const bush = Math.max(0, mapPropArtCode("bush"));
  const boulder = Math.max(0, mapPropArtCode("boulder"));
  for (let y = 0; y < arena.size; y++) {
    for (let x = 0; x < arena.size; x++) {
      const cell = y * arena.size + x;
      const placement = (origin + y) * PLACEMENT_CELLS + origin + x;
      const blocked = arena.passable[cell] !== 1;
      const value = arena.cover[cell] ?? 0;
      cover[placement] = blocked ? 2 : value;
      art[placement] = blocked ? boulder : value === 1 ? bush : 0;
      if (blocked) surface[((origin + y) >> 1) * TERRAIN_CELLS + ((origin + x) >> 1)] = SURFACE_ROCK;
    }
  }
  return {
    terrain: {
      heights: new Int16Array((TERRAIN_CELLS + 1) * (TERRAIN_CELLS + 1)),
      surface,
      baseHeightM: 0,
      cellSizeM: PLAIN_CELL_M,
      waterLevelM: -1000,
      art,
      cover,
    },
    originX: origin,
    originY: origin,
  };
}

/** 경기장 지형: 참조가 있으면 그 지형 파일, 없으면 평지. 받기 실패는 TerrainLoadError(화면이 이유 코드로 문구를 고른다) */
export async function loadReplayGround(arena: ReplayArena): Promise<ReplayGround> {
  if (!arena.ref) return plainGround(arena);
  const terrain = await fetchTerrain(terrainPath(arena.ref.mapKey, arena.ref.terrainVersion));
  return { terrain, originX: arena.ref.originX, originY: arena.ref.originY };
}
