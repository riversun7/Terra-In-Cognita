// 경로 워커 풀 (node:worker_threads) — 새 런타임 의존성 없이 만든다(ADR 33 "구현하며 정한 것 (서버 연결)").
// - 워커마다 배치 격자 사본을 들고 있다. 사본을 다시 만들 때는 메인 스레드의 지금 상태를 보낸다(sources).
// - 대기열은 메인 스레드에 있다: 명령 먼저, 그다음 봇. 워커마다 동시에 MAX_IN_FLIGHT개까지만 보낸다
//   (워커가 놀지 않게 하나는 미리 보내고, 나머지는 여기서 기다리게 해서 쓸모없어진 작업을 버릴 수 있게).
// - 워커가 죽으면 다시 띄우고 맡겼던 작업을 대기열 앞에 다시 넣는다. 1분에 MAX_RESPAWNS_PER_MINUTE번을 넘으면
//   더 띄우지 않고 모든 작업에 busy를 준다(같은 오류로 계속 죽는 경우).
import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import type { FromWorker, GridEdit, MapReplicaInit, PathJobMessage, ToWorker } from "./pathMessages.ts";
import {
  type PathOutcome,
  type PathRequest,
  type PathService,
  type ReplicaSources,
  waypointsFromFlat,
} from "./pathService.ts";

/** 워커 하나에 동시에 맡기는 작업 수 */
const MAX_IN_FLIGHT = 2;
const MAX_RESPAWNS_PER_MINUTE = 10;
/** 워커 하나의 V8 힙 상한(MB). 길찾기 작업 배열 약 2.75MiB + 사본 2차맵당 0.5MiB라 넉넉하다 */
const WORKER_HEAP_MB = 128;

export interface PoolLog {
  warn(obj: object, message: string): void;
  error(obj: object, message: string): void;
}

export interface WorkerPoolOptions {
  /** 워커 진입 파일(개발: src/world/pathWorker.ts, 빌드: dist/pathWorker.js) */
  workerUrl: URL;
  workers: number;
  sources: ReplicaSources;
  log: PoolLog;
  /** 대기열 상한(명령·봇 각각). 넘으면 busy */
  maxQueue?: number;
}

interface Job {
  request: PathRequest;
  resolve: (outcome: PathOutcome) => void;
  enqueuedAt: number;
}

interface PoolWorker {
  slot: number;
  worker: Worker;
  inFlight: Map<number, Job>;
}

/** 부탁한 때부터 지금까지(ms) */
function elapsed(job: Job): number {
  return performance.now() - job.enqueuedAt;
}

/** 워커에 메시지를 보낸다(한 워커로 가는 메시지는 보낸 순서대로 처리된다) */
function post(worker: Worker, message: ToWorker): void {
  // 브라우저 window.postMessage 규칙(targetOrigin)은 worker_threads에 해당하지 않는다
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  worker.postMessage(message);
}

/** 앞에서 꺼내는 대기열(배열 shift 대신 머리 번호) */
class JobQueue {
  private items: Job[] = [];
  private head = 0;
  get length(): number {
    return this.items.length - this.head;
  }
  push(job: Job): void {
    this.items.push(job);
  }
  unshift(job: Job): void {
    if (this.head > 0) {
      this.head -= 1;
      this.items[this.head] = job;
    } else {
      this.items.unshift(job);
    }
  }
  shift(): Job | undefined {
    if (this.head >= this.items.length) return undefined;
    const job = this.items[this.head];
    this.head += 1;
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return job;
  }
  drain(): Job[] {
    const rest = this.items.slice(this.head);
    this.items = [];
    this.head = 0;
    return rest;
  }
}

export function createWorkerPathService(options: WorkerPoolOptions): PathService {
  const maxQueue = options.maxQueue ?? 8_192;
  const queues = { command: new JobQueue(), bot: new JobQueue() };
  const workers: (PoolWorker | undefined)[] = [];
  const respawns: number[] = [];
  let nextJobId = 1;
  let closed = false;
  let failed = false;

  const nextJob = (): Job | undefined => queues.command.shift() ?? queues.bot.shift();

  const pickWorker = (): PoolWorker | undefined => {
    let best: PoolWorker | undefined;
    for (const candidate of workers) {
      if (!candidate || candidate.inFlight.size >= MAX_IN_FLIGHT) continue;
      if (!best || candidate.inFlight.size < best.inFlight.size) best = candidate;
    }
    return best;
  };

  const dispatch = (): void => {
    for (;;) {
      const target = pickWorker();
      if (!target) return;
      const job = nextJob();
      if (!job) return;
      if (!job.request.isCurrent()) {
        job.resolve({ status: "dropped", waitMs: elapsed(job) });
        continue;
      }
      const jobId = nextJobId++;
      const { request } = job;
      const message: PathJobMessage = {
        type: "path",
        jobId,
        mapKey: request.mapKey,
        fromX: request.from.x,
        fromY: request.from.y,
        toX: request.to.x,
        toY: request.to.y,
        size: request.size,
        nodeBudget: request.nodeBudget,
      };
      target.inFlight.set(jobId, job);
      post(target.worker, message);
    }
  };

  const onMessage = (owner: PoolWorker, message: FromWorker): void => {
    if (message.type === "replica_error") {
      options.log.error(
        { mapKey: message.mapKey, version: message.version, reason: message.reason },
        "path replica diverged",
      );
      // 사본이 어긋났다 → 이 워커를 버리고 지금 상태로 새로 띄운다(exit 처리에서)
      void owner.worker.terminate();
      return;
    }
    const job = owner.inFlight.get(message.jobId);
    if (!job) return;
    owner.inFlight.delete(message.jobId);
    const waitMs = elapsed(job);
    if (message.status === "found") {
      job.resolve({
        status: "found",
        version: message.version,
        waypoints: message.waypoints ? waypointsFromFlat(message.waypoints) : [],
        expanded: message.expanded ?? 0,
        computeMs: message.computeMs,
        waitMs,
      });
    } else {
      job.resolve({
        status: message.status,
        version: message.version,
        expanded: message.expanded,
        computeMs: message.computeMs,
        waitMs,
      });
    }
    dispatch();
  };

  const giveUp = (): void => {
    failed = true;
    for (const job of [...queues.command.drain(), ...queues.bot.drain()]) {
      job.resolve({ status: "busy", waitMs: elapsed(job) });
    }
  };

  const spawn = (slot: number): void => {
    const worker = new Worker(options.workerUrl, {
      name: `path-${slot}`,
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
    });
    const owner: PoolWorker = { slot, worker, inFlight: new Map() };
    workers[slot] = owner;
    // 서버를 끄는 것을 워커가 막지 않게(끌 때는 close가 직접 끝낸다)
    worker.unref();
    worker.on("message", (message: FromWorker) => onMessage(owner, message));
    worker.on("error", (error) => options.log.error({ err: error, slot }, "path worker error"));
    worker.on("exit", (code) => {
      if (workers[slot] === owner) workers[slot] = undefined;
      // 맡겼던 작업은 대기열 앞으로 다시
      for (const job of [...owner.inFlight.values()].toReversed()) queues[job.request.priority].unshift(job);
      owner.inFlight.clear();
      if (closed) return;
      options.log.warn({ slot, code }, "path worker exited, respawning");
      const now = performance.now();
      while (respawns.length > 0 && (respawns[0] ?? 0) < now - 60_000) respawns.shift();
      respawns.push(now);
      if (respawns.length > MAX_RESPAWNS_PER_MINUTE) {
        options.log.error({ slot }, "path worker keeps exiting, giving up");
        giveUp();
        return;
      }
      spawn(slot);
      dispatch();
    });
    post(worker, { type: "init", maps: options.sources() });
  };

  return {
    start() {
      for (let slot = 0; slot < options.workers; slot++) spawn(slot);
    },
    request(request) {
      return new Promise<PathOutcome>((resolve) => {
        const job: Job = { request, resolve, enqueuedAt: performance.now() };
        const queue = queues[request.priority];
        if (closed || failed || queue.length >= maxQueue) {
          resolve({ status: "busy", waitMs: 0 });
          return;
        }
        queue.push(job);
        dispatch();
      });
    },
    edit(mapKey: number, version: number, edit: GridEdit) {
      for (const owner of workers) if (owner) post(owner.worker, { type: "edit", mapKey, version, edit });
    },
    add(init: MapReplicaInit) {
      for (const owner of workers) if (owner) post(owner.worker, { type: "add", map: init });
    },
    drop(mapKey: number) {
      for (const owner of workers) if (owner) post(owner.worker, { type: "drop", mapKey });
    },
    queued: () => queues.command.length + queues.bot.length,
    async close() {
      closed = true;
      const running = workers.filter((owner): owner is PoolWorker => owner !== undefined);
      const pending = [
        ...queues.command.drain(),
        ...queues.bot.drain(),
        ...running.flatMap((owner) => [...owner.inFlight.values()]),
      ];
      for (const owner of running) owner.inFlight.clear();
      for (const job of pending) job.resolve({ status: "busy", waitMs: elapsed(job) });
      await Promise.all(running.map((owner) => owner.worker.terminate()));
      workers.length = 0;
    },
  };
}
