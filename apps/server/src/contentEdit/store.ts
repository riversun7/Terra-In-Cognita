// 팩 항목 덮어쓰기 DB 작업 — content_overrides·content_override_revision 표와 감사 기록(docs/adr/2026-11-01-skill-editor.md 3절).
// 설정 칸 덮어쓰기(src/tuning/store.ts)와 같은 결: 바꾸는 트랜잭션은 늘 판을 조건부로 올리고(두 사람이 같은 판을 보고 보내면 늦은 쪽은
// 아무것도 바꾸지 않고 충돌), 바꾸는 일과 감사 기록은 한 트랜잭션이다(감사 기록을 못 쓰면 바꾸지 않는다, PLAN 4.8).
// 감사 기록 모양(target_id 없음)
// - content.apply: before { revision, changes: [{ category, id, entry | null }] },
//                  after { revision, contentVersion, note, changes: [{ category, id, entry | null, packHash }] }
// - content.pack_won(켤 때, system): before { changes: [{ category, id, packHash(저장 때) }] }, after { revision, contentVersion }
// - content.dropped(켤 때, system): before { changes: [{ category, id, reason }] }, after { revision, contentVersion }
import {
  CONTENT_EDIT_CATEGORIES,
  type ContentEditCategory,
  type SkillEditorHistoryRow,
} from "@terra/shared/skillEditor";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { type AuditActor, type Transaction, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { auditLog, contentOverrideRevision, contentOverrides, users } from "../db/schema.ts";
import type { ContentBootSelection, ContentOverrideRecord, PlannedContentChange } from "./state.ts";

export const CONTENT_AUDIT_ACTIONS = {
  apply: "content.apply",
  pack_won: "content.pack_won",
  dropped: "content.dropped",
} as const;

type Actor = AuditActor & { id: string };

const isCategory = (value: string): value is ContentEditCategory =>
  (CONTENT_EDIT_CATEGORIES as readonly string[]).includes(value);

async function readRecords(db: Database | Transaction): Promise<ContentOverrideRecord[]> {
  const rows = await db
    .select({
      category: contentOverrides.category,
      id: contentOverrides.id,
      entry: contentOverrides.entry,
      packHash: contentOverrides.packHash,
      contentVersion: contentOverrides.contentVersion,
      note: contentOverrides.note,
      updatedById: contentOverrides.updatedBy,
      updatedByName: users.name,
      updatedAt: contentOverrides.updatedAt,
    })
    .from(contentOverrides)
    .leftJoin(users, eq(users.id, contentOverrides.updatedBy));
  return rows.flatMap(({ updatedAt, category, ...row }): ContentOverrideRecord[] =>
    isCategory(category) ? [{ ...row, category, updatedAtMs: updatedAt.getTime() }] : [],
  );
}

/** 켤 때: 판 줄을 (없으면) 만들고 판과 덮어쓰기 줄 전부를 읽는다 */
export async function loadContentOverrides(
  db: Database,
): Promise<{ revision: number; rows: ContentOverrideRecord[] }> {
  await db.insert(contentOverrideRevision).values({ id: 1, revision: 0 }).onConflictDoNothing();
  const [meta] = await db
    .select({ revision: contentOverrideRevision.revision })
    .from(contentOverrideRevision)
    .where(eq(contentOverrideRevision.id, 1));
  return { revision: meta?.revision ?? 0, rows: await readRecords(db) };
}

/** 판을 조건부로 올린다(기대 판이 아니면 null). expected가 null이면 조건 없이 올린다(켤 때 정리) */
async function bumpRevision(tx: Transaction, expected: number | null): Promise<number | null> {
  const [row] = await tx
    .update(contentOverrideRevision)
    .set({ revision: sql`${contentOverrideRevision.revision} + 1`, updatedAt: sql`now()` })
    .where(
      expected === null
        ? eq(contentOverrideRevision.id, 1)
        : and(eq(contentOverrideRevision.id, 1), eq(contentOverrideRevision.revision, expected)),
    )
    .returning({ revision: contentOverrideRevision.revision });
  return row?.revision ?? null;
}

const whereKey = (category: string, id: string) =>
  and(eq(contentOverrides.category, category), eq(contentOverrides.id, id));

export type ContentWriteOutcome =
  | { readonly kind: "applied"; readonly revision: number; readonly records: ContentOverrideRecord[] }
  | { readonly kind: "conflict" };

/** 묶음 적용: 판 확인·올림 → 덮어쓰기 넣기·지우기 → 감사 기록, 한 트랜잭션. 커밋 뒤의 덮어쓰기 전부를 돌려준다 */
export async function applyContentWrites(
  db: Database,
  input: {
    expectedRevision: number;
    changes: readonly PlannedContentChange[];
    contentVersion: string;
    note: string | null;
    actor: Actor;
  },
): Promise<ContentWriteOutcome> {
  return db.transaction(async (tx): Promise<ContentWriteOutcome> => {
    const revision = await bumpRevision(tx, input.expectedRevision);
    if (revision === null) return { kind: "conflict" };
    const now = new Date();
    for (const change of input.changes) {
      if (change.after === null) {
        await tx.delete(contentOverrides).where(whereKey(change.category, change.id));
        continue;
      }
      const values = {
        entry: { ...change.after },
        packHash: change.packHash,
        contentVersion: input.contentVersion,
        note: input.note,
        updatedBy: input.actor.id,
        updatedAt: now,
      };
      await tx
        .insert(contentOverrides)
        .values({ category: change.category, id: change.id, ...values })
        .onConflictDoUpdate({ target: [contentOverrides.category, contentOverrides.id], set: values });
    }
    await writeAudit(tx, {
      actor: input.actor,
      action: CONTENT_AUDIT_ACTIONS.apply,
      targetId: null,
      before: {
        revision: input.expectedRevision,
        changes: input.changes.map((change) => ({
          category: change.category,
          id: change.id,
          entry: change.before,
        })),
      },
      after: {
        revision,
        contentVersion: input.contentVersion,
        note: input.note,
        changes: input.changes.map((change) => ({
          category: change.category,
          id: change.id,
          entry: change.after,
          packHash: change.packHash,
        })),
      },
    });
    return { kind: "applied", revision, records: await readRecords(tx) };
  });
}

/** 켤 때 정리: 팩이 이긴 줄·맞지 않는 줄을 지우고 판을 올리고 감사 기록(행위자 system). 새 판 */
export async function cleanupContentAtBoot(
  db: Database,
  selection: Pick<ContentBootSelection, "packWon" | "dropped">,
  contentVersion: string,
): Promise<number> {
  const rows = [...selection.packWon, ...selection.dropped.map((item) => item.row)];
  return db.transaction(async (tx) => {
    if (rows.length > 0)
      await tx.delete(contentOverrides).where(or(...rows.map((row) => whereKey(row.category, row.id))));
    const revision = (await bumpRevision(tx, null)) ?? 0;
    const system: AuditActor = { kind: "system", id: null, ip: null };
    if (selection.packWon.length > 0)
      await writeAudit(tx, {
        actor: system,
        action: CONTENT_AUDIT_ACTIONS.pack_won,
        targetId: null,
        before: {
          changes: selection.packWon.map((row) => ({
            category: row.category,
            id: row.id,
            packHash: row.packHash,
          })),
        },
        after: { revision, contentVersion },
      });
    if (selection.dropped.length > 0)
      await writeAudit(tx, {
        actor: system,
        action: CONTENT_AUDIT_ACTIONS.dropped,
        targetId: null,
        before: {
          changes: selection.dropped.map(({ row, reason }) => ({
            category: row.category,
            id: row.id,
            reason,
          })),
        },
        after: { revision, contentVersion },
      });
    return revision;
  });
}

/** jsonb 칸 하나(없거나 다른 모양이면 undefined) */
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const ACTION_OF: ReadonlyMap<string, SkillEditorHistoryRow["action"]> = new Map([
  [CONTENT_AUDIT_ACTIONS.apply, "apply"],
  [CONTENT_AUDIT_ACTIONS.pack_won, "pack_won"],
  [CONTENT_AUDIT_ACTIONS.dropped, "dropped"],
]);

/** 감사 기록 한 줄의 바꿈: apply는 put(만듦·고침)·revert, 켤 때는 까닭 */
function historyChanges(
  action: SkillEditorHistoryRow["action"],
  before: unknown,
  after: unknown,
): SkillEditorHistoryRow["changes"] {
  const source = action === "apply" ? field(after, "changes") : field(before, "changes");
  return listOf(source).flatMap((item) => {
    const category = field(item, "category");
    const id = field(item, "id");
    if (typeof category !== "string" || !isCategory(category) || typeof id !== "string") return [];
    let what: string;
    if (action === "apply") what = field(item, "entry") === null ? "revert" : "put";
    else if (action === "pack_won") what = "pack_won";
    else {
      const reason = field(item, "reason");
      what = typeof reason === "string" ? reason : "dropped";
    }
    return [{ category, id, what }];
  });
}

/** 최근 바꿈(감사 기록 content.*, 새 것부터) */
export async function readContentHistory(db: Database, limit: number): Promise<SkillEditorHistoryRow[]> {
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
    .where(inArray(auditLog.action, Object.values(CONTENT_AUDIT_ACTIONS)))
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return rows.flatMap((row): SkillEditorHistoryRow[] => {
    const action = ACTION_OF.get(row.action);
    if (!action) return [];
    const note = field(row.after, "note");
    const revision = field(row.after, "revision");
    return [
      {
        at: row.at.getTime(),
        action,
        actor: row.actorName ?? null,
        revision: typeof revision === "number" ? revision : null,
        note: typeof note === "string" ? note : null,
        changes: historyChanges(action, row.before, row.after),
      },
    ];
  });
}
