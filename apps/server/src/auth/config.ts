// 인증 설정 — 환경 변수에서 읽는다. 서버(src/config.ts)와 관리 명령(src/cli/commands.ts)이 같이 쓴다.
// 이 파일은 import.meta.url을 쓰지 않는다: 빌드 때 서버·관리 명령의 공용 조각(dist/assets/)으로 빠질 수 있어서
// 상대 경로가 어긋나지 않게 한다(콘텐츠 폴더 기본값은 src/config.ts에만 둔다).

/** BETTER_AUTH_SECRET 최소 길이. 32바이트 무작위 값의 16진수(64자)를 권한다(ops/deploy.sh가 만든다) */
export const AUTH_SECRET_MIN_LENGTH = 32;

export interface AuthConfig {
  /** 쿠키 서명 비밀값 (BETTER_AUTH_SECRET). 운영에서는 필수, 개발에서는 없으면 Better Auth 개발용 값 */
  secret: string | undefined;
  /**
   * 사용자가 접속하는 주소의 출처 (BETTER_AUTH_URL). 같은 출처 검사와 쿠키 Secure 여부의 기준.
   * 운영: https://<NAS 주소>:4443 (ops/compose.yml). 개발: 게임 앱 Vite 주소 http://localhost:5173
   */
  baseUrl: string;
  /** 새 아이디 가입 허용 (AUTH_OPEN_SIGNUP, 기본 true). false면 있는 계정만 들어갈 수 있다 */
  openSignup: boolean;
}

/**
 * 인증 설정 읽기 — 서버와 관리 명령(src/cli.ts)이 같이 쓴다.
 * 운영(NODE_ENV=production)에서는 비밀값(32자 이상)과 https 주소가 없으면 시작하지 않는다.
 */
export function readAuthConfig(env: NodeJS.ProcessEnv, port = 4100): AuthConfig {
  const production = env.NODE_ENV === "production";
  const secret = env.BETTER_AUTH_SECRET || undefined;
  if (secret !== undefined && secret.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must be at least ${AUTH_SECRET_MIN_LENGTH} characters`);
  }
  if (production && !secret) throw new Error("BETTER_AUTH_SECRET is required in production");

  const rawUrl = env.BETTER_AUTH_URL || undefined;
  if (production && !rawUrl) throw new Error("BETTER_AUTH_URL is required in production");
  const baseUrl = parseOrigin(rawUrl ?? `http://localhost:${port}`, "BETTER_AUTH_URL");
  if (production && !baseUrl.startsWith("https://")) {
    throw new Error("BETTER_AUTH_URL must be https in production (Secure cookies)");
  }

  return { secret, baseUrl, openSignup: parseBoolean(env.AUTH_OPEN_SIGNUP, true, "AUTH_OPEN_SIGNUP") };
}

/** 출처(scheme://host[:port])만 받는다. 경로·검색어가 붙으면 오류 */
function parseOrigin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${name} must be http(s)`);
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be an origin without path, e.g. https://example.org:4443`);
  }
  return url.origin;
}

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value === "") return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true or false: ${value}`);
}
