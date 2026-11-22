// 2차맵 하나의 서버 상태 — ADR 2026-10-28-s1-second-map.md, 저장·복구는 ADR 2026-10-31-s3-server-stage.md 1·2절
// - 유닛·건물이 바뀌면 persist 고리(월드 쓰기 대기열)로 행을 넘긴다. 위치는 저장하지 않고 경로·출발 시각·속도를 저장한다.
//   예약은 주인 행의 예정 시각이다: 봇의 쉬기 끝(wakeAtMs)과 경로 도착(arrivalAt). 다시 켜면 restore가 그대로 다시 건다.
// - 배치 격자(원본)·유닛·건물을 들고, 바뀔 때마다 rev를 1 올리고 전송(mapStream)에 알린다.
// - 유닛은 "꺾이는 점 + 출발 시각 + 속도"만 둔다. 도착·쉬기 끝은 예약 이벤트로만 처리한다.
// - 경로는 경로 서비스(워커)가 푼다. 요청 규칙:
//   · 움직이는 유닛이면 지금 자리에 멈춰 세운다(정지 움직임을 보낸다). 결과가 오면 그때(now) 출발한다.
//     그래서 서버의 움직임은 끊기지 않고, 지난 시각의 움직임을 고치지 않는다.
//   · 요청마다 유닛의 routeSeq를 올린다. 결과가 왔을 때 번호가 다르면(더 새 요청이 있음) 버린다.
//   · 격자를 막는 편집(건물 놓기) 전에 푼 결과면 다시 찾는다(blockingVersion). 치우기는 길을 막지 않아 그대로 쓴다.
// - 건물을 놓으면 남은 경로가 막힌 유닛만 다시 찾는다. 유닛이 서 있는 칸에는 놓지 않는다(overlaps_unit).
// - 배(docs/adr/2026-11-13-boats.md): 영역 sea 유닛은 물 격자(지형 파일 층에서 처음 쓸 때 만든다)로 길을 푼다. 탄 유닛(aboard)은 배 움직임을
//   그대로 따르고(갑판에 선다) 따로 움직이지 않는다.
import {
  type BuildingWire,
  MAX_PATH_POINTS,
  MAX_UNIT_SPEED,
  decodeTerrain,
  terrainPath,
} from "@terra/protocol";
import {
  DEFAULT_NODE_BUDGET,
  PLACEMENT_SIZE,
  type BuildingPlacement,
  type CellRect,
  type Motion,
  type PlacementGrid,
  type Point,
  type SizeClass,
  WALK_SPEED,
  anchorAt,
  anchorCenter,
  applyPlacement,
  footprintRect,
  arrivalAt,
  createMotion,
  createPlacementGrid,
  createWaterGrid,
  hasNavigableWater,
  isPassable,
  markWaterBuilding,
  positionAt,
  compareEventKeys,
  removeBuilding,
  validatePlacement,
  waterCostsFromLayers,
} from "@terra/sim";
import type { Rng } from "@terra/shared";
import type { WaterMask } from "@terra/shared/waterNearby";
import {
  arrivalIdleMs,
  HUMAN_SIZE,
  botPlan,
  botRng,
  humanPlan,
  pickDestination,
  pickSpawn,
  retryMs,
  startDelayMs,
  tripArea,
} from "./bots.ts";
import { bodyCells, failureCode, lastPoint, rectsOverlap, remainingPathBlocked } from "./mapGeometry.ts";
import type { TerrainFile } from "./mapTerrain.ts";
import { createMapStream } from "./mapStream.ts";
import type { MapReplicaInit } from "./pathMessages.ts";
import type { PathOutcome, PathPriority } from "./pathService.ts";
import { type Scheduler, createScheduler } from "./scheduler.ts";
import { DEFAULT_WORLD_PLANET_ID, type WorldDomain } from "../db/schema.ts";
import { HEALTHY, type UnitCondition, safePoint, unavailable } from "./unitCondition.ts";
import {
  UNIT_KIND_BOAT,
  UNIT_KIND_BOT,
  UNIT_KIND_NPC_LEADER,
  UNIT_KIND_TEST,
  VEHICLE_MIN_SPEED,
  wireKindOf,
} from "./unitKinds.ts";
import { createMapVision } from "./vision.ts";
import { waterMaskOfTerrain } from "./waterMask.ts";
import { type SizedEntry, buildingToWire, motionToWire, sized } from "./wire.ts";
import { recordPathOutcome } from "./worldStats.ts";
import { NO_JOB, type UnitJob, type UnitRow, motionOfRow, unitRowOf } from "./secondMapRows.ts";

/** 봇 경로의 탐색 예산(칸). 넘으면 budget_exceeded → 다른 목적지 */
export const BOT_NODE_BUDGET = 32_768;
/** 관리자 명령·다시 찾기의 예산 = 2차맵 전체(넘을 수 없다) */
export const COMMAND_NODE_BUDGET = DEFAULT_NODE_BUDGET;
/** 2차맵 하나의 건물 수 상한(S1). 스냅샷 크기를 묶는다 */
export const MAX_BUILDINGS = 1_024;

// 저장 행·직무 모양은 secondMapRows.ts, 2차맵 모양(SecondMap·옵션·읽기 모양)은 secondMapTypes.ts(이 파일 1,000줄 상한)
export { type BuildingRow, type MapPersist, NO_JOB, type UnitJob, type UnitRow } from "./secondMapRows.ts";
export type { CommandResult, MapLog, SecondMap, SecondMapOptions, UnitView } from "./secondMapTypes.ts";
import type { CommandResult, MapUnitState, SecondMap, SecondMapOptions, UnitView } from "./secondMapTypes.ts";

type UnitState = MapUnitState;

/** 2차맵 예약: 같은 시각이면 (종류, 유닛 ID) 차례다(@terra/sim compareEventKeys, S3 ADR 1절) */
type MapEvent = { kind: "arrive" | "wake"; subject: number };

export type { TerrainFile } from "./mapTerrain.ts";

// 칸·경로 도우미는 mapGeometry.ts(이 파일 1,000줄 상한). 시험이 이 파일에서 가져온다
export { remainingPathBlocked };

export function createSecondMap(options: SecondMapOptions): SecondMap {
  const { mapKey, terrain, paths, now, stats, log, persist } = options;
  const planetId = options.planetId ?? DEFAULT_WORLD_PLANET_ID;
  const botOwnerId = options.botOwnerId ?? 0;
  let localUnitId = 0;
  const allocateUnitId =
    options.allocateUnitId ??
    (() => {
      localUnitId += 1;
      return localUnitId;
    });
  // 격자가 지형 비용 배열을 고친다(벌목 등) → 캐시가 든 원본과 나눠 쓰지 않게 복사한다
  const grid = createPlacementGrid(terrain.costs.slice());
  let water: WaterMask | undefined;
  // 배 격자(docs/adr/2026-11-13-boats.md 2절): 처음 배를 다룰 때 지형 파일 층에서 만든다. 물 칸이 없으면 undefined
  let boatGrid: PlacementGrid | undefined;
  let boatCost: Uint16Array | undefined;
  let boatChecked = false;
  let edited = false;
  const units = new Map<number, UnitState>();
  /** 운영자 빠르기 표시(유닛 ID → 배수, 1은 두지 않는다 — operatorPace.ts) */
  const paces = new Map<number, number>();
  const buildings = new Map<
    number,
    { id: number; ownerId: number | null; placement: BuildingPlacement; entry: SizedEntry<BuildingWire> }
  >();
  let rev = 0;
  let gridVersion = 0;
  /** 마지막으로 칸을 막은 편집의 격자 버전. 이보다 옛 격자로 푼 결과는 다시 찾는다 */
  let blockingVersion = 0;
  let localBuildingId = 0;
  const allocateBuildingId =
    options.allocateBuildingId ??
    (() => {
      localBuildingId += 1;
      return localBuildingId;
    });
  const terrainInfo = {
    url: terrainPath(mapKey, terrain.version),
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

  const vision = createMapVision({
    mapKey,
    terrain: terrainInfo,
    now,
    stats: stats.stream,
    explored: options.explored,
    source: {
      units: () => units.values(),
      unit: (id) => units.get(id),
      buildings: () => buildings.values(),
      border: options.edge ? (at) => options.edge?.sight(mapKey, at) ?? [] : undefined,
    },
  });

  const scheduler: Scheduler<MapEvent> = createScheduler<MapEvent>({
    now,
    handle: (event) => onEvent(event.payload),
    order: compareEventKeys,
    onError: (error) => log.error({ err: error, mapKey }, "map event failed"),
  });

  const rowOf = (unit: UnitState): UnitRow => ({
    ...unitRowOf(unit, mapKey, planetId),
    aboardId: unit.aboard ?? null,
  });
  const save = (unit: UnitState): void => persist?.saveUnit(rowOf(unit));
  /** 몸에서 빠르기를 다시 읽는다(D-540 걷기 = 실효 AGI). 하던 이동은 그대로 — 다음 이동부터. 저장은 이어지는 움직임과 함께 */
  const refresh = (unit: UnitState): number => {
    unit.speed = options.walkSpeed?.(unit) ?? unit.speed;
    return unit.speed;
  };

  const replicaInit = (): MapReplicaInit => ({
    mapKey,
    version: gridVersion,
    terrainCost: grid.terrainCost,
    road: grid.road,
    buildings: [...buildings].map(([id, building]) => ({ id, placement: building.placement })),
    ...(boatCost ? { waterCost: boatCost } : {}),
  });

  /** 배 격자(처음 부를 때 만들고 경로 워커 사본에도 싣는다). 물 칸이 없는 2차맵은 undefined */
  const ensureBoatGrid = (): PlacementGrid | undefined => {
    if (boatChecked) return boatGrid;
    boatChecked = true;
    const data = decodeTerrain(terrain.file().raw);
    const costs = waterCostsFromLayers({ surface: data.surface, cover: data.cover ?? undefined });
    if (!hasNavigableWater(costs)) return undefined;
    boatCost = costs;
    boatGrid = createWaterGrid(costs);
    for (const building of buildings.values()) markWaterBuilding(boatGrid, building.id, building.placement);
    paths.add(replicaInit());
    return boatGrid;
  };
  /** 그 유닛이 길을 푸는 격자(배 = 물 격자) */
  const gridOf = (unit: UnitState): PlacementGrid =>
    unit.domain === "sea" ? (ensureBoatGrid() ?? grid) : grid;

  const setMotion = (unit: UnitState, motion: Motion): void => {
    unit.motion = motion;
    unit.entry = sized(motionToWire(unit.id, unit.size, motion, wireKindOf(unit.kind, unit.speed)));
    rev += 1;
    stream.unitChanged(rev, unit.entry);
    vision.unitChanged(unit);
    save(unit);
    if (!unit.bot) options.edge?.moved(mapKey, unit);
    // 배가 움직이면 승객도 같은 움직임(갑판에 선다 — 크기 1 몸 가운데 = 배 몸 가운데)
    if (unit.kind === UNIT_KIND_BOAT)
      for (const rider of units.values()) if (rider.aboard === unit.id) setMotion(rider, motion);
  };

  const cancelEvent = (unit: UnitState): void => {
    if (unit.eventId !== undefined) scheduler.cancel(unit.eventId);
    unit.eventId = undefined;
    unit.wakeAtMs = undefined;
  };

  const scheduleEvent = (unit: UnitState, kind: MapEvent["kind"], timeMs: number): void => {
    cancelEvent(unit);
    unit.eventId = scheduler.schedule(timeMs, { kind, subject: unit.id });
    if (kind === "wake") {
      unit.wakeAtMs = timeMs;
      save(unit);
    }
  };

  /** 봇의 다음 판단 난수(판단 횟수를 올리고 저장은 이어지는 바뀜과 함께) */
  const nextRng = (unit: UnitState): Rng => {
    const rng = botRng(terrain.seed, unit.id, unit.aiStep);
    unit.aiStep += 1;
    return rng;
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
    speedFactor = 1,
  ): void => {
    const at = now();
    refresh(unit);
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
        // 땅 유닛은 구간 빠르기(걸음 배율, ADR 2026-11-14-segment-speed.md)를 기본 빠르기로 셈한다. 배는 같은 빠르기
        ...(unit.domain === "sea"
          ? ensureBoatGrid()
            ? { medium: "water" as const }
            : {}
          : { paceSpeed: unit.speed }),
      })
      .then(
        (outcome) => onRoute(unit, seq, to, priority, nodeBudget, outcome, waiter, speedFactor),
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
    speedFactor = 1,
  ): void => {
    recordPathOutcome(stats.paths, outcome);
    if (units.get(unit.id) !== unit || unit.routeSeq !== seq) {
      waiter?.({ ok: false, code: "superseded" });
      return;
    }
    if (
      outcome.status !== "busy" &&
      outcome.status !== "dropped" &&
      outcome.status !== "unknown_map" &&
      outcome.version < blockingVersion
    ) {
      // 그사이 건물이 놓였다 → 지금 격자로 다시. 워커 사본에 2차맵이 없다는 답(unknown_map, 판 −1)은 격자 판과 상관없어 다시 찾지 않는다:
      // 다시 물으면 같은 답이 곧바로 와서 마이크로태스크가 끝없이 돈다(docs/adr/2026-11-07-play-flow.md WP1 9절·WP7). 명령은 unknown_map으로 끝나고
      // 봇은 아래에서 잠시 뒤 다시 깬다
      stats.paths.staleReplans += 1;
      requestRoute(unit, to, priority, nodeBudget, waiter, speedFactor);
      return;
    }
    unit.planning = false;
    if (outcome.status === "found") {
      if (outcome.waypoints.length <= MAX_PATH_POINTS && outcome.waypoints.length > 0) {
        const speed = Math.min(MAX_UNIT_SPEED, Math.max(1, Math.round(unit.speed * speedFactor)));
        const motion = createMotion({
          waypoints: outcome.waypoints,
          paces: outcome.paces,
          departAtMs: now(),
          speed,
        });
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
    const autoRoam = unit.bot || (unit.kind === UNIT_KIND_NPC_LEADER && unit.home?.role === "leader");
    if (autoRoam) scheduleEvent(unit, "wake", now() + retryMs(nextRng(unit)));
  };

  const onEvent = (event: MapEvent): void => {
    const unit = units.get(event.subject);
    if (!unit) return;
    unit.eventId = undefined;
    if (event.kind === "wake") unit.wakeAtMs = undefined;
    // 배에 탄 봇(NPC 배 어부 — boats/npcFleet.ts)은 스스로 걷지 않는다(내리면 다시 깨운다). 지도자도 순회 집이 있으면 걷는다
    const autoRoam = unit.bot || (unit.kind === UNIT_KIND_NPC_LEADER && unit.home?.role === "leader");
    if (!autoRoam || unit.aboard !== undefined) return;
    if (event.kind === "arrive") {
      const rest = arrivalIdleMs(nextRng(unit), unit, lastPoint(unit.motion), now());
      scheduleEvent(unit, "wake", now() + rest);
      return;
    }
    if (unit.planning) return;
    // 포로·중태(활동 불가)인 봇은 스스로 움직이지 않는다. 잠시 뒤 다시 본다([임시] 1분)
    if (unavailable(unit.condition, now())) {
      scheduleEvent(unit, "wake", now() + 60_000);
      return;
    }
    const rng = nextRng(unit);
    const from = lastPoint(unit.motion);
    const area = unit.home ? tripArea(from, unit.size, unit.home, unit.id, now()) : undefined;
    const destination = pickDestination(grid, rng, unit.size, from, area);
    if (!destination) {
      scheduleEvent(unit, "wake", now() + retryMs(rng));
      return;
    }
    requestRoute(unit, destination, "bot", BOT_NODE_BUDGET);
  };

  /** 건물이 막은 경로를 가진 유닛만 다시 찾는다(목적지는 그대로) */
  const replanBlockedUnits = (): void => {
    const at = now();
    for (const unit of units.values()) {
      if (unit.planning || at >= arrivalAt(unit.motion)) continue;
      if (unit.aboard !== undefined || !remainingPathBlocked(gridOf(unit), unit.motion, unit.size, at))
        continue;
      stats.paths.blockedReplans += 1;
      // 다시 찾은 길도 하던 이동의 빠르기 그대로(운영자 빠르기·2차맵 사이 이동의 빠르기 — operatorPace.ts)
      requestRoute(
        unit,
        unit.destination,
        "bot",
        COMMAND_NODE_BUDGET,
        undefined,
        unit.motion.speed / unit.speed,
      );
    }
  };

  const unitInRect = (rect: CellRect): boolean => {
    const at = now();
    for (const unit of units.values()) {
      if (rectsOverlap(bodyCells(positionAt(unit.motion, at), unit.size), rect)) return true;
    }
    return false;
  };

  /** 유닛 하나를 넣는다(봇의 첫 출발 예약은 spawnBots·restore가 한다) */
  const createUnit = (spec: {
    id: number;
    ownerId: number;
    kind: number;
    domain?: WorldDomain;
    size: SizeClass;
    speed: number;
    motion: Motion;
    aiStep: number;
    job: UnitJob;
    condition?: UnitCondition;
    aboardId?: number | null | undefined;
    traits?: readonly number[] | null | undefined;
    guardian?: boolean | undefined;
  }): UnitState => {
    const unit: UnitState = {
      id: spec.id,
      ownerId: spec.ownerId,
      kind: spec.kind,
      domain: spec.domain ?? "land",
      size: spec.size,
      speed: spec.speed,
      motion: spec.motion,
      entry: sized(motionToWire(spec.id, spec.size, spec.motion, wireKindOf(spec.kind, spec.speed))),
      destination: lastPoint(spec.motion),
      routeSeq: 0,
      planning: false,
      eventId: undefined,
      wakeAtMs: undefined,
      aiStep: spec.aiStep,
      job: spec.job,
      condition: spec.condition ?? HEALTHY,
      bot: spec.kind === UNIT_KIND_BOT,
      home: undefined,
      aboard: spec.aboardId ?? undefined,
      traits: spec.traits ?? undefined,
      guardian: spec.guardian === true,
    };
    units.set(unit.id, unit);
    rev += 1;
    stream.unitChanged(rev, unit.entry);
    vision.unitChanged(unit);
    if (!unit.bot) options.edge?.moved(mapKey, unit);
    return unit;
  };

  const standing = (at: Point, speed: number): Motion =>
    createMotion({ waypoints: [at], departAtMs: now(), speed });

  /** 건물 하나를 격자에 놓고 기억한다(검사는 부르는 쪽이 했다) */
  const putBuilding = (id: number, placement: BuildingPlacement, ownerId: number | null): void => {
    applyPlacement(grid, id, placement);
    if (boatGrid) markWaterBuilding(boatGrid, id, placement);
    gridVersion += 1;
    blockingVersion = gridVersion;
    paths.edit(mapKey, gridVersion, { op: "place", id, placement });
    const entry = sized(buildingToWire(id, placement));
    const building = { id, ownerId, placement, entry };
    buildings.set(id, building);
    rev += 1;
    stream.buildingPlaced(rev, entry.value);
    vision.buildingPlaced(building);
  };

  const view = (unit: UnitState): UnitView => ({
    id: unit.id,
    ownerId: unit.ownerId,
    kind: unit.kind,
    size: unit.size,
    motion: unit.motion,
    job: unit.job,
    planning: unit.planning,
    hasEvent: unit.eventId !== undefined,
    aboard: unit.aboard,
    traits: unit.traits,
    guardian: unit.guardian,
  });

  /** 명령을 받을 유닛: 승객이면 같은 주인의 그 배(없으면 undefined), 아니면 그 유닛 */
  const boatOf = (unit: UnitState): UnitState | undefined => {
    if (unit.aboard === undefined) return unit;
    const boat = units.get(unit.aboard);
    return boat?.kind === UNIT_KIND_BOAT && boat.ownerId === unit.ownerId ? boat : undefined;
  };

  /** 승객을 배에서 떼어 안전한 땅에 세운다(배가 없어짐·복구 때 배가 없음) */
  const releaseRider = (unit: UnitState, wake = true): void => {
    unit.aboard = undefined;
    const point = safePoint(grid, unit.size) ?? lastPoint(unit.motion);
    unit.destination = point;
    setMotion(unit, standing(point, unit.speed));
    if (unit.bot && wake) scheduleEvent(unit, "wake", now() + startDelayMs(nextRng(unit)));
  };

  /** 배 만들기·타기·내리기(docs/adr/2026-11-13-boats.md 3·4절). 판정(소유·거리·재료)은 배 서비스(boats/service.ts)가 먼저 한다. 다른 배로 옮겨 타기도 된다(D-559 빼앗기) */
  const boatMethods = (): Pick<
    SecondMap,
    "addBoat" | "isNavigable" | "board" | "disembark" | "passengers"
  > => ({
    addBoat({ id, ownerId, speed, cellX, cellY }) {
      const sea = ensureBoatGrid();
      if (!sea || units.has(id) || !Number.isInteger(id) || id < 1 || !isPassable(sea, cellX, cellY, 2))
        return false;
      save(
        createUnit({
          id,
          ownerId,
          kind: UNIT_KIND_BOAT,
          domain: "sea",
          size: 2,
          speed,
          motion: standing(anchorCenter(cellX, cellY, 2), speed),
          aiStep: 0,
          job: NO_JOB,
        }),
      );
      return true;
    },
    isNavigable(cellX, cellY, size) {
      const sea = ensureBoatGrid();
      return sea !== undefined && isPassable(sea, cellX, cellY, size);
    },
    board(unitId, boatId) {
      const unit = units.get(unitId);
      const boat = units.get(boatId);
      if (!unit || !boat || boat.kind !== UNIT_KIND_BOAT || unit.domain === "sea" || unit.aboard === boatId)
        return false;
      cancelEvent(unit);
      unit.routeSeq += 1;
      unit.planning = false;
      unit.aboard = boatId;
      unit.destination = lastPoint(boat.motion);
      setMotion(unit, boat.motion);
      return true;
    },
    disembark(unitId, cellX, cellY) {
      const unit = units.get(unitId);
      if (unit?.aboard === undefined || !isPassable(grid, cellX, cellY, unit.size)) return false;
      unit.aboard = undefined;
      const point = anchorCenter(cellX, cellY, unit.size);
      unit.destination = point;
      setMotion(unit, standing(point, unit.speed));
      if (unit.bot) scheduleEvent(unit, "wake", now() + startDelayMs(nextRng(unit)));
      return true;
    },
    passengers(boatId) {
      const out: number[] = [];
      for (const unit of units.values()) if (unit.aboard === boatId) out.push(unit.id);
      return out;
    },
  });

  return {
    mapKey,
    planetId,
    generatorVersion: terrain.generatorVersion,
    terrainVersion: terrain.version,
    stream,
    vision,
    replicaInit,
    terrainFile(): TerrainFile {
      return terrain.file();
    },
    waterMask() {
      water ??= waterMaskOfTerrain(terrain);
      return water;
    },
    spawnBots(count) {
      const at = now();
      let existing = 0;
      for (const unit of units.values()) if (unit.bot) existing += 1;
      for (let made = existing; made < count; made++) {
        const id = allocateUnitId();
        const plan = botPlan(terrain.seed, id);
        const spawn = pickSpawn(grid, plan.rng, plan.size);
        if (!spawn) {
          log.warn({ mapKey, unitId: id, size: plan.size }, "no room to spawn a test bot");
          continue;
        }
        const unit = createUnit({
          id,
          ownerId: botOwnerId,
          kind: UNIT_KIND_BOT,
          size: plan.size,
          speed: plan.speed,
          motion: standing(spawn, plan.speed),
          aiStep: 0,
          job: NO_JOB,
        });
        scheduleEvent(unit, "wake", at + startDelayMs(nextRng(unit)));
      }
    },
    addUnit({ id, size, speed, cellX, cellY, ownerId, kind, traits }) {
      if (units.has(id) || !Number.isInteger(id) || id < 1 || !isPassable(grid, cellX, cellY, size))
        return false;
      const unit = createUnit({
        id,
        ownerId: ownerId ?? botOwnerId,
        kind: kind ?? UNIT_KIND_TEST,
        size,
        speed,
        motion: standing(anchorCenter(cellX, cellY, size), speed),
        aiStep: 0,
        job: NO_JOB,
        traits,
      });
      save(unit);
      return true;
    },
    restore(unitRows, buildingRows) {
      const badUnits: number[] = [];
      const badBuildings: number[] = [];
      for (const row of buildingRows.toSorted((a, b) => a.id - b.id)) {
        const check = validatePlacement(grid, row.placement);
        if (!check.ok || buildings.has(row.id)) {
          badBuildings.push(row.id);
          continue;
        }
        putBuilding(row.id, row.placement, row.ownerId);
      }
      const events: { at: number; kind: MapEvent["kind"]; unit: UnitState }[] = [];
      for (const row of unitRows) {
        const motion = motionOfRow(row);
        if (!motion) {
          badUnits.push(row.id);
          continue;
        }
        if (units.has(row.id)) {
          badUnits.push(row.id);
          continue;
        }
        const unit = createUnit({ ...row, motion });
        if (row.wakeAtMs !== null) events.push({ at: row.wakeAtMs, kind: "wake", unit });
        else if (unit.bot) events.push({ at: arrivalAt(motion), kind: "arrive", unit });
      }
      // 승객을 배에 다시 붙인다(배가 없으면 안전한 곳으로 — docs/adr/2026-11-13-boats.md 4절)
      for (const unit of units.values()) {
        if (unit.domain === "sea") ensureBoatGrid();
        if (unit.aboard === undefined) continue;
        const boat = units.get(unit.aboard);
        if (boat?.kind === UNIT_KIND_BOAT) unit.motion = boat.motion;
        else releaseRider(unit, false);
      }
      // 같은 시각끼리의 차례는 큐가 (시각, 종류, 유닛 ID) 키로 정한다 → 넣는 차례는 상관없다
      for (const event of events) {
        event.unit.eventId = scheduler.schedule(event.at, { kind: event.kind, subject: event.unit.id });
        if (event.kind === "wake") event.unit.wakeAtMs = event.at;
      }
      return { badUnits, badBuildings };
    },
    forEachUnit(visit) {
      for (const unit of units.values()) visit(view(unit));
    },
    spawnBotNear(id, ownerId, near, radiusCells) {
      if (units.has(id) || !Number.isInteger(id) || id < 1) return false;
      const plan = humanPlan(terrain.seed, id);
      const span = radiusCells * 2 + 1;
      let at: Point | undefined;
      for (let attempt = 0; attempt < 64 && !at; attempt++) {
        const x = near.x + plan.rng.nextInt(span) - radiusCells;
        const y = near.y + plan.rng.nextInt(span) - radiusCells;
        if (x >= 0 && y >= 0 && x < PLACEMENT_SIZE && y < PLACEMENT_SIZE && isPassable(grid, x, y, plan.size))
          at = anchorCenter(x, y, plan.size);
      }
      if (!at) return false;
      const unit = createUnit({
        id,
        ownerId,
        kind: UNIT_KIND_BOT,
        size: plan.size,
        speed: plan.speed,
        motion: standing(at, plan.speed),
        aiStep: 0,
        job: NO_JOB,
      });
      // 구인한 휴먼의 집 = 그 도시(세운 기준 칸)
      unit.home = { x: near.x, y: near.y };
      scheduleEvent(unit, "wake", now() + startDelayMs(nextRng(unit)));
      return true;
    },
    setHome(unitId, home) {
      const unit = units.get(unitId);
      if (!unit || (!unit.bot && unit.kind !== UNIT_KIND_NPC_LEADER)) return false;
      unit.home = home ?? undefined;
      if (unit.kind === UNIT_KIND_NPC_LEADER && unit.home?.role === "leader" && unit.eventId === undefined)
        scheduleEvent(unit, "wake", now() + startDelayMs(nextRng(unit)));
      return true;
    },
    setTraits(unitId, traits) {
      const unit = units.get(unitId);
      if (!unit) return false;
      unit.traits = traits ? [...traits] : undefined;
      save(unit);
      return true;
    },
    setHumanBody(unitId) {
      const unit = units.get(unitId);
      if (
        !unit?.bot ||
        unit.aboard !== undefined ||
        (unit.size === HUMAN_SIZE && unit.speed < VEHICLE_MIN_SPEED)
      )
        return false;
      const at = now();
      const cell = anchorAt(positionAt(unit.motion, at), HUMAN_SIZE);
      cancelEvent(unit);
      unit.routeSeq += 1;
      unit.planning = false;
      unit.size = HUMAN_SIZE;
      unit.speed = WALK_SPEED;
      setMotion(unit, standing(anchorCenter(cell.x, cell.y, HUMAN_SIZE), WALK_SPEED));
      unit.destination = lastPoint(unit.motion);
      scheduleEvent(unit, "wake", at + startDelayMs(nextRng(unit)));
      return true;
    },
    setOwner(unitId, ownerId) {
      const unit = units.get(unitId);
      if (!unit) return false;
      if (unit.ownerId === ownerId) return true;
      unit.ownerId = ownerId;
      save(unit);
      vision.unitChanged(unit);
      return true;
    },
    setKind(unitId, kind) {
      const unit = units.get(unitId);
      if (!unit || unit.bot || kind === UNIT_KIND_BOT) return false;
      if (unit.kind === kind) return true;
      unit.kind = kind;
      // 표시 종류(프로토콜 18)가 바뀌면 같은 움직임을 새 종류로 다시 보낸다(저장도 한다)
      if (wireKindOf(kind, unit.speed) !== unit.entry.value.kind) setMotion(unit, unit.motion);
      else save(unit);
      return true;
    },
    markGuardian(unitId) {
      const unit = units.get(unitId);
      if (!unit || unit.bot) return false;
      if (!unit.guardian) {
        unit.guardian = true;
        save(unit);
      }
      return true;
    },
    removeUnit(unitId) {
      const unit = units.get(unitId);
      if (!unit) return false;
      if (unit.kind === UNIT_KIND_BOAT)
        for (const rider of units.values()) if (rider.aboard === unitId) releaseRider(rider);
      cancelEvent(unit);
      // 진행 중인 경로 결과는 버려진다(isCurrent가 지운 유닛을 거른다)
      unit.routeSeq += 1;
      units.delete(unitId);
      paces.delete(unitId);
      rev += 1;
      stream.unitHidden(rev, unitId);
      vision.unitRemoved(unitId, unit.ownerId);
      persist?.removeUnit?.(unitId);
      return true;
    },
    setJob(unitId, job) {
      const unit = units.get(unitId);
      if (!unit) return false;
      unit.job = job;
      save(unit);
      return true;
    },
    setCondition(unitId, condition) {
      const unit = units.get(unitId);
      if (!unit) return false;
      unit.condition = condition;
      save(unit);
      return true;
    },
    relocateToSafety(unitId, near) {
      const unit = units.get(unitId);
      // 배는 땅의 안전한 곳으로 옮기지 않는다. 승객은 내려서 옮긴다
      const point = unit && unit.domain !== "sea" ? safePoint(grid, unit.size, near) : undefined;
      if (!unit || !point) return false;
      unit.aboard = undefined;
      cancelEvent(unit);
      unit.routeSeq += 1;
      unit.planning = false;
      unit.destination = point;
      setMotion(unit, standing(point, unit.speed));
      if (unit.bot) scheduleEvent(unit, "wake", now() + startDelayMs(nextRng(unit)));
      return true;
    },
    transferOut(unitId) {
      const unit = units.get(unitId);
      // 승객은 혼자 넘지 않는다 — 배가 승객을 데리고 넘는다(바다 건너기, 기획 D-541 1283 나)
      if (!unit || unit.bot || unit.aboard !== undefined) return undefined;
      const riders = [...units.values()].filter((rider) => rider.aboard === unitId);
      const take = (taken: UnitState): UnitRow => {
        const row = rowOf(taken);
        cancelEvent(taken);
        // 진행 중인 경로 결과는 버려진다(isCurrent가 뺀 유닛을 거른다)
        taken.routeSeq += 1;
        units.delete(taken.id);
        paces.delete(taken.id);
        rev += 1;
        stream.unitHidden(rev, taken.id);
        vision.unitRemoved(taken.id, taken.ownerId);
        return row;
      };
      const row = take(unit);
      return riders.length === 0 ? row : { ...row, riders: riders.map(take) };
    },
    transferIn(row, cellX, cellY) {
      const ground = row.domain === "sea" ? ensureBoatGrid() : grid;
      if (
        units.has(row.id) ||
        row.kind === UNIT_KIND_BOT ||
        !ground ||
        !isPassable(ground, cellX, cellY, row.size)
      )
        return false;
      const unit = createUnit({ ...row, motion: standing(anchorCenter(cellX, cellY, row.size), row.speed) });
      save(unit);
      // 배와 함께 온 승객을 다시 태운다(움직임 = 배 움직임)
      for (const rider of row.riders ?? [])
        if (!units.has(rider.id)) save(createUnit({ ...rider, aboardId: unit.id, motion: unit.motion }));
      return true;
    },
    isStandable: (cellX, cellY, size) => isPassable(grid, cellX, cellY, size),
    halt(unitId) {
      // 승객을 멈추면 그 배가 선다(D-541 1279 나)
      const rider = units.get(unitId);
      const unit = rider && boatOf(rider);
      if (!unit || unit.bot) return false;
      cancelEvent(unit);
      unit.routeSeq += 1;
      unit.planning = false;
      const at = positionAt(unit.motion, now());
      unit.destination = at;
      setMotion(unit, standing(at, unit.speed));
      return true;
    },
    missingEvents() {
      let missing = 0;
      for (const unit of units.values())
        if (unit.bot && !unit.planning && unit.eventId === undefined) missing += 1;
      return missing;
    },
    unitsInBuildings() {
      const at = now();
      let count = 0;
      for (const unit of units.values()) {
        if (at < arrivalAt(unit.motion)) continue;
        const cells = bodyCells(positionAt(unit.motion, at), unit.size);
        for (const building of buildings.values()) {
          if (rectsOverlap(cells, footprintRect(building.placement))) {
            count += 1;
            break;
          }
        }
      }
      return count;
    },
    moveUnit(unitId, target, moveOptions) {
      const commanded = units.get(unitId);
      if (!commanded) return Promise.resolve({ ok: false, code: "unknown_unit" });
      // [임시] 포로·중태는 명령을 받지 않는다. 전용 결과 코드는 전투 화면(L1) 때 프로토콜에 더한다
      if (unavailable(commanded.condition, now()))
        return Promise.resolve({ ok: false, code: "invalid_request" });
      // 승객에게 내린 이동은 그 배의 이동(기획 D-541 1279 나). 배가 없거나 주인이 다르면 그대로 aboard
      const unit = boatOf(commanded);
      if (!unit) return Promise.resolve({ ok: false, code: "aboard" });
      const speedFactor = moveOptions?.speedFactor ?? paces.get(unitId) ?? paces.get(unit.id) ?? 1;
      return new Promise((resolve) =>
        requestRoute(unit, target, "command", COMMAND_NODE_BUDGET, resolve, speedFactor),
      );
    },
    setPace(unitId, factor) {
      if (!units.has(unitId)) return undefined;
      const previous = paces.get(unitId) ?? 1;
      if (factor === 1) paces.delete(unitId);
      else paces.set(unitId, factor);
      return previous;
    },
    paceOf: (unitId) => paces.get(unitId) ?? 1,
    refreshSpeed(unitId) {
      const unit = units.get(unitId);
      return unit ? refresh(unit) : undefined;
    },
    placeBuilding(placement, ownerId = null, reuseId) {
      if (buildings.size >= MAX_BUILDINGS) return { ok: false, code: "building_limit" };
      if (reuseId !== undefined && buildings.has(reuseId)) return { ok: false, code: "invalid_request" };
      const check = validatePlacement(grid, placement);
      if (!check.ok)
        return { ok: false, code: check.problem === "invalid_input" ? "invalid_request" : check.problem };
      if (unitInRect(check.rect)) return { ok: false, code: "overlaps_unit" };
      const id = reuseId ?? allocateBuildingId();
      putBuilding(id, placement, ownerId);
      persist?.saveBuilding({ id, mapKey, planetId, domain: "land", ownerId, placement });
      replanBlockedUnits();
      if (!edited) {
        edited = true;
        options.onFirstEdit?.();
      }
      return { ok: true, buildingId: id };
    },
    unitInRect,
    canPlace(placement) {
      if (buildings.size >= MAX_BUILDINGS) return false;
      const check = validatePlacement(grid, placement);
      return check.ok && !unitInRect(check.rect);
    },
    buildingOwner(buildingId) {
      const building = buildings.get(buildingId);
      return building ? building.ownerId : undefined;
    },
    forEachBuilding(visit) {
      for (const building of buildings.values())
        visit({
          id: building.id,
          ownerId: building.ownerId,
          x: building.placement.x,
          y: building.placement.y,
          placement: building.placement,
        });
    },
    removeBuilding(buildingId) {
      if (!buildings.has(buildingId)) return { ok: false, code: "unknown_building" };
      removeBuilding(grid, buildingId);
      if (boatGrid) removeBuilding(boatGrid, buildingId);
      buildings.delete(buildingId);
      gridVersion += 1;
      paths.edit(mapKey, gridVersion, { op: "remove", id: buildingId });
      persist?.removeBuilding(buildingId);
      rev += 1;
      stream.buildingRemoved(rev, buildingId);
      vision.buildingRemoved(buildingId);
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
      return unit
        ? {
            size: unit.size,
            speed: unit.speed,
            motion: unit.motion,
            ownerId: unit.ownerId,
            condition: unit.condition,
            kind: unit.kind,
            job: unit.job,
            domain: unit.domain,
            aboard: unit.aboard,
            guardian: unit.guardian,
          }
        : undefined;
    },
    ...boatMethods(),
    stop() {
      scheduler.stop();
      stream.close();
      vision.close();
    },
  };
}
