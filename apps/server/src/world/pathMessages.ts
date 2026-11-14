// 메인 스레드 ↔ 경로 워커 메시지 (src/world/pathPool.ts ↔ src/world/pathWorker.ts)
// 워커는 2차맵 배치 격자의 사본(캐시)을 들고 경로만 푼다. 원본 격자는 메인 스레드에 있다.
// - init: 사본을 처음부터 만든다(워커를 새로 띄울 때마다 지금 상태로).
// - add·drop: 그때 띄운 2차맵의 사본을 더하고(같은 키가 있으면 바꾼다) 내린 2차맵의 사본을 버린다(world/mapSpawn.ts,
//   docs/adr/2026-11-07-play-flow.md "WP15"). add 뒤에 보낸 path·edit는 그 사본으로 푼다(같은 워커로 가는 메시지 차례).
// - edit: 건물 놓기·치우기를 같은 순서로 따라 한다. 한 워커로 가는 메시지는 보낸 순서대로 처리된다
//   (postMessage 순서). 그래서 edit 뒤에 보낸 path는 edit 뒤의 격자로 푼다.
// - path 결과에는 푼 격자의 version을 붙인다. 메인 스레드가 늦게 온 결과를 가려낸다(pathPool·secondMap).
// 워커가 지울 수 있는 TS 문법만 쓰도록(Node 타입 지우기로 바로 실행) 타입만 둔다.
import type { BuildingPlacement, SizeClass } from "@terra/sim";

/** 사본을 만드는 데 필요한 2차맵 상태 */
export interface MapReplicaInit {
  mapKey: number;
  /** 격자 버전(편집할 때마다 1씩 오름) */
  version: number;
  /** 배치 칸 지형 비용(천분율, 65,536칸) */
  terrainCost: Uint16Array;
  /** 배치 칸 도로 종류(65,536칸) */
  road: Uint8Array;
  /** 놓인 건물(놓은 순서) */
  buildings: { id: number; placement: BuildingPlacement }[];
  /**
   * 배치 칸 배 비용(천분율, 65,536칸 — @terra/sim waterCostsFromLayers, docs/adr/2026-11-13-boats.md 2절). 2차맵이 배를 처음 다룰 때 만든 뒤에만 싣는다.
   * 없으면 그 사본에는 물 길이 없다(배 길 요청은 start_blocked)
   */
  waterCost?: Uint16Array | undefined;
}

/** 길을 푸는 격자: 땅(걷기, 기본)·물(배) */
export type PathMedium = "land" | "water";

export type GridEdit =
  | { op: "place"; id: number; placement: BuildingPlacement }
  | { op: "remove"; id: number };

export interface PathJobMessage {
  type: "path";
  jobId: number;
  mapKey: number;
  /** 지금 위치·목표(고정소수점) */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  size: SizeClass;
  nodeBudget: number;
  /** 물이면 배 격자로 푼다(없으면 땅) */
  medium?: PathMedium | undefined;
}

export type ToWorker =
  | { type: "init"; maps: MapReplicaInit[] }
  | { type: "add"; map: MapReplicaInit }
  | { type: "drop"; mapKey: number }
  | { type: "edit"; mapKey: number; version: number; edit: GridEdit }
  | PathJobMessage;

/** planRoute 결과 상태 + 사본에 없는 2차맵 */
export type PathStatus =
  | "found"
  | "no_path"
  | "budget_exceeded"
  | "start_blocked"
  | "goal_blocked"
  | "invalid_request"
  | "unknown_map";

export interface PathResultMessage {
  type: "path";
  jobId: number;
  /** 푼 격자 버전 */
  version: number;
  status: PathStatus;
  /** found일 때 꺾이는 점 [x0, y0, x1, y1, …]. 복사하지 않고 넘긴다(transfer) */
  waypoints?: Int32Array<ArrayBuffer>;
  /** 펼친 칸 수(found·no_path·budget_exceeded) */
  expanded?: number;
  /** 워커 안에서 잰 계산 시간(ms) */
  computeMs: number;
}

export type FromWorker =
  | PathResultMessage
  /** 사본 편집이 원본과 어긋났다(있으면 안 되는 일). 메인 스레드가 워커를 새로 띄운다 */
  | { type: "replica_error"; mapKey: number; version: number; reason: string };
