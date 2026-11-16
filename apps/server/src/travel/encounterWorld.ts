// 조우 규칙을 월드에 잇기 — 기획 D-564 2차 답 1641·1643, D-570(질문 1901~1908 답), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)"·
// "바뀜 (D-570, 좌표 이동 3)".
// 1. 지형 빠르기(1643·1903): 이동 서비스에 2차맵 걸음 배율(coordPace.ts — 지형 서비스의 행성 값, 강·이웃 비탈 포함)을 붙인다. 2차맵마다 한 번 셈해
//    둔다(행성 값은 바뀌지 않는다).
// 2. 조우 틱(설정 칸 encounter_scan_ms마다, 값은 틱마다 다시 읽는다):
//    ① 좌표 유닛(띄우지 않은 2차맵, encounter.ts): 같은 2차맵에 선 다른 나라 편끼리.
//    ② 띄운 2차맵(1901 가, clash.ts): 다른 나라 두 유닛이 encounter_radius_cells 안(한쪽은 봇 아닌 전투 유닛).
//    두 경우 모두 두 편이 따로 AI 판단(clashDecide.ts — 전쟁·전력 비·성향, 플레이어는 설정 칸 encounter_player_policy, 기본 회피)을 하고
//    둘 다 회피면 그 2차맵·나라 짝은 쉬는 시간(encounter_cooldown_ms) 동안 다시 보지 않는다. 한 편이라도 걸면(전투·약탈):
//    a. 시가지(안전지대 D-146 — 영토 서비스 urbanCity) 안이면 싸우지 않는다(쉬는 시간).
//    b. 두 편 유닛의 길을 멈춘다(travel.haltOn stop "encounter" — 좌표면 그 자리의 좌표 유닛, 띄운 2차맵이면 그 자리). 길이 없는 유닛도 그 자리에 세운다.
//    c. 좌표 조우면 그 2차맵을 띄운다(전투 = 띄우는 까닭, ADR 2026-11-15 2절 3).
//    d. 만난 자리 둘레 실제 지형의 전투맵(1902, encounterArena.ts)에 공격 편·수비 편으로 보통 세계 전투를 연다(건물 공격·웨이브와 같은 길 — 몸·생명
//       수치·물약·탄). 전쟁 상대면 전쟁 전투(진 유닛은 포로), 약탈이면 보통 전투(진 유닛은 안전한 곳, 이긴 편이 짐 몫을 가져간다 — D-173).
//    e. 결과를 적용할 때까지(+ 1분) 그 2차맵을 내리지 않고, 끝 시각 뒤 멈춘 길을 AI가 다시 판단한다(1908, afterEncounter.ts).
//    한 틱에 encounter_max_per_scan개까지(나머지는 다음 틱).
// 부하(NAS 유닛 3,297·2차맵 55): 좌표 유닛은 2차맵 키로 묶기만, 띄운 2차맵은 봇 아닌 전투 유닛이 있는 2차맵만 칸 격자(clash.ts). 잰 값은 작업 기록.
import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  BATTLE_BASE_MOVE_MS,
  CELL_UNITS,
  type EncounterCoefficients,
  JOB_NONE,
  START_ENCOUNTER,
  type SocietyCoefficients,
  footprintRect,
  positionAt,
} from "@terra/sim";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { mapLayers } from "../facilities/siegeLayout.ts";
import { nationOfOwner } from "../world/nationVision.ts";
import { TEST_PLANET_ID } from "../world/testMaps.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import {
  UNIT_KIND_BOT,
  UNIT_KIND_CYBORG,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_HUMAN,
  isAfloat,
} from "../world/unitKinds.ts";
import type { WorldPersistence } from "../world/world.ts";
import { reconsiderTrips, RECHECK_SLACK_MS } from "./afterEncounter.ts";
import { cargoCarriers, cargoGrams } from "./cargo.ts";
import { type ClashUnit, findClashes } from "./clash.ts";
import { type ClashResolution, type ClashSideView, clashPower, resolveClash } from "./clashDecide.ts";
import { coordPacePm, neighborMapKeys } from "./coordPace.ts";
import { groupEncounters, sidePairs } from "./encounter.ts";
import { type ArenaUnit, arenaOrigin, arenaSizeOf, encounterCenter, encounterMap } from "./encounterArena.ts";
import { buildEncounterInit } from "./encounterInit.ts";
import type { HaltedTrip } from "./serviceTypes.ts";

/** 전투 결과를 적용한 뒤에도 그 2차맵을 붙잡는 여유(ms) */
const HOLD_SLACK_MS = 60_000;
/** [임시] 사람형 건물 피해 배율(세계 전투와 같다) */
const BUILDING_MUL_PM = 2000;
/** 2차맵 걸음 배율 캐시 상한(넘으면 비운다 — 행성 값에서 다시 셈한다) */
const PACE_CACHE_MAX = 100_000;
/** 쉬는 시간 표 상한(넘으면 지난 것을 지운다) */
const COOLDOWN_MAX = 10_000;
/** 판단하는 유닛 종류(봇 아닌 전투 유닛 — 사이보그 본체·휴먼·사이보그 유닛) */
const DECIDER_KINDS: ReadonlySet<number> = new Set([
  UNIT_KIND_CYBORG,
  UNIT_KIND_HUMAN,
  UNIT_KIND_CYBORG_UNIT,
]);
/** 조우에 드는 종류(판단하는 유닛 + NPC 휴먼 봇은 상대로만). 지도자·수호신·시험 유닛·배는 빠진다 */
const PARTICIPANT_KINDS: ReadonlySet<number> = new Set([...DECIDER_KINDS, UNIT_KIND_BOT]);

export interface CoordinateRules {
  /** 조우 한 번 찾기(시험·타이머). 연 전투 수 */
  scan(): Promise<number>;
  /** 지난 호출 뒤 구간 지표(틱 수·ms·만남·회피·전투) */
  takeMetrics(): Record<string, number>;
  stop(): void;
}

/** 조우 규칙이 읽는 월드 몫(world.ts World의 일부 — 시험은 이 모양만 만든다) */
export interface CoordinateWorld {
  readonly persistence:
    | (Pick<
        WorldPersistence,
        "travel" | "spawn" | "bodies" | "startBattle" | "battles" | "owners" | "cyborgs" | "ledger"
      > & {
        readonly facilities?: Pick<WorldPersistence["facilities"], "catalog" | "rules"> | undefined;
        readonly territory?: Pick<WorldPersistence["territory"], "urbanCity"> | undefined;
      })
    | undefined;
  readonly npc:
    | {
        readonly world: {
          readonly factions: ReadonlyMap<
            number,
            {
              readonly wars: ReadonlySet<number>;
              readonly traits?: { readonly aggression: number } | undefined;
              readonly player?: true | undefined;
            }
          >;
        };
      }
    | undefined;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly terrain: { cellValues?(mapKey: number): PlanetCellValues | undefined } | undefined;
  status(): { readonly state: string };
}

/** 판단 앞의 한 편(유닛 ID·소유 주체·종류) */
interface SideUnit {
  readonly unitId: number;
  readonly ownerId: number;
  readonly kind: number;
  readonly decider: boolean;
}

/** 싸움이 날 만남 하나 */
interface Engagement {
  readonly mapKey: number;
  readonly loaded: boolean;
  readonly nations: readonly [number, number];
  readonly sides: readonly [readonly SideUnit[], readonly SideUnit[]];
  readonly resolution: ClashResolution;
  readonly atWar: boolean;
}

/** 쉬는 시간 열쇠(2차맵·나라 짝) */
const pairKey = (mapKey: number, a: number, b: number): string =>
  a < b ? `${mapKey}:${a}:${b}` : `${mapKey}:${b}:${a}`;

/** 2차맵 위 유닛의 지금 배치 칸 */
function cellOf(map: SecondMap, unitId: number, at: number): ArenaUnit | undefined {
  const motion = map.unitInfo(unitId)?.motion;
  if (!motion) return undefined;
  const point = positionAt(motion, at);
  return { unitId, x: Math.floor(point.x / CELL_UNITS), y: Math.floor(point.y / CELL_UNITS) };
}

/** 지형 빠르기를 붙이고 조우 타이머를 켠다(세계가 준비된 뒤, DB가 있는 월드만) */
export function startCoordinateRules(
  world: CoordinateWorld,
  options: {
    readonly now: () => number;
    readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
    /** false면 타이머를 켜지 않는다(시험이 scan을 직접 부른다) */
    readonly timer?: boolean | undefined;
  },
): CoordinateRules | undefined {
  const persistence = world.persistence;
  if (!persistence) return undefined;
  const { travel } = persistence;
  const { now, log } = options;
  const society = (): SocietyCoefficients | undefined => persistence.facilities?.rules();
  const rules = (): EncounterCoefficients => society()?.encounter ?? START_ENCOUNTER;
  // 1. 지형 빠르기(행성 값이 없으면 1000, 이웃 행성 값으로 비탈)
  const paces = new Map<number, number>();
  travel.attachPace((mapKey) => {
    const known = paces.get(mapKey);
    if (known !== undefined) return known;
    if (paces.size >= PACE_CACHE_MAX) paces.clear();
    const terrain = world.terrain;
    const cell = terrain?.cellValues?.(mapKey);
    const neighbors = cell ? neighborMapKeys(mapKey).map((key) => terrain?.cellValues?.(key)) : [];
    const pace = coordPacePm(cell, neighbors);
    paces.set(mapKey, pace);
    return pace;
  });

  // 2. 조우
  const cooldown = new Map<string, number>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const counts = { scans: 0, scanMs: 0, contacts: 0, avoided: 0, battles: 0, safe: 0 };
  let busy = false;
  let stopped = false;

  const cooling = (key: string, at: number): boolean => {
    const until = cooldown.get(key);
    if (until === undefined) return false;
    if (at < until) return true;
    cooldown.delete(key);
    return false;
  };
  const rest = (key: string, at: number): void => {
    if (cooldown.size >= COOLDOWN_MAX)
      for (const [old, until] of cooldown) if (until <= at) cooldown.delete(old);
    cooldown.set(key, at + Math.max(0, rules().cooldownMs));
  };
  const atWar = (a: number, b: number): boolean => world.npc?.world.factions.get(a)?.wars.has(b) === true;

  /** 소유 주체가 플레이어(사용자 주체·플레이어 가문)인가 */
  const playerOwned = (ownerId: number): boolean => {
    const owner = persistence.owners.get(ownerId);
    if (!owner) return false;
    if (owner.userId !== null) return true;
    return owner.factionId !== null && world.npc?.world.factions.get(owner.factionId)?.player === true;
  };
  /** NPC 소유 주체의 공격 성향(그 세력 → 나라, 없으면 500) */
  const aggressionOf = (ownerId: number, nation: number): number => {
    const factionId = persistence.owners.get(ownerId)?.factionId ?? nation;
    const factions = world.npc?.world.factions;
    return factions?.get(factionId)?.traits?.aggression ?? factions?.get(nation)?.traits?.aggression ?? 500;
  };

  /** 편 하나의 판단 값. powers = 유닛 ID → 전력(없으면 유닛 수로 센다) */
  const viewOf = (
    side: readonly SideUnit[],
    nation: number,
    powers: ReadonlyMap<number, number> | undefined,
    carriers: ReadonlySet<number>,
  ): ClashSideView => {
    const deciders = side.filter((unit) => unit.decider);
    const npc = deciders.filter((unit) => !playerOwned(unit.ownerId));
    const aggression =
      npc.length === 0
        ? 500
        : Math.floor(npc.reduce((sum, unit) => sum + aggressionOf(unit.ownerId, nation), 0) / npc.length);
    let power = 0;
    for (const unit of side) power += powers?.get(unit.unitId) ?? 1000;
    return {
      deciders: deciders.length,
      player: deciders.length > 0 && npc.length === 0,
      aggression,
      power,
      carries: side.some((unit) => carriers.has(unit.unitId)),
    };
  };

  /** 띄운 2차맵 유닛의 전투 몸 전력(하나라도 몸을 못 만들면 undefined — 유닛 수로 센다) */
  const powersOf = (units: readonly SideUnit[], at: number): Map<number, number> | undefined => {
    const out = new Map<number, number>();
    for (const unit of units) {
      const spec = persistence.bodies.build(
        unit.unitId,
        {
          id: unit.unitId,
          side: 1,
          party: 1,
          x: 0,
          y: 0,
          moveIntervalMs: BATTLE_BASE_MOVE_MS,
          buildingMulPm: BUILDING_MUL_PM,
        },
        at,
      );
      if (!spec) return undefined;
      out.set(unit.unitId, clashPower(spec));
    }
    return out;
  };

  /** 두 편 판단. 싸움이 나면 만남, 아니면 쉬는 시간 */
  const judge = (
    mapKey: number,
    loaded: boolean,
    nations: readonly [number, number],
    sides: readonly [readonly SideUnit[], readonly SideUnit[]],
    at: number,
  ): Engagement | undefined => {
    const r = rules();
    const capped: [SideUnit[], SideUnit[]] = [
      sides[0].slice(0, Math.max(1, r.maxSideUnits)),
      sides[1].slice(0, Math.max(1, r.maxSideUnits)),
    ];
    const war = atWar(nations[0], nations[1]);
    const all = [...capped[0], ...capped[1]];
    const powers = loaded ? powersOf(all, at) : undefined;
    const carriers = war
      ? new Set<number>()
      : cargoCarriers(
          persistence.ledger,
          all.map((unit) => unit.unitId),
        );
    const resolution = resolveClash(
      viewOf(capped[0], nations[0], powers, carriers),
      viewOf(capped[1], nations[1], powers, carriers),
      war,
      r,
    );
    counts.contacts += 1;
    if (!resolution) {
      counts.avoided += 1;
      rest(pairKey(mapKey, nations[0], nations[1]), at);
      return undefined;
    }
    return { mapKey, loaded, nations, sides: capped, resolution, atWar: war };
  };

  /** ① 좌표 유닛 만남 */
  const coordinateEngagements = (
    at: number,
    nationOf: (ownerId: number) => number | undefined,
  ): Engagement[] => {
    const units = travel
      .coordinateUnits(null)
      .filter((unit) => DECIDER_KINDS.has(unit.kind) || unit.kind === UNIT_KIND_BOT);
    if (units.length < 2) return [];
    const out: Engagement[] = [];
    for (const group of groupEncounters(units, nationOf, (mapKey) => world.maps.has(mapKey))) {
      for (const [a, b] of sidePairs(group.sides)) {
        if (cooling(pairKey(group.mapKey, a.nation, b.nation), at)) continue;
        const side = (list: typeof a.units): SideUnit[] =>
          list.map((unit) => ({
            unitId: unit.unitId,
            ownerId: unit.ownerId,
            kind: unit.kind,
            decider: DECIDER_KINDS.has(unit.kind),
          }));
        const found = judge(group.mapKey, false, [a.nation, b.nation], [side(a.units), side(b.units)], at);
        if (found) {
          out.push(found);
          break;
        }
      }
    }
    return out;
  };

  /** ② 띄운 2차맵 만남 */
  const loadedEngagements = (at: number, nationOf: (ownerId: number) => number | undefined): Engagement[] => {
    const radius = Math.max(1, rules().radiusCells);
    const out: Engagement[] = [];
    for (const map of world.maps.values()) {
      const units: ClashUnit[] = [];
      const kinds = new Map<number, number>();
      let deciders = 0;
      map.forEachUnit((view) => {
        if (!PARTICIPANT_KINDS.has(view.kind) || view.aboard !== undefined) return;
        const nation = nationOf(view.ownerId);
        if (nation === undefined) return;
        const point = positionAt(view.motion, at);
        const decider = DECIDER_KINDS.has(view.kind) && view.job.job === JOB_NONE;
        if (decider) deciders += 1;
        kinds.set(view.id, view.kind);
        units.push({
          unitId: view.id,
          ownerId: view.ownerId,
          nation,
          x: Math.floor(point.x / CELL_UNITS),
          y: Math.floor(point.y / CELL_UNITS),
          decider,
        });
      });
      if (deciders === 0) continue;
      for (const contact of findClashes(units, radius)) {
        if (cooling(pairKey(map.mapKey, contact.nations[0], contact.nations[1]), at)) continue;
        // 움직일 수 없는 유닛(빨강 부상·포로)·물 위 유닛은 뺀다
        const side = (list: readonly ClashUnit[]): SideUnit[] =>
          list.flatMap((unit) => {
            const info = map.unitInfo(unit.unitId);
            if (!info || unavailable(info.condition, at) || isAfloat(info)) return [];
            return [
              {
                unitId: unit.unitId,
                ownerId: unit.ownerId,
                kind: kinds.get(unit.unitId) ?? 0,
                decider: unit.decider,
              },
            ];
          });
        const sides: [SideUnit[], SideUnit[]] = [side(contact.sides[0]), side(contact.sides[1])];
        if (sides[0].length === 0 || sides[1].length === 0) continue;
        const found = judge(map.mapKey, true, contact.nations, sides, at);
        if (found) {
          out.push(found);
          break;
        }
      }
    }
    return out;
  };

  /** 멈춘 길을 끝 시각 뒤에 다시 판단(1908) */
  const scheduleReconsider = (
    battleId: number,
    endsAt: number,
    trips: readonly HaltedTrip[],
    maxHp: Map<number, number>,
  ) => {
    if (trips.length === 0) return;
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        if (stopped) return;
        const catalog = persistence.facilities?.catalog();
        void reconsiderTrips(
          {
            maps: world.maps,
            travel,
            battle: (id) => persistence.battles.get(id),
            maxHp: (unitId) => maxHp.get(unitId),
            cargoGrams: (ownerId, unitId) =>
              catalog ? cargoGrams(persistence.ledger, catalog, ownerId, unitId) : 0n,
            capacityGrams: () => society()?.gatherObjects.carryGrams ?? 0,
            rules,
            now,
            log,
          },
          battleId,
          trips,
        ).catch((error: unknown) => log.error({ err: error, battleId }, "travel: after encounter failed"));
      },
      Math.max(0, endsAt + RECHECK_SLACK_MS - now()),
    );
    timer.unref();
    timers.add(timer);
  };

  const open = async (engagement: Engagement, at: number): Promise<boolean> => {
    const { mapKey, resolution } = engagement;
    const key = pairKey(mapKey, engagement.nations[0], engagement.nations[1]);
    rest(key, at);
    const r = rules();
    // 시가지(안전지대) 안에서는 싸우지 않는다(D-146·D-174). 좌표 조우는 같은 2차맵의 가운데로 본다
    const loadedMap = world.maps.get(mapKey);
    const probe = loadedMap
      ? encounterCenter(
          engagement.sides.map((side) => side.flatMap((unit) => cellOf(loadedMap, unit.unitId, at) ?? [])),
        )
      : { x: 128, y: 128 };
    const urban = await persistence.territory
      ?.urbanCity(loadedMap?.planetId ?? TEST_PLANET_ID, { mapKey, ...probe })
      .catch(() => null);
    if (urban !== undefined && urban !== null) {
      counts.safe += 1;
      return false;
    }
    const ids = new Set(engagement.sides.flatMap((side) => side.map((unit) => unit.unitId)));
    const trips = travel.haltOn(mapKey, ids);
    // 길이 없던 유닛(채집·서 있음)도 그 자리에 세운다(봇은 스스로 걷는다 — halt가 false)
    if (loadedMap) for (const id of ids) loadedMap.halt(id);
    // 띄우는 동안·결과를 적용할 때까지 내리지 않게
    travel.holdMap(mapKey, at + Math.max(0, r.cooldownMs));
    if (!loadedMap) {
      const opened = await persistence.spawn.open(mapKey);
      if (opened !== "ok") {
        log.info({ mapKey, opened }, "travel: encounter map could not be opened");
        return false;
      }
    }
    const map = world.maps.get(mapKey);
    if (!map) return false;
    // 공격 편이 편 1
    const ordered = resolution.attacker === 0 ? engagement.sides : [engagement.sides[1], engagement.sides[0]];
    const arenaSides: [ArenaUnit[], ArenaUnit[]] = [
      ordered[0].flatMap((unit) => cellOf(map, unit.unitId, at) ?? []),
      ordered[1].flatMap((unit) => cellOf(map, unit.unitId, at) ?? []),
    ];
    const terrain = (() => {
      try {
        return mapLayers(map);
      } catch {
        return null;
      }
    })();
    const mapCells = terrain?.size ?? Math.round(Math.sqrt(map.replicaInit().terrainCost.length));
    const size = arenaSizeOf(r.mapSize, mapCells);
    const origin = arenaOrigin(encounterCenter(arenaSides), size, mapCells);
    const buildings: { x: number; y: number; width: number; height: number }[] = [];
    map.forEachBuilding((building) => buildings.push(footprintRect(building.placement)));
    const init = buildEncounterInit({
      sides: arenaSides,
      map: encounterMap(terrain, mapCells, buildings, origin, size),
      origin,
      ownerOf: (unitId) => map.unitInfo(unitId)?.ownerId ?? 0,
      place: (unitId, spot) =>
        persistence.bodies.build(
          unitId,
          { id: unitId, ...spot, moveIntervalMs: BATTLE_BASE_MOVE_MS, buildingMulPm: BUILDING_MUL_PM },
          now(),
        ),
      seed: randomInt(0x1_0000_0000),
    });
    if (!init) {
      log.info({ mapKey }, "travel: encounter had no fighters");
      return false;
    }
    const battleId = await persistence.startBattle(init, engagement.atWar);
    const endsAt = (await persistence.battles.get(battleId))?.endsAtMs;
    if (endsAt !== undefined) {
      travel.holdMap(mapKey, endsAt + HOLD_SLACK_MS);
      scheduleReconsider(battleId, endsAt, trips, new Map(init.units.map((unit) => [unit.id, unit.maxHp])));
    }
    counts.battles += 1;
    log.info(
      {
        mapKey,
        battleId,
        loaded: engagement.loaded,
        nations: engagement.nations,
        choice: resolution.choice,
        choices: resolution.choices,
        war: engagement.atWar,
        units: init.units.length,
        origin,
        size,
      },
      "travel: encounter battle",
    );
    return true;
  };

  const scan = async (): Promise<number> => {
    if (busy || stopped || world.status().state !== "ready") return 0;
    busy = true;
    const started = performance.now();
    try {
      const at = now();
      // 한 틱 안 나라 찾기 캐시(가문·시민권을 주체마다 한 번)
      const nations = new Map<number, number | undefined>();
      const nationOf = (ownerId: number): number | undefined => {
        if (nations.has(ownerId)) return nations.get(ownerId);
        const nation = nationOfOwner(world, ownerId);
        nations.set(ownerId, nation);
        return nation;
      };
      const found = [...coordinateEngagements(at, nationOf), ...loadedEngagements(at, nationOf)];
      counts.scans += 1;
      counts.scanMs += performance.now() - started;
      let opened = 0;
      for (const engagement of found.slice(0, Math.max(1, rules().maxPerScan))) {
        if (stopped) break;
        try {
          if (await open(engagement, at)) opened += 1;
        } catch (error) {
          log.error({ err: error, mapKey: engagement.mapKey }, "travel: encounter failed");
        }
      }
      return opened;
    } finally {
      busy = false;
    }
  };

  let loop: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    if (stopped || options.timer === false) return;
    loop = setTimeout(
      () => {
        void scan().finally(arm);
      },
      Math.max(1000, rules().scanMs),
    );
    loop.unref();
  };
  arm();
  return {
    scan,
    takeMetrics() {
      const out = {
        encounterScans: counts.scans,
        encounterScanMs: Math.round(counts.scanMs * 10) / 10,
        encounterContacts: counts.contacts,
        encounterAvoided: counts.avoided,
        encounterBattles: counts.battles,
        encounterSafe: counts.safe,
      };
      counts.scans = 0;
      counts.scanMs = 0;
      counts.contacts = 0;
      counts.avoided = 0;
      counts.battles = 0;
      counts.safe = 0;
      return out;
    },
    stop() {
      stopped = true;
      if (loop) clearTimeout(loop);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      travel.attachPace(undefined);
    },
  };
}
