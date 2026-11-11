// 운영자 콘솔의 행성별 합(docs/adr/2026-11-11-planet-scope.md) — 현황 탭 행성별 표와 1분 지표의 행성 줄이 쓴다.
// 2차맵·유닛은 메모리 월드(2차맵마다 planetId), 도시·휴먼·건물·오염·웨이브는 DB(planet_id 칸)에서 센다. 읽기만 한다.
import type { OpsPlanetTotals } from "@terra/shared/ops";
import { isPlayablePlanet, playablePlanets } from "../world/playablePlanets.ts";
import type { World } from "../world/world.ts";
import type { OpsQueryable } from "./access.ts";

export interface PlanetGauges {
  planetId: string;
  maps: number;
  units: number;
  moving: number;
  /** 2차맵 구독(보는 연결) 수 */
  subscribers: number;
}

/** 메모리 월드의 2차맵을 행성마다 묶은 합. 플레이 행성은 2차맵이 없어도 0으로 든다(목록 차례) */
export function planetGaugesOf(world: World | undefined): PlanetGauges[] {
  const byPlanet = new Map<string, PlanetGauges>();
  const rowOf = (planetId: string): PlanetGauges => {
    let row = byPlanet.get(planetId);
    if (!row) {
      row = { planetId, maps: 0, units: 0, moving: 0, subscribers: 0 };
      byPlanet.set(planetId, row);
    }
    return row;
  };
  for (const planet of playablePlanets()) rowOf(planet.id);
  if (world)
    for (const map of world.maps.values()) {
      const row = rowOf(map.planetId);
      const gauges = map.gauges();
      row.maps += 1;
      row.units += gauges.units;
      row.moving += gauges.moving;
      row.subscribers += map.stream.subscriberCount;
    }
  return [...byPlanet.values()];
}

type CountKind = "cities" | "humans" | "buildings" | "pollution" | "waves";

/** 행성마다 DB 수(한 질의). 줄이 없는 행성은 결과에 없다 */
export async function planetDbCounts(db: OpsQueryable): Promise<Map<string, Record<CountKind, number>>> {
  const { rows } = await db.query<{ kind: CountKind; planet_id: string; n: string }>(`
    select 'cities' as kind, planet_id, count(*) as n from world_cities group by planet_id
    union all
    select 'humans', c.planet_id, count(*) from world_humans h join world_cities c on c.id = h.city_id group by c.planet_id
    union all
    select 'buildings', planet_id, count(*) from world_buildings group by planet_id
    union all
    select 'pollution', planet_id, count(*) from planet_pollution group by planet_id
    union all
    select 'waves', planet_id, count(*) from gardener_waves where state in ('marching', 'fighting') group by planet_id`);
  const result = new Map<string, Record<CountKind, number>>();
  for (const row of rows) {
    let counts = result.get(row.planet_id);
    if (!counts) {
      counts = { cities: 0, humans: 0, buildings: 0, pollution: 0, waves: 0 };
      result.set(row.planet_id, counts);
    }
    counts[row.kind] = Number(row.n);
  }
  return result;
}

/** 행성마다 합: 플레이 행성(대표가 맨 앞) 먼저, 그다음 자료만 남은 행성 ID(ID 차례) */
export async function planetTotals(db: OpsQueryable, world: World | undefined): Promise<OpsPlanetTotals[]> {
  const gauges = new Map(planetGaugesOf(world).map((row) => [row.planetId, row]));
  const counts = await planetDbCounts(db);
  const playable = playablePlanets().map((planet) => planet.id);
  const others = [...new Set([...gauges.keys(), ...counts.keys()])]
    .filter((planetId) => !isPlayablePlanet(planetId))
    .toSorted();
  return [...playable, ...others].map((planetId) => {
    const memory = gauges.get(planetId);
    const stored = counts.get(planetId);
    return {
      planetId,
      playable: isPlayablePlanet(planetId),
      maps: memory?.maps ?? 0,
      units: memory?.units ?? 0,
      moving: memory?.moving ?? 0,
      cities: stored?.cities ?? 0,
      humans: stored?.humans ?? 0,
      buildings: stored?.buildings ?? 0,
      pollutionCells: stored?.pollution ?? 0,
      activeWaves: stored?.waves ?? 0,
    };
  });
}
