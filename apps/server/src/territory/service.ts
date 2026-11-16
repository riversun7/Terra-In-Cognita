// 영토 서비스(서버 권위) — docs/adr/2026-11-03-territory-layer.md 3·4·5절, 기획 D-568(판정도 1차맵 지도대로)·D-546·D-104·49 M2·M3·N42·N51
// - 비콘: 메모리 표(원본은 territory_beacons)가 캐시이고 쓰는 프로세스가 하나라(ADR 3) 놓기·치우기는 메모리 → 쓰기 대기열 → 커밋 뒤 답한다.
// - 도시: world_cities를 그때 읽는다(NPC 사회 런타임이 주인·발전도를 바꾸고 새 마을을 넣는다). 명령은 대기열을 비운 뒤 새로 읽고, 조회는
//   행성마다 셈한 배치를 VIEW_TTL_MS 동안 쓴다(비콘이 바뀌면 바로 버린다). 사라진 세력(dissolved_at_ms)의 도시·비콘은 셈에서 뺀다.
// - 셈: @terra/shared/territory·territoryMap(1차맵 영토 지도 — 도시 원·띠·비콘 외곽선·영향력 비율, 소속·놓기 검사) +
//   @terra/planet/territory(칸 → 점, 칸 표). 둘 다 결정적이다. 도시 원 바탕 = 배후지 지금 반경(인구·발전도 등급·기술, 1차맵 world.cities와
//   같은 함수), 값 = 설정 칸 planet_territory_*(1차맵 화면과 같은 값, D-568). 지방(건물 도시·세금)은 provinceAt이 마지막 셈으로 답한다.
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
  startTerritoryRaster,
  territoryMetric,
  territoryPoint,
} from "@terra/planet/territory";
import type { BeaconResultCode } from "@terra/protocol";
import { catchmentRadiusMilli } from "@terra/shared/catchment";
import {
  type TerritoryClaim,
  type TerritoryCoefficients,
  type TerritoryLayout,
  buildTerritory,
  checkBeaconPlacement,
  claimAt,
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
import { TERRITORY_MAP_START, type TerritoryMapValues } from "@terra/shared/territoryMap";
import {
  CONDITION_FULL,
  type FacilityRuntimeRules,
  advanceCondition,
  conditionWorks,
  durabilityPoints,
} from "@terra/shared/facilityRuntime";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { CatchmentRadiusRules } from "./catchmentRules.ts";

/** 조회용 배치를 다시 셈하는 간격(ms). 비콘이 바뀌면 바로 다시 셈한다 */
export const VIEW_TTL_MS = 30_000;

/**
 * 칸 표 나눠 셈(질문 1930): 한 조각 = 이 시간(ms)까지 칸을 보고 이벤트 루프에 양보한다(setImmediate). 칸 하나는 표본 16곳이라 약 0.1~0.3ms
 * (작업 기록 측정) — 조각마다 RASTER_STEP_CELLS칸씩 보며 시간을 잰다
 */
export const RASTER_SLICE_MS = 8;
export const RASTER_STEP_CELLS = 8;

/** 자리 하나(2차맵 배치 칸 또는 1차맵 칸 중심) */
export type TerritoryPlace =
  | { readonly mapKey: number; readonly x: number; readonly y: number }
  | { readonly cellKey: number };

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
  /** 사는 휴먼 수·주인 세력 기술 단계(배후지 지금 반경) */
  readonly population: number;
  readonly tech: number;
}

interface FactionRecord {
  readonly id: number;
  readonly code: string | null;
  readonly kind: "npc" | "player";
}

export type BeaconCommandResult =
  | { readonly ok: true; readonly beaconId?: number }
  | { readonly ok: false; readonly code: BeaconResultCode };

/**
 * 조회 선택: cells = 칸 표를 싣나(기본 true). 칸 표 셈(rasterizeTerritory)은 무거워(1차맵 지도 영토가 넓어 칸이 많다, D-568 — 작업 기록 측정)
 * 처음 찾을 때 셈하고 그 배치 동안 쓴다. 칸 표가 필요 없는 조회(1차맵 world.cities·공격 대상)는 false로 셈을 건너뛴다
 */
export interface TerritoryViewOptions {
  readonly cells?: boolean | undefined;
}

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
  planetView(
    planetId: string,
    userId: string | null,
    options?: TerritoryViewOptions,
  ): Promise<TerritoryPlanetView | undefined>;
  /** 내 세력 것만 거른 영토(세력 영토·비콘 목록). 세력이 없으면 myFactionId null·빈 목록 */
  mineView(
    planetId: string,
    userId: string,
    options?: TerritoryViewOptions,
  ): Promise<TerritoryPlanetView | undefined>;
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
   * 그 자리가 어느 도시의 시가지(안전지대, D-146: 등급별 영향권 ÷ 3 — D-104, D-572 질문 1987) 안인가 — 그 도시 ID, 아니면 null. 2차맵
   * 배치 칸(건물) 또는 1차맵 칸 중심(비콘). 시가지 안의 건물은 공성 시간에만 공격받는다(D-174·D-184). 영토를 셈하지 않는 행성이면 null
   */
  urbanCity(planetId: string, at: TerritoryPlace): Promise<number | null>;
  /**
   * 자리마다 1차맵 영토 소속(D-568 — 칸 표 없이 claimAt만, 질문 1930): 조회용 배치(VIEW_TTL_MS)로 답한다. 영토 밖이면 null, 영토를 셈하지
   * 않는 행성이면 undefined. 2차맵 건설 땅 규칙(facilities/landRule.ts, 질문 1927)·이동 위험 구간(worldMap/travelDanger.ts)이 쓴다.
   * 1차맵 칸 중심(cellKey)은 면 레벨이 다르면 null
   */
  claimsAt(
    planetId: string,
    places: readonly TerritoryPlace[],
  ): Promise<readonly (TerritoryClaim | null)[] | undefined>;
  /**
   * 지방(D-568 — 1차맵 영토 지도 그대로): 2차맵 배치 칸이 어느 나라·어느 도시 땅인가. 마지막으로 셈한 배치로 바로 답하고(동기), 셈이 오래됐으면
   * 뒤에서 다시 셈한다. 영토 밖이면 null, 아직 셈한 배치가 없거나 영토를 셈하지 않는 행성·면 레벨이 다른 칸이면 undefined(부르는 쪽이 옛
   * 규칙으로 정한다). 건물 도시(세금 귀속·재료 자리, facilities/places.ts cityAt)가 쓴다
   */
  provinceAt(
    planetId: string,
    mapKey: number,
    x: number,
    y: number,
  ): { readonly faction: number; readonly city: number | null } | null | undefined;
  /** 부팅 끝에 그 행성 배치를 한 번 셈해 둔다(provinceAt이 처음부터 답하게 — 칸 표는 셈하지 않는다). 실패하면 조용히 넘어간다 */
  warm(planetId: string): Promise<void>;
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
  /** 1차맵 영토 값(설정 칸 planet_territory_* 실효 값, 화면과 같은 값 — D-568). 없으면 출발값 */
  readonly mapValues?: (() => TerritoryMapValues) | undefined;
  /** 배후지 지금 반경 규칙(영토 원 바탕). 없거나 undefined면 영향권 반경(M3)이 바탕(1차맵 화면과 같다) */
  readonly catchment?: (() => CatchmentRadiusRules | undefined) | undefined;
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

/** 자리 → 점의 칸 키(2차맵 배치 칸 또는 1차맵 칸 중심). 칸 키가 아니거나 면 레벨이 다르면 undefined */
function placeKeyOf(at: TerritoryPlace, faceLevel: number): CellKey | undefined {
  if ("cellKey" in at)
    return isCellKey(at.cellKey) && cellLevel(at.cellKey) === faceLevel
      ? parseCellKey(at.cellKey)
      : undefined;
  if (!isCellKey(at.mapKey) || cellLevel(at.mapKey) !== faceLevel) return undefined;
  return placementCellKey(parseCellKey(at.mapKey), at.x, at.y);
}

interface Computed {
  readonly atMs: number;
  /** 배치를 셈한 시간(ms, 측정용) */
  readonly computeMs: number;
  /** 칸 표를 셈한 시간(ms, 측정용 — 셈했을 때만, 조각 CPU 합) */
  rasterMs?: number;
  /** 칸 표 조각 하나의 가장 긴 시간(ms, 측정용 — 메인 스레드를 한 번에 잡은 가장 긴 시간) */
  rasterSliceMs?: number;
  readonly layout: TerritoryLayout;
  readonly faceLevel: number;
  readonly rules: TerritoryCoefficients;
  readonly mapValues: TerritoryMapValues;
  readonly cities: readonly CityRecord[];
  readonly factions: ReadonlyMap<number, FactionRecord>;
  readonly beacons: readonly BeaconRow[];
  /** 칸 표(처음 찾을 때 나눠 셈한다 — cellsOf) */
  cells: Map<CellKey, { faction: number; province: number | null; samples: number }> | undefined;
  /** 셈하는 중인 칸 표(같은 배치를 겹쳐 셈하지 않는다) */
  cellsJob?: Promise<void>;
  readonly seeds: readonly CellKey[];
}

export function createTerritoryService(
  options: TerritoryServiceOptions,
  loaded: readonly BeaconRow[],
): TerritoryService {
  const { pool, writer, now } = options;
  const beacons = new Map<number, BeaconRow>(loaded.map((beacon) => [beacon.id, beacon]));
  let lastId = loaded.reduce((max, beacon) => Math.max(max, beacon.id), 0);
  const cache = new Map<string, Computed>();
  /** 마지막으로 셈한 배치(비콘이 바뀌어 cache를 버려도 남는다 — provinceAt이 다시 셈할 때까지 쓴다) */
  const last = new Map<string, Computed>();
  /** 뒤에서 다시 셈하는 중인 행성(같은 행성을 겹쳐 셈하지 않는다) */
  const refreshing = new Set<string>();
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
      `select c.id, c.faction_id, c.map_key, c.cell_x, c.cell_y, c.development, f.tech_level as tech,
              (select count(*) from world_humans h where h.city_id = c.id) as population
       from world_cities c left join factions f on f.id = c.faction_id
       where c.planet_id = $1 order by c.id`,
      [planetId],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      factionId: Number(row.faction_id),
      mapKey: Number(row.map_key),
      cellX: Number(row.cell_x),
      cellY: Number(row.cell_y),
      development: Number(row.development),
      population: Number(row.population ?? 0),
      tech: Number(row.tech ?? 1),
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
    // 영토 원 바탕 = 배후지 지금 반경(1차맵 world.cities catchmentMilli와 같은 함수·같은 입력), 배후지 규칙이 꺼졌으면 영향권
    const catchment = options.catchment?.();
    const mapValues = options.mapValues?.() ?? TERRITORY_MAP_START;
    const started = performance.now();
    const layout = buildTerritory(
      cities.map((city) => ({
        id: city.id,
        faction: city.factionId,
        point: territoryPoint(placementCellKey(parseCellKey(city.mapKey), city.cellX, city.cellY)),
        grade: cityGrade(city.development, rules),
        catchmentMilli: catchment
          ? catchmentRadiusMilli(
              {
                population: city.population,
                grade: cityGrade(city.development, catchment.territory),
                tech: city.tech,
              },
              catchment.growth,
            )
          : null,
      })),
      vertexBeacons.map((beacon) => ({
        id: beacon.id,
        faction: beacon.factionId,
        point: territoryPoint(parseCellKey(beacon.cellKey)),
        anchorCity: beacon.cityId,
      })),
      rules,
      territoryMetric(faceLevel),
      mapValues,
    );
    const seeds = [
      ...cities.map((city) => parseCellKey(city.mapKey)),
      ...vertexBeacons.map((beacon) => parseCellKey(beacon.cellKey)),
    ];
    const computed: Computed = {
      atMs: at,
      computeMs: performance.now() - started,
      layout,
      faceLevel,
      rules,
      mapValues,
      cities,
      factions,
      beacons: planetBeacons,
      cells: undefined,
      seeds,
    };
    cache.set(planetId, computed);
    last.set(planetId, computed);
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

  /**
   * 칸 표(처음 찾을 때 셈하고 그 배치 동안 쓴다). 큰 세계에서는 수백 ms~수 초라(질문 1930) 조각(RASTER_SLICE_MS)마다 이벤트 루프에 양보하며
   * 나눠 셈한다. 결과는 한 번에 셈한 것과 같다(startTerritoryRaster)
   */
  const cellsOf = (computed: Computed): Promise<void> => {
    if (computed.cells) return Promise.resolve();
    computed.cellsJob ??= (async () => {
      const job = startTerritoryRaster(computed.layout, computed.seeds, computed.faceLevel);
      let busy = 0;
      let longest = 0;
      for (;;) {
        const sliceStart = performance.now();
        let done = false;
        while (!done && performance.now() - sliceStart < RASTER_SLICE_MS) done = job.step(RASTER_STEP_CELLS);
        const cells = done ? job.result() : undefined;
        const slice = performance.now() - sliceStart;
        busy += slice;
        longest = Math.max(longest, slice);
        if (cells) {
          computed.cells = cells;
          computed.rasterMs = busy;
          computed.rasterSliceMs = longest;
          return;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    })();
    return computed.cellsJob;
  };

  const view = (
    computed: Computed,
    planetId: string,
    myFactionId: number | null,
    withCells = true,
  ): TerritoryPlanetView => {
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
      mapValues: computed.mapValues,
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
            catchmentMilli: placed.catchmentMilli ?? null,
            territoryMilli: placed.territoryMilli,
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
        // D-568부터 껍질 판정이 없다(옛 화면 호환으로 칸만 남긴다)
        hull: null,
      })),
      cells: [...((withCells ? computed.cells : undefined) ?? new Map<CellKey, never>()).entries()].map(
        ([key, cell]) => [key, cell.faction, cell.province ?? 0, cell.samples],
      ),
      myFactionId,
      computedAtMs: computed.atMs,
      computeMs: Math.round(computed.computeMs * 10) / 10,
      ...(computed.rasterMs === undefined ? {} : { rasterMs: Math.round(computed.rasterMs * 10) / 10 }),
      ...(computed.rasterSliceMs === undefined
        ? {}
        : { rasterSliceMs: Math.round(computed.rasterSliceMs * 10) / 10 }),
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
    async planetView(planetId, userId, viewOptions) {
      const computed = await current(planetId);
      if (!computed) return undefined;
      const withCells = viewOptions?.cells ?? true;
      if (withCells) await cellsOf(computed);
      const mine = userId === null ? null : await factionOfUser(userId);
      return view(computed, planetId, mine, withCells);
    },
    async mineView(planetId, userId, viewOptions) {
      const computed = await current(planetId);
      if (!computed) return undefined;
      const withCells = viewOptions?.cells ?? true;
      if (withCells) await cellsOf(computed);
      const mine = await factionOfUser(userId);
      const full = view(computed, planetId, mine, withCells);
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
    async warm(planetId) {
      const faceLevel = options.faceLevelOf(planetId);
      if (faceLevel !== undefined) await compute(planetId, faceLevel).catch(() => undefined);
    },
    provinceAt(planetId, mapKey, x, y) {
      const faceLevel = options.faceLevelOf(planetId);
      if (faceLevel === undefined || !isCellKey(mapKey) || cellLevel(mapKey) !== faceLevel) return undefined;
      const fresh = cache.get(planetId);
      if ((!fresh || now() - fresh.atMs >= VIEW_TTL_MS) && !refreshing.has(planetId) && options.ready()) {
        refreshing.add(planetId);
        void compute(planetId, faceLevel)
          .catch(() => undefined)
          .finally(() => refreshing.delete(planetId));
      }
      const computed = last.get(planetId);
      if (!computed) return undefined;
      const claim = claimAt(computed.layout, territoryPoint(placementCellKey(parseCellKey(mapKey), x, y)));
      return claim ? { faction: claim.faction, city: claim.province } : null;
    },
    async urbanCity(planetId, at) {
      const computed = await current(planetId);
      if (!computed) return null;
      const key = placeKeyOf(at, computed.faceLevel);
      return key === undefined ? null : urbanCityAt(computed.layout, territoryPoint(key));
    },
    async claimsAt(planetId, places) {
      const computed = await current(planetId);
      if (!computed) return undefined;
      return places.map((at) => {
        const key = placeKeyOf(at, computed.faceLevel);
        return key === undefined ? null : claimAt(computed.layout, territoryPoint(key));
      });
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
