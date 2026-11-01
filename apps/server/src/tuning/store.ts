// 설정 칸 덮어쓰기 DB 작업 — tuning_overrides·tuning_revision 표와 감사 기록(docs/adr/2026-11-01-dev-settings-panel.md 4·6·8절).
// 바꾸는 트랜잭션은 늘 세계 설정 판을 조건부로 올린다(revision = revision + 1 where revision = 기대 판): 두 관리자가 같은 판을 보고
// 보내면 늦은 쪽은 아무것도 바꾸지 않고 충돌이다. 바꾸는 일과 감사 기록은 한 트랜잭션이다(감사 기록을 못 쓰면 바꾸지 않는다, PLAN 4.8).
// 감사 기록 모양(target_id 없음, 칸은 before·after에)
// - tuning.apply: before { revision, changes: [{ id, value | null }] },
//                 after { revision, contentVersion, note, changes: [{ id, value | null, packValue }] }
// - tuning.revert_all: before { revision, changes: [{ id, value }] }, after { revision }
// - tuning.pack_won(켤 때, system): before { changes: [{ id, value, packValue(저장 때) }] },
//                 after { revision, contentVersion, changes: [{ id, packValue(지금) }] }
// - tuning.dropped(켤 때, system): before { changes: [{ id, value, reason }] }, after { revision, contentVersion }
import {
  TUNING_HISTORY_ACTIONS,
  type TuningHistoryAction,
  type TuningHistoryChange,
  type TuningHistoryRow,
  isTuningDropReason,
} from "@terra/shared/tuning";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type AuditActor, type Transaction, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { auditLog, tuningOverrides, tuningRevision, users } from "../db/schema.ts";
import type { BootSelection, TuningOverrideRecord } from "./state.ts";

export const TUNING_AUDIT_ACTIONS = {
  apply: "tuning.apply",
  revert_all: "tuning.revert_all",
  pack_won: "tuning.pack_won",
  dropped: "tuning.dropped",
} as const satisfies Record<TuningHistoryAction, string>;

const ACTION_OF: ReadonlyMap<string, TuningHistoryAction> = new Map(
  TUNING_HISTORY_ACTIONS.map((action) => [TUNING_AUDIT_ACTIONS[action], action]),
);

type Actor = AuditActor & { id: string };

const recordColumns = {
  id: tuningOverrides.id,
  value: tuningOverrides.value,
  packValue: tuningOverrides.packValue,
  unit: tuningOverrides.unit,
  contentVersion: tuningOverrides.contentVersion,
  note: tuningOverrides.note,
  updatedById: tuningOverrides.updatedBy,
  updatedByName: users.name,
  updatedAt: tuningOverrides.updatedAt,
};

type RecordRow = Omit<TuningOverrideRecord, "updatedAtMs"> & { updatedAt: Date };
const toRecord = ({ updatedAt, ...row }: RecordRow): TuningOverrideRecord => ({
  ...row,
  updatedAtMs: updatedAt.getTime(),
});

async function readRecords(db: Database | Transaction): Promise<TuningOverrideRecord[]> {
  const rows = await db
    .select(recordColumns)
    .from(tuningOverrides)
    .leftJoin(users, eq(users.id, tuningOverrides.updatedBy));
  return rows.map(toRecord);
}

/** 켤 때: 판 줄을 (없으면) 만들고 판과 덮어쓰기 줄 전부를 읽는다 */
export async function loadTuning(db: Database): Promise<{ revision: number; rows: TuningOverrideRecord[] }> {
  await db.insert(tuningRevision).values({ id: 1, revision: 0 }).onConflictDoNothing();
  const [meta] = await db
    .select({ revision: tuningRevision.revision })
    .from(tuningRevision)
    .where(eq(tuningRevision.id, 1));
  return { revision: meta?.revision ?? 0, rows: await readRecords(db) };
}

/** 판을 조건부로 올린다(기대 판이 아니면 null). expected가 null이면 조건 없이 올린다(켤 때 정리) */
async function bumpRevision(tx: Transaction, expected: number | null): Promise<number | null> {
  const [row] = await tx
    .update(tuningRevision)
    .set({ revision: sql`${tuningRevision.revision} + 1`, updatedAt: sql`now()` })
    .where(
      expected === null
        ? eq(tuningRevision.id, 1)
        : and(eq(tuningRevision.id, 1), eq(tuningRevision.revision, expected)),
    )
    .returning({ revision: tuningRevision.revision });
  return row?.revision ?? null;
}

/** 묶음 한 칸: after null = 덮어쓰기 지움 */
export interface TuningWrite {
  readonly id: string;
  readonly before: number | null;
  readonly after: number | null;
  /** 저장할 때의 팩 값·단위 */
  readonly packValue: number;
  readonly unit: string | null;
}

export type TuningWriteOutcome =
  | { readonly kind: "applied"; readonly revision: number; readonly records: TuningOverrideRecord[] }
  | { readonly kind: "conflict" };

/** 묶음 적용: 판 확인·올림 → 덮어쓰기 넣기·지우기 → 감사 기록, 한 트랜잭션. 커밋 뒤의 덮어쓰기 전부를 돌려준다 */
export async function applyTuningWrites(
  db: Database,
  input: {
    expectedRevision: number;
    writes: readonly TuningWrite[];
    contentVersion: string;
    note: string | null;
    actor: Actor;
  },
): Promise<TuningWriteOutcome> {
  return db.transaction(async (tx): Promise<TuningWriteOutcome> => {
    const revision = await bumpRevision(tx, input.expectedRevision);
    if (revision === null) return { kind: "conflict" };
    const now = new Date();
    for (const write of input.writes) {
      if (write.after === null) {
        await tx.delete(tuningOverrides).where(eq(tuningOverrides.id, write.id));
        continue;
      }
      const values = {
        value: write.after,
        packValue: write.packValue,
        unit: write.unit,
        contentVersion: input.contentVersion,
        note: input.note,
        updatedBy: input.actor.id,
        updatedAt: now,
      };
      await tx
        .insert(tuningOverrides)
        .values({ id: write.id, ...values })
        .onConflictDoUpdate({ target: tuningOverrides.id, set: values });
    }
    await writeAudit(tx, {
      actor: input.actor,
      action: TUNING_AUDIT_ACTIONS.apply,
      targetId: null,
      before: {
        revision: input.expectedRevision,
        changes: input.writes.map((write) => ({ id: write.id, value: write.before })),
      },
      after: {
        revision,
        contentVersion: input.contentVersion,
        note: input.note,
        changes: input.writes.map((write) => ({
          id: write.id,
          value: write.after,
          packValue: write.packValue,
        })),
      },
    });
    return { kind: "applied", revision, records: await readRecords(tx) };
  });
}

export type TuningRevertAllOutcome =
  | { readonly kind: "applied"; readonly revision: number; readonly removed: number }
  | { readonly kind: "conflict" };

/** 모두 되돌리기: 판 확인·올림 → 덮어쓰기 전부 지움 → 감사 기록 */
export async function revertAllTuning(
  db: Database,
  input: { expectedRevision: number; actor: Actor },
): Promise<TuningRevertAllOutcome> {
  return db.transaction(async (tx): Promise<TuningRevertAllOutcome> => {
    const revision = await bumpRevision(tx, input.expectedRevision);
    if (revision === null) return { kind: "conflict" };
    const removed = await tx
      .delete(tuningOverrides)
      .returning({ id: tuningOverrides.id, value: tuningOverrides.value });
    await writeAudit(tx, {
      actor: input.actor,
      action: TUNING_AUDIT_ACTIONS.revert_all,
      targetId: null,
      before: {
        revision: input.expectedRevision,
        changes: removed.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      },
      after: { revision },
    });
    return { kind: "applied", revision, removed: removed.length };
  });
}

/** 켤 때 정리: 팩이 이긴 줄·맞지 않는 줄을 지우고 판을 올리고 감사 기록(행위자 system). 새 판 */
export async function cleanupTuningAtBoot(
  db: Database,
  selection: Pick<BootSelection, "packWon" | "dropped">,
  contentVersion: string,
): Promise<number> {
  const ids = [
    ...selection.packWon.map((item) => item.row.id),
    ...selection.dropped.map((item) => item.row.id),
  ];
  return db.transaction(async (tx) => {
    await tx.delete(tuningOverrides).where(inArray(tuningOverrides.id, ids));
    const revision = (await bumpRevision(tx, null)) ?? 0;
    const system: AuditActor = { kind: "system", id: null, ip: null };
    if (selection.packWon.length > 0) {
      await writeAudit(tx, {
        actor: system,
        action: TUNING_AUDIT_ACTIONS.pack_won,
        targetId: null,
        before: {
          changes: selection.packWon.map(({ row }) => ({
            id: row.id,
            value: row.value,
            packValue: row.packValue,
          })),
        },
        after: {
          revision,
          contentVersion,
          changes: selection.packWon.map(({ row, packValue }) => ({ id: row.id, packValue })),
        },
      });
    }
    if (selection.dropped.length > 0) {
      await writeAudit(tx, {
        actor: system,
        action: TUNING_AUDIT_ACTIONS.dropped,
        targetId: null,
        before: {
          changes: selection.dropped.map(({ row, reason }) => ({ id: row.id, value: row.value, reason })),
        },
        after: { revision, contentVersion },
      });
    }
    return revision;
  });
}

/** jsonb 칸 하나(없거나 다른 모양이면 undefined) */
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;
const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 감사 기록 한 줄 → 칸마다 앞뒤 값 */
function historyChanges(action: TuningHistoryAction, before: unknown, after: unknown): TuningHistoryChange[] {
  const afterById = new Map<string, unknown>();
  for (const item of listOf(field(after, "changes"))) {
    const id = field(item, "id");
    if (typeof id === "string") afterById.set(id, item);
  }
  return listOf(field(before, "changes")).flatMap((item): TuningHistoryChange[] => {
    const id = field(item, "id");
    if (typeof id !== "string") return [];
    const later = afterById.get(id);
    const reason = field(item, "reason");
    return [
      {
        id,
        before: numberOrNull(field(item, "value")),
        after: action === "apply" ? numberOrNull(field(later, "value")) : null,
        reason: isTuningDropReason(reason) ? reason : null,
        packValue: numberOrNull(field(later, "packValue")),
      },
    ];
  });
}

/** 최근 바꿈(감사 기록 tuning.*, 새 것부터) */
export async function readTuningHistory(db: Database, limit: number): Promise<TuningHistoryRow[]> {
  const rows = await db
    .select({
      at: auditLog.at,
      action: auditLog.action,
      actorName: users.name,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(inArray(auditLog.action, Object.values(TUNING_AUDIT_ACTIONS)))
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return rows.flatMap((row): TuningHistoryRow[] => {
    const action = ACTION_OF.get(row.action);
    if (!action) return [];
    const note = field(row.after, "note");
    return [
      {
        at: row.at.getTime(),
        action,
        actor: row.actorName ?? null,
        revision: numberOrNull(field(row.after, "revision")),
        changes: historyChanges(action, row.before, row.after),
        note: typeof note === "string" ? note : null,
      },
    ];
  });
}
