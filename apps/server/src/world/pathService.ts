// 경로 서비스 — 2차맵(src/world/secondMap.ts)이 경로를 부탁하는 곳. 메인 스레드는 경로를 직접 풀지 않는다.
// - 운영: 워커 풀(src/world/pathPool.ts). 경로 하나가 최대 수십 ms라 메인 스레드에서 풀면 안 된다(ADR 33 벤치마크).
// - 시험: 같은 스레드 서비스(createInlinePathService). 워커와 같은 코드(pathReplica.ts)로 푼다.
import type { Point, SizeClass } from "@terra/sim";
import type { GridEdit, MapReplicaInit, PathMedium, PathStatus, ToWorker } from "./pathMessages.ts";
import { createReplicaStore } from "./pathReplica.ts";

/** 관리자 명령이 봇 이동보다 먼저 풀린다 */
export type PathPriority = "command" | "bot";

export interface PathRequest {
  mapKey: number;
  from: Point;
  to: Point;
  size: SizeClass;
  nodeBudget: number;
  priority: PathPriority;
  /** 물이면 배 격자로 푼다(docs/adr/2026-11-13-boats.md 2절). 없으면 땅 */
  medium?: PathMedium | undefined;
  /** 풀기 직전에 확인한다. false면(더 새 요청이 있음) 풀지 않고 dropped */
  isCurrent(): boolean;
}

export type PathOutcome =
  | {
      status: "found";
      /** 푼 격자 버전 */
      version: number;
      waypoints: Point[];
      expanded: number;
      /** 워커 안 계산 시간(ms) */
      computeMs: number;
      /** 부탁한 때부터 결과까지(ms): 대기 + 계산 + 메시지 */
      waitMs: number;
    }
  | {
      status: Exclude<PathStatus, "found">;
      version: number;
      expanded?: number | undefined;
      computeMs: number;
      waitMs: number;
    }
  /** 풀기 전에 쓸모가 없어짐(더 새 요청이 있다) */
  | { status: "dropped"; waitMs: number }
  /** 대기열이 참, 서비스가 닫힘 */
  | { status: "busy"; waitMs: number };

export interface PathService {
  /** 워커를 띄우고 사본을 만든다(2차맵을 만든 뒤에 부른다) */
  start(): void;
  request(job: PathRequest): Promise<PathOutcome>;
  /** 격자 편집을 모든 사본에 보낸다. 원본에 적용한 순서 그대로 부른다 */
  edit(mapKey: number, version: number, edit: GridEdit): void;
  /** 그때 띄운 2차맵의 사본을 모든 워커에 더한다(start 뒤, world/mapSpawn.ts). 워커를 새로 띄우면 sources가 이미 그 2차맵을 준다 */
  add(init: MapReplicaInit): void;
  /** 내린 2차맵의 사본을 모든 워커에서 버린다 */
  drop(mapKey: number): void;
  /** 기다리는(아직 보내지 않은) 작업 수 */
  queued(): number;
  close(): Promise<void>;
}

/** 사본을 (다시) 만들 때 지금 상태를 주는 함수 */
export type ReplicaSources = () => MapReplicaInit[];

/** 결과 메시지의 꺾이는 점 배열 → 위치 목록 */
export function waypointsFromFlat(flat: Int32Array): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i] ?? 0, y: flat[i + 1] ?? 0 });
  return points;
}

/**
 * 같은 스레드에서 푸는 서비스(시험용). 워커 하나처럼 한 번에 하나씩, 부탁한 순서대로 푼다(우선순위 없음).
 * 결과는 비동기(마이크로태스크)로 돌려준다.
 */
export function createInlinePathService(sources: ReplicaSources, clock: () => number): PathService {
  const store = createReplicaStore(clock);
  let closed = false;
  let chain: Promise<unknown> = Promise.resolve();
  let waiting = 0;
  let nextJobId = 1;

  const send = (message: ToWorker) => store.handle(message);

  return {
    start() {
      send({ type: "init", maps: sources() });
    },
    request(job) {
      const enqueuedAt = clock();
      waiting += 1;
      const run = async (): Promise<PathOutcome> => {
        waiting -= 1;
        if (closed) return { status: "busy", waitMs: clock() - enqueuedAt };
        if (!job.isCurrent()) return { status: "dropped", waitMs: clock() - enqueuedAt };
        const reply = send({
          type: "path",
          jobId: nextJobId++,
          mapKey: job.mapKey,
          fromX: job.from.x,
          fromY: job.from.y,
          toX: job.to.x,
          toY: job.to.y,
          size: job.size,
          nodeBudget: job.nodeBudget,
          medium: job.medium,
        });
        if (reply?.type !== "path") return { status: "busy", waitMs: clock() - enqueuedAt };
        const waitMs = clock() - enqueuedAt;
        if (reply.status === "found" && reply.waypoints) {
          return {
            status: "found",
            version: reply.version,
            waypoints: waypointsFromFlat(reply.waypoints),
            expanded: reply.expanded ?? 0,
            computeMs: reply.computeMs,
            waitMs,
          };
        }
        if (reply.status === "found")
          return { status: "invalid_request", version: reply.version, computeMs: 0, waitMs };
        return {
          status: reply.status,
          version: reply.version,
          expanded: reply.expanded,
          computeMs: reply.computeMs,
          waitMs,
        };
      };
      const result = chain.then(run);
      chain = result;
      return result;
    },
    edit(mapKey, version, edit) {
      const reply = send({ type: "edit", mapKey, version, edit });
      if (reply?.type === "replica_error") throw new Error(`replica error: ${reply.reason}`);
    },
    add(init) {
      send({ type: "add", map: init });
    },
    drop(mapKey) {
      send({ type: "drop", mapKey });
    },
    queued: () => waiting,
    async close() {
      closed = true;
      await chain;
    },
  };
}
