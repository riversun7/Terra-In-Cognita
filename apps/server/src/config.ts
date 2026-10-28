// 서버 설정 — 환경 변수에서 읽는다. 비밀값은 여기 기본값으로 두지 않는다.

/** 판정 규칙 버전. packages/sim 규칙이 바뀌면 올린다. */
export const SIM_VERSION = 1;

export interface ServerConfig {
  host: string;
  port: number;
  /** 빌드된 게임 앱(정적 파일) 위치. 없으면 API만 제공 */
  staticDir: string | undefined;
  contentVersion: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? "4100");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`invalid PORT: ${env.PORT}`);
  }
  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    staticDir: env.STATIC_DIR || undefined,
    contentVersion: env.CONTENT_VERSION ?? "dev",
  };
}
