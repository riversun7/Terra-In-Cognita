// Fastify 앱 구성 — 테스트에서도 같은 함수로 만든다
import path from "node:path";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from "@terra/protocol";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { registerAccountRoutes } from "./auth/account.ts";
import { type AuthSettings, type TerraAuth, createAuth, verifyAuth } from "./auth/auth.ts";
import { registerAuthBridge } from "./auth/bridge.ts";
import { authHeaders, createProxyChainLogger } from "./auth/http.ts";
import { type AccountLimitName, type LimitSetting, createAccountLimiters } from "./auth/limits.ts";
import { isAllowedSocketOrigin } from "./auth/requestGuard.ts";
import { writeAudit } from "./auth/store.ts";
import { DEFAULT_TRUST_PROXY, SIM_VERSION } from "./config.ts";
import { type Database, pingDatabase } from "./db/client.ts";
import { startServerMetrics } from "./metrics.ts";
import type { PlanetBaker } from "./planet/baker.ts";
import { type PlanetRouteLimits, registerPlanetRoutes } from "./planet/routes.ts";
import { type PlanetServiceOptions, createPlanetService } from "./planet/service.ts";
import type { PlanetSource } from "./planet/sources.ts";
import { type PlanetEditorLimits, createPlanetEditorShared } from "./planetEditor/services.ts";
import type { PlanetEditorDefinitions } from "./planetEditor/types.ts";
import { handleSession } from "./session.ts";
import { isPagePath } from "./spaFallback.ts";
import { registerTelemetry } from "./telemetry.ts";
import type { Viewer } from "./trpc/context.ts";
import { createContextFactory, loadViewer } from "./trpc/createContext.ts";
import { registerTrpc } from "./trpc/plugin.ts";
import { appRouter } from "./trpc/router.ts";
import { cacheViewer, createWorldGateway } from "./world/gateway.ts";
import { createWorldSummaryBackend } from "./world/summarySources.ts";
import type { RosterCatalog } from "./roster/catalog.ts";
import { createWorldRosterSource } from "./roster/worldUnits.ts";
import { registerTerrainRoute } from "./world/terrainRoute.ts";
import type { MapPropInput } from "@terra/planet/secondMap";
import { createTerrainService } from "./world/terrainService.ts";
import { TEST_PLANET_ID, type WorldConfig, startWorld } from "./world/world.ts";

/** WebSocket 연결의 로그인 사용자 조회를 기억하는 시간(ms). 명령마다 DB를 부르지 않는다 */
export const SOCKET_VIEWER_TTL_MS = 15_000;

/** 로그인하지 않은 사용자(인증이 꺼져 있거나 믿을 수 없는 연결) */
const signedOut = (): Promise<Viewer | null> => Promise.resolve(null);

/**
 * 빌드 파일 중 이름에 내용 해시가 있는 것(/assets/: JS·CSS·글꼴)의 캐시. 한 번 받으면 다시 묻지 않는다.
 * 해시가 없는 파일(index.html, sw.js, theme-init.js, 아이콘, manifest)은 @fastify/static 기본값(max-age=0, 매번 확인).
 * ADR 2026-10-28-design-system "글꼴"
 */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** 1차맵 행성(ADR 36): 원본마다 디스크 캐시를 읽거나 굽고 목록 정보·타일 경로를 연다 */
export interface AppPlanetsOptions {
  sources: readonly PlanetSource[];
  /** 굽는 곳. 운영은 워커(createWorkerBaker), 시험은 같은 스레드(createInlineBaker) */
  baker: PlanetBaker;
  /** 디스크 캐시 폴더(PLANET_CACHE_DIR). 없으면 캐시 없이 */
  cacheDir?: string | undefined;
  /** 시험용: 다시 굽기 지연, 속도 제한 */
  retryDelayMs?: PlanetServiceOptions["retryDelayMs"];
  limits?: Partial<PlanetRouteLimits> | undefined;
}

/** 인증 켜기(DB가 있을 때만). 없으면 /api/auth/*, /api/account/*는 404이고 tRPC는 늘 로그인하지 않은 상태 */
export interface AppAuthOptions {
  settings: AuthSettings;
  /** 새 아이디 가입 허용 (AUTH_OPEN_SIGNUP) */
  openSignup: boolean;
  /** 시험용: 시도 제한 숫자 바꾸기 */
  limits?: Partial<Record<AccountLimitName, LimitSetting>> | undefined;
}

export interface AppOptions {
  /** 콘텐츠 팩 버전 "<팩 ID>@<팩 버전>" (시험에서는 아무 문자열) */
  contentVersion: string;
  /** 콘텐츠 팩 해시(SHA-256). 없으면 /health에 넣지 않는다(시험용) */
  contentHash?: string | undefined;
  staticDir?: string | undefined;
  logger?: boolean;
  now?: () => number;
  /** 없으면 DB 없이 뜬다(헬스체크의 db는 "off") */
  db?: Database | undefined;
  /** 서버 지표 기록 간격(ms). 0이면 기록하지 않는다 */
  metricsIntervalMs?: number;
  /** 믿는 프록시 주소 (기본: 루프백·사설 주소) */
  trustProxy?: string;
  /** 인증. db가 있어야 한다 */
  auth?: AppAuthOptions | undefined;
  /** S1 2차맵(시험 2차맵 + 경로 워커 + 시험용 봇). 없으면 2차맵 요청에 unknown_map, 지형 경로 없음 */
  world?: WorldConfig | undefined;
  /** 1차맵 행성(굽기·캐시·목록 정보·타일). 없으면 행성 경로 없음 */
  planets?: AppPlanetsOptions | undefined;
  /**
   * 행성 값에서 만든 2차맵(ADR 2026-10-31-second-map-from-planet WP-3): 월드 행성(시험 행성)이 planets에 있으면
   * 지형 서비스를 띄워 시험 2차맵 지형을 만든다. 없으면 S1 임시 지형. props = 콘텐츠 map_props(src/world/mapProps.ts)
   */
  secondMaps?:
    | { props: MapPropInput[]; runner: { kind: "worker"; workerUrl: URL } | { kind: "inline" } }
    | undefined;
  /**
   * 행성 편집기(ADR 38): 서버가 켤 때 만든 정의 조회 자료(src/planetEditor/definitions.ts). 인증이 켜져 있어야 쓴다.
   * 없으면 planetEditor.* 는 권한 확인 뒤 NOT_FOUND(PLANET_EDITOR_UNAVAILABLE). limits는 시험용(속도 제한 숫자 바꾸기)
   */
  planetEditor?:
    | { definitions: PlanetEditorDefinitions; limits?: Partial<PlanetEditorLimits> | undefined }
    | undefined;
  /** 유닛·사이보그 화면의 콘텐츠 팩 자료(src/roster/catalog.ts rosterCatalogOf). 없으면 시험 자료(이름 = ID) */
  roster?: RosterCatalog | undefined;
  /**
   * 시험용: 요청의 로그인 사용자를 직접 정한다(DB 없는 시험). 주면 인증 세션 조회와 WebSocket 출처 검사를 하지 않는다.
   * 운영 코드는 쓰지 않는다.
   */
  testViewer?: ((request: FastifyRequest) => Promise<Viewer | null>) | undefined;
}

/** 서버 준비(onReady: 월드 부팅 복구 + 시험 2차맵 지형)를 기다리는 상한(ms) */
export const WORLD_READY_TIMEOUT_MS = 300_000;

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? Date.now;
  const app = Fastify({
    logger: options.logger ?? true,
    // DSM 역방향 프록시 뒤에서 실제 접속 주소를 읽는다. 모두 믿으면(true) 맨 앞의 위조 값이 접속 주소가 된다.
    trustProxy: options.trustProxy ?? DEFAULT_TRUST_PROXY,
    // tRPC 묶음 요청은 경로에 프로시저 이름을 쉼표로 잇는다(/api/trpc/a,b,c). 기본 100자는 짧다.
    routerOptions: { maxParamLength: 5_000 },
    // onReady 훅(월드 부팅 복구)이 기다리는 상한. 기본 10초면 빈 캐시의 행성 굽기(시험 2차맵 지형이 기다린다, NAS 약 18초)나
    // DB를 기다리는 부팅(최대 약 60초)에서 서버가 FST_ERR_HOOK_TIMEOUT으로 꺼지고, 다시 켜면 굽기를 처음부터 한다(되풀이)
    pluginTimeout: WORLD_READY_TIMEOUT_MS,
  });

  await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  // DB가 응답하지 않으면 503 → 배포 헬스체크가 실패해 직전 버전으로 되돌린다
  // 배포 점검(ops/smoke.mjs)은 여기의 콘텐츠 버전·해시를 CI가 검사한 값과 비교한다
  app.get("/health", async (_request, reply) => {
    const db = options.db ? ((await pingDatabase(options.db)) ? "ok" : "error") : "off";
    if (db === "error") reply.code(503);
    return {
      status: db === "error" ? "degraded" : "ok",
      db,
      // 월드 부팅 상태와 부팅 뒤 불변 조건 위반 수(S3 ADR 2절). 2차맵을 켜지 않으면 off
      world: world ? world.status().state : "off",
      worldIssues: world?.status().issues,
      worldBootMs: world?.status().bootMs,
      protocolVersion: PROTOCOL_VERSION,
      simVersion: SIM_VERSION,
      contentVersion: options.contentVersion,
      contentHash: options.contentHash,
      uptimeSec: Math.floor(process.uptime()),
    };
  });

  registerTelemetry(app, { db: options.db, now });

  let auth: { auth: TerraAuth; db: Database } | undefined;
  if (options.auth) {
    if (!options.db) throw new Error("auth requires a database");
    const instance = createAuth({ db: options.db, settings: options.auth.settings, log: app.log });
    // 비밀값이 없거나(운영) 표 정의가 Better Auth 기대와 다르면 여기서 실패한다(서버가 뜨지 않음)
    await verifyAuth(instance);
    auth = { auth: instance, db: options.db };
    const appOrigin = options.auth.settings.baseUrl;
    const onFirstRequest = createProxyChainLogger();
    await registerAuthBridge(app, { auth: instance, appOrigin, onFirstRequest });
    await registerAccountRoutes(app, {
      auth: instance,
      db: options.db,
      appOrigin,
      openSignup: options.auth.openSignup,
      limiters: createAccountLimiters(now, options.auth.limits),
      onFirstRequest,
    });
  }

  // 행성: 준비(캐시 읽기·굽기)는 기다리지 않고 시작한다. 그동안 목록 정보는 generating, 타일은 409.
  // 월드보다 먼저 만든다: 2차맵 지형 서비스가 월드 행성의 행성 값을 받는다
  const planets = options.planets
    ? createPlanetService({
        sources: options.planets.sources,
        baker: options.planets.baker,
        cacheDir: options.planets.cacheDir,
        retryDelayMs: options.planets.retryDelayMs,
        // 행성 값은 2차맵을 띄우는 월드 행성 것만 메모리에 든다(약 22MB씩)
        keepValuesFor: options.secondMaps ? [TEST_PLANET_ID] : undefined,
        log: app.log,
      })
    : undefined;
  planets?.start();
  const worldPlanet = options.planets?.sources.find((source) => source.id === TEST_PLANET_ID);
  const terrain =
    options.world && options.secondMaps && planets && worldPlanet
      ? createTerrainService({
          planetId: worldPlanet.id,
          values: () => planets.planetValues(worldPlanet.id),
          props: options.secondMaps.props,
          planetGeneratorVersion: worldPlanet.generatorVersion,
          definitionHash: worldPlanet.definitionHash,
          cacheDir: options.planets?.cacheDir,
          runner: options.secondMaps.runner,
          log: app.log,
        })
      : undefined;

  // 월드: DB가 있으면 저장·부팅 복구(S3 ADR 1·2절). 준비(listen·ready)는 부팅 복구가 끝날 때까지 기다린다.
  // 지형 서비스가 있으면 부팅이 행성 값(행성 서비스의 캐시 읽기·굽기)도 기다린다
  const world = options.world
    ? startWorld({ ...options.world, terrain, now, log: app.log, pool: options.db?.$client })
    : undefined;
  if (world) {
    app.addHook("onReady", async () => world.ready);
    app.addHook("onClose", async () => {
      // 지형 서비스를 먼저 닫는다: 행성 값을 기다리던 부팅이 실패로 끝나야 world.stop이 기다리지 않는다
      await terrain?.close();
      await world.stop();
    });
  }

  // 요청의 출처 확인 기준 = 계정 경로와 같은 앱 출처(인증이 꺼지면 세션이 없어 보지 않는다)
  const editor = options.planetEditor;
  await registerTrpc(app, {
    router: appRouter,
    createContext: createContextFactory({
      contentVersion: options.contentVersion,
      now,
      auth,
      appOrigin: options.auth?.settings.baseUrl,
      planetEditor: editor
        ? createPlanetEditorShared(editor.definitions, { now, limits: editor.limits })
        : undefined,
      // 복귀 요약: 오프라인 정산의 생산 + 확인 시각(DB가 있는 월드만)
      summary: world && options.db ? createWorldSummaryBackend(world) : undefined,
      // 유닛·사이보그 화면: 실제 유닛은 DB가 있는 월드만(복귀 요약과 같은 읽는 차례)
      roster: {
        catalog: options.roster,
        world: world && options.db ? createWorldRosterSource(world) : undefined,
      },
    }),
  });

  // 로그인 사용자 조회: HTTP 요청은 쿠키로 바로, WebSocket은 연결 요청의 출처가 앱 출처일 때만 쿠키를 믿는다
  const httpViewer = (request: FastifyRequest): Promise<Viewer | null> => {
    if (options.testViewer) return options.testViewer(request);
    return auth ? loadViewer(auth.auth, authHeaders(request)) : signedOut();
  };
  const socketViewer = (request: FastifyRequest): (() => Promise<Viewer | null>) => {
    const { testViewer } = options;
    if (testViewer) return cacheViewer(() => testViewer(request), now, SOCKET_VIEWER_TTL_MS);
    if (!auth || !options.auth || !isAllowedSocketOrigin(request.headers, options.auth.settings.baseUrl)) {
      return signedOut;
    }
    // 머리글은 연결할 때 한 번 읽어 둔다(쿠키는 연결 요청에만 있다)
    const headers = authHeaders(request);
    const deps = auth;
    return cacheViewer(() => loadViewer(deps.auth, headers), now, SOCKET_VIEWER_TTL_MS);
  };

  if (world) registerTerrainRoute(app, { world, viewer: httpViewer, terrain });
  // 관리자 전체 보기를 켜면 감사 기록을 남긴다(S3 ADR 3절). DB가 없으면 로그만
  const auditDb = options.db;
  const gateway = world
    ? createWorldGateway({
        world,
        now,
        log: app.log,
        onObserve: (viewer, mapKey) => {
          app.log.info({ userId: viewer.id, mapKey }, "second map observe");
          if (!auditDb) return;
          void writeAudit(auditDb, {
            actor: { kind: "admin", id: viewer.id, ip: null },
            action: "second_map.observe",
            targetId: viewer.id,
            after: { mapKey },
          }).catch((error: unknown) => app.log.warn({ err: error }, "observe audit failed"));
        },
      })
    : undefined;

  if (planets && options.planets) {
    registerPlanetRoutes(app, { planets, viewer: httpViewer, now, limits: options.planets.limits });
    app.addHook("onClose", async () => planets.close());
  }

  let wsConnections = 0;
  await app.register(async (scope) => {
    scope.get("/ws", { websocket: true }, (socket, request) => {
      wsConnections += 1;
      socket.on("close", () => {
        wsConnections -= 1;
      });
      handleSession(socket, {
        simVersion: SIM_VERSION,
        contentVersion: options.contentVersion,
        now,
        world: gateway,
        viewer: socketViewer(request),
        // 접속 상태(D-136): 월드가 DB에 저장할 때만. 연결은 부팅 복구가 끝난 뒤에만 들어온다(listen이 기다린다)
        presence: world
          ? {
              connect: (userId: string) => world.persistence?.settlement.connect(userId, now) ?? (() => {}),
            }
          : undefined,
      });
    });
  });

  const metricsIntervalMs = options.metricsIntervalMs ?? 60_000;
  if (metricsIntervalMs > 0) {
    // 지표 한 줄에 붙일 값: S1 2차맵(src/world/worldStats.ts), 행성(src/planet/service.ts)
    const extras = (): Record<string, number> => ({
      ...world?.takeMetrics(),
      ...terrain?.takeMetrics(),
      ...planets?.takeMetrics(),
    });
    const stopMetrics = startServerMetrics(
      app.log,
      () => wsConnections,
      metricsIntervalMs,
      world || planets ? extras : undefined,
    );
    app.addHook("onClose", async () => stopMetrics());
  }

  if (options.staticDir) {
    const root = path.resolve(options.staticDir);
    const hashedDir = path.join(root, "assets") + path.sep;
    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      // 기본 머리글(max-age=0)을 보낸 다음에 불린다 → /assets/ 파일만 덮어쓴다
      setHeaders: (reply, filePath) => {
        if (filePath.startsWith(hashedDir)) reply.header("cache-control", IMMUTABLE_CACHE_CONTROL);
      },
    });
    // 화면 이동(SPA) 경로만 index.html로 보낸다. API·WebSocket·상태 경로와 파일처럼 보이는 경로(확장자 있음)는 404.
    // 판정 규칙은 src/spaFallback.ts(화면 주소 표 packages/shared/src/routes.ts와 짝)
    app.setNotFoundHandler((request, reply) => {
      if (isPagePath(request.method, request.url)) return reply.sendFile("index.html");
      return reply.code(404).send({ error: "not_found" });
    });
  }

  return app;
}
