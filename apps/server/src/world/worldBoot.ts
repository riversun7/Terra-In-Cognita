// 세계 씨앗 부팅(국가·시작 도시·띄울 2차맵) — docs/adr/2026-11-07-world-layout.md, docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"
// world.ts가 부팅 때 한 번 부른다(world.ts가 커지지 않게 여기 모은다).
// 1. 행성 값이 있는 NPC 사회 세계: 시작 도시 자리 = 세계 배치(worldLayout.ts — 국가마다 행성 위 자기 자리, 다른 세력 영향권 밖).
//    옛 세계(시작 도시가 시험 2차맵 줄에 모인 세계)는 relayout.ts가 옮길 계획을 기록하고, WORLD_RELAYOUT = 1이면 옮긴다.
// 2. 행성 값이 없는 세계(시험·DB만 있는 개발)와 NPC 사회를 끈 세계: 옛 방식 그대로(시험 2차맵들에 나눔 / 2차맵마다 가운데 도시).
// 3. 띄울 2차맵 = 시험 2차맵 줄(봇 규모 시험·서버 시험·화면 시험이 S1_TEST_MAP_KEY를 쓴다) + 도시·폐허가 있는 2차맵(시작 도시 먼저,
//    MAX_CITY_MAPS까지 — NAS 메모리 상한).
// 4. 사람이 고른 국가 자리(기획 D-528, nationPlacement.ts): 시작 도시가 없는 국가는 그 자리에 서고, 시작 도시가 선 국가에 새 자리가 있으면
//    막는 것이 없을 때만 국가째 옮긴다(옛 자리 옮기기와 같은 길, 감사 기록 world.place_nation_city). 자리를 고르지 않은 국가만 자동 배치.
import { type CellKey, cellLevel, isCellKey } from "@terra/planet";
import { cityGrade, gradeValue } from "@terra/shared/territory";
import type { SocietyCoefficients } from "@terra/sim";
import { type NationPreset, type StartCityPlacer, ensureWorldNations } from "../npc/nations.ts";
import {
  type NationPlacement,
  loadPlacements,
  markPlacementBlocked,
  markPlacementsApplied,
  placementHome,
  planNationMove,
} from "./nationPlacement.ts";
import type { QueryPool } from "./persist/load.ts";
import type { WriterPool } from "./persist/writer.ts";
import {
  type LegacyCity,
  type RelayoutMove,
  type RelayoutPlan,
  applyRelayout,
  loadLegacyCities,
  planRelayout,
} from "./relayout.ts";
import type { TerrainService } from "./terrainService.ts";
import { tierApplyPending } from "./tierApply.ts";
import {
  type LayoutObstacle,
  type LayoutSpot,
  type LayoutTier,
  cellLabel,
  layoutTierOf,
  planWorldLayout,
  seedOfText,
} from "./worldLayout.ts";

/** 도시가 있어 띄우는 2차맵 수 상한(국가 16 × 시작 도시 4). 넘는 2차맵의 도시는 띄우지 않는다(기록에 남긴다) */
export const MAX_CITY_MAPS = 64;

export interface WorldBootLog {
  info(obj: object, message: string): void;
  warn(obj: object, message: string): void;
}

/** 그 행성의 도시 한 줄(배치가 보는 칸만) */
interface PlanetCity extends LayoutSpot {
  readonly id: number;
  readonly factionId: number;
  readonly start: boolean;
  readonly development: number;
}

async function loadPlanetCities(pool: QueryPool, planetId: string): Promise<PlanetCity[]> {
  const result = await pool.query(
    `select id, faction_id, map_key, cell_x, cell_y, start, development from world_cities where planet_id = $1 order by id`,
    [planetId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    factionId: Number(row.faction_id),
    mapKey: Number(row.map_key),
    x: Number(row.cell_x),
    y: Number(row.cell_y),
    start: row.start === true,
    development: Number(row.development ?? 0),
  }));
}

async function loadRuinSpots(pool: QueryPool, planetId: string): Promise<LayoutSpot[]> {
  const result = await pool.query(
    `select map_key, cell_x, cell_y from world_ruins where planet_id = $1 order by id`,
    [planetId],
  );
  return result.rows.map((row) => ({
    mapKey: Number(row.map_key),
    x: Number(row.cell_x),
    y: Number(row.cell_y),
  }));
}

/** 띄울 2차맵: 시험 2차맵 줄 + 도시·폐허가 있는 2차맵(시작 도시 → 다른 도시 → 폐허 차례, 상한까지) */
export async function worldMapKeys(
  pool: QueryPool,
  planetId: string,
  testMapKeys: readonly CellKey[],
  log: WorldBootLog,
): Promise<CellKey[]> {
  const [cities, ruins] = await Promise.all([
    loadPlanetCities(pool, planetId),
    loadRuinSpots(pool, planetId),
  ]);
  const keys = new Set<CellKey>(testMapKeys);
  const wanted = [
    ...cities.filter((city) => city.start).map((city) => city.mapKey),
    ...cities.filter((city) => !city.start).map((city) => city.mapKey),
    ...ruins.map((ruin) => ruin.mapKey),
  ];
  let extra = 0;
  const skipped: string[] = [];
  for (const key of wanted) {
    if (!isCellKey(key) || keys.has(key)) continue;
    if (extra >= MAX_CITY_MAPS) {
      skipped.push(cellLabel(key));
      continue;
    }
    keys.add(key);
    extra += 1;
  }
  if (skipped.length > 0)
    log.warn(
      { skipped: skipped.length, first: skipped.slice(0, 8) },
      "world boot: too many city maps to load",
    );
  return [...keys];
}

export interface WorldSeedBootOptions {
  readonly npc:
    | { readonly testNations: number; readonly presets?: readonly NationPreset[] | undefined }
    | undefined;
  readonly planetId: string;
  /** 시험 2차맵 줄(옛 시작 도시 자리이자 봇 자리) */
  readonly testMapKeys: readonly CellKey[];
  readonly nowMs: number;
  readonly rules: SocietyCoefficients;
  /** 2차맵 지형 서비스(행성 값). 없으면 옛 방식 */
  readonly terrain?: TerrainService | undefined;
  /** 옛 세계의 시작 도시를 실제로 옮긴다(WORLD_RELAYOUT). 아니면 계획만 기록한다 */
  readonly relayout: boolean;
  readonly log: WorldBootLog;
}

/**
 * 행성 값으로 새 시작 도시 자리를 고르는 함수(세계 배치). 행성 값이 없으면 undefined(옛 방식).
 * except = 자리를 고를 때 없는 셈 칠 도시(옮길 옛 자리 도시)
 */
function layoutPlacer(
  options: WorldSeedBootOptions,
  planet: { readonly cities: readonly PlanetCity[]; readonly ruins: readonly LayoutSpot[] },
):
  | ((
      nations: readonly {
        factionId: number;
        missing: number;
        home?: CellKey | undefined;
        tier?: LayoutTier | undefined;
      }[],
      except: ReadonlySet<number>,
    ) => {
      factionId: number;
      spot: LayoutSpot;
    }[])
  | undefined {
  const { terrain, rules, testMapKeys, planetId, log } = options;
  const first = testMapKeys[0];
  if (!terrain?.cellValues || first === undefined || !isCellKey(first)) return undefined;
  const land = (key: CellKey) => terrain.cellValues?.(key);
  // 행성 값이 아직 없으면(받기 전) 배치를 하지 않는다
  if (!land(first)) return undefined;
  const territory = rules.territory;
  const radiusOf = (development: number) =>
    gradeValue(territory.influenceMilli, cityGrade(development, territory));
  const newRadiusMilli = gradeValue(territory.influenceMilli, 1);
  const avoidMaps = new Set<number>(testMapKeys);
  return (nations, except) => {
    const nationIds = new Set(nations.map((nation) => nation.factionId));
    const cities = planet.cities.filter((city) => !except.has(city.id));
    // 제자리 시작 도시 = 시험 2차맵 줄(옛 자리) 밖의 시작 도시 — 그 국가 수도를 정한다. 옛 자리 도시는 수도가 되지 않는다(옮기지 못한 도시가
    // 남아도 나머지는 그 국가의 행성 위 자리로 간다). 그 밖의 도시는 모두 피할 도시다(자기 국가 도시는 영향권 검사에서 빠진다)
    const inPlace = (city: PlanetCity) =>
      city.start && nationIds.has(city.factionId) && !avoidMaps.has(city.mapKey);
    const obstacles: LayoutObstacle[] = [
      ...cities
        .filter((city) => !inPlace(city))
        .map((city) => ({ factionId: city.factionId, spot: city, radiusMilli: radiusOf(city.development) })),
      // 폐허 자리(주인 없음): 같은 2차맵에 두지 않고 영향권(처음 등급)과 닿지 않게
      ...planet.ruins.map((spot) => ({ factionId: -1, spot, radiusMilli: newRadiusMilli })),
    ];
    const result = planWorldLayout({
      faceLevel: cellLevel(first),
      land,
      seed: rules.worldSeed,
      worldSeed: seedOfText(planetId),
      nations: nations.map((nation) => ({
        factionId: nation.factionId,
        missing: nation.missing,
        placed: cities.filter((city) => inPlace(city) && city.factionId === nation.factionId),
        home: nation.home,
        tier: nation.tier,
      })),
      obstacles,
      newRadiusMilli,
      avoidMaps,
    });
    log.info(
      {
        homes: Object.fromEntries([...result.homes].map(([faction, key]) => [faction, cellLabel(key)])),
        regionCells: result.regionCells,
        minGapCells: result.minGapCells,
        spots: result.spots.length,
        short: result.short,
      },
      "world layout: nation homes and start city spots",
    );
    if (result.short > 0) log.warn({ short: result.short }, "world layout: not enough land for start cities");
    return [...result.spots];
  };
}

/** 옛 자리 도시 계획을 기록에 남긴다(옮긴 것·남긴 것과 까닭) */
function logRelayout(log: WorldBootLog, plan: RelayoutPlan, applied: boolean): void {
  if (plan.moves.length === 0 && plan.kept.length === 0) return;
  log.info(
    {
      applied,
      moves: plan.moves.map((move) => ({
        city: move.id,
        faction: move.factionId,
        from: cellLabel(move.spot.mapKey),
        to: cellLabel(move.to.mapKey),
        units: move.units.length,
        cyborgUsers: move.cyborgUsers.length,
        npcBuildings: move.npcBuildings.length,
        playerGoods: move.playerGoods,
      })),
      kept: plan.kept.map((city) => ({ city: city.id, faction: city.factionId, reasons: city.reasons })),
    },
    applied
      ? "world relayout: moved legacy start cities"
      : "world relayout plan (set WORLD_RELAYOUT=1 to apply)",
  );
}

/**
 * 부팅 때 세계 씨앗: 옛 자리 옮기기(계획·적용) → 고정 국가·모자란 시작 도시 → 띄울 2차맵 키. relayout = 적용한 계획(유닛 옮기기에 쓴다)
 */
export async function bootWorldSeed(
  pool: QueryPool & WriterPool,
  options: WorldSeedBootOptions,
): Promise<{
  mapKeys: CellKey[];
  relayout: RelayoutPlan | undefined;
  /** 국력 등급 반영 요청이 든 부팅이면 더 세운 시작 도시 수(tierApply.ts — 나머지는 NPC 사회 런타임이 든다). 요청이 없으면 undefined */
  tierApply: { citiesAdded: number } | undefined;
}> {
  const { npc, planetId, testMapKeys, nowMs, log } = options;
  // 등급 분포 반영 요청(운영자 동작): 이미 선 국가도 등급 수까지 시작 도시를 채운다
  const grow = npc ? await tierApplyPending(pool, planetId).catch(() => false) : false;
  let placer: StartCityPlacer | undefined;
  let relayout: RelayoutPlan | undefined;
  /** 자리를 놓아 이 세계에 세울 국가(차례 밖 프리셋 — 세계 배치 화면 "이 세계에 이 국가 세우기") */
  let extraCodes: string[] = [];
  /** 사람이 고른 자리에 이번에 시작 도시를 세운 국가(세력 코드) */
  const homed: string[] = [];
  if (npc) {
    const loadPlanet = async () => ({
      cities: await loadPlanetCities(pool, planetId),
      ruins: await loadRuinSpots(pool, planetId),
    });
    let planet = await loadPlanet();
    let place = layoutPlacer(options, planet);
    if (place) {
      const legacy = await loadLegacyCities(pool, planetId, new Set(testMapKeys));
      if (legacy.length > 0) {
        const placeNow = place;
        const startFactions = [
          ...new Set(planet.cities.filter((city) => city.start).map((city) => city.factionId)),
        ].toSorted((a, b) => a - b);
        const plan = await planRelayout(pool, {
          planetId,
          legacy,
          // 모든 고정 국가를 넘긴다(옮기지 않는 국가는 0곳 — 그 수도가 가장 먼 점 고르기의 고정 수도가 된다)
          place: (movable: readonly LegacyCity[]) => {
            const counts = new Map<number, number>();
            for (const city of movable) counts.set(city.factionId, (counts.get(city.factionId) ?? 0) + 1);
            const nations = startFactions.map((factionId) => ({
              factionId,
              missing: counts.get(factionId) ?? 0,
            }));
            return placeNow(nations, new Set(movable.map((city) => city.id)));
          },
        });
        if (options.relayout) await applyRelayout(pool, plan, nowMs);
        logRelayout(log, plan, options.relayout);
        if (options.relayout && plan.moves.length > 0) {
          relayout = plan;
          // 옮긴 자리로 다시 읽는다(모자란 시작 도시를 고를 때 옮긴 도시를 새 자리로 본다)
          planet = await loadPlanet();
          place = layoutPlacer(options, planet) ?? place;
        }
      }
      // 사람이 고른 국가 자리(D-528): 시작 도시가 선 국가를 새 자리로(막히면 그대로, 까닭을 적는다)
      const placements = await loadPlacements(pool, planetId);
      // 놓은 자리의 코드 가운데 켜진 프리셋 코드 = 세울 국가(이미 선 국가·차례로 서는 국가는 ensureTestNations가 한 번만 세운다)
      extraCodes = [...placements.keys()].filter((code) =>
        (npc.presets ?? []).some((preset) => preset.code === code),
      );
      const moved = await applyPlacementMoves(pool, options, placements, planet, place);
      if (moved.length > 0) {
        relayout = { moves: [...(relayout?.moves ?? []), ...moved], kept: relayout?.kept ?? [] };
        planet = await loadPlanet();
        place = layoutPlacer(options, planet) ?? place;
      }
      const placeFinal = place;
      const planetNow = planet;
      const avoid = new Set<number>(testMapKeys);
      placer = (nations) => {
        // 자리를 고른 국가: 제자리 시작 도시가 없을 때만 그 자리가 수도다(worldLayout.ts home)
        const spots = placeFinal(
          nations.map((nation) => ({
            factionId: nation.factionId,
            missing: nation.missing,
            home: placementHome(placements.get(nation.code)),
            // 국력 등급(자리 차례·국가 간격·도시 간격 — worldLayout.ts 머리 주석 3)
            tier: layoutTierOf(nation.start),
          })),
          new Set(),
        );
        for (const nation of nations) {
          const inPlace = planetNow.cities.some(
            (city) => city.start && city.factionId === nation.factionId && !avoid.has(city.mapKey),
          );
          if (
            !inPlace &&
            placements.has(nation.code) &&
            spots.some((spot) => spot.factionId === nation.factionId)
          )
            homed.push(nation.code);
        }
        return spots;
      };
    }
  }
  const citiesAdded = await ensureWorldNations(pool, {
    npc,
    planetId,
    mapKeys: testMapKeys,
    nowMs,
    seed: options.rules.worldSeed,
    placer,
    grow,
    extraCodes,
  });
  await markPlacementsApplied(pool, planetId, homed, nowMs);
  if (grow) log.info({ citiesAdded }, "world tier apply: start cities added for the requested power tiers");
  return {
    mapKeys: await worldMapKeys(pool, planetId, testMapKeys, log),
    relayout,
    tierApply: grow ? { citiesAdded } : undefined,
  };
}

/**
 * 사람이 고른 국가 자리 가운데 아직 들지 않은 것(applied_at_ms = null)을 본다(nationPlacement.ts 머리 주석 2): 시작 도시가 이미 그 자리
 * 2차맵에 있으면 든 것으로 적고, 아니면 국가째 옮긴다(막히면 까닭을 적는다). 옮긴 도시 목록(유닛 옮기기에 쓴다)을 돌려준다
 */
async function applyPlacementMoves(
  pool: QueryPool & WriterPool,
  options: WorldSeedBootOptions,
  placements: ReadonlyMap<string, NationPlacement>,
  start: { readonly cities: readonly PlanetCity[]; readonly ruins: readonly LayoutSpot[] },
  startPlace: NonNullable<ReturnType<typeof layoutPlacer>>,
): Promise<RelayoutMove[]> {
  const { planetId, nowMs, log } = options;
  const pending = [...placements.values()].filter((placement) => placement.appliedAtMs === null);
  if (pending.length === 0) return [];
  const found = await pool.query(
    `select id, code from factions where kind = 'npc' and fixed and code = any($1::text[])`,
    [pending.map((placement) => placement.code)],
  );
  const idOf = new Map(found.rows.map((row) => [String(row.code), Number(row.id)]));
  let planet = start;
  let place = startPlace;
  const applied: string[] = [];
  const moved: RelayoutMove[] = [];
  for (const placement of pending) {
    const factionId = idOf.get(placement.code);
    if (factionId === undefined) continue;
    const own = planet.cities.filter((city) => city.factionId === factionId && city.start);
    // 시작 도시가 없는 국가는 세계 씨앗(ensureWorldNations)이 그 자리에 세운다
    if (own.length === 0) continue;
    if (own.some((city) => city.mapKey === placement.mapKey)) {
      applied.push(placement.code);
      continue;
    }
    const placeNow = place;
    const plan = await planNationMove(pool, {
      planetId,
      factionId,
      cities: planet.cities,
      place: (count, except) =>
        placeNow([{ factionId, missing: count, home: placementHome(placement) }], except).map(
          (entry) => entry.spot,
        ),
    });
    if (plan.reasons.length > 0) {
      await markPlacementBlocked(pool, planetId, placement.code, plan.reasons);
      log.warn(
        { faction: placement.code, to: cellLabel(placement.mapKey), reasons: plan.reasons },
        "world placement: nation kept in place",
      );
      continue;
    }
    await applyRelayout(pool, { moves: plan.moves, kept: [] }, nowMs, "world.place_nation_city");
    moved.push(...plan.moves);
    applied.push(placement.code);
    log.info(
      { faction: placement.code, to: cellLabel(placement.mapKey), cities: plan.moves.length },
      "world placement: moved nation to its placed home",
    );
    // 다음 국가는 옮긴 도시를 새 자리로 본다
    planet = {
      cities: await loadPlanetCities(pool, planetId),
      ruins: await loadRuinSpots(pool, planetId),
    };
    place = layoutPlacer(options, planet) ?? place;
  }
  await markPlacementsApplied(pool, planetId, applied, nowMs);
  return moved;
}
