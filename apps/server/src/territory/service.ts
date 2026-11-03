// 영토 서비스(서버 권위) — docs/adr/2026-11-03-territory-layer.md 3·4·5절, 기획 D-485·D-486·D-104·49 M2·M3·N42·N51
// - 비콘: 메모리 표(원본은 territory_beacons)가 캐시이고 쓰는 프로세스가 하나라(ADR 3) 놓기·치우기는 메모리 → 쓰기 대기열 → 커밋 뒤 답한다.
// - 도시: world_cities를 그때 읽는다(NPC 사회 런타임이 주인·발전도를 바꾸고 새 마을을 넣는다). 명령은 대기열을 비운 뒤 새로 읽고, 조회는
//   행성마다 셈한 배치를 VIEW_TTL_MS 동안 쓴다(비콘이 바뀌면 바로 버린다). 사라진 세력(dissolved_at_ms)의 도시·비콘은 셈에서 뺀다.
// - 셈: @terra/shared/territory(껍질·소속·겹침·놓기 검사) + @terra/planet/territory(칸 → 점, 칸 표). 둘 다 결정적이다.
// - 비콘 시설: 팩 시설 territory_beacon(켬끔 D-398, 건설 재료 D-508). 지금 놓을 때 재료를 쓰지 않고(짓기 흐름이 없다) 내구도만 적는다(N51).
import { type CellKey, cellLevel, isCellKey, parseCellKey } from "@terra/planet";
import {
  placementCellKey,
  rasterizeTerritory,
  territoryMetric,
  territoryPoint,
} from "@terra/planet/territory";
import type { BeaconResultCode } from "@terra/protocol";
import {
  type TerritoryCoefficients,
  type TerritoryLayout,
  buildTerritory,
  checkBeaconPlacement,
  cityGrade,
  gradeValue,
} from "@terra/shared/territory";
import type {
  TerritoryBeaconFacilityView,
  TerritoryFactionView,
  TerritoryPlanetView,
} from "@terra/shared/territoryApi";
import type { LocalizedName } from "@terra/shared/roster";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 조회용 배치를 다시 셈하는 간격(ms). 비콘이 바뀌면 바로 다시 셈한다 */
export const VIEW_TTL_MS = 30_000;

export interface BeaconRow {
  readonly id: number;
  readonly planetId: string;
  readonly cellKey: number;
  readonly factionId: number;
  readonly cityId: number | null;
  readonly durability: number;
  readonly builtAtMs: number;
  readonly builtBy: string | null;
}

interface CityRecord {
  readonly id: number;
  readonly factionId: number;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly development: number;
}

interface FactionRecord {
  readonly id: number;
  readonly code: string | null;
  readonly kind: "npc" | "player";
}

export type BeaconCommandResult =
  | { readonly ok: true; readonly beaconId?: number }
  | { readonly ok: false; readonly code: BeaconResultCode };

/** 명령을 보낸 사람. devPlace = 권한 territory: dev-place(다른 세력 대신) */
export interface TerritoryActor {
  readonly userId: string;
  readonly devPlace: boolean;
}

export interface TerritoryService {
  place(
    actor: TerritoryActor,
    input: { readonly planetId: string; readonly cellKey: number; readonly factionId?: number | undefined },
  ): Promise<BeaconCommandResult>;
  remove(actor: TerritoryActor, beaconId: number): Promise<BeaconCommandResult>;
  /** 행성의 영토 전체(개발 화면). myFactionId = 그 사용자가 가입한 세력 */
  planetView(planetId: string, userId: string | null): Promise<TerritoryPlanetView | undefined>;
  /** 내 세력 것만 거른 영토(세력 영토·비콘 목록). 세력이 없으면 myFactionId null·빈 목록 */
  mineView(planetId: string, userId: string): Promise<TerritoryPlanetView | undefined>;
  readonly beaconCount: () => number;
}

export interface TerritoryServiceOptions {
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly now: () => number;
  /** 영토 계수(설정 칸 실효 값), 부를 때마다 읽는다 */
  readonly rules: () => TerritoryCoefficients;
  /** 팩 시설 territory_beacon 실효 값(켬끔·재료). 없으면 켬·재료 없음 */
  readonly beaconFacility: () => TerritoryBeaconFacilityView;
  /** 영토를 셈하는 행성의 면 레벨(세계 행성만) */
  readonly faceLevelOf: (planetId: string) => number | undefined;
  /** 세력 화면 이름(코드 → 이름) */
  readonly factionName?: ((code: string) => LocalizedName | undefined) | undefined;
  /** 세계가 준비됐나(아니면 busy) */
  readonly ready: () => boolean;
}

export async function loadBeacons(pool: QueryPool): Promise<BeaconRow[]> {
  const result = await pool.query(
    `select id, planet_id, cell_key, faction_id, city_id, durability, built_at_ms, built_by
     from territory_beacons order by id`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    planetId: String(row.planet_id),
    cellKey: Number(row.cell_key),
    factionId: Number(row.faction_id),
    cityId: row.city_id === null ? null : Number(row.city_id),
    durability: Number(row.durability),
    builtAtMs: Number(row.built_at_ms),
    builtBy: typeof row.built_by === "string" ? row.built_by : null,
  }));
}

const beaconRow = (beacon: BeaconRow) => ({
  id: beacon.id,
  planet_id: beacon.planetId,
  cell_key: beacon.cellKey,
  faction_id: beacon.factionId,
  city_id: beacon.cityId,
  durability: beacon.durability,
  built_at_ms: beacon.builtAtMs,
  built_by: beacon.builtBy,
});

const fail = (code: BeaconResultCode): BeaconCommandResult => ({ ok: false, code });

interface Computed {
  readonly atMs: number;
  readonly layout: TerritoryLayout;
  readonly faceLevel: number;
  readonly rules: TerritoryCoefficients;
  readonly cities: readonly CityRecord[];
  readonly factions: ReadonlyMap<number, FactionRecord>;
  readonly beacons: readonly BeaconRow[];
  readonly cells: Map<CellKey, { faction: number; province: number | null; samples: number }>;
}

export function createTerritoryService(
  options: TerritoryServiceOptions,
  loaded: readonly BeaconRow[],
): TerritoryService {
  const { pool, writer, now } = options;
  const beacons = new Map<number, BeaconRow>(loaded.map((beacon) => [beacon.id, beacon]));
  let lastId = loaded.reduce((max, beacon) => Math.max(max, beacon.id), 0);
  const cache = new Map<string, Computed>();
  /** 명령은 차례로 하나씩(같은 칸 두 번 놓기·개수 넘기를 막는다) */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = chain.then(run, run);
    chain = next.catch(() => undefined);
    return next;
  };

  const loadFactions = async (): Promise<Map<number, FactionRecord>> => {
    const result = await pool.query(
      `select id, code, kind from factions where dissolved_at_ms is null order by id`,
    );
    return new Map(
      result.rows.map((row) => [
        Number(row.id),
        {
          id: Number(row.id),
          code: typeof row.code === "string" ? row.code : null,
          kind: row.kind === "player" ? "player" : "npc",
        },
      ]),
    );
  };

  const loadCityRecords = async (planetId: string): Promise<CityRecord[]> => {
    const result = await pool.query(
      `select id, faction_id, map_key, cell_x, cell_y, development from world_cities where planet_id = $1 order by id`,
      [planetId],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      factionId: Number(row.faction_id),
      mapKey: Number(row.map_key),
      cellX: Number(row.cell_x),
      cellY: Number(row.cell_y),
      development: Number(row.development),
    }));
  };

  /** 행성 배치를 새로 셈한다(도시·세력은 DB에서, 비콘은 메모리에서) */
  const compute = async (planetId: string, faceLevel: number): Promise<Computed> => {
    await writer.durable();
    const [factions, allCities] = await Promise.all([loadFactions(), loadCityRecords(planetId)]);
    const rules = options.rules();
    const cities = allCities.filter((city) => factions.has(city.factionId) && isCellKey(city.mapKey));
    const planetBeacons = [...beacons.values()]
      .filter((beacon) => beacon.planetId === planetId && factions.has(beacon.factionId))
      .toSorted((a, b) => a.id - b.id);
    const layout = buildTerritory(
      cities.map((city) => ({
        id: city.id,
        faction: city.factionId,
        point: territoryPoint(placementCellKey(parseCellKey(city.mapKey), city.cellX, city.cellY)),
        grade: cityGrade(city.development, rules),
      })),
      planetBeacons.map((beacon) => ({
        id: beacon.id,
        faction: beacon.factionId,
        point: territoryPoint(parseCellKey(beacon.cellKey)),
        anchorCity: beacon.cityId,
      })),
      rules,
      territoryMetric(faceLevel),
    );
    const seeds = [
      ...cities.map((city) => parseCellKey(city.mapKey)),
      ...planetBeacons.map((beacon) => parseCellKey(beacon.cellKey)),
    ];
    const cells = rasterizeTerritory(layout, seeds, faceLevel);
    const computed: Computed = {
      atMs: now(),
      layout,
      faceLevel,
      rules,
      cities,
      factions,
      beacons: planetBeacons,
      cells,
    };
    cache.set(planetId, computed);
    return computed;
  };

  const current = async (planetId: string): Promise<Computed | undefined> => {
    const faceLevel = options.faceLevelOf(planetId);
    if (faceLevel === undefined) return undefined;
    const hit = cache.get(planetId);
    if (hit && now() - hit.atMs < VIEW_TTL_MS) return hit;
    return compute(planetId, faceLevel);
  };

  const factionOfUser = async (userId: string): Promise<number | null> => {
    const result = await pool.query(
      `select m.faction_id from faction_members m join factions f on f.id = m.faction_id
       where m.user_id = $1 and f.dissolved_at_ms is null`,
      [userId],
    );
    const row = result.rows[0];
    return row ? Number(row.faction_id) : null;
  };

  const view = (computed: Computed, planetId: string, myFactionId: number | null): TerritoryPlanetView => {
    const used = new Map<number, number>();
    for (const beacon of computed.beacons)
      if (beacon.cityId !== null) used.set(beacon.cityId, (used.get(beacon.cityId) ?? 0) + 1);
    const factionIds = new Set<number>([
      ...computed.cities.map((city) => city.factionId),
      ...computed.beacons.map((beacon) => beacon.factionId),
    ]);
    if (myFactionId !== null) factionIds.add(myFactionId);
    const factions: TerritoryFactionView[] = [...factionIds]
      .toSorted((a, b) => a - b)
      .flatMap((id) => {
        const record = computed.factions.get(id);
        if (!record) return [];
        return [
          {
            id,
            code: record.code,
            kind: record.kind,
            name: record.code === null ? null : (options.factionName?.(record.code) ?? null),
          },
        ];
      });
    const layoutCities = new Map(computed.layout.cities.map((city) => [city.id, city]));
    return {
      planetId,
      faceLevel: computed.faceLevel,
      milliPerRadian: computed.layout.metric.milliPerRadian,
      rules: computed.rules,
      beacon: options.beaconFacility(),
      factions,
      cities: computed.cities.flatMap((city) => {
        const placed = layoutCities.get(city.id);
        if (!placed) return [];
        return [
          {
            id: city.id,
            factionId: city.factionId,
            mapKey: city.mapKey,
            cellX: city.cellX,
            cellY: city.cellY,
            point: placed.point,
            development: city.development,
            grade: placed.grade,
            radiusMilli: placed.radiusMilli,
            rangeMilli: gradeValue(computed.rules.beaconRangeMilli, placed.grade),
            beaconsUsed: used.get(city.id) ?? 0,
            beaconsMax: gradeValue(computed.rules.beaconsPerCity, placed.grade),
          },
        ];
      }),
      beacons: computed.beacons.map((beacon) => ({
        id: beacon.id,
        factionId: beacon.factionId,
        cityId: beacon.cityId,
        cellKey: beacon.cellKey,
        point: territoryPoint(parseCellKey(beacon.cellKey)),
        durability: beacon.durability,
        builtAtMs: beacon.builtAtMs,
      })),
      groups: computed.layout.groups.map((group) => ({
        factionId: group.faction,
        members: group.members.map((member) => ({ kind: member.kind, id: member.id })),
        hull: group.hull
          ? group.hull.map((vertex) => ({ kind: vertex.kind, id: vertex.id, point: vertex.point }))
          : null,
      })),
      cells: [...computed.cells.entries()].map(([key, cell]) => [
        key,
        cell.faction,
        cell.province ?? 0,
        cell.samples,
      ]),
      myFactionId,
      computedAtMs: computed.atMs,
    };
  };

  return {
    place(actor, input) {
      return serial(async () => {
        if (!options.ready()) return fail("busy");
        if (!options.beaconFacility().enabled) return fail("disabled");
        const faceLevel = options.faceLevelOf(input.planetId);
        if (faceLevel === undefined) return fail("unknown_planet");
        if (!isCellKey(input.cellKey) || cellLevel(input.cellKey) !== faceLevel) return fail("invalid_cell");
        const own = await factionOfUser(actor.userId);
        const faction = input.factionId ?? own;
        if (faction === null) return fail("no_faction");
        if (faction !== own && !actor.devPlace) return fail("forbidden");
        for (const beacon of beacons.values())
          if (beacon.planetId === input.planetId && beacon.cellKey === input.cellKey)
            return fail("cell_taken");
        const computed = await compute(input.planetId, faceLevel);
        if (!computed.factions.has(faction)) return fail("no_faction");
        const check = checkBeaconPlacement(
          computed.layout,
          computed.rules,
          faction,
          territoryPoint(input.cellKey),
        );
        if (!check.ok) return fail(check.problem);
        lastId += 1;
        const beacon: BeaconRow = {
          id: lastId,
          planetId: input.planetId,
          cellKey: input.cellKey,
          factionId: faction,
          cityId: check.anchorCity,
          durability: computed.rules.beaconDurability,
          builtAtMs: now(),
          builtBy: actor.userId,
        };
        beacons.set(beacon.id, beacon);
        writer.upsert("beacons", beaconRow(beacon));
        cache.delete(input.planetId);
        await writer.durable();
        return { ok: true, beaconId: beacon.id };
      });
    },
    remove(actor, beaconId) {
      return serial(async () => {
        if (!options.ready()) return fail("busy");
        const beacon = beacons.get(beaconId);
        if (!beacon) return fail("unknown_beacon");
        if (!actor.devPlace && (await factionOfUser(actor.userId)) !== beacon.factionId)
          return fail("forbidden");
        beacons.delete(beaconId);
        writer.remove("beacons", { id: beaconId });
        cache.delete(beacon.planetId);
        await writer.durable();
        return { ok: true };
      });
    },
    async planetView(planetId, userId) {
      const computed = await current(planetId);
      if (!computed) return undefined;
      return view(computed, planetId, userId === null ? null : await factionOfUser(userId));
    },
    async mineView(planetId, userId) {
      const computed = await current(planetId);
      if (!computed) return undefined;
      const mine = await factionOfUser(userId);
      const full = view(computed, planetId, mine);
      return {
        ...full,
        factions: full.factions.filter((faction) => faction.id === mine),
        cities: full.cities.filter((city) => city.factionId === mine),
        beacons: full.beacons.filter((beacon) => beacon.factionId === mine),
        groups: full.groups.filter((group) => group.factionId === mine),
        cells: full.cells.filter((cell) => cell[1] === mine),
      };
    },
    beaconCount: () => beacons.size,
  };
}
