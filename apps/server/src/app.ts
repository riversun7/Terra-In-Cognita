// Fastify 앱 구성 — 테스트에서도 같은 함수로 만든다
import path from "node:path";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from "@terra/protocol";
import { TEST_RANKING_COEFFICIENTS, combatCoefficientsFrom } from "@terra/sim";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { registerAccountRoutes } from "./auth/account.ts";
import { type TerraAuth, createAuth, verifyAuth } from "./auth/auth.ts";
import { registerAuthBridge } from "./auth/bridge.ts";
import { authHeaders, createProxyChainLogger } from "./auth/http.ts";
import { createAccountLimiters } from "./auth/limits.ts";
import { isAllowedSocketOrigin } from "./auth/requestGuard.ts";
import { writeAudit } from "./auth/store.ts";
import { DEFAULT_TRUST_PROXY, SIM_VERSION } from "./config.ts";
import { type Database, pingDatabase } from "./db/client.ts";
import { createEconomyServices } from "./economyView/services.ts";
import { worldEconomySource } from "./economyView/worldSource.ts";
import { createWorldFactionSource } from "./factionScreen/source.ts";
import { factionRulesFrom } from "./factionScreen/tuning.ts";
import { startServerMetrics } from "./metrics.ts";
import { NO_OPS_SWITCHES, loadOpsSwitches } from "./ops/switches.ts";
import { createResourceMaps } from "./planet/resourceMap.ts";
import { registerPlanetRoutes } from "./planet/routes.ts";
import { createPlanetService } from "./planet/service.ts";
import { createPlanetEditorShared } from "./planetEditor/services.ts";
import { handleSession } from "./session.ts";
import { isPagePath } from "./spaFallback.ts";
import { registerTelemetry } from "./telemetry.ts";
import type { Viewer } from "./trpc/context.ts";
import { createContextFactory, loadViewer } from "./trpc/createContext.ts";
import { registerTrpc } from "./trpc/plugin.ts";
import { appRouter } from "./trpc/router.ts";
import { cacheViewer, createWorldGateway } from "./world/gateway.ts";
import { createCyborgGateway } from "./cyborg/gateway.ts";
import { createRecruitGateway } from "./recruit/gateway.ts";
import { createFusionGateway } from "./fusion/gateway.ts";
import { createTempleGateway } from "./temple/gateway.ts";
import { hospitalServiceOf } from "./hospital/attach.ts";
import { createHospitalGateway } from "./hospital/gateway.ts";
import { citizenshipServiceOf } from "./citizenship/attach.ts";
import { createCitizenshipGateway } from "./citizenship/gateway.ts";
import { attachHouses } from "./factionIdentity/attach.ts";
import { TEST_HOUSE_RULES, houseRulesFrom } from "./factionIdentity/rules.ts";
import { configureInjuryRules } from "./world/unitCondition.ts";
import { createRuinGateway } from "./ruins/gateway.ts";
import { marketSourceOf } from "./market/appSource.ts";
import { serverEconomyCatalogAccessor } from "./market/catalog.ts";
import { createTravelRaids } from "./travel/raid.ts";
import { createMarketGateway } from "./market/gateway.ts";
import { createTravelGateway } from "./travel/gateway.ts";
import { createGatherGateway } from "./gather/gateway.ts";
import { gatherReadsOf } from "./gather/reads.ts";
import { startWorldGather } from "./gather/world.ts";
import { createBoatGateway } from "./boats/gateway.ts";
import { startWorldBoats } from "./boats/world.ts";
import { holdingsConfigOf } from "./holdings/config.ts";
import { vitalsConfigOf } from "./vitals/config.ts";
import { createVitalsReads } from "./vitals/reads.ts";
import { createItemGateway } from "./holdings/gateway.ts";
import { createHoldingsReads } from "./holdings/reads.ts";
import { createLaborGateway } from "./labor/gateway.ts";
import { createFacilityGateway } from "./facilities/gateway.ts";
import { facilityScreenSourceOf } from "./facilities/appSource.ts";
import { type CyborgService, cyborgReadsOf } from "./cyborg/service.ts";
import { loadEmblemHashes } from "./nationEdit/emblems.ts";
import type { RecruitService } from "./recruit/service.ts";
import { createWorldSummaryBackend } from "./world/summarySources.ts";
import { testRosterCatalog } from "./roster/catalog.ts";
import { createWorldRosterSource } from "./roster/worldUnits.ts";
import { createSecondMapLab } from "./world/secondMapLab.ts";
import { registerTerrainRoute } from "./world/terrainRoute.ts";
import { EARTH_FACE_LEVEL } from "@terra/planet";
import { worldMapReadsOf } from "./worldMap/reads.ts";
import { bootTuning, createTuningShared } from "./tuning/services.ts";
import { createBalanceServices } from "./balance/services.ts";
import { bootContentEdit, createContentEditShared } from "./contentEdit/services.ts";
import { staminaBasisOf } from "./contentEdit/staminaBasis.ts";
import { createItemEditShared } from "./itemEdit/services.ts";
import { createFormulaServices } from "./formulas/services.ts";
import { createHeavyGate } from "./balance/gate.ts";
import { duelRunnerOf, inlineJobRunner, workerJobRunner } from "./balance/runner.ts";
import { inlineBatchRunner, workerBatchRunner } from "./battleLab/analysisRunner.ts";
import { createBattleLabShared } from "./battleLab/services.ts";
import { worldArenaTerrains } from "./battleLab/worldTerrains.ts";
import { createArenaSource } from "./battleReplay/arena.ts";
import { type ReplayJob, type ReplayJobResult, runReplayJob } from "./battleReplay/compute.ts";
import {
  inlineJobRunner as inlineReplayRunner,
  workerJobRunner as workerReplayRunner,
} from "./battleReplay/jobRunner.ts";
import {
  REPLAY_TIMEOUT_MS,
  REPLAY_WORKER_HEAP_MB,
  createBattleReplayServices,
} from "./battleReplay/services.ts";
import { createTerrainService } from "./world/terrainService.ts";
import { TEST_MAP_KEY, TEST_PLANET_ID, startWorld, testMapKey } from "./world/world.ts";
import { primaryPlanetId } from "./world/playablePlanets.ts";
import { planetGaugesOf } from "./ops/planetReads.ts";
import { placementSourceOf } from "./world/placementService.ts";
import { cityLayoutServiceOf } from "./facilities/cityLayoutView.ts";
import { registerNationEmblemRoute } from "./nationEdit/emblems.ts";
import { nationName } from "./npc/nations.ts";
import type { AppOptions } from "./appOptions.ts";
import { createRankingRuntime, createRankingServices } from "./ranking/services.ts";
import { ASSET_CREDIT } from "./world/settlement.ts";
import { beaconFacilityView } from "./territory/facility.ts";
import { createTerritoryGateway } from "./territory/gateway.ts";
import type { TerritoryService } from "./territory/service.ts";

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

export type { AppAuthOptions, AppOptions, AppPlanetsOptions } from "./appOptions.ts";

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
      // 덮어쓴 설정 칸 수(0이면 팩 값 그대로)와 세계 설정 판(docs/adr/2026-11-01-dev-settings-panel.md 10절)
      tuningOverrides: options.tuning?.state.appliedCount(),
      tuningRevision: options.tuning?.state.revision(),
      // 덮어쓴 팩 항목 수(스킬·무기·유닛 종류)와 그 판(docs/adr/2026-11-01-skill-editor.md)
      contentOverrides: options.contentEdit?.state.appliedCount(),
      contentRevision: options.contentEdit?.state.revision(),
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
  // 세계 행성 = 대표 플레이 행성(src/world/playablePlanets.ts, docs/adr/2026-11-11-planet-scope.md)
  const worldPlanet = options.planets?.sources.find((source) => source.id === primaryPlanetId());
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

  // 설정 칸 실효 값(팩 + 덮어쓰기): 서버에서 칸 값을 읽는 곳은 모두 이 접근자를 쓸 때마다 부른다
  const tuningState = options.tuning?.state;
  const contentEditState = options.contentEdit?.state;
  const tuningShared = options.tuning
    ? createTuningShared({
        state: options.tuning.state,
        pack: {
          packId: options.tuning.packId,
          contentVersion: options.contentVersion,
          contentHash: options.contentHash ?? "",
        },
        now,
        log: app.log,
        limits: options.tuning.limits,
      })
    : undefined;
  // 밸런스 화면(가중치 표·기여·시드 대결)과 전투 실험실: 설정 칸 접근자 위에서 돈다. 무거운 일(대결·전투)은 같은 워커 진입 파일,
  // 서버 전체 한 번에 하나(같은 바쁨 표시)
  const balanceRunner = options.balance?.runner;
  const jobRunner =
    balanceRunner?.kind === "worker"
      ? workerJobRunner({ workerUrl: balanceRunner.workerUrl })
      : inlineJobRunner();
  const heavyGate = createHeavyGate();
  const balance = tuningShared
    ? createBalanceServices({
        tuning: tuningShared,
        roster: options.roster ?? testRosterCatalog(),
        runner: duelRunnerOf(jobRunner),
        now,
        log: app.log,
        limits: options.balance?.limits,
        gate: heavyGate,
      })
    : undefined;
  // 계산식 탭(식 칸·무기·표본): 설정 칸 접근자 위에서 돈다
  const formulas = tuningShared
    ? createFormulaServices({ tuning: tuningShared, roster: options.roster ?? testRosterCatalog() })
    : undefined;
  const tuningDb = options.db;
  if (tuningShared && tuningDb) {
    // 덮어쓰기를 싣는다(요청을 받기 전에). DB를 기다리는 다시 시도는 월드 부팅과 같다
    app.addHook("onReady", async () => bootTuning(tuningDb, tuningShared));
  }
  // 팩 항목 덮어쓰기(스킬 편집기): 설정 칸 패널과 같은 차례로 켤 때 싣는다
  // 행동별 소모 화면의 스태미나 기준(D-511): 실효 전투 자료·설정 칸·계산식으로 보통 유닛을 셈한다(요청마다 지금 값)
  const staminaRoster = options.roster;
  const contentEdit = options.contentEdit
    ? createContentEditShared({
        state: options.contentEdit.state,
        pack: { packId: options.tuning?.packId ?? "core", contentVersion: options.contentVersion },
        now,
        log: app.log,
        staminaBasis:
          tuningState && staminaRoster
            ? (rows) =>
                staminaBasisOf(
                  {
                    combat: staminaRoster.combat,
                    coefficients: combatCoefficientsFrom(
                      tuningState.values(),
                      undefined,
                      tuningState.combatFormulas(),
                    ),
                    growthPm: tuningState.society().cyborg.growthPm,
                  },
                  rows,
                )
            : undefined,
      })
    : undefined;
  if (contentEdit && tuningDb) {
    app.addHook("onReady", async () => bootContentEdit(tuningDb, contentEdit));
  }
  // 아이템 편집기(/dev/items): 같은 덮어쓰기 층 위에서 돈다. 미리 보기는 설정 칸 접근자(실효 계산식)·유닛 화면 전투 자료(실효)를 쓴다
  const itemEdit = contentEdit
    ? createItemEditShared({
        content: contentEdit,
        tuning: tuningShared,
        roster: options.roster ?? testRosterCatalog(),
      })
    : undefined;

  // 부상 4단계(D-521, docs/adr/2026-11-08-injury.md): 세계 유닛 상태·전투 결과·작업 중 부상·병원이 부를 때마다 설정 칸 실효 값(N55)을 읽는다
  const injuryRoster = options.roster;
  configureInjuryRules(
    tuningState
      ? () => tuningState.society().injury
      : injuryRoster
        ? () => injuryRoster.society.injury
        : undefined,
  );
  // 월드: DB가 있으면 저장·부팅 복구(S3 ADR 1·2절). 준비(listen·ready)는 부팅 복구가 끝날 때까지 기다린다.
  // 지형 서비스가 있으면 부팅이 행성 값(행성 서비스의 캐시 읽기·굽기)도 기다린다
  const rosterCatalog = options.roster;
  const world = options.world
    ? startWorld({
        ...options.world,
        terrain,
        now,
        log: app.log,
        pool: options.db?.$client,
        // 사이보그 만들기 규칙: 설정 칸 실효 값을 얹은 세력·사회 계수표(N9·N6·N36·N39, 환생과 같은 굴리기), 부를 때마다 읽는다.
        // 팩이 없으면 sim 시험 계수표
        cyborgRules: tuningState
          ? () => tuningState.society()
          : rosterCatalog
            ? () => rosterCatalog.society
            : undefined,
        // 정원사 웨이브 전투(docs/adr/2026-11-01-gardener-r5b.md): 팩 전투 자료, 설정 칸 실효 값을 얹은 전투 계수(부를 때마다)
        // 팩 항목 덮어쓰기(스킬 편집기)·가중치 표 덮어쓰기를 얹은 실효 자료, 전투를 열 때마다 읽는다
        combatCatalog: rosterCatalog ? () => rosterCatalog.combat : undefined,
        combatRules: tuningState
          ? () => combatCoefficientsFrom(tuningState.values(), undefined, tuningState.combatFormulas())
          : undefined,
        // 영토 층(docs/adr/2026-11-03-territory-layer.md): 비콘 시설 = 팩 territory_beacon 실효 값(건물 편집기가 덮어쓴다, 켬끔·재료)
        territory: {
          beaconFacility: contentEditState
            ? () =>
                beaconFacilityView(
                  contentEditState,
                  tuningState ? () => tuningState.society().facilityBuild : undefined,
                )
            : undefined,
          faceLevels: worldPlanet ? new Map([[worldPlanet.id, worldPlanet.faceLevel]]) : undefined,
        },
        // 보유 물건(docs/adr/2026-11-03-item-holdings.md): 실효 콘텐츠·설정 칸 실효 값·사이보그 1차 스탯
        holdings: holdingsConfigOf({
          content: options.contentEdit?.state,
          tuning: tuningState,
          roster: rosterCatalog,
        }),
        // 생명 수치(D-512·D-514): 사이보그·유닛 화면과 같은 몸 자료(최대 HP·아머·쉴드, HP 회복·아머 회복·쉴드 재생 — 입은 장비·버프·
        // 부상 불이익 포함)와 부상 단계별 HP 회복 속도(설정 칸 실효 값)
        vitals: vitalsConfigOf(rosterCatalog, tuningState),
        // 세계 전투 시작 사양의 몸(입은 장비·버프, 사이보그 화면과 같은 셈 — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07 …)")
        roster: rosterCatalog ? () => rosterCatalog : undefined,
        // 건물 짓기·노화·수리(docs/adr/2026-11-07-buildings-runtime.md): 실효 시설·아이템(건물·아이템 편집기 덮어쓰기가 바로 든다)
        facilities: contentEditState
          ? { content: () => contentEditState.effective(), gatherKinds: () => options.gatherObjects ?? [] }
          : undefined,
        // NPC 도시 경제·거래소(docs/adr/2026-11-07-play-flow.md WP4): 경제 화면 목록 + 실효 아이템·시설·채집 확률표
        economy: serverEconomyCatalogAccessor(
          options.economyCatalog,
          contentEditState ? () => contentEditState.effective() : undefined,
        ),
      })
    : undefined;
  // 사이보그(docs/adr/2026-11-01-first-login-cyborg.md): 세계가 준비된 뒤의 서비스(DB가 있는 월드만)
  const cyborgService = (): CyborgService | undefined =>
    world?.status().state === "ready" ? world.persistence?.cyborgs : undefined;
  // 영토(docs/adr/2026-11-03-territory-layer.md): 같은 조건
  const territoryService = (): TerritoryService | undefined =>
    world?.status().state === "ready" ? world.persistence?.territory : undefined;
  // 세계 배치 화면(기획 D-528, src/world/placementService.ts): DB가 있는 세계, 행성 값이 있을 때
  const worldLayout =
    world && options.db && tuningState
      ? placementSourceOf({
          world,
          pool: options.db.$client,
          planetId: TEST_PLANET_ID,
          testMapKeys: Array.from({ length: Math.max(1, options.world?.testMaps ?? 1) }, (_, n) =>
            testMapKey(n),
          ),
          seed: () => tuningState.society().worldSeed,
          nationName: (code) => nationName(code, options.world?.npc?.presets),
          now,
          // 국력 등급·세울 수 있는 국가(실효 프리셋 — 저장하면 제자리에서 바뀐다)
          presets: () => options.world?.npc?.presets ?? [],
          testNations: options.world?.npc?.testNations,
          territory: () => tuningState.society().territory,
          // 도시 건물 배치 미리 보기·다시 놓기 예약(docs/adr/2026-11-11-city-building-layout.md)
          cityLayout: cityLayoutServiceOf(
            world,
            options.db.$client,
            () => tuningState.society().worldSeed,
            now,
            TEST_PLANET_ID,
          ),
        })
      : undefined;
  // 구인 카드(D-469): 세계가 준비되고 NPC 사회 런타임이 돌 때만(거울 도시·시드가 런타임에 있다)
  const recruitService = (): RecruitService | undefined =>
    world?.status().state === "ready" && world.npc ? world.persistence?.recruits : undefined;
  // 보유 물건(docs/adr/2026-11-03-item-holdings.md): 세계가 준비된 뒤의 접근(DB가 있는 월드만)
  const holdingsAccess = () =>
    world?.status().state === "ready" ? world.persistence?.holdings.access : undefined;
  // 노동 계약(docs/adr/2026-11-03-labor-contracts.md): 세계가 준비된 뒤의 서비스(DB가 있는 월드만)
  const laborService = () => (world?.status().state === "ready" ? world.persistence?.labor : undefined);
  // 사이보그 유닛 융합·유전자(docs/adr/2026-11-07-cyborg-fusion-genes.md): 세계가 준비된 뒤의 서비스(DB가 있는 월드만)
  const fusionService = () => (world?.status().state === "ready" ? world.persistence?.fusion : undefined);
  // 신전·종교(docs/adr/2026-11-07-temple-religion.md): 융합 서비스 안의 신전(같은 조건)
  const templeService = () => fusionService()?.temple;
  // 병원 치료(docs/adr/2026-11-08-injury.md): 세계가 준비된 뒤(DB가 있는 월드만). 의사 치유 스킬 = 실효 스킬 자료의 모양 heal
  const hospitalService = hospitalServiceOf(world, {
    skills: rosterCatalog ? () => rosterCatalog.combat.skills : undefined,
    now,
  });
  // 폐허 복원(docs/adr/2026-11-07-ruins-restoration.md): 세계가 준비되고 NPC 사회 런타임이 돌 때만(거울 세계 규칙)
  const ruinService = () =>
    world?.status().state === "ready" && world.npc ? world.persistence?.ruins : undefined;
  // 물자 거래소(docs/adr/2026-11-07-play-flow.md WP4): 세계가 준비되고 NPC 사회 런타임이 도시 경제를 돌릴 때만
  const marketSource = marketSourceOf(world, now);
  // 건물(docs/adr/2026-11-07-buildings-runtime.md): 같은 조건
  const facilityService = () =>
    world?.status().state === "ready" ? world.persistence?.facilities.service : undefined;
  // 지도 흐름 조회(docs/adr/2026-11-07-play-flow.md "WP2"): 1차맵 도시·국가, 내 사이보그 자리(세계가 준비된 뒤, DB가 있는 월드만)
  const worldMapService =
    world && options.db
      ? worldMapReadsOf({
          world,
          pool: options.db.$client,
          planetId: TEST_PLANET_ID,
          faceLevel: worldPlanet?.faceLevel ?? EARTH_FACE_LEVEL,
          presets: options.world?.npc?.presets,
          planets: planets && worldPlanet ? planets : undefined,
          pollutionDanger: tuningState ? () => tuningState.society().gardener.nomadThreshold : undefined,
        })
      : undefined;
  if (world) {
    app.addHook("onReady", async () => {
      await world.ready;
      // 2차맵 사이 이동 도중 습격(docs/adr/2026-11-07-play-flow.md "WP13", 기획 답 610 나): 팩 전투 자료·설정 칸 실효 값·NPC 런타임 오염
      const persistence = world.persistence;
      if (rosterCatalog && persistence)
        persistence.travel.attachRaids(
          createTravelRaids({
            rules: tuningState ? () => tuningState.society().gardener : undefined,
            pollutionOf: (mapKey) => world.npc?.gardener.run.layer().get(mapKey) ?? 0,
            catalog: () => rosterCatalog.combat,
            combat: tuningState
              ? () => combatCoefficientsFrom(tuningState.values(), undefined, tuningState.combatFormulas())
              : undefined,
            bodies: persistence.bodies,
          }),
        );
    });
    app.addHook("onClose", async () => {
      // 지형 서비스를 먼저 닫는다: 행성 값을 기다리던 부팅이 실패로 끝나야 world.stop이 기다리지 않는다
      await terrain?.close();
      await world.stop();
    });
  }

  // 원자재 오브젝트 채집·건물 들어가기(docs/adr/2026-11-07-gather-objects.md): 세계가 준비된 뒤(DB가 있는 월드만)
  const worldGather =
    world && options.db
      ? startWorldGather(world, { kinds: () => options.gatherObjects ?? [], now, log: app.log })
      : undefined;
  if (worldGather) app.addHook("onClose", async () => worldGather.stop());
  const gatherReads = worldGather ? gatherReadsOf(() => worldGather.current()) : undefined;
  // 배(docs/adr/2026-11-13-boats.md): 세계가 준비된 뒤(DB가 있는 월드만)
  const worldBoats = world && options.db ? startWorldBoats(world, { now, log: app.log }) : undefined;
  if (worldBoats) app.addHook("onClose", async () => worldBoats.stop());

  // 랭킹(docs/adr/2026-11-07-ranking.md): 설정 칸 실효 값(부를 때마다), 집계 일정은 월드가 준비된 뒤 1분마다 경계를 본다(DB가 있는 월드만)
  const rankingCoefficients = tuningState ? () => tuningState.society().ranking : undefined;
  // 플레이어 가문 설정 칸(창설 비용·약어 폭·이름 대기·신고·자동 막기)
  const houseRules = tuningState ? () => houseRulesFrom(tuningState.society()) : () => TEST_HOUSE_RULES;
  const rankingPaths = options.ranking?.paths ?? [];
  const rankingPool = options.db?.$client;
  const ranking = createRankingServices({
    db: rankingPool,
    paths: rankingPaths,
    nations: options.ranking?.nations,
    coefficients: rankingCoefficients,
  });
  if (world && rankingPool) {
    const runtime = createRankingRuntime({
      pool: rankingPool,
      paths: rankingPaths,
      coefficients: rankingCoefficients ?? (() => TEST_RANKING_COEFFICIENTS),
      creditAsset: ASSET_CREDIT,
      now,
      ready: () => world.status().state === "ready",
      durable: async () => world.persistence?.writer.durable(),
      log: app.log,
    });
    // 월드 부팅 복구(앞 onReady 훅) 뒤에 일정을 건다. 집계는 준비를 막지 않는다(뒤에서 돈다)
    app.addHook("onReady", async () => runtime.start());
    app.addHook("onClose", async () => runtime.stop());
  }

  const secondMapLab =
    world && terrain && planets && worldPlanet
      ? createSecondMapLab({
          planetId: worldPlanet.id,
          values: () => planets.planetValues(worldPlanet.id),
          terrainVersion: () => terrain.version(),
          loadedVersion: (mapKey) => world.map(mapKey)?.terrainVersion,
          testMapKey: TEST_MAP_KEY,
        })
      : undefined;
  // 전투 실험실: 전투장 지형은 월드 시험 2차맵(지형 서비스가 있으면 시험 자리 종류도)
  const battleLab = tuningShared
    ? createBattleLabShared({
        tuning: tuningShared,
        roster: options.roster ?? testRosterCatalog(),
        unitKindNames: options.battleLab?.unitKindNames ?? new Map(),
        effectNames: options.battleReplay?.effectNames,
        terrains: worldArenaTerrains({
          testMapKey: TEST_MAP_KEY,
          terrain,
          locatePreset:
            secondMapLab && worldPlanet
              ? async (preset) => {
                  const answer = await secondMapLab.locate(worldPlanet.id, { kind: "preset", preset });
                  return answer.kind === "server" ? answer.mapKey : null;
                }
              : undefined,
        }),
        runner: jobRunner,
        gate: heavyGate,
        // 밸런스 분석 묶음 일: 같은 워커 진입 파일(일 종류 batch), 따로 센 바쁨
        batches:
          balanceRunner?.kind === "worker"
            ? workerBatchRunner({ workerUrl: balanceRunner.workerUrl })
            : inlineBatchRunner(),
        analysisLimits: options.battleLab?.analysisLimits,
        now,
        log: app.log,
        limits: options.battleLab?.limits,
      })
    : undefined;
  // 전투 다시보기(시범 6 대 6 기록): 설정 칸 접근자 위에서 돈다. 경기장 = 월드 시험 2차맵 구역(없으면 빈 평지). 기록은 워커
  const replayRunner = options.battleReplay?.runner;
  const battleReplay = tuningShared
    ? createBattleReplayServices({
        tuning: tuningShared,
        roster: options.roster ?? testRosterCatalog(),
        arena: createArenaSource(() => {
          const map = world?.map(TEST_MAP_KEY);
          return map
            ? {
                mapKey: map.mapKey,
                terrainVersion: map.terrainVersion,
                costs: () => map.replicaInit().terrainCost,
                terrainFile: () => map.terrainFile().raw,
              }
            : undefined;
        }),
        runner:
          replayRunner?.kind === "worker"
            ? workerReplayRunner<ReplayJob, ReplayJobResult>({
                workerUrl: replayRunner.workerUrl,
                timeoutMs: REPLAY_TIMEOUT_MS,
                heapMb: REPLAY_WORKER_HEAP_MB,
              })
            : inlineReplayRunner(runReplayJob),
        effectNames: options.battleReplay?.effectNames,
        now,
        log: app.log,
        limits: options.battleReplay?.limits,
      })
    : undefined;

  // 운영 스위치(조회 감사 기록 켜기·끄기, 기본 꺼짐 — docs/adr/2026-11-08-operator-roles-log-switch.md). 못 읽으면 꺼짐
  const opsSwitches = options.db
    ? await loadOpsSwitches(options.db.$client).catch((error: unknown) => {
        app.log.warn({ err: error }, "ops switches load failed");
        return NO_OPS_SWITCHES;
      })
    : NO_OPS_SWITCHES;
  const viewAudit = (): boolean => opsSwitches.isOn("view_audit");
  // 요청의 출처 확인 기준 = 계정 경로와 같은 앱 출처(인증이 꺼지면 세션이 없어 보지 않는다)
  const editor = options.planetEditor;
  registerNationEmblemRoute(app, options.db?.$client);
  await registerTrpc(app, {
    router: appRouter,
    createContext: createContextFactory({
      contentVersion: options.contentVersion,
      now,
      auth,
      appOrigin: options.auth?.settings.baseUrl,
      planetEditor: editor
        ? createPlanetEditorShared(editor.definitions, { now, limits: editor.limits, viewAudit })
        : undefined,
      // 복귀 요약: 오프라인 정산의 생산 + 확인 시각(DB가 있는 월드만)
      summary: world && options.db ? createWorldSummaryBackend(world) : undefined,
      // 처리할 일: 정원사 웨이브 예고(wave_incoming, DB가 있을 때)
      inboxPool: options.db?.$client,
      // 처리할 일: 정찰 끝(scout_returned, 기획 답 612 나 — 이동 서비스 메모리)
      inboxTravel: () => (world?.status().state === "ready" ? world.persistence?.travel : undefined),
      // 유닛·사이보그 화면: 실제 유닛은 DB가 있는 월드만(복귀 요약과 같은 읽는 차례)
      roster: {
        catalog: options.roster,
        world: world && options.db ? createWorldRosterSource(world) : undefined,
        cyborgs: cyborgService,
        // 입은 물건·걸린 효과(보유 물건): 사이보그 화면·유닛 상세 스탯에 든다
        gear: () => (world?.status().state === "ready" ? world.persistence?.holdings.gearOf : undefined),
        // 사이보그 화면 랭킹 칸(경로마다 내 자리, docs/adr/2026-11-07-ranking.md)
        rankings: rankingPool ? (userId: string) => ranking.cyborgRankings(userId) : undefined,
        // 유닛·사이보그 화면 컨디션 한 줄(D-534, 건물 서비스가 주거·음식으로 센다)
        condition: () => {
          const facilities = world?.status().state === "ready" ? world.persistence?.facilities : undefined;
          return facilities
            ? {
                read: (unitId: number) => facilities.condition(unitId),
                cap: facilities.rules().condition.cap,
              }
            : undefined;
        },
        // 사이보그 판 원자재별 채집 예상(2026-11-12): 실효 팩 채집 시설·티어 구간·중분류 이름
        gatherSheet: contentEditState
          ? () => {
              const effective = contentEditState.effective();
              return {
                facilities: effective.facilities,
                gatherTiers: effective.gatherTiers,
                itemSubcategories: effective.itemSubcategories,
              };
            }
          : undefined,
        // 유닛 추천 표(1차 생산 스탯 짝·전투 클래스, docs/adr/2026-11-11-production-six.md): 실효 팩과 설정 칸 실효 문턱
        guide: contentEditState
          ? () => {
              const effective = contentEditState.effective();
              return {
                facilities: effective.facilities,
                combatClasses: effective.combatClasses,
                rule: tuningState?.society().combatClass,
              };
            }
          : undefined,
      },
      cyborgs: () => {
        const service = cyborgService();
        // 올린 국가 마크(나라 고르기 카드, 2026-11-11): DB가 있을 때만 읽는다
        const pool = options.db?.$client;
        return service
          ? cyborgReadsOf(service, pool ? { emblemUploads: () => loadEmblemHashes(pool) } : {})
          : undefined;
      },
      recruits: recruitService,
      fusion: fusionService,
      temple: templeService,
      hospital: hospitalService,
      ruins: ruinService,
      holdings: world
        ? createHoldingsReads({
            access: holdingsAccess,
            content: () => options.contentEdit?.state.effective(),
          })
        : undefined,
      // 생명 수치(D-512): 세계가 준비된 뒤(DB가 있는 월드만)
      vitals: world
        ? createVitalsReads(() => (world.status().state === "ready" ? world.persistence?.vitals : undefined))
        : undefined,
      // 랭킹 조회(집계 표, DB가 있을 때). 사이보그 화면 랭킹 칸도 같은 서비스(roster.rankings)
      ranking,
      // 개발자 2차맵 시험: 월드 행성의 2차맵 지형 주소·칸 값(보기 전용, src/world/secondMapLab.ts)
      secondMapLab,
      // 영토 조회(내 세력·개발 화면 전체)
      territory: territoryService,
      worldLayout,
      // 범위 줄의 행성 목록(이름·면 레벨은 팩 행성 원본에서)
      planetScope: () => options.planets?.sources ?? [],
      worldMap: worldMapService,
      gather: gatherReads ? () => (worldGather?.current() ? gatherReads : undefined) : undefined,
      // 경제 화면: 팩 목록 + 월드 원장 잔고(읽기만) + 시안 자료
      economy: options.economyCatalog
        ? createEconomyServices({
            catalog: options.economyCatalog,
            world: world
              ? worldEconomySource(
                  world,
                  () => marketSource()?.views,
                  // 경제 화면 도시 이름 = 1차맵 도시 안개와 같은 아는 도시(기획 답 621 나)
                  async (viewer) => worldMapService?.()?.knownCityIds(viewer),
                )
              : undefined,
          })
        : undefined,
      factionSource: world && options.db ? createWorldFactionSource(world, worldMapService) : undefined,
      labor: laborService,
      facilities: world ? () => facilityScreenSourceOf(world) : undefined,
      factionRules: tuningState ? () => factionRulesFrom(tuningState.society()) : undefined,
      houseRules,
      // 가문 도시 조회: 아래에서 가문 게이트웨이와 함께 만든다(부를 때 읽는다)
      houseCity: () => houses?.city,
      // 설정 칸 패널: 인증이 켜져 있을 때만 맥락이 서비스를 만든다
      tuning: tuningShared,
      balance,
      contentEdit,
      nationEdit: { testNations: options.world?.npc?.testNations ?? null },
      itemEdit,
      battleLab,
      battleReplay,
      formulas,
      // 운영자 콘솔(docs/adr/2026-11-08-operator-console.md): DB가 있을 때만
      ops: options.db
        ? {
            pool: options.db.$client,
            world: () => (world?.status().state === "ready" ? world : undefined),
            worldStatus: () => world?.status(),
            wsConnections: () => wsConnections,
            // 운영 화면 이름표는 한국어 나라 이름(팩 국가 프리셋)을 쓴다[임시]
            nationName: (code) => worldMapService?.()?.nationNames?.(code).name?.ko,
            switches: opsSwitches,
            presets: options.world?.npc?.presets,
            now,
          }
        : undefined,
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
          // 조회 감사 기록은 운영 스위치가 켜졌을 때만(기본 꺼짐)
          if (!auditDb || !viewAudit()) return;
          void writeAudit(auditDb, {
            actor: { kind: "admin", id: viewer.id, ip: null },
            action: "second_map.observe",
            targetId: viewer.id,
            after: { mapKey },
          }).catch((error: unknown) => app.log.warn({ err: error }, "observe audit failed"));
        },
        // 운영자가 남의 유닛을 옮기거나 세우면 감사 기록(docs/adr/2026-11-07-unit-control.md)
        onOperatorCommand: (viewer, command) => {
          app.log.info({ userId: viewer.id, ...command }, "second map operator command");
          if (!auditDb) return;
          void writeAudit(auditDb, {
            actor: { kind: "admin", id: viewer.id, ip: null },
            action: "second_map.operator_command",
            targetId: String(command.unitId),
            after: command,
          }).catch((error: unknown) => app.log.warn({ err: error }, "operator command audit failed"));
        },
      })
    : undefined;
  const cyborgGateway = world
    ? createCyborgGateway({ service: cyborgService, now, log: app.log })
    : undefined;
  const territoryGateway = world
    ? createTerritoryGateway({ service: territoryService, now, log: app.log })
    : undefined;
  const recruitGateway = world
    ? createRecruitGateway({ service: recruitService, now, log: app.log })
    : undefined;
  const itemGateway = world ? createItemGateway({ access: holdingsAccess, now, log: app.log }) : undefined;
  // 유닛 명령 게이트웨이는 운영자 빠르기 표시를 그 유닛이 선 2차맵에 단다(world/operatorPace.ts)
  const paceMaps = () => world?.maps.values() ?? [];
  const laborGateway = world
    ? createLaborGateway({ service: laborService, maps: paceMaps, now, log: app.log })
    : undefined;
  const fusionGateway = world
    ? createFusionGateway({ service: fusionService, now, log: app.log })
    : undefined;
  const facilityGateway = world
    ? createFacilityGateway({
        service: facilityService,
        // 건물·영토 비콘 공격(질문 381): 같은 조건
        attack: () => (world.status().state === "ready" ? world.persistence?.facilities.attack : undefined),
        now,
        log: app.log,
      })
    : undefined;
  const templeGateway = world
    ? createTempleGateway({ service: templeService, now, log: app.log })
    : undefined;
  const ruinGateway = world ? createRuinGateway({ service: ruinService, now, log: app.log }) : undefined;
  const hospitalGateway = world
    ? createHospitalGateway({ service: hospitalService, now, log: app.log })
    : undefined;
  // 가문 창설·가입(docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"·"바뀜 (981~986 답)"): DB가 있을 때만
  const houses = options.db
    ? attachHouses({ db: options.db, world, rules: houseRules, now, log: app.log })
    : undefined;
  const houseGateway = houses?.gateway;
  // 국적 바꾸기(docs/adr/2026-11-08-citizenship.md): 세계가 준비되고 NPC 사회 런타임이 돌 때만(서비스가 busy로 답한다). 귀화 뒤 가문 나라를 맞춘다(983 가)
  const citizenshipGateway = world
    ? createCitizenshipGateway({
        service: citizenshipServiceOf(world, { now }),
        afterChange: houses?.afterNaturalize,
        now,
        log: app.log,
      })
    : undefined;
  const marketGateway = world
    ? createMarketGateway({ service: () => marketSource()?.service, now, log: app.log })
    : undefined;
  // 2차맵 사이 이동(docs/adr/2026-11-07-play-flow.md WP9): 세계가 준비된 뒤(DB가 있는 월드만)
  const travelGateway = world
    ? createTravelGateway({
        service: () => (world.status().state === "ready" ? world.persistence?.travel : undefined),
        maps: paceMaps,
        now,
        log: app.log,
      })
    : undefined;

  const gatherGateway = worldGather
    ? createGatherGateway({
        service: () => (world?.status().state === "ready" ? worldGather.current()?.service : undefined),
        maps: paceMaps,
        now,
        log: app.log,
      })
    : undefined;

  const boatGateway = worldBoats
    ? createBoatGateway({
        service: () => (world?.status().state === "ready" ? worldBoats.current() : undefined),
        maps: paceMaps,
        now,
        log: app.log,
      })
    : undefined;

  if (planets && options.planets) {
    // 자원 분포 지도(공개 행성, ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"): 행성 값을 메모리에 들 때만(2차맵을 띄우는 세계)
    const resources =
      worldPlanet && tuningState && options.secondMaps
        ? createResourceMaps({
            planetId: worldPlanet.id,
            ready: () => planets.manifest(worldPlanet.id)?.status === "ready",
            values: () => planets.planetValues(worldPlanet.id),
            rules: () => tuningState.society().worldSeed,
            definitionHash: worldPlanet.definitionHash,
          })
        : undefined;
    registerPlanetRoutes(app, {
      planets,
      viewer: httpViewer,
      now,
      limits: options.planets.limits,
      resources,
    });
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
        cyborg: cyborgGateway,
        territory: territoryGateway,
        recruit: recruitGateway,
        items: itemGateway,
        labor: laborGateway,
        fusion: fusionGateway,
        facilities: facilityGateway,
        temple: templeGateway,
        ruins: ruinGateway,
        market: marketGateway,
        travel: travelGateway,
        gather: gatherGateway,
        boats: boatGateway,
        hospital: hospitalGateway,
        citizenship: citizenshipGateway,
        house: houseGateway,
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
    // 지표 한 줄에 붙일 값: S1 2차맵(src/world/worldStats.ts), 행성(src/planet/service.ts), 세계 설정 판·덮어쓴 칸 수
    // (N1 지표를 설정 판으로 기간을 나눠 본다, docs/adr/2026-11-01-dev-settings-panel.md 9절), 팩 항목 덮어쓰기 판·덮어쓴 항목 수
    // (아이템·스킬 편집기, 관문 지표를 바꾼 시각으로 나눠 본다, docs/adr/2026-11-01-item-editor.md 4절)
    const contentState = options.contentEdit?.state;
    const extras = (): Record<string, number> => ({
      ...world?.takeMetrics(),
      ...terrain?.takeMetrics(),
      ...planets?.takeMetrics(),
      ...(tuningState
        ? { tuningRevision: tuningState.revision(), tuningOverrides: tuningState.appliedCount() }
        : {}),
      ...(contentState
        ? { contentRevision: contentState.revision(), contentOverrides: contentState.appliedCount() }
        : {}),
    });
    const stopMetrics = startServerMetrics(
      app.log,
      () => wsConnections,
      metricsIntervalMs,
      world || planets || tuningState || contentState ? extras : undefined,
      // 행성마다 한 줄("metric":"planet", docs/adr/2026-11-11-planet-scope.md): 2차맵·유닛·움직이는 수·보는 연결 수
      world
        ? () =>
            planetGaugesOf(world.status().state === "ready" ? world : undefined).map((row) => ({
              metric: "planet" as const,
              ...row,
            }))
        : undefined,
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
