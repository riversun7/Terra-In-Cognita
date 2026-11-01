// 전투장 지형을 월드에서 가져온다 — 지형 서비스(행성 값에서 만든 2차맵)가 있으면 S1 시험 2차맵·시험 자리 종류의 지형 파일을 풀어
// 쓰고, 없으면(시험·행성 없는 개발 서버) 월드와 같은 S1 임시 지형(@terra/sim generateTempTerrain)을 쓴다.
// docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 4절. 지형 파일 하나를 푸는 것은 수 ms(256² 엄폐 + 129² 높이)다.
import { decodeTerrain } from "@terra/protocol";
import { type TerrainLayers, generateTempTerrain, seedFromCellKey } from "@terra/sim";
import type { TerrainService } from "../world/terrainService.ts";
import { type ArenaPreset, type ArenaTerrains, createArenaTerrains } from "./terrain.ts";

async function layersOf(terrain: TerrainService, mapKey: number): Promise<TerrainLayers> {
  const data = decodeTerrain((await terrain.get(mapKey)).file().raw);
  return { heights: data.heights, surface: data.surface, cover: data.cover };
}

export function worldArenaTerrains(deps: {
  readonly testMapKey: number;
  readonly terrain?: TerrainService | undefined;
  /** 시험 자리 종류 → 2차맵 키(없으면 null). 개발자 2차맵 시험과 같은 찾기(src/world/secondMapLab.ts) */
  readonly locatePreset?: ((preset: ArenaPreset) => Promise<number | null>) | undefined;
}): ArenaTerrains {
  const { terrain, locatePreset } = deps;
  return createArenaTerrains({
    test: () =>
      terrain
        ? layersOf(terrain, deps.testMapKey)
        : Promise.resolve(generateTempTerrain(seedFromCellKey(deps.testMapKey))),
    preset:
      terrain && locatePreset
        ? async (preset) => {
            const mapKey = await locatePreset(preset);
            return mapKey === null ? null : layersOf(terrain, mapKey);
          }
        : undefined,
  });
}
