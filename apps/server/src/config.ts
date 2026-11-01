// 서버 설정 — 환경 변수에서 읽는다. 비밀값은 여기 기본값으로 두지 않는다.
import { fileURLToPath } from "node:url";
import { type AuthConfig, readAuthConfig } from "./auth/config.ts";

export type { AuthConfig };

/** 판정 규칙 버전 — packages/sim의 값을 그대로 쓴다(규칙이 바뀌면 그쪽에서 올린다) */
export { SIM_VERSION } from "@terra/sim";

/**
 * 시험용 봇 수 상한(S1_TEST_BOTS). 스냅샷이 유닛 1만 개면 약 2.5MB다.
 * 10만은 규모 계단 시험(S3 ADR 7절, GitHub Actions s3-ramp)용이다. 운영은 ops/compose.yml의 1,000이다.
 */
export const MAX_TEST_BOTS = 100_000;
/** 시험 2차맵 수 상한(S1_TEST_MAPS). 봇을 2차맵마다 나눈다(한 2차맵 256×256칸에 몰리지 않게) */
export const MAX_TEST_MAPS = 64;
/** 경로 워커 수 상한(PATH_WORKERS). NAS는 2코어 4스레드(ops/nas-facts.md) */
export const MAX_PATH_WORKERS = 8;

/** S1 2차맵 시험 설정 */
export interface S1Config {
  /** 서버가 움직이는 시험용 봇 수 (S1_TEST_BOTS, 기본 0 = 봇 없음). 2차맵과 경로 워커는 늘 켠다 */
  testBots: number;
  /** 경로탐색 워커 스레드 수 (PATH_WORKERS, 기본 1) */
  pathWorkers: number;
  /** 시험 2차맵 수 (S1_TEST_MAPS, 기본 1) */
  testMaps: number;
}

/** NPC 사회 런타임 설정(docs/adr/2026-11-01-npc-brain-r5.md 7절) */
export interface NpcConfig {
  /** 켬(NPC_SOCIETY, 기본 1 = 켬, 0 = 끔). DB가 있을 때만 돈다 */
  enabled: boolean;
  /** 시험 국가 수(NPC_TEST_NATIONS, 기본 4, 질문 203 가) */
  testNations: number;
  /** 하루 길이(NPC_DAY_MS, 기본 실제 24시간). 측정용으로만 줄인다(출시 관문은 실제 시간, ADR 2026-10-31-n1-real-time-gate) */
  dayMs: number;
  /**
   * 정원사 웨이브(GARDENER_WAVES, 기본 0 = 끔, 1 = 켬). 끄면 오염은 쌓이지만 도시 웨이브 확률이 0이다.
   * 사용자 결정(2026-11-01 "합치되 웨이브 끔"): 도시 몫 문제·폐허 복원(D-339)을 정할 때까지 운영 세계에서 끈다
   */
  gardenerWaves: boolean;
}

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

/**
 * 1차맵 행성 타일 디스크 캐시 기본값: apps/server/.planet-cache (개발 실행 src/, 빌드 dist/ 모두. 저장소에 올리지 않는다).
 * 이미지는 PLANET_CACHE_DIR=/app/planet-cache를 주고(Dockerfile), NAS는 그 자리에 볼륨을 붙인다(ops/compose.yml).
 * 지워도 된다: 다음 시작 때 다시 굽는다(ADR 2026-10-29-s2-planet-lod).
 */
export const DEFAULT_PLANET_CACHE_DIR = fileURLToPath(new URL("../.planet-cache", import.meta.url));

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
  s1: S1Config;
  npc: NpcConfig;
  /** 1차맵 행성 타일 디스크 캐시 폴더 (PLANET_CACHE_DIR) */
  planetCacheDir: string;
}

/** 비어 있으면 기본값, 아니면 [min, max] 정수여야 한다 */
function readInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]: ${value}`);
  }
  return parsed;
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
    s1: {
      testBots: readInteger(env.S1_TEST_BOTS, 0, 0, MAX_TEST_BOTS, "S1_TEST_BOTS"),
      pathWorkers: readInteger(env.PATH_WORKERS, 1, 1, MAX_PATH_WORKERS, "PATH_WORKERS"),
      testMaps: readInteger(env.S1_TEST_MAPS, 1, 1, MAX_TEST_MAPS, "S1_TEST_MAPS"),
    },
    npc: {
      enabled: readInteger(env.NPC_SOCIETY, 1, 0, 1, "NPC_SOCIETY") === 1,
      testNations: readInteger(env.NPC_TEST_NATIONS, 4, 1, 16, "NPC_TEST_NATIONS"),
      dayMs: readInteger(env.NPC_DAY_MS, 86_400_000, 60_000, 86_400_000, "NPC_DAY_MS"),
      gardenerWaves: readInteger(env.GARDENER_WAVES, 0, 0, 1, "GARDENER_WAVES") === 1,
    },
    planetCacheDir: env.PLANET_CACHE_DIR || DEFAULT_PLANET_CACHE_DIR,
  };
}
