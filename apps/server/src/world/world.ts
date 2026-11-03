// 월드 — 시험 2차맵(들) + 경로 서비스 + 시험 봇, DB가 있으면 저장·부팅 복구까지
// ADR 2026-10-28-s1-second-map.md(S1), 2026-10-31-s3-server-stage.md 1·2절(S3 저장·복구)
// - DB가 없으면 S1처럼 메모리에만 둔다(시험·DB 없는 서버).
// - DB가 있으면 부팅 때 DB에서 건물·유닛을 다시 놓고 예약을 다시 건 뒤 준비 완료(ready)다. 그 뒤 바뀜은 월드 쓰기
//   대기열이 0.25초마다 묶어 커밋하고, 10초마다 생존 시각을 쓴다. 끌 때 대기열을 비운다.
import { randomInt, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { gunzipSync } from "node:zlib";
import { type CellKey, EARTH_FACE_LEVEL, cellKey, stepCell } from "@terra/planet";
import { DEFAULT_WORLD_PLANET_ID } from "../db/schema.ts";
import {
  CELL_UNITS,
  type CombatCatalog,
  type CombatCoefficients,
  generateTempTerrain,
  positionAt,
  seedFromCellKey,
} from "@terra/sim";
import type { WorldDirectory } from "./gateway.ts";
import { type Ledger, createLedger } from "../economy/ledger.ts";
import { type MemoryChecks, checkMemoryInvariants, checkSqlInvariants } from "./invariants.ts";
import { type OwnerRow, type QueryPool, ensureTestNpcOwner, loadWorld } from "./persist/load.ts";
import { type WorldWriter, type WriterPool, createWorldWriter } from "./persist/writer.ts";
import { createWorkerPathService } from "./pathPool.ts";
import { type PathService, createInlinePathService } from "./pathService.ts";
import { type MapLog, type MapPersist, type SecondMap, createSecondMap } from "./secondMap.ts";
import { type BattleWorld, applyBattleOutcome } from "./battleResults.ts";
import { type CityRow, ensureTestStartCities, loadCities, nearestSafeCity } from "./cities.ts";
import {
  type CyborgRules,
  type CyborgService,
  createCyborgService,
  defaultCyborgRules,
} from "../cyborg/service.ts";
import { type LoadedCyborgs, loadCyborgs } from "../cyborg/state.ts";
import { type HoldingsConfig, type WorldHoldings, createWorldHoldings } from "../holdings/world.ts";
import { type LoadedHoldings, loadHoldings } from "../holdings/state.ts";
import { TEST_NPC_FACTION_CODE } from "./unitKinds.ts";
import { type BattleService, createBattleService } from "./battles.ts";
import { type MapTerrain, mapTerrainFromBuilt, mapTerrainFromTemp, terrainFromFile } from "./mapTerrain.ts";
import { type MapPin, loadPins, retireTestMaps, savePin } from "./pins.ts";
import type { TerrainService } from "./terrainService.ts";
import type { ExploredStore } from "./vision.ts";
import {
  ASSET_CREDIT,
  NPC_START_CREDIT,
  SYSTEM_ISSUE_CREDIT,
  type Settlement,
  createSettlement,
} from "./settlement.ts";
import { emptyWorldStats, resetWorldStats, summarizeWorldStats } from "./worldStats.ts";
import { type NationPreset, ensureTestNations, nationName } from "../npc/nations.ts";
import { type NpcRuntime, startNpcRuntime } from "../npc/runtime.ts";
import type { TerritoryBeaconFacilityView } from "@terra/shared/territoryApi";
import {
  type BeaconRow,
  type TerritoryService,
  createTerritoryService,
  loadBeacons,
} from "../territory/service.ts";

/**
 * 시험 2차맵 자리(ADR 2026-10-31-second-map-from-planet 8절): S2 시험 행성(면 레벨 9) 면 0의 (i, j) = (282, 328) 칸부터
 * 오른쪽으로. 64장(MAX_TEST_MAPS)이 모두 땅·초지이고 강·호수·바다가 둘레에 없는 줄이다(지금 생성기 판에서, 시험이 본다).
 * 기기는 같은 값을 @terra/protocol S1_TEST_MAP_KEY로 안다(시험이 두 값이 같은지 본다).
 * 지형 서비스가 있으면 행성 값에서 만든 2차맵, 없으면(시험·DB 없는 개발) S1 임시 지형이다.
 */
export const TEST_MAP_ORIGIN = { face: 0, i: 282, j: 328 } as const;
export const TEST_MAP_KEY: CellKey = cellKey(
  TEST_MAP_ORIGIN.face,
  EARTH_FACE_LEVEL,
  TEST_MAP_ORIGIN.i,
  TEST_MAP_ORIGIN.j,
);

/** 시험 2차맵이 놓인 행성(콘텐츠 팩 ID). 지구가 팩에 들어오면 시험 2차맵도 옮긴다(D-372, S3 ADR "행성 ID·영역") */
export const TEST_PLANET_ID: string = DEFAULT_WORLD_PLANET_ID;

/** 시험 2차맵 k번째(0 = TEST_MAP_KEY). 규모 시험(S1_TEST_MAPS)은 오른쪽으로 나란히 둔다 */
export function testMapKey(index: number): CellKey {
  return cellKey(TEST_MAP_ORIGIN.face, EARTH_FACE_LEVEL, TEST_MAP_ORIGIN.i + index, TEST_MAP_ORIGIN.j);
}

/** 옛 시험 2차맵(S1 임시 지형 시절, S2 시험 행성에서는 깊은 바다 위) k번째. 부팅 때 행을 지운다(U4 (가), pins.ts) */
export function retiredTestMapKey(index: number): number {
  return cellKey(0, EARTH_FACE_LEVEL, 256 + index, 256);
}
/** 옛 시험 2차맵 수(그때의 S1_TEST_MAPS 상한) */
export const RETIRED_TEST_MAPS = 64;

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
      }
    | undefined;
  /** 보유 물건(실효 콘텐츠·설정 칸 실효 값·사이보그 1차 스탯). 없으면 빈 콘텐츠(시험) */
  holdings?: HoldingsConfig | undefined;
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
  /** 보유 물건(아이템 인스턴스, docs/adr/2026-11-03-item-holdings.md) */
  readonly holdings: WorldHoldings;
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
  const mapKeys = Array.from({ length: mapCount }, (_, index) => testMapKey(index));

  /** 2차맵 지형: 고정본 → 지형 서비스(캐시 → 생성기). 지형 서비스가 없으면 S1 임시 지형 */
  const terrainFor = async (mapKey: number, pins: ReadonlyMap<number, MapPin>): Promise<MapTerrain> => {
    if (!terrainService) return mapTerrainFromTemp(mapKey, generateTempTerrain(seedFromCellKey(mapKey)));
    const pin = pins.get(mapKey);
    if (pin) {
      try {
        return mapTerrainFromBuilt(terrainFromFile(mapKey, pin.terrainVersion, pin.tctrGzip, gunzipSync));
      } catch (error) {
        // 고정본이 틀리면 생성기로 만든다(고정본은 그대로 두고 알린다: 사람이 본다)
        log.error({ err: error, mapKey }, "second map pin does not decode, generating instead");
      }
    }
    return terrainService.get(mapKey);
  };

  /** 처음 손댄 2차맵의 지금 지형을 고정본으로 쓴다(행성 값 2차맵만. S1 임시 지형은 고정하지 않는다) */
  const pinner = (db: QueryPool | undefined, mapKey: number) => (): void => {
    const map = maps.get(mapKey);
    if (!db || !terrainService || !map) return;
    const pin = { mapKey, terrainVersion: map.terrainVersion, tctrGzip: map.terrainFile().gzip };
    savePin(db, TEST_PLANET_ID, pin, now())
      .then(() => log.info({ mapKey, terrainVersion: pin.terrainVersion }, "second map pinned"))
      .catch((error: unknown) => log.warn({ err: error, mapKey }, "second map pin failed"));
  };

  const createMaps = async (
    persist: MapPersist | undefined,
    ids: WorldPersistence["nextId"] | undefined,
    npcOwnerId: number,
    exploredStore?: (mapKey: number) => ExploredStore,
    db?: QueryPool,
  ): Promise<void> => {
    const pins =
      db && terrainService ? await loadPins(db, TEST_PLANET_ID, mapKeys) : new Map<number, MapPin>();
    const terrains = await Promise.all(mapKeys.map((mapKey) => terrainFor(mapKey, pins)));
    for (const [index, mapKey] of mapKeys.entries()) {
      const terrain = terrains[index];
      if (!terrain) continue;
      maps.set(
        mapKey,
        createSecondMap({
          mapKey,
          terrain,
          paths,
          now,
          stats,
          log,
          persist,
          planetId: TEST_PLANET_ID,
          explored: exploredStore?.(mapKey),
          botOwnerId: npcOwnerId,
          allocateUnitId: ids?.unit,
          allocateBuildingId: ids?.building,
          onFirstEdit: pins.has(mapKey) ? undefined : pinner(db, mapKey),
        }),
      );
    }
    // 이웃 미리 받기: 띄운 2차맵 둘레 8장의 지형을 캐시에 둔다(경계 너머 보기·나중의 2차맵 넘기)
    if (terrainService) {
      const neighbours = new Set<number>();
      for (const mapKey of mapKeys) {
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (di === 0 && dj === 0) continue;
            const next = stepCell(mapKey, di, dj);
            if (next !== null && !maps.has(next)) neighbours.add(next);
          }
        }
      }
      terrainService.prefetch([...neighbours]);
    }
  };

  /** 봇을 2차맵마다 고르게 나눈다(앞 2차맵부터 하나씩 더) */
  const spawnBots = (): void => {
    let index = 0;
    for (const map of maps.values()) {
      const share = Math.floor(config.testBots / mapCount) + (index < config.testBots % mapCount ? 1 : 0);
      map.spawnBots(share);
      index += 1;
    }
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
        await ensureTestStartCities(db, TEST_NPC_FACTION_CODE, TEST_PLANET_ID, mapKeys, now());
        if (config.npc && mapKeys[0] !== undefined)
          await ensureTestNations(db, {
            count: config.npc.testNations,
            planetId: TEST_PLANET_ID,
            mapKey: mapKeys[0],
            nowMs: now(),
            presets: config.npc.presets,
          });
        cities = await loadCities(db);
        cyborgData = await loadCyborgs(db);
        beaconRows = await loadBeacons(db);
        holdingData = await loadHoldings(db);
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
          injury: row.condition.injury,
          injury_until_ms: row.condition.injuryUntilMs,
          held_by: row.condition.heldBy,
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
    const exploredStore = (mapKey: number): ExploredStore => ({
      async load(userId) {
        const found = await db.query(
          `select cells from world_exploration where user_id = $1 and map_key = $2 and planet_id = $3`,
          [userId, mapKey, TEST_PLANET_ID],
        );
        const cells = found.rows[0]?.cells;
        return cells instanceof Uint8Array ? new Uint8Array(cells) : null;
      },
      save(userId, bits) {
        writer.upsert("exploration", {
          user_id: userId,
          map_key: mapKey,
          planet_id: TEST_PLANET_ID,
          cells: Buffer.from(bits),
          updated_at_ms: now(),
        });
      },
    });
    await createMaps(persist, nextId, npcOwnerId, exploredStore, db);
    const settlement = createSettlement({
      maps,
      owners,
      ledger,
      writer,
      nextOwnerId: nextId.owner,
      nextUnitId: nextId.unit,
      presence: loaded.presence,
      now,
    });
    const battleWorld: BattleWorld = {
      mapOf: (unitId) => [...maps.values()].find((map) => map.unitInfo(unitId) !== undefined),
      safeCellFor: (unitId, ownerId, map) => {
        const at = map.unitInfo(unitId)?.motion;
        if (!at) return undefined;
        const point = positionAt(at, now());
        const city = nearestSafeCity(
          cities,
          map.planetId,
          map.mapKey,
          { x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) },
          owners.get(ownerId)?.factionId ?? null,
        );
        return city ? { x: city.cellX, y: city.cellY } : undefined;
      },
      ownerExists: (ownerId) => owners.has(ownerId) || ownerId === npcOwnerId,
      ledger,
    };
    // 전투가 끝났을 때 알려 줄 곳(NPC 런타임의 정원사 웨이브, docs/adr/2026-11-01-gardener-r5b.md 5절)
    // 듣는 곳이 붙기 전에 끝난 전투(부팅 때 restore가 바로 적용한 것)는 모아 두었다가 붙을 때 넘긴다
    const battleEnded = new Set<(battleId: number, attackerWon: boolean) => void>();
    const endedBeforeListen: [number, boolean][] = [];
    const battles = createBattleService({
      pool: db,
      writer,
      now,
      // 끝 시각에 한 번: 부상·귀환·포로·탈취를 세계에 적용한다(battleResults.ts, docs/adr/2026-10-31-combat-core.md 8절)
      apply: (battleId, init, outcome, atMs) => {
        const applied = applyBattleOutcome(battleWorld, battleId, init, outcome, atMs);
        // 장비 닳기(D-496 289·N49): 결과 적용과 같은 동기 처리 → 같은 커밋(두 번 닳지 않는다)
        const wear = holdings.service.applyBattle(
          init.seed,
          outcome.units.map((unit) => ({ unit: unit.unit, won: unit.side === outcome.result.winner })),
        );
        log.info(
          {
            battleId,
            winner: outcome.result.winner,
            reason: outcome.result.reason,
            ...applied,
            looted: String(applied.looted),
            ...wear,
          },
          "battle ended",
        );
        const attacker = init.sides.find((side) => !side.defender)?.id;
        const attackerWon = outcome.result.winner === attacker;
        if (battleEnded.size === 0 && endedBeforeListen.length < 1000)
          endedBeforeListen.push([battleId, attackerWon]);
        for (const listener of battleEnded) listener(battleId, attackerWon);
      },
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
      },
      beaconRows,
    );
    const holdings = createWorldHoldings({
      loaded: holdingData,
      writer,
      maps,
      cyborgs,
      settlement,
      config: config.holdings,
      now,
      seed: () => randomInt(0x1_0000_0000),
    });
    persistence = {
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
      holdings,
    };
    // [임시] 시험 NPC 세력은 처음에 시험 화폐를 받는다(봇 유지비를 낸다)
    if (
      !loaded.accounts.some((account) => account.ownerId === npcOwnerId && account.asset === ASSET_CREDIT)
    ) {
      ledger.post({
        kind: "issue",
        atMs: now(),
        entries: [
          { account: ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -NPC_START_CREDIT },
          { account: ledger.ownerAccount(npcOwnerId, ASSET_CREDIT), amount: NPC_START_CREDIT },
        ],
      });
    }

    let badUnits = 0;
    let badBuildings = 0;
    let orphanUnits = 0;
    for (const [mapKey, map] of maps) {
      const onMap = (row: { planetId: string; mapKey: number }) =>
        row.planetId === map.planetId && row.mapKey === mapKey;
      const result = map.restore(loaded.units.filter(onMap), loaded.buildings.filter(onMap));
      badUnits += result.badUnits.length;
      badBuildings += result.badBuildings.length;
    }
    // 이 서버가 띄우지 않은 (행성, 2차맵)의 유닛은 DB에 그대로 둔다(지우지 않는다)
    for (const unit of loaded.units) {
      if (unit.planetId !== TEST_PLANET_ID || !maps.has(unit.mapKey)) orphanUnits += 1;
    }
    paths.start();
    spawnBots();
    // 유닛을 다시 놓은 뒤에 전투 끝을 다시 건다(지난 끝 시각은 곧바로 적용된다)
    await battles.restore();
    // 유닛 행이 없는 사이보그를 시작 도시에 다시 놓는다(불변 조건 I13). 검사가 DB를 읽기 전에 커밋한다
    const repaired = cyborgs.repairUnits(new Set(loaded.units.map((unit) => unit.id)));
    if (repaired > 0) {
      log.info({ repaired }, "world boot: placed cyborgs without a unit again");
      await writer.durable();
    }

    const writeHeartbeat = () => writer.upsert("heartbeat", { id: 1, boot_id: bootId, alive_at_ms: now() });
    writeHeartbeat();
    heartbeat = setInterval(writeHeartbeat, HEARTBEAT_MS);
    heartbeat.unref();

    const problems = [
      ...checkMemoryInvariants(memoryChecks({ badUnits, badBuildings })),
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
          startBattle: (init) => battles.start(init, { war: false }),
          onBattleEnded: (listener) => {
            battleEnded.add(listener);
            for (const [battleId, attackerWon] of endedBeforeListen.splice(0))
              listener(battleId, attackerWon);
          },
          combatCatalog: config.combatCatalog,
          combatRules: config.combatRules,
        });
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
      await createMaps(undefined, undefined, 0);
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
    devSpawn(userId, mapKey, count) {
      if (!persistence || status.state !== "ready") return 0;
      const at = now();
      const made = persistence.settlement.giveWorkers(userId, mapKey, count, at);
      // [임시] 시험 일꾼 유지비를 낼 시험 화폐(일꾼 하나에 하루치)
      if (made.length > 0) {
        const owner = persistence.settlement.ownerOfUser(userId, at);
        persistence.settlement.grantCredit(owner.id, BigInt(made.length * 24), at);
      }
      return made.length;
    },
    map: (mapKey) => (status.state === "ready" ? maps.get(mapKey) : undefined),
    async checkInvariants() {
      const memory = checkMemoryInvariants(memoryChecks({}));
      if (!persistence) return memory;
      await persistence.writer.durable();
      return [...memory, ...(await checkSqlInvariants(persistence.pool, now()))];
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
      return { ...summary, ...persistence?.writer.takeMetrics(), ...npc?.takeMetrics() };
    },
    async stop() {
      stopped = true;
      await ready.catch(() => undefined);
      if (heartbeat) clearInterval(heartbeat);
      npc?.stop();
      persistence?.settlement.stop();
      persistence?.battles.stop();
      persistence?.holdings.stop();
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
      if (heartbeat) clearInterval(heartbeat);
      for (const map of maps.values()) map.stop();
      await paths.close();
    },
  };
}
