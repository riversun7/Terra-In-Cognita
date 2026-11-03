// 팩 항목 덮어쓰기 요청 처리 — 스킬 편집기(tRPC skills.*)·아이템 편집기(tRPC items.*, src/itemEdit/)가 같이 쓴다. 권한(설정 칸 패널과
// 같은 tuning:read·write 두 겹)과 속도 제한은 라우터가 먼저 본다. docs/adr/2026-11-01-skill-editor.md 3·4·6절, 2026-11-01-item-editor.md 4절.
// - 쓰기는 한 프로세스 안에서 차례로 돈다(serial, 두 라우터가 ContentEditShared 하나를 같이 쓴다): 판·baseHash 확인 → 묶음을 얹은
//   실효 팩 전체 검사(plan) → DB(판 +1·덮어쓰기·은퇴 ID·감사 기록) → 스냅숏 바꿔 끼우기 → 서버 기록 `content change`.
//   바로 든다(D-461): 다음 전투·화면 요청부터 새 항목을 쓴다.
// - 판 충돌 규칙: 묶음의 모든 바꿈에 baseHash가 있으면 판이 달라도(다른 항목만 바뀜) 받고, 그 항목이 그새 바뀌었으면 entry_changed.
//   baseHash가 없는 옛 기기는 판이 다르면 충돌(revision_conflict).
// - 켤 때(bootContentEdit): 가장 나중에 바꾼 것을 고르고(팩 항목이 저장 뒤에 바뀌었으면 팩이 이김) 지울 줄을 정리한다. 정리가 실패해도,
//   고르기가 던져도 시작을 막지 않는다(팩 항목으로 돈다).
import type { ContentEditCategory } from "@terra/shared/contentEdit";
import type { EntryDiffChange } from "@terra/shared/skillEditor";
import {
  SKILL_EDITOR_HISTORY_LIMIT,
  type SkillEditorChange,
  type SkillEditorHistoryRow,
  type SkillEditorListResponse,
} from "@terra/shared/skillEditor";
import type { ActionCostRow, StaminaBasisView } from "@terra/shared/skillEditor";
import { normalizeTuningNote } from "@terra/shared/tuning";
import type { AuditActor } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { Viewer } from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import type { TuningLog } from "../tuning/services.ts";
import { type ContentEditState, type ContentPut, type EntryJson, contentKey, entryHash } from "./state.ts";
import {
  applyContentWrites,
  cleanupContentAtBoot,
  loadContentOverrides,
  readContentHistory,
} from "./store.ts";
import { actionRows, effectViewOf, skillViews } from "./views.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason(@terra/shared SKILL_EDITOR_REASONS) */
export const SKILL_EDITOR_REJECTED = "SKILL_EDITOR_REJECTED";
/** 서버 기록 메시지: 바꿀 때마다 */
export const CONTENT_CHANGE_MESSAGE = "content change";
/** 서버 기록 메시지: 켤 때 고른 결과 */
export const CONTENT_BOOT_MESSAGE = "content overrides";
/** 서버 기록 메시지: 스냅숏의 꺼진 참조(켜진 장비 → 꺼진 스킬, 켜진 스킬 → 꺼진 효과, 전투 자료에서 뺌). 스냅숏마다 한 번 */
export const CONTENT_REFERENCES_MESSAGE = "content references dropped";

/** 지금 스냅숏에 꺼진 참조가 있으면 한 줄 남긴다 */
function logDroppedReferences(shared: ContentEditShared): void {
  const { state, log } = shared;
  const refs = state.droppedReferences();
  if (refs.itemSkills.length === 0 && refs.skillEffects.length === 0) return;
  log.warn(
    { contentRevision: state.revision(), itemSkills: refs.itemSkills, skillEffects: refs.skillEffects },
    CONTENT_REFERENCES_MESSAGE,
  );
}

/** 서버가 켤 때 한 번 만든 것 */
export interface ContentEditShared {
  readonly state: ContentEditState;
  readonly pack: { readonly packId: string; readonly contentVersion: string };
  readonly now: () => number;
  readonly log: TuningLog;
  /**
   * 행동별 소모 화면의 스태미나 기준(D-511, staminaBasis.ts): 설정 칸·계산식·전투 자료 실효 값이 있을 때만(app.ts가 넣는다).
   * 없으면 목록의 stamina = null(화면은 기준 칸을 숨긴다)
   */
  readonly staminaBasis?: ((rows: readonly ActionCostRow[]) => StaminaBasisView) | undefined;
  serial<T>(task: () => Promise<T>): Promise<T>;
}

export function createContentEditShared(options: {
  state: ContentEditState;
  pack: ContentEditShared["pack"];
  now: () => number;
  log: TuningLog;
  staminaBasis?: ContentEditShared["staminaBasis"];
}): ContentEditShared {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    ...options,
    serial<T>(task: () => Promise<T>): Promise<T> {
      const run = tail.then(task, task);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

const BOOT_ATTEMPTS = 30;
const BOOT_RETRY_MS = 2_000;

/** 켤 때(onReady, 월드 부팅보다 먼저): DB 줄을 읽어 고르고 싣는다. DB에 닿지 못하면 다시 시도한 뒤 던진다(설정 칸과 같다) */
export async function bootContentEdit(
  db: Database,
  shared: ContentEditShared,
  options: { attempts?: number; retryMs?: number } = {},
): Promise<void> {
  const { state, log } = shared;
  const attempts = options.attempts ?? BOOT_ATTEMPTS;
  let loaded: Awaited<ReturnType<typeof loadContentOverrides>> | undefined;
  for (let attempt = 1; !loaded; attempt++) {
    try {
      loaded = await loadContentOverrides(db);
    } catch (error) {
      if (attempt >= attempts) throw error;
      log.warn({ err: error, attempt }, "content boot: database not ready, retrying");
      await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? BOOT_RETRY_MS));
    }
  }
  state.addRetired(loaded.retired);
  let selection: ReturnType<ContentEditState["selectAtBoot"]>;
  try {
    selection = state.selectAtBoot(loaded.rows);
  } catch (error) {
    log.warn({ err: error }, "content boot: could not select overrides (running on pack entries)");
    return;
  }
  let revision = loaded.revision;
  const sleeping = selection.slept.length + loaded.foreign.length;
  const removing = selection.packWon.length + selection.adopted.length + selection.dropped.length;
  if (removing > 0 || sleeping > 0) {
    try {
      revision =
        (await cleanupContentAtBoot(db, selection, shared.pack.contentVersion, loaded.foreign)) ?? revision;
    } catch (error) {
      log.warn({ err: error }, "content boot: could not clean up overrides (kept in the database)");
    }
  }
  // 잠든 줄도 넘긴다(install이 지금도 잠들었는지 보고 넣지 않는다. DB에 남고, 그 판을 다시 켜면 다시 고른다)
  state.install([...selection.keep, ...selection.slept.map(({ row }) => row)], revision, {
    newer: selection.slept
      .filter((item) => item.reason === "newer_pack")
      .map(({ row }) => contentKey(row.category, row.id)),
    foreign: loaded.foreign,
  });
  log.info(
    {
      contentRevision: revision,
      applied: selection.keep.map((row) => contentKey(row.category, row.id)),
      packWon: selection.packWon.map((row) => contentKey(row.category, row.id)),
      adopted: selection.adopted.map((row) => contentKey(row.category, row.id)),
      upgraded: selection.upgraded ?? [],
      dropped: selection.dropped.map(({ row, reason }) => ({
        key: contentKey(row.category, row.id),
        reason,
      })),
      slept: [
        ...selection.slept.map(({ row, reason }) => ({
          key: contentKey(row.category, row.id),
          reason,
          version: row.contentVersion,
        })),
        ...loaded.foreign.map((row) => ({
          key: contentKey(row.category, row.id),
          reason: row.reason,
          version: row.contentVersion,
        })),
      ],
      retired: loaded.retired.length,
    },
    CONTENT_BOOT_MESSAGE,
  );
  logDroppedReferences(shared);
}

/** 편집기 목록(스냅숏 하나로) */
export function skillEditorList(shared: ContentEditShared): SkillEditorListResponse {
  const { state } = shared;
  const snapshot = state.snapshot();
  const actions = actionRows(state, snapshot);
  return {
    contentVersion: shared.pack.contentVersion,
    revision: snapshot.revision,
    skills: skillViews(state, snapshot),
    effects: state.effects.map(effectViewOf),
    actions,
    retiredSkillIds: state.retiredIds("skills"),
    stamina: shared.staminaBasis?.(actions) ?? null,
  };
}

/** 내보내기 차이의 팩 항목(덮어쓰기마다, 분류·ID 차례). from = 지금 팩 항목 해시(만든 항목이면 null) */
export function contentExportEntries(shared: ContentEditShared): EntryDiffChange[] {
  const { state } = shared;
  return [...state.snapshot().overrides.values()].map((record) => ({
    category: record.category,
    id: record.id,
    from: state.packHash(record.category, record.id),
    entry: record.entry,
  }));
}

/** 묶음 하나 */
export interface ContentBatchInput {
  readonly expectedRevision: number;
  readonly puts: readonly ContentPut[];
  /** 버릴 잠든 줄 */
  readonly discard?: readonly { readonly category: ContentEditCategory; readonly id: string }[];
  readonly note: string | null;
}

const conflict = () => reasonedError("CONFLICT", "REVISION_CONFLICT", "revision_conflict");

/**
 * 묶음 적용(두 편집기 공용). 받지 않으면 rejectedMessage로 BAD_REQUEST(data.reason = 까닭, data.details = 문제 줄·키), 판 충돌이면
 * CONFLICT(revision_conflict). 받으면 새 판(바꿀 것이 없으면 지금 판)
 */
export async function applyContentBatch(
  deps: { db: Database; shared: ContentEditShared; ip: string | null },
  viewer: Viewer,
  input: ContentBatchInput,
  rejectedMessage: string,
): Promise<number> {
  const { db, shared } = deps;
  const { state, log } = shared;
  const rejected = (reason: string, details?: readonly string[]) =>
    reasonedError("BAD_REQUEST", rejectedMessage, reason, details);
  return shared.serial(async () => {
    // 모든 바꿈에 baseHash가 있으면 판이 달라도 받는다(항목마다 plan이 본다). 없으면 옛 규칙(판이 같아야 한다)
    const hashed = input.puts.every((put) => put.baseHash !== undefined);
    if (state.revision() !== input.expectedRevision && !hashed) throw conflict();
    const plan = state.plan(input.puts);
    if (!plan.ok) throw rejected(plan.reason, plan.id ? [plan.id, ...plan.details] : plan.details);
    const discard = (input.discard ?? []).map((key) => {
      const record = state.sleepingRecord(key.category, key.id);
      if (!record) throw rejected("unknown_entry", [contentKey(key.category, key.id)]);
      return { category: record.category, id: record.id, entry: record.entry };
    });
    if (plan.changes.length === 0 && discard.length === 0) return state.revision();
    const actor: AuditActor & { id: string } = {
      kind: "admin",
      id: viewer.id,
      ip: deps.ip,
      meta: { roles: viewer.roles },
    };
    const outcome = await applyContentWrites(db, {
      // 판 확인은 이 프로세스의 지금 판으로(바로 위에서 보았다). 다른 쓰기가 끼면 DB가 충돌로 돌려준다
      expectedRevision: state.revision(),
      changes: plan.changes,
      retire: plan.retire,
      discard,
      contentVersion: shared.pack.contentVersion,
      note: input.note,
      actor,
    });
    if (outcome.kind === "conflict") throw conflict();
    state.addRetired(plan.retire);
    state.install(outcome.records, outcome.revision);
    log.info(
      {
        contentRevision: outcome.revision,
        at: shared.now(),
        actor: viewer.loginId,
        changes: plan.changes.map((change) => ({
          key: contentKey(change.category, change.id),
          before: change.before === null ? null : entryHash(change.before).slice(0, 12),
          after: change.after === null ? null : entryHash(change.after).slice(0, 12),
        })),
        retired: plan.retire.map((row) => contentKey(row.category, row.id)),
        discarded: discard.map((row) => contentKey(row.category, row.id)),
        note: input.note,
      },
      CONTENT_CHANGE_MESSAGE,
    );
    logDroppedReferences(shared);
    return outcome.revision;
  });
}

/** 항목 JSON의 깊은 복사(바꿀 칸만 고친다) */
const cloneJson = (entry: EntryJson): Record<string, unknown> => structuredClone({ ...entry });

/** 객체 칸(없거나 객체가 아니면 undefined) */
function objectAt(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const child: unknown = Reflect.get(value, key);
  return typeof child === "object" && child !== null && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child))
    : undefined;
}

/** 무기 칸 하나의 소모를 바꾼 항목(무기 아이템 equip.weapon, 유닛 종류 naturalWeapon). 그 칸이 없으면 undefined */
function withCost(
  category: "items" | "unit_kinds",
  entry: EntryJson,
  staminaCost: number,
  mpCost: number,
): Record<string, unknown> | undefined {
  const next = cloneJson(entry);
  if (category === "items") {
    const equip = objectAt(next, "equip");
    const weapon = objectAt(equip, "weapon");
    if (!equip || !weapon) return undefined;
    next.equip = { ...equip, weapon: { ...weapon, staminaCost, mpCost } };
    return next;
  }
  const natural = objectAt(next, "naturalWeapon");
  if (!natural) return undefined;
  next.naturalWeapon = { ...natural, staminaCost, mpCost };
  return next;
}

export interface SkillEditorSaveInput {
  readonly expectedRevision: number;
  readonly changes: readonly SkillEditorChange[];
  readonly note?: string | null | undefined;
}

export interface SkillEditorServices {
  list(): Promise<SkillEditorListResponse>;
  history(): Promise<{ rows: SkillEditorHistoryRow[] }>;
  save(viewer: Viewer, input: SkillEditorSaveInput): Promise<SkillEditorListResponse>;
}

/**
 * 화면 바꿈 → 항목 통째 묶음(소모 바꿈은 지금 실효 항목에 그 칸만 고친다: 낡은 초안이 다른 칸을 덮지 않게, 그 항목의 지금 해시를
 * baseHash로 싣는다)
 */
const skillRejected = (reason: string, details?: readonly string[]) =>
  reasonedError("BAD_REQUEST", SKILL_EDITOR_REJECTED, reason, details);

function putsOf(state: ContentEditState, changes: readonly SkillEditorChange[]): ContentPut[] {
  const raw = state.snapshot().raw;
  return changes.map((change): ContentPut => {
    if (change.op === "put_skill")
      return {
        category: "skills",
        id: change.entry.id,
        entry: Object.fromEntries(Object.entries(change.entry)),
        ...(change.baseHash === undefined ? {} : { baseHash: change.baseHash }),
      };
    if (change.op === "revert")
      return {
        category: change.category,
        id: change.id,
        entry: null,
        ...(change.baseHash === undefined ? {} : { baseHash: change.baseHash }),
      };
    const current = raw[change.category].find((entry) => entry.id === change.id);
    const next = current ? withCost(change.category, current, change.staminaCost, change.mpCost) : undefined;
    if (!next) throw skillRejected("unknown_entry", [contentKey(change.category, change.id)]);
    return {
      category: change.category,
      id: change.id,
      entry: next,
      baseHash: state.hashOf(change.category, change.id),
    };
  });
}

export function createSkillEditorServices(deps: {
  db: Database;
  shared: ContentEditShared;
  ip: string | null;
}): SkillEditorServices {
  const { db, shared } = deps;
  const { state } = shared;
  return {
    list: () => Promise.resolve(skillEditorList(shared)),

    async history() {
      return { rows: await readContentHistory(db, SKILL_EDITOR_HISTORY_LIMIT) };
    },

    async save(viewer, input) {
      const note = normalizeTuningNote(input.note);
      if (note === false) throw skillRejected("invalid_note");
      // 소모 바꿈은 묶음을 받을 때의 실효 항목으로 만든다(차례 안에서 다시 보지 않는다: baseHash가 그새 바뀐 것을 잡는다)
      const puts = putsOf(state, input.changes);
      await applyContentBatch(
        deps,
        viewer,
        { expectedRevision: input.expectedRevision, puts, note },
        SKILL_EDITOR_REJECTED,
      );
      return skillEditorList(shared);
    },
  };
}
