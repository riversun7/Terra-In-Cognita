// 행성 초안 DB 작업 — planetEditor.drafts.*(ADR 2026-10-29-planet-editor-stage1 9절). 모든 조회·쓰기는 owner_id로 거른다:
// 다른 사람의 초안은 보이지도 바뀌지도 않는다.
// - 저장: 기대 판이 지금 판과 같을 때만 바꾼다(조건부 UPDATE 한 번이라 동시에 보낸 저장 중 하나만 이긴다). 기대 판 0 = 초안 없음
//   → 새로 만든다(같은 초안을 동시에 만들면 (owner_id, planet_id) 하나뿐 규칙으로 하나만 이긴다). 지면 conflict.
// - 판 기록: 저장·되돌리기마다 한 줄. 같은 트랜잭션에서 최근 PLANET_DRAFT_REVISIONS_KEPT개만 남기고 지운다.
// - 감사 기록: 만들기·되돌리기·지우기는 바꾸는 일과 같은 트랜잭션에 쓴다(감사 기록을 못 쓰면 바뀌지 않고 요청이 실패한다).
//   자동 저장(있는 초안 저장)은 쓰지 않는다: 감사 표는 추가만 되는 표라 끝없이 는다. 누가·언제는 판 기록에 남는다.
//   감사 기록에는 항목(시드)을 넣지 않는다. 행성 ID·판·기준(팩 버전·정의 해시·생성기 판)만.
import { planetDraftEntryBytes } from "@terra/shared";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { type AuditActor, type Transaction, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { planetDraftRevisions, planetDrafts } from "../db/schema.ts";
import type {
  JsonObject,
  PlanetDraftBase,
  PlanetDraftRevisionInfo,
  PlanetDraftSaved,
  PlanetDraftView,
} from "./types.ts";
import type { DraftEntryCheck } from "./validate.ts";

/** 초안마다 남기는 판 기록 수(ADR 38 9절) */
export const PLANET_DRAFT_REVISIONS_KEPT = 50;

/** 감사 기록 action(ADR 38 9절) */
export const PLANET_EDITOR_AUDIT_ACTIONS = {
  readDefinitions: "planet_editor.read_definitions",
  create: "planet_draft.create",
  restore: "planet_draft.restore",
  remove: "planet_draft.remove",
} as const;

const draftColumns = {
  id: planetDrafts.id,
  planetId: planetDrafts.planetId,
  revision: planetDrafts.revision,
  entry: planetDrafts.entry,
  base: planetDrafts.base,
  createdAt: planetDrafts.createdAt,
  updatedAt: planetDrafts.updatedAt,
};

interface DraftRow {
  id: string;
  planetId: string;
  revision: number;
  entry: JsonObject;
  base: PlanetDraftBase | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(row: DraftRow): PlanetDraftView {
  return {
    planetId: row.planetId,
    revision: row.revision,
    entry: row.entry,
    base: row.base,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ownDraft = (ownerId: string, planetId: string) =>
  and(eq(planetDrafts.ownerId, ownerId), eq(planetDrafts.planetId, planetId));

/** 내 초안. 없으면 null */
export async function readDraft(
  db: Database,
  ownerId: string,
  planetId: string,
): Promise<PlanetDraftView | null> {
  const [row] = await db.select(draftColumns).from(planetDrafts).where(ownDraft(ownerId, planetId)).limit(1);
  return row ? toView(row) : null;
}

/** 내 초안의 판 기록(새 판부터). 초안이 없으면 빈 목록 */
export async function listDraftRevisions(
  db: Database,
  ownerId: string,
  planetId: string,
): Promise<PlanetDraftRevisionInfo[]> {
  const rows = await db
    .select({
      revision: planetDraftRevisions.revision,
      savedAt: planetDraftRevisions.savedAt,
      entry: planetDraftRevisions.entry,
    })
    .from(planetDraftRevisions)
    .innerJoin(planetDrafts, eq(planetDrafts.id, planetDraftRevisions.draftId))
    .where(ownDraft(ownerId, planetId))
    .orderBy(desc(planetDraftRevisions.revision))
    .limit(PLANET_DRAFT_REVISIONS_KEPT);
  return rows.map((row) => ({
    revision: row.revision,
    savedAt: row.savedAt.toISOString(),
    // 크기는 기기와 같은 함수로 잰다. jsonb는 키 순서를 바꾸지만 직렬화 길이는 같다
    bytes: planetDraftEntryBytes(row.entry),
  }));
}

export interface SaveDraftInput {
  ownerId: string;
  planetId: string;
  /** 검사를 통과한 항목(validate.ts checkDraftEntry) */
  entry: JsonObject;
  base: PlanetDraftBase | null;
  expectedRevision: number;
  actor: AuditActor;
}

export type SaveDraftOutcome =
  | ({ kind: "saved"; created: boolean } & PlanetDraftSaved)
  | { kind: "conflict" };

/** 판 기록 한 줄을 넣고, 이 초안의 오래된 판 기록을 지운다(최근 PLANET_DRAFT_REVISIONS_KEPT개만 남긴다) */
async function recordRevision(
  tx: Transaction,
  draftId: string,
  revision: number,
  entry: JsonObject,
  base: PlanetDraftBase | null,
): Promise<void> {
  await tx.insert(planetDraftRevisions).values({ draftId, revision, entry, base });
  await tx
    .delete(planetDraftRevisions)
    .where(
      and(
        eq(planetDraftRevisions.draftId, draftId),
        lte(planetDraftRevisions.revision, revision - PLANET_DRAFT_REVISIONS_KEPT),
      ),
    );
}

/** 초안 저장(기대 판 0이면 만들기). 기대 판이 지금 판과 다르면 conflict(아무것도 바꾸지 않는다) */
export async function saveDraft(db: Database, input: SaveDraftInput): Promise<SaveDraftOutcome> {
  const { ownerId, planetId, entry, base, expectedRevision } = input;
  return db.transaction(async (tx): Promise<SaveDraftOutcome> => {
    if (expectedRevision === 0) {
      const [created] = await tx
        .insert(planetDrafts)
        .values({ ownerId, planetId, revision: 1, entry, base })
        .onConflictDoNothing({ target: [planetDrafts.ownerId, planetDrafts.planetId] })
        .returning({
          id: planetDrafts.id,
          revision: planetDrafts.revision,
          updatedAt: planetDrafts.updatedAt,
        });
      if (!created) return { kind: "conflict" };
      await recordRevision(tx, created.id, created.revision, entry, base);
      await writeAudit(tx, {
        actor: input.actor,
        action: PLANET_EDITOR_AUDIT_ACTIONS.create,
        targetId: created.id,
        after: { planetId, revision: created.revision, base },
      });
      return {
        kind: "saved",
        created: true,
        revision: created.revision,
        updatedAt: created.updatedAt.toISOString(),
      };
    }
    // 조건부 UPDATE: 다른 저장이 먼저 판을 올렸으면(또는 초안이 지워졌으면) 0줄 → conflict
    const [updated] = await tx
      .update(planetDrafts)
      .set({ revision: sql`${planetDrafts.revision} + 1`, entry, base, updatedAt: sql`now()` })
      .where(and(ownDraft(ownerId, planetId), eq(planetDrafts.revision, expectedRevision)))
      .returning({ id: planetDrafts.id, revision: planetDrafts.revision, updatedAt: planetDrafts.updatedAt });
    if (!updated) return { kind: "conflict" };
    await recordRevision(tx, updated.id, updated.revision, entry, base);
    return {
      kind: "saved",
      created: false,
      revision: updated.revision,
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

export interface RestoreDraftInput {
  ownerId: string;
  planetId: string;
  /** 되돌릴 판 */
  revision: number;
  actor: AuditActor;
  /** 되돌릴 항목을 지금 팩으로 다시 본다(저장과 같은 검사: 지금 초안은 늘 검사를 통과한 것) */
  check: (entry: unknown) => DraftEntryCheck;
}

export type RestoreDraftOutcome =
  | { kind: "restored"; draft: PlanetDraftView }
  | { kind: "no_draft" }
  | { kind: "no_revision" }
  | { kind: "rejected"; code: Extract<DraftEntryCheck, { ok: false }>["code"] };

/** 판 하나를 초안으로 되돌린다: 그 판의 항목·기준이 새 판이 된다(기록은 지우지 않는다) */
export async function restoreDraft(db: Database, input: RestoreDraftInput): Promise<RestoreDraftOutcome> {
  const { ownerId, planetId } = input;
  return db.transaction(async (tx): Promise<RestoreDraftOutcome> => {
    // 초안 줄을 잠가 같은 초안의 저장·되돌리기·지우기와 한 줄로 세운다
    const [draft] = await tx
      .select({ id: planetDrafts.id, revision: planetDrafts.revision })
      .from(planetDrafts)
      .where(ownDraft(ownerId, planetId))
      .for("update")
      .limit(1);
    if (!draft) return { kind: "no_draft" };
    const [target] = await tx
      .select({ entry: planetDraftRevisions.entry, base: planetDraftRevisions.base })
      .from(planetDraftRevisions)
      .where(
        and(eq(planetDraftRevisions.draftId, draft.id), eq(planetDraftRevisions.revision, input.revision)),
      )
      .limit(1);
    if (!target) return { kind: "no_revision" };
    const checked = input.check(target.entry);
    if (!checked.ok) return { kind: "rejected", code: checked.code };
    const [updated] = await tx
      .update(planetDrafts)
      .set({ revision: draft.revision + 1, entry: target.entry, base: target.base, updatedAt: sql`now()` })
      .where(eq(planetDrafts.id, draft.id))
      .returning(draftColumns);
    if (!updated) return { kind: "no_draft" };
    await recordRevision(tx, updated.id, updated.revision, target.entry, target.base);
    await writeAudit(tx, {
      actor: input.actor,
      action: PLANET_EDITOR_AUDIT_ACTIONS.restore,
      targetId: updated.id,
      before: { planetId, revision: draft.revision },
      after: { planetId, revision: updated.revision, restoredFrom: input.revision },
    });
    return { kind: "restored", draft: toView(updated) };
  });
}

export interface RemoveDraftInput {
  ownerId: string;
  planetId: string;
  actor: AuditActor;
}

/** 초안과 판 기록을 지운다(판 기록은 외래 키로 함께 지워진다). 지운 것이 없으면 false(감사 기록도 없다) */
export async function removeDraft(db: Database, input: RemoveDraftInput): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(planetDrafts)
      .where(ownDraft(input.ownerId, input.planetId))
      .returning({ id: planetDrafts.id, revision: planetDrafts.revision });
    if (!removed) return false;
    await writeAudit(tx, {
      actor: input.actor,
      action: PLANET_EDITOR_AUDIT_ACTIONS.remove,
      targetId: removed.id,
      before: { planetId: input.planetId, revision: removed.revision },
    });
    return true;
  });
}

/** 정의 조회 감사 기록(시드가 든 자료를 보내기 전에 쓴다). 못 쓰면 던진다 → 요청이 실패하고 자료를 보내지 않는다 */
export async function recordDefinitionsRead(
  db: Database,
  actor: AuditActor,
  summary: { contentVersion: string; generatorVersion: number; planetIds: readonly string[] },
): Promise<void> {
  await writeAudit(db, {
    actor,
    action: PLANET_EDITOR_AUDIT_ACTIONS.readDefinitions,
    targetId: null,
    after: summary,
  });
}
