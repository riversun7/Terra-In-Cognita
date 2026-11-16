// 국력 등급 배치 계획·반영 미리 보기(DB 읽기만) — 사용자 답(2026-11-11, 원문) "현재 테스트 맵에 실제 강대국 분포처럼 알아서 배치해달라",
// docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)". 세계 배치 화면(/dev/world-layout)이 placementService.ts를 거쳐 부른다.
// - freshTierPlan: 빈 세계로 보고 모든 국가(이 세계에 선 국가 + 자리를 놓아 세울 국가)를 등급대로 고른 자리와 시작 도시(사람이 놓은 자리는
//   그대로 수도). 새 세계·세계 새로 시작 뒤에 설 모습이고, [제안 모두 놓기]가 이 자리를 놓는다.
// - tierApplyPlan: 이미 선 세계에 등급 분포를 반영하면 무엇이 더해지는지(시작 도시·주거·휴먼·경비대·기술). 부팅이 실제로 하는 일
//   (npc/nations.ts ensureTestNations grow, npc/runtime.ts tierApply)과 같은 셈이다. 지우거나 옮기는 것은 없다.
import { type CellKey, isCellKey } from "@terra/planet";
import { type NationStart, tierPopulation } from "@terra/shared/nationTier";
import { cityGrade, gradeValue } from "@terra/shared/territory";
import type {
  WorldTierApplyNation,
  WorldTierApplyView,
  WorldTierPlan,
  WorldTierStartView,
} from "@terra/shared/worldPlacementApi";
import type { SocietyCoefficients, WorldSeedCoefficients } from "@terra/sim";
import type { TerritoryMapValues } from "@terra/shared/territoryMap";
import type { QueryPool } from "./persist/load.ts";
import { loadTierRequest } from "./tierApply.ts";
import {
  type LayoutLand,
  type LayoutObstacle,
  type LayoutSpot,
  layoutTierOf,
  planWorldLayout,
  seedOfText,
} from "./worldLayout.ts";

/** 계획에 넣을 국가 하나 */
export interface TierPlanNation {
  readonly code: string;
  /** 자리 고르기의 국가 ID(세력 행 ID, 아직 서지 않은 국가는 겹치지 않는 음수) */
  readonly factionId: number;
  readonly start: NationStart;
  /** 사람이 놓은 수도 2차맵 */
  readonly home?: CellKey | undefined;
}

export const startViewOf = (start: NationStart): WorldTierStartView => ({
  tier: start.tier,
  cities: start.startCities,
  populationPerCity: start.populationPerCity,
  guardsPerCity: start.guardsPerCity,
  tech: start.tech,
});

interface PlanBase {
  readonly faceLevel: number;
  readonly land: (mapKey: CellKey) => LayoutLand | undefined;
  readonly seed: WorldSeedCoefficients;
  readonly planetId: string;
  readonly avoidMaps: ReadonlySet<number>;
  /** 1차맵 영토 값(설정 칸 planet_territory_* — 시작 도시 자리가 다른 세력 지도 영토 밖, D-568 질문 1922). 없으면 옛 영향권 검사 */
  readonly mapValues?: TerritoryMapValues | undefined;
}

/** 빈 세계 등급 배치 계획(순수 함수 — 행성 값·설정 칸·국가 목록에서) */
export function freshTierPlan(base: PlanBase, nations: readonly TierPlanNation[]): WorldTierPlan {
  const result = planWorldLayout({
    faceLevel: base.faceLevel,
    land: base.land,
    seed: base.seed,
    worldSeed: seedOfText(base.planetId),
    nations: nations.map((nation) => ({
      factionId: nation.factionId,
      missing: nation.start.startCities,
      placed: [],
      home: nation.home,
      tier: layoutTierOf(nation.start),
    })),
    obstacles: [],
    newRadiusMilli: 0,
    avoidMaps: base.avoidMaps,
    territory: base.mapValues,
  });
  return {
    nations: nations.flatMap((nation) => {
      const home = result.homes.get(nation.factionId);
      if (home === undefined) return [];
      const cities = result.spots
        .filter((entry) => entry.factionId === nation.factionId)
        .map((entry) => String(entry.spot.mapKey));
      return [
        {
          code: nation.code,
          tier: nation.start.tier,
          home: String(home),
          cities,
          wantCities: nation.start.startCities,
          population: cities.length * nation.start.populationPerCity,
          guards: cities.length * nation.start.guardsPerCity,
          placed: nation.home !== undefined,
        },
      ];
    }),
    minGapCells: result.minGapCells,
    regionCells: result.regionCells,
    short: result.short,
  };
}

interface CityRow extends LayoutSpot {
  readonly id: number;
  readonly factionId: number;
  readonly start: boolean;
  readonly development: number;
  readonly housing: number;
}

/**
 * 이미 선 세계에 등급 분포를 반영할 때 더해지는 것(DB 읽기만). nations = 이 세계에 선 고정 국가(세력 행 ID·코드·등급 시작 값·이름).
 * 더 세울 도시 자리는 세계 씨앗과 같은 자리 함수로 고른다(제자리 시작 도시의 첫 것이 수도, 등급 도시 간격)
 */
export async function tierApplyPlan(
  pool: QueryPool,
  base: PlanBase & { readonly territory: SocietyCoefficients["territory"] },
  nations: readonly (TierPlanNation & {
    readonly name: WorldTierApplyNation["name"];
    readonly tiered: boolean;
  })[],
): Promise<WorldTierApplyView> {
  const [cityRows, humanRows, techRows, ruinRows, unitRows, request] = await Promise.all([
    pool.query(
      `select id, faction_id, map_key, cell_x, cell_y, start, development, housing from world_cities
       where planet_id = $1 order by id`,
      [base.planetId],
    ),
    pool.query(
      `select city_id, guard, count(*) as n from world_humans where city_id is not null group by city_id, guard`,
    ),
    pool.query(`select id, tech_level from factions where id = any($1::bigint[])`, [
      nations.map((nation) => nation.factionId),
    ]),
    pool.query(`select map_key, cell_x, cell_y from world_ruins where planet_id = $1 order by id`, [
      base.planetId,
    ]),
    pool.query(`select count(*) as n from world_units where planet_id = $1`, [base.planetId]),
    loadTierRequest(pool, base.planetId),
  ]);
  const cities: CityRow[] = cityRows.rows.map((row) => ({
    id: Number(row.id),
    factionId: Number(row.faction_id),
    mapKey: Number(row.map_key),
    x: Number(row.cell_x),
    y: Number(row.cell_y),
    start: row.start === true,
    development: Number(row.development ?? 0),
    housing: Number(row.housing ?? 0),
  }));
  const humansOf = new Map<number, { humans: number; guards: number }>();
  for (const row of humanRows.rows) {
    const cityId = Number(row.city_id);
    const now = humansOf.get(cityId) ?? { humans: 0, guards: 0 };
    if (row.guard === true) now.guards += Number(row.n);
    else now.humans += Number(row.n);
    humansOf.set(cityId, now);
  }
  const techOf = new Map(techRows.rows.map((row) => [Number(row.id), Number(row.tech_level)]));
  const nationIds = new Set(nations.map((nation) => nation.factionId));
  const inPlace = (city: CityRow): boolean =>
    city.start && nationIds.has(city.factionId) && !base.avoidMaps.has(city.mapKey);
  const radiusOf = (development: number): number =>
    gradeValue(base.territory.influenceMilli, cityGrade(development, base.territory));
  const newRadiusMilli = gradeValue(base.territory.influenceMilli, 1);
  const obstacles: LayoutObstacle[] = [
    ...cities
      .filter((city) => !inPlace(city))
      .map((city) => ({ factionId: city.factionId, spot: city, radiusMilli: radiusOf(city.development) })),
    ...ruinRows.rows.map((row) => ({
      factionId: -1,
      spot: { mapKey: Number(row.map_key), x: Number(row.cell_x), y: Number(row.cell_y) },
      radiusMilli: newRadiusMilli,
    })),
  ];
  const startsOf = (factionId: number): CityRow[] =>
    cities.filter((city) => city.start && city.factionId === factionId);
  const layout = planWorldLayout({
    faceLevel: base.faceLevel,
    land: base.land,
    seed: base.seed,
    worldSeed: seedOfText(base.planetId),
    nations: nations.map((nation) => ({
      factionId: nation.factionId,
      missing: Math.max(0, nation.start.startCities - startsOf(nation.factionId).length),
      placed: cities.filter((city) => inPlace(city) && city.factionId === nation.factionId),
      home: nation.home,
      tier: layoutTierOf(nation.start),
    })),
    obstacles,
    newRadiusMilli,
    avoidMaps: base.avoidMaps,
    territory: base.mapValues,
  });
  const out: WorldTierApplyNation[] = nations.map((nation) => {
    const own = startsOf(nation.factionId);
    const want = nation.start.startCities;
    const addAt = layout.spots
      .filter((entry) => entry.factionId === nation.factionId && isCellKey(entry.spot.mapKey))
      .map((entry) => String(entry.spot.mapKey));
    let housingRaised = 0;
    let humansHave = 0;
    let humansAdd = 0;
    let guardsHave = 0;
    let guardsAdd = 0;
    for (const city of own) {
      const now = humansOf.get(city.id) ?? { humans: 0, guards: 0 };
      humansHave += now.humans;
      guardsHave += now.guards;
      // 등급이 없는 국가의 이미 채운 도시는 건드리지 않는다(npc/runtime.ts tierApply와 같다)
      if (!nation.tiered) continue;
      if (nation.start.housing > city.housing) housingRaised += 1;
      const housing = Math.max(city.housing, nation.start.housing);
      humansAdd += Math.max(0, tierPopulation(housing, nation.start.populationPm) - now.humans);
      guardsAdd += Math.max(0, nation.start.guardsPerCity - now.guards);
    }
    const from = techOf.get(nation.factionId) ?? 1;
    return {
      code: nation.code,
      name: nation.name,
      tier: nation.start.tier,
      cities: {
        have: own.length,
        want,
        add: addAt.length,
        surplus: Math.max(0, own.length - want),
      },
      addAt,
      housingRaised,
      humans: { have: humansHave, add: humansAdd },
      guards: { have: guardsHave, add: guardsAdd },
      newHumans: addAt.length * nation.start.populationPerCity,
      newGuards: addAt.length * nation.start.guardsPerCity,
      tech: { from, to: Math.max(from, nation.start.tech) },
    };
  });
  const sum = (pick: (nation: WorldTierApplyNation) => number): number =>
    out.reduce((total, nation) => total + pick(nation), 0);
  return {
    nations: out,
    totals: {
      cities: sum((nation) => nation.cities.add),
      humans: sum((nation) => nation.humans.add + nation.newHumans),
      guards: sum((nation) => nation.guards.add + nation.newGuards),
      housingRaised: sum((nation) => nation.housingRaised),
      surplusCities: sum((nation) => nation.cities.surplus),
    },
    unitsNow: Number(unitRows.rows[0]?.n ?? 0),
    request: request
      ? {
          requestedAtMs: request.requestedAtMs,
          requestedBy: request.requestedBy,
          appliedAtMs: request.appliedAtMs,
          report: request.report,
        }
      : null,
  };
}
