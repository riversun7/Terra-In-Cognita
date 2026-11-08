// 그때 띄우기를 세계에 잇기 — docs/adr/2026-11-07-play-flow.md "WP15". world.ts(1,000줄 상한)는 이 함수를 한 번 부른다.
// 설정 칸(세력·사회 계수표 worldSeed: map_spawn_max_loaded·map_spawn_idle_ms, 모두 [임시])은 띄울 때·살필 때마다 읽는다(실효 값).
import type { SocietyCoefficients } from "@terra/sim";
import type { TravelService } from "../travel/service.ts";
import type { CityRow } from "./cities.ts";
import type { MapFactory } from "./mapFactory.ts";
import { type MapSpawner, cityOnMap, createMapSpawner, sameLevelAs } from "./mapSpawn.ts";
import type { PathService } from "./pathService.ts";
import { type QueryPool, loadMapRows } from "./persist/load.ts";
import type { SecondMap } from "./secondMap.ts";

export { type MapSpawner, bootExtraMaps, sameLevelAs } from "./mapSpawn.ts";

export function attachMapSpawn(parts: {
  readonly maps: Map<number, SecondMap>;
  readonly factory: MapFactory;
  readonly paths: PathService;
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly travel: TravelService;
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
  const spawner = createMapSpawner({
    maps: parts.maps,
    factory: parts.factory,
    paths: parts.paths,
    isMapKey: sameLevelAs(parts.sample),
    rows: (mapKey) => loadMapRows(parts.pool, planetId, mapKey),
    holds: (mapKey) =>
      travel.touches(mapKey) || cityOnMap(parts.cities(), parts.npc()?.places, planetId, mapKey),
    rules: () => {
      const seed = parts.rules().worldSeed;
      return { maxLoaded: seed.mapSpawnMaxLoaded, idleMs: seed.mapSpawnIdleMs };
    },
    now: parts.now,
    log: parts.log,
  });
  spawner.adopt(parts.extraKeys);
  travel.attachSpawn(spawner);
  spawner.start();
  return spawner;
}
