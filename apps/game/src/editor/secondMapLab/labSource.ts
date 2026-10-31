// 2차맵 시험 화면의 자료 받기 — ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)". React와 상관없다(시험 대상).
// 두 길이 있다. 서버가 먼저 답한다(planetEditor.secondMap):
// - server: 월드 행성이다. 서버 지형 서비스가 만든 지형 파일을 기존 지형 경로로 받는다(전체 보기 권한). 휴대폰도 가볍다(파일 약 50KB).
//   이웃 3×3은 같은 판 표지의 이웃 주소로 받는다(경계 너머 보기와 같은 길).
// - device: 월드 행성이 아니다(편집 전용 행성·행성 표본). 편집기 2차맵 미리보기 워커가 행성(진짜 면 레벨)부터 만든다
//   (처음 한 번 F9 약 10~20초, 같은 행성이면 다시 쓴다). 이웃은 같은 워커가 함께 만든다.
// 두 길 모두 게임 상태를 바꾸지 않는다(보기 전용). 지형·칸 값은 서버 판정 자료와 같은 생성기 코드다.
import type { NeighbourPlacement, TerrainInput } from "@terra/engine";
import { decodeCellKey, isCellKey } from "@terra/planet";
import type { MapPreset, PlanetCellValues } from "@terra/planet/secondMap";
import { S1_TEST_MAP_KEY } from "@terra/protocol";
import { trpcErrorOf } from "../planet/libraryClient.ts";
import { previewInput } from "../planet/previewController.ts";
import { previewKey } from "../planet/previewJobs.ts";
import {
  type SecondMapJob,
  SecondMapPreviewError,
  type SecondMapPreviewClient,
  previewTerrainInput,
} from "../planet/secondMapPreviewClient.ts";
import type { SecondMapPreviewStage } from "../planet/secondMapPreviewProtocol.ts";
import { neighbourSpots, neighbourTerrainUrl } from "../../map/secondMapNeighbours.ts";

/** 보고 싶은 2차맵(서버 planetEditor.secondMap 입력과 같은 모양) */
export type LabTarget =
  | { readonly kind: "test" }
  | { readonly kind: "key"; readonly mapKey: number }
  | { readonly kind: "preset"; readonly preset: MapPreset };

/** 서버 답(planetEditor.secondMap 출력과 같은 모양) */
export type LabAnswer =
  | {
      readonly kind: "server";
      readonly planetId: string;
      readonly faceLevel: number;
      readonly mapKey: number;
      readonly terrainUrl: string;
      readonly cell: PlanetCellValues;
      readonly testMapKey: number;
    }
  | { readonly kind: "device" }
  | { readonly kind: "none" };

/** 고를 수 있는 행성(팩 행성·행성 표본): 원본 항목 */
export interface LabPlanet {
  readonly id: string;
  readonly kind: "pack" | "template";
  readonly entry: unknown;
}

export interface LabDefinitions {
  readonly planets: readonly LabPlanet[];
  readonly biomes: readonly unknown[];
  readonly mapProps: readonly unknown[];
}

/** 받은 2차맵 하나 */
export interface LabMap {
  readonly planetId: string;
  readonly source: "server" | "device";
  readonly mapKey: number;
  readonly faceLevel: number;
  /** 과장하지 않은 지형 입력 */
  readonly terrain: TerrainInput;
  readonly cell: PlanetCellValues;
  /** server: 지형 주소(이웃 주소의 판 표지) */
  readonly terrainUrl: string | null;
  /** device: 생성 결과 해시 */
  readonly hash: string | null;
  /** device: 행성(null = 다시 씀)·2차맵 생성 ms */
  readonly planetMs: number | null;
  readonly mapMs: number | null;
  /** 부탁부터 받기까지(ms) */
  readonly loadMs: number;
}

export interface LabNeighbour {
  readonly mapKey: number;
  readonly terrain: TerrainInput;
  readonly placement: NeighbourPlacement;
}

/** 실패 코드(화면 문구로 바꾼다) */
export type LabErrorCode =
  | "none"
  | "bad_key"
  | "not_ready"
  | "forbidden"
  | "unknown_planet"
  | "rejected"
  | "crashed"
  | "cancelled"
  | "failed";

export class LabLoadError extends Error {
  override readonly name = "LabLoadError";
  readonly code: LabErrorCode;
  constructor(code: LabErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface LabSourceDeps {
  readonly query: (input: { planetId: string; target: LabTarget }) => Promise<LabAnswer>;
  readonly fetchTerrain: (url: string) => Promise<TerrainInput>;
  readonly device: SecondMapPreviewClient;
  readonly definitions: LabDefinitions;
  readonly now?: () => number;
}

export interface LabLoadOptions {
  readonly onStage?: (stage: SecondMapPreviewStage) => void;
  /**
   * device 길에서 그 행성을 아직 만들지 않았을 때 그 면 레벨로 부른다(F9 확인 창). false면 만들지 않고 cancelled로 끝낸다.
   * 없으면 묻지 않고 만든다
   */
  readonly beforeBuild?: (faceLevel: number) => Promise<boolean>;
}

export interface LabSource {
  /** device 길이고 그 행성을 아직 만들지 않았으면 그 면 레벨, 아니면 null */
  heavyLevel(planetId: string): number | null;
  load(planetId: string, target: LabTarget, options?: LabLoadOptions): Promise<LabMap>;
  neighbours(map: LabMap): Promise<LabNeighbour[]>;
}

/** 행성 항목의 면 레벨(없으면 null) */
export function faceLevelOf(entry: unknown): number | null {
  const value: unknown = typeof entry === "object" && entry !== null ? Reflect.get(entry, "faceLevel") : null;
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function keyLevel(mapKey: number): number | null {
  return isCellKey(mapKey) ? decodeCellKey(mapKey).level : null;
}

/** 서버 오류 → 실패 코드 */
function serverError(error: unknown): LabLoadError {
  const { code, reason } = trpcErrorOf(error);
  if (code === "BAD_REQUEST" && reason === "bad_map_key") return new LabLoadError("bad_key", "bad map key");
  if (code === "PRECONDITION_FAILED") return new LabLoadError("not_ready", "terrain service is not ready");
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return new LabLoadError("forbidden", "no permission");
  return new LabLoadError("failed", error instanceof Error ? error.message : String(error));
}

function deviceError(error: unknown): LabLoadError {
  if (error instanceof SecondMapPreviewError) {
    const code: LabErrorCode =
      error.code === "none" || error.code === "rejected" || error.code === "crashed" ? error.code : "failed";
    return new LabLoadError(code, error.message);
  }
  return new LabLoadError("failed", error instanceof Error ? error.message : String(error));
}

export function createLabSource(deps: LabSourceDeps): LabSource {
  const now = deps.now ?? (() => performance.now());

  /** device 길의 행성 입력·열쇠 */
  const devicePlanet = (planetId: string) => {
    const planet = deps.definitions.planets.find((item) => item.id === planetId);
    const level = planet ? faceLevelOf(planet.entry) : null;
    if (!planet || level === null) throw new LabLoadError("unknown_planet", `unknown planet ${planetId}`);
    try {
      const input = previewInput({ entry: planet.entry, biomes: deps.definitions.biomes }, level);
      return { input, level, planetKey: previewKey(input) };
    } catch (error) {
      throw new LabLoadError("rejected", error instanceof Error ? error.message : String(error));
    }
  };

  /** device 부탁: 시험 2차맵은 같은 면 레벨이면 월드 시험 2차맵 자리, 아니면 초지 */
  const deviceJob = (
    planetId: string,
    target: LabTarget,
    neighbours: boolean,
  ): { job: SecondMapJob; level: number } => {
    const { input, level, planetKey } = devicePlanet(planetId);
    const base = { planetKey, input, props: deps.definitions.mapProps, neighbours };
    if (target.kind === "key") {
      if (keyLevel(target.mapKey) !== level)
        throw new LabLoadError("bad_key", `map key is not a level ${level} cell`);
      return { job: { ...base, mapKey: target.mapKey }, level };
    }
    if (target.kind === "test") {
      const job: SecondMapJob =
        keyLevel(S1_TEST_MAP_KEY) === level
          ? { ...base, mapKey: S1_TEST_MAP_KEY }
          : { ...base, mapKey: null, preset: "grassland" };
      return { job, level };
    }
    return { job: { ...base, mapKey: null, preset: target.preset }, level };
  };

  const loadDevice = async (
    planetId: string,
    target: LabTarget,
    started: number,
    options: LabLoadOptions,
  ): Promise<LabMap> => {
    const { job, level } = deviceJob(planetId, target, false);
    if (!deps.device.hasPlanet(job.planetKey) && options.beforeBuild && !(await options.beforeBuild(level))) {
      throw new LabLoadError("cancelled", "planet build cancelled");
    }
    let result: Awaited<ReturnType<SecondMapPreviewClient["request"]>>;
    try {
      result = await deps.device.request(job, options.onStage);
    } catch (error) {
      throw deviceError(error);
    }
    return {
      planetId,
      source: "device",
      mapKey: result.terrain.mapKey,
      faceLevel: level,
      terrain: previewTerrainInput(result.terrain),
      cell: result.cell,
      terrainUrl: null,
      hash: result.terrain.hash,
      planetMs: result.planetMs,
      mapMs: result.mapMs,
      loadMs: now() - started,
    };
  };

  return {
    heavyLevel(planetId) {
      const planet = deps.definitions.planets.find((item) => item.id === planetId);
      const level = planet ? faceLevelOf(planet.entry) : null;
      if (level === null) return null;
      try {
        const { planetKey } = devicePlanet(planetId);
        return deps.device.hasPlanet(planetKey) ? null : level;
      } catch {
        return null;
      }
    },

    async load(planetId, target, options = {}) {
      const started = now();
      let answer: LabAnswer;
      try {
        answer = await deps.query({ planetId, target });
      } catch (error) {
        throw serverError(error);
      }
      if (answer.kind === "none") throw new LabLoadError("none", "no place for that kind");
      if (answer.kind === "device") return loadDevice(planetId, target, started, options);
      let terrain: TerrainInput;
      try {
        terrain = await deps.fetchTerrain(answer.terrainUrl);
      } catch (error) {
        throw new LabLoadError("failed", error instanceof Error ? error.message : String(error));
      }
      return {
        planetId,
        source: "server",
        mapKey: answer.mapKey,
        faceLevel: answer.faceLevel,
        terrain,
        cell: answer.cell,
        terrainUrl: answer.terrainUrl,
        hash: null,
        planetMs: null,
        mapMs: null,
        loadMs: now() - started,
      };
    },

    async neighbours(map) {
      const spots = neighbourSpots(map.mapKey);
      if (map.source === "server") {
        const mainUrl = map.terrainUrl ?? "";
        const loaded = await Promise.all(
          spots.map(async (spot): Promise<LabNeighbour | null> => {
            const url = neighbourTerrainUrl(mainUrl, spot.key);
            if (!url) return null;
            try {
              return { mapKey: spot.key, terrain: await deps.fetchTerrain(url), placement: spot.placement };
            } catch {
              // 못 받은 이웃은 그리지 않는다
              return null;
            }
          }),
        );
        return loaded.filter((item): item is LabNeighbour => item !== null);
      }
      let result: Awaited<ReturnType<SecondMapPreviewClient["request"]>>;
      try {
        result = await deps.device.request(
          deviceJob(map.planetId, { kind: "key", mapKey: map.mapKey }, true).job,
        );
      } catch (error) {
        throw deviceError(error);
      }
      const out: LabNeighbour[] = [];
      for (const terrain of result.neighbours) {
        const spot = spots.find((item) => item.key === terrain.mapKey);
        if (spot)
          out.push({ mapKey: spot.key, terrain: previewTerrainInput(terrain), placement: spot.placement });
      }
      return out;
    },
  };
}
