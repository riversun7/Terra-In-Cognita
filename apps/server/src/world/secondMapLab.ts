// 개발자 2차맵 시험(/dev/second-map)의 서버 쪽 — 월드 행성의 2차맵 하나를 고르고(키·시험 자리 종류) 지형 주소와 행성 칸 값을 준다.
// ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)". 보기 전용이다: 게임 상태를 바꾸지 않고 감사 기록도 없다.
// - 지형 파일은 기존 지형 경로(terrainRoute.ts)로 받는다. 띄운 2차맵은 그 판 표지(고정본일 수 있다), 아니면 지형 서비스 판 표지다.
//   경로는 전체 보기 권한(secondMap: observe, dev·admin)이면 월드 행성의 어느 2차맵이든 준다.
// - 월드 행성이 아닌 행성은 서버가 행성 값을 들고 있지 않다 → { kind: "device" }(기기 워커가 만든다).
// - 칸 값은 행성 값 파일에서 그 칸만 읽는다(22MB를 한 벌 더 풀어 들고 있지 않는다).
// - 시험 자리는 처음 부탁 때 파일을 한 번 풀어 여섯 종류를 모두 찾아 기억하고 푼 값은 버린다(행성 값은 바뀌지 않는다).
//   그 한 번은 F9에서 약 0.1~0.3초 이벤트 루프를 잡는다(Assumed, 개발 도구라 드물다).
import { terrainPath } from "@terra/protocol";
import { type CellKey, decodeCellKey, isCellKey } from "@terra/planet";
import {
  MAP_PRESETS,
  type MapPreset,
  decodePlanetValues,
  findMapPreset,
  planetCellValuesFromFile,
} from "@terra/planet/secondMap";
import type { SecondMapLabAnswer, SecondMapLabTarget } from "../planetEditor/types.ts";

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
}

/** 키·종류를 풀지 못함(틀린 입력). 프로시저가 BAD_REQUEST로 바꾼다 */
export class SecondMapLabInputError extends Error {
  override readonly name = "SecondMapLabInputError";
}

/** 준비 전(지형 서비스 판 표지 없음). 프로시저가 PRECONDITION_FAILED로 바꾼다 */
export class SecondMapLabNotReadyError extends Error {
  override readonly name = "SecondMapLabNotReadyError";
}

export function createSecondMapLab(deps: SecondMapLabDeps): SecondMapLab {
  let presets: ReadonlyMap<MapPreset, number | null> | null = null;

  const presetKey = (bytes: Uint8Array, preset: MapPreset): number | null => {
    if (!presets) {
      const values = decodePlanetValues(bytes);
      presets = new Map(MAP_PRESETS.map((kind) => [kind, findMapPreset(values, kind)]));
    }
    return presets.get(preset) ?? null;
  };

  return {
    async locate(planetId, target) {
      if (planetId !== deps.planetId) return { kind: "device" };
      const bytes = await deps.values();
      let mapKey: number | null;
      if (target.kind === "test") mapKey = deps.testMapKey;
      else if (target.kind === "preset") mapKey = presetKey(bytes, target.preset);
      else mapKey = target.mapKey;
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
  };
}

/** 칸 값을 읽은 키(셀 키가 맞다) */
function cellKeyOf(mapKey: number): CellKey {
  if (!isCellKey(mapKey)) throw new SecondMapLabInputError(`not a cell key: ${mapKey}`);
  return mapKey;
}
