// 서버 초안 호출(tRPC planetEditor.drafts.*) → 초안 동기화(draftSync.ts)의 DraftClient 모양 — ADR 38 9절, "구현하며 정한 것" WP-B
// 오류 약속(서버 src/trpc/planetEditor.ts): error.data.code와 data.reason.
// - 저장: CONFLICT(revision_conflict) → 충돌 결과, BAD_REQUEST + 받지 않음 코드 → 받지 않음 결과(코드만),
//   이유 없는 BAD_REQUEST(입력 형식) → 받지 않음 "invalid_entry"(다시 보내도 같다).
// - 다시 해도 같은 실패: UNAUTHORIZED → unauthorized, FORBIDDEN → forbidden, 저장이 아닌 호출의 BAD_REQUEST·NOT_FOUND
//   → invalid_request(DraftAccessError). 그 밖(닿지 못함·서버 오류·너무 잦음)은 그대로 던진다 → 동기화가 다시 시도한다.
// 서버 응답 모양은 타입으로 맞춘다(AppRouter). 시드가 든 자료라 기기 저장소에 남기지 않는다(동기화도 남기지 않는다).
import { field } from "../../net/json.ts";
import {
  DraftAccessError,
  type DraftClient,
  type DraftDeniedReason,
  type DraftRevisionInfo,
  type DraftSaveResult,
  type ServerDraft,
} from "./draftSync.ts";
import type { DraftBase, DraftEntry } from "./editorModel.ts";

/** 서버 초안 보기(drafts.get·restore) — 서버 PlanetDraftView에서 쓰는 것만 */
export interface DraftViewLike {
  readonly revision: number;
  readonly entry: Readonly<Record<string, unknown>>;
  readonly base: DraftBase | null;
  readonly updatedAt: string;
}

/** tRPC 클라이언트에서 쓰는 것만(가짜로 바꿀 수 있게) */
export interface DraftApi {
  get(input: { planetId: string }): Promise<DraftViewLike | null>;
  revisions(input: { planetId: string }): Promise<readonly DraftRevisionInfo[]>;
  save(input: {
    planetId: string;
    entry: DraftEntry;
    base: DraftBase | null;
    expectedRevision: number;
  }): Promise<{ readonly revision: number; readonly updatedAt: string }>;
  restore(input: { planetId: string; revision: number }): Promise<DraftViewLike>;
  remove(input: { planetId: string }): Promise<{ readonly removed: boolean }>;
}

/** 오류의 tRPC 코드와 이유 코드(tRPC 응답이 아니면 null) */
export function trpcErrorOf(error: unknown): { code: string | null; reason: string | null } {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  return {
    code: typeof code === "string" ? code : null,
    reason: typeof reason === "string" ? reason : null,
  };
}

/** 다시 해도 같은 실패면 그 이유(저장이 아닌 호출 기준). 아니면 null */
function deniedReason(error: unknown): DraftDeniedReason | null {
  switch (trpcErrorOf(error).code) {
    case "UNAUTHORIZED":
      return "unauthorized";
    case "FORBIDDEN":
      return "forbidden";
    case "BAD_REQUEST":
    case "NOT_FOUND":
      return "invalid_request";
    default:
      return null;
  }
}

/** 호출 하나: 다시 해도 같은 실패는 DraftAccessError로 바꿔 던진다 */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const reason = deniedReason(error);
    throw reason ? new DraftAccessError(reason) : error;
  }
}

function serverDraft(view: DraftViewLike): ServerDraft {
  return {
    revision: view.revision,
    document: { entry: view.entry, base: view.base },
    updatedAt: view.updatedAt,
  };
}

export function createDraftClient(api: DraftApi): DraftClient {
  return {
    async get(planetId) {
      const view = await guarded(() => api.get({ planetId }));
      return view ? serverDraft(view) : null;
    },
    async save({ planetId, document, expectedRevision }): Promise<DraftSaveResult> {
      try {
        const saved = await api.save({
          planetId,
          entry: document.entry,
          base: document.base,
          expectedRevision,
        });
        return { kind: "saved", revision: saved.revision, updatedAt: saved.updatedAt };
      } catch (error) {
        const { code, reason } = trpcErrorOf(error);
        if (code === "CONFLICT") return { kind: "conflict" };
        if (code === "BAD_REQUEST") return { kind: "rejected", code: reason ?? "invalid_entry" };
        if (code === "UNAUTHORIZED") throw new DraftAccessError("unauthorized");
        if (code === "FORBIDDEN") throw new DraftAccessError("forbidden");
        throw error;
      }
    },
    async restore(planetId, revision) {
      return serverDraft(await guarded(() => api.restore({ planetId, revision })));
    },
    async remove(planetId) {
      await guarded(() => api.remove({ planetId }));
    },
    revisions: (planetId) => guarded(() => api.revisions({ planetId })),
  };
}
