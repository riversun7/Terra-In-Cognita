// 들어가기(POST /api/account/enter)·비밀번호 찾기(POST /api/account/reset-password) — ADR 2026-10-28-auth-and-accounts
// Better Auth의 공개 auth.api만 부른다: 비밀번호 확인·세션·쿠키는 Better Auth가 맡는다.
// auth.api를 서버에서 부르면 Better Auth의 HTTP 보호가 돌지 않아서 출처·형식·시도 제한은 여기서 한다.
// 응답에는 Set-Cookie만 넘긴다. 세션 토큰·이메일은 응답에도 로그에도 넣지 않는다.
// 경로·형식·오류 코드 약속: packages/shared/src/accountApi.ts
import {
  ACCOUNT_API_PATHS,
  type AccountErrorCode,
  type AccountView,
  DEFAULT_ROLE,
  type EnterResponse,
  type ResetPasswordResponse,
  parseLoginId,
} from "@terra/shared";
import { isAPIError } from "better-auth/api";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.ts";
import { type TerraAuth, placeholderEmail } from "./auth.ts";
import { authHeaders, forwardSetCookies } from "./http.ts";
import { type AccountLimiters, takeAll } from "./limits.ts";
import { PASSWORD_MAX_LENGTH, checkNewPassword } from "./passwordPolicy.ts";
import { parseRoleString } from "./permissions.ts";
import { isJsonRequest, isSameOriginRequest } from "./requestGuard.ts";
import {
  findAccountByKey,
  recoveryEmailMatches,
  saveRecoveryEmail,
  setAccountPassword,
  writeAudit,
} from "./store.ts";

/** 본문 상한(바이트). 아이디·비밀번호·이메일만 오간다 */
const BODY_LIMIT = 8 * 1024;
/** 문자열 입력 상한. 실제 규칙(아이디 20자, 비밀번호 128자)보다 넉넉히 받아 우리 오류 코드로 알려 준다 */
const TEXT_MAX = 512;

const enterBodySchema = z.strictObject({
  id: z.string().max(TEXT_MAX),
  password: z.string().min(1).max(TEXT_MAX),
  create: z.boolean().optional(),
  passwordConfirm: z.string().max(TEXT_MAX).optional(),
  email: z.string().max(TEXT_MAX).optional(),
});

const resetBodySchema = z.strictObject({
  id: z.string().max(TEXT_MAX),
  email: z.string().max(TEXT_MAX),
  newPassword: z.string().max(TEXT_MAX),
  newPasswordConfirm: z.string().max(TEXT_MAX),
});

const emailSchema = z.email().max(254);

export interface AccountRoutesOptions {
  auth: TerraAuth;
  db: Database;
  /** 앱 출처(BETTER_AUTH_URL). 같은 출처 검사 기준 */
  appOrigin: string;
  /** 새 아이디 가입 허용(AUTH_OPEN_SIGNUP) */
  openSignup: boolean;
  limiters: AccountLimiters;
  /** 첫 인증 요청에서 프록시 경로를 로그로 남긴다 */
  onFirstRequest: (request: FastifyRequest) => void;
}

type BetterAuthUser = { id: string; name: string; role?: string | null | undefined };

function toView(user: BetterAuthUser): AccountView {
  return { id: user.id, loginId: user.name, roles: parseRoleString(user.role) };
}

function fail(reply: FastifyReply, status: number, error: AccountErrorCode) {
  return reply.code(status).send({ error });
}

function tooMany(reply: FastifyReply, error: "TOO_MANY_REQUESTS" | "SIGNUP_LIMIT", retryAfterSec: number) {
  return reply.code(429).header("retry-after", String(retryAfterSec)).send({ error, retryAfterSec });
}

/** 비어 있으면 undefined, 형식이 틀리면 null, 맞으면 소문자 이메일 */
function normalizeEmail(value: string | undefined): string | undefined | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return undefined;
  const lower = trimmed.toLowerCase();
  return emailSchema.safeParse(lower).success ? lower : null;
}

type SignInResult = { ok: true; headers: Headers; user: BetterAuthUser } | { ok: false; banned: boolean };

/** 있는 계정 로그인. 비밀번호 길이 규칙(8자)은 보지 않는다 — 관리 명령으로 만든 계정은 더 짧을 수 있다 */
async function signIn(
  auth: TerraAuth,
  headers: Headers,
  loginId: string,
  password: string,
): Promise<SignInResult> {
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, banned: false };
  try {
    const result = await auth.api.signInUsername({
      body: { username: loginId, password },
      headers,
      returnHeaders: true,
    });
    return { ok: true, headers: result.headers, user: result.response.user };
  } catch (error) {
    if (isAPIError(error)) {
      if (error.body?.code === "BANNED_USER") return { ok: false, banned: true };
      if (error.statusCode === 401) return { ok: false, banned: false };
    }
    throw error;
  }
}

/** 이미 있는 아이디라서 만들지 못한 경우(동시에 같은 아이디를 만든 요청이 먼저 끝남) */
const CREATE_RACE_CODES = new Set(["USERNAME_IS_ALREADY_TAKEN", "FAILED_TO_CREATE_USER"]);

type SignUpResult = { ok: true; headers: Headers; user: BetterAuthUser } | { ok: false };

async function signUp(
  auth: TerraAuth,
  headers: Headers,
  loginId: string,
  password: string,
): Promise<SignUpResult> {
  try {
    const result = await auth.api.signUpEmail({
      body: { email: placeholderEmail(), name: loginId, username: loginId, password },
      headers,
      returnHeaders: true,
    });
    return { ok: true, headers: result.headers, user: result.response.user };
  } catch (error) {
    if (isAPIError(error) && CREATE_RACE_CODES.has(error.body?.code ?? "")) return { ok: false };
    throw error;
  }
}

export async function registerAccountRoutes(
  app: FastifyInstance,
  options: AccountRoutesOptions,
): Promise<void> {
  const { auth, db, limiters } = options;

  await app.register(async (scope) => {
    // 본문을 읽기 전에 출처와 형식을 본다(다른 사이트의 폼·이미지 요청은 여기서 끝난다)
    scope.addHook("onRequest", async (request, reply) => {
      options.onFirstRequest(request);
      // 쿠키·계정 정보가 담긴 응답은 어디에도 캐시하지 않는다(서비스 워커·프록시 포함)
      reply.header("cache-control", "no-store");
      if (!isSameOriginRequest(request.headers, options.appOrigin))
        return fail(reply, 403, "FORBIDDEN_ORIGIN");
      if (!isJsonRequest(request.headers)) return fail(reply, 415, "UNSUPPORTED_MEDIA_TYPE");
      return undefined;
    });
    // 본문 형식 오류(빈 본문, 깨진 JSON, 너무 큼)는 INVALID_REQUEST. 서버 잘못은 원문을 로그에만
    scope.setErrorHandler((error: { statusCode?: number }, request, reply) => {
      const status = error.statusCode ?? 500;
      if (status >= 400 && status < 500) return fail(reply, status, "INVALID_REQUEST");
      request.log.error({ err: error }, "account route failed");
      return fail(reply, 500, "INTERNAL_ERROR");
    });

    scope.post(ACCOUNT_API_PATHS.enter, { bodyLimit: BODY_LIMIT }, async (request, reply) => {
      const parsed = enterBodySchema.safeParse(request.body);
      if (!parsed.success) return fail(reply, 400, "INVALID_REQUEST");
      const body = parsed.data;
      const ip = request.ip;

      // 주소별 → 아이디별 → 전체 순서. 앞에서 막힌 요청은 뒤의 상한을 쓰지 않는다
      const ipWait = takeAll([[limiters.enterPerIp, ip]]);
      if (ipWait !== null) return tooMany(reply, "TOO_MANY_REQUESTS", ipWait);
      const id = parseLoginId(body.id);
      if (!id.ok) return fail(reply, 400, "INVALID_ID");
      const wait = takeAll([
        [limiters.enterPerId, id.key],
        [limiters.enterGlobal, "all"],
      ]);
      if (wait !== null) return tooMany(reply, "TOO_MANY_REQUESTS", wait);

      const headers = authHeaders(request);
      const existing = await findAccountByKey(db, id.key);
      if (existing) {
        const result = await signIn(auth, headers, id.display, body.password);
        if (result.ok) {
          forwardSetCookies(reply, result.headers);
          return reply.send({ status: "signed_in", user: toView(result.user) } satisfies EnterResponse);
        }
        if (result.banned) return fail(reply, 403, "BANNED");
        // 확인 화면에서 만들려던 아이디를 그새 다른 사람이 만들었다
        if (body.create) return fail(reply, 409, "ID_TAKEN");
        request.log.info(
          { account: "enter", result: "invalid_password", userId: existing.id },
          "enter failed",
        );
        return fail(reply, 401, "INVALID_PASSWORD");
      }

      if (!body.create) return reply.send({ status: "new_id", loginId: id.display } satisfies EnterResponse);

      // 새 계정 만들기
      if (!options.openSignup) return fail(reply, 403, "SIGNUP_CLOSED");
      if (body.passwordConfirm !== body.password) return fail(reply, 400, "PASSWORD_MISMATCH");
      const problem = checkNewPassword(body.password, id.key);
      if (problem) return fail(reply, 400, problem);
      const email = normalizeEmail(body.email);
      if (email === null) return fail(reply, 400, "INVALID_EMAIL");
      const capWait = takeAll([
        [limiters.createPerIp, ip],
        [limiters.createGlobal, "all"],
      ]);
      if (capWait !== null) return tooMany(reply, "SIGNUP_LIMIT", capWait);

      const created = await signUp(auth, headers, id.display, body.password);
      if (!created.ok) {
        // 같은 아이디를 동시에 만든 요청이 먼저 끝났다. 같은 사람이 두 번 누른 경우면 같은 비밀번호로 들어가진다
        const retry = await signIn(auth, headers, id.display, body.password);
        if (!retry.ok) return fail(reply, retry.banned ? 403 : 409, retry.banned ? "BANNED" : "ID_TAKEN");
        forwardSetCookies(reply, retry.headers);
        return reply.send({ status: "signed_in", user: toView(retry.user) } satisfies EnterResponse);
      }

      const userId = created.user.id;
      try {
        await db.transaction(async (tx) => {
          if (email) await saveRecoveryEmail(tx, userId, email);
          await writeAudit(tx, {
            actor: { kind: "user", id: userId, ip },
            action: "account.create",
            targetId: userId,
            after: { loginId: id.display, roles: [DEFAULT_ROLE], recoveryEmail: email !== undefined },
          });
        });
      } catch (error) {
        // 계정은 만들어졌지만 복구 이메일·감사 기록을 쓰지 못했다. 쿠키를 주지 않고 실패로 알린다(다시 들어가면 로그인된다)
        request.log.error({ err: error, userId }, "account created but recovery/audit write failed");
        return fail(reply, 500, "INTERNAL_ERROR");
      }
      forwardSetCookies(reply, created.headers);
      return reply.send({ status: "created", user: toView(created.user) } satisfies EnterResponse);
    });

    scope.post(ACCOUNT_API_PATHS.resetPassword, { bodyLimit: BODY_LIMIT }, async (request, reply) => {
      const parsed = resetBodySchema.safeParse(request.body);
      if (!parsed.success) return fail(reply, 400, "INVALID_REQUEST");
      const body = parsed.data;
      const ip = request.ip;

      const ipWait = takeAll([[limiters.resetPerIp, ip]]);
      if (ipWait !== null) return tooMany(reply, "TOO_MANY_REQUESTS", ipWait);
      const id = parseLoginId(body.id);
      if (!id.ok) return fail(reply, 400, "INVALID_ID");
      const wait = takeAll([
        [limiters.resetPerId, id.key],
        [limiters.resetGlobal, "all"],
      ]);
      if (wait !== null) return tooMany(reply, "TOO_MANY_REQUESTS", wait);

      if (body.newPassword !== body.newPasswordConfirm) return fail(reply, 400, "PASSWORD_MISMATCH");
      const problem = checkNewPassword(body.newPassword, id.key);
      if (problem) return fail(reply, 400, problem);
      const email = normalizeEmail(body.email);
      if (!email) return fail(reply, 400, "INVALID_EMAIL");

      // 아이디가 없든, 복구 이메일이 없든, 다르든 같은 답을 준다
      const account = await findAccountByKey(db, id.key);
      const matches = account ? await recoveryEmailMatches(db, account.id, email) : false;
      if (!account || !matches) {
        request.log.info({ account: "reset_password", result: "rejected" }, "password reset rejected");
        return fail(reply, 400, "RESET_FAILED");
      }

      const { revokedSessions } = await setAccountPassword(db, auth, {
        userId: account.id,
        password: body.newPassword,
        actor: { kind: "user", id: account.id, ip },
        action: "account.password_reset",
        after: { method: "recovery_email" },
      });
      request.log.info({ account: "reset_password", userId: account.id, revokedSessions }, "password reset");
      return reply.send({ status: "password_reset" } satisfies ResetPasswordResponse);
    });
  });
}
