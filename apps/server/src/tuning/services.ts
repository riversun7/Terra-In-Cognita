// 설정 칸 패널 요청 처리 — tRPC tuning.*(src/trpc/tuning.ts)가 권한 미들웨어(우리 권한 표)를 거친 뒤 부른다.
// docs/adr/2026-11-01-dev-settings-panel.md 5·8·9절. 서버가 켤 때 한 번 만드는 것(접근자·속도 제한기·쓰기 차례·잠금)은
// TuningShared, 요청마다 만드는 것(접속 주소·권한 두 번째 확인)은 createTuningServices.
// - 두 겹 권한: 우리 권한 표(미들웨어) + Better Auth userHasPermission(세션을 늘리지 않는다, ADR 38 WP-B와 같은 까닭).
// - 속도 제한(사용자별): 조회와 쓰기를 따로 센다. 넘으면 TOO_MANY_REQUESTS(data.reason "rate_limited").
// - 쓰기는 한 프로세스 안에서 차례로 돈다(serial): 기대 값 확인 → 규칙 검사 → DB(덮어쓰기 + 감사 기록) → 메모리.
// - 값이 지금 팩 값과 같은 저장은 되돌리기로 다룬다(팩 값과 같은 덮어쓰기는 두지 않는다).
import {
  TUNING_HISTORY_LIMIT,
  type TuningEntryView,
  type TuningExportResponse,
  type TuningListResponse,
  type TuningOverrideView,
  normalizeTuningNote,
  tuningUnitFromName,
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
import { tuningScopeOf } from "./scope.ts";
import type { HeldOverride, TuningOverrideRecord, TuningState } from "./state.ts";
import {
  absorbTuningOverrides,
  loadTuningOverrides,
  readTuningHistory,
  revertAllTuningOverrides,
  revertTuningOverride,
  saveTuningOverride,
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

/** 서버가 켤 때 한 번 만든 것 */
export interface TuningShared {
  readonly state: TuningState;
  readonly pack: { readonly packId: string; readonly contentVersion: string; readonly contentHash: string };
  /** 쓰기 잠금(TUNING_EDIT=off) */
  readonly locked: boolean;
  readonly limiters: { readonly reads: RateLimiter; readonly writes: RateLimiter };
  readonly now: () => number;
  /** 쓰기를 차례로 돌린다(앞 쓰기가 실패해도 다음은 돈다) */
  serial<T>(task: () => Promise<T>): Promise<T>;
}

export function createTuningShared(options: {
  state: TuningState;
  pack: TuningShared["pack"];
  locked: boolean;
  now: () => number;
  limits?: Partial<TuningLimits> | undefined;
}): TuningShared {
  const limits = { ...DEFAULT_TUNING_LIMITS, ...options.limits };
  let tail: Promise<unknown> = Promise.resolve();
  return {
    state: options.state,
    pack: options.pack,
    locked: options.locked,
    now: options.now,
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

interface BootLog {
  info(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

/**
 * 켤 때(onReady): DB의 덮어쓰기를 접근자에 싣는다. 값이 지금 팩 값과 같은 줄은 지운다(감사 tuning.absorbed).
 * 팩 값에 규칙 문제가 있으면 알린다(팩 검사·sim 시험이 막지만, 다른 팩을 실었을 때를 위해)
 */
export async function bootTuning(
  db: Database,
  shared: TuningShared,
  log: BootLog,
  options: { attempts?: number; retryMs?: number } = {},
): Promise<void> {
  const attempts = options.attempts ?? BOOT_ATTEMPTS;
  let rows: TuningOverrideRecord[] | undefined;
  for (let attempt = 1; !rows; attempt++) {
    try {
      rows = await loadTuningOverrides(db);
    } catch (error) {
      if (attempt >= attempts) throw error;
      log.warn({ err: error, attempt }, "tuning boot: database not ready, retrying");
      await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? BOOT_RETRY_MS));
    }
  }
  const absorbed = shared.state.load(rows);
  await absorbTuningOverrides(db, absorbed, shared.pack.contentVersion);
  const ignored = shared.state.overrides().filter((override) => override.state !== "applied");
  log.info(
    {
      applied: shared.state.appliedCount(),
      absorbed: absorbed.map((row) => row.id),
      ignored: ignored.map((override) => `${override.id}:${override.state}`),
      locked: shared.locked,
    },
    "tuning overrides",
  );
  const packProblems = shared.state.problems();
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

function overrideView(held: HeldOverride): TuningOverrideView {
  return {
    value: held.value,
    packValueAtSave: held.packValue,
    contentVersionAtSave: held.contentVersion,
    note: held.note,
    updatedBy: held.updatedByName,
    updatedAt: held.updatedAtMs,
    state: held.state,
    problems: held.problems,
  };
}

/** 칸 목록(화면) — 팩 차례, 팩에 없는 덮어쓰기는 따로 */
export function tuningList(shared: TuningShared): TuningListResponse {
  const { state } = shared;
  const values = state.values();
  const entries = state.entries.map((entry): TuningEntryView => {
    const held = state.override(entry.id);
    return {
      id: entry.id,
      code: entry.code,
      name: { ko: entry.name.ko, en: entry.name.en },
      unit: entry.unit ?? tuningUnitFromName(entry.name.en),
      min: entry.min ?? null,
      max: entry.max ?? null,
      structural: entry.structural,
      packValue: entry.value,
      value: values.get(entry.id) ?? entry.value,
      scope: tuningScopeOf(entry.id),
      override: held ? overrideView(held) : null,
    };
  });
  const orphans = state
    .overrides()
    .filter((held) => !state.entry(held.id))
    .map((held) => ({ id: held.id, override: overrideView(held) }));
  return {
    contentVersion: shared.pack.contentVersion,
    contentHash: shared.pack.contentHash,
    locked: shared.locked,
    revision: state.revision(),
    entries,
    orphans,
  };
}

/** 내보내기 차이: 적용 중이고 지금 팩 값과 다른 덮어쓰기(ID 차례) */
export function tuningExport(shared: TuningShared): TuningExportResponse {
  const { state, pack } = shared;
  const changes = state.overrides().flatMap((held) => {
    const entry = state.entry(held.id);
    if (!entry || held.state !== "applied" || held.value === entry.value) return [];
    return [{ id: held.id, code: entry.code, from: entry.value, to: held.value }];
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
    },
    fileName: `tuning-${pack.contentVersion.replace("@", "-")}-${stamp}.json`,
  };
}

const rejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", TUNING_REJECTED, reason, details);
const conflict = () => reasonedError("CONFLICT", "REVISION_CONFLICT", "revision_conflict");
const locked = () => reasonedError("FORBIDDEN", "TUNING_LOCKED", "tuning_locked");

function actorOf(viewer: Viewer, ip: string | null): AuditActor & { id: string } {
  return { kind: "admin", id: viewer.id, ip, meta: { roles: viewer.roles } };
}

export interface TuningServicesDeps {
  db: Database;
  shared: TuningShared;
  ip: string | null;
  hasPermission: TuningPermissionCheck;
}

export function createTuningServices(deps: TuningServicesDeps): TuningServices {
  const { db, shared } = deps;
  const { state } = shared;
  const permissionChecks = new Map<TuningAction, Promise<void>>();

  /** 덮어쓰기 하나를 지운다(차례 안에서 부른다). 줄이 없으면 false */
  const revertOne = async (viewer: Viewer, id: string, expected: number): Promise<boolean> => {
    const held = state.override(id);
    if (!held) return false;
    if (held.value !== expected) throw conflict();
    const checked = state.check(id, null);
    if (!checked.ok) throw rejected(checked.reason, checked.problems);
    const outcome = await revertTuningOverride(db, { id, expected, actor: actorOf(viewer, deps.ip) });
    if (outcome === "conflict") throw conflict();
    state.remove(id);
    return outcome === "reverted";
  };

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

    exportDiff: () => Promise.resolve(tuningExport(shared)),

    async set(viewer, input) {
      if (shared.locked) throw locked();
      const note = normalizeTuningNote(input.note);
      if (note === false) throw rejected("invalid_note");
      const entry = state.entry(input.id);
      if (!entry) throw rejected("unknown_entry");
      if (entry.structural && input.confirmStructural !== true) throw rejected("structural_unconfirmed");
      return shared.serial(async () => {
        const current = state.override(input.id)?.value ?? null;
        if (current !== input.expected) throw conflict();
        // 팩 값으로 바꾸기 = 되돌리기(팩 값과 같은 덮어쓰기는 두지 않는다)
        if (input.value === entry.value) {
          if (current !== null) await revertOne(viewer, input.id, current);
          return tuningList(shared);
        }
        const checked = state.check(input.id, input.value);
        if (!checked.ok) throw rejected(checked.reason, checked.problems);
        const outcome = await saveTuningOverride(db, {
          id: input.id,
          value: input.value,
          packValue: entry.value,
          contentVersion: shared.pack.contentVersion,
          note,
          expected: input.expected,
          actor: actorOf(viewer, deps.ip),
        });
        if (outcome.kind === "conflict") throw conflict();
        state.put(outcome.record);
        return tuningList(shared);
      });
    },

    async revert(viewer, input) {
      if (shared.locked) throw locked();
      return shared.serial(async () => {
        await revertOne(viewer, input.id, input.expected);
        return tuningList(shared);
      });
    },

    async revertAll(viewer) {
      if (shared.locked) throw locked();
      return shared.serial(async () => {
        await revertAllTuningOverrides(db, actorOf(viewer, deps.ip));
        state.clear();
        return tuningList(shared);
      });
    },
  };
}
