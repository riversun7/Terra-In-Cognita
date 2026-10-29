// tRPC 맥락 만들기 — Fastify 요청에서 세션을 (필요할 때만) 읽는다.
// 맥락 타입(context.ts)과 나눈 이유: 이 파일은 Fastify·Better Auth 타입을 쓴다. 게임 앱이 읽는 선언 파일에 넣지 않는다.
// 출처 확인(src/auth/requestGuard.ts, ADR 38 9절): 다른 사이트가 사용자 쿠키로 관리자·편집기 기능을 부르지 못하게.
// - 쓰기(GET·HEAD가 아닌 요청)는 같은 출처에서 온 것만 받는다(계정 경로와 같은 규칙 isSameOriginRequest).
// - 조회(GET)도 다른 사이트에서 온 것(Sec-Fetch-Site cross-site·same-site, 다른 Origin)은 받지 않는다(isAllowedReadRequest):
//   응답은 다른 사이트가 읽을 수 없지만, 다른 사이트의 링크 하나로 감사 기록(정의 조회)이 쌓이지 않게.
// 맥락을 만들 때 던지면 묶음 요청의 프로시저마다 같은 오류가 간다(FORBIDDEN, data.reason "cross_origin").
// 프로시저는 하나도 돌지 않는다.
import type { FastifyRequest } from "fastify";
import { createAdminServices } from "../auth/adminServices.ts";
import type { TerraAuth } from "../auth/auth.ts";
import { authHeaders } from "../auth/http.ts";
import { parseRoleString } from "../auth/permissions.ts";
import { isAllowedReadRequest, isSameOriginRequest } from "../auth/requestGuard.ts";
import type { Database } from "../db/client.ts";
import {
  type PlanetEditorShared,
  betterAuthPermissionCheck,
  createPlanetEditorServices,
} from "../planetEditor/services.ts";
import { createSettingsServices } from "../settings/store.ts";
import type { TrpcContext, TrpcContextOptions, Viewer } from "./context.ts";
import { reasonedError } from "./init.ts";

export interface ContextFactoryOptions extends TrpcContextOptions {
  /** 인증이 켜져 있을 때(DB 있음)만 */
  auth?: { auth: TerraAuth; db: Database } | undefined;
  /**
   * 앱 출처(BETTER_AUTH_URL). 있으면 요청의 출처를 본다. 없으면(인증이 꺼진 서버) 보지 않는다: 세션이 없어
   * 로그인이 필요한 프로시저는 모두 UNAUTHORIZED다
   */
  appOrigin?: string | undefined;
  /** 행성 편집기(서버가 켤 때 만든 정의 조회 자료). 인증이 켜져 있어야 쓴다 */
  planetEditor?: PlanetEditorShared | undefined;
}

/** 읽기 요청(출처 규칙이 쓰기보다 느슨하다: 주소창에서 연 것도 받는다). tRPC 조회는 GET, 쓰기는 POST다 */
const READ_METHODS = new Set(["GET", "HEAD"]);

/** 이 요청을 받아도 되는 출처인지(읽기·쓰기 규칙이 다르다) */
function isAllowedOrigin(request: FastifyRequest, appOrigin: string): boolean {
  return READ_METHODS.has(request.method)
    ? isAllowedReadRequest(request.headers, appOrigin)
    : isSameOriginRequest(request.headers, appOrigin);
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
    if (request && options.appOrigin !== undefined && !isAllowedOrigin(request, options.appOrigin)) {
      throw reasonedError("FORBIDDEN", "CROSS_ORIGIN_REQUEST", "cross_origin");
    }
    let viewerPromise: Promise<Viewer | null> | undefined;
    const viewer = (): Promise<Viewer | null> => {
      viewerPromise ??=
        authDeps && request ? loadViewer(authDeps.auth, authHeaders(request)) : Promise.resolve(null);
      return viewerPromise;
    };
    const editor = options.planetEditor;
    return {
      contentVersion: options.contentVersion,
      now: options.now,
      viewer,
      admin: authDeps && request ? createAdminServices({ ...authDeps, request, viewer }) : undefined,
      settings: authDeps ? createSettingsServices(authDeps.db) : undefined,
      planetEditor:
        authDeps && request && editor
          ? createPlanetEditorServices({
              db: authDeps.db,
              shared: editor,
              ip: request.ip,
              hasPermission: betterAuthPermissionCheck(authDeps.auth, request),
            })
          : undefined,
    };
  };
}
