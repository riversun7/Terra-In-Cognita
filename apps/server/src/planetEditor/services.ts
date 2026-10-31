// 행성 편집기 요청 처리 — tRPC planetEditor.*(src/trpc/planetEditor.ts)가 권한 미들웨어(우리 권한 표)를 거친 뒤 부른다.
// ADR 2026-10-29-planet-editor-stage1 9·11절. 요청마다 만든다(src/trpc/createContext.ts). 서버가 켤 때 한 번 만드는 것
// (정의 조회 자료·팩 정보·속도 제한기)은 PlanetEditorShared에 있다(createPlanetEditorShared, src/app.ts).
// - 두 겹 권한: 우리 권한 표(미들웨어) + Better Auth userHasPermission(요청한 사람의 세션 머리글, ensurePermission).
//   두 번째 확인은 세션을 늘리지 않는다(disableRefresh): 이 확인은 새 쿠키를 응답에 싣지 않아서, 늘리면 DB 만료만 늘고 쿠키는
//   그대로 끝난다(자동 저장이 2초마다 부른다). 연장은 기기의 get-session이 한다(src/trpc/createContext.ts loadViewer와 같은 규칙).
//   한 요청(묶음) 안에서는 동작마다 한 번만 묻는다.
// - 속도 제한(사용자별, admit): 편집기 호출 전부 + 정의 조회 따로(부를 때마다 감사 기록이 한 줄 는다). 넘으면
//   TOO_MANY_REQUESTS(data.reason "rate_limited"). 기기는 닿지 못한 것처럼 다시 시도한다.
// - 행성 ID는 팩에 있는 것만(조회·판 목록·되돌리기): 아니면 BAD_REQUEST(data.reason "unknown_planet"). 저장은 받지 않음 코드
//   차례대로 본다(validate.ts). 지우기는 모양만 맞으면 받는다: 팩에서 빠진 행성의 초안도 지울 수 있게.
// - 감사 기록 행위자: 자기 초안·팩 정의를 다루는 계정이라 kind "user", 그때의 역할을 meta에 남긴다.
import { TRPCError } from "@trpc/server";
import type { FastifyRequest } from "fastify";
import { callBetterAuth } from "../auth/adminServices.ts";
import type { TerraAuth } from "../auth/auth.ts";
import { authHeaders } from "../auth/http.ts";
import type { AuditActor } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type {
  PlanetEditorAction,
  PlanetEditorServices,
  PlanetLibraryServices,
  StarSystemServices,
  Viewer,
} from "../trpc/context.ts";
import { reasonedError } from "../trpc/init.ts";
import {
  listDraftRevisions,
  readDraft,
  recordDefinitionsRead,
  removeDraft,
  restoreDraft,
  saveDraft,
} from "./store.ts";
import type { PlanetEditorDefinitions } from "./types.ts";
import {
  normalizePlanetLibraryName,
  normalizeStarSystemName,
  parseStarSystemDefinition,
} from "@terra/shared";
import {
  createLibraryPlanet,
  listLibrary,
  listLibraryVersions,
  readLibraryPlanet,
  readLibraryVersion,
  removeLibraryPlanet,
  renameLibraryPlanet,
  saveLibraryPlanet,
} from "./library.ts";
import {
  createStarSystem,
  listStarSystems,
  readStarSystem,
  removeStarSystem,
  renameStarSystem,
  saveStarSystem,
} from "./starSystems.ts";
import {
  type DraftPackContext,
  checkDraftEntry,
  checkLibraryDefinition,
  draftPackContext,
} from "./validate.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason */
export const PLANET_DRAFT_REJECTED = "PLANET_DRAFT_REJECTED";

/** 속도 제한(토큰 버킷: 순간 capacity개, 분당 refillPerMinute개) */
export interface PlanetEditorLimits {
  /** 사용자별 편집기 호출 전부(자동 저장은 기기마다 2초에 한 번) */
  callsPerUser: { capacity: number; refillPerMinute: number };
  /** 사용자별 정의 조회(편집기를 열 때 한 번. 부를 때마다 감사 기록) */
  definitionsPerUser: { capacity: number; refillPerMinute: number };
}

export const DEFAULT_PLANET_EDITOR_LIMITS: PlanetEditorLimits = {
  callsPerUser: { capacity: 60, refillPerMinute: 120 },
  definitionsPerUser: { capacity: 10, refillPerMinute: 10 },
};

/** 서버가 켤 때 한 번 만든 것(요청마다 같다) */
export interface PlanetEditorShared {
  definitions: PlanetEditorDefinitions;
  pack: DraftPackContext;
  limiters: { calls: RateLimiter; definitions: RateLimiter };
}

export interface PlanetEditorSharedOptions {
  now: () => number;
  limits?: Partial<PlanetEditorLimits> | undefined;
}

/** 정의 조회 자료 → 요청마다 같이 쓰는 것(팩 정보·속도 제한기) */
export function createPlanetEditorShared(
  definitions: PlanetEditorDefinitions,
  options: PlanetEditorSharedOptions,
): PlanetEditorShared {
  const limits = { ...DEFAULT_PLANET_EDITOR_LIMITS, ...options.limits };
  return {
    definitions,
    pack: draftPackContext(definitions),
    limiters: {
      calls: createRateLimiter({ ...limits.callsPerUser, now: options.now }),
      definitions: createRateLimiter({ ...limits.definitionsPerUser, now: options.now }),
    },
  };
}

/** 두 번째 권한 확인(Better Auth). 시험은 바꿔 끼운다 */
export type PermissionCheck = (permissions: { planetEditor: PlanetEditorAction[] }) => Promise<boolean>;

export interface PlanetEditorServicesDeps {
  db: Database;
  shared: PlanetEditorShared;
  /** 접속 주소(감사 기록) */
  ip: string | null;
  hasPermission: PermissionCheck;
}

/**
 * 요청의 세션으로 Better Auth에 묻는 권한 확인. 세션을 늘리지 않는다(disableRefresh): Better Auth는 하루 넘게 쓴 세션을
 * 이때 늘리고 새 쿠키를 응답 머리글에 싣는데, auth.api 호출의 머리글은 버려진다. 그러면 DB 만료만 늘고 쿠키는 그대로라
 * 다음 get-session도 늘릴 것이 없어 쿠키가 끝나 버린다
 */
export function betterAuthPermissionCheck(auth: TerraAuth, request: FastifyRequest): PermissionCheck {
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

/** 속도 제한에 걸린 요청(TOO_MANY_REQUESTS, data.reason "rate_limited") */
function rateLimited(): TRPCError {
  return reasonedError("TOO_MANY_REQUESTS", "RATE_LIMITED", "rate_limited");
}

function actorOf(viewer: Viewer, ip: string | null): AuditActor & { id: string } {
  return { kind: "user", id: viewer.id, ip, meta: { roles: viewer.roles } };
}

/** 보관함 받지 않음(BAD_REQUEST, data.reason = 코드) */
const libraryRejected = (reason: string) => reasonedError("BAD_REQUEST", "PLANET_LIBRARY_REJECTED", reason);
const planetNotFound = () => reasonedError("NOT_FOUND", "PLANET_NOT_FOUND", "planet_not_found");

/** 보관함 이름 규칙(@terra/shared). 틀리면 BAD_REQUEST invalid_name */
function checkName(raw: unknown): string {
  const name = normalizePlanetLibraryName(raw);
  if (name === null) throw libraryRejected("invalid_name");
  return name;
}

/** 행성 보관함 처리(ADR 38 "바뀜: 행성 보관함"). 팀 공용이라 만든 사람으로 거르지 않는다. 지우기만 만든 사람·admin */
function createLibraryServices(
  db: Database,
  shared: PlanetEditorShared,
  ip: string | null,
): PlanetLibraryServices {
  const checkDefinition = (definition: unknown) => {
    const checked = checkLibraryDefinition(definition, shared.pack);
    if (!checked.ok) throw libraryRejected(checked.code);
    return checked;
  };
  return {
    list: () => listLibrary(db),
    async get(_viewer, id) {
      const planet = await readLibraryPlanet(db, id);
      if (!planet) throw planetNotFound();
      return planet;
    },
    async create(viewer, input) {
      const name = checkName(input.name);
      // 시작점: 팩 행성(planets) 또는 행성 표본(planet_templates). 그 종류의 분류에 있는 ID만
      const known = input.base.kind === "template" ? shared.pack.templateIds : shared.pack.planetIds;
      if (!known.has(input.base.id)) throw libraryRejected("unknown_base");
      const checked = checkDefinition(input.definition);
      return createLibraryPlanet(db, {
        name,
        base: input.base,
        definition: checked.entry,
        bytes: checked.bytes,
        actor: actorOf(viewer, ip),
      });
    },
    async save(viewer, input) {
      const checked = checkDefinition(input.definition);
      const outcome = await saveLibraryPlanet(db, {
        id: input.id,
        definition: checked.entry,
        bytes: checked.bytes,
        expectedRevision: input.expectedRevision,
        actor: actorOf(viewer, ip),
      });
      if (outcome.kind === "not_found") throw planetNotFound();
      if (outcome.kind === "conflict")
        throw reasonedError("CONFLICT", "REVISION_CONFLICT", "revision_conflict");
      return { revision: outcome.revision, updatedAt: outcome.updatedAt, updatedBy: outcome.updatedBy };
    },
    async rename(viewer, input) {
      const name = checkName(input.name);
      if (!(await renameLibraryPlanet(db, { id: input.id, name, actor: actorOf(viewer, ip) })))
        throw planetNotFound();
      return { name };
    },
    async remove(viewer, id) {
      const outcome = await removeLibraryPlanet(db, {
        id,
        canRemoveAny: viewer.roles.includes("admin"),
        actor: actorOf(viewer, ip),
      });
      if (outcome === "not_found") throw planetNotFound();
      if (outcome === "not_author") throw reasonedError("FORBIDDEN", "NOT_AUTHOR", "not_author");
      return { removed: true };
    },
    async versions(_viewer, id) {
      const list = await listLibraryVersions(db, id);
      if (!list) throw planetNotFound();
      return list;
    },
    async version(_viewer, input) {
      const found = await readLibraryVersion(db, input.id, input.revision);
      if (found === "planet") throw planetNotFound();
      if (found === "version") throw reasonedError("NOT_FOUND", "VERSION_NOT_FOUND", "version_not_found");
      return found;
    },
  };
}

/** 항성계 받지 않음(BAD_REQUEST, data.reason = @terra/shared STAR_SYSTEM_REASONS) */
const systemRejected = (reason: string) => reasonedError("BAD_REQUEST", "STAR_SYSTEM_REJECTED", reason);
const systemNotFound = () => reasonedError("NOT_FOUND", "STAR_SYSTEM_NOT_FOUND", "system_not_found");

/** 항성계 이름 규칙(@terra/shared). 틀리면 BAD_REQUEST invalid_name */
function checkSystemName(raw: unknown): string {
  const name = normalizeStarSystemName(raw);
  if (name === null) throw systemRejected("invalid_name");
  return name;
}

/** 항성계 정의 검사(@terra/shared). 틀리면 BAD_REQUEST invalid_definition */
function checkSystemDefinition(raw: unknown) {
  const definition = parseStarSystemDefinition(raw);
  if (!definition) throw systemRejected("invalid_definition");
  return definition;
}

/** 항성계 보관함 처리(ADR 2026-10-31-star-system-editor). 행성 보관함과 같은 규칙: 팀 공용, 지우기만 만든 사람·admin */
function createStarSystemServices(db: Database, ip: string | null): StarSystemServices {
  return {
    list: () => listStarSystems(db),
    async get(_viewer, id) {
      const system = await readStarSystem(db, id);
      if (!system) throw systemNotFound();
      return system;
    },
    async create(viewer, input) {
      const name = checkSystemName(input.name);
      const definition = checkSystemDefinition(input.definition);
      return createStarSystem(db, { name, definition, actor: actorOf(viewer, ip) });
    },
    async save(viewer, input) {
      const definition = checkSystemDefinition(input.definition);
      const outcome = await saveStarSystem(db, {
        id: input.id,
        definition,
        expectedRevision: input.expectedRevision,
        actor: actorOf(viewer, ip),
      });
      if (outcome.kind === "not_found") throw systemNotFound();
      if (outcome.kind === "conflict")
        throw reasonedError("CONFLICT", "REVISION_CONFLICT", "revision_conflict");
      return { revision: outcome.revision, updatedAt: outcome.updatedAt, updatedBy: outcome.updatedBy };
    },
    async rename(viewer, input) {
      const name = checkSystemName(input.name);
      if (!(await renameStarSystem(db, { id: input.id, name, actor: actorOf(viewer, ip) })))
        throw systemNotFound();
      return { name };
    },
    async remove(viewer, id) {
      const outcome = await removeStarSystem(db, {
        id,
        canRemoveAny: viewer.roles.includes("admin"),
        actor: actorOf(viewer, ip),
      });
      if (outcome === "not_found") throw systemNotFound();
      if (outcome === "not_author") throw reasonedError("FORBIDDEN", "NOT_AUTHOR", "not_author");
      return { removed: true };
    },
  };
}

export function createPlanetEditorServices(deps: PlanetEditorServicesDeps): PlanetEditorServices {
  const { db, shared } = deps;
  /** 이 요청에서 동작마다 한 번만 묻는다(묶음 요청의 프로시저가 같은 답을 쓴다) */
  const permissionChecks = new Map<PlanetEditorAction, Promise<void>>();

  /** 팩에 있는 행성인지(get·revisions·restore). 저장은 받지 않음 코드 차례 안에서 본다 */
  const requirePackPlanet = (planetId: string): void => {
    if (!shared.pack.planetIds.has(planetId)) {
      throw reasonedError("BAD_REQUEST", PLANET_DRAFT_REJECTED, "unknown_planet");
    }
  };

  return {
    library: createLibraryServices(db, shared, deps.ip),
    systems: createStarSystemServices(db, deps.ip),
    ensurePermission(action) {
      let check = permissionChecks.get(action);
      if (!check) {
        check = deps.hasPermission({ planetEditor: [action] }).then((allowed) => {
          if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
        });
        permissionChecks.set(action, check);
      }
      return check;
    },

    admit(viewer, kind) {
      if (!shared.limiters.calls.take(viewer.id)) throw rateLimited();
      if (kind === "definitions" && !shared.limiters.definitions.take(viewer.id)) throw rateLimited();
    },

    async definitions(viewer) {
      const { definitions } = shared;
      // 시드가 든 자료라 감사 기록을 쓴 뒤에만 보낸다(못 쓰면 던져서 자료를 보내지 않는다)
      await recordDefinitionsRead(db, actorOf(viewer, deps.ip), {
        contentVersion: definitions.contentVersion,
        generatorVersion: definitions.generatorVersion,
        planetIds: definitions.planets.map((planet) => planet.id),
      });
      return definitions;
    },

    async getDraft(viewer, planetId) {
      requirePackPlanet(planetId);
      return readDraft(db, viewer.id, planetId);
    },

    async revisions(viewer, planetId) {
      requirePackPlanet(planetId);
      return listDraftRevisions(db, viewer.id, planetId);
    },

    async save(viewer, input) {
      const checked = checkDraftEntry(input.entry, input.planetId, shared.pack);
      if (!checked.ok) throw reasonedError("BAD_REQUEST", PLANET_DRAFT_REJECTED, checked.code);
      const outcome = await saveDraft(db, {
        ownerId: viewer.id,
        planetId: input.planetId,
        entry: checked.entry,
        bytes: checked.bytes,
        base: input.base,
        expectedRevision: input.expectedRevision,
        actor: actorOf(viewer, deps.ip),
      });
      if (outcome.kind === "conflict") {
        throw reasonedError("CONFLICT", "REVISION_CONFLICT", "revision_conflict");
      }
      return { revision: outcome.revision, updatedAt: outcome.updatedAt };
    },

    async restore(viewer, input) {
      requirePackPlanet(input.planetId);
      const outcome = await restoreDraft(db, {
        ownerId: viewer.id,
        planetId: input.planetId,
        revision: input.revision,
        actor: actorOf(viewer, deps.ip),
        check: (entry) => checkDraftEntry(entry, input.planetId, shared.pack),
      });
      if (outcome.kind === "restored") return outcome.draft;
      if (outcome.kind === "rejected")
        throw reasonedError("BAD_REQUEST", PLANET_DRAFT_REJECTED, outcome.code);
      throw outcome.kind === "no_draft"
        ? reasonedError("NOT_FOUND", "DRAFT_NOT_FOUND", "draft_not_found")
        : reasonedError("NOT_FOUND", "REVISION_NOT_FOUND", "revision_not_found");
    },

    async remove(viewer, planetId) {
      // 팩에 없는 행성도 받는다(모양은 입력 검사가 봤다): 팩에서 빠진 행성의 초안이 영영 남지 않게
      return {
        removed: await removeDraft(db, { ownerId: viewer.id, planetId, actor: actorOf(viewer, deps.ip) }),
      };
    },
  };
}
