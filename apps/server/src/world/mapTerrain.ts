// 2차맵 지형 — 2차맵(SecondMap)이 받는 지형 한 장: 배치 칸 지형 비용 + 지형 파일(TCTR, 원본 + gzip) + 주소 판 표지.
// ADR 2026-10-31-second-map-from-planet 5·6절. 만드는 길이 셋이다(차례대로 찾는다):
//   고정본(second_map_pins, 플레이어가 손댄 2차맵) → 캐시(메모리·디스크, terrainService.ts) → 생성기(지형 워커).
// S1 임시 지형(packages/sim tempTerrain)도 같은 모양으로 감싼다(지형 서비스 없는 월드: 시험·DB 없는 서버).
// 지형 워커(terrainWorker.ts)가 이 파일을 그대로 가져오므로 Node 타입 지우기로 바로 돌 수 있는 문법만 쓴다.
import { gzipSync } from "node:zlib";
import {
  type PlanetValues,
  SM_PLACEMENT,
  SM_TERRAIN,
  type PropRuleSet,
  generateSecondMap,
} from "@terra/planet/secondMap";
import { decodeTerrain, encodeTerrain } from "@terra/protocol";
import {
  type TempTerrain,
  TERRAIN_SIZE,
  placementCostsFromLayers,
  placementCostsFromTerrain,
  seedFromCellKey,
  terrainHash,
} from "@terra/sim";

/** 지형 파일(원본·gzip) */
export interface TerrainFile {
  raw: Buffer;
  gzip: Buffer;
}

export interface MapTerrain {
  /** 2차맵 생성기 판(행성 값 2차맵) 또는 임시 지형 판. 전송 정보 generatorVersion */
  readonly generatorVersion: number;
  /** 지형 주소 판 표지(?v=). 같은 표지면 내용이 같다(불변 주소) */
  readonly version: string;
  /** 시험 봇 난수 씨(2차맵 키에서) */
  readonly seed: number;
  /** 배치 칸 지형 비용 256²(천분율, 0 = 막힘). 2차맵은 복사해서 쓴다(격자가 고친다) */
  readonly costs: Uint16Array;
  /** 지형 파일. 처음 부를 때 만들 수 있다 */
  file(): TerrainFile;
}

/** 2차맵 결과가 달려 있는 판들 → 주소 판 표지. 2차맵 생성기 판·행성 생성기 판·행성 정의 해시 앞 8자·소품 규칙 해시 */
export interface TerrainVersions {
  readonly secondMapGeneratorVersion: number;
  readonly planetGeneratorVersion: number;
  /** 행성 정의 해시(SHA-256 16진수) */
  readonly definitionHash: string;
  /** 소품 규칙 해시(16진수 8자) */
  readonly propRulesHash: string;
}

export function terrainVersionToken(versions: TerrainVersions): string {
  return [
    versions.secondMapGeneratorVersion,
    versions.planetGeneratorVersion,
    versions.definitionHash.slice(0, 8),
    versions.propRulesHash,
  ].join(".");
}

/** 표지 모양(주소 검사·캐시 파일 이름): 숫자.숫자.16진수 8자.16진수 8자 */
export const TERRAIN_VERSION_PATTERN = /^\d{1,9}\.\d{1,9}\.[0-9a-f]{8}\.[0-9a-f]{8}$/;

function bufferOf(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** S1 임시 지형 → 2차맵 지형(주소 판 = 임시 지형 판, 지형 파일 1판) */
export function mapTerrainFromTemp(mapKey: number, terrain: TempTerrain): MapTerrain {
  let file: TerrainFile | undefined;
  return {
    generatorVersion: terrain.generatorVersion,
    version: String(terrain.generatorVersion),
    seed: terrain.seed,
    costs: placementCostsFromTerrain(terrain),
    file() {
      if (!file) {
        const bytes = encodeTerrain({
          mapKey,
          generatorVersion: terrain.generatorVersion,
          seed: terrain.seed,
          hash: Number.parseInt(terrainHash(terrain), 16) >>> 0,
          terrainSize: TERRAIN_SIZE,
          heights: terrain.heights,
          surface: terrain.surface,
        });
        const raw = bufferOf(bytes);
        file = { raw, gzip: gzipSync(raw) };
      }
      return file;
    },
  };
}

/** 만든(또는 읽은) 지형 한 장 — 지형 워커가 메인 스레드로 넘기는 모양(버퍼는 옮긴다) */
export interface BuiltTerrain {
  mapKey: number;
  version: string;
  generatorVersion: number;
  raw: Uint8Array<ArrayBuffer>;
  gzip: Uint8Array<ArrayBuffer>;
  costs: Uint16Array<ArrayBuffer>;
  /** 결과 해시(16진수 8자) */
  hash: string;
}

/** 지형 한 장 → 2차맵 지형 */
export function mapTerrainFromBuilt(built: BuiltTerrain): MapTerrain {
  const file = { raw: bufferOf(built.raw), gzip: bufferOf(built.gzip) };
  return {
    generatorVersion: built.generatorVersion,
    version: built.version,
    seed: seedFromCellKey(built.mapKey),
    costs: built.costs,
    file: () => file,
  };
}

/** 내용을 옮길 수 있는 새 버퍼에 복사한다(gzipSync 결과는 Buffer 풀을 나눠 쓸 수 있다) */
function ownBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

/**
 * 행성 값에서 2차맵 하나를 만든다: 생성 → TCTR 2판 → gzip → 지형 비용.
 * slowByArt = 그림 번호 → 느림 배율 표(팩 map_props slowPm, mapProps.ts mapPropSlowByArtFromPack). 없으면 느려짐 없음
 */
export function buildTerrain(
  values: PlanetValues,
  rules: PropRuleSet,
  mapKey: number,
  versions: TerrainVersions,
  slowByArt?: Readonly<Uint16Array>,
): BuiltTerrain {
  const map = generateSecondMap(values, mapKey, rules);
  const raw = ownBytes(
    encodeTerrain({
      mapKey,
      generatorVersion: map.generatorVersion,
      seed: values.seed >>> 0,
      hash: Number.parseInt(map.hash, 16) >>> 0,
      terrainSize: SM_TERRAIN,
      heights: map.heightsCm,
      surface: map.surface,
      waterLevels: map.waterLevelCm,
      cover: map.cover,
      art: map.art,
      placementSize: SM_PLACEMENT,
      cellSizeMm: map.cellSizeMm,
      planetGeneratorVersion: versions.planetGeneratorVersion,
      definitionHash: Number.parseInt(versions.definitionHash.slice(0, 8), 16) >>> 0,
    }),
  );
  // 소품 그림 층도 준다: 나무가 선 숲 칸은 숲 비용으로 지나간다(SIM_VERSION 19, docs/adr/2026-11-07-gather-objects.md),
  // 느려짐 소품(눈더미·모래언덕·늪 웅덩이)이 선 칸은 느림 배율만큼 비싸다(SIM_VERSION 37, 기획 D-540 질문 1223 나)
  const costs = placementCostsFromLayers({
    heights: map.heightsCm,
    surface: map.surface,
    cover: map.cover,
    art: map.art,
    slowByArt,
  });
  return {
    mapKey,
    version: terrainVersionToken(versions),
    generatorVersion: map.generatorVersion,
    raw,
    gzip: ownBytes(gzipSync(raw)),
    costs: new Uint16Array(costs),
    hash: map.hash,
  };
}

/**
 * 저장된 지형 파일(고정본·디스크 캐시의 gzip) → 지형 한 장. 2차맵 키·판이 다르거나 형식이 틀리면 RangeError
 * (부르는 쪽이 다시 만든다). 지형 비용은 파일의 높이·지표·엄폐·그림에서 다시 계산한다(느림 배율 표는 지금 팩 것 — buildTerrain과 같다).
 */
export function terrainFromFile(
  mapKey: number,
  version: string,
  gzip: Uint8Array,
  gunzip: (bytes: Uint8Array) => Uint8Array,
  slowByArt?: Readonly<Uint16Array>,
): BuiltTerrain {
  const raw = ownBytes(gunzip(gzip));
  const data = decodeTerrain(raw);
  if (data.mapKey !== mapKey) throw new RangeError(`terrain file is for map ${data.mapKey}, not ${mapKey}`);
  if (data.terrainSize !== SM_TERRAIN || (data.cover && data.placementSize !== SM_PLACEMENT)) {
    throw new RangeError("terrain file has another map size");
  }
  const costs = placementCostsFromLayers({
    heights: data.heights,
    surface: data.surface,
    cover: data.cover,
    art: data.art,
    slowByArt,
  });
  return {
    mapKey,
    version,
    generatorVersion: data.generatorVersion,
    raw,
    gzip: ownBytes(gzip),
    costs: new Uint16Array(costs),
    hash: (data.hash >>> 0).toString(16).padStart(8, "0"),
  };
}
