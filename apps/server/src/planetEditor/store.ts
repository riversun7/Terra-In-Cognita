// 행성 초안 DB 작업 — planetEditor.drafts.*(ADR 2026-10-29-planet-editor-stage1 9절). 모든 조회·쓰기는 owner_id로 거른다:
// 다른 사람의 초안은 보이지도 바뀌지도 않는다.
// - 판 번호: 저장·되돌리기마다 모든 초안이 함께 쓰는 번호(planet_draft_revision_seq)의 다음 값이다. 초안 안에서는 늘 커지고
//   띄엄띄엄이다. 한 번 쓴 번호는 다시 나오지 않는다: 지운 뒤 다시 만든 초안이 옛 판 번호에 닿아 옛 판을 든 기기의 저장이
//   충돌 없이 들어가는 일(ABA)이 없다.
// - 저장: 기대 판이 지금 판과 같을 때만 바꾼다(조건부 UPDATE 한 번이라 동시에 보낸 저장 중 하나만 이긴다). 기대 판 0 = 초안 없음
//   → 새로 만든다(같은 초안을 동시에 만들면 (owner_id, planet_id) 하나뿐 규칙으로 하나만 이긴다). 지면 conflict.
// - 판 기록: 저장·되돌리기마다 한 줄(항목·기준·크기). 같은 트랜잭션에서 최근 PLANET_DRAFT_REVISIONS_KEPT개만 남기고 지운다.
//   판 목록은 저장할 때 잰 크기 열을 읽는다(항목을 읽지 않는다).
// - 감사 기록: 만들기·되돌리기·지우기는 바꾸는 일과 같은 트랜잭션에 쓴다(감사 기록을 못 쓰면 바뀌지 않고 요청이 실패한다).
//   자동 저장(있는 초안 저장)은 쓰지 않는다: 감사 표는 추가만 되는 표라 끝없이 는다. 누가·언제는 판 기록에 남는다.
//   감사 기록에는 항목(시드)을 넣지 않는다. 행성 ID·판·기준(팩 버전·정의 해시·생성기 판)만.
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { type AuditActor, type Transaction, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { PLANET_DRAFT_REVISION_SEQ, planetDraftRevisions, planetDrafts } from "../db/schema.ts";
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

/** 다음 판 번호(모든 초안이 함께 쓰는 번호. nextval은 bigint라 판 열 integer로 바꾼다: 상한은 시퀀스가 지킨다) */
const nextRevision = () => sql<number>`nextval(${PLANET_DRAFT_REVISION_SEQ}::regclass)::integer`;

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

/** 내 초안의 판 기록(새 판부터). 초안이 없으면 빈 목록. 항목은 읽지 않는다(크기는 저장할 때 잰 열) */
export async function listDraftRevisions(
  db: Database,
  ownerId: string,
  planetId: string,
): Promise<PlanetDraftRevisionInfo[]> {
  const rows = await db
    .select({
      revision: planetDraftRevisions.revision,
      savedAt: planetDraftRevisions.savedAt,
      bytes: planetDraftRevisions.bytes,
    })
    .from(planetDraftRevisions)
    .innerJoin(planetDrafts, eq(planetDrafts.id, planetDraftRevisions.draftId))
    .where(ownDraft(ownerId, planetId))
    .orderBy(desc(planetDraftRevisions.revision))
    .limit(PLANET_DRAFT_REVISIONS_KEPT);
  return rows.map((row) => ({
    revision: row.revision,
    savedAt: row.savedAt.toISOString(),
    bytes: row.bytes,
  }));
}

export interface SaveDraftInput {
  ownerId: string;
  planetId: string;
  /** 검사를 통과한 항목과 그 크기(validate.ts checkDraftEntry) */
  entry: JsonObject;
  bytes: number;
  base: PlanetDraftBase | null;
  expectedRevision: number;
  actor: AuditActor;
}

export type SaveDraftOutcome =
  | ({ kind: "saved"; created: boolean } & PlanetDraftSaved)
  | { kind: "conflict" };

/** 판 기록 한 줄 */
interface RevisionRecord {
  draftId: string;
  revision: number;
  entry: JsonObject;
  base: PlanetDraftBase | null;
  bytes: number;
}

/**
 * 판 기록 한 줄을 넣고, 이 초안의 오래된 판 기록을 지운다(최근 PLANET_DRAFT_REVISIONS_KEPT개만 남긴다).
 * 판 번호가 띄엄띄엄이라 남길 것 중 가장 오래된 판 번호(새 판부터 KEPT번째)를 찾아 그보다 앞을 지운다.
 * 기록이 KEPT개보다 적으면 그 번호가 없어(NULL) 아무것도 지우지 않는다
 */
async function recordRevision(tx: Transaction, record: RevisionRecord): Promise<void> {
  await tx.insert(planetDraftRevisions).values(record);
  const oldestKept = tx
    .select({ revision: planetDraftRevisions.revision })
    .from(planetDraftRevisions)
    .where(eq(planetDraftRevisions.draftId, record.draftId))
    .orderBy(desc(planetDraftRevisions.revision))
    .limit(1)
    .offset(PLANET_DRAFT_REVISIONS_KEPT - 1);
  await tx
    .delete(planetDraftRevisions)
    .where(
      and(
        eq(planetDraftRevisions.draftId, record.draftId),
        lt(planetDraftRevisions.revision, sql`(${oldestKept})`),
      ),
    );
}

/** 초안 저장(기대 판 0이면 만들기). 기대 판이 지금 판과 다르면 conflict(아무것도 바꾸지 않는다) */
export async function saveDraft(db: Database, input: SaveDraftInput): Promise<SaveDraftOutcome> {
  const { ownerId, planetId, entry, bytes, base, expectedRevision } = input;
  return db.transaction(async (tx): Promise<SaveDraftOutcome> => {
    if (expectedRevision === 0) {
      const [created] = await tx
        .insert(planetDrafts)
        .values({ ownerId, planetId, revision: nextRevision(), entry, base })
        .onConflictDoNothing({ target: [planetDrafts.ownerId, planetDrafts.planetId] })
        .returning({
          id: planetDrafts.id,
          revision: planetDrafts.revision,
          updatedAt: planetDrafts.updatedAt,
        });
      if (!created) return { kind: "conflict" };
      await recordRevision(tx, { draftId: created.id, revision: created.revision, entry, base, bytes });
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
    // 조건부 UPDATE: 다른 저장이 먼저 판을 올렸으면(또는 초안이 지워졌으면) 0줄 → conflict.
    // 맞는 줄이 없으면 nextval도 부르지 않는다(번호를 쓰지 않는다)
    const [updated] = await tx
      .update(planetDrafts)
      .set({ revision: nextRevision(), entry, base, updatedAt: sql`now()` })
      .where(and(ownDraft(ownerId, planetId), eq(planetDrafts.revision, expectedRevision)))
      .returning({ id: planetDrafts.id, revision: planetDrafts.revision, updatedAt: planetDrafts.updatedAt });
    if (!updated) return { kind: "conflict" };
    await recordRevision(tx, { draftId: updated.id, revision: updated.revision, entry, base, bytes });
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
      .set({ revision: nextRevision(), entry: target.entry, base: target.base, updatedAt: sql`now()` })
      .where(eq(planetDrafts.id, draft.id))
      .returning(draftColumns);
    if (!updated) return { kind: "no_draft" };
    await recordRevision(tx, {
      draftId: updated.id,
      revision: updated.revision,
      entry: target.entry,
      base: target.base,
      bytes: checked.bytes,
    });
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
