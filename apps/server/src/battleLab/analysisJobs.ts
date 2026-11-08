// 밸런스 분석 일(분포 상성·영향도) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)" 3·4절
// tRPC balanceAnalysis.*(src/trpc/balanceAnalysis.ts)가 D1 권한(tuning:read 두 겹)을 거친 뒤 부른다. 앱에 하나(전투 실험실이 만든다).
// - start: 입력 검사(범위·예산) → 계획(사양은 요청 때 실효 값 한 벌) → 사용자 속도 제한 → 서버 전체 한 번에 하나(바쁘면 busy) →
//   감사 기록(balance_analysis.start, 못 쓰면 시작하지 않음) → 묶음 일(워커). 진행은 판 단위로 센다.
// - status·list: 일 주인만 본다(남의 일 ID는 unknown_job). 진행 조회는 자주 오므로 D1 조회 제한 대신 따로 센다(pollsPerUser).
// - cancel: 주인만. 워커를 끝내고 감사 기록(balance_analysis.cancel). 끝난 일은 그대로 둔다.
// 일과 결과는 메모리에만 둔다(서버를 다시 켜면 사라진다 — 같은 입력·시드면 같은 결과라 다시 돌리면 된다). 끝난 일은 30분 뒤,
// 또는 전체 20개를 넘으면 오래된 것부터 지운다.
// 전투 실험실·대결의 바쁨 표시(gate.ts)와는 따로 센다: 분석 일은 몇 분 걸릴 수 있어 그동안 실험실 한 판을 막지 않는다(워커 둘까지).
import { randomBytes } from "node:crypto";
import {
  type AnalysisJobView,
  type AnalysisListResponse,
  type AnalysisResult,
  type AnalysisStartInput,
  type AnalysisStatusResponse,
  analysisCost,
  analysisProblem,
} from "@terra/shared/balanceAnalysis";
import { type AuditEntry, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import { type AnalysisPlan, matrixPlan, sensitivityPlan } from "./analysis.ts";
import { flatArena } from "./arena.ts";
import { BatchRunError, type BatchHandle, type BatchRunner } from "./analysisRunner.ts";
import { type LabRules, LabUnitError } from "./build.ts";

/** 받지 않은 요청의 message. 까닭은 data.reason(@terra/shared ANALYSIS_REASONS) */
export const ANALYSIS_REJECTED = "BALANCE_ANALYSIS_REJECTED";
/** 서버 기록 메시지 */
export const ANALYSIS_DONE_MESSAGE = "balance analysis finished";
export const ANALYSIS_AUDIT = { start: "balance_analysis.start", cancel: "balance_analysis.cancel" } as const;

export interface AnalysisLimits {
  /** 사용자마다 일 시작 */
  startsPerUser: { capacity: number; refillPerMinute: number };
  /** 사용자마다 진행·목록 조회 */
  pollsPerUser: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_ANALYSIS_LIMITS: AnalysisLimits = {
  startsPerUser: { capacity: 3, refillPerMinute: 6 },
  pollsPerUser: { capacity: 30, refillPerMinute: 180 },
};

/** 끝난 일을 남겨 두는 시간·전체 수 */
const KEEP_MS = 30 * 60_000;
const KEEP_MAX = 20;
/** 사용자 목록에 보이는 수 */
const LIST_MAX = 5;

/** 워커 제한 시간: 최악 비용 1 전투 초당 20ms(개발 컨테이너 잰 값의 약 15배 여유), 2분~30분 */
export const timeoutFor = (battleSeconds: number): number =>
  Math.min(30 * 60_000, Math.max(2 * 60_000, battleSeconds * 20));

export interface AnalysisLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export interface AnalysisService {
  start(db: Database, viewer: Viewer, ip: string, input: AnalysisStartInput): Promise<AnalysisJobView>;
  status(viewer: Viewer, id: string): AnalysisStatusResponse;
  cancel(db: Database, viewer: Viewer, ip: string, id: string): Promise<AnalysisJobView>;
  list(viewer: Viewer): AnalysisListResponse;
  /** 진행·목록 조회 속도 제한(라우터가 부른다). 넘으면 TOO_MANY_REQUESTS */
  admitPoll(viewer: Viewer): void;
}

interface JobRecord {
  readonly id: string;
  readonly owner: string;
  readonly kind: "matrix" | "sensitivity";
  readonly total: number;
  readonly battleSeconds: number;
  readonly startedAtMs: number;
  state: AnalysisJobView["state"];
  done: number;
  finishedAtMs: number | null;
  reason: string | null;
  result: AnalysisResult | null;
  handle: BatchHandle | null;
}

const rejected = (reason: string) => reasonedError("BAD_REQUEST", ANALYSIS_REJECTED, reason);

export function createAnalysisService(deps: {
  rules: () => { rules: LabRules; revision: number };
  batches: BatchRunner;
  now: () => number;
  log: AnalysisLog;
  limits?: Partial<AnalysisLimits> | undefined;
  /** 감사 기록 쓰기(시험이 바꾼다). 기본 = audit_log 표 */
  audit?: ((db: Database, entry: AuditEntry) => Promise<void>) | undefined;
}): AnalysisService {
  const { batches, now, log } = deps;
  const limits = { ...DEFAULT_ANALYSIS_LIMITS, ...deps.limits };
  const starts = createRateLimiter({ ...limits.startsPerUser, now });
  const polls = createRateLimiter({ ...limits.pollsPerUser, now });
  const audit = deps.audit ?? writeAudit;
  const jobs = new Map<string, JobRecord>();

  const viewOf = (job: JobRecord): AnalysisJobView => ({
    id: job.id,
    kind: job.kind,
    state: job.state,
    done: job.done,
    total: job.total,
    battleSeconds: job.battleSeconds,
    startedAtMs: job.startedAtMs,
    finishedAtMs: job.finishedAtMs,
    elapsedMs: (job.finishedAtMs ?? now()) - job.startedAtMs,
    reason: job.reason,
  });

  const prune = (): void => {
    const at = now();
    for (const [id, job] of jobs)
      if (job.finishedAtMs !== null && at - job.finishedAtMs > KEEP_MS) jobs.delete(id);
    const finished = [...jobs.values()].filter((job) => job.finishedAtMs !== null);
    finished.sort((a, b) => (a.finishedAtMs ?? 0) - (b.finishedAtMs ?? 0));
    while (jobs.size > KEEP_MAX && finished.length > 0) {
      const oldest = finished.shift();
      if (oldest) jobs.delete(oldest.id);
    }
  };

  const running = (): boolean => [...jobs.values()].some((job) => job.state === "running");

  const owned = (viewer: Viewer, id: string): JobRecord => {
    const job = jobs.get(id);
    if (!job || job.owner !== viewer.id) throw reasonedError("NOT_FOUND", ANALYSIS_REJECTED, "unknown_job");
    return job;
  };

  /** 계획(요청 때 실효 값 한 벌: 사양과 판정 계수가 같은 스냅숏) */
  const planOf = (input: AnalysisStartInput): { plan: AnalysisPlan; rules: LabRules } => {
    const { rules, revision } = deps.rules();
    try {
      const plan =
        input.kind === "matrix"
          ? matrixPlan(input, rules, revision)
          : sensitivityPlan(input, rules, revision);
      return { plan, rules };
    } catch (error) {
      // 모르는 유닛 종류, 1차가 판정 입력 범위를 넘음(RangeError) → 입력 문제
      if (error instanceof LabUnitError || error instanceof RangeError) throw rejected("invalid_unit");
      throw error;
    }
  };

  const finish = (job: JobRecord, state: AnalysisJobView["state"], reason: string | null): void => {
    job.state = state;
    job.reason = reason;
    job.finishedAtMs = now();
    job.handle = null;
    log.info(
      {
        job: job.id,
        kind: job.kind,
        state,
        reason,
        ms: job.finishedAtMs - job.startedAtMs,
        battles: job.total,
        done: job.done,
      },
      ANALYSIS_DONE_MESSAGE,
    );
  };

  return {
    admitPoll(viewer) {
      if (!polls.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
    },

    async start(db, viewer, ip, input) {
      const problem = analysisProblem(input);
      if (problem !== null) throw rejected(problem);
      const { plan, rules } = planOf(input);
      const cost = analysisCost(input);
      const total = plan.cells.length * plan.runs;
      if (!starts.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
      prune();
      if (total > 0 && running()) throw reasonedError("TOO_MANY_REQUESTS", "BALANCE_BUSY", "busy");
      const id = `job_${randomBytes(6).toString("hex")}`;
      const summary =
        input.kind === "matrix"
          ? { builds: input.builds.map((build) => build.id), sums: [...input.sums] }
          : { sum: input.sum, mode: input.mode, steps: [...input.steps] };
      // 감사 기록(무엇을·얼마나 돌렸나). 못 쓰면 시작하지 않는다
      await audit(db, {
        actor: { kind: "user", id: viewer.id, ip },
        action: ANALYSIS_AUDIT.start,
        targetId: null,
        after: {
          job: id,
          kind: input.kind,
          battles: total,
          battleSeconds: cost.battleSeconds,
          runs: input.runs,
          seed: input.seed,
          limitSec: input.conditions.limitSec,
          teamSize: input.conditions.teamSize,
          level: input.conditions.level,
          mode: input.conditions.mode,
          ...summary,
        },
      });
      const job: JobRecord = {
        id,
        owner: viewer.id,
        kind: input.kind,
        total,
        battleSeconds: cost.battleSeconds,
        startedAtMs: now(),
        state: "running",
        done: 0,
        finishedAtMs: null,
        reason: null,
        result: null,
        handle: null,
      };
      jobs.set(id, job);
      if (plan.cells.length === 0) {
        job.result = plan.assemble([]);
        finish(job, "done", null);
        return viewOf(job);
      }
      const handle = batches(
        {
          cells: plan.cells,
          map: flatArena(),
          coefficients: rules.coefficients,
          limitMs: plan.limitMs,
          runs: plan.runs,
        },
        {
          onProgress: (done) => {
            if (job.state === "running") job.done = Math.min(total, done);
          },
          timeoutMs: timeoutFor(cost.battleSeconds),
        },
      );
      job.handle = handle;
      handle.promise.then(
        (results) => {
          if (job.state !== "running") return;
          job.done = total;
          job.result = plan.assemble(results);
          finish(job, "done", null);
        },
        (error: unknown) => {
          if (job.state !== "running") return;
          const reason = error instanceof BatchRunError ? error.reason : "failed";
          if (reason === "cancelled") finish(job, "cancelled", null);
          else {
            log.warn({ err: error, job: id, reason }, "balance analysis failed");
            finish(job, "failed", reason);
          }
        },
      );
      return viewOf(job);
    },

    status(viewer, id) {
      const job = owned(viewer, id);
      return { job: viewOf(job), result: job.result };
    },

    async cancel(db, viewer, ip, id) {
      const job = owned(viewer, id);
      if (job.state !== "running") return viewOf(job);
      await audit(db, {
        actor: { kind: "user", id: viewer.id, ip },
        action: ANALYSIS_AUDIT.cancel,
        targetId: null,
        after: { job: id, done: job.done, total: job.total },
      });
      job.handle?.cancel();
      finish(job, "cancelled", null);
      return viewOf(job);
    },

    list(viewer) {
      prune();
      const mine = [...jobs.values()]
        .filter((job) => job.owner === viewer.id)
        .toSorted((a, b) => b.startedAtMs - a.startedAtMs)
        .slice(0, LIST_MAX)
        .map(viewOf);
      return { jobs: mine, busy: running() };
    },
  };
}
