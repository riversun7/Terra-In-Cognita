// 설정 칸 패널 요청 처리 — tRPC tuning.*(src/trpc/tuning.ts)가 권한 미들웨어(우리 권한 표)를 거친 뒤 부른다.
// docs/adr/2026-11-01-dev-settings-panel.md 5·6·8·9절. 서버가 켤 때 한 번 만드는 것(접근자·속도 제한기·쓰기 차례·기록기)은
// TuningShared, 요청마다 만드는 것(접속 주소·권한 두 번째 확인)은 createTuningServices.
// - 두 겹 권한: 우리 권한 표(미들웨어) + Better Auth userHasPermission(세션을 늘리지 않는다, ADR 38 WP-B와 같은 까닭).
// - 속도 제한(사용자별): 조회와 쓰기를 따로 센다. 넘으면 TOO_MANY_REQUESTS(data.reason "rate_limited").
// - 쓰기는 한 프로세스 안에서 차례로 돈다(serial): 판 확인 → 바꾼 뒤 전체 값 검사(plan) → DB(판 +1·덮어쓰기·감사 기록) → 스냅숏
//   바꿔 끼우기 → 서버 기록 `tuning change`(N1·지표가 판으로 기간을 나눈다, 9절).
// - 켤 때(bootTuning): 가장 나중에 바꾼 것을 고르고(6절) 지울 줄을 정리한다. 정리가 실패해도 시작을 막지 않는다.
import {
  type StatCellChange,
  TUNING_HISTORY_LIMIT,
  type TuningEntryView,
  type TuningExportResponse,
  type TuningListResponse,
  type TuningOverrideView,
  normalizeTuningNote,
} from "@terra/shared/tuning";
import { TRPCError } from "@trpc/server";
import type { FastifyRequest } from "fastify";
import { callBetterAuth } from "../auth/adminServices.ts";
import type { TerraAuth } from "../auth/auth.ts";
import { authHeaders } from "../auth/http.ts";
import type { AuditActor } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { TuningAction, TuningServices, Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import { type ContentEditShared, contentExportEntries } from "../contentEdit/services.ts";
import { tuningScopeOf } from "./scope.ts";
import { tuningPageOf } from "@terra/sim";
import type { TuningOverrideRecord, TuningState } from "./state.ts";
import {
  type FormulaWrite,
  type TuningWrite,
  applyTuningWrites,
  cleanupTuningAtBoot,
  loadTuning,
  readTuningHistory,
  revertAllTuning,
} from "./store.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared TUNING_REASONS) */
export const TUNING_REJECTED = "TUNING_REJECTED";

export interface TuningLimits {
  readsPerUser: { capacity: number; refillPerMinute: number };
  writesPerUser: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_TUNING_LIMITS: TuningLimits = {
  readsPerUser: { capacity: 30, refillPerMinute: 120 },
  writesPerUser: { capacity: 20, refillPerMinute: 60 },
};

/** 서버 기록(pino) — 바꿀 때마다 한 줄(N1·지표 흐름), 켤 때 고른 결과 */
export interface TuningLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

/** 서버 기록 메시지: 바꿀 때마다 */
export const TUNING_CHANGE_MESSAGE = "tuning change";
/** 서버 기록 메시지: 켤 때 고른 결과 */
export const TUNING_BOOT_MESSAGE = "tuning overrides";

/** 서버가 켤 때 한 번 만든 것 */
export interface TuningShared {
  readonly state: TuningState;
  readonly pack: { readonly packId: string; readonly contentVersion: string; readonly contentHash: string };
  readonly limiters: { readonly reads: RateLimiter; readonly writes: RateLimiter };
  readonly now: () => number;
  readonly log: TuningLog;
  /** 쓰기를 차례로 돌린다(앞 쓰기가 실패해도 다음은 돈다) */
  serial<T>(task: () => Promise<T>): Promise<T>;
}

export function createTuningShared(options: {
  state: TuningState;
  pack: TuningShared["pack"];
  now: () => number;
  log: TuningLog;
  limits?: Partial<TuningLimits> | undefined;
}): TuningShared {
  const limits = { ...DEFAULT_TUNING_LIMITS, ...options.limits };
  let tail: Promise<unknown> = Promise.resolve();
  return {
    state: options.state,
    pack: options.pack,
    now: options.now,
    log: options.log,
    limiters: {
      reads: createRateLimiter({ ...limits.readsPerUser, now: options.now }),
      writes: createRateLimiter({ ...limits.writesPerUser, now: options.now }),
    },
    serial<T>(task: () => Promise<T>): Promise<T> {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

/** 켤 때 DB를 기다리는 다시 시도(월드 부팅과 같다: 2초 × 30번) */
const BOOT_ATTEMPTS = 30;
const BOOT_RETRY_MS = 2_000;

/**
 * 켤 때(onReady, 월드 부팅보다 먼저): DB의 판·덮어쓰기를 읽어 가장 나중에 바꾼 것을 고르고(6절) 접근자에 싣는다.
 * 팩이 이긴 줄·새 팩과 맞지 않는 줄은 지우고 감사 기록(system)을 남긴다. 그 정리가 실패해도 시작은 막지 않는다
 * (메모리에는 고른 줄만 싣고, DB 줄은 다음 시작에 다시 고른다). DB에 닿지 못하면 월드 부팅처럼 다시 시도한 뒤 던진다.
 */
export async function bootTuning(
  db: Database,
  shared: TuningShared,
  options: { attempts?: number; retryMs?: number } = {},
): Promise<void> {
  const { state, log } = shared;
  const attempts = options.attempts ?? BOOT_ATTEMPTS;
  let loaded: Awaited<ReturnType<typeof loadTuning>> | undefined;
  for (let attempt = 1; !loaded; attempt++) {
    try {
      loaded = await loadTuning(db);
    } catch (error) {
      if (attempt >= attempts) throw error;
      log.warn({ err: error, attempt }, "tuning boot: database not ready, retrying");
      await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? BOOT_RETRY_MS));
    }
  }
  const selection = state.selectAtBoot(loaded.rows, loaded.formulaRows);
  let revision = loaded.revision;
  const toClean =
    selection.packWon.length +
    selection.dropped.length +
    selection.formulaPackWon.length +
    selection.formulaDropped.length;
  if (toClean > 0) {
    try {
      revision = await cleanupTuningAtBoot(db, selection, shared.pack.contentVersion);
    } catch (error) {
      log.warn({ err: error }, "tuning boot: could not clean up overrides (kept in the database)");
    }
  }
  state.install(selection.keep, revision, selection.formulaKeep);
  log.info(
    {
      tuningRevision: revision,
      applied: [...selection.keep, ...selection.formulaKeep].map((row) => row.id),
      packWon: [
        ...selection.packWon.map(({ row, packValue }) => ({ id: row.id, value: row.value, packValue })),
        ...selection.formulaPackWon.map(({ row }) => ({ id: row.id, formula: true })),
      ],
      dropped: [
        ...selection.dropped.map(({ row, reason }) => ({ id: row.id, value: row.value, reason })),
        ...selection.formulaDropped.map(({ row, reason }) => ({ id: row.id, formula: true, reason })),
      ],
    },
    TUNING_BOOT_MESSAGE,
  );
  const packProblems = state.problems();
  if (packProblems.length > 0) log.warn({ problems: packProblems }, "tuning: effective values break rules");
}

/** 두 번째 권한 확인(Better Auth). 시험은 바꿔 끼운다 */
export type TuningPermissionCheck = (permissions: { tuning: TuningAction[] }) => Promise<boolean>;

/** 요청의 세션으로 Better Auth에 묻는다. 세션을 늘리지 않는다(planetEditor/services.ts betterAuthPermissionCheck와 같은 까닭) */
export function betterAuthTuningCheck(auth: TerraAuth, request: FastifyRequest): TuningPermissionCheck {
  return async (permissions) => {
    const result = await callBetterAuth(() =>
      auth.api.userHasPermission({
        headers: authHeaders(request),
        body: { permissions },
        query: { disableRefresh: true },
      }),
    );
    return result.success;
  };
}

/** 덮어쓰기 줄 → 화면 모양(설정 칸·가중치 칸 같이) */
export function overrideView(record: TuningOverrideRecord): TuningOverrideView {
  return {
    value: record.value,
    packValueAtSave: record.packValue,
    contentVersionAtSave: record.contentVersion,
    note: record.note,
    updatedBy: record.updatedByName,
    updatedAt: record.updatedAtMs,
  };
}

/** 칸 목록(화면) — 팩 차례. 스냅숏 하나로 만든다 */
export function tuningList(shared: TuningShared): TuningListResponse {
  const { state } = shared;
  const snapshot = state.snapshot();
  const entries = state.entries.map((entry): TuningEntryView => {
    const record = snapshot.overrides.get(entry.id);
    return {
      id: entry.id,
      code: entry.code,
      name: { ko: entry.name.ko, en: entry.name.en },
      unit: state.unitOf(entry),
      min: entry.min ?? null,
      max: entry.max ?? null,
      structural: entry.structural,
      packValue: entry.value,
      value: snapshot.values.get(entry.id) ?? entry.value,
      scope: tuningScopeOf(entry.id),
      override: record ? overrideView(record) : null,
      // 분야 페이지(규칙 코드가 정한다)·쉬운 풀이·출처(팩 항목, 2026-11-08 분야별 페이지)
      page: tuningPageOf(entry.id),
      desc: entry.desc ? { ko: entry.desc.ko, en: entry.desc.en } : null,
      source: entry.source ?? null,
    };
  });
  return {
    contentVersion: shared.pack.contentVersion,
    contentHash: shared.pack.contentHash,
    revision: snapshot.revision,
    entries,
    statOverrides: [...snapshot.overrides.keys()].filter((id) => state.statCell(id) !== undefined).length,
    formulaOverrides: snapshot.formulas.size,
  };
}

/**
 * 내보내기 차이: 팩 값과 다른 덮어쓰기(ID 차례). 가중치 표 칸은 statRows(있을 때만, 키 차례 — docs/adr/2026-11-01-balance-screen.md
 * 2절)
 */
export function tuningExport(shared: TuningShared, content?: ContentEditShared): TuningExportResponse {
  const { state, pack } = shared;
  const snapshot = state.snapshot();
  const records = [...snapshot.overrides.values()];
  const changes = records.flatMap((record) => {
    const entry = state.entry(record.id);
    if (!entry || record.value === entry.value) return [];
    return [{ id: record.id, code: entry.code, from: entry.value, to: record.value }];
  });
  const statRows: StatCellChange[] = records.flatMap((record) => {
    const cell = state.statCell(record.id);
    if (!cell || record.value === cell.packValue) return [];
    return [{ row: cell.row.id, field: cell.field, from: cell.packValue, to: record.value }];
  });
  // 팩 항목 덮어쓰기(스킬·아이템 편집기·행동별 소모, docs/adr/2026-11-01-skill-editor.md 7절): 있을 때만. 은퇴 ID도(아이템 편집기 4절)
  const entries = content ? contentExportEntries(content) : [];
  const retiredIds = content ? content.state.worldRetired() : [];
  // 계산식: 팩 식과 다른 덮어쓰기(칸 키 차례, docs/adr/2026-11-01-formula-editor.md)
  const formulas = [...snapshot.formulas.values()].flatMap((record) => {
    const slot = state.formulaSlot(record.id);
    if (!slot || record.source === slot.packSource) return [];
    return [{ id: record.id, from: slot.packSource, to: record.source }];
  });
  const exportedAt = new Date(shared.now()).toISOString();
  const stamp = exportedAt.replaceAll(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return {
    diff: {
      format: "terra-tuning-diff",
      formatVersion: 1,
      exportedAt,
      packId: pack.packId,
      contentVersion: pack.contentVersion,
      contentHash: pack.contentHash,
      changes,
      ...(statRows.length > 0 ? { statRows } : {}),
      ...(entries.length > 0 ? { entries } : {}),
      ...(formulas.length > 0 ? { formulas } : {}),
      ...(retiredIds.length > 0 ? { retiredIds } : {}),
    },
    fileName: `tuning-${pack.contentVersion.replace("@", "-")}-${stamp}.json`,
  };
}

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", TUNING_REJECTED, reason, details);
const conflict = () => reasonedError("CONFLICT", "REVISION_CONFLICT", "revision_conflict");

function actorOf(viewer: Viewer, ip: string | null): AuditActor & { id: string } {
  return { kind: "admin", id: viewer.id, ip, meta: { roles: viewer.roles } };
}

export interface TuningServicesDeps {
  db: Database;
  shared: TuningShared;
  ip: string | null;
  hasPermission: TuningPermissionCheck;
  /** 스킬 편집기 덮어쓰기(내보내기 차이에 팩 항목을 함께 싣는다) */
  content?: ContentEditShared | undefined;
}

export function createTuningServices(deps: TuningServicesDeps): TuningServices {
  const { db, shared } = deps;
  const { state, log } = shared;
  const permissionChecks = new Map<TuningAction, Promise<void>>();

  return {
    ensurePermission(action) {
      let check = permissionChecks.get(action);
      if (!check) {
        check = deps.hasPermission({ tuning: [action] }).then((allowed) => {
          if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
        });
        permissionChecks.set(action, check);
      }
      return check;
    },

    admit(viewer, action) {
      const limiter = action === "write" ? shared.limiters.writes : shared.limiters.reads;
      if (!limiter.take(viewer.id)) throw reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
    },

    list: () => Promise.resolve(tuningList(shared)),

    async history() {
      return { rows: await readTuningHistory(db, TUNING_HISTORY_LIMIT) };
    },

    exportDiff: () => Promise.resolve(tuningExport(shared, deps.content)),

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      return shared.serial(async () => {
        if (state.revision() !== input.expectedRevision) throw conflict();
        const plan = state.plan(input.changes, input.formulas ?? []);
        if (!plan.ok)
          throw rejected(
            plan.reason,
            plan.reason === "invalid_formula"
              ? (plan.formulaErrors ?? []).map((error) => `${error.code}@${error.s}`)
              : plan.problems,
          );
        // 구조 값(D-5054)이 들면 확인 창을 거쳐야 한다(되돌리기 포함)
        const structural = plan.changes.some((change) => state.slot(change.id)?.structural === true);
        if (structural && input.confirmStructural !== true) throw rejected("structural_unconfirmed");
        if (plan.changes.length === 0 && plan.formulas.length === 0) return tuningList(shared);
        // 설정 칸·가중치 칸(밸런스 화면) 모두 저장 때의 팩 값·단위를 함께 둔다(켤 때 "가장 나중에 바꾼 것" 판정)
        const writes: TuningWrite[] = plan.changes.flatMap((change) => {
          const target = state.slot(change.id);
          return target ? [{ ...change, packValue: target.packValue, unit: target.unit }] : [];
        });
        // 계산식도 저장 때의 팩 식을 함께 둔다(켤 때 "가장 나중에 바꾼 것")
        const formulaWrites: FormulaWrite[] = plan.formulas.flatMap((change) => {
          const slot = state.formulaSlot(change.id);
          return slot ? [{ ...change, packSource: slot.packSource }] : [];
        });
        const outcome = await applyTuningWrites(db, {
          expectedRevision: input.expectedRevision,
          writes,
          formulaWrites,
          contentVersion: shared.pack.contentVersion,
          note,
          actor: actorOf(viewer, deps.ip),
        });
        if (outcome.kind === "conflict") throw conflict();
        state.install(outcome.records, outcome.revision, outcome.formulaRecords);
        log.info(
          {
            tuningRevision: outcome.revision,
            at: shared.now(),
            actor: viewer.loginId,
            changes: writes.map((write) => ({ id: write.id, before: write.before, after: write.after })),
            ...(formulaWrites.length > 0
              ? {
                  formulas: formulaWrites.map((write) => ({
                    id: write.id,
                    before: write.before,
                    after: write.after,
                  })),
                }
              : {}),
            note,
          },
          TUNING_CHANGE_MESSAGE,
        );
        return tuningList(shared);
      });
    },

    async revertAll(viewer, input) {
      return shared.serial(async () => {
        if (state.revision() !== input.expectedRevision) throw conflict();
        const snapshot = state.snapshot();
        const removed = [
          ...[...snapshot.overrides.values()].map((record) => ({
            id: record.id,
            before: record.value,
            after: null,
          })),
          ...[...snapshot.formulas.values()].map((record) => ({
            id: record.id,
            before: record.source,
            after: null,
          })),
        ];
        const outcome = await revertAllTuning(db, {
          expectedRevision: input.expectedRevision,
          actor: actorOf(viewer, deps.ip),
        });
        if (outcome.kind === "conflict") throw conflict();
        state.install([], outcome.revision, []);
        log.info(
          {
            tuningRevision: outcome.revision,
            at: shared.now(),
            actor: viewer.loginId,
            changes: removed,
            note: null,
          },
          TUNING_CHANGE_MESSAGE,
        );
        return tuningList(shared);
      });
    },
  };
}
