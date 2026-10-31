// tRPC 초안 호출 어댑터 시험 — 오류 코드 → 충돌·받지 않음 결과, 다시 해도 같은 실패(DraftAccessError), 그 밖은 그대로 던짐
import { describe, expect, it } from "vitest";
import { type DraftApi, createDraftClient, trpcErrorOf } from "./draftClient.ts";
import { DraftAccessError } from "./draftSync.ts";

/** tRPC 클라이언트 오류 모양(data.code·data.reason) */
const trpcError = (code: string, reason?: string) =>
  Object.assign(new Error(code), { data: reason ? { code, reason } : { code } });

const view = { revision: 7, entry: { id: "p" }, base: null, updatedAt: "2026-10-31T00:00:00.000Z" };

function api(overrides: Partial<DraftApi> = {}): DraftApi {
  return {
    get: () => Promise.resolve(view),
    revisions: () => Promise.resolve([{ revision: 7, savedAt: view.updatedAt, bytes: 10 }]),
    save: () => Promise.resolve({ revision: 9, updatedAt: view.updatedAt }),
    restore: () => Promise.resolve(view),
    remove: () => Promise.resolve({ removed: true }),
    ...overrides,
  };
}

const document = { entry: { id: "p" }, base: null };

/** 서버가 저장에서 이 오류를 던질 때의 결과 */
const save = (error: Error) =>
  createDraftClient(api({ save: () => Promise.reject(error) })).save({
    planetId: "p",
    document,
    expectedRevision: 1,
  });

describe("초안 호출 어댑터", () => {
  it("읽기·되돌리기는 서버 초안 모양으로 바꾼다", async () => {
    const client = createDraftClient(api());
    expect(await client.get("p")).toEqual({
      revision: 7,
      document: { entry: { id: "p" }, base: null },
      updatedAt: view.updatedAt,
    });
    expect(await createDraftClient(api({ get: () => Promise.resolve(null) })).get("p")).toBeNull();
    expect((await client.restore("p", 3)).revision).toBe(7);
    expect(await client.save({ planetId: "p", document, expectedRevision: 7 })).toEqual({
      kind: "saved",
      revision: 9,
      updatedAt: view.updatedAt,
    });
  });

  it("저장: CONFLICT는 충돌, BAD_REQUEST는 이유 코드(없으면 invalid_entry), 로그인·권한은 다시 시도하지 않는 실패", async () => {
    expect(await save(trpcError("CONFLICT", "revision_conflict"))).toEqual({ kind: "conflict" });
    expect(await save(trpcError("BAD_REQUEST", "unknown_biome"))).toEqual({
      kind: "rejected",
      code: "unknown_biome",
    });
    expect(await save(trpcError("BAD_REQUEST"))).toEqual({ kind: "rejected", code: "invalid_entry" });
    await expect(save(trpcError("UNAUTHORIZED"))).rejects.toMatchObject({ reason: "unauthorized" });
    await expect(save(trpcError("FORBIDDEN", "cross_origin"))).rejects.toMatchObject({ reason: "forbidden" });
    // 너무 잦음·서버 오류·닿지 못함은 그대로 던진다(동기화가 다시 시도한다)
    const busy = trpcError("TOO_MANY_REQUESTS", "rate_limited");
    await expect(save(busy)).rejects.toBe(busy);
  });

  it("저장이 아닌 호출: BAD_REQUEST·NOT_FOUND는 invalid_request, 그 밖은 그대로", async () => {
    const restore = createDraftClient(
      api({ restore: () => Promise.reject(trpcError("NOT_FOUND", "revision_not_found")) }),
    );
    await expect(restore.restore("p", 1)).rejects.toBeInstanceOf(DraftAccessError);
    await expect(restore.restore("p", 1)).rejects.toMatchObject({ reason: "invalid_request" });
    const offline = new TypeError("Failed to fetch");
    const get = createDraftClient(api({ get: () => Promise.reject(offline) }));
    await expect(get.get("p")).rejects.toBe(offline);
  });

  it("오류 모양 읽기", () => {
    expect(trpcErrorOf(trpcError("CONFLICT", "revision_conflict"))).toEqual({
      code: "CONFLICT",
      reason: "revision_conflict",
    });
    expect(trpcErrorOf(new Error("x"))).toEqual({ code: null, reason: null });
  });
});
