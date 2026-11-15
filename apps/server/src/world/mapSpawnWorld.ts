// 그때 띄우기를 세계에 잇기 — docs/adr/2026-11-07-play-flow.md "WP15". world.ts(1,000줄 상한)는 이 함수를 한 번 부른다.
// 설정 칸(세력·사회 계수표 worldSeed: map_spawn_max_loaded·map_spawn_idle_ms, 모두 [임시])은 띄울 때·살필 때마다 읽는다(실효 값).
// 옆 2차맵 미리 띄우기·경계 너머 시야(edgeWatch.ts, docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)")도 여기서 잇는다: 2차맵 고리
// (mapFactory attachEdge), 붙잡음(변 가까운 플레이어 유닛), 1분마다 다시 보기. 설정 칸 map_preopen_cells·map_preopen_idle_ms([임시]) —
// map_preopen_cells는 켤 때와 1분마다 읽어 둔다(바꾸면 1분 안에 걸린다).
// 좌표 유닛(docs/adr/2026-11-15-unloaded-second-maps.md): 띄울 때 DB 행 + 이동 서비스의 좌표 유닛 장부(이동 서비스가 든 유닛은 DB 행을 버린다),
// 내릴 때 쉬는 유닛을 좌표 유닛으로, 변 미리 띄우기는 주인이 그 2차맵을 볼 때만(시야 묶음 또는 전체 보기 구독).
import type { SocietyCoefficients } from "@terra/sim";
import type { TravelService } from "../travel/service.ts";
import type { CityRow } from "./cities.ts";
import { createEdgeWatch } from "./edgeWatch.ts";
import type { MapFactory } from "./mapFactory.ts";
import { type MapSpawner, cityOnMap, createMapSpawner, sameLevelAs } from "./mapSpawn.ts";
import type { PathService } from "./pathService.ts";
import { type OwnerRow, type QueryPool, loadMapRows } from "./persist/load.ts";
import type { SecondMap } from "./secondMap.ts";

export { type MapSpawner, bootExtraMaps, sameLevelAs } from "./mapSpawn.ts";

export function attachMapSpawn(parts: {
  readonly maps: Map<number, SecondMap>;
  readonly factory: MapFactory;
  readonly paths: PathService;
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly travel: TravelService;
  /** 소유 주체(플레이어 유닛만 미리 띄우기·경계 너머 시야를 낸다) */
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly cities: () => readonly CityRow[];
  readonly npc: () =>
    | { readonly places: ReadonlyMap<number, { readonly planetId: string; readonly mapKey: number }> }
    | undefined;
  readonly rules: () => Pick<SocietyCoefficients, "worldSeed">;
  /** 부팅이 함께 띄운 플레이어 2차맵(bootExtraMaps) */
  readonly extraKeys: readonly number[];
  /** 같은 면 레벨 견본(시험 2차맵 하나) */
  readonly sample: number;
  readonly now: () => number;
  readonly log: { info(obj: object, message: string): void; error(obj: object, message: string): void };
}): MapSpawner {
  const { travel, planetId } = parts;
  const seed = () => parts.rules().worldSeed;
  const isMapKey = sameLevelAs(parts.sample);
  // 미리 띄우기는 아래 spawner가 선 뒤에 부른다(유닛이 움직일 때 — 부팅 색인은 띄우지 않는다)
  const relay: { openEarly?: (mapKey: number) => void } = {};
  let preopenCells = seed().mapPreopenCells;
  const edge = createEdgeWatch({
    maps: parts.maps,
    isPlayer: (ownerId) => (parts.owners.get(ownerId)?.userId ?? null) !== null,
    // 유닛이 움직일 때마다 계수표를 읽지 않는다(사이보그 만들기 등 한 명령 안에서 설정 칸을 한 벌만 읽는다 — cyborgTuning.db.test.ts):
    // 켤 때와 1분마다(살피기 뒤) 읽어 둔 값을 쓴다
    preopenCells: () => preopenCells,
    canOpen: (mapKey) => !parts.maps.has(mapKey) && isMapKey(mapKey),
    openEarly: (mapKey) => relay.openEarly?.(mapKey),
    watching: (mapKey, ownerId) => {
      const map = parts.maps.get(mapKey);
      return map !== undefined && (map.vision.watchedBy(ownerId) || map.stream.subscriberCount > 0);
    },
  });
  /** 다른 띄운 2차맵에 이미 선 유닛인가(쓰기 대기열이 늦어 DB 행이 옛 2차맵을 가리킬 때 두 곳에 서지 않게) */
  const elsewhere = (unitId: number, mapKey: number): boolean => {
    for (const [key, map] of parts.maps) if (key !== mapKey && map.unitInfo(unitId)) return true;
    return false;
  };
  const spawner = createMapSpawner({
    maps: parts.maps,
    factory: parts.factory,
    paths: parts.paths,
    isMapKey,
    rows: async (mapKey, map) => {
      const stored = await loadMapRows(parts.pool, planetId, mapKey);
      const units = stored.units.filter((row) => !travel.carries(row.id) && !elsewhere(row.id, mapKey));
      return { units: [...units, ...travel.claim(mapKey, map)], buildings: stored.buildings };
    },
    parkable: (map) => travel.parkable(map),
    park: (map) => travel.parkAll(map),
    holds: (mapKey) =>
      travel.touches(mapKey) ||
      cityOnMap(parts.cities(), parts.npc()?.places, planetId, mapKey) ||
      edge.holds(mapKey, parts.now()),
    rules: () => ({
      maxLoaded: seed().mapSpawnMaxLoaded,
      idleMs: seed().mapSpawnIdleMs,
      preopenIdleMs: seed().mapPreopenIdleMs,
    }),
    afterSweep: () => {
      preopenCells = seed().mapPreopenCells;
      edge.reconcile(parts.now());
    },
    now: parts.now,
    log: parts.log,
  });
  relay.openEarly = (mapKey) => void spawner.openEarly(mapKey);
  spawner.adopt(parts.extraKeys);
  travel.attachSpawn(spawner);
  edge.seed(parts.maps.values());
  parts.factory.attachEdge?.(edge);
  spawner.start();
  // 1분 지표에 변 가까운 유닛 수·미리 띄우기를 부른 수를 더한다(world.ts는 그대로 spawn.takeMetrics를 부른다)
  return {
    ...spawner,
    takeMetrics: () => ({ ...spawner.takeMetrics(), ...edge.takeMetrics(), ...travel.takeMetrics() }),
    // 누가 그 2차맵을 보기 시작하면 그 2차맵 변 가까운 유닛의 이웃을 바로 미리 띄운다(주인이 볼 때만 — 1분 다시 보기를 기다리지 않는다)
    viewed: (mapKey) => {
      edge.reconcile(parts.now(), mapKey);
    },
  };
}

/** 보는 사람이 띄우기(viewOpen.ts)에 넘길 것 — 월드 저장 층에서(없으면 띄우지 않는다) */
export function viewPartsOf(
  persistence:
    | {
        readonly spawn: MapSpawner;
        readonly travel: TravelService;
        readonly settlement: { findOwnerOfUser(userId: string): number | undefined };
      }
    | undefined,
) {
  return {
    spawn: persistence?.spawn,
    travel: persistence?.travel,
    ownerOfUser: (userId: string) => persistence?.settlement.findOwnerOfUser(userId),
  };
}
