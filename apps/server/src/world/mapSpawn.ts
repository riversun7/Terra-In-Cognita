// 옆 2차맵을 그때 띄우기 — 기획 답 730 다(D-523 포인터), docs/adr/2026-11-07-play-flow.md "WP15 (2026-11-08) 옆 2차맵을 그때 띄우기".
// - 띄우기(open): 이동 서비스가 길의 마지막 2차맵(목적지)에 들어서려 할 때 부른다(travel/service.ts). 지형(mapFactory.ts: 고정본 → 지형 캐시
//   → 생성기 워커, 메인 스레드는 기다리기만 한다) → DB에 남아 있던 그 2차맵 유닛·건물 행을 놓고 → 띄운 2차맵 목록(maps)에 넣고 → 경로 워커에
//   사본을 더한다. 같은 2차맵을 함께 부르면 한 번만 만든다. 그 뒤로는 부팅 때 띄운 2차맵과 같다(구독·시야·탐사·다른 사람의 이동).
// - 상한: 그때 띄운 2차맵 수 ≤ 설정 칸 map_spawn_max_loaded([임시]). 꽉 찼으면 지금 비어 있는 그때 띄운 2차맵 가운데 가장 오래 빈 것을
//   내리고 띄운다. 비운 것이 없으면 full(이동은 map_full로 멈춘다, 확인 단계는 map_full).
// - 내리기(sweep, 1분마다): 그때 띄운 2차맵이 비어 있은 지 설정 칸 map_spawn_idle_ms가 넘으면 내린다. "비어 있음" = 유닛 0(플레이어
//   유닛만이 아니라 모든 유닛 — 그때 띄운 2차맵에는 봇·NPC 휴먼이 서지 않는다), 건물 0, 도시·폐허 없음, 구독(시야·전체 보기) 없음, 이 2차맵에
//   서거나 노리는 이동 없음(holds). 전투는 참가 유닛·건물이 2차맵에 남은 채 도는 인스턴스라 유닛·건물이 0이면 그 2차맵의 전투도 없다.
//   부팅 씨앗 2차맵(시험 줄·도시)은 내리지 않는다.
// - 다시 켜면: 플레이어 유닛·건물이 선 2차맵을 부팅이 함께 띄운다(bootExtraMaps — 유닛·건물 행의 map_key가 저장이다, 새 표 없음). 그 2차맵도
//   그때 띄운 2차맵으로 세어 비면 내린다.
import { performance } from "node:perf_hooks";
import { decodeCellKey, isCellKey } from "@terra/planet";
import type { MapFactory } from "./mapFactory.ts";
import type { PathService } from "./pathService.ts";
import type { OwnerRow } from "./persist/load.ts";
import type { BuildingRow, SecondMap, UnitRow } from "./secondMap.ts";

/** 비운 2차맵을 살피는 간격(ms) */
export const SPAWN_SWEEP_MS = 60_000;

/** 설정 칸 실효 값(세력·사회 계수표 worldSeed 칸) */
export interface MapSpawnRules {
  /** 그때 띄운 2차맵 상한(부팅 씨앗 2차맵은 세지 않는다) */
  readonly maxLoaded: number;
  /** 비어 있은 지 이만큼(ms) 지나면 내린다 */
  readonly idleMs: number;
}

/** 띄우기 결과: ok 띄움(이미 있었음 포함), full 상한(비운 것도 없음), invalid 이 행성의 2차맵 키가 아님, failed 지형·DB 오류 */
export type OpenOutcome = "ok" | "full" | "invalid" | "failed";

export interface MapSpawner {
  /** 그때 띄울 수 있는 2차맵인가(이 행성의 2차맵 키이고 아직 띄우지 않음) */
  canOpen(mapKey: number): boolean;
  /** 하나 더 띄울 자리가 있나(상한 아래이거나 지금 내릴 수 있는 빈 2차맵이 있다) */
  hasRoom(): boolean;
  open(mapKey: number): Promise<OpenOutcome>;
  /** 곧 띄울 2차맵의 지형을 미리 받아 둔다(보내기 때 — 닿을 때는 캐시에서) */
  prefetch(mapKey: number): void;
  /** 부팅이 함께 띄운 플레이어 2차맵을 그때 띄운 2차맵으로 센다(비면 내린다) */
  adopt(mapKeys: readonly number[]): void;
  /** 오래 빈 그때 띄운 2차맵을 내린다. 내린 수 */
  sweep(): number;
  /** 그때 띄운 2차맵 키 */
  readonly onDemand: ReadonlySet<number>;
  takeMetrics(): Record<string, number>;
  start(): void;
  stop(): void;
}

export interface MapSpawnDeps {
  readonly maps: Map<number, SecondMap>;
  readonly factory: MapFactory;
  readonly paths: PathService;
  /** 이 행성의 2차맵 키인가(셀 키·면 레벨) */
  isMapKey(mapKey: number): boolean;
  /** DB에 남아 있던 그 2차맵의 유닛·건물 행(없으면 빈 2차맵) */
  readonly rows?: ((mapKey: number) => Promise<{ units: UnitRow[]; buildings: BuildingRow[] }>) | undefined;
  /** 내리면 안 되는 까닭이 있나(도시·폐허, 이 2차맵에 서거나 노리는 이동) */
  holds(mapKey: number): boolean;
  rules(): MapSpawnRules;
  readonly now: () => number;
  readonly log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
}

/** 같은 면 레벨의 셀 키만(시험 2차맵 하나를 견본으로) */
export function sameLevelAs(sample: number): (mapKey: number) => boolean {
  const level = isCellKey(sample) ? decodeCellKey(sample).level : -1;
  return (mapKey) => isCellKey(mapKey) && decodeCellKey(mapKey).level === level;
}

/**
 * 부팅이 씨앗 2차맵에 더해 띄울 2차맵: 플레이어(사용자) 유닛이나 건물이 선 이 행성의 2차맵(그때 띄웠다가 서버가 다시 켜졌다). 키 차례
 */
export function bootExtraMaps(
  loaded: {
    readonly owners: readonly OwnerRow[];
    readonly units: readonly Pick<UnitRow, "ownerId" | "mapKey" | "planetId">[];
    readonly buildings: readonly Pick<BuildingRow, "mapKey" | "planetId">[];
  },
  seeded: readonly number[],
  planetId: string,
  isMapKey: (mapKey: number) => boolean,
): number[] {
  const players = new Set(loaded.owners.filter((owner) => owner.userId !== null).map((owner) => owner.id));
  const known = new Set(seeded);
  const extra = new Set<number>();
  const consider = (mapKey: number) => {
    if (!known.has(mapKey) && isMapKey(mapKey)) extra.add(mapKey);
  };
  for (const unit of loaded.units)
    if (unit.planetId === planetId && players.has(unit.ownerId)) consider(unit.mapKey);
  for (const building of loaded.buildings) if (building.planetId === planetId) consider(building.mapKey);
  return [...extra].toSorted((a, b) => a - b);
}

/** 그 2차맵에 도시·폐허 자리가 있나(부팅 때 읽은 도시 + NPC 런타임 자리 — 폐허도 자리에 남는다) */
export function cityOnMap(
  boot: readonly { readonly planetId: string; readonly mapKey: number }[],
  live: ReadonlyMap<number, { readonly planetId: string; readonly mapKey: number }> | undefined,
  planetId: string,
  mapKey: number,
): boolean {
  for (const city of boot) if (city.planetId === planetId && city.mapKey === mapKey) return true;
  for (const place of live?.values() ?? [])
    if (place.planetId === planetId && place.mapKey === mapKey) return true;
  return false;
}

export function createMapSpawner(deps: MapSpawnDeps): MapSpawner {
  const { maps, factory, paths, now, log } = deps;
  const onDemand = new Set<number>();
  const opening = new Map<number, Promise<OpenOutcome>>();
  /** 비어 있음을 처음 본 시각(그때 띄운 2차맵만) */
  const emptySince = new Map<number, number>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let counts = { opened: 0, closed: 0, refused: 0, failed: 0, openMsMax: 0 };

  const rules = (): MapSpawnRules => {
    const read = deps.rules();
    return { maxLoaded: Math.max(0, Math.trunc(read.maxLoaded)), idleMs: Math.max(0, read.idleMs) };
  };

  const isEmpty = (mapKey: number): boolean => {
    const map = maps.get(mapKey);
    if (!map || opening.has(mapKey)) return false;
    if (map.gauges().units > 0 || map.stream.subscriberCount > 0 || map.vision.groupCount > 0) return false;
    let buildings = 0;
    map.forEachBuilding(() => {
      buildings += 1;
    });
    return buildings === 0 && !deps.holds(mapKey);
  };

  /** 지금 내릴 수 있는 빈 그때 띄운 2차맵(가장 오래 빈 것부터) */
  const evictable = (): number[] => {
    const at = now();
    return [...onDemand]
      .filter(isEmpty)
      .toSorted((a, b) => (emptySince.get(a) ?? at) - (emptySince.get(b) ?? at) || a - b);
  };

  const unload = (mapKey: number, reason: "idle" | "room"): void => {
    const map = maps.get(mapKey);
    if (!map) return;
    maps.delete(mapKey);
    onDemand.delete(mapKey);
    emptySince.delete(mapKey);
    paths.drop(mapKey);
    map.stop();
    counts.closed += 1;
    log.info({ mapKey, reason, loaded: maps.size, onDemand: onDemand.size }, "second map closed");
  };

  const build = async (mapKey: number): Promise<OpenOutcome> => {
    const started = performance.now();
    const { map, source } = await factory.build(mapKey);
    const rows = (await deps.rows?.(mapKey)) ?? { units: [], buildings: [] };
    if (stopped || maps.has(mapKey)) {
      map.stop();
      return stopped ? "failed" : "ok";
    }
    // 행을 놓은 뒤에 목록·경로 사본에 넣는다(놓을 때의 격자 편집은 사본이 없어 건너뛰고, 사본은 놓인 건물을 담아 만든다)
    const restored = map.restore(rows.units, rows.buildings);
    maps.set(mapKey, map);
    onDemand.add(mapKey);
    emptySince.set(mapKey, now());
    paths.add(map.replicaInit());
    factory.prefetchAround([mapKey]);
    const ms = Math.round(performance.now() - started);
    counts.opened += 1;
    counts.openMsMax = Math.max(counts.openMsMax, ms);
    log.info(
      {
        mapKey,
        ms,
        source,
        units: rows.units.length - restored.badUnits.length,
        buildings: rows.buildings.length - restored.badBuildings.length,
        loaded: maps.size,
        onDemand: onDemand.size,
      },
      "second map opened on demand",
    );
    return "ok";
  };

  const sweep = (): number => {
    if (stopped) return 0;
    const { idleMs } = rules();
    const at = now();
    let closed = 0;
    // 도는 중에 지금 항목을 지워도 된다(Set 순회는 지운 항목을 건너뛴다)
    for (const mapKey of onDemand) {
      if (!isEmpty(mapKey)) {
        emptySince.delete(mapKey);
        continue;
      }
      const since = emptySince.get(mapKey);
      if (since === undefined) emptySince.set(mapKey, at);
      else if (at - since >= idleMs) {
        unload(mapKey, "idle");
        closed += 1;
      }
    }
    return closed;
  };

  return {
    canOpen: (mapKey) => !maps.has(mapKey) && deps.isMapKey(mapKey),
    hasRoom: () => onDemand.size + opening.size < rules().maxLoaded || evictable().length > 0,
    open(mapKey) {
      if (maps.has(mapKey)) return Promise.resolve("ok");
      if (stopped || !deps.isMapKey(mapKey)) return Promise.resolve("invalid");
      const pending = opening.get(mapKey);
      if (pending) return pending;
      if (onDemand.size + opening.size >= rules().maxLoaded) {
        const spare = evictable()[0];
        if (spare === undefined) {
          counts.refused += 1;
          log.info({ mapKey, onDemand: onDemand.size }, "second map not opened: on-demand maps are full");
          return Promise.resolve("full");
        }
        unload(spare, "room");
      }
      const run = build(mapKey)
        .catch((error: unknown) => {
          counts.failed += 1;
          log.error({ err: error, mapKey }, "second map could not be opened");
          return "failed" as const;
        })
        .finally(() => opening.delete(mapKey));
      opening.set(mapKey, run);
      return run;
    },
    prefetch(mapKey) {
      if (!maps.has(mapKey) && deps.isMapKey(mapKey)) factory.prefetch(mapKey);
    },
    adopt(mapKeys) {
      const at = now();
      for (const mapKey of mapKeys) {
        if (!maps.has(mapKey)) continue;
        onDemand.add(mapKey);
        emptySince.set(mapKey, at);
      }
    },
    sweep,
    onDemand,
    takeMetrics() {
      const out = { mapsOnDemand: onDemand.size, mapOpens: counts.opened, mapCloses: counts.closed };
      const extra = {
        ...(counts.refused > 0 ? { mapOpenRefused: counts.refused } : {}),
        ...(counts.failed > 0 ? { mapOpenFailed: counts.failed } : {}),
        ...(counts.opened > 0 ? { mapOpenMsMax: counts.openMsMax } : {}),
      };
      counts = { opened: 0, closed: 0, refused: 0, failed: 0, openMsMax: 0 };
      return { ...out, ...extra };
    },
    start() {
      if (timer || stopped) return;
      timer = setInterval(sweep, SPAWN_SWEEP_MS);
      timer.unref();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
