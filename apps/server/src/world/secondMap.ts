// 2차맵 하나의 서버 상태 (S1, 메모리에만 — DB 저장은 S3) — ADR 2026-10-28-s1-second-map.md
// - 배치 격자(원본)·유닛·건물을 들고, 바뀔 때마다 rev를 1 올리고 전송(mapStream)에 알린다.
// - 유닛은 "꺾이는 점 + 출발 시각 + 속도"만 둔다. 도착·쉬기 끝은 예약 이벤트로만 처리한다.
// - 경로는 경로 서비스(워커)가 푼다. 요청 규칙:
//   · 움직이는 유닛이면 지금 자리에 멈춰 세운다(정지 움직임을 보낸다). 결과가 오면 그때(now) 출발한다.
//     그래서 서버의 움직임은 끊기지 않고, 지난 시각의 움직임을 고치지 않는다.
//   · 요청마다 유닛의 routeSeq를 올린다. 결과가 왔을 때 번호가 다르면(더 새 요청이 있음) 버린다.
//   · 격자를 막는 편집(건물 놓기) 전에 푼 결과면 다시 찾는다(blockingVersion). 치우기는 길을 막지 않아 그대로 쓴다.
// - 건물을 놓으면 남은 경로가 막힌 유닛만 다시 찾는다. 유닛이 서 있는 칸에는 놓지 않는다(overlaps_unit).
import {
  type BuildingWire,
  MAX_PATH_POINTS,
  type ResultCode,
  type UnitMotionWire,
  encodeTerrain,
  terrainPath,
} from "@terra/protocol";
import {
  CELL_UNITS,
  DEFAULT_NODE_BUDGET,
  HALF_CELL_UNITS,
  type BuildingPlacement,
  type CellRect,
  type Motion,
  type PlacementGrid,
  type Point,
  type SizeClass,
  type TempTerrain,
  TERRAIN_SIZE,
  anchorAt,
  anchorCenter,
  applyPlacement,
  arrivalAt,
  createMotion,
  createPlacementGrid,
  distanceAt,
  isPassable,
  placementCostsFromTerrain,
  positionAt,
  positionAtDistance,
  removeBuilding,
  terrainHash,
  validatePlacement,
} from "@terra/sim";
import { gzipSync } from "node:zlib";
import { type BotPlan, botPlan, idleMs, pickDestination, pickSpawn, retryMs, startDelayMs } from "./bots.ts";
import { type MapStream, createMapStream } from "./mapStream.ts";
import type { MapReplicaInit } from "./pathMessages.ts";
import type { PathOutcome, PathPriority, PathService } from "./pathService.ts";
import { type Scheduler, createScheduler } from "./scheduler.ts";
import { type SizedEntry, buildingToWire, motionToWire, sized } from "./wire.ts";
import { type WorldStats, recordPathOutcome } from "./worldStats.ts";

/** 봇 경로의 탐색 예산(칸). 넘으면 budget_exceeded → 다른 목적지 */
export const BOT_NODE_BUDGET = 32_768;
/** 관리자 명령·다시 찾기의 예산 = 2차맵 전체(넘을 수 없다) */
export const COMMAND_NODE_BUDGET = DEFAULT_NODE_BUDGET;
/** 2차맵 하나의 건물 수 상한(S1). 스냅샷 크기를 묶는다 */
export const MAX_BUILDINGS = 1_024;

export type CommandResult = { ok: true; buildingId?: number } | { ok: false; code: ResultCode };

interface UnitState {
  readonly id: number;
  readonly size: SizeClass;
  readonly speed: number;
  motion: Motion;
  entry: SizedEntry<UnitMotionWire>;
  /** 지금 가려는 곳(건물 때문에 다시 찾을 때 쓴다) */
  destination: Point;
  routeSeq: number;
  planning: boolean;
  /** 예약된 도착·쉬기 끝 이벤트 */
  eventId: number | undefined;
  readonly bot: BotPlan | undefined;
}

type MapEvent = { kind: "arrive" | "wake"; unitId: number };

export interface MapLog {
  warn(obj: object, message: string): void;
  error(obj: object, message: string): void;
}

export interface SecondMapOptions {
  mapKey: number;
  terrain: TempTerrain;
  paths: PathService;
  now: () => number;
  stats: WorldStats;
  log: MapLog;
}

export interface TerrainFile {
  raw: Buffer;
  gzip: Buffer;
}

export interface SecondMap {
  readonly mapKey: number;
  readonly generatorVersion: number;
  readonly stream: MapStream;
  /** 경로 워커가 사본을 만들 때 쓰는 지금 상태 */
  replicaInit(): MapReplicaInit;
  /** 지형 이진 파일(처음 부를 때 만들고 계속 쓴다) */
  terrainFile(): TerrainFile;
  /** 시험용 봇을 count개 만든다(유닛 ID 1부터) */
  spawnBots(count: number): void;
  /** 스스로 움직이지 않는 유닛 하나를 기준 칸 (x, y)에 세운다. ID가 있거나 설 수 없으면 false */
  addUnit(spec: { id: number; size: SizeClass; speed: number; cellX: number; cellY: number }): boolean;
  moveUnit(unitId: number, target: Point): Promise<CommandResult>;
  placeBuilding(placement: BuildingPlacement): CommandResult;
  removeBuilding(buildingId: number): CommandResult;
  gauges(): { units: number; moving: number; planning: number };
  /** 시험·확인용: 유닛의 크기 등급·속도·지금 움직임 */
  unitInfo(unitId: number): { size: SizeClass; speed: number; motion: Motion } | undefined;
  stop(): void;
}

/** 경로 결과 상태 → 명령 결과 코드 */
function failureCode(status: PathOutcome["status"]): ResultCode {
  switch (status) {
    case "no_path":
    case "budget_exceeded":
    case "start_blocked":
    case "goal_blocked":
    case "busy":
      return status;
    case "dropped":
      return "superseded";
    case "invalid_request":
      return "invalid_request";
    default:
      // unknown_map: 워커 사본에 2차맵이 없다(서버 버그)
      return "internal_error";
  }
}

/** 크기 등급 size 유닛의 몸(s×s 정사각형)이 덮는 칸 범위 — 칸 사이를 지날 때는 한 칸 더 걸친다 */
function bodyCells(point: Point, size: SizeClass): { x0: number; y0: number; x1: number; y1: number } {
  const half = size * HALF_CELL_UNITS;
  return {
    x0: Math.floor((point.x - half) / CELL_UNITS),
    y0: Math.floor((point.y - half) / CELL_UNITS),
    x1: Math.floor((point.x + half - 1) / CELL_UNITS),
    y1: Math.floor((point.y + half - 1) / CELL_UNITS),
  };
}

function rectsOverlap(cells: { x0: number; y0: number; x1: number; y1: number }, rect: CellRect): boolean {
  return (
    cells.x0 < rect.x + rect.width &&
    cells.x1 >= rect.x &&
    cells.y0 < rect.y + rect.height &&
    cells.y1 >= rect.y
  );
}

/**
 * 지금(now)부터 남은 경로가 막혔는가. 꺾이는 점 사이는 8방향 직선이라 기준 칸을 한 칸씩 밟아 본다
 * (A*와 같은 규칙: 설 수 있음 + 대각선은 양옆 두 칸도).
 */
export function remainingPathBlocked(
  grid: PlacementGrid,
  motion: Motion,
  size: SizeClass,
  now: number,
): boolean {
  const travelled = distanceAt(motion, now);
  const { waypoints, distances } = motion;
  let segment = 0;
  while (segment + 1 < distances.length && (distances[segment + 1] ?? 0) <= travelled) segment++;
  let cell = anchorAt(positionAtDistance(motion, travelled), size);
  if (!isPassable(grid, cell.x, cell.y, size)) return true;
  for (let next = segment + 1; next < waypoints.length; next++) {
    const point = waypoints[next];
    if (!point) break;
    const target = anchorAt(point, size);
    while (cell.x !== target.x || cell.y !== target.y) {
      const dx = Math.sign(target.x - cell.x);
      const dy = Math.sign(target.y - cell.y);
      const step = { x: cell.x + dx, y: cell.y + dy };
      if (!isPassable(grid, step.x, step.y, size)) return true;
      if (
        dx !== 0 &&
        dy !== 0 &&
        (!isPassable(grid, step.x, cell.y, size) || !isPassable(grid, cell.x, step.y, size))
      ) {
        return true;
      }
      cell = step;
    }
  }
  return false;
}

/** 움직임의 마지막 점(서 있는 유닛이면 지금 자리) */
function lastPoint(motion: Motion): Point {
  return motion.waypoints[motion.waypoints.length - 1] ?? motion.waypoints[0] ?? { x: 0, y: 0 };
}

export function createSecondMap(options: SecondMapOptions): SecondMap {
  const { mapKey, terrain, paths, now, stats, log } = options;
  const grid = createPlacementGrid(placementCostsFromTerrain(terrain));
  const units = new Map<number, UnitState>();
  const buildings = new Map<number, { placement: BuildingPlacement; entry: SizedEntry<BuildingWire> }>();
  let rev = 0;
  let gridVersion = 0;
  /** 마지막으로 칸을 막은 편집의 격자 버전. 이보다 옛 격자로 푼 결과는 다시 찾는다 */
  let blockingVersion = 0;
  let nextBuildingId = 1;
  let terrainCache: TerrainFile | undefined;
  const terrainInfo = {
    url: terrainPath(mapKey, terrain.generatorVersion),
    generatorVersion: terrain.generatorVersion,
  };

  const stream = createMapStream({
    mapKey,
    terrain: terrainInfo,
    now,
    stats: stats.stream,
    state: () => ({
      rev,
      units: [...units.values()].map((unit) => unit.entry),
      buildings: [...buildings.values()].map((building) => building.entry),
    }),
  });

  const scheduler: Scheduler<MapEvent> = createScheduler<MapEvent>({
    now,
    handle: (event) => onEvent(event.payload),
    onError: (error) => log.error({ err: error, mapKey }, "map event failed"),
  });

  const setMotion = (unit: UnitState, motion: Motion): void => {
    unit.motion = motion;
    unit.entry = sized(motionToWire(unit.id, unit.size, motion));
    rev += 1;
    stream.unitChanged(rev, unit.entry);
  };

  const cancelEvent = (unit: UnitState): void => {
    if (unit.eventId !== undefined) scheduler.cancel(unit.eventId);
    unit.eventId = undefined;
  };

  const scheduleEvent = (unit: UnitState, kind: MapEvent["kind"], timeMs: number): void => {
    cancelEvent(unit);
    unit.eventId = scheduler.schedule(timeMs, { kind, unitId: unit.id });
  };

  const isCurrent = (unit: UnitState, seq: number) => (): boolean =>
    units.get(unit.id) === unit && unit.routeSeq === seq;

  /** 경로를 부탁한다. 결과는 waiter로(명령이면 result 메시지가 된다) */
  const requestRoute = (
    unit: UnitState,
    to: Point,
    priority: PathPriority,
    nodeBudget: number,
    waiter?: (result: CommandResult) => void,
  ): void => {
    const at = now();
    if (at < arrivalAt(unit.motion)) {
      // 움직이는 중이면 지금 자리에 멈춰 세운다(결과가 오면 거기서 출발)
      setMotion(
        unit,
        createMotion({ waypoints: [positionAt(unit.motion, at)], departAtMs: at, speed: unit.speed }),
      );
    }
    cancelEvent(unit);
    unit.routeSeq += 1;
    const seq = unit.routeSeq;
    unit.planning = true;
    unit.destination = to;
    stats.paths.requests += 1;
    paths
      .request({
        mapKey,
        from: lastPoint(unit.motion),
        to,
        size: unit.size,
        nodeBudget,
        priority,
        isCurrent: isCurrent(unit, seq),
      })
      .then(
        (outcome) => onRoute(unit, seq, to, priority, nodeBudget, outcome, waiter),
        (error: unknown) => {
          log.error({ err: error, mapKey, unitId: unit.id }, "path request failed");
          if (unit.routeSeq === seq) unit.planning = false;
          waiter?.({ ok: false, code: "internal_error" });
        },
      );
  };

  const onRoute = (
    unit: UnitState,
    seq: number,
    to: Point,
    priority: PathPriority,
    nodeBudget: number,
    outcome: PathOutcome,
    waiter: ((result: CommandResult) => void) | undefined,
  ): void => {
    recordPathOutcome(stats.paths, outcome);
    if (units.get(unit.id) !== unit || unit.routeSeq !== seq) {
      waiter?.({ ok: false, code: "superseded" });
      return;
    }
    if (outcome.status !== "busy" && outcome.status !== "dropped" && outcome.version < blockingVersion) {
      // 그사이 건물이 놓였다 → 지금 격자로 다시
      stats.paths.staleReplans += 1;
      requestRoute(unit, to, priority, nodeBudget, waiter);
      return;
    }
    unit.planning = false;
    if (outcome.status === "found") {
      if (outcome.waypoints.length <= MAX_PATH_POINTS && outcome.waypoints.length > 0) {
        const motion = createMotion({ waypoints: outcome.waypoints, departAtMs: now(), speed: unit.speed });
        setMotion(unit, motion);
        scheduleEvent(unit, "arrive", arrivalAt(motion));
        waiter?.({ ok: true });
        return;
      }
      stats.paths.outcomes.set("path_too_complex", (stats.paths.outcomes.get("path_too_complex") ?? 0) + 1);
      waiter?.({ ok: false, code: "path_too_complex" });
    } else {
      waiter?.({ ok: false, code: failureCode(outcome.status) });
    }
    if (unit.bot) scheduleEvent(unit, "wake", now() + retryMs(unit.bot.rng));
  };

  const onEvent = (event: MapEvent): void => {
    const unit = units.get(event.unitId);
    if (!unit) return;
    unit.eventId = undefined;
    if (!unit.bot) return;
    if (event.kind === "arrive") {
      scheduleEvent(unit, "wake", now() + idleMs(unit.bot.rng));
      return;
    }
    if (unit.planning) return;
    const destination = pickDestination(grid, unit.bot.rng, unit.size, lastPoint(unit.motion));
    if (!destination) {
      scheduleEvent(unit, "wake", now() + retryMs(unit.bot.rng));
      return;
    }
    requestRoute(unit, destination, "bot", BOT_NODE_BUDGET);
  };

  /** 건물이 막은 경로를 가진 유닛만 다시 찾는다(목적지는 그대로) */
  const replanBlockedUnits = (): void => {
    const at = now();
    for (const unit of units.values()) {
      if (unit.planning || at >= arrivalAt(unit.motion)) continue;
      if (!remainingPathBlocked(grid, unit.motion, unit.size, at)) continue;
      stats.paths.blockedReplans += 1;
      requestRoute(unit, unit.destination, "bot", COMMAND_NODE_BUDGET);
    }
  };

  const unitInRect = (rect: CellRect): boolean => {
    const at = now();
    for (const unit of units.values()) {
      if (rectsOverlap(bodyCells(positionAt(unit.motion, at), unit.size), rect)) return true;
    }
    return false;
  };

  /** 서 있는 유닛 하나를 만든다(봇의 첫 출발 예약은 spawnBots가 한다) */
  const createUnit = (
    id: number,
    size: SizeClass,
    speed: number,
    at: Point,
    bot: BotPlan | undefined,
  ): UnitState => {
    const motion = createMotion({ waypoints: [at], departAtMs: now(), speed });
    const unit: UnitState = {
      id,
      size,
      speed,
      motion,
      entry: sized(motionToWire(id, size, motion)),
      destination: at,
      routeSeq: 0,
      planning: false,
      eventId: undefined,
      bot,
    };
    units.set(id, unit);
    rev += 1;
    stream.unitChanged(rev, unit.entry);
    return unit;
  };

  return {
    mapKey,
    generatorVersion: terrain.generatorVersion,
    stream,
    replicaInit: () => ({
      mapKey,
      version: gridVersion,
      terrainCost: grid.terrainCost,
      road: grid.road,
      buildings: [...buildings].map(([id, building]) => ({ id, placement: building.placement })),
    }),
    terrainFile() {
      if (!terrainCache) {
        const bytes = encodeTerrain({
          mapKey,
          generatorVersion: terrain.generatorVersion,
          seed: terrain.seed,
          hash: Number.parseInt(terrainHash(terrain), 16) >>> 0,
          terrainSize: TERRAIN_SIZE,
          heights: terrain.heights,
          surface: terrain.surface,
        });
        const raw = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        terrainCache = { raw, gzip: gzipSync(raw) };
      }
      return terrainCache;
    },
    spawnBots(count) {
      const at = now();
      for (let id = 1; id <= count; id++) {
        if (units.has(id)) continue;
        const plan = botPlan(terrain.seed, id);
        const spawn = pickSpawn(grid, plan.rng, plan.size);
        if (!spawn) {
          log.warn({ mapKey, unitId: id, size: plan.size }, "no room to spawn a test bot");
          continue;
        }
        const unit = createUnit(id, plan.size, plan.speed, spawn, plan);
        scheduleEvent(unit, "wake", at + startDelayMs(plan.rng));
      }
    },
    addUnit({ id, size, speed, cellX, cellY }) {
      if (units.has(id) || !Number.isInteger(id) || id < 1 || !isPassable(grid, cellX, cellY, size))
        return false;
      createUnit(id, size, speed, anchorCenter(cellX, cellY, size), undefined);
      return true;
    },
    moveUnit(unitId, target) {
      const unit = units.get(unitId);
      if (!unit) return Promise.resolve({ ok: false, code: "unknown_unit" });
      return new Promise((resolve) => requestRoute(unit, target, "command", COMMAND_NODE_BUDGET, resolve));
    },
    placeBuilding(placement) {
      if (buildings.size >= MAX_BUILDINGS) return { ok: false, code: "building_limit" };
      const check = validatePlacement(grid, placement);
      if (!check.ok)
        return { ok: false, code: check.problem === "invalid_input" ? "invalid_request" : check.problem };
      if (unitInRect(check.rect)) return { ok: false, code: "overlaps_unit" };
      const id = nextBuildingId++;
      applyPlacement(grid, id, placement);
      gridVersion += 1;
      blockingVersion = gridVersion;
      paths.edit(mapKey, gridVersion, { op: "place", id, placement });
      const entry = sized(buildingToWire(id, placement));
      buildings.set(id, { placement, entry });
      rev += 1;
      stream.buildingPlaced(rev, entry.value);
      replanBlockedUnits();
      return { ok: true, buildingId: id };
    },
    removeBuilding(buildingId) {
      if (!buildings.has(buildingId)) return { ok: false, code: "unknown_building" };
      removeBuilding(grid, buildingId);
      buildings.delete(buildingId);
      gridVersion += 1;
      paths.edit(mapKey, gridVersion, { op: "remove", id: buildingId });
      rev += 1;
      stream.buildingRemoved(rev, buildingId);
      return { ok: true };
    },
    gauges() {
      const at = now();
      let moving = 0;
      let planning = 0;
      for (const unit of units.values()) {
        if (unit.planning) planning += 1;
        else if (at < arrivalAt(unit.motion)) moving += 1;
      }
      return { units: units.size, moving, planning };
    },
    unitInfo(unitId) {
      const unit = units.get(unitId);
      return unit ? { size: unit.size, speed: unit.speed, motion: unit.motion } : undefined;
    },
    stop() {
      scheduler.stop();
      stream.close();
    },
  };
}
