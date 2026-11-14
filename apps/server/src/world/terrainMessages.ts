// 메인 스레드 ↔ 2차맵 지형 워커 메시지 (src/world/terrainService.ts ↔ src/world/terrainWorker.ts)
// 워커 하나가 행성 값(TCPV)·소품 규칙을 들고, 2차맵 키를 받아 지형 한 장(TCTR 원본·gzip·지형 비용)을 돌려준다.
// 디스크 캐시 읽기·쓰기도 워커가 한다(메인 스레드 이벤트 루프를 막지 않게). 지울 수 있는 TS 문법만 쓴다(타입만).
import type { MapPropInput } from "@terra/planet/secondMap";
import type { BuiltTerrain, TerrainVersions } from "./mapTerrain.ts";

export interface TerrainWorkerInit {
  type: "init";
  /** 행성 값 파일(TCPV) 바이트 — 워커로 옮긴다 */
  values: Uint8Array<ArrayBuffer>;
  /** 콘텐츠 map_props 항목(바이옴은 ID 문자열) */
  props: MapPropInput[];
  /** 그림 번호 → 느림 배율 표(천분율, 팩 map_props slowPm — mapProps.ts). 없으면 느려짐 없음 */
  slowByArt?: Uint16Array | undefined;
  planetId: string;
  planetGeneratorVersion: number;
  definitionHash: string;
  /** 디스크 캐시 폴더. 없으면 디스크 캐시 없이 */
  cacheDir: string | undefined;
  /** 디스크 캐시에 남길 파일 수 상한 */
  cacheFiles: number;
}

export interface TerrainWorkerJob {
  type: "build";
  id: number;
  mapKey: number;
}

export type ToTerrainWorker = TerrainWorkerInit | TerrainWorkerJob;

export type FromTerrainWorker =
  | { type: "ready"; versions: TerrainVersions; version: string; pruned: number }
  | { type: "built"; id: number; terrain: BuiltTerrain; source: "disk" | "generated"; ms: number }
  | { type: "failed"; id: number; message: string }
  | { type: "fatal"; message: string; stack?: string | undefined };
