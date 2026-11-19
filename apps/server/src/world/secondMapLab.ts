// 개발자 2차맵 시험(/dev/second-map·/dev/terrain-objects)의 서버 쪽 — 월드 행성의 2차맵 하나를 고르고(키·시험 자리·바이옴) 지형 주소와 행성 칸 값을 준다.
// 또한 지형 오브젝트 편집기에서 비율을 바꾼 소품 규칙(map_props)을 즉석 미리 보기(preview)로 생성해 돌려준다(보기 전용, 캐시·세계에 쓰지 않는다).
// ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)". 게임 상태를 바꾸지 않고 감사 기록도 없다.
// - 지형 파일은 기존 지형 경로(terrainRoute.ts)로 받는다. 띄운 2차맵은 그 판 표지(고정본일 수 있다), 아니면 지형 서비스 판 표지다.
//   경로는 전체 보기 권한(secondMap: observe, dev·admin)이면 월드 행성의 어느 2차맵이든 준다.
// - 월드 행성이 아닌 행성은 서버가 행성 값을 들고 있지 않다 → { kind: "device" }(기기 워커가 만든다).
// - 시험 자리·바이옴 대표 칸은 처음 부탁 때 파일을 한 번 풀어 기억하고, 푼 PlanetValues는 preview 때만 2분 유휴 캐시로 들고 있다가 비운다.
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { type CellKey, decodeCellKey, isCellKey } from "@terra/planet";
import {
  MAP_PRESETS,
  type MapPreset,
  type PlanetValues,
  SM_PLACEMENT,
  SM_TERRAIN,
  compileMapProps,
  decodePlanetValues,
  findBiomeMapKeys,
  findMapPreset,
  generateSecondMap,
  mapPropInputsFromJson,
  planetCellValues,
  planetCellValuesFromFile,
} from "@terra/planet/secondMap";
import { encodeTerrain, terrainPath } from "@terra/protocol";
import type {
  SecondMapLabAnswer,
  SecondMapLabPreviewAnswer,
  SecondMapLabTarget,
} from "../planetEditor/types.ts";

/** preview용 푼 행성 값 유휴 보관 시간(ms). 지나면 버려 평상시 메모리를 차지하지 않게 한다 */
const PREVIEW_VALUES_IDLE_MS = 120_000;

export interface SecondMapLabDeps {
  /** 월드 행성 ID(2차맵을 띄우는 행성) */
  readonly planetId: string;
  /** 월드 행성 값 파일 바이트(행성 서비스, 준비될 때까지 기다린다) */
  readonly values: () => Promise<Uint8Array>;
  /** 지형 서비스 판 표지(준비 전 undefined) */
  readonly terrainVersion: () => string | undefined;
  /** 띄운 2차맵이면 그 지형 판 표지(고정본이면 그 판) */
  readonly loadedVersion: (mapKey: number) => string | undefined;
  readonly testMapKey: number;
}

export interface SecondMapLab {
  locate(planetId: string, target: SecondMapLabTarget): Promise<SecondMapLabAnswer>;
  preview(
    planetId: string,
    target: SecondMapLabTarget,
    mapProps: readonly unknown[],
  ): Promise<SecondMapLabPreviewAnswer>;
}

/** 키·종류·소품 규칙을 풀지 못함(틀린 입력). 프로시저가 BAD_REQUEST로 바꾼다 */
export class SecondMapLabInputError extends Error {
  override readonly name = "SecondMapLabInputError";
}

/** 준비 전(지형 서비스 판 표지 없음). 프로시저가 PRECONDITION_FAILED로 바꾼다 */
export class SecondMapLabNotReadyError extends Error {
  override readonly name = "SecondMapLabNotReadyError";
}

export function createSecondMapLab(deps: SecondMapLabDeps): SecondMapLab {
  let presets: ReadonlyMap<MapPreset, number | null> | null = null;
  let biomeKeys: ReadonlyMap<string, readonly number[]> | null = null;
  let cachedValues: PlanetValues | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  const ensureIndex = (bytes: Uint8Array, decoded?: PlanetValues): void => {
    if (presets && biomeKeys) return;
    const values = decoded ?? decodePlanetValues(bytes);
    presets = new Map(MAP_PRESETS.map((kind) => [kind, findMapPreset(values, kind)]));
    biomeKeys = findBiomeMapKeys(values, 8);
  };

  const holdValues = (bytes: Uint8Array): PlanetValues => {
    if (!cachedValues) cachedValues = decodePlanetValues(bytes);
    ensureIndex(bytes, cachedValues);
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      cachedValues = null;
      clearTimer = null;
    }, PREVIEW_VALUES_IDLE_MS);
    clearTimer.unref();
    return cachedValues;
  };

  const resolveKey = (
    bytes: Uint8Array,
    target: SecondMapLabTarget,
    decoded?: PlanetValues,
  ): number | null => {
    if (target.kind === "test") return deps.testMapKey;
    if (target.kind === "key") return target.mapKey;
    ensureIndex(bytes, decoded);
    if (target.kind === "preset") return presets?.get(target.preset) ?? null;
    const list = biomeKeys?.get(target.biomeId);
    if (!list || list.length === 0) return null;
    const index = Math.abs(Math.floor(target.variant ?? 0)) % list.length;
    return list[index] ?? null;
  };

  return {
    async locate(planetId, target) {
      if (planetId !== deps.planetId) return { kind: "device" };
      const bytes = await deps.values();
      const mapKey = resolveKey(bytes, target);
      if (mapKey === null) return { kind: "none" };
      let cell: ReturnType<typeof planetCellValuesFromFile>;
      try {
        cell = planetCellValuesFromFile(bytes, mapKey);
      } catch (error) {
        throw new SecondMapLabInputError(error instanceof Error ? error.message : String(error));
      }
      const version = deps.loadedVersion(mapKey) ?? deps.terrainVersion();
      if (version === undefined) throw new SecondMapLabNotReadyError("terrain service is not ready");
      return {
        kind: "server",
        planetId,
        faceLevel: decodeCellKey(cellKeyOf(mapKey)).level,
        mapKey,
        terrainUrl: terrainPath(mapKey, version),
        cell,
        testMapKey: deps.testMapKey,
      };
    },

    async preview(planetId, target, mapProps) {
      if (planetId !== deps.planetId) return { kind: "device" };
      const bytes = await deps.values();
      const values = holdValues(bytes);
      const mapKey = resolveKey(bytes, target, values);
      if (mapKey === null) return { kind: "none" };
      let cell: ReturnType<typeof planetCellValues>;
      let rules: ReturnType<typeof compileMapProps>;
      try {
        cell = planetCellValues(values, mapKey);
        rules = compileMapProps(mapPropInputsFromJson(mapProps), values.biomeIds);
      } catch (error) {
        throw new SecondMapLabInputError(error instanceof Error ? error.message : String(error));
      }
      const started = performance.now();
      const terrain = generateSecondMap(values, mapKey, rules);
      const mapMs = performance.now() - started;
      const raw = encodeTerrain({
        mapKey,
        generatorVersion: terrain.generatorVersion,
        seed: values.seed >>> 0,
        hash: Number.parseInt(terrain.hash, 16) >>> 0,
        terrainSize: SM_TERRAIN,
        heights: terrain.heightsCm,
        surface: terrain.surface,
        waterLevels: terrain.waterLevelCm,
        cover: terrain.cover,
        art: terrain.art,
        placementSize: SM_PLACEMENT,
        cellSizeMm: terrain.cellSizeMm,
      });
      const gzipped = gzipSync(Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
      return {
        kind: "server",
        planetId,
        faceLevel: decodeCellKey(cellKeyOf(mapKey)).level,
        mapKey,
        cell,
        terrainGzipBase64: gzipped.toString("base64"),
        hash: terrain.hash,
        mapMs,
      };
    },
  };
}

/** 칸 값을 읽은 키(셀 키가 맞다) */
function cellKeyOf(mapKey: number): CellKey {
  if (!isCellKey(mapKey)) throw new SecondMapLabInputError(`not a cell key: ${mapKey}`);
  return mapKey;
}
