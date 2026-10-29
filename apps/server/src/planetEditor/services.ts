// 행성 편집기 요청 처리 — tRPC planetEditor.*(src/trpc/planetEditor.ts)가 권한 미들웨어(우리 권한 표)를 거친 뒤 부른다.
// ADR 2026-10-29-planet-editor-stage1 9·11절. 요청마다 만든다(src/trpc/createContext.ts).
// - 두 겹 권한: 우리 권한 표(미들웨어) + Better Auth userHasPermission(요청한 사람의 세션 머리글, ensurePermission).
// - 행성 ID는 팩에 있는 것만: 아니면 BAD_REQUEST(data.reason "unknown_planet"). 저장은 받지 않음 코드 차례대로 본다(validate.ts).
// - 감사 기록 행위자: 자기 초안·팩 정의를 다루는 계정이라 kind "user", 그때의 역할을 meta에 남긴다.
import { TRPCError } from "@trpc/server";
import type { FastifyRequest } from "fastify";
import { callBetterAuth } from "../auth/adminServices.ts";
import type { TerraAuth } from "../auth/auth.ts";
import { authHeaders } from "../auth/http.ts";
import type { AuditActor } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import type { PlanetEditorAction, PlanetEditorServices, Viewer } from "../trpc/context.ts";
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
import { type DraftPackContext, checkDraftEntry } from "./validate.ts";

/** 받지 않은 요청(BAD_REQUEST)의 message. 무엇이 틀렸는지는 data.reason */
export const PLANET_DRAFT_REJECTED = "PLANET_DRAFT_REJECTED";

/** 서버가 켤 때 한 번 만든 것(요청마다 같다) */
export interface PlanetEditorShared {
  definitions: PlanetEditorDefinitions;
  pack: DraftPackContext;
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

/** 요청의 세션으로 Better Auth에 묻는 권한 확인 */
export function betterAuthPermissionCheck(auth: TerraAuth, request: FastifyRequest): PermissionCheck {
  return async (permissions) => {
    const result = await callBetterAuth(() =>
      auth.api.userHasPermission({ headers: authHeaders(request), body: { permissions } }),
    );
    return result.success;
  };
}

function actorOf(viewer: Viewer, ip: string | null): AuditActor {
  return { kind: "user", id: viewer.id, ip, meta: { roles: viewer.roles } };
}

export function createPlanetEditorServices(deps: PlanetEditorServicesDeps): PlanetEditorServices {
  const { db, shared } = deps;

  /** 팩에 있는 행성인지(get·revisions·restore·remove). 저장은 받지 않음 코드 차례 안에서 본다 */
  const requirePackPlanet = (planetId: string): void => {
    if (!shared.pack.planetIds.has(planetId)) {
      throw reasonedError("BAD_REQUEST", PLANET_DRAFT_REJECTED, "unknown_planet");
    }
  };

  return {
    async ensurePermission(action) {
      if (!(await deps.hasPermission({ planetEditor: [action] }))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
      }
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
      requirePackPlanet(planetId);
      return {
        removed: await removeDraft(db, { ownerId: viewer.id, planetId, actor: actorOf(viewer, deps.ip) }),
      };
    },
  };
}
