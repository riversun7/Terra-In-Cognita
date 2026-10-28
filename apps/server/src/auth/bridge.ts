// Better Auth HTTP 경로 다리 — /api/auth/* 중 허용 목록에 있는 것만 Better Auth로 넘긴다 (ADR 인증)
// 허용: GET get-session(세션 확인·연장), POST sign-out(로그아웃). 나머지(가입·로그인·비밀번호 재설정·
// 정보 변경·계정 삭제·관리자 경로 전부)는 경로를 만들지 않아 404다. 새 버전이 경로를 늘려도 닫혀 있다.
// 본문은 문자열 그대로 넘긴다: Fastify JSON 파서는 빈 본문을 400으로, 폼 본문을 415로 막아 Better Auth까지 가지 않는다.
// 응답은 Set-Cookie와 상태만 넘기고 본문은 다시 만든다: Better Auth 응답에는 세션 토큰(HttpOnly 쿠키와 같은 값)과
// 이메일이 들어 있어서 그대로 주면 화면 스크립트가 토큰을 읽을 수 있다.
import { AUTH_SESSION_PATHS, type SessionResponse } from "@terra/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TerraAuth } from "./auth.ts";
import { authHeaders } from "./http.ts";
import { parseRoleString } from "./permissions.ts";
import { isSameOriginRequest } from "./requestGuard.ts";

const BODY_LIMIT = 4 * 1024;

export interface AuthBridgeOptions {
  auth: TerraAuth;
  /** 앱 출처(BETTER_AUTH_URL). Request 주소와 같은 출처 검사의 기준 */
  appOrigin: string;
  onFirstRequest: (request: FastifyRequest) => void;
}

/** 객체에서 키 하나를 읽는다(모르는 JSON을 타입 단언 없이 다루려고) */
function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const result: unknown = Reflect.get(value, key);
  return result;
}

/** get-session 본문 → 화면에 줘도 되는 것만(아이디·역할·만료 시각). 정지된 계정은 null */
export function toSessionResponse(body: unknown): SessionResponse {
  const user = field(body, "user");
  const id = field(user, "id");
  const name = field(user, "name");
  const role = field(user, "role");
  const expiresAt = field(field(body, "session"), "expiresAt");
  if (typeof id !== "string" || typeof name !== "string" || field(user, "banned") === true) return null;
  if (typeof expiresAt !== "string") return null;
  return {
    user: { id, loginId: name, roles: parseRoleString(typeof role === "string" ? role : null) },
    expiresAt,
  };
}

/** Better Auth 오류 본문 → { error: 코드 }. 메시지는 넘기지 않는다 */
function errorBody(body: unknown): { error: string } {
  const code = field(body, "code");
  return { error: typeof code === "string" ? code : "AUTH_ERROR" };
}

/** Better Auth에 넘기고, 상태와 Set-Cookie만 받아 온다. 본문은 JSON으로 읽어 돌려준다 */
async function forward(
  options: AuthBridgeOptions,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<unknown> {
  options.onFirstRequest(request);
  const init: RequestInit = { method: request.method, headers: authHeaders(request) };
  if (request.method === "POST" && typeof request.body === "string" && request.body.length > 0) {
    init.body = request.body;
  }
  const response = await options.auth.handler(new Request(new URL(request.url, options.appOrigin), init));
  reply.code(response.status).header("cache-control", "no-store");
  for (const cookie of response.headers.getSetCookie()) reply.header("set-cookie", cookie);
  const text = await response.text();
  try {
    return text === "" ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export async function registerAuthBridge(app: FastifyInstance, options: AuthBridgeOptions): Promise<void> {
  await app.register(async (scope) => {
    // 이 범위 안에서만 본문을 문자열로 받는다(다른 경로의 JSON 파서는 그대로)
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "string", bodyLimit: BODY_LIMIT }, (_request, body, done) => {
      done(null, body);
    });

    scope.get(AUTH_SESSION_PATHS.getSession, { exposeHeadRoute: false }, async (request, reply) => {
      const body = await forward(options, request, reply);
      if (reply.statusCode !== 200) return reply.send(errorBody(body));
      return reply.send(toSessionResponse(body));
    });

    scope.post(AUTH_SESSION_PATHS.signOut, { bodyLimit: BODY_LIMIT }, async (request, reply) => {
      // 로그아웃도 같은 출처만(다른 사이트가 사용자를 몰래 로그아웃시키지 못하게)
      if (!isSameOriginRequest(request.headers, options.appOrigin)) {
        return reply.code(403).send({ error: "FORBIDDEN_ORIGIN" });
      }
      const body = await forward(options, request, reply);
      if (reply.statusCode !== 200) return reply.send(errorBody(body));
      return reply.send({ success: true });
    });
  });
}
