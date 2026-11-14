// 전투 보고서 일 — docs/adr/2026-11-14-battle-report.md. tRPC battleReport.*(src/trpc/battleReport.ts)가 D1 권한(tuning:read 두 겹)을 거친 뒤
// 부른다. 앱에 하나(전투 실험실이 만들어 들고 있다 — 같은 실효 규칙·지형·사양 만들기).
// - start: 입력 검사(범위·예산·A/B 종류·설정 칸) → 판 재료(요청 때 실효 값 한 벌, B는 그 위에 설정 칸 바꿈) → 사용자 속도 제한 →
//   서버 전체 한 번에 하나(바쁘면 busy) → 감사 기록(battle_report.start, 못 쓰면 시작하지 않음) → 워커. 끝나면 battle_reports에 저장.
// - status·jobs: 일 주인만(남의 일 ID는 unknown_job). cancel: 주인만, 워커를 끝내고 감사 기록(battle_report.cancel).
// - list·get: dev·admin 누구나(팀이 같이 보는 기록). trace: 저장된 기록의 판 하나를 지금 규칙으로 다시 돌려 공격 단계를 낸다.
// 일은 메모리에만(30분·20개). 기록은 DB(추가만). 전투 실험실 한 판·분석 일과는 따로 센다(워커 셋까지 — 각 힙 상한 128~160MB).
import { randomBytes } from "node:crypto";
import type { LabDropped } from "@terra/shared/battleLab";
import {
  type BattleReportBody,
  type BattleReportListInput,
  type BattleReportListResponse,
  type BattleReportRecord,
  type ReportJobView,
  type ReportJobsResponse,
  type ReportSetup,
  type ReportStartInput,
  type ReportStatusResponse,
  type ReportTraceInput,
  type ReportTraceResponse,
  type ReportTuningChange,
  reportBattleSeconds,
  reportProblem,
} from "@terra/shared/battleReport";
import type { BattleMapInput } from "@terra/sim";
import { SIM_VERSION, combatCoefficientsFrom, societyCoefficientsFrom } from "@terra/sim";
import type { SiegeCityKit } from "@terra/sim/city";
import { type AuditEntry, writeAudit } from "../auth/store.ts";
import { timeoutFor } from "../battleLab/analysisJobs.ts";
import { type LabRules, LabUnitError } from "../battleLab/build.ts";
import type { ArenaTerrains } from "../battleLab/terrain.ts";
import type { Database } from "../db/client.ts";
import { createRateLimiter } from "../rateLimit.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningShared } from "../tuning/services.ts";
import type { ReportJob } from "./batch.ts";
import type { PlaySetup } from "./play.ts";
import { ReportRunError, type ReportHandle, type ReportRunner } from "./runner.ts";
import { playSetupOf } from "./setup.ts";
import { insertReport, listReports, readReport } from "./store.ts";

export const REPORT_REJECTED = "BATTLE_REPORT_REJECTED";
export const REPORT_DONE_MESSAGE = "battle report finished";
export const REPORT_AUDIT = { start: "battle_report.start", cancel: "battle_report.cancel" } as const;

export interface ReportLimits {
  startsPerUser: { capacity: number; refillPerMinute: number };
  pollsPerUser: { capacity: number; refillPerMinute: number };
  tracesPerUser: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_REPORT_LIMITS: ReportLimits = {
  startsPerUser: { capacity: 3, refillPerMinute: 6 },
  pollsPerUser: { capacity: 30, refillPerMinute: 180 },
  tracesPerUser: { capacity: 4, refillPerMinute: 12 },
};

const KEEP_MS = 30 * 60_000;
const KEEP_MAX = 20;
const LIST_MAX = 5;
/** 한 대 풀이 워커 제한 시간(공성 한 판 최악 수십 초) */
const TRACE_TIMEOUT_MS = 120_000;

export interface ReportLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export interface ReportService {
  start(db: Database, viewer: Viewer, ip: string, input: ReportStartInput): Promise<ReportJobView>;
  status(viewer: Viewer, id: string): ReportStatusResponse;
  cancel(db: Database, viewer: Viewer, ip: string, id: string): Promise<ReportJobView>;
  jobs(viewer: Viewer): ReportJobsResponse;
  list(db: Database, input: BattleReportListInput): Promise<BattleReportListResponse>;
  get(db: Database, id: string): Promise<BattleReportRecord>;
  trace(db: Database, viewer: Viewer, input: ReportTraceInput): Promise<ReportTraceResponse>;
  admitPoll(viewer: Viewer): void;
}

interface JobRecord {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly mode: ReportSetup["mode"];
  readonly total: number;
  readonly startedAtMs: number;
  state: ReportJobView["state"];
  done: number;
  finishedAtMs: number | null;
  reason: string | null;
  reportId: string | null;
  record: BattleReportRecord | null;
  handle: ReportHandle<unknown> | null;
}

const rejected = (reason: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST") =>
  reasonedError(code, REPORT_REJECTED, reason);

export function createReportService(deps: {
  tuning: TuningShared;
  roster: RosterCatalog;
  terrains: ArenaTerrains;
  runner: ReportRunner;
  now: () => number;
  log: ReportLog;
  limits?: Partial<ReportLimits> | undefined;
  audit?: ((db: Database, entry: AuditEntry) => Promise<void>) | undefined;
  /** 공성 도시 시설 발자국(팩). 없으면 sim TEST_SIEGE_KIT */
  kit?: SiegeCityKit | undefined;
  /** 기록 쓰기(시험이 바꾼다). 기본 = battle_reports 표 */
  store?: { insert: typeof insertReport; list: typeof listReports; read: typeof readReport } | undefined;
}): ReportService {
  const { tuning, roster, terrains, runner, now, log } = deps;
  const { state } = tuning;
  const limits = { ...DEFAULT_REPORT_LIMITS, ...deps.limits };
  const starts = createRateLimiter({ ...limits.startsPerUser, now });
  const polls = createRateLimiter({ ...limits.pollsPerUser, now });
  const traces = createRateLimiter({ ...limits.tracesPerUser, now });
  const audit = deps.audit ?? writeAudit;
  const store = deps.store ?? { insert: insertReport, list: listReports, read: readReport };
  const jobs = new Map<string, JobRecord>();

  /** 실효 규칙 한 벌(B는 설정 칸 바꿈을 얹는다). 칸이 없거나 범위 밖이면 거절 */
  const rulesOf = (changes: readonly ReportTuningChange[]) => {
    const snapshot = state.snapshot();
    const values = new Map(snapshot.values);
    const statChanges: { id: string; value: number }[] = [];
    for (const change of changes) {
      const slot = state.slot(change.id);
      if (!slot) throw rejected("unknown_tuning");
      if (slot.structural || !slot.inRange(change.value)) throw rejected("tuning_out_of_range");
      if (state.statCell(change.id)) statChanges.push(change);
      else values.set(change.id, change.value);
    }
    const society = societyCoefficientsFrom(values);
    const catalog =
      statChanges.length > 0
        ? { ...roster.combat, statTable: state.statTableWith(statChanges) }
        : roster.combat;
    const rules: LabRules = {
      catalog,
      coefficients: combatCoefficientsFrom(values, undefined, state.combatFormulas()),
      growthPm: society.cyborg.growthPm,
      maxLevel: society.cyborg.maxLevel,
    };
    return { rules, society, revision: snapshot.revision };
  };

  const arenaMapOf = async (setup: ReportSetup): Promise<BattleMapInput | null> => {
    if (setup.mode !== "arena") return null;
    const pick = await terrains.map(setup.terrain).catch((error: unknown) => {
      log.warn({ err: error, terrain: setup.terrain }, "battle report terrain failed");
      return null;
    });
    if (!pick) throw rejected("unknown_terrain");
    return pick.map;
  };

  /** 설정 하나 → 판 재료(입력 문제는 거절로 바꾼다) */
  const build = async (
    setup: ReportSetup,
    changes: readonly ReportTuningChange[],
  ): Promise<{ play: PlaySetup; dropped: LabDropped[]; revision: number }> => {
    const arenaMap = await arenaMapOf(setup);
    const { rules, society, revision } = rulesOf(changes);
    try {
      return { ...playSetupOf(setup, { rules, society, arenaMap, kit: deps.kit }), revision };
    } catch (error) {
      if (error instanceof LabUnitError || error instanceof RangeError) throw rejected("invalid_unit");
      throw error;
    }
  };

  const viewOf = (job: JobRecord): ReportJobView => ({
    id: job.id,
    name: job.name,
    mode: job.mode,
    state: job.state,
    done: job.done,
    total: job.total,
    startedAtMs: job.startedAtMs,
    elapsedMs: (job.finishedAtMs ?? now()) - job.startedAtMs,
    reason: job.reason,
    reportId: job.reportId,
  });

  const prune = (): void => {
    const at = now();
    for (const [id, job] of jobs)
      if (job.finishedAtMs !== null && at - job.finishedAtMs > KEEP_MS) jobs.delete(id);
    const finished = [...jobs.values()]
      .filter((job) => job.finishedAtMs !== null)
      .toSorted((a, b) => (a.finishedAtMs ?? 0) - (b.finishedAtMs ?? 0));
    while (jobs.size > KEEP_MAX && finished.length > 0) {
      const oldest = finished.shift();
      if (oldest) jobs.delete(oldest.id);
    }
  };

  const running = (): boolean => [...jobs.values()].some((job) => job.state === "running");

  const owned = (viewer: Viewer, id: string): JobRecord => {
    const job = jobs.get(id);
    if (!job || job.owner !== viewer.id) throw rejected("unknown_job", "NOT_FOUND");
    return job;
  };

  const finish = (job: JobRecord, next: ReportJobView["state"], reason: string | null): void => {
    job.state = next;
    job.reason = reason;
    job.finishedAtMs = now();
    job.handle = null;
    log.info(
      {
        job: job.id,
        mode: job.mode,
        state: next,
        reason,
        ms: job.finishedAtMs - job.startedAtMs,
        battles: job.total,
        done: job.done,
      },
      REPORT_DONE_MESSAGE,
    );
  };

  return {
    admitPoll(viewer) {
      if (!polls.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
    },

    async start(db, viewer, ip, input) {
      const problem = reportProblem(input);
      if (problem !== null) throw rejected(problem);
      const a = await build(input.setup, []);
      const b = input.variant ? await build(input.variant.setup ?? input.setup, input.variant.tuning) : null;
      if (!starts.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
      prune();
      if (running()) throw reasonedError("TOO_MANY_REQUESTS", "BATTLE_REPORT_BUSY", "busy");
      const id = `rjob_${randomBytes(6).toString("hex")}`;
      const seconds = reportBattleSeconds(input);
      const total = input.runs * (b ? 2 : 1);
      await audit(db, {
        actor: { kind: "user", id: viewer.id, ip },
        action: REPORT_AUDIT.start,
        targetId: null,
        after: {
          job: id,
          name: input.name,
          mode: input.setup.mode,
          runs: input.runs,
          seed: input.seed,
          variant: input.variant !== null,
          battleSeconds: seconds,
        },
      });
      const job: JobRecord = {
        id,
        owner: viewer.id,
        name: input.name.trim(),
        mode: input.setup.mode,
        total,
        startedAtMs: now(),
        state: "running",
        done: 0,
        finishedAtMs: null,
        reason: null,
        reportId: null,
        record: null,
        handle: null,
      };
      jobs.set(id, job);
      const work: ReportJob = { setups: b ? [a.play, b.play] : [a.play], runs: input.runs, seed: input.seed };
      const handle = runner.report(work, {
        onProgress: (done) => {
          if (job.state === "running") job.done = Math.min(total, done);
        },
        timeoutMs: timeoutFor(seconds),
      });
      job.handle = handle;
      const meta = {
        contentVersion: tuning.pack.contentVersion,
        contentHash: tuning.pack.contentHash,
        simVersion: SIM_VERSION,
        tuningRevision: a.revision,
      };
      handle.promise.then(
        async (results) => {
          if (job.state !== "running") return;
          const [first, second] = results;
          if (!first) {
            finish(job, "failed", "failed");
            return;
          }
          job.done = total;
          const report: BattleReportBody = { a: first, b: second ?? null };
          const durationMs = now() - job.startedAtMs;
          const reportId = `rep_${randomBytes(6).toString("hex")}`;
          let saved = true;
          try {
            await store.insert(db, {
              id: reportId,
              input,
              report,
              ...meta,
              durationMs,
              createdBy: viewer.id,
            });
          } catch (error) {
            saved = false;
            log.warn({ err: error, job: id }, "battle report save failed");
          }
          job.reportId = saved ? reportId : null;
          job.record = {
            id: saved ? reportId : "",
            name: input.name.trim(),
            mode: input.setup.mode,
            runs: input.runs,
            seed: input.seed,
            variant: input.variant !== null,
            scorePm: first.outcome.scorePm,
            scoreBPm: second?.outcome.scorePm ?? null,
            createdAtMs: now(),
            createdBy: viewer.loginId,
            ...meta,
            durationMs,
            note: input.note.trim(),
            input,
            report,
          };
          finish(job, "done", saved ? null : "save_failed");
        },
        (error: unknown) => {
          if (job.state !== "running") return;
          const reason = error instanceof ReportRunError ? error.reason : "failed";
          if (reason === "cancelled") finish(job, "cancelled", null);
          else {
            log.warn({ err: error, job: id, reason }, "battle report failed");
            finish(job, "failed", reason);
          }
        },
      );
      return viewOf(job);
    },

    status(viewer, id) {
      const job = owned(viewer, id);
      return { job: viewOf(job), report: job.record };
    },

    async cancel(db, viewer, ip, id) {
      const job = owned(viewer, id);
      if (job.state !== "running") return viewOf(job);
      await audit(db, {
        actor: { kind: "user", id: viewer.id, ip },
        action: REPORT_AUDIT.cancel,
        targetId: null,
        after: { job: id, done: job.done, total: job.total },
      });
      job.handle?.cancel();
      finish(job, "cancelled", null);
      return viewOf(job);
    },

    jobs(viewer) {
      prune();
      const mine = [...jobs.values()]
        .filter((job) => job.owner === viewer.id)
        .toSorted((a, b) => b.startedAtMs - a.startedAtMs)
        .slice(0, LIST_MAX)
        .map(viewOf);
      return { jobs: mine, busy: running() };
    },

    list(db, input) {
      return store.list(db, input);
    },

    async get(db, id) {
      const record = await store.read(db, id);
      if (!record) throw rejected("unknown_report", "NOT_FOUND");
      return record;
    },

    async trace(db, viewer, input) {
      const record = await store.read(db, input.reportId);
      if (!record) throw rejected("unknown_report", "NOT_FOUND");
      if (input.which === "b" && !record.input.variant) throw rejected("invalid_settings");
      if (input.run >= record.input.runs) throw rejected("invalid_settings");
      const variant = record.input.variant;
      const built =
        input.which === "b" && variant
          ? await build(variant.setup ?? record.input.setup, variant.tuning)
          : await build(record.input.setup, []);
      if (!traces.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
      let out;
      try {
        out = await runner.trace(
          { setup: built.play, run: input.run, seed: record.input.seed },
          { timeoutMs: TRACE_TIMEOUT_MS },
        ).promise;
      } catch (error) {
        const reason = error instanceof ReportRunError ? error.reason : "failed";
        log.warn({ err: error, reason }, "battle report trace failed");
        throw reasonedError("INTERNAL_SERVER_ERROR", "BATTLE_REPORT_FAILED", reason);
      }
      return {
        hits: out.hits,
        dropped: out.dropped,
        same:
          built.revision === record.tuningRevision &&
          tuning.pack.contentHash === record.contentHash &&
          SIM_VERSION === record.simVersion,
        winner: out.end.winner,
        endMs: out.end.endMs,
      };
    },
  };
}
