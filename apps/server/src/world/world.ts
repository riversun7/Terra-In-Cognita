// 월드 — 시험 2차맵(들) + 경로 서비스 + 시험 봇, DB가 있으면 저장·부팅 복구까지
// ADR 2026-10-28-s1-second-map.md(S1), 2026-10-31-s3-server-stage.md 1·2절(S3 저장·복구)
// - DB가 없으면 S1처럼 메모리에만 둔다(시험·DB 없는 서버).
// - DB가 있으면 부팅 때 DB에서 건물·유닛을 다시 놓고 예약을 다시 건 뒤 준비 완료(ready)다. 그 뒤 바뀜은 월드 쓰기
//   대기열이 0.25초마다 묶어 커밋하고, 10초마다 생존 시각을 쓴다. 끌 때 대기열을 비운다.
import { randomInt, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { EARTH_FACE_LEVEL } from "@terra/planet";
import type { CombatCatalog, CombatCoefficients } from "@terra/sim";
import type { WorldDirectory } from "./gateway.ts";
import { type Ledger, createLedger } from "../economy/ledger.ts";
import { type MemoryChecks, checkMemoryInvariants, checkSqlInvariants } from "./invariants.ts";
import { type OwnerRow, type QueryPool, ensureTestNpcOwner, loadWorld } from "./persist/load.ts";
import { type WorldWriter, type WriterPool, createWorldWriter } from "./persist/writer.ts";
import { createWorkerPathService } from "./pathPool.ts";
import { type PathService, createInlinePathService } from "./pathService.ts";
import type { MapLog, MapPersist, SecondMap } from "./secondMap.ts";
import { createBattleApply } from "./battleApply.ts";
import { createBattleWorld, createWorldBattleStart } from "./battleStart.ts";
import { type BattleItems, createBattleItems } from "./battleItems.ts";
import { type CityRow, cityCellsOf, loadCities } from "./cities.ts";
import { attachHouseTies, houseTiesOf } from "./houseTies.ts";
import { moveLeaderToCapital, seedNpcAtBoot } from "../npc/leaders.ts";
import { villageSeeder } from "../facilities/npcSeed.ts";
import { applyCityRelayoutAtBoot } from "../facilities/cityRelayout.ts";
import {
  type CyborgRules,
  type CyborgService,
  createCyborgService,
  defaultCyborgRules,
} from "../cyborg/service.ts";
import { nationProfilesOf } from "../cyborg/nationProfile.ts";
import { type LoadedCyborgs, loadCyborgs } from "../cyborg/state.ts";
import { type HoldingsConfig, type WorldHoldings, createWorldHoldings } from "../holdings/world.ts";
import { type LoadedHoldings, loadHoldings } from "../holdings/state.ts";
import { type VitalsRecord, loadVitals } from "../vitals/state.ts";
import { type VitalsConfig, type WorldVitals, createWorldVitals } from "../vitals/world.ts";
import { type LaborService, createLaborService } from "../labor/service.ts";
import { EMPTY_LABOR, type LoadedLabor, loadLabor } from "../labor/store.ts";
import { UNIT_KIND_CYBORG_UNIT } from "./unitKinds.ts";
import { conditionColumns, createWorkInjury } from "./unitCondition.ts";
import { type BattleService, createBattleService } from "./battles.ts";
import { type BattleBodies, createBattleBodies } from "./battleBodies.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import { NO_GEAR, type UnitGear } from "../roster/unitBody.ts";
import { retireTestMaps } from "./pins.ts";
import { auditRetiredWorkers, retireOldWorkers, splitOldWorkers } from "./retireOldWorkers.ts";
import type { TerrainService } from "./terrainService.ts";
import { createMapFactory, exploredStoreOf } from "./mapFactory.ts";
import { type MapSpawner, attachMapSpawn, bootExtraMaps, sameLevelAs } from "./mapSpawnWorld.ts";
import {
  ASSET_CREDIT,
  NPC_START_CREDIT,
  SYSTEM_ISSUE_CREDIT,
  type Settlement,
  createSettlement,
} from "./settlement.ts";
import { emptyWorldStats, resetWorldStats, summarizeWorldStats } from "./worldStats.ts";
import {
  type NationPreset,
  nationName,
  nationSeedOf,
  presetOfCode,
  seedPartsOf,
  startCreditOf,
} from "../npc/nations.ts";
import { relocateUnits } from "./relayout.ts";
import {
  RETIRED_TEST_MAPS,
  TEST_MAP_KEY,
  TEST_MAP_ORIGIN,
  TEST_PLANET_ID,
  retiredTestMapKey,
  testMapKey,
} from "./testMaps.ts";
import { finishTierApply } from "./tierApply.ts";
import { bootWorldSeed, mergeSeedBoot } from "./worldBoot.ts";
import { type NpcRuntime, startNpcRuntime } from "../npc/runtime.ts";
import { waveRewardItemsOf } from "../npc/waveRewards.ts";
import type { TerritoryBeaconFacilityView } from "@terra/shared/territoryApi";
import {
  type BeaconRow,
  type TerritoryService,
  createTerritoryService,
  loadBeacons,
} from "../territory/service.ts";
import { loadRecruitDraws } from "../npc/state.ts";
import {
  type FacilitiesConfig,
  type WorldFacilities,
  beaconConstructionOf,
  createWorldFacilities,
} from "../facilities/world.ts";
import { EMPTY_FACILITIES, type LoadedFacilities, loadFacilities } from "../facilities/state.ts";
import { type RecruitService, createRecruitService } from "../recruit/service.ts";
import { geneCatalogFrom } from "../fusion/genes.ts";
import { type FusionService, createFusionService } from "../fusion/service.ts";
import { npcRuinsInputOf } from "../ruins/runtimeInput.ts";
import { citySiegeLayoutOf } from "../facilities/siegeLayout.ts";
import { type RuinService, createRuins } from "../ruins/service.ts";
import type { ServerEconomyCatalog } from "../market/catalog.ts";
import { npcEconomyInputOf } from "../market/worldInput.ts";
import { type TravelService, createWorldTravel } from "../travel/service.ts";

// 시험 2차맵 자리·시험 행성은 testMaps.ts(다른 모듈·시험이 world.ts에서 가져오던 이름을 그대로 다시 내보낸다)
export { RETIRED_TEST_MAPS, TEST_MAP_KEY, TEST_MAP_ORIGIN, TEST_PLANET_ID, retiredTestMapKey, testMapKey };
/** 생존 시각을 쓰는 간격(ms). kill -9 뒤 접속 상태를 고칠 때의 오차 상한이다 */
export const HEARTBEAT_MS = 10_000;
/** 부팅 때 DB를 기다리는 횟수·간격(배포 때 DB가 늦게 켜질 수 있다) */
const BOOT_ATTEMPTS = 30;
const BOOT_RETRY_MS = 2_000;
/** 경로 서비스 고르기: 운영은 워커, 시험은 같은 스레드 */
export type WorldPathsConfig = { kind: "workers"; workerUrl: URL; workers: number } | { kind: "inline" };

export interface WorldConfig {
  /** 시험용 봇 수(S1_TEST_BOTS, 시험 2차맵들에 나눈다). 0이면 봇 없이 2차맵만 */
  testBots: number;
  /** 시험 2차맵 수(S1_TEST_MAPS, 기본 1). 규모 시험용 */
  testMaps?: number | undefined;
  /** 옛 세계의 시작 도시를 새 배치 자리로 옮긴다(WORLD_RELAYOUT, docs/adr/2026-11-07-world-layout.md). 없으면 계획만 기록 */
  relayout?: boolean | undefined;
  paths: WorldPathsConfig;
  /** 쓰기가 오래 실패할 때(기본: 프로세스 종료 → 컨테이너가 다시 켜서 복구). 시험이 바꾼다 */
  onFatal?: ((error: unknown) => void) | undefined;
  /** 쓰기 묶음 간격(ms, 기본 250). 시험용 */
  writeIntervalMs?: number | undefined;
  /**
   * 2차맵 지형 서비스(행성 값에서 만든 2차맵, terrainService.ts). 없으면 S1 임시 지형(시험·행성 서비스 없는 서버).
   * 있으면 부팅이 행성 값을 기다린다(행성 서비스가 캐시를 읽거나 굽는 동안)
   */
  terrain?: TerrainService | undefined;
  /** 사이보그 만들기 규칙(팩 tuning을 얹은 세력·사회 계수표 N9·N6). 없으면 sim 시험 계수표 */
  cyborgRules?: (() => CyborgRules) | undefined;
  /**
   * 전투 자료(팩 + 덮어쓰기 실효 값)·전투 계수(설정 칸 실효 값), 둘 다 부를 때마다 읽는다. 정원사 웨이브 전투가 쓴다.
   * 없으면 sim 시험 자료
   */
  combatCatalog?: (() => CombatCatalog) | undefined;
  combatRules?: (() => CombatCoefficients) | undefined;
  /**
   * 영토 층(docs/adr/2026-11-03-territory-layer.md): 비콘 시설(팩 territory_beacon 실효 값, 켬끔·재료), 영토를 셈하는 행성의 면 레벨.
   * 없으면 비콘 켬·재료 없음, 시험 행성(면 레벨 9)만. 계수는 cyborgRules(세력·사회 계수표)의 territory 칸
   */
  territory?:
    | {
        beaconFacility?: (() => TerritoryBeaconFacilityView) | undefined;
        faceLevels?: ReadonlyMap<string, number> | undefined;
      }
    | undefined;
  /**
   * NPC 사회 런타임(docs/adr/2026-11-01-npc-brain-r5.md 7절, NPC_SOCIETY). 없으면 끔. DB가 있을 때만 돈다.
   * testNations = 시험 국가 수(NPC_TEST_NATIONS), dayMs = 하루 길이(측정용, NPC_DAY_MS), manual = 타이머 없이(시험)
   */
  npc?:
    | {
        testNations: number;
        dayMs?: number | undefined;
        manual?: boolean | undefined;
        /** 정원사 웨이브 켬(GARDENER_WAVES). 없으면 켬(시험), 운영 설정은 기본 끔 */
        gardenerWaves?: boolean | undefined;
        /** 팩 국가 프리셋(시험 국가 2번부터의 코드·이름) */
        presets?: readonly NationPreset[] | undefined;
        /**
         * 실효 국가 프리셋(팩 + 이 세계의 덮어쓰기, 시작 국가 설정 편집기)을 실은 뒤 풀리는 약속. 있으면 세계 씨앗(국가·시작 도시)을 차리기
         * 전에 기다린다(docs/adr/2026-11-10-nation-editor.md 5절). 없으면 기다리지 않는다(시험)
         */
        presetsReady?: Promise<void> | undefined;
      }
    | undefined;
  /** 보유 물건(실효 콘텐츠·설정 칸 실효 값·사이보그 1차 스탯). 없으면 빈 콘텐츠(시험) */
  holdings?: HoldingsConfig | undefined;
  /** 생명 수치 몸 자료(D-512, 사이보그·유닛 화면과 같은 셈). 없으면 저장한 줄만 보인다(시험) */
  vitals?: VitalsConfig | undefined;
  /**
   * 유닛 화면 자료(실효 장비·스킬·가중치 표·전투 계수표): 세계 전투 시작 사양이 사이보그 화면·유닛 상세와 같은 몸(입은 장비·버프)으로
   * 싸우게 한다(battleBodies.ts). 없으면 시작 자료 그대로(시험)
   */
  roster?: (() => RosterCatalog) | undefined;
  /** 건물 짓기·노화·수리(실효 시설·아이템, docs/adr/2026-11-07-buildings-runtime.md). 없으면 빈 목록(시험) */
  facilities?: FacilitiesConfig | undefined;
  /** NPC 도시 경제·거래소의 경제 목록(docs/adr/2026-11-07-play-flow.md WP4, market/catalog.ts). 없으면 경제 없음(시험) */
  economy?: (() => ServerEconomyCatalog) | undefined;
}
export interface WorldLog extends MapLog {
  info(obj: object, message: string): void;
}

/** 저장이 켜진 월드의 자료(정산·원장 모듈이 쓴다) */
export interface WorldPersistence {
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  /** 새 ID(쓰는 프로세스가 하나라 메모리로 센다) */
  readonly nextId: {
    owner: () => number;
    unit: () => number;
    building: () => number;
    account: () => number;
    tx: () => number;
  };
  /** 소유 주체(메모리 캐시, 원본은 world_owners) */
  readonly owners: Map<number, OwnerRow>;
  /** 원장(메모리 캐시 + 쓰기 대기열) */
  readonly ledger: Ledger;
  /** 정산·접속 상태 */
  readonly settlement: Settlement;
  /** 시험 NPC 세력의 소유 주체 */
  readonly npcOwnerId: number;
  /** 전투 인스턴스(R3 최소: 빨리감기 + 끝 시각에 결과 적용. 유닛 부상·귀환은 R4) */
  readonly battles: BattleService;
  /** 사이보그(계정당 하나, docs/adr/2026-11-01-first-login-cyborg.md) */
  readonly cyborgs: CyborgService;
  /** 영토 비콘·영토 배치(docs/adr/2026-11-03-territory-layer.md) */
  readonly territory: TerritoryService;
  /** 유저 구인(정부기관 구인 카드, D-469). NPC 사회 런타임이 없으면 조회는 undefined, 고용은 busy */
  readonly recruits: RecruitService;
  /** 보유 물건(아이템 인스턴스, docs/adr/2026-11-03-item-holdings.md) */
  readonly holdings: WorldHoldings;
  /** 유닛 생명 수치(D-512: HP·아머·쉴드가 전투 뒤에도 남고 전투 밖에서도 분 단위로 회복) */
  readonly vitals: WorldVitals;
  /** 세계 전투 시작 사양의 몸(입은 장비·버프 — 사이보그 화면과 같은 셈). NPC 런타임 startBattle이 거친다 */
  readonly bodies: BattleBodies;
  /** 전투에 가지고 들어가는 물약·탄(287). NPC 런타임 startBattle이 생명 수치 다음에 거친다 */
  readonly items: BattleItems;
  /** 노동 계약(임금형·임대형, docs/adr/2026-11-03-labor-contracts.md) */
  readonly labor: LaborService;
  /** 사이보그 유닛 융합·유전자 환생·사망 조각(docs/adr/2026-11-07-cyborg-fusion-genes.md) */
  readonly fusion: FusionService;
  /** 건물 짓기·레벨업·노화·수리·장비 수리(docs/adr/2026-11-07-buildings-runtime.md) */
  readonly facilities: WorldFacilities;
  /** 폐허·복원 사업(docs/adr/2026-11-07-ruins-restoration.md): 행정 건물 짓기 고리·모금. NPC 사회 런타임이 없으면 busy */
  readonly ruins: RuinService;
  /** 2차맵 사이 이동(docs/adr/2026-11-07-play-flow.md WP9): 1차맵 명령 [확정] → 이웃 2차맵을 하나씩 지나 걷는다 */
  readonly travel: TravelService;
  /** 옆 2차맵을 그때 띄우기·비면 내리기(WP15, 기획 답 730 다) */
  readonly spawn: MapSpawner;
}
export interface WorldStatus {
  state: "recovering" | "ready" | "failed";
  /** 부팅 뒤 불변 조건 위반 수(0이어야 한다) */
  issues: number;
  /** 부팅에 걸린 시간(ms) */
  bootMs: number | undefined;
}
export interface World extends WorldDirectory {
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 2차맵 지형 서비스(있으면). 지형 경로가 띄우지 않은 이웃 2차맵의 지형을 줄 때 쓴다 */
  readonly terrain: TerrainService | undefined;
  /** 부팅 복구가 끝나면 풀린다(실패하면 거부) */
  readonly ready: Promise<void>;
  status(): WorldStatus;
  /** DB가 있을 때만 */
  readonly persistence: WorldPersistence | undefined;
  /** NPC 사회 런타임(켜져 있고 DB가 있을 때만) */
  readonly npc: NpcRuntime | undefined;
  /** 불변 조건 검사(메모리 + DB). 위반 목록 */
  checkInvariants(): Promise<string[]>;
  /** 지난 호출 뒤 구간의 지표(지표 한 줄에 붙인다). 부르면 구간을 비운다 */
  takeMetrics(): Record<string, number>;
  stop(): Promise<void>;
  /**
   * 시험용 kill -9 흉내: 대기열의 쌓인 바뀜을 버리고(진행 중인 커밋은 inFlight대로) 타이머·워커를 멈춘다.
   * 마지막 생존 시각도 쓰지 않는다. 같은 DB로 새 월드를 띄워 복구를 본다.
   */
  crashForTest(inFlight: "commit" | "rollback"): Promise<void>;
}

/** DB 연결 풀(pg Pool)에서 월드가 쓰는 것 */
export type WorldPool = QueryPool & WriterPool;

function counter(start: number): () => number {
  let last = start;
  return () => {
    last += 1;
    return last;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** 보유 물건을 잇기 전의 빈 몸(생명 수치가 먼저 만들어진다) */
const noGear = (): UnitGear => NO_GEAR;

export function startWorld(
  config: WorldConfig & { now: () => number; log: WorldLog; pool?: WorldPool | undefined },
): World {
  const { now, log, pool } = config;
  const stats = emptyWorldStats();
  const maps = new Map<number, SecondMap>();
  const sources = () => [...maps.values()].map((map) => map.replicaInit());
  const paths: PathService =
    config.paths.kind === "workers"
      ? createWorkerPathService({
          workerUrl: config.paths.workerUrl,
          workers: config.paths.workers,
          sources,
          log,
        })
      : createInlinePathService(sources, () => performance.now());
  const mapCount = Math.max(1, config.testMaps ?? 1);
  const status: WorldStatus = { state: "recovering", issues: 0, bootMs: undefined };
  let persistence: WorldPersistence | undefined;
  let npc: NpcRuntime | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const bootId = randomUUID();

  const terrainService = config.terrain;
  /** 시험 2차맵 줄(봇 자리·옛 시작 도시 자리). 띄우는 2차맵은 여기에 도시가 있는 2차맵을 더한다(worldBoot.ts) */
  const testKeys = Array.from({ length: mapCount }, (_, index) => testMapKey(index));

  // 2차맵 만들기(고정본 → 지형 서비스 → 임시 지형) — 부팅과 그때 띄우기(mapSpawn.ts)가 같이 쓴다
  const factory = createMapFactory({
    maps,
    paths,
    terrain: terrainService,
    now,
    stats,
    log,
    planetId: TEST_PLANET_ID,
  });

  /**
   * 봇을 시험 2차맵 줄에만 고르게 나눈다(규모 시험, 앞부터 하나씩 더). 도시 인구는 세계 규칙이다(play-flow ADR "WP-NPC2", 749 다).
   * 시험 줄은 부팅 씨앗 2차맵이라 그때 띄운 2차맵(WP15)에는 봇이 서지 않는다
   */
  const spawnBots = (): void => {
    const row = testKeys.flatMap((mapKey) => maps.get(mapKey) ?? []);
    for (const [index, map] of row.entries())
      map.spawnBots(
        Math.floor(config.testBots / row.length) + (index < config.testBots % row.length ? 1 : 0),
      );
  };

  const memoryChecks = (extra: Partial<MemoryChecks>): MemoryChecks => {
    let missingEvents = 0;
    let unitsInBuildings = 0;
    for (const map of maps.values()) {
      missingEvents += map.missingEvents();
      unitsInBuildings += map.unitsInBuildings();
    }
    return { missingEvents, unitsInBuildings, badUnits: 0, badBuildings: 0, ...extra };
  };

  const bootWithDb = async (db: WorldPool): Promise<void> => {
    const started = performance.now();
    let loaded: Awaited<ReturnType<typeof loadWorld>> | undefined;
    let npcOwnerId = 0;
    let cities: CityRow[] = [];
    let cyborgData: LoadedCyborgs = { cyborgs: [], rolls: [], factions: [], fixedAppearances: 0 };
    let beaconRows: BeaconRow[] = [];
    let holdingData: LoadedHoldings = { holdings: [], effects: [], cooldowns: [], maxId: 0 };
    let vitalsData: VitalsRecord[] = [];
    let laborData: LoadedLabor = EMPTY_LABOR;
    let facilityData: LoadedFacilities = EMPTY_FACILITIES;
    let seeded: Awaited<ReturnType<typeof bootWorldSeed>> | undefined;
    // 세계 배치는 행성 값을 읽는다(행성 서비스가 캐시를 읽거나 굽는 동안 기다린다. 실패하면 옛 방식 — 2차맵 만들기가 따로 실패를 알린다)
    await terrainService?.ready.catch(() => undefined);
    // 세계 씨앗은 실효 국가 프리셋을 읽는다(덮어쓰기를 실을 때까지 기다린다)
    await config.npc?.presetsReady?.catch(() => undefined);
    for (let attempt = 1; !loaded; attempt++) {
      try {
        // 옛 시험 2차맵(깊은 바다 위)의 행을 지운다(지울 것이 없으면 그대로). U4 (가)
        const retired = await retireTestMaps(
          db,
          TEST_PLANET_ID,
          Array.from({ length: RETIRED_TEST_MAPS }, (_, index) => retiredTestMapKey(index)),
        );
        if (retired.units + retired.buildings + retired.exploration > 0) {
          log.info(retired, "world boot: retired the old test maps");
        }
        npcOwnerId = await ensureTestNpcOwner(db, now());
        // 세계 씨앗(WP1·docs/adr/2026-11-07-world-layout.md): 고정 국가·시작 도시(행성 위 국가마다 자기 자리, 모자란 것만)·띄울 2차맵
        // 다시 시도해도 앞 시도가 옮긴 계획은 남긴다(옮긴 도시의 유닛을 복구 직전에 새 자리로)
        const seedAt = { planetId: TEST_PLANET_ID, testMapKeys: testKeys, nowMs: now(), log };
        const rules = (config.cyborgRules ?? defaultCyborgRules)();
        const opts = { npc: config.npc, terrain: terrainService, rules, relayout: config.relayout ?? false };
        const boot = await bootWorldSeed(db, { ...seedAt, ...opts });
        seeded = mergeSeedBoot(seeded, boot);
        cities = await loadCities(db);
        cyborgData = await loadCyborgs(db);
        beaconRows = await loadBeacons(db);
        holdingData = await loadHoldings(db);
        vitalsData = await loadVitals(db);
        laborData = await loadLabor(db, now());
        facilityData = await loadFacilities(db);
        loaded = await loadWorld(db, now());
      } catch (error) {
        if (attempt >= BOOT_ATTEMPTS || stopped) throw error;
        log.warn({ err: error, attempt }, "world boot: database not ready, retrying");
        await sleep(BOOT_RETRY_MS);
      }
    }
    const writer = createWorldWriter({
      pool: db,
      log,
      intervalMs: config.writeIntervalMs,
      onFatal:
        config.onFatal ??
        ((error) => {
          log.error({ err: error }, "world writer failed: exiting to recover from the database");
          process.exit(1);
        }),
    });
    const nextId = {
      owner: counter(loaded.maxIds.owner),
      unit: counter(loaded.maxIds.unit),
      building: counter(loaded.maxIds.building),
      account: counter(loaded.maxIds.account),
      tx: counter(loaded.maxIds.tx),
    };
    const owners = new Map(loaded.owners.map((owner) => [owner.id, owner]));
    const persist: MapPersist = {
      saveUnit: (row) =>
        writer.upsert("units", {
          id: row.id,
          owner_id: row.ownerId,
          kind: row.kind,
          size: row.size,
          speed: row.speed,
          map_key: row.mapKey,
          planet_id: row.planetId,
          domain: row.domain,
          path: row.path,
          depart_at_ms: row.departAtMs,
          wake_at_ms: row.wakeAtMs,
          ai_step: row.aiStep,
          job: row.job.job,
          job_phase: row.job.phase,
          job_progress_ms: row.job.progressMs,
          fatigue: row.job.fatigue,
          ...conditionColumns(row.condition),
        }),
      saveBuilding: (row) =>
        writer.upsert("buildings", {
          id: row.id,
          map_key: row.mapKey,
          planet_id: row.planetId,
          domain: row.domain,
          owner_id: row.ownerId,
          ...row.placement,
        }),
      removeBuilding: (id) => writer.remove("buildings", { id }),
      // NPC 휴먼 사망(docs/adr/2026-11-01-npc-brain-r5.md 7절). 휴먼 행은 런타임이 먼저 지운다(외래 키는 cascade)
      removeUnit: (id) => writer.remove("units", { id }),
    };
    const ledger = createLedger({
      writer,
      nextAccountId: nextId.account,
      nextTxId: nextId.tx,
      accounts: loaded.accounts,
    });
    // 탐사 기록: 구독할 때 읽고, 시야 틱이 바뀐 것을 쓰기 대기열로 쓴다
    const explored = exploredStoreOf(db, writer, TEST_PLANET_ID, now);
    factory.attach({ persist, ids: nextId, botOwnerId: npcOwnerId, explored, db });
    // 씨앗 2차맵 + 플레이어 유닛·건물이 선 2차맵(그때 띄웠던 것, docs/adr/2026-11-07-play-flow.md "WP15")
    const seedKeys = seeded?.mapKeys ?? testKeys;
    const extraKeys = bootExtraMaps(loaded, seedKeys, TEST_PLANET_ID, sameLevelAs(testKeys[0] ?? 0));
    await factory.createMaps([...seedKeys, ...extraKeys]);
    const settlement = createSettlement({
      maps,
      owners,
      ledger,
      writer,
      nextOwnerId: nextId.owner,
      presence: loaded.presence,
      now,
      // 사이보그 유닛은 유지비가 비싸다(D-470, 설정 칸 n46_upkeep 실효 값을 정산할 때마다 읽는다)
      upkeepWeightPm: (kind) =>
        kind === UNIT_KIND_CYBORG_UNIT ? (config.cyborgRules ?? defaultCyborgRules)().fusion.upkeepPm : 1000,
    });
    const battleWorld = createBattleWorld({ maps, cities: () => cities, owners, npcOwnerId, ledger, now });
    // 끝 시각에 한 번: 부상·귀환·포로·탈취·장비 닳기·물약·탄·생명 수치·건물 피해를 세계에 적용한다(battleApply.ts, 결과 기록과 같은 커밋).
    // 전투 물건(287): 보유 물건 서비스를 만든 뒤 채운다(그 전에는 아무것도 붙이지 않는다)
    let items: BattleItems = { battleStart: (init) => init, apply: () => ({ potions: 0, shots: 0 }) };
    const battleApply = createBattleApply({
      world: battleWorld,
      holdings: () => holdings,
      items: () => items,
      vitals: () => vitals,
      buildings: () => facilities.damage,
      log,
    });
    const battles = createBattleService({
      pool: db,
      writer,
      now,
      apply: battleApply.apply,
      onError: (error) => log.error({ err: error }, "battle failed"),
      onComputed: (cost) => log.info(cost, "battle computed"),
    });
    const cyborgs = createCyborgService({
      loaded: cyborgData,
      maps,
      cities,
      settlement,
      ledger,
      // 세력 국고 = 그 세력의 소유 주체(정착 지원금을 낸다, D-455 190)
      treasuryOf: (factionId) => {
        for (const owner of owners.values()) if (owner.factionId === factionId) return owner.id;
        return undefined;
      },
      writer,
      nextUnitId: nextId.unit,
      rules: config.cyborgRules ?? defaultCyborgRules,
      now,
      seed: () => randomInt(0x1_0000_0000),
      ready: () => status.state === "ready",
      log,
      factionName: (code) => nationName(code, config.npc?.presets),
      // 나라 고르기 카드의 자세한 정보(2026-11-11): 실효 프리셋 + NPC 사회 런타임 거울 세계(부를 때마다 지금 npc를 읽는다)
      nationProfiles: (uploads) =>
        nationProfilesOf(
          {
            presets: config.npc?.presets ?? [],
            world: () => npc?.world,
            taxOf: (factionId) => npc?.economy?.economy.taxOf.get(factionId),
          },
          uploads,
        ),
    });
    const societyRules = config.cyborgRules ?? defaultCyborgRules;
    const faceLevels = config.territory?.faceLevels ?? new Map([[TEST_PLANET_ID, EARTH_FACE_LEVEL]]);
    const territory = createTerritoryService(
      {
        pool: db,
        writer,
        now,
        rules: () => societyRules().territory,
        beaconFacility: config.territory?.beaconFacility ?? (() => ({ enabled: true, materials: [] })),
        faceLevelOf: (planetId) => faceLevels.get(planetId),
        factionName: (code) => nationName(code, config.npc?.presets),
        ready: () => status.state === "ready",
        // 건물 규칙(기획 336): 비콘도 재료(가장 가까운 세력 도시 창고, 질문 410 ①)·건설 시간·노화(docs/adr/2026-11-07-buildings-runtime.md)
        construction: beaconConstructionOf({
          ledger,
          settlement,
          rules: societyRules,
          places: () => facilities.service.places,
        }),
      },
      beaconRows,
    );
    const recruits = createRecruitService({
      runtime: () => npc,
      maps,
      settlement,
      ledger,
      writer,
      nextUnitId: nextId.unit,
      cyborgOf: (userId) => cyborgs.record(userId),
      rules: config.cyborgRules ?? defaultCyborgRules,
      now,
      draws: await loadRecruitDraws(db),
    });
    // 생명 수치(D-512): 보유 물건이 전투 밖 회복 물약을 쓸 때 부른다(holdings/world.ts) → 보유 물건보다 먼저 만든다.
    // 몸 자료의 입은 장비·버프는 보유 물건을 부를 때 찾는다(아래에서 잇는다)
    let gearOf: (unitId: number, nowMs: number) => UnitGear = noGear;
    const vitals = createWorldVitals({
      loaded: vitalsData,
      writer,
      maps,
      cyborgs,
      settlement,
      config: config.vitals,
      now,
      gearOf: (unitId, nowMs) => gearOf(unitId, nowMs),
    });
    const holdings = createWorldHoldings({
      loaded: holdingData,
      writer,
      maps,
      cyborgs,
      settlement,
      config: config.holdings,
      now,
      seed: () => randomInt(0x1_0000_0000),
      vitals: {
        hp: (unitId, nowMs) => {
          const read = vitals.service.read(unitId, nowMs);
          return read ? { current: read.values.hp, max: read.max.hp } : undefined;
        },
        heal: (unitId, amount, nowMs) => vitals.service.heal(unitId, amount, nowMs),
        touch: (unitId, nowMs) => vitals.service.touch(unitId, nowMs),
        treat: (unitId, nowMs) => vitals.service.treat(unitId, nowMs),
      },
    });
    gearOf = holdings.gearOf;
    // 세계 전투 시작 사양의 몸: 사이보그 화면·유닛 상세와 같은 셈(입은 장비·인공장기·버프)
    const bodies = createBattleBodies({ maps, cyborgs, gearOf: holdings.gearOf, catalog: config.roster });
    // 전투에 가지고 들어가는 물약·탄(287): 생명 수치 다음에 붙인다
    items = createBattleItems({
      holdings: holdings.service,
      exists: (unitId) => [...maps.values()].some((map) => map.unitInfo(unitId) !== undefined),
    });
    // 세계 전투를 여는 한 길(정원사 웨이브·건물 공격): 몸 → 도시 방어(비활성 빼기·수호신·방어 버프) → 생명 수치 → 물약·탄(battleStart.ts)
    const startWorldBattle = createWorldBattleStart({
      battles,
      bodies,
      vitals: vitals.service,
      items: () => items,
      pool: db,
      writer,
      maps,
      now,
      rules: () => societyRules().temple,
      isInactive: (unitId) => persistence?.fusion.temple.isInactive(unitId) ?? false,
      waveCity: (waveId) => npc?.gardener.run.waves.get(waveId)?.city,
      facilities: () => facilities.service,
      territory: () => territory,
    });
    // 건물: 짓기·노화·수리(노동 계약 정산이 시설이 일하는지 묻는다 — 서로 고리라 계약 서비스는 뒤에 잇는다)
    // 건물이 선 도시(재료·창고 자리, D-516 361): 부팅 때 읽은 도시 + NPC 런타임이 새로 세운 도시
    const cityCells = () => cityCellsOf(cities, npc?.places, TEST_PLANET_ID, maps, npc?.world.ruins);
    const facilities = createWorldFacilities({
      loaded: facilityData,
      maps,
      settlement,
      ledger,
      writer,
      rules: societyRules,
      config: config.facilities,
      holdings,
      territory: () => territory,
      cities: cityCells,
      // 건물 공격(질문 381): 같은 길로 공성 전투를 연다
      battles: {
        owners,
        pool: db,
        combatRules: config.combatRules,
        bodies,
        startBattle: startWorldBattle,
        endsAt: async (battleId) => (await battles.get(battleId))?.endsAtMs,
        seed: () => randomInt(0x1_0000_0000),
      },
      now,
      ready: () => status.state === "ready",
      necessitiesOf: (cityId) => npc?.necessitiesOf(cityId),
      cellValues: (mapKey) => terrainService?.cellValues?.(mapKey),
    });
    // 노동 계약: 소유 주체 정산이 계약을 같은 시각까지 정산하고 산출을 계약 몫으로 나눈다
    const labor = createLaborService({
      loaded: laborData,
      maps,
      cities,
      settlement,
      ledger,
      writer,
      rules: config.cyborgRules ?? defaultCyborgRules,
      now,
      ready: () => status.state === "ready",
      buildingWorks: (buildingId) => facilities.service.works(buildingId),
      unitInJob: (unitId) => facilities.service.unitInJob(unitId),
      unitAway: (unitId) => persistence?.fusion.temple.isAway(unitId) ?? false,
      outputBonusPm: (buildingId) => persistence?.fusion.temple.buildingProductionPm(buildingId) ?? 0,
    });
    facilities.attachLabor(labor);
    settlement.routeOutputs((ownerId, fromMs, toMs) => labor.outputsFor(ownerId, fromMs, toMs));
    // 건물 작업에 묶인 유닛은 그 동안 직무 산출이 없다(D-516 364). 정산 뒤 노동 계약 유예 끝 물건 옮기기(382)
    settlement.pauseOutputs((ownerId) => facilities.service.pausesFor(ownerId));
    settlement.afterSettle((ownerId, toMs) => labor.afterSettle(ownerId, toMs));
    settlement.injureWork(createWorkInjury()); // 작업 중 부상(D-521, docs/adr/2026-11-08-injury.md)
    // 사이보그 유닛 융합·유전자(D-516 인스턴스 = 보유 물건, 유저 휴먼 수명): 재료·유전자 = 실효 팩 아이템, 규칙 = 설정 칸 실효 값
    const fusion = createFusionService({
      maps,
      settlement,
      ledger,
      writer,
      pool: db,
      holdings: holdings.service,
      hasCyborg: (userId) => cyborgs.record(userId) !== undefined,
      cyborgs,
      facilities,
      rules: config.cyborgRules ?? defaultCyborgRules,
      content: () => config.holdings?.content() ?? { items: [] },
      catalog: config.roster ? geneCatalogFrom(config.roster) : undefined,
      nextUnitId: nextId.unit,
      now,
      seed: () => randomInt(0x1_0000_0000),
      ready: () => status.state === "ready",
      log,
      manual: config.npc?.manual,
      devExtraCurrency: (userId) => persistence?.ruins.fundCurrencyOf(userId),
    });
    const travelParts = { maps, writer, pool: db, now, log, settlement, cyborgs, planetId: TEST_PLANET_ID };
    const travel = createWorldTravel({ ...travelParts, ready: () => status.state === "ready" });
    // 옆 2차맵을 그때 띄우기(730 다, mapSpawnWorld.ts): 이동 서비스에 잇고 부팅이 함께 띄운 플레이어 2차맵을 센다
    const spawnParts = { maps, factory, paths, pool: db, planetId: TEST_PLANET_ID, travel, owners, now, log };
    const spawnRules = {
      rules: societyRules,
      cities: () => cities,
      npc: () => npc,
      sample: testKeys[0] ?? 0,
    };
    const spawn = attachMapSpawn({ ...spawnParts, ...spawnRules, extraKeys });
    persistence = {
      spawn,
      travel,
      writer,
      pool: db,
      nextId,
      owners,
      ledger,
      settlement,
      npcOwnerId,
      battles,
      cyborgs,
      territory,
      recruits,
      holdings,
      vitals,
      bodies,
      items,
      labor,
      fusion,
      facilities,
      ruins: createRuins(
        {
          owners,
          ledger,
          settlement,
          writer,
          cyborgs,
          facilities,
          now,
          // 도시 가진 가문의 가문장이 지은 정부 = 가문 도시(docs/adr/2026-11-11-house-village.md)
          houseOf: (userId) => houseTiesOf(persistence)?.ledHouseOf(userId),
        },
        () => npc,
      ),
    };
    // 도시 가진 가문의 시야 묶음(houseTies.ts, D-250): 부팅 때 읽고 1분마다 다시 읽는다(가문 명령 뒤에도 다시 읽는다)
    const ties = attachHouseTies(persistence, db);
    await ties.reload();
    // [임시] 시험 NPC 세력은 처음에 시험 화폐를 받는다(봇 유지비를 낸다). NPC 사회 세계는 그 국가(1번)의 국력 등급 천분율만큼
    const npcSeed = config.npc ? (config.cyborgRules ?? defaultCyborgRules)().worldSeed : undefined;
    const testNpcCredit = startCreditOf(NPC_START_CREDIT, npcSeed, config.npc?.presets);
    if (
      !loaded.accounts.some((account) => account.ownerId === npcOwnerId && account.asset === ASSET_CREDIT)
    ) {
      ledger.post({
        kind: "issue",
        atMs: now(),
        entries: [
          { account: ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -testNpcCredit },
          { account: ledger.ownerAccount(npcOwnerId, ASSET_CREDIT), amount: testNpcCredit },
        ],
      });
    }

    let badUnits = 0;
    let badBuildings = 0;
    let orphanUnits = 0;
    // 없앤 시험 일꾼(종류 1)의 옛 행은 2차맵에 놓지 않고 지운다. 든 물건·화물은 주인에게(retireOldWorkers.ts, 사용자 지적 2026-11-09)
    const old = splitOldWorkers(loaded.units);
    if (old.retired.length > 0) {
      const cyborgUnitOf = (userId: string) => cyborgs.record(userId)?.unitId ?? undefined;
      const parts = {
        owners,
        cities,
        cyborgUnitOf,
        holdings: holdings.service,
        ledger,
        writer,
        nowMs: now(),
      };
      const retired = retireOldWorkers({ rows: old.retired, ...parts });
      await writer.durable();
      await auditRetiredWorkers(db, retired);
      log.info(retired, "world boot: removed the old test workers");
    }
    // 옮긴 옛 자리 도시의 휴먼·사이보그를 새 도시 둘레에 세운다(relayout.ts, 복구 직전)
    const save = (row: Parameters<MapPersist["saveUnit"]>[0]) => persist.saveUnit(row);
    const units = relocateUnits(old.kept, seeded?.relayout, maps, save, now()).rows;
    for (const [mapKey, map] of maps) {
      const onMap = (row: { planetId: string; mapKey: number }) =>
        row.planetId === map.planetId && row.mapKey === mapKey;
      const result = map.restore(units.filter(onMap), loaded.buildings.filter(onMap));
      badUnits += result.badUnits.length;
      badBuildings += result.badBuildings.length;
    }
    // 이 서버가 띄우지 않은 (행성, 2차맵)의 유닛은 DB에 그대로 둔다(지우지 않는다)
    for (const unit of units)
      if (unit.planetId !== TEST_PLANET_ID || !maps.has(unit.mapKey)) orphanUnits += 1;
    // 세계 씨앗: NPC 시작 도시 기본 시설·국가 지도자(봇을 채우기 전, 모자란 것만, 동기 — facilities/npcSeed.ts·npc/leaders.ts)
    const seedWith = { maps, cities, owners, facilities, log, rules: societyRules, terrain: terrainService };
    // 국가마다 씨앗 값(국가 프리셋 성격 칸 — docs/adr/2026-11-10-nation-editor.md 2절): 고정 국가 세력 행 → 코드 → 프리셋
    const fixedCodes = new Map(cyborgData.factions.map((faction) => [faction.id, faction.code]));
    const seedOfFaction = (factionId: number) => {
      const code = fixedCodes.get(factionId);
      return code === undefined || code === null
        ? undefined
        : nationSeedOf(societyRules().worldSeed, ...seedPartsOf(presetOfCode(code, config.npc?.presets)));
    };
    // 이미 선 NPC 도시 건물 다시 놓기 예약(씨앗 전, 예약이 있을 때만 — facilities/cityRelayout.ts)
    if (config.npc)
      await applyCityRelayoutAtBoot({ ...seedWith, pool: db, planetId: TEST_PLANET_ID, nowMs: now() });
    if (config.npc)
      seedNpcAtBoot({ ...seedWith, seedOfFaction, planetId: TEST_PLANET_ID, nowMs: now(), ids: nextId });
    paths.start();
    spawnBots();
    // 유닛을 다시 놓은 뒤에 전투 끝을 다시 건다(지난 끝 시각은 곧바로 적용된다)
    await battles.restore();
    await travel.restore();
    // 유닛 행이 없는 사이보그를 시작 도시에 다시 놓는다(불변 조건 I13). 검사가 DB를 읽기 전에 커밋한다
    const repaired = cyborgs.repairUnits(new Set(loaded.units.map((unit) => unit.id)));
    if (repaired > 0) {
      log.info({ repaired }, "world boot: placed cyborgs without a unit again");
      await writer.durable();
    }

    const writeHeartbeat = () => writer.upsert("heartbeat", { id: 1, boot_id: bootId, alive_at_ms: now() });
    writeHeartbeat();
    heartbeat = setInterval(() => {
      writeHeartbeat();
      ties.reload().catch((error: unknown) => log.warn({ err: error }, "house ties reload failed"));
    }, HEARTBEAT_MS);
    heartbeat.unref();

    const problems = [
      ...checkMemoryInvariants(memoryChecks({ badUnits, badBuildings })),
      ...labor.check(),
      ...(await checkSqlInvariants(db, now())),
    ];
    status.issues = problems.length;
    // NPC 사회 런타임(봇을 다시 놓은 뒤): 실패해도 월드는 봇만 걷는 채로 돈다
    if (config.npc && !stopped) {
      try {
        npc = await startNpcRuntime({
          pool: db,
          writer,
          ledger,
          owners,
          maps,
          nextOwnerId: nextId.owner,
          nextUnitId: nextId.unit,
          now,
          log,
          rules: config.cyborgRules ?? defaultCyborgRules,
          dayMs: config.npc.dayMs,
          manual: config.npc.manual,
          gardenerWaves: config.npc.gardenerWaves,
          planetId: TEST_PLANET_ID,
          startBattle: (init) => startWorldBattle(init, false),
          onBattleEnded: (listener) => battleApply.onEnded(listener),
          combatCatalog: config.combatCatalog,
          combatRules: config.combatRules,
          // 새 마을의 행정 건물·숙소를 도시 배치 함수로(질문 1052 다, 도시 줄과 같은 쓰기 묶음)
          onCityFounded: villageSeeder({ ...seedWith, seedOfFaction, planetId: TEST_PLANET_ID, now }),
          // 기준 도시를 빼앗기면 영토 비콘도 함께 넘어간다(D-512 335, 도시 줄과 같은 쓰기 묶음)
          onCityOwner: (cityId, factionId) => {
            const moved = territory.cityOwnerChanged(cityId, factionId);
            if (moved > 0) log.info({ cityId, factionId, moved }, "beacons follow city owner");
          },
          // 막아 낸 도시 웨이브 보상 아이템(D-499): 팩 유전자(gene.drops wave)·크리쳐 재료(중분류 creature_material)
          waveRewardItems: () => waveRewardItemsOf(config.holdings?.content().items ?? []),
          // 수호신 만족도 버프(기획 답 470 가): 하루 끝에 그 도시 휴먼마다
          guardianSatisfaction: () => persistence?.fusion.temple.citySatisfaction() ?? new Map(),
          // 배후지 채집 다툼(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)"): 1차맵 칸 행성 값
          economy: npcEconomyInputOf(config.economy, facilities, maps, config.npc.presets, (mapKey) =>
            terrainService?.cellValues?.(mapKey),
          ),
          presets: config.npc.presets,
          // 폐허 2: 정부 건물·행정 레벨(489 다)·수호신(472 가)·유저 나라(535 폐허 창고 물건)
          ruins: npcRuinsInputOf(() => persistence, owners, now),
          siegeLayout: citySiegeLayoutOf(maps, facilities, now),
          // 수도가 바뀌면 지도자가 새 수도 행정 건물 곁으로(D-528, npc/leaders.ts)
          onCapitalMoved: (ownerId, capital) => {
            moveLeaderToCapital({ maps, facilities: facilities.service.facilities, ownerId, capital });
          },
          // 국력 등급 반영 요청이 든 부팅(world/tierApply.ts): 이미 채운 시작 도시도 등급 값까지 주거·휴먼·경비대를 더한다
          tierApply: seeded?.tierApply !== undefined,
        });
        await finishTierApply(db, TEST_PLANET_ID, now(), seeded?.tierApply, npc.seedReport, log);
      } catch (error) {
        log.error({ err: error }, "npc society failed to start; bots keep walking");
      }
    }
    status.bootMs = Math.round(performance.now() - started);
    log.info(
      {
        bootMs: status.bootMs,
        units: loaded.units.length,
        buildings: loaded.buildings.length,
        owners: loaded.owners.length,
        lastAliveMs: loaded.lastAliveMs,
        downMs: loaded.lastAliveMs === null ? null : now() - loaded.lastAliveMs,
        presenceFixed: loaded.presenceFixed,
        orphanUnits,
        problems,
      },
      problems.length === 0 ? "world recovered" : "world recovered with invariant problems",
    );
  };

  const ready = (async () => {
    if (pool) {
      await bootWithDb(pool);
    } else {
      await factory.createMaps(testKeys);
      paths.start();
      spawnBots();
      status.bootMs = 0;
    }
    status.state = "ready";
    log.info(
      {
        maps: maps.size,
        testBots: config.testBots,
        pathWorkers: config.paths.kind === "workers" ? config.paths.workers : 0,
        persistence: Boolean(pool),
      },
      "world started",
    );
  })();
  ready.catch((error: unknown) => {
    status.state = "failed";
    log.error({ err: error }, "world boot failed");
  });

  let windowStart = now();
  return {
    stats,
    maps,
    terrain: terrainService,
    ready,
    status: () => ({ ...status }),
    get persistence() {
      return persistence;
    },
    get npc() {
      return npc;
    },
    isReady: () => status.state === "ready",
    ownerOfUser: (userId) => persistence?.settlement.findOwnerOfUser(userId),
    map: (mapKey) => (status.state === "ready" ? maps.get(mapKey) : undefined),
    async checkInvariants() {
      const memory = checkMemoryInvariants(memoryChecks({}));
      if (!persistence) return memory;
      await persistence.writer.durable();
      return [
        ...memory,
        ...persistence.labor.check(),
        ...(await checkSqlInvariants(persistence.pool, now())),
      ];
    },
    takeMetrics() {
      const at = now();
      const gauges = { units: 0, moving: 0, planning: 0, subscribers: 0, pathQueue: paths.queued() };
      for (const map of maps.values()) {
        const g = map.gauges();
        gauges.units += g.units;
        gauges.moving += g.moving;
        gauges.planning += g.planning;
        gauges.subscribers += map.stream.subscriberCount;
      }
      const summary = summarizeWorldStats(stats, gauges, at - windowStart);
      resetWorldStats(stats);
      windowStart = at;
      const spawned = persistence?.spawn.takeMetrics();
      return { ...summary, ...persistence?.writer.takeMetrics(), ...npc?.takeMetrics(), ...spawned };
    },
    async stop() {
      stopped = true;
      await ready.catch(() => undefined);
      if (heartbeat) clearInterval(heartbeat);
      npc?.stop();
      persistence?.settlement.stop();
      persistence?.battles.stop();
      persistence?.holdings.stop();
      persistence?.vitals.stop();
      persistence?.facilities.service.stop();
      persistence?.fusion.stop();
      persistence?.travel.stop();
      persistence?.spawn.stop();
      for (const map of maps.values()) map.stop();
      if (persistence) {
        persistence.writer.upsert("heartbeat", { id: 1, boot_id: bootId, alive_at_ms: now() });
        await persistence.writer.drain();
      }
      await paths.close();
    },
    async crashForTest(inFlight) {
      stopped = true;
      await ready.catch(() => undefined);
      npc?.stop();
      await persistence?.writer.crash(inFlight);
      persistence?.settlement.stop();
      persistence?.battles.stop();
      persistence?.holdings.stop();
      persistence?.vitals.stop();
      persistence?.facilities.service.stop();
      persistence?.fusion.stop();
      persistence?.travel.stop();
      persistence?.spawn.stop();
      if (heartbeat) clearInterval(heartbeat);
      for (const map of maps.values()) map.stop();
      await paths.close();
    },
  };
}
