// 2차맵 만들기(지형 → 서버 2차맵) — 부팅(띄울 2차맵 모두)과 그때 띄우기(mapSpawn.ts, docs/adr/2026-11-07-play-flow.md "WP15")가 같이 쓴다.
// world.ts(1,000줄 상한)에서 옮겼다. 지형 찾는 차례: 고정본(second_map_pins) → 지형 서비스(메모리 → 디스크 캐시 → 생성기, 워커).
// 지형 서비스가 없으면 S1 임시 지형(시험·행성 서비스 없는 서버).
import { gunzipSync } from "node:zlib";
import { isCellKey, stepCell } from "@terra/planet";
import { generateTempTerrain, seedFromCellKey } from "@terra/sim";
import { type MapTerrain, mapTerrainFromBuilt, mapTerrainFromTemp, terrainFromFile } from "./mapTerrain.ts";
import type { PathService } from "./pathService.ts";
import type { QueryPool } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import { type MapPin, loadPins, savePin } from "./pins.ts";
import { type MapLog, type MapPersist, type SecondMap, createSecondMap } from "./secondMap.ts";
import type { TerrainService } from "./terrainService.ts";
import type { BotFatigueAccess } from "./bots.ts";
import type { EdgeHooks } from "./edgeWatch.ts";
import type { WalkUnit } from "./walkSpeed.ts";
import type { ExploredStore } from "./vision.ts";
import type { WorldStats } from "./worldStats.ts";

export interface MapFactoryLog extends MapLog {
  info(obj: object, message: string): void;
}

export interface MapFactoryParts {
  /** 띄운 2차맵(createMaps가 넣는다 — 그때 띄우기는 행을 놓은 뒤 스스로 넣는다) */
  readonly maps: Map<number, SecondMap>;
  readonly paths: PathService;
  readonly terrain: TerrainService | undefined;
  readonly now: () => number;
  readonly stats: WorldStats;
  readonly log: MapFactoryLog;
  readonly planetId: string;
}

/** 저장이 켜진 세계의 고리(부팅이 DB를 읽은 뒤 잇는다). 없으면 메모리에만 */
export interface MapFactoryStore {
  readonly persist: MapPersist;
  readonly ids: { readonly unit: () => number; readonly building: () => number };
  /** 시험 봇의 소유 주체(시험 NPC 세력) */
  readonly botOwnerId: number;
  readonly explored: (mapKey: number) => ExploredStore;
  readonly db: QueryPool;
}

export interface MapFactory {
  attach(store: MapFactoryStore): void;
  /** 2차맵들을 만들어 maps에 넣고(부팅 — 경로 서비스 start 전) 둘레 이웃 지형을 미리 받는다 */
  createMaps(mapKeys: readonly number[]): Promise<void>;
  /** 2차맵 하나를 만든다(maps에 넣지 않는다). 지형 출처도 돌려준다(잰 값) */
  build(mapKey: number): Promise<{ map: SecondMap; source: "pin" | "memory" | "service" | "temp" }>;
  /** 그 2차맵들 둘레 8장 가운데 띄우지 않은 것의 지형을 미리 받는다(경계 너머 보기·넘기) */
  prefetchAround(mapKeys: readonly number[]): void;
  /** 그 2차맵 하나의 지형을 미리 받는다(그때 띄울 목적지) */
  prefetch(mapKey: number): void;
  /** 변 가까운 유닛 고리를 잇는다(edgeWatch.ts — 이미 만든 2차맵도 이것을 부른다). 없으면 없음 */
  attachEdge?(hooks: EdgeHooks): void;
  /** 걷기 빠르기 고리를 잇는다(D-540 실효 AGI, walkSpeed.ts — 이미 만든 2차맵도 이것을 부른다). 없으면 유닛 speed 그대로 */
  attachWalk?(speedOf: (unit: WalkUnit) => number): void;
  /** NPC 일꾼 상태 기반 피로 고리를 잇는다(npc/npcFatigue.ts — 이미 만든 2차맵도 이것을 부른다) */
  attachBotFatigue?(access: BotFatigueAccess): void;
}

export function createMapFactory(parts: MapFactoryParts): MapFactory {
  const { maps, paths, terrain: terrainService, now, stats, log, planetId } = parts;
  let store: MapFactoryStore | undefined;
  let edgeHooks: EdgeHooks | undefined;
  /** 2차맵마다 넘기는 고리(잇기 전에 만든 2차맵도 이은 뒤에는 그 고리를 부른다) */
  const edge: EdgeHooks = {
    moved: (mapKey, unit) => edgeHooks?.moved(mapKey, unit),
    sight: (mapKey, at) => edgeHooks?.sight(mapKey, at) ?? [],
  };
  let walkOf: ((unit: WalkUnit) => number) | undefined;
  const walkSpeed = (unit: WalkUnit): number => walkOf?.(unit) ?? unit.speed;
  let fatigueAccess: BotFatigueAccess | undefined;
  const botFatigue: BotFatigueAccess = {
    snapshot: (unitId, nowMs) => fatigueAccess?.snapshot(unitId, nowMs),
    commitState: (unitId, state, nowMs) => fatigueAccess?.commitState?.(unitId, state, nowMs),
  };

  /** 2차맵 지형: 고정본 → 지형 서비스(캐시 → 생성기). 지형 서비스가 없으면 S1 임시 지형 */
  const terrainFor = async (
    mapKey: number,
    pins: ReadonlyMap<number, MapPin>,
  ): Promise<{ terrain: MapTerrain; source: "pin" | "memory" | "service" | "temp" }> => {
    if (!terrainService) {
      return {
        terrain: mapTerrainFromTemp(mapKey, generateTempTerrain(seedFromCellKey(mapKey))),
        source: "temp",
      };
    }
    const pin = pins.get(mapKey);
    if (pin) {
      try {
        return {
          terrain: mapTerrainFromBuilt(
            terrainFromFile(mapKey, pin.terrainVersion, pin.tctrGzip, gunzipSync, terrainService.slowByArt),
          ),
          source: "pin",
        };
      } catch (error) {
        // 고정본이 틀리면 생성기로 만든다(고정본은 그대로 두고 알린다: 사람이 본다)
        log.error({ err: error, mapKey }, "second map pin does not decode, generating instead");
      }
    }
    const warm = terrainService.peek(mapKey);
    if (warm) return { terrain: warm, source: "memory" };
    return { terrain: await terrainService.get(mapKey), source: "service" };
  };

  /** 처음 손댄 2차맵의 지금 지형을 고정본으로 쓴다(행성 값 2차맵만. S1 임시 지형은 고정하지 않는다) */
  const pinner = (db: QueryPool, mapKey: number) => (): void => {
    const map = maps.get(mapKey);
    if (!terrainService || !map) return;
    const pin = { mapKey, terrainVersion: map.terrainVersion, tctrGzip: map.terrainFile().gzip };
    savePin(db, planetId, pin, now())
      .then(() => log.info({ mapKey, terrainVersion: pin.terrainVersion }, "second map pinned"))
      .catch((error: unknown) => log.warn({ err: error, mapKey }, "second map pin failed"));
  };

  const pinsOf = async (mapKeys: readonly number[]): Promise<Map<number, MapPin>> =>
    store && terrainService ? loadPins(store.db, planetId, mapKeys) : new Map<number, MapPin>();

  const make = (mapKey: number, terrain: MapTerrain, pinned: boolean): SecondMap =>
    createSecondMap({
      mapKey,
      terrain,
      paths,
      now,
      stats,
      log,
      persist: store?.persist,
      planetId,
      explored: store?.explored(mapKey),
      botOwnerId: store?.botOwnerId ?? 0,
      allocateUnitId: store?.ids.unit,
      allocateBuildingId: store?.ids.building,
      onFirstEdit: pinned || !store ? undefined : pinner(store.db, mapKey),
      edge,
      walkSpeed,
      botFatigue,
    });

  const prefetchAround = (mapKeys: readonly number[]): void => {
    if (!terrainService) return;
    const neighbours = new Set<number>();
    for (const mapKey of mapKeys) {
      if (!isCellKey(mapKey)) continue;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const next = stepCell(mapKey, di, dj);
          if (next !== null && !maps.has(next)) neighbours.add(next);
        }
      }
    }
    terrainService.prefetch([...neighbours]);
  };

  return {
    attach(next) {
      store = next;
    },
    attachEdge(hooks) {
      edgeHooks = hooks;
    },
    attachWalk(speedOf) {
      walkOf = speedOf;
    },
    attachBotFatigue(access) {
      fatigueAccess = access;
    },
    async createMaps(mapKeys) {
      const pins = await pinsOf(mapKeys);
      const terrains = await Promise.all(mapKeys.map((mapKey) => terrainFor(mapKey, pins)));
      for (const [index, mapKey] of mapKeys.entries()) {
        const found = terrains[index];
        if (found) maps.set(mapKey, make(mapKey, found.terrain, pins.has(mapKey)));
      }
      prefetchAround(mapKeys);
    },
    async build(mapKey) {
      const pins = await pinsOf([mapKey]);
      const found = await terrainFor(mapKey, pins);
      return { map: make(mapKey, found.terrain, pins.has(mapKey)), source: found.source };
    },
    prefetchAround,
    prefetch(mapKey) {
      terrainService?.prefetch([mapKey]);
    },
  };
}

/** 탐사 기록 저장: 구독할 때 읽고, 시야 틱이 바뀐 것을 쓰기 대기열로 쓴다 */
export function exploredStoreOf(
  db: QueryPool,
  writer: WorldWriter,
  planetId: string,
  now: () => number,
): (mapKey: number) => ExploredStore {
  return (mapKey) => ({
    async load(userId) {
      const found = await db.query(
        `select cells from world_exploration where user_id = $1 and map_key = $2 and planet_id = $3`,
        [userId, mapKey, planetId],
      );
      const cells = found.rows[0]?.cells;
      return cells instanceof Uint8Array ? new Uint8Array(cells) : null;
    },
    save(userId, bits) {
      writer.upsert("exploration", {
        user_id: userId,
        map_key: mapKey,
        planet_id: planetId,
        cells: Buffer.from(bits),
        updated_at_ms: now(),
      });
    },
  });
}
