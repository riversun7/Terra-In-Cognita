// 경로 워커의 일: 배치 격자 사본을 들고, 편집을 따라 하고, 경로를 푼다.
// 워커(src/world/pathWorker.ts)와 시험용 같은 스레드 서비스(src/world/pathService.ts)가 이 코드를 같이 쓴다.
// 워커가 지울 수 있는 TS 문법만 쓴다(Node 타입 지우기로 바로 실행).
import {
  PLACEMENT_SIZE,
  type PlacementGrid,
  applyPlacement,
  createPathfinder,
  createPlacementGrid,
  createWaterGrid,
  markWaterBuilding,
  planRoute,
  removeBuilding,
  setRoad,
} from "@terra/sim";
import type {
  FromWorker,
  GridEdit,
  MapReplicaInit,
  PathJobMessage,
  PathResultMessage,
  ToWorker,
} from "./pathMessages.ts";

interface Replica {
  grid: PlacementGrid;
  version: number;
  /** 배 비용(사본 init에 실렸을 때만) */
  waterCost: Uint16Array | undefined;
  /** 배 격자 — 처음 물 길 요청 때 만든다(docs/adr/2026-11-13-boats.md 2절) */
  water: PlacementGrid | undefined;
}

/** 사본 하나를 만든다(물 격자는 아직) */
function replicaOf(init: MapReplicaInit): Replica {
  return { grid: buildReplicaGrid(init), version: init.version, waterCost: init.waterCost, water: undefined };
}

/** 배 격자(없으면 땅 격자 건물로 만든다). 배 비용이 없는 사본은 undefined */
function waterGridOf(replica: Replica): PlacementGrid | undefined {
  if (!replica.waterCost) return undefined;
  if (!replica.water) {
    const water = createWaterGrid(replica.waterCost);
    for (const [id, rect] of replica.grid.buildings)
      markWaterBuilding(water, id, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotation: 0,
      });
    replica.water = water;
  }
  return replica.water;
}

export interface ReplicaStore {
  /** 메시지 하나를 처리한다. 돌려줄 답이 있으면 돌려준다 */
  handle(message: ToWorker): FromWorker | undefined;
}

/** 사본 하나를 처음부터 만든다. 원본과 어긋나면(건물을 놓을 수 없음) 오류 */
export function buildReplicaGrid(init: MapReplicaInit): PlacementGrid {
  const grid = createPlacementGrid(init.terrainCost);
  init.road.forEach((roadType, index) => {
    if (roadType !== 0) setRoad(grid, index % PLACEMENT_SIZE, Math.floor(index / PLACEMENT_SIZE), roadType);
  });
  for (const { id, placement } of init.buildings) {
    const check = applyPlacement(grid, id, placement);
    if (!check.ok) throw new Error(`replica building ${id} does not fit: ${check.problem}`);
  }
  return grid;
}

/** 편집 하나를 사본에 따라 한다. 원본에서 된 편집이므로 실패하면 사본이 어긋난 것이다 */
export function applyGridEdit(grid: PlacementGrid, edit: GridEdit): string | undefined {
  if (edit.op === "place") {
    const check = applyPlacement(grid, edit.id, edit.placement);
    return check.ok ? undefined : `place ${edit.id}: ${check.problem}`;
  }
  return removeBuilding(grid, edit.id) ? undefined : `remove ${edit.id}: not placed`;
}

/** @param clock 계산 시간을 잴 시계(ms, performance.now) */
export function createReplicaStore(clock: () => number): ReplicaStore {
  const replicas = new Map<number, Replica>();
  // 길찾기 작업 배열(약 2.75MiB)은 하나만 두고 계속 쓴다(한 번에 한 탐색)
  const pathfinder = createPathfinder();

  const solve = (job: PathJobMessage): PathResultMessage => {
    const started = clock();
    const replica = replicas.get(job.mapKey);
    if (!replica) return { type: "path", jobId: job.jobId, version: -1, status: "unknown_map", computeMs: 0 };
    const grid = job.medium === "water" ? waterGridOf(replica) : replica.grid;
    if (!grid)
      return {
        type: "path",
        jobId: job.jobId,
        version: replica.version,
        status: "start_blocked",
        computeMs: 0,
      };
    const route = planRoute(pathfinder, grid, {
      from: { x: job.fromX, y: job.fromY },
      to: { x: job.toX, y: job.toY },
      size: job.size,
      nodeBudget: job.nodeBudget,
      // 배(물 길)는 구간 빠르기가 같다(ADR 2026-11-14-segment-speed.md)
      paceSpeed: job.medium === "water" ? undefined : job.paceSpeed,
    });
    const base = { type: "path" as const, jobId: job.jobId, version: replica.version };
    if (route.status === "found") {
      const waypoints = new Int32Array(route.waypoints.length * 2);
      route.waypoints.forEach((point, index) => {
        waypoints[index * 2] = point.x;
        waypoints[index * 2 + 1] = point.y;
      });
      const paces = route.paces ? Uint16Array.from(route.paces) : undefined;
      return {
        ...base,
        status: "found",
        waypoints,
        ...(paces ? { paces } : {}),
        expanded: route.expanded,
        computeMs: clock() - started,
      };
    }
    if (route.status === "no_path" || route.status === "budget_exceeded") {
      return { ...base, status: route.status, expanded: route.expanded, computeMs: clock() - started };
    }
    return { ...base, status: route.status, computeMs: clock() - started };
  };

  return {
    handle(message) {
      if (message.type === "path") return solve(message);
      if (message.type === "init") {
        replicas.clear();
        for (const init of message.maps) {
          replicas.set(init.mapKey, replicaOf(init));
        }
        return undefined;
      }
      // 그때 띄운 2차맵(add)·내린 2차맵(drop) — world/mapSpawn.ts
      if (message.type === "add") {
        replicas.set(message.map.mapKey, replicaOf(message.map));
        return undefined;
      }
      if (message.type === "drop") {
        replicas.delete(message.mapKey);
        return undefined;
      }
      const replica = replicas.get(message.mapKey);
      // 사본을 만든 뒤에 보낸 편집만 따라 한다(만들 때 이미 들어간 편집은 건너뛴다)
      if (!replica || message.version <= replica.version) return undefined;
      const reason =
        message.version === replica.version + 1
          ? applyGridEdit(replica.grid, message.edit)
          : `version gap ${replica.version} → ${message.version}`;
      // 배 격자도 같은 건물 칸을 따른다(칸 검사 없이 — 땅 격자에서 이미 놓였다)
      if (reason === undefined && replica.water) {
        if (message.edit.op === "place")
          markWaterBuilding(replica.water, message.edit.id, message.edit.placement);
        else removeBuilding(replica.water, message.edit.id);
      }
      if (reason !== undefined) {
        return { type: "replica_error", mapKey: message.mapKey, version: message.version, reason };
      }
      replica.version = message.version;
      return undefined;
    },
  };
}
