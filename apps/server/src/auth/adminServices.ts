// 관리자 기능 구현 — tRPC 프로시저(src/trpc/admin.ts)가 권한 미들웨어를 거친 뒤 부른다.
// 두 겹으로 확인한다: 우리 권한 표(rolesAllow, 미들웨어) + Better Auth(관리자 세션 머리글로 auth.api 호출).
// 사용자 목록에는 이메일(가짜 주소)·해시를 넣지 않는다.
// 세션 연장: Better Auth는 하루 넘게 쓴 세션을 세션 확인 때 늘리고 새 쿠키를 응답 머리글에 싣는다. auth.api 호출의 머리글은
// 그냥 두면 버려져 DB 만료만 늘고 쿠키는 그대로 끝난다. 그래서 끌 수 있는 곳(userHasPermission)은 끄고(disableRefresh),
// 끌 수 없는 곳(listUsers의 관리자 확인)은 새 쿠키를 이 응답에 함께 보낸다.
import { TRPCError } from "@trpc/server";
import { isAPIError } from "better-auth/api";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Database } from "../db/client.ts";
import type { AdminServices, AdminUserRow, Viewer } from "../trpc/context.ts";
import type { TerraAuth } from "./auth.ts";
import { authHeaders, forwardSetCookies } from "./http.ts";
import { parseRoleString } from "./permissions.ts";
import { AccountError, type AccountRow, setAccountRoles } from "./store.ts";

export interface AdminServicesDeps {
  auth: TerraAuth;
  db: Database;
  request: FastifyRequest;
  /** 이 요청의 응답(Better Auth가 세션을 늘리며 준 새 쿠키를 싣는다). 없으면 싣지 않는다 */
  reply?: FastifyReply | undefined;
  viewer: () => Promise<Viewer | null>;
}

/** 검색어 → 아이디 키 조각(소문자 영문·숫자·_). 그 밖의 글자가 있으면 맞는 아이디가 없다 → null */
export function searchKey(search: string): string | null {
  const folded = search.trim().normalize("NFKC").toLowerCase();
  return /^[a-z0-9_]*$/.test(folded) ? folded : null;
}

function rowFromAccount(account: AccountRow): AdminUserRow {
  return {
    id: account.id,
    loginId: account.loginId,
    roles: account.roles,
    banned: account.banned,
    createdAt: account.createdAt.toISOString(),
  };
}

export function createAdminServices(deps: AdminServicesDeps): AdminServices {
  const headers = () => authHeaders(deps.request);

  const requireViewer = async (): Promise<Viewer> => {
    const viewer = await deps.viewer();
    if (!viewer) throw new TRPCError({ code: "UNAUTHORIZED", message: "SIGN_IN_REQUIRED" });
    return viewer;
  };

  return {
    async listUsers({ search, limit, offset }) {
      await requireViewer();
      const key = searchKey(search);
      if (key === null) return { users: [], total: 0 };
      // Better Auth가 관리자 세션과 user:list 권한을 다시 확인한다(없으면 403 → FORBIDDEN).
      // 이 확인은 세션을 늘릴 수 있다(끌 수 없다): 늘렸으면 새 쿠키를 이 응답에 함께 보낸다
      const { headers: answered, response: result } = await callBetterAuth(() =>
        deps.auth.api.listUsers({
          headers: headers(),
          query: {
            limit,
            offset,
            sortBy: "username",
            sortDirection: "asc",
            ...(key
              ? { filterField: "username", filterOperator: "contains" as const, filterValue: key }
              : {}),
          },
          returnHeaders: true,
        }),
      );
      if (deps.reply) forwardSetCookies(deps.reply, answered);
      return {
        users: result.users.map((user) => ({
          id: user.id,
          loginId: user.name,
          roles: parseRoleString(user.role),
          banned: user.banned === true,
          createdAt: new Date(user.createdAt).toISOString(),
        })),
        total: result.total,
      };
    },

    async setRoles({ userId, roles }) {
      const viewer = await requireViewer();
      // Better Auth도 이 세션이 user:set-role을 할 수 있는지 본다. 세션은 늘리지 않는다(disableRefresh): 늘리면 새 쿠키가
      // 이 호출의 응답 머리글에 실려 버려지고, DB 만료만 늘어 다음 get-session이 쿠키를 새로 주지 않는다
      const check = await callBetterAuth(() =>
        deps.auth.api.userHasPermission({
          headers: headers(),
          body: { permissions: { user: ["set-role"] } },
          query: { disableRefresh: true },
        }),
      );
      if (!check.success) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
      try {
        const { account } = await setAccountRoles(deps.db, {
          userId,
          roles,
          actor: { kind: "admin", id: viewer.id, ip: deps.request.ip },
        });
        return rowFromAccount(account);
      } catch (error) {
        if (error instanceof AccountError) {
          if (error.code === "USER_NOT_FOUND")
            throw new TRPCError({ code: "NOT_FOUND", message: error.code });
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.code });
        }
        throw error;
      }
    },
  };
}

/** Better Auth 오류(401·403)를 tRPC 오류로. 그 밖의 오류는 그대로(500, 원문은 로그에만). 행성 편집기 권한 확인도 쓴다 */
export async function callBetterAuth<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const status = isAPIError(error) ? error.statusCode : undefined;
    if (status === 401) throw new TRPCError({ code: "UNAUTHORIZED", message: "SIGN_IN_REQUIRED" });
    if (status === 403) throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
    throw error;
  }
}
