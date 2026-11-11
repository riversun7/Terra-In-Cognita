// 그때 띄우기를 세계에 잇기 — docs/adr/2026-11-07-play-flow.md "WP15". world.ts(1,000줄 상한)는 이 함수를 한 번 부른다.
// 설정 칸(세력·사회 계수표 worldSeed: map_spawn_max_loaded·map_spawn_idle_ms, 모두 [임시])은 띄울 때·살필 때마다 읽는다(실효 값).
// 옆 2차맵 미리 띄우기·경계 너머 시야(edgeWatch.ts, docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)")도 여기서 잇는다: 2차맵 고리
// (mapFactory attachEdge), 붙잡음(변 가까운 플레이어 유닛), 1분마다 다시 보기. 설정 칸 map_preopen_cells·map_preopen_idle_ms([임시]) —
// map_preopen_cells는 켤 때와 1분마다 읽어 둔다(바꾸면 1분 안에 걸린다).
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
  });
  const spawner = createMapSpawner({
    maps: parts.maps,
    factory: parts.factory,
    paths: parts.paths,
    isMapKey,
    rows: (mapKey) => loadMapRows(parts.pool, planetId, mapKey),
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
  return { ...spawner, takeMetrics: () => ({ ...spawner.takeMetrics(), ...edge.takeMetrics() }) };
}
