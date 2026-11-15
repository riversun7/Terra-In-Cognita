// 영토 서비스(서버 권위) — docs/adr/2026-11-03-territory-layer.md 3·4·5절, 기획 D-485·D-486·D-104·49 M2·M3·N42·N51
// - 비콘: 메모리 표(원본은 territory_beacons)가 캐시이고 쓰는 프로세스가 하나라(ADR 3) 놓기·치우기는 메모리 → 쓰기 대기열 → 커밋 뒤 답한다.
// - 도시: world_cities를 그때 읽는다(NPC 사회 런타임이 주인·발전도를 바꾸고 새 마을을 넣는다). 명령은 대기열을 비운 뒤 새로 읽고, 조회는
//   행성마다 셈한 배치를 VIEW_TTL_MS 동안 쓴다(비콘이 바뀌면 바로 버린다). 사라진 세력(dissolved_at_ms)의 도시·비콘은 셈에서 뺀다.
// - 셈: @terra/shared/territory(껍질·소속·겹침·놓기 검사) + @terra/planet/territory(칸 → 점, 칸 표). 둘 다 결정적이다.
// - 비콘 시설: 팩 시설 territory_beacon(건설 재료 D-508, 시설은 늘 켜져 있고 팩에 없을 때만 disabled). 건물 규칙(기획 336,
//   docs/adr/2026-11-07-buildings-runtime.md): 놓을 때 레벨 1 재료를 놓는 사용자의 주인 원장에서 빼고(construction.spend), 건설 시간(M14)
//   뒤에 꼭짓점이 된다. 상태는 쓰지 않는 건물이라 노화만(30%에서 멈춤, D-509) — 그때 셈한다. 30% 미만(공격·옛 줄)이면 꼭짓점에서 빠진다.
//   재료는 그 세력에서 비콘 칸과 가장 가까운 도시의 내 도시 창고 + 그 도시의 내 창고 시설에서만 꺼낸다(질문 410 ①). 전투 피해(질문 381)는
//   damageBeacon이 상태를 줄인다(0이어도 지우지 않는다, 380).
//   개발 대신 놓기(territory: dev-place)는 옛 관리자 짓기처럼 재료 없이 바로 선다. 수리는 건물 서비스가 작업으로 하고 repairBeacon으로 더한다.
// - 기준 도시를 빼앗기면 비콘도 도시와 함께 넘어간다(D-512 335, 사용자 답): 도시 주인이 바뀌는 길(NPC 사회 런타임의 점령·반란·독립)은 모두
//   런타임 저장(npc/persist.ts flush)의 도시 줄 쓰기를 거치고, 그 자리에서 cityOwnerChanged를 같은 묶음으로 부른다. 셈(compute)도 DB 도시
//   주인과 다른 비콘을 옮겨 맞춘다(옛 판이 남긴 줄·다른 길). 개수·거리는 새 주인 세력 기준으로 다시 센다(배치를 새로 셈).
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
  nearestFactionCity,
  urbanCityAt,
} from "@terra/shared/territory";
import type {
  TerritoryBeaconFacilityView,
  TerritoryFactionView,
  TerritoryPlanetView,
} from "@terra/shared/territoryApi";
import type { LocalizedName } from "@terra/shared/roster";
import {
  CONDITION_FULL,
  type FacilityRuntimeRules,
  advanceCondition,
  conditionWorks,
  durabilityPoints,
} from "@terra/shared/facilityRuntime";
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
  /** 상태(ppm)와 그 시각(null = 다 지은 시각부터) */
  readonly conditionPpm: number;
  readonly conditionAtMs: number | null;
  /** 다 지어지는 시각(null = 다 지음) */
  readonly readyAtMs: number | null;
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
  /** 세력 코드 → 나라 이름(팩 국가 프리셋, 모르면 undefined) — 건물 판 주인 이름표(business/names.ts) */
  factionNameOf?(code: string): LocalizedName | undefined;
  place(
    actor: TerritoryActor,
    input: { readonly planetId: string; readonly cellKey: number; readonly factionId?: number | undefined },
  ): Promise<BeaconCommandResult>;
  remove(actor: TerritoryActor, beaconId: number): Promise<BeaconCommandResult>;
  /** 행성의 영토 전체(개발 화면). myFactionId = 그 사용자가 가입한 세력 */
  planetView(planetId: string, userId: string | null): Promise<TerritoryPlanetView | undefined>;
  /** 내 세력 것만 거른 영토(세력 영토·비콘 목록). 세력이 없으면 myFactionId null·빈 목록 */
  mineView(planetId: string, userId: string): Promise<TerritoryPlanetView | undefined>;
  /**
   * 도시 주인이 바뀌었다(D-512 335): 그 도시가 기준 도시인 비콘을 새 주인 세력으로 옮긴다(쓰기 대기열, 부르는 쪽의 도시 줄과 같은 묶음).
   * 옮긴 수
   */
  cityOwnerChanged(cityId: number, factionId: number): number;
  readonly beaconCount: () => number;
  /** 비콘 하나(없으면 undefined)와 지금 상태(ppm) */
  beaconState(
    beaconId: number,
    atMs: number,
  ): { readonly row: BeaconRow; readonly conditionPpm: number } | undefined;
  /** 그 사용자가 이 비콘을 고칠 수 있나(내 세력 비콘) */
  canManage(userId: string, beaconId: number): Promise<boolean>;
  /** 수리를 더한다(건물 서비스의 수리 작업이 끝날 때, 쓰기 대기열). 없으면 false */
  repairBeacon(beaconId: number, restorePpm: number, atMs: number): boolean;
  /** 짓기를 바로 끝낸다(개발 시험). 짓는 중이 아니면 false */
  finishBeacon(beaconId: number, atMs: number): boolean;
  /** 재료를 꺼내는 도시: 그 비콘 세력에서 비콘 칸과 가장 가까운 도시(질문 410 ①). 세력 도시가 없으면 null */
  supplyCity(beaconId: number): Promise<BeaconSupply | null>;
  /**
   * 그 자리가 어느 도시의 시가지(안전지대, D-146: 영향권 반경 ÷ 3) 안인가 — 그 도시 ID, 아니면 null. 2차맵 배치 칸(건물) 또는 1차맵 칸
   * 중심(비콘). 시가지 안의 건물은 공성 시간에만 공격받는다(D-174·D-184). 영토를 셈하지 않는 행성이면 null
   */
  urbanCity(
    planetId: string,
    at: { readonly mapKey: number; readonly x: number; readonly y: number } | { readonly cellKey: number },
  ): Promise<number | null>;
  /**
   * 전투 피해(질문 381·기획 336 ③): 잃은 내구도 점 × 가득 ÷ N51만큼 상태를 줄인다(destroyed면 0). 30% 미만이면 꼭짓점이 아니고 0이어도
   * 지우지 않는다(380, 수리하면 돌아온다). 쓰기 대기열에만 쓴다(전투 결과 기록과 같은 커밋). 없으면 false
   */
  damageBeacon(beaconId: number, lost: number, destroyed: boolean, atMs: number): boolean;
}

/** 영토 비콘 재료를 꺼내는 도시(그 세력에서 비콘 칸과 가장 가까운 도시, 질문 410 ①) */
export interface BeaconSupply {
  readonly cityId: number;
  /** 그 도시 시청이 선 2차맵(그 도시의 창고 시설을 찾는다) */
  readonly mapKey: number;
}

/** 비콘 짓기(건물 규칙, 기획 336): 설정 칸 N50과 재료 빼기 */
export interface BeaconConstruction {
  readonly rules: () => FacilityRuntimeRules;
  /**
   * 놓는 사용자의 주인 원장에서 재료를 뺀다: 그 도시(supply)의 내 도시 창고 + 그 도시의 내 창고 시설에서만(질문 410 ①). 도시가 없거나
   * 모자라면 false(아무것도 바꾸지 않는다)
   */
  readonly spend: (
    userId: string,
    materials: readonly { readonly item: string; readonly qty: number }[],
    atMs: number,
    supply: BeaconSupply | null,
  ) => boolean;
}

export interface TerritoryServiceOptions {
  readonly pool: QueryPool;
  readonly writer: WorldWriter;
  readonly now: () => number;
  /** 영토 계수(설정 칸 실효 값), 부를 때마다 읽는다 */
  readonly rules: () => TerritoryCoefficients;
  /** 팩 시설 territory_beacon 실효 값(팩에 있나·재료). 없으면 있음·재료 없음 */
  readonly beaconFacility: () => TerritoryBeaconFacilityView;
  /** 영토를 셈하는 행성의 면 레벨(세계 행성만) */
  readonly faceLevelOf: (planetId: string) => number | undefined;
  /** 세력 화면 이름(코드 → 이름) */
  readonly factionName?: ((code: string) => LocalizedName | undefined) | undefined;
  /** 세계가 준비됐나(아니면 busy) */
  readonly ready: () => boolean;
  /** 건물 규칙(재료·건설 시간·노화). 없으면 옛처럼 재료 없이 바로·노화 없음(시험) */
  readonly construction?: BeaconConstruction | undefined;
}

export async function loadBeacons(pool: QueryPool): Promise<BeaconRow[]> {
  const result = await pool.query(
    `select id, planet_id, cell_key, faction_id, city_id, durability, built_at_ms, built_by,
            condition_ppm, condition_at_ms, ready_at_ms
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
    conditionPpm: Number(row.condition_ppm),
    conditionAtMs: row.condition_at_ms === null ? null : Number(row.condition_at_ms),
    readyAtMs: row.ready_at_ms === null ? null : Number(row.ready_at_ms),
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
  condition_ppm: beacon.conditionPpm,
  condition_at_ms: beacon.conditionAtMs,
  ready_at_ms: beacon.readyAtMs,
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

  /** 지금 상태(ppm): 다 지은 뒤 노화만(쓰지 않는 건물, D-509). 건물 규칙이 없으면 적힌 값 그대로 */
  const conditionNow = (beacon: BeaconRow, at: number): number => {
    const rules = options.construction?.rules();
    if (!rules) return beacon.conditionPpm;
    if (beacon.readyAtMs !== null && beacon.readyAtMs > at) return beacon.conditionPpm;
    const from = beacon.conditionAtMs ?? beacon.readyAtMs ?? beacon.builtAtMs;
    return advanceCondition(beacon.conditionPpm, at - from, false, rules);
  };
  /** 꼭짓점이 되나: 다 지었고 30% 이상(N50 기능 정지 문턱) */
  const works = (beacon: BeaconRow, at: number): boolean => {
    if (beacon.readyAtMs !== null && beacon.readyAtMs > at) return false;
    const rules = options.construction?.rules();
    return !rules || conditionWorks(conditionNow(beacon, at), rules);
  };
  const saveBeacon = (beacon: BeaconRow): void => {
    beacons.set(beacon.id, beacon);
    writer.upsert("beacons", beaconRow(beacon));
    cache.delete(beacon.planetId);
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

  /** 기준 도시가 cityId인 비콘을 factionId로 옮긴다(메모리 → 쓰기 대기열, 배치 캐시는 버린다). 옮긴 수 */
  const moveWithCity = (cityId: number, factionId: number): number => {
    let moved = 0;
    for (const beacon of [...beacons.values()].toSorted((a, b) => a.id - b.id)) {
      if (beacon.cityId !== cityId || beacon.factionId === factionId) continue;
      const next: BeaconRow = { ...beacon, factionId };
      beacons.set(next.id, next);
      writer.upsert("beacons", beaconRow(next));
      cache.delete(next.planetId);
      moved += 1;
    }
    return moved;
  };

  /** 행성 배치를 새로 셈한다(도시·세력은 DB에서, 비콘은 메모리에서) */
  const compute = async (planetId: string, faceLevel: number): Promise<Computed> => {
    await writer.durable();
    const [factions, allCities] = await Promise.all([loadFactions(), loadCityRecords(planetId)]);
    // 기준 도시의 주인과 다른 비콘은 도시를 따라간다(D-512 335). 런타임 저장이 이미 옮겼으면 할 일이 없다
    const ownerOf = new Map(allCities.map((city) => [city.id, city.factionId]));
    let adopted = 0;
    // 돌면서 있는 키의 값만 바꾼다(새 키를 넣지 않는다)
    for (const beacon of beacons.values()) {
      if (beacon.planetId !== planetId || beacon.cityId === null) continue;
      const owner = ownerOf.get(beacon.cityId);
      if (owner !== undefined && owner !== beacon.factionId) adopted += moveWithCity(beacon.cityId, owner);
    }
    if (adopted > 0) await writer.durable();
    const rules = options.rules();
    const cities = allCities.filter((city) => factions.has(city.factionId) && isCellKey(city.mapKey));
    const at = now();
    const planetBeacons = [...beacons.values()]
      .filter((beacon) => beacon.planetId === planetId && factions.has(beacon.factionId))
      .toSorted((a, b) => a.id - b.id);
    // 짓는 중·30% 미만 비콘은 꼭짓점이 아니다(건물 규칙, 기획 336). 목록(view)에는 모두 보인다
    const vertexBeacons = planetBeacons.filter((beacon) => works(beacon, at));
    const layout = buildTerritory(
      cities.map((city) => ({
        id: city.id,
        faction: city.factionId,
        point: territoryPoint(placementCellKey(parseCellKey(city.mapKey), city.cellX, city.cellY)),
        grade: cityGrade(city.development, rules),
      })),
      vertexBeacons.map((beacon) => ({
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
      ...vertexBeacons.map((beacon) => parseCellKey(beacon.cellKey)),
    ];
    const cells = rasterizeTerritory(layout, seeds, faceLevel);
    const computed: Computed = {
      atMs: at,
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

  /** 재료를 꺼내는 도시(질문 410 ①): 그 세력에서 비콘 칸과 가장 가까운 도시 */
  const supplyOf = (computed: Computed, faction: number, cell: number): BeaconSupply | null => {
    const id = nearestFactionCity(computed.layout.cities, faction, territoryPoint(parseCellKey(cell)));
    const city = id === null ? undefined : computed.cities.find((entry) => entry.id === id);
    return city ? { cityId: city.id, mapKey: city.mapKey } : null;
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
      beacons: computed.beacons.map((beacon) => {
        const condition = conditionNow(beacon, computed.atMs);
        return {
          id: beacon.id,
          factionId: beacon.factionId,
          cityId: beacon.cityId,
          cellKey: beacon.cellKey,
          point: territoryPoint(parseCellKey(beacon.cellKey)),
          durability: options.construction
            ? durabilityPoints(condition, computed.rules.beaconDurability)
            : beacon.durability,
          builtAtMs: beacon.builtAtMs,
          conditionPpm: condition,
          readyAtMs: beacon.readyAtMs,
        };
      }),
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
    factionNameOf: (code) => options.factionName?.(code),
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
        // 짓는 중·멈춘 비콘도 기준 도시의 개수에 센다(배치 셈에는 꼭짓점만 들어간다)
        const anchor = computed.layout.cities.find((city) => city.id === check.anchorCity);
        const limit = anchor ? gradeValue(computed.rules.beaconsPerCity, anchor.grade) : 0;
        let used = 0;
        for (const beacon of beacons.values()) if (beacon.cityId === check.anchorCity) used += 1;
        if (anchor && used >= limit) return fail("beacon_limit");
        // 건물 규칙(기획 336): 재료를 빼고 건설 시간 뒤에 선다. 개발 대신 놓기는 옛 관리자처럼 재료 없이 바로.
        // 재료는 그 세력에서 비콘 칸과 가장 가까운 도시의 내 도시 창고 + 그 도시의 내 창고 시설에서(질문 410 ①)
        const at = now();
        const facility = options.beaconFacility();
        const build = options.construction && !actor.devPlace;
        const supply = supplyOf(computed, faction, input.cellKey);
        if (build && !options.construction?.spend(actor.userId, facility.materials, at, supply))
          return fail("insufficient_materials");
        const buildMs = build ? (facility.buildMs ?? 0) : 0;
        lastId += 1;
        const beacon: BeaconRow = {
          id: lastId,
          planetId: input.planetId,
          cellKey: input.cellKey,
          factionId: faction,
          cityId: check.anchorCity,
          durability: computed.rules.beaconDurability,
          builtAtMs: at,
          builtBy: actor.userId,
          conditionPpm: CONDITION_FULL,
          conditionAtMs: buildMs > 0 ? at + buildMs : at,
          readyAtMs: buildMs > 0 ? at + buildMs : null,
        };
        saveBeacon(beacon);
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
    cityOwnerChanged: (cityId, factionId) => moveWithCity(cityId, factionId),
    beaconCount: () => beacons.size,
    beaconState(beaconId, atMs) {
      const row = beacons.get(beaconId);
      return row ? { row, conditionPpm: conditionNow(row, atMs) } : undefined;
    },
    async canManage(userId, beaconId) {
      const row = beacons.get(beaconId);
      return row !== undefined && (await factionOfUser(userId)) === row.factionId;
    },
    repairBeacon(beaconId, restorePpm, atMs) {
      const row = beacons.get(beaconId);
      if (!row) return false;
      const next = Math.min(CONDITION_FULL, conditionNow(row, atMs) + Math.max(0, restorePpm));
      saveBeacon({ ...row, conditionPpm: next, conditionAtMs: atMs });
      return true;
    },
    finishBeacon(beaconId, atMs) {
      const row = beacons.get(beaconId);
      if (!row || row.readyAtMs === null || row.readyAtMs <= atMs) return false;
      saveBeacon({ ...row, readyAtMs: null, conditionAtMs: atMs });
      return true;
    },
    async urbanCity(planetId, at) {
      const computed = await current(planetId);
      if (!computed) return null;
      const key =
        "cellKey" in at ? parseCellKey(at.cellKey) : placementCellKey(parseCellKey(at.mapKey), at.x, at.y);
      return urbanCityAt(computed.layout, territoryPoint(key));
    },
    async supplyCity(beaconId) {
      const row = beacons.get(beaconId);
      const computed = row ? await current(row.planetId) : undefined;
      return row && computed ? supplyOf(computed, row.factionId, row.cellKey) : null;
    },
    damageBeacon(beaconId, lost, destroyed, atMs) {
      const row = beacons.get(beaconId);
      if (!row) return false;
      const condition = conditionNow(row, atMs);
      const max = Math.max(1, options.rules().beaconDurability);
      const loss = destroyed ? condition : Math.ceil((lost * CONDITION_FULL) / max);
      // 짓는 중이면 노화 시작 시각(다 지은 시각)을 그대로 둔다
      const building = row.readyAtMs !== null && row.readyAtMs > atMs;
      saveBeacon({
        ...row,
        conditionPpm: Math.max(0, condition - loss),
        conditionAtMs: building ? row.conditionAtMs : atMs,
      });
      return true;
    },
  };
}
