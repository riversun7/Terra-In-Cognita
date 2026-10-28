// tRPC 맥락 만들기 — Fastify 요청에서 세션을 (필요할 때만) 읽는다.
// 맥락 타입(context.ts)과 나눈 이유: 이 파일은 Fastify·Better Auth 타입을 쓴다. 게임 앱이 읽는 선언 파일에 넣지 않는다.
import type { FastifyRequest } from "fastify";
import { createAdminServices } from "../auth/adminServices.ts";
import type { TerraAuth } from "../auth/auth.ts";
import { authHeaders } from "../auth/http.ts";
import { parseRoleString } from "../auth/permissions.ts";
import type { Database } from "../db/client.ts";
import type { TrpcContext, TrpcContextOptions, Viewer } from "./context.ts";

export interface ContextFactoryOptions extends TrpcContextOptions {
  /** 인증이 켜져 있을 때(DB 있음)만 */
  auth?: { auth: TerraAuth; db: Database } | undefined;
}

/**
 * 세션 조회. tRPC 응답으로는 쿠키를 새로 줄 수 없어 세션 연장(refresh)은 끈다.
 * 연장은 기기가 GET /api/auth/get-session을 부를 때 한다(쿠키 만료도 함께 늘어난다).
 * 정지된 계정은 로그인하지 않은 것으로 본다(기본 거부).
 */
export async function loadViewer(auth: TerraAuth, headers: Headers): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers, query: { disableRefresh: true } });
  if (!session || session.user.banned) return null;
  return { id: session.user.id, loginId: session.user.name, roles: parseRoleString(session.user.role) };
}

/** 요청마다 맥락을 만드는 함수. req가 없으면(서버 안 호출·시험) 로그인하지 않은 맥락 */
export function createContextFactory(options: ContextFactoryOptions) {
  return (opts?: { req: FastifyRequest }): TrpcContext => {
    const authDeps = options.auth;
    const request = opts?.req;
    let viewerPromise: Promise<Viewer | null> | undefined;
    const viewer = (): Promise<Viewer | null> => {
      viewerPromise ??=
        authDeps && request ? loadViewer(authDeps.auth, authHeaders(request)) : Promise.resolve(null);
      return viewerPromise;
    };
    return {
      contentVersion: options.contentVersion,
      now: options.now,
      viewer,
      admin: authDeps && request ? createAdminServices({ ...authDeps, request, viewer }) : undefined,
    };
  };
}
