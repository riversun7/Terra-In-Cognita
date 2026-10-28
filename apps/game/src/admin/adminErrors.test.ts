// 관리자 오류 → 문구 키 시험 — 실제 tRPC 클라이언트(httpBatchLink)에 서버 오류 응답 모양을 넣어 본다.
// 서버가 실제로 이 모양을 주는지는 apps/server/src/auth/admin.db.test.ts가 본다.
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };
import ko from "../../messages/ko.json" with { type: "json" };
import { createApiClient } from "../net/api.ts";
import { LAST_ADMIN_MESSAGE, adminErrorInfo } from "./adminErrors.ts";

const USER_ID = "0b8f1c9e-7a4d-4f51-9a8e-1f2b3c4d5e6f";

/** tRPC 오류 응답(묶음 요청이라 배열) */
function errorClient(code: string, httpStatus: number, message: string) {
  return createApiClient({
    url: "http://game.test/api/trpc",
    fetch: async () =>
      new Response(JSON.stringify([{ error: { message, code: -32000, data: { code, httpStatus } } }]), {
        status: httpStatus,
        headers: { "content-type": "application/json" },
      }),
  });
}

async function setRolesError(client: ReturnType<typeof createApiClient>): Promise<unknown> {
  try {
    await client.admin.users.setRoles.mutate({ userId: USER_ID, roles: ["player"] });
  } catch (error) {
    return error;
  }
  throw new Error("오류가 나야 한다");
}

describe("관리자 오류 → 메시지 키", () => {
  it.each([
    ["UNAUTHORIZED", 401, "SIGN_IN_REQUIRED", "admin_err_unauthorized", true],
    ["FORBIDDEN", 403, "FORBIDDEN", "admin_err_forbidden", false],
    [
      "BAD_REQUEST",
      400,
      '[{"code":"invalid_type","message":"Invalid input"}]',
      "admin_err_bad_request",
      false,
    ],
    ["NOT_FOUND", 404, "USER_NOT_FOUND", "admin_err_not_found", false],
    ["PRECONDITION_FAILED", 412, LAST_ADMIN_MESSAGE, "admin_err_last_admin", false],
    ["PRECONDITION_FAILED", 412, "SOMETHING_ELSE", "err_unknown", false],
    ["INTERNAL_SERVER_ERROR", 500, "internal_error", "err_server", false],
    ["TOO_MANY_REQUESTS", 429, "slow down", "err_unknown", false],
  ])("%s(%i, %s) → %s", async (code, status, message, key, sessionEnded) => {
    const info = adminErrorInfo(await setRolesError(errorClient(code, status, message)));
    expect(info).toEqual({ key, sessionEnded });
    // 문구는 한국어·영어 모두 있다
    expect(Object.hasOwn(ko, key) && Object.hasOwn(en, key)).toBe(true);
  });

  it("서버에 닿지 못하거나 tRPC 응답이 아니면 연결 문구", async () => {
    const offline = createApiClient({
      url: "http://game.test/api/trpc",
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(adminErrorInfo(await setRolesError(offline))).toEqual({ key: "err_network", sessionEnded: false });
    const proxyPage = createApiClient({
      url: "http://game.test/api/trpc",
      fetch: async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    });
    expect(adminErrorInfo(await setRolesError(proxyPage))).toEqual({
      key: "err_network",
      sessionEnded: false,
    });
  });

  it("오류가 아닌 값도 견딘다", () => {
    expect(adminErrorInfo(undefined).key).toBe("err_network");
    expect(adminErrorInfo({ data: { code: 7 } }).key).toBe("err_unknown");
  });
});
