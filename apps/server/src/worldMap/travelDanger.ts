// 2차맵 사이 이동 확인 단계의 위험 구간(서버, 읽기만) — docs/adr/2026-11-07-play-flow.md "WP11 이동 2", 질문 594 나(위험 = 지나는 2차맵의
// 정원사 오염·전쟁 중 세력 영토, 아는 것만 — 안개 규칙. 비용 = 없음(걷기)).
// - 아는 2차맵: 전체 보기 권한, 구독과 같은 시야 규칙(canViewSecondMap — 내 유닛·건물·같은 나라)이거나 탐사 기록(world_exploration, 띄운
//   2차맵은 지금 시야 포함)이 있을 때(D-564 1642부터 탐사만으로는 2차맵이 열리지 않지만 아는 곳이다). 아는 2차맵만 오염 값을 보인다.
// - 오염이 위험: 그 2차맵(F9 칸 키)의 planet_pollution 값 ≥ 문턱. [임시] 문턱 = 유목 목표 오염 문턱(설정 칸 S17 — 유목 부대가 노리는
//   오염이라 지나기 위험하다, 새 칸 없음, 확인 대기 질문 611).
// - 전쟁(기획 답 611 나, docs/adr/2026-11-07-play-flow.md "WP13"): 내 국가(faction_members)와 전쟁(faction_wars state = war) 중인 세력만.
//   영토 = 2차맵(1차맵 칸) 가운데 점의 1차맵 영토 주인(D-568 지도 — 영토 서비스 claimsAt, 칸 표 없이: 질문 1930). 안개 규칙: 아는 2차맵의
//   영토이거나, 그 2차맵에 내가 아는 그 세력 도시(1차맵 도시 안개와 같은 규칙, knownCities.ts)가 있을 때. 국가가 없으면 전쟁 위험도 없다.
// 출발 2차맵(route 차례 0)은 넣지 않는다(이미 그곳에 있다).
import type { TerritoryClaim } from "@terra/shared/territory";
import type { WorldTravelDanger } from "@terra/shared/worldMap";
import type { Viewer } from "../trpc/context.ts";
import type { WorldDirectory } from "../world/gateway.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { canObserve, canViewSecondMap } from "../world/visibility.ts";
import { type KnownCityFacts, isCityKnown, knownWithoutSight } from "./knownCities.ts";

/** 판정에 쓰는 사실(시험은 바로 넣는다) */
export interface TravelDangerFacts {
  /** 그 2차맵을 아는가 */
  readonly knownMap: (mapKey: number) => boolean;
  /** 2차맵 키 → 오염(없으면 0) */
  readonly pollution: ReadonlyMap<number, number>;
  /** 지나는 2차맵의 내가 아는 도시(세력·2차맵) */
  readonly knownCities: readonly { readonly factionId: number; readonly mapKey: number }[];
  /** 내 국가와 전쟁 중인 세력 */
  readonly enemies: ReadonlySet<number>;
  /** 영토: 2차맵 키(1차맵 칸) → 그 가운데 점의 영토 주인 세력 */
  readonly territory: ReadonlyMap<number, number>;
  /** 오염 위험 문턱 */
  readonly threshold: number;
}

/** 위험 구간(route 차례 1부터)과 모르는 2차맵 수 */
export function travelDangers(
  route: readonly number[],
  facts: TravelDangerFacts,
): { dangers: WorldTravelDanger[]; unknownMaps: number } {
  const dangers: WorldTravelDanger[] = [];
  let unknownMaps = 0;
  for (let leg = 1; leg < route.length; leg++) {
    const mapKey = route[leg];
    if (mapKey === undefined) continue;
    const known = facts.knownMap(mapKey);
    if (!known) unknownMaps += 1;
    const pollution = known ? (facts.pollution.get(mapKey) ?? 0) : null;
    const pollutionHigh = pollution !== null && pollution >= facts.threshold;
    const enemies = new Set(
      facts.knownCities
        .filter((city) => city.mapKey === mapKey && facts.enemies.has(city.factionId))
        .map((city) => city.factionId),
    );
    const holder = facts.territory.get(mapKey);
    if (known && holder !== undefined && facts.enemies.has(holder)) enemies.add(holder);
    const warFactionIds = [...enemies].toSorted((a, b) => a - b);
    if (pollutionHigh || warFactionIds.length > 0)
      dangers.push({ leg, mapKey, pollution, pollutionHigh, warFactionIds });
  }
  return { dangers, unknownMaps };
}

export interface TravelDangerDeps {
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly directory: WorldDirectory;
  /** 띄운 2차맵에서 내가 아는 시야 칸(탐사 기록 ∪ 지금 시야). 없으면 DB 탐사 기록만 본다 */
  readonly sighted?: ((mapKey: number, viewer: Viewer) => Promise<Uint8Array | undefined>) | undefined;
  /** 오염 위험 문턱(설정 칸 실효 값) */
  readonly threshold: () => number;
  /**
   * 2차맵(1차맵 칸) 가운데 점마다 영토 소속(영토 서비스 claimsAt — 조회 캐시, 칸 표 없이). 없으면 영토 없이 도시가 선 2차맵만 본다
   */
  readonly territory?:
    | ((
        planetId: string,
        mapKeys: readonly number[],
      ) => Promise<readonly (TerritoryClaim | null)[] | undefined>)
    | undefined;
}

/** DB·세계에서 사실을 모아 위험 구간을 낸다 */
export function createTravelDanger(deps: TravelDangerDeps) {
  const { pool, planetId, maps } = deps;
  return async (
    viewer: Viewer,
    route: readonly number[],
  ): Promise<{ dangers: WorldTravelDanger[]; unknownMaps: number }> => {
    const keys = [...new Set(route.slice(1))];
    if (keys.length === 0) return { dangers: [], unknownMaps: 0 };
    const observer = canObserve(viewer);
    const [pollutionRows, warRows, cityRows, exploredRows, factionRows, territory] = await Promise.all([
      pool.query(
        `select cell_key, value from planet_pollution where planet_id = $1 and cell_key = any($2::bigint[])`,
        [planetId, keys],
      ),
      pool.query(`select faction_a, faction_b from faction_wars where state = 'war'`, []),
      pool.query(
        `select c.faction_id, c.map_key, c.cell_x, c.cell_y, c.start
         from world_cities c join factions f on f.id = c.faction_id
         where c.planet_id = $1 and f.dissolved_at_ms is null and c.map_key = any($2::bigint[])`,
        [planetId, keys],
      ),
      pool.query(
        `select map_key, cells from world_exploration
         where user_id = $1 and planet_id = $2 and map_key = any($3::bigint[])`,
        [viewer.id, planetId, keys],
      ),
      pool.query(`select faction_id from faction_members where user_id = $1`, [viewer.id]),
      deps.territory?.(planetId, keys).catch(() => undefined) ?? Promise.resolve(undefined),
    ]);
    const sighted = new Map<number, Uint8Array>();
    for (const row of exploredRows.rows)
      if (row.cells instanceof Uint8Array) sighted.set(Number(row.map_key), new Uint8Array(row.cells));
    // 띄운 2차맵: 지금 시야까지(구독과 같은 규칙) + 볼 수 있는가
    const viewable = new Set<number>();
    await Promise.all(
      keys.map(async (key) => {
        const map = maps.get(key);
        if (!map) return;
        const bits = await deps.sighted?.(key, viewer);
        if (bits) sighted.set(key, bits);
        if (await canViewSecondMap(deps.directory, viewer, map)) viewable.add(key);
      }),
    );
    const explored = (key: number): boolean => sighted.get(key)?.some((byte) => byte !== 0) ?? false;
    const myFaction = factionRows.rows[0];
    const knowing = { observer, myFactionId: myFaction ? Number(myFaction.faction_id) : null };
    const cities: KnownCityFacts[] = cityRows.rows.map((row) => ({
      factionId: Number(row.faction_id),
      mapKey: Number(row.map_key),
      cellX: Number(row.cell_x),
      cellY: Number(row.cell_y),
      start: row.start === true,
    }));
    // 내 국가와 전쟁 중인 세력(611 나 — 남의 전쟁은 넣지 않는다)
    const enemies = new Set<number>();
    const mine = knowing.myFactionId;
    for (const row of warRows.rows) {
      const a = Number(row.faction_a);
      const b = Number(row.faction_b);
      if (a === mine) enemies.add(b);
      else if (b === mine) enemies.add(a);
    }
    const cells = new Map<number, number>();
    keys.forEach((key, index) => {
      const claim = territory?.[index];
      if (claim && enemies.has(claim.faction)) cells.set(key, claim.faction);
    });
    return travelDangers(route, {
      // 아는 2차맵 = 볼 수 있거나(내 유닛·건물·같은 나라) 탐사 기록이 있다(D-564 1642부터 탐사만으로는 열리지 않지만 위험은 안다)
      knownMap: (key) => observer || viewable.has(key) || explored(key),
      pollution: new Map(pollutionRows.rows.map((row) => [Number(row.cell_key), Number(row.value)])),
      knownCities: cities.filter(
        (city) => knownWithoutSight(city, knowing) || isCityKnown(city, { ...knowing, sighted }),
      ),
      enemies,
      territory: cells,
      threshold: deps.threshold(),
    });
  };
}
