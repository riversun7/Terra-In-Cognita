// 설정 칸 덮어쓰기 DB 작업 — tuning_overrides 표와 감사 기록(docs/adr/2026-11-01-dev-settings-panel.md 4·8절).
// 바꾸는 일과 감사 기록은 한 트랜잭션이다(감사 기록을 못 쓰면 바꾸지 않는다, PLAN 4.8). 기대 값(expected)은 트랜잭션 안에서
// 줄을 잠그고 본다(이 프로세스 안에서도 쓰기는 차례로 돈다, services.ts). 판 기록 표는 없다: 앞뒤 값은 감사 기록에만 남는다.
// 감사 기록 모양
// - tuning.set: before { id, value | null }, after { id, value, packValue, contentVersion, note }
// - tuning.revert: before { id, value }, after { id, value: null }
// - tuning.revert_all: before { overrides: [{ id, value }] }
// - tuning.absorbed(켤 때, 행위자 system): before { overrides: [{ id, value }] }, after { contentVersion }
import {
  TUNING_HISTORY_ACTIONS,
  type TuningHistoryAction,
  type TuningHistoryRow,
} from "@terra/shared/tuning";
import { desc, eq, inArray } from "drizzle-orm";
import { type AuditActor, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { auditLog, tuningOverrides, users } from "../db/schema.ts";
import type { TuningOverrideRecord } from "./state.ts";

export const TUNING_AUDIT_ACTIONS = {
  set: "tuning.set",
  revert: "tuning.revert",
  revert_all: "tuning.revert_all",
  absorbed: "tuning.absorbed",
} as const satisfies Record<TuningHistoryAction, string>;

const ACTION_OF: ReadonlyMap<string, TuningHistoryAction> = new Map(
  TUNING_HISTORY_ACTIONS.map((action) => [TUNING_AUDIT_ACTIONS[action], action]),
);

type Actor = AuditActor & { id: string };

const recordColumns = {
  id: tuningOverrides.id,
  value: tuningOverrides.value,
  packValue: tuningOverrides.packValue,
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

/** 켤 때: 덮어쓰기 줄 전부(바꾼 사람 이름 포함) */
export async function loadTuningOverrides(db: Database): Promise<TuningOverrideRecord[]> {
  const rows = await db
    .select(recordColumns)
    .from(tuningOverrides)
    .leftJoin(users, eq(users.id, tuningOverrides.updatedBy));
  return rows.map(toRecord);
}

export type SaveOverrideOutcome =
  | { readonly kind: "saved"; readonly record: TuningOverrideRecord }
  | { readonly kind: "conflict" };

/** 덮어쓰기 하나를 넣거나 바꾼다. expected(이 기기가 본 덮어쓰기 값, 없으면 null)가 지금과 다르면 conflict */
export async function saveTuningOverride(
  db: Database,
  input: {
    id: string;
    value: number;
    packValue: number;
    contentVersion: string;
    note: string | null;
    expected: number | null;
    actor: Actor;
  },
): Promise<SaveOverrideOutcome> {
  return db.transaction(async (tx): Promise<SaveOverrideOutcome> => {
    const [current] = await tx
      .select({ value: tuningOverrides.value })
      .from(tuningOverrides)
      .where(eq(tuningOverrides.id, input.id))
      .for("update")
      .limit(1);
    if ((current?.value ?? null) !== input.expected) return { kind: "conflict" };
    const values = {
      value: input.value,
      packValue: input.packValue,
      contentVersion: input.contentVersion,
      note: input.note,
      updatedBy: input.actor.id,
      updatedAt: new Date(),
    };
    const [saved] = await tx
      .insert(tuningOverrides)
      .values({ id: input.id, ...values })
      .onConflictDoUpdate({ target: tuningOverrides.id, set: values })
      .returning({ updatedAt: tuningOverrides.updatedAt });
    if (!saved) throw new Error("tuning_overrides upsert returned nothing");
    await writeAudit(tx, {
      actor: input.actor,
      action: TUNING_AUDIT_ACTIONS.set,
      targetId: null,
      before: { id: input.id, value: current?.value ?? null },
      after: {
        id: input.id,
        value: input.value,
        packValue: input.packValue,
        contentVersion: input.contentVersion,
        note: input.note,
      },
    });
    const [person] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, input.actor.id))
      .limit(1);
    return {
      kind: "saved",
      record: {
        id: input.id,
        value: input.value,
        packValue: input.packValue,
        contentVersion: input.contentVersion,
        note: input.note,
        updatedById: input.actor.id,
        updatedByName: person?.name ?? null,
        updatedAtMs: saved.updatedAt.getTime(),
      },
    };
  });
}

export type RevertOverrideOutcome = "reverted" | "absent" | "conflict";

/** 덮어쓰기 하나를 지운다(팩 값으로). 줄이 없으면 absent, 값이 expected와 다르면 conflict */
export async function revertTuningOverride(
  db: Database,
  input: { id: string; expected: number; actor: Actor },
): Promise<RevertOverrideOutcome> {
  return db.transaction(async (tx): Promise<RevertOverrideOutcome> => {
    const [current] = await tx
      .select({ value: tuningOverrides.value })
      .from(tuningOverrides)
      .where(eq(tuningOverrides.id, input.id))
      .for("update")
      .limit(1);
    if (!current) return "absent";
    if (current.value !== input.expected) return "conflict";
    await tx.delete(tuningOverrides).where(eq(tuningOverrides.id, input.id));
    await writeAudit(tx, {
      actor: input.actor,
      action: TUNING_AUDIT_ACTIONS.revert,
      targetId: null,
      before: { id: input.id, value: current.value },
      after: { id: input.id, value: null },
    });
    return "reverted";
  });
}

/** 덮어쓰기를 모두 지운다. 지운 줄(없으면 빈 목록, 감사 기록도 쓰지 않는다) */
export async function revertAllTuningOverrides(
  db: Database,
  actor: Actor,
): Promise<{ id: string; value: number }[]> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(tuningOverrides)
      .returning({ id: tuningOverrides.id, value: tuningOverrides.value });
    if (removed.length === 0) return [];
    const sorted = removed.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    await writeAudit(tx, {
      actor,
      action: TUNING_AUDIT_ACTIONS.revert_all,
      targetId: null,
      before: { overrides: sorted },
    });
    return sorted;
  });
}

/** 켤 때: 팩 값과 같아진 덮어쓰기를 지운다(배포로 팩에 들어간 것). 행위자 system */
export async function absorbTuningOverrides(
  db: Database,
  rows: readonly { id: string; value: number }[],
  contentVersion: string,
): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  await db.transaction(async (tx) => {
    await tx.delete(tuningOverrides).where(inArray(tuningOverrides.id, ids));
    await writeAudit(tx, {
      actor: { kind: "system", id: null, ip: null },
      action: TUNING_AUDIT_ACTIONS.absorbed,
      targetId: null,
      before: { overrides: rows.map((row) => ({ id: row.id, value: row.value })) },
      after: { contentVersion },
    });
  });
}

/** jsonb 칸 하나(없거나 다른 모양이면 undefined) */
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;
const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

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
    const list = field(row.before, "overrides");
    const ids = Array.isArray(list)
      ? list.flatMap((item: unknown) => {
          const id = field(item, "id");
          return typeof id === "string" ? [id] : [];
        })
      : [field(row.after, "id") ?? field(row.before, "id")].filter(
          (id): id is string => typeof id === "string",
        );
    const single = !Array.isArray(list);
    const note = field(row.after, "note");
    return [
      {
        at: row.at.getTime(),
        action,
        actor: row.actorName ?? null,
        ids,
        before: single ? numberOrNull(field(row.before, "value")) : null,
        after: single ? numberOrNull(field(row.after, "value")) : null,
        note: typeof note === "string" ? note : null,
      },
    ];
  });
}
