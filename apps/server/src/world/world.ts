// 월드 — 시험 2차맵(들) + 경로 서비스 + 시험 봇, DB가 있으면 저장·부팅 복구까지
// ADR 2026-10-28-s1-second-map.md(S1), 2026-10-31-s3-server-stage.md 1·2절(S3 저장·복구)
// - DB가 없으면 S1처럼 메모리에만 둔다(시험·DB 없는 서버).
// - DB가 있으면 부팅 때 DB에서 건물·유닛을 다시 놓고 예약을 다시 건 뒤 준비 완료(ready)다. 그 뒤 바뀜은 월드 쓰기
//   대기열이 0.25초마다 묶어 커밋하고, 10초마다 생존 시각을 쓴다. 끌 때 대기열을 비운다.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { EARTH_FACE_LEVEL, cellKey } from "@terra/planet";
import { DEFAULT_WORLD_PLANET_ID } from "../db/schema.ts";
import { generateTempTerrain, seedFromCellKey } from "@terra/sim";
import type { WorldDirectory } from "./gateway.ts";
import { type Ledger, createLedger } from "../economy/ledger.ts";
import { type MemoryChecks, checkMemoryInvariants, checkSqlInvariants } from "./invariants.ts";
import { type OwnerRow, type QueryPool, ensureTestNpcOwner, loadWorld } from "./persist/load.ts";
import { type WorldWriter, type WriterPool, createWorldWriter } from "./persist/writer.ts";
import { createWorkerPathService } from "./pathPool.ts";
import { type PathService, createInlinePathService } from "./pathService.ts";
import { type MapLog, type MapPersist, type SecondMap, createSecondMap } from "./secondMap.ts";
import { type BattleService, createBattleService } from "./battles.ts";
import type { ExploredStore } from "./vision.ts";
import {
  ASSET_CREDIT,
  NPC_START_CREDIT,
  SYSTEM_ISSUE_CREDIT,
  type Settlement,
  createSettlement,
} from "./settlement.ts";
import { emptyWorldStats, resetWorldStats, summarizeWorldStats } from "./worldStats.ts";

/**
 * S1 시험 2차맵: 지구(면 레벨 9) 면 0의 (i, j) = (256, 256) 칸(면 가운데, +x 방향).
 * 기기는 같은 값을 @terra/protocol S1_TEST_MAP_KEY로 안다(시험이 두 값이 같은지 본다).
 * 지형은 칸 키로 만든 임시 지형이라 실제 지구 위치·고도와는 상관없다(행성 회전·생성기는 S2).
 */
export const TEST_MAP_KEY: number = cellKey(0, EARTH_FACE_LEVEL, 256, 256);

/** 시험 2차맵이 놓인 행성(콘텐츠 팩 ID). 지구가 팩에 들어오면 시험 2차맵도 옮긴다(D-372, S3 ADR "행성 ID·영역") */
export const TEST_PLANET_ID: string = DEFAULT_WORLD_PLANET_ID;

/** 시험 2차맵 k번째(0 = TEST_MAP_KEY). 규모 시험(S1_TEST_MAPS)은 오른쪽으로 나란히 둔다 */
export function testMapKey(index: number): number {
  return cellKey(0, EARTH_FACE_LEVEL, 256 + index, 256);
}

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
  /** 부팅 복구가 끝나면 풀린다(실패하면 거부) */
  readonly ready: Promise<void>;
  status(): WorldStatus;
  /** DB가 있을 때만 */
  readonly persistence: WorldPersistence | undefined;
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
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const bootId = randomUUID();

  const createMaps = (
    persist: MapPersist | undefined,
    ids: WorldPersistence["nextId"] | undefined,
    npcOwnerId: number,
    exploredStore?: (mapKey: number) => ExploredStore,
  ) => {
    for (let index = 0; index < mapCount; index++) {
      const mapKey = testMapKey(index);
      const terrain = generateTempTerrain(seedFromCellKey(mapKey));
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
        }),
      );
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
    for (let attempt = 1; !loaded; attempt++) {
      try {
        npcOwnerId = await ensureTestNpcOwner(db, now());
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
    createMaps(persist, nextId, npcOwnerId, exploredStore);
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
    const battles = createBattleService({
      pool: db,
      now,
      // [R3] 결과는 전투 행(result)에 남긴다. 유닛 부상(D-099)·귀환·포로(질문 108)·탈취를 세계에 적용하는 일은 R4(부상·수명 열과 함께)
      onResult: (battleId, outcome) =>
        log.info({ battleId, winner: outcome.result.winner, reason: outcome.result.reason }, "battle ended"),
      onError: (error) => log.error({ err: error }, "battle failed"),
    });
    await battles.restore();
    persistence = { writer, pool: db, nextId, owners, ledger, settlement, npcOwnerId, battles };
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

    const writeHeartbeat = () => writer.upsert("heartbeat", { id: 1, boot_id: bootId, alive_at_ms: now() });
    writeHeartbeat();
    heartbeat = setInterval(writeHeartbeat, HEARTBEAT_MS);
    heartbeat.unref();

    const problems = [
      ...checkMemoryInvariants(memoryChecks({ badUnits, badBuildings })),
      ...(await checkSqlInvariants(db, now())),
    ];
    status.issues = problems.length;
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
      createMaps(undefined, undefined, 0);
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
    ready,
    status: () => ({ ...status }),
    get persistence() {
      return persistence;
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
      return { ...summary, ...persistence?.writer.takeMetrics() };
    },
    async stop() {
      stopped = true;
      await ready.catch(() => undefined);
      if (heartbeat) clearInterval(heartbeat);
      persistence?.settlement.stop();
      persistence?.battles.stop();
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
      await persistence?.writer.crash(inFlight);
      persistence?.settlement.stop();
      persistence?.battles.stop();
      if (heartbeat) clearInterval(heartbeat);
      for (const map of maps.values()) map.stop();
      await paths.close();
    },
  };
}
