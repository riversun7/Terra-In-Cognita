// 다시보기 경기장 = 월드 시험 2차맵 구역 — docs/adr/2026-11-01-battle-replay.md 3절.
// 시험 2차맵(S1_TEST_MAP_KEY)의 배치 칸 지형 비용·지형 파일(TCTR: 꼭짓점 높이·엄폐 층)에서 sim arenaFromSecondMap으로 전투맵을 만든다.
// 지형 판 표지마다 한 번 만들어 기억한다(지형은 판 표지가 같으면 내용이 같다). 월드·2차맵이 없으면 null(빈 평지를 쓴다).
// 전투 실험실(work/battle-lab)도 같은 경기장을 쓸 수 있다(createArenaSource).
import { decodeTerrain } from "@terra/protocol";
import type { ReplayArenaRef } from "@terra/protocol/battleReplay";
import { type BattleMapInput, arenaFromSecondMap, pickArenaOrigin } from "@terra/sim";

/** 경기장 한 변(일반 전투맵 64, 49 C3) */
export const ARENA_SIZE = 64;

/** 경기장이 읽는 2차맵(월드 SecondMap의 일부) */
export interface ArenaMapSource {
  readonly mapKey: number;
  readonly terrainVersion: string;
  /** 배치 칸 지형 비용 256² */
  costs(): Uint16Array;
  /** 지형 이진 파일(TCTR) */
  terrainFile(): Uint8Array;
}

export interface ArenaPick {
  readonly map: BattleMapInput;
  readonly ref: ReplayArenaRef;
}

/** 빈 평지(월드가 없을 때·시험) */
export function plainArena(size = ARENA_SIZE): BattleMapInput {
  const cells = size * size;
  return {
    size,
    passable: new Uint8Array(cells).fill(1),
    cover: new Uint8Array(cells),
    height: new Int32Array(cells),
    buildings: [],
  };
}

/** 2차맵 → 경기장(원점은 pickArenaOrigin). 지형 파일에 엄폐 층이 없으면(S1 임시 지형) 엄폐 없음 */
export function arenaOf(source: ArenaMapSource, size = ARENA_SIZE): ArenaPick {
  const terrain = decodeTerrain(source.terrainFile());
  const costs = source.costs();
  const placement = Math.round(Math.sqrt(costs.length));
  const layers = {
    size: placement,
    costs,
    cover: terrain.cover && terrain.placementSize === placement ? terrain.cover : null,
    terrainSize: terrain.terrainSize,
    vertexHeightsCm: terrain.heights,
  };
  const origin = pickArenaOrigin(layers, size);
  return {
    map: arenaFromSecondMap(layers, origin, size),
    ref: {
      mapKey: source.mapKey,
      terrainVersion: source.terrainVersion,
      originX: origin.x,
      originY: origin.y,
    },
  };
}

/** 지형 판 표지마다 한 번 만드는 경기장. map()이 undefined면 null */
export function createArenaSource(map: () => ArenaMapSource | undefined): () => ArenaPick | null {
  let cached: { version: string; mapKey: number; pick: ArenaPick } | null = null;
  return () => {
    const source = map();
    if (!source) return null;
    if (cached && cached.version === source.terrainVersion && cached.mapKey === source.mapKey)
      return cached.pick;
    const pick = arenaOf(source);
    cached = { version: source.terrainVersion, mapKey: source.mapKey, pick };
    return pick;
  };
}
