// 팩 항목 덮어쓰기 DB 작업 — content_overrides·content_override_revision·content_retired_ids 표와 감사 기록
// (docs/adr/2026-11-01-skill-editor.md 3절, docs/adr/2026-11-01-item-editor.md 4절).
// 설정 칸 덮어쓰기(src/tuning/store.ts)와 같은 결: 바꾸는 트랜잭션은 늘 판을 조건부로 올리고(두 사람이 같은 판을 보고 보내면 늦은 쪽은
// 아무것도 바꾸지 않고 충돌), 바꾸는 일과 감사 기록은 한 트랜잭션이다(감사 기록을 못 쓰면 바꾸지 않는다, PLAN 4.8).
// 감사 기록 모양(target_id 없음)
// - content.apply: before { revision, changes: [{ category, id, entry | null }] },
//                  after { revision, contentVersion, note, changes: [{ category, id, entry | null, packHash }], retired?: [{ category, id }] }
// - content.pack_won(켤 때, system): before { changes: [{ category, id, packHash(저장 때), reason?(adopted) }] }, after { revision, contentVersion }
// - content.dropped(켤 때, system): before { changes: [{ category, id, reason }] }, after { revision, contentVersion }
// - content.slept(켤 때, system): before { changes: [{ category, id, reason(newer_pack·id_collision·unknown_category), contentVersion(저장 때) }] },
//                 after { revision, contentVersion } — 지우지 않고 적용하지 않은 줄
// 최근 바꿈은 감사 기록을 SQL에서 요약만 풀어 보낸다(항목 통째는 빼고). 그 판 항목은 줄 ID로 하나만 받는다(readContentHistoryEntry).
import {
  CONTENT_EDIT_CATEGORIES,
  type ContentEditCategory,
  type ContentHistoryRow,
  type ContentSleepingRow,
} from "@terra/shared/contentEdit";
import { and, eq, or, sql } from "drizzle-orm";
import { type AuditActor, type Transaction, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { contentOverrideRevision, contentOverrides, contentRetiredIds, users } from "../db/schema.ts";
import type { ContentBootSelection, ContentOverrideRecord } from "./boot.ts";
import type { PlannedContentChange } from "./plan.ts";

export const CONTENT_AUDIT_ACTIONS = {
  apply: "content.apply",
  pack_won: "content.pack_won",
  dropped: "content.dropped",
  slept: "content.slept",
} as const;

type Actor = AuditActor & { id: string };

const isCategory = (value: string): value is ContentEditCategory =>
  (CONTENT_EDIT_CATEGORIES as readonly string[]).includes(value);

async function readRows(
  db: Database | Transaction,
): Promise<{ records: ContentOverrideRecord[]; foreign: ContentSleepingRow[] }> {
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
  const records: ContentOverrideRecord[] = [];
  const foreign: ContentSleepingRow[] = [];
  for (const { updatedAt, category, ...row } of rows) {
    if (isCategory(category)) records.push({ ...row, category, updatedAtMs: updatedAt.getTime() });
    else
      foreign.push({ category, id: row.id, reason: "unknown_category", contentVersion: row.contentVersion });
  }
  return { records, foreign };
}

/** 켤 때: 판 줄을 (없으면) 만들고 판·덮어쓰기 줄 전부·은퇴 ID를 읽는다 */
export async function loadContentOverrides(db: Database): Promise<{
  revision: number;
  rows: ContentOverrideRecord[];
  foreign: ContentSleepingRow[];
  retired: { category: string; id: string }[];
}> {
  await db.insert(contentOverrideRevision).values({ id: 1, revision: 0 }).onConflictDoNothing();
  const [meta] = await db
    .select({ revision: contentOverrideRevision.revision })
    .from(contentOverrideRevision)
    .where(eq(contentOverrideRevision.id, 1));
  const { records, foreign } = await readRows(db);
  const retired = await db
    .select({ category: contentRetiredIds.category, id: contentRetiredIds.id })
    .from(contentRetiredIds);
  return { revision: meta?.revision ?? 0, rows: records, foreign, retired };
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

/**
 * 묶음 적용: 판 확인·올림 → 덮어쓰기 넣기·지우기 → 은퇴 ID 넣기 → 잠든 줄 버리기 → 감사 기록, 한 트랜잭션. 커밋 뒤의 덮어쓰기
 * 전부(잠든 줄 포함)를 돌려준다
 */
export async function applyContentWrites(
  db: Database,
  input: {
    expectedRevision: number;
    changes: readonly PlannedContentChange[];
    /** 지우며 은퇴시킬 만든 항목 ID */
    retire?: readonly { readonly category: ContentEditCategory; readonly id: string }[];
    /** 버릴 잠든 줄(지금 항목, 감사 기록 앞 값) */
    discard?: readonly {
      readonly category: ContentEditCategory;
      readonly id: string;
      readonly entry: unknown;
    }[];
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
    const retire = input.retire ?? [];
    if (retire.length > 0)
      await tx
        .insert(contentRetiredIds)
        .values(
          retire.map((row) => ({
            category: row.category,
            id: row.id,
            contentVersion: input.contentVersion,
            retiredBy: input.actor.id,
            retiredAt: now,
          })),
        )
        .onConflictDoNothing();
    const discard = input.discard ?? [];
    for (const row of discard) await tx.delete(contentOverrides).where(whereKey(row.category, row.id));
    await writeAudit(tx, {
      actor: input.actor,
      action: CONTENT_AUDIT_ACTIONS.apply,
      targetId: null,
      before: {
        revision: input.expectedRevision,
        changes: [
          ...input.changes.map((change) => ({
            category: change.category,
            id: change.id,
            entry: change.before,
          })),
          ...discard.map((row) => ({ category: row.category, id: row.id, entry: row.entry })),
        ],
      },
      after: {
        revision,
        contentVersion: input.contentVersion,
        note: input.note,
        changes: [
          ...input.changes.map((change) => ({
            category: change.category,
            id: change.id,
            entry: change.after,
            packHash: change.packHash,
          })),
          ...discard.map((row) => ({ category: row.category, id: row.id, entry: null, packHash: null })),
        ],
        ...(retire.length > 0 ? { retired: retire } : {}),
      },
    });
    return { kind: "applied", revision, records: (await readRows(tx)).records };
  });
}

/**
 * 켤 때 정리: 팩이 이긴 줄·맞지 않는 줄을 지우고 판을 올리고 감사 기록(행위자 system). 잠든 줄(새 판 줄·팩 ID와 겹친 만든 항목·모르는
 * 분류 줄)은 지우지 않고 감사 content.slept만 남긴다(지울 줄이 없으면 판도 올리지 않는다). 지금 판(지웠으면 올린 판)
 */
export async function cleanupContentAtBoot(
  db: Database,
  selection: Pick<ContentBootSelection, "packWon" | "adopted" | "dropped" | "slept">,
  contentVersion: string,
  foreign: readonly ContentSleepingRow[] = [],
): Promise<number | null> {
  const rows = [...selection.packWon, ...selection.adopted, ...selection.dropped.map((item) => item.row)];
  return db.transaction(async (tx) => {
    if (rows.length > 0)
      await tx.delete(contentOverrides).where(or(...rows.map((row) => whereKey(row.category, row.id))));
    const revision = rows.length > 0 ? ((await bumpRevision(tx, null)) ?? 0) : null;
    const system: AuditActor = { kind: "system", id: null, ip: null };
    if (selection.packWon.length + selection.adopted.length > 0)
      await writeAudit(tx, {
        actor: system,
        action: CONTENT_AUDIT_ACTIONS.pack_won,
        targetId: null,
        before: {
          changes: [
            ...selection.packWon.map((row) => ({
              category: row.category,
              id: row.id,
              packHash: row.packHash,
            })),
            ...selection.adopted.map((row) => ({
              category: row.category,
              id: row.id,
              packHash: row.packHash,
              reason: "adopted",
            })),
          ],
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
    const sleeping = [
      ...selection.slept.map(({ row, reason }) => ({
        category: row.category,
        id: row.id,
        reason,
        contentVersion: row.contentVersion,
      })),
      ...foreign.map((row) => ({ ...row, reason: "unknown_category" })),
    ];
    if (sleeping.length > 0)
      await writeAudit(tx, {
        actor: system,
        action: CONTENT_AUDIT_ACTIONS.slept,
        targetId: null,
        before: { changes: sleeping },
        after: { revision, contentVersion },
      });
    return revision;
  });
}

/** jsonb 칸 하나(없거나 다른 모양이면 undefined) */
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? Reflect.get(value, key) : undefined;
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const ACTION_OF: ReadonlyMap<string, ContentHistoryRow["action"]> = new Map([
  [CONTENT_AUDIT_ACTIONS.apply, "apply"],
  [CONTENT_AUDIT_ACTIONS.pack_won, "pack_won"],
  [CONTENT_AUDIT_ACTIONS.dropped, "dropped"],
  [CONTENT_AUDIT_ACTIONS.slept, "slept"],
]);

/** 요약 바꿈 한 줄(SQL이 푼 것) → what: apply는 put·revert, 켤 때는 까닭 */
function whatOf(action: ContentHistoryRow["action"], item: unknown): string {
  if (action === "apply") return field(item, "put") === true ? "put" : "revert";
  const reason = field(item, "reason");
  if (action === "pack_won") return typeof reason === "string" ? `pack_won:${reason}` : "pack_won";
  if (action === "slept") return typeof reason === "string" ? `slept:${reason}` : "slept";
  return typeof reason === "string" ? reason : "dropped";
}

/**
 * 최근 바꿈(감사 기록 content.*, 새 것부터). 항목 통째는 SQL에서 빼고 요약만 읽는다. key(선택) = 그 항목(id가 없으면 그 분류의 아무
 * 항목)이 든 줄만(jsonb 포함 검사: apply는 after.changes, 켤 때 줄은 before.changes)
 */
export async function readContentHistory(
  db: Database,
  limit: number,
  key?: { readonly category: ContentEditCategory; readonly id?: string | undefined },
): Promise<ContentHistoryRow[]> {
  const filter = key
    ? JSON.stringify({
        changes: [{ category: key.category, ...(key.id === undefined ? {} : { id: key.id }) }],
      })
    : null;
  const result = await db.$client.query<{
    id: string;
    at: Date;
    action: string;
    actor: string | null;
    revision: unknown;
    note: unknown;
    changes: unknown;
  }>(
    `select a.id, a.at, a.action, u.name as actor, a.after -> 'revision' as revision, a.after ->> 'note' as note,
       (select coalesce(jsonb_agg(jsonb_build_object(
            'category', c -> 'category', 'id', c -> 'id', 'reason', c -> 'reason',
            'put', coalesce(jsonb_typeof(c -> 'entry') = 'object', false))), '[]'::jsonb)
          from jsonb_array_elements(
            case when a.action = 'content.apply' then a.after -> 'changes' else a.before -> 'changes' end) c) as changes
     from audit_log a left join users u on u.id = a.actor_id
     where a.action = any($1::text[])
       and ($2::jsonb is null or a.after @> $2::jsonb or a.before @> $2::jsonb)
     order by a.id desc limit $3`,
    [Object.values(CONTENT_AUDIT_ACTIONS), filter, limit],
  );
  return result.rows.flatMap((row): ContentHistoryRow[] => {
    const action = ACTION_OF.get(row.action);
    if (!action) return [];
    return [
      {
        auditId: Number(row.id),
        at: row.at.getTime(),
        action,
        actor: row.actor,
        revision: typeof row.revision === "number" ? row.revision : null,
        note: typeof row.note === "string" ? row.note : null,
        changes: listOf(row.changes).flatMap((item) => {
          const category = field(item, "category");
          const id = field(item, "id");
          if (typeof category !== "string" || !isCategory(category) || typeof id !== "string") return [];
          return [{ category, id, what: whatOf(action, item) }];
        }),
      },
    ];
  });
}

/**
 * 감사 기록 한 줄 때의 그 항목(되돌리기·다시 담기): 그 줄과 그보다 앞선 content.apply 가운데 그 키에 항목을 넣은 마지막 줄의 뒤 항목.
 * 켤 때 줄(팩이 이김·지움·잠듦)에는 항목이 없어 그 앞의 마지막 저장 내용을 찾는다(설계안 3.10). 없으면 null
 */
export async function readContentHistoryEntry(
  db: Database,
  auditId: number,
  key: { readonly category: ContentEditCategory; readonly id: string },
): Promise<Record<string, unknown> | null> {
  const filter = JSON.stringify({ changes: [{ category: key.category, id: key.id }] });
  const result = await db.$client.query<{ action: string; before: unknown; after: unknown }>(
    `select action, before, after from audit_log
     where action = any($1::text[]) and id <= $2 and (after @> $3::jsonb or before @> $3::jsonb)
     order by id desc limit 20`,
    [Object.values(CONTENT_AUDIT_ACTIONS), auditId, filter],
  );
  for (const row of result.rows) {
    if (row.action !== CONTENT_AUDIT_ACTIONS.apply) continue;
    const pick = (side: unknown): unknown =>
      listOf(field(side, "changes")).find(
        (item) => field(item, "category") === key.category && field(item, "id") === key.id,
      );
    const entry = field(pick(row.after), "entry");
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry))
      return Object.fromEntries(Object.entries(entry));
  }
  return null;
}
