// Better Auth 구성 — 비밀번호 확인·세션·쿠키는 Better Auth가 맡는다 (ADR 2026-10-28-auth-and-accounts)
// - better-auth/minimal: Kysely를 싣지 않는다. 표는 Drizzle 마이그레이션이 만든다(실행 중에 표를 만들지 않음).
// - Drizzle 어댑터는 relations-v2(drizzle-orm 1.0용). 옛 어댑터(better-auth/adapters/drizzle)는 1.0 RC와 맞지 않는다.
// - HTTP 경로(/api/auth/*)는 src/auth/bridge.ts의 허용 목록만 연다. 들어가기·비밀번호 찾기는 src/auth/account.ts.
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import {
  DEFAULT_ROLE,
  LOGIN_ID_MAX_LENGTH,
  LOGIN_ID_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  parseLoginId,
} from "@terra/shared";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { username } from "better-auth/plugins/username";
import type { Database } from "../db/client.ts";
import { authSchema } from "../db/schema.ts";
import { ac, roles } from "./permissions.ts";

/** 쿠키 이름 앞머리. 같은 도메인의 다른 앱(NAS의 다른 서비스) 쿠키와 겹치지 않게 */
export const COOKIE_PREFIX = "tic";
/** Better Auth email 열에 넣는 가짜 주소의 도메인. .invalid는 메일이 갈 수 없는 이름(RFC 2606) */
export const PLACEHOLDER_EMAIL_DOMAIN = "id.placeholder.invalid";

/** 계정마다 하나씩 만드는 가짜 이메일. 아이디를 넣지 않는다(복구 이메일은 account_recovery) */
export function placeholderEmail(): string {
  return `${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export interface AuthSettings {
  /** 쿠키 서명·암호화 비밀값(BETTER_AUTH_SECRET). 운영에서는 필수(config.ts가 확인) */
  secret: string | undefined;
  /** 사용자가 접속하는 주소의 출처(BETTER_AUTH_URL, 예: https://example.org:4443). https면 Secure 쿠키 */
  baseUrl: string;
}

/** Better Auth 내부 로그를 받을 곳(Fastify 로거 등). 메시지만 넘기고 인자는 오류 객체만 넘긴다 */
export interface AuthLog {
  debug(obj: object, message: string): void;
  info(obj: object, message: string): void;
  warn(obj: object, message: string): void;
  error(obj: object, message: string): void;
}

export interface CreateAuthOptions {
  db: Database;
  settings: AuthSettings;
  log?: AuthLog | undefined;
}

export function createAuth({ db, settings, log }: CreateAuthOptions) {
  return betterAuth({
    appName: "Terra In-Cognita",
    baseURL: settings.baseUrl,
    ...(settings.secret ? { secret: settings.secret } : {}),
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema, usePlural: true, transaction: true }),
    emailAndPassword: {
      enabled: true,
      // 메일 발송이 없으므로 확인을 요구하면 아무도 로그인하지 못한다
      requireEmailVerification: false,
      // 새 비밀번호 규칙(8~128자 등)은 우리 쪽(src/auth/passwordPolicy.ts)이 본다. 관리 명령(--allow-weak)은
      // 그 규칙을 건너뛸 수 있어서 Better Auth 하한은 1자로 둔다(0은 기본값 8로 바뀐다).
      minPasswordLength: 1,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: true,
    },
    session: {
      // 세션은 매번 DB에서 확인한다. 쿠키 캐시를 켜면 끊은 세션(비밀번호 찾기 뒤)이 캐시가 끝날 때까지 살아 있다
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      database: { generateId: "uuid" },
    },
    // 외부로 아무것도 보내지 않는다. 환경 변수 BETTER_AUTH_TELEMETRY*는 설정하지 않는다
    telemetry: { enabled: false },
    ...(log ? { logger: toBetterAuthLogger(log) } : {}),
    plugins: [
      username({
        minUsernameLength: LOGIN_ID_MIN_LENGTH,
        maxUsernameLength: LOGIN_ID_MAX_LENGTH,
        // 우리 경로는 정규화한 표시 모양을 넘긴다. 검사·키 만들기는 packages/shared의 같은 함수
        usernameValidator: (value) => parseLoginId(value).ok,
        usernameNormalization: (value) => {
          const parsed = parseLoginId(value);
          return parsed.ok ? parsed.key : value.toLowerCase();
        },
        // 표시 모양은 name 열에 둔다(display_username 열 없음)
        displayUsername: false,
        immutableUsername: true,
      }),
      admin({ ac, roles, defaultRole: DEFAULT_ROLE, adminRoles: ["admin"] }),
    ],
  });
}

export type TerraAuth = ReturnType<typeof createAuth>;

/**
 * 시작할 때 한 번: Better Auth 준비(운영에서 비밀값이 없으면 여기서 실패)와 표 정의 확인.
 * 표 확인은 DB에 접속하지 않고 Drizzle 표 정의(src/db/schema.ts)를 Better Auth 기대값과 비교한다.
 * 다르면 SchemaMismatchError — 그대로 두면 인증 요청마다 실패하므로 서버를 띄우지 않는다.
 */
export async function verifyAuth(auth: TerraAuth): Promise<void> {
  const context = await auth.$context;
  await context.explicitSchemaCheck?.();
}

function toBetterAuthLogger(log: AuthLog) {
  return {
    level: "warn" as const,
    log(level: "debug" | "info" | "warn" | "error", message: string, ...args: unknown[]) {
      // 인자에는 사용자 객체 등이 들어 있을 수 있어 오류 객체만 남긴다
      const err = args.find((arg) => arg instanceof Error);
      log[level](err ? { err, source: "better-auth" } : { source: "better-auth" }, message);
    },
  };
}
