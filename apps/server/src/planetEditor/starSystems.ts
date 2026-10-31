// 항성계 보관함 DB 작업 — planetEditor.systems.*(ADR 2026-10-31-star-system-editor).
// 행성 보관함(library.ts)과 같은 규칙: 팀 공용 목록, [저장]마다 판 +1(조건부 UPDATE 한 번이라 동시에 보낸 저장 중 하나만 이긴다),
// 지우기는 표시만(deleted_at), 감사 기록은 바꾸는 일과 같은 트랜잭션. 다른 점: 저장 판 기록 표가 없다(지금 판만 남긴다).
// 정의는 서비스가 @terra/shared parseStarSystemDefinition으로 정리한 값만 받는다. 가리키는 보관함 행성이 있는지는 보지 않는다
// (지운 행성은 화면이 "지운 행성"으로 보인다).
import type { StarSystemDefinition } from "@terra/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type AuditActor, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { starSystems, users } from "../db/schema.ts";
import type { PlanetLibraryPerson, StarSystemRecord, StarSystemSaved, StarSystemSummary } from "./types.ts";

/** 감사 기록 action */
export const STAR_SYSTEM_AUDIT_ACTIONS = {
  create: "star_system.create",
  save: "star_system.save",
  rename: "star_system.rename",
  remove: "star_system.remove",
} as const;

const authors = alias(users, "system_author");
const updaters = alias(users, "system_updater");

const summaryColumns = {
  id: starSystems.id,
  name: starSystems.name,
  revision: starSystems.revision,
  authorId: authors.id,
  authorName: authors.name,
  updaterId: updaters.id,
  updaterName: updaters.name,
  createdAt: starSystems.createdAt,
  updatedAt: starSystems.updatedAt,
};

interface SummaryRow {
  id: string;
  name: string;
  revision: number;
  authorId: string | null;
  authorName: string | null;
  updaterId: string | null;
  updaterName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function person(id: string | null, name: string | null): PlanetLibraryPerson | null {
  return id !== null && name !== null ? { id, name } : null;
}

function toSummary(row: SummaryRow): StarSystemSummary {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    author: person(row.authorId, row.authorName),
    updatedBy: person(row.updaterId, row.updaterName),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const alive = (id: string) => and(eq(starSystems.id, id), isNull(starSystems.deletedAt));

/** 항성계 목록(지운 것 빼고, 최근에 바뀐 것부터) */
export async function listStarSystems(db: Database): Promise<StarSystemSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(starSystems)
    .leftJoin(authors, eq(authors.id, starSystems.authorId))
    .leftJoin(updaters, eq(updaters.id, starSystems.updatedBy))
    .where(isNull(starSystems.deletedAt))
    .orderBy(desc(starSystems.updatedAt), desc(starSystems.createdAt));
  return rows.map(toSummary);
}

/** 항성계 하나(정의 포함). 없거나 지웠으면 null */
export async function readStarSystem(db: Database, id: string): Promise<StarSystemRecord | null> {
  const [row] = await db
    .select({ ...summaryColumns, definition: starSystems.definition })
    .from(starSystems)
    .leftJoin(authors, eq(authors.id, starSystems.authorId))
    .leftJoin(updaters, eq(updaters.id, starSystems.updatedBy))
    .where(alive(id))
    .limit(1);
  return row ? { ...toSummary(row), definition: row.definition } : null;
}

type Actor = AuditActor & { id: string };

/** 새 항성계(판 1) */
export async function createStarSystem(
  db: Database,
  input: { name: string; definition: StarSystemDefinition; actor: Actor },
): Promise<StarSystemRecord> {
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(starSystems)
      .values({
        name: input.name,
        definition: input.definition,
        revision: 1,
        authorId: input.actor.id,
        updatedBy: input.actor.id,
      })
      .returning({ id: starSystems.id });
    if (!created) throw new Error("star_systems insert returned nothing");
    await writeAudit(tx, {
      actor: input.actor,
      action: STAR_SYSTEM_AUDIT_ACTIONS.create,
      targetId: created.id,
      after: { name: input.name, revision: 1 },
    });
    return created.id;
  });
  const system = await readStarSystem(db, id);
  if (!system) throw new Error("created star system disappeared");
  return system;
}

export type SaveStarSystemOutcome =
  | ({ kind: "saved" } & StarSystemSaved)
  /** 다른 사람이 먼저 저장했다(지금 판) */
  | { kind: "conflict"; revision: number }
  | { kind: "not_found" };

/** [저장]: 기대 판이 지금 판과 같으면 정의를 바꾸고 판 +1 */
export async function saveStarSystem(
  db: Database,
  input: { id: string; definition: StarSystemDefinition; expectedRevision: number; actor: Actor },
): Promise<SaveStarSystemOutcome> {
  return db.transaction(async (tx): Promise<SaveStarSystemOutcome> => {
    const [updated] = await tx
      .update(starSystems)
      .set({
        definition: input.definition,
        revision: sql`${starSystems.revision} + 1`,
        updatedBy: input.actor.id,
        updatedAt: sql`now()`,
      })
      .where(and(alive(input.id), eq(starSystems.revision, input.expectedRevision)))
      .returning({ revision: starSystems.revision, updatedAt: starSystems.updatedAt });
    if (!updated) {
      const [current] = await tx
        .select({ revision: starSystems.revision })
        .from(starSystems)
        .where(alive(input.id))
        .limit(1);
      return current ? { kind: "conflict", revision: current.revision } : { kind: "not_found" };
    }
    await writeAudit(tx, {
      actor: input.actor,
      action: STAR_SYSTEM_AUDIT_ACTIONS.save,
      targetId: input.id,
      before: { revision: input.expectedRevision },
      after: { revision: updated.revision },
    });
    const [saver] = await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, input.actor.id))
      .limit(1);
    return {
      kind: "saved",
      revision: updated.revision,
      updatedAt: updated.updatedAt.toISOString(),
      updatedBy: saver ? { id: saver.id, name: saver.name } : null,
    };
  });
}

/** 이름 바꾸기(판은 그대로). 없거나 지웠으면 false */
export async function renameStarSystem(
  db: Database,
  input: { id: string; name: string; actor: Actor },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ name: starSystems.name })
      .from(starSystems)
      .where(alive(input.id))
      .for("update")
      .limit(1);
    if (!before) return false;
    await tx
      .update(starSystems)
      .set({ name: input.name, updatedBy: input.actor.id, updatedAt: sql`now()` })
      .where(eq(starSystems.id, input.id));
    await writeAudit(tx, {
      actor: input.actor,
      action: STAR_SYSTEM_AUDIT_ACTIONS.rename,
      targetId: input.id,
      before: { name: before.name },
      after: { name: input.name },
    });
    return true;
  });
}

export type RemoveStarSystemOutcome = "removed" | "not_found" | "not_author";

/** 지우기(표시만). 만든 사람이나 admin(canRemoveAny)만. 만든 사람 계정이 지워진 항성계는 admin만 지운다 */
export async function removeStarSystem(
  db: Database,
  input: { id: string; canRemoveAny: boolean; actor: Actor },
): Promise<RemoveStarSystemOutcome> {
  return db.transaction(async (tx): Promise<RemoveStarSystemOutcome> => {
    const [row] = await tx
      .select({ authorId: starSystems.authorId, name: starSystems.name, revision: starSystems.revision })
      .from(starSystems)
      .where(alive(input.id))
      .for("update")
      .limit(1);
    if (!row) return "not_found";
    if (!input.canRemoveAny && row.authorId !== input.actor.id) return "not_author";
    await tx
      .update(starSystems)
      .set({ deletedAt: sql`now()`, deletedBy: input.actor.id })
      .where(eq(starSystems.id, input.id));
    await writeAudit(tx, {
      actor: input.actor,
      action: STAR_SYSTEM_AUDIT_ACTIONS.remove,
      targetId: input.id,
      before: { name: row.name, revision: row.revision },
    });
    return "removed";
  });
}
