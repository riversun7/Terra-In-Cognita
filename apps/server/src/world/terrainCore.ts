// 2차맵 지형 만들기 핵심 — 지형 워커(terrainWorker.ts)와 같은 스레드 지형 서비스(시험)가 함께 쓴다.
// 행성 값(TCPV)·소품 규칙을 한 번 받아 들고, 2차맵 키마다 디스크 캐시 → 생성기 차례로 지형 한 장을 만든다.
// 만든 것은 디스크 캐시에 쓴다(실패해도 결과는 돌려준다). 지울 수 있는 TS 문법만 쓴다(워커가 그대로 실행).
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";
import { SECOND_MAP_GENERATOR_VERSION, compileMapProps, decodePlanetValues } from "@terra/planet/secondMap";
import {
  type BuiltTerrain,
  type TerrainVersions,
  buildTerrain,
  terrainFromFile,
  terrainVersionToken,
} from "./mapTerrain.ts";
import {
  TERRAIN_CACHE_SUBDIR,
  pruneTerrainCache,
  readTerrainCache,
  removeTerrainCache,
  terrainCacheFile,
  writeTerrainCache,
} from "./terrainDisk.ts";
import type { TerrainWorkerInit } from "./terrainMessages.ts";

export interface TerrainBuildResult {
  terrain: BuiltTerrain;
  source: "disk" | "generated";
  ms: number;
}

export interface TerrainCore {
  readonly versions: TerrainVersions;
  readonly version: string;
  /** 시작할 때 지운 디스크 캐시 파일 수 */
  readonly pruned: number;
  build(mapKey: number): Promise<TerrainBuildResult>;
}

export async function createTerrainCore(init: Omit<TerrainWorkerInit, "type">): Promise<TerrainCore> {
  const values = decodePlanetValues(init.values);
  const rules = compileMapProps(init.props, values.biomeIds);
  const versions: TerrainVersions = {
    secondMapGeneratorVersion: SECOND_MAP_GENERATOR_VERSION,
    planetGeneratorVersion: init.planetGeneratorVersion,
    definitionHash: init.definitionHash,
    propRulesHash: rules.hash,
  };
  const version = terrainVersionToken(versions);
  const cacheDir = init.cacheDir ? `${init.cacheDir}/${TERRAIN_CACHE_SUBDIR}` : undefined;
  const pruned = cacheDir ? await pruneTerrainCache(cacheDir, init.planetId, version, init.cacheFiles) : 0;
  return {
    versions,
    version,
    pruned,
    async build(mapKey) {
      const started = performance.now();
      const file = cacheDir ? terrainCacheFile(cacheDir, init.planetId, version, mapKey) : undefined;
      if (file) {
        const cached = await readTerrainCache(file).catch(() => undefined);
        if (cached) {
          try {
            const terrain = terrainFromFile(mapKey, version, cached, gunzipSync);
            return { terrain, source: "disk", ms: performance.now() - started };
          } catch {
            // 틀린 캐시 파일: 지우고 다시 만든다
            await removeTerrainCache(file).catch(() => undefined);
          }
        }
      }
      const terrain = buildTerrain(values, rules, mapKey, versions);
      const ms = performance.now() - started;
      if (file) await writeTerrainCache(file, terrain.gzip).catch(() => undefined);
      return { terrain, source: "generated", ms };
    },
  };
}
