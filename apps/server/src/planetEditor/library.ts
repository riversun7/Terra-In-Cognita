// 행성 보관함 DB 작업 — planetEditor.library.*(ADR 2026-10-29-planet-editor-stage1 "바뀜: 행성 보관함").
// 팀 공용 목록: dev·admin 모두 같은 행성을 보고 고친다(만든 사람으로 거르지 않는다). 지우기만 만든 사람·admin이다(서비스가 본다).
// - 판: 행성마다 1부터 [저장]마다 1씩. 저장은 기대 판이 지금 판과 같을 때만 바꾼다(조건부 UPDATE 한 번이라 동시에 보낸 저장 중
//   하나만 이긴다). 지면 conflict와 지금 판을 돌려준다(기기가 [덮어쓰기]·[다른 이름으로 저장]·[취소]를 고른다).
// - 저장 판(planet_library_versions): [저장]·만들기마다 한 줄. 모두 남긴다. 판 목록은 저장할 때 잰 크기 열을 읽는다.
// - 지우기는 표시만 한다(deleted_at): 줄과 판은 남아 ID가 가리키던 것을 잃지 않는다. 지운 행성은 목록·열기·저장에서 빠진다.
// - 감사 기록: 만들기·저장·이름 바꾸기·지우기를 바꾸는 일과 같은 트랜잭션에 쓴다(손으로 하는 일이라 드물다). 정의(시드)는 넣지 않는다.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PlanetLibraryBase } from "@terra/shared";
import { type AuditActor, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { planetLibrary, planetLibraryVersions, users } from "../db/schema.ts";
import type {
  JsonObject,
  PlanetLibraryPerson,
  PlanetLibraryPlanet,
  PlanetLibrarySaved,
  PlanetLibrarySummary,
  PlanetLibraryVersion,
  PlanetLibraryVersionInfo,
} from "./types.ts";

/** 감사 기록 action */
export const PLANET_LIBRARY_AUDIT_ACTIONS = {
  create: "planet_library.create",
  save: "planet_library.save",
  rename: "planet_library.rename",
  remove: "planet_library.remove",
} as const;

const authors = alias(users, "library_author");
const updaters = alias(users, "library_updater");

const summaryColumns = {
  id: planetLibrary.id,
  name: planetLibrary.name,
  base: planetLibrary.base,
  revision: planetLibrary.revision,
  authorId: authors.id,
  authorName: authors.name,
  updaterId: updaters.id,
  updaterName: updaters.name,
  createdAt: planetLibrary.createdAt,
  updatedAt: planetLibrary.updatedAt,
};

interface SummaryRow {
  id: string;
  name: string;
  base: PlanetLibraryBase;
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

function toSummary(row: SummaryRow): PlanetLibrarySummary {
  return {
    id: row.id,
    name: row.name,
    base: row.base,
    revision: row.revision,
    author: person(row.authorId, row.authorName),
    updatedBy: person(row.updaterId, row.updaterName),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const alive = (id: string) => and(eq(planetLibrary.id, id), isNull(planetLibrary.deletedAt));

function summaryQuery(db: Database) {
  return db
    .select(summaryColumns)
    .from(planetLibrary)
    .leftJoin(authors, eq(authors.id, planetLibrary.authorId))
    .leftJoin(updaters, eq(updaters.id, planetLibrary.updatedBy));
}

/** 보관함 목록(지운 것 빼고, 최근에 바뀐 것부터) */
export async function listLibrary(db: Database): Promise<PlanetLibrarySummary[]> {
  const rows = await summaryQuery(db)
    .where(isNull(planetLibrary.deletedAt))
    .orderBy(desc(planetLibrary.updatedAt), desc(planetLibrary.createdAt));
  return rows.map(toSummary);
}

/** 행성 하나(정의 포함). 없거나 지웠으면 null */
export async function readLibraryPlanet(db: Database, id: string): Promise<PlanetLibraryPlanet | null> {
  const [row] = await db
    .select({ ...summaryColumns, definition: planetLibrary.definition })
    .from(planetLibrary)
    .leftJoin(authors, eq(authors.id, planetLibrary.authorId))
    .leftJoin(updaters, eq(updaters.id, planetLibrary.updatedBy))
    .where(alive(id))
    .limit(1);
  return row ? { ...toSummary(row), definition: row.definition } : null;
}

export interface CreateLibraryInput {
  name: string;
  base: PlanetLibraryBase;
  /** 검사를 통과한 정의와 그 크기(validate.ts checkLibraryDefinition) */
  definition: JsonObject;
  bytes: number;
  actor: AuditActor & { id: string };
}

/** 새 행성(판 1)과 그 저장 판 한 줄 */
export async function createLibraryPlanet(
  db: Database,
  input: CreateLibraryInput,
): Promise<PlanetLibraryPlanet> {
  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(planetLibrary)
      .values({
        name: input.name,
        base: input.base,
        definition: input.definition,
        revision: 1,
        authorId: input.actor.id,
        updatedBy: input.actor.id,
      })
      .returning({ id: planetLibrary.id });
    if (!created) throw new Error("planet_library insert returned nothing");
    await tx.insert(planetLibraryVersions).values({
      planetId: created.id,
      revision: 1,
      definition: input.definition,
      bytes: input.bytes,
      savedBy: input.actor.id,
    });
    await writeAudit(tx, {
      actor: input.actor,
      action: PLANET_LIBRARY_AUDIT_ACTIONS.create,
      targetId: created.id,
      after: { name: input.name, base: input.base, revision: 1 },
    });
    return created.id;
  });
  const planet = await readLibraryPlanet(db, id);
  if (!planet) throw new Error("created planet disappeared");
  return planet;
}

export interface SaveLibraryInput {
  id: string;
  definition: JsonObject;
  bytes: number;
  expectedRevision: number;
  actor: AuditActor & { id: string };
}

export type SaveLibraryOutcome =
  | ({ kind: "saved" } & PlanetLibrarySaved)
  /** 다른 사람이 먼저 저장했다(지금 판) */
  | { kind: "conflict"; revision: number }
  | { kind: "not_found" };

/** [저장]: 기대 판이 지금 판과 같으면 판 +1과 저장 판 한 줄 */
export async function saveLibraryPlanet(db: Database, input: SaveLibraryInput): Promise<SaveLibraryOutcome> {
  return db.transaction(async (tx): Promise<SaveLibraryOutcome> => {
    const [updated] = await tx
      .update(planetLibrary)
      .set({
        definition: input.definition,
        revision: sql`${planetLibrary.revision} + 1`,
        updatedBy: input.actor.id,
        updatedAt: sql`now()`,
      })
      .where(and(alive(input.id), eq(planetLibrary.revision, input.expectedRevision)))
      .returning({ revision: planetLibrary.revision, updatedAt: planetLibrary.updatedAt });
    if (!updated) {
      const [current] = await tx
        .select({ revision: planetLibrary.revision })
        .from(planetLibrary)
        .where(alive(input.id))
        .limit(1);
      return current ? { kind: "conflict", revision: current.revision } : { kind: "not_found" };
    }
    await tx.insert(planetLibraryVersions).values({
      planetId: input.id,
      revision: updated.revision,
      definition: input.definition,
      bytes: input.bytes,
      savedBy: input.actor.id,
    });
    await writeAudit(tx, {
      actor: input.actor,
      action: PLANET_LIBRARY_AUDIT_ACTIONS.save,
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
export async function renameLibraryPlanet(
  db: Database,
  input: { id: string; name: string; actor: AuditActor & { id: string } },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ name: planetLibrary.name })
      .from(planetLibrary)
      .where(alive(input.id))
      .for("update")
      .limit(1);
    if (!before) return false;
    await tx
      .update(planetLibrary)
      .set({ name: input.name, updatedBy: input.actor.id, updatedAt: sql`now()` })
      .where(eq(planetLibrary.id, input.id));
    await writeAudit(tx, {
      actor: input.actor,
      action: PLANET_LIBRARY_AUDIT_ACTIONS.rename,
      targetId: input.id,
      before: { name: before.name },
      after: { name: input.name },
    });
    return true;
  });
}

export type RemoveLibraryOutcome = "removed" | "not_found" | "not_author";

/** 지우기(표시만). 만든 사람이나 admin(canRemoveAny)만. 만든 사람 계정이 지워진 행성은 admin만 지운다 */
export async function removeLibraryPlanet(
  db: Database,
  input: { id: string; canRemoveAny: boolean; actor: AuditActor & { id: string } },
): Promise<RemoveLibraryOutcome> {
  return db.transaction(async (tx): Promise<RemoveLibraryOutcome> => {
    const [row] = await tx
      .select({
        authorId: planetLibrary.authorId,
        name: planetLibrary.name,
        revision: planetLibrary.revision,
      })
      .from(planetLibrary)
      .where(alive(input.id))
      .for("update")
      .limit(1);
    if (!row) return "not_found";
    if (!input.canRemoveAny && row.authorId !== input.actor.id) return "not_author";
    await tx
      .update(planetLibrary)
      .set({ deletedAt: sql`now()`, deletedBy: input.actor.id })
      .where(eq(planetLibrary.id, input.id));
    await writeAudit(tx, {
      actor: input.actor,
      action: PLANET_LIBRARY_AUDIT_ACTIONS.remove,
      targetId: input.id,
      before: { name: row.name, revision: row.revision },
    });
    return "removed";
  });
}

const versionColumns = {
  revision: planetLibraryVersions.revision,
  savedAt: planetLibraryVersions.savedAt,
  bytes: planetLibraryVersions.bytes,
  savedById: users.id,
  savedByName: users.name,
};

/** 저장 판 목록(새 판부터, 정의는 읽지 않는다). 없거나 지운 행성이면 null */
export async function listLibraryVersions(
  db: Database,
  id: string,
): Promise<PlanetLibraryVersionInfo[] | null> {
  const [planet] = await db.select({ id: planetLibrary.id }).from(planetLibrary).where(alive(id)).limit(1);
  if (!planet) return null;
  const rows = await db
    .select(versionColumns)
    .from(planetLibraryVersions)
    .leftJoin(users, eq(users.id, planetLibraryVersions.savedBy))
    .where(eq(planetLibraryVersions.planetId, id))
    .orderBy(desc(planetLibraryVersions.revision));
  return rows.map((row) => ({
    revision: row.revision,
    savedAt: row.savedAt.toISOString(),
    bytes: row.bytes,
    savedBy: person(row.savedById, row.savedByName),
  }));
}

/** 저장 판 하나(정의 포함). 행성이 없거나 지웠으면 "planet", 판이 없으면 "version" */
export async function readLibraryVersion(
  db: Database,
  id: string,
  revision: number,
): Promise<PlanetLibraryVersion | "planet" | "version"> {
  const [planet] = await db.select({ id: planetLibrary.id }).from(planetLibrary).where(alive(id)).limit(1);
  if (!planet) return "planet";
  const [row] = await db
    .select({ ...versionColumns, definition: planetLibraryVersions.definition })
    .from(planetLibraryVersions)
    .leftJoin(users, eq(users.id, planetLibraryVersions.savedBy))
    .where(and(eq(planetLibraryVersions.planetId, id), eq(planetLibraryVersions.revision, revision)))
    .limit(1);
  if (!row) return "version";
  return {
    revision: row.revision,
    savedAt: row.savedAt.toISOString(),
    bytes: row.bytes,
    savedBy: person(row.savedById, row.savedByName),
    definition: row.definition,
  };
}
