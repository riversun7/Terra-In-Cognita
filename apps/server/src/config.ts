// 서버 설정 — 환경 변수에서 읽는다. 비밀값은 여기 기본값으로 두지 않는다.
import { fileURLToPath } from "node:url";
import { type AuthConfig, readAuthConfig } from "./auth/config.ts";

export type { AuthConfig };

/** 판정 규칙 버전. packages/sim 규칙이 바뀌면 올린다. */
export const SIM_VERSION = 1;

/**
 * 믿는 프록시 주소. 이 주소에서 온 연결만 X-Forwarded-For를 따라간다.
 * NAS에서는 DSM 역방향 프록시 → Docker 포트(사설 주소)를 거쳐 들어온다. 기기가 위조한 앞쪽 값은 무시된다.
 * 형식은 Fastify trustProxy 문자열(쉼표로 구분, loopback·linklocal·uniquelocal 이름 또는 CIDR).
 */
export const DEFAULT_TRUST_PROXY = "loopback, uniquelocal";

/**
 * 콘텐츠 팩 폴더 기본값: 저장소의 content/core (개발 실행 src/, 빌드 dist/ 모두 apps/server 한 단계 아래).
 * 이미지는 CONTENT_DIR=/app/content/core를 준다(Dockerfile).
 */
export const DEFAULT_CONTENT_DIR = fileURLToPath(new URL("../../../content/core", import.meta.url));

export interface ServerConfig {
  host: string;
  port: number;
  /** 빌드된 게임 앱(정적 파일) 위치. 없으면 API만 제공 */
  staticDir: string | undefined;
  /** 콘텐츠 팩 폴더 (CONTENT_DIR). 시작할 때 검사하고, 틀리면 시작하지 않는다 */
  contentDir: string;
  /** PostgreSQL 접속 주소. 없으면 DB 없이 뜬다(이미지 동작 확인·DB 없는 개발용) */
  databaseUrl: string | undefined;
  /** 믿는 프록시 주소 (TRUST_PROXY) */
  trustProxy: string;
  /** 인증 설정. DB가 없으면 인증을 켜지 않는다(undefined) — CI 이미지 확인은 DB 없이 돈다 */
  auth: AuthConfig | undefined;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? "4100");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`invalid PORT: ${env.PORT}`);
  }
  const databaseUrl = env.DATABASE_URL || undefined;
  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    staticDir: env.STATIC_DIR || undefined,
    contentDir: env.CONTENT_DIR || DEFAULT_CONTENT_DIR,
    databaseUrl,
    trustProxy: env.TRUST_PROXY || DEFAULT_TRUST_PROXY,
    auth: databaseUrl ? readAuthConfig(env, port) : undefined,
  };
}
