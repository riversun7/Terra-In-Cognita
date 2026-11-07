// 지도 흐름 조회(서버, 읽기만) — tRPC world.cities·world.myPosition. docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1·§7.1.
// - 도시: world_cities를 그때 읽는다(NPC 사회 런타임이 주인을 바꾸고 새 마을을 넣는다 — 쓰기 대기열이 커밋한 뒤의 값). 사라진 세력의 도시는 뺀다.
//   등급·영향권·영토 껍질은 영토 서비스의 셈(조회 캐시)을 그대로 쓴다. 셈이 실패해도 도시는 보인다(그 칸만 비운다).
// - 둘레 땅: 행성 값 파일(월드 행성, 2차맵 지형 서비스와 같은 바이트)에서 그 2차맵 칸 하나만 읽는다. 행성 값이 아직 없으면(굽는 중) 기다리지
//   않고 land null로 답한다(다음 조회에서 채운다).
// - 들어갈 수 있나: 띄운 2차맵(loaded)과 내 시야 규칙(viewable = 구독과 같은 canViewSecondMap).
// - 내 자리: 사이보그 본체 유닛이 있는 띄운 2차맵과 지금 시각의 배치 칸.
// 세계 규칙은 바꾸지 않는다(조회만). 표·쓰기 대기열·NPC 런타임 파일은 건드리지 않는다.
import { type CellKey, decodeCellKey, isCellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import { placementCellKey } from "@terra/planet/territory";
import { planetCellValuesFromFile } from "@terra/planet/secondMap";
import { CELL_UNITS, PLACEMENT_SIZE, positionAt } from "@terra/sim";
import type { LocalizedName } from "@terra/shared/roster";
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import type {
  WorldCitiesResponse,
  WorldMapCity,
  WorldMapFaction,
  WorldMapHull,
  WorldMapLand,
  WorldPosition,
  WorldPositionResponse,
} from "@terra/shared/worldMap";
import { type NationPreset, nationName } from "../npc/nations.ts";
import type { Viewer } from "../trpc/context.ts";
import type { WorldDirectory } from "../world/gateway.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";
import type { World } from "../world/world.ts";
import { canViewSecondMap } from "../world/visibility.ts";

/** 이 모듈이 세계에서 읽는 것(시험은 가짜를 넣는다) */
export interface WorldMapSource {
  /** 띄운 2차맵(키 → 2차맵) */
  readonly maps: ReadonlyMap<number, SecondMap>;
  /** 시야 규칙(구독과 같은 canViewSecondMap)이 읽는 세계 — 사용자의 소유 주체 */
  readonly directory: WorldDirectory;
  /** 사이보그 본체 유닛 ID·시작 도시(없으면 undefined) */
  cyborgOf(userId: string): { readonly unitId: number | null; readonly startCityId: number } | undefined;
  /** 영토 셈(조회 캐시). 없으면(영토 서비스 없음) undefined */
  territory?: ((planetId: string, userId: string) => Promise<TerritoryPlanetView | undefined>) | undefined;
}

export interface WorldMapReadDeps {
  readonly planetId: string;
  readonly faceLevel: number;
  readonly pool: QueryPool;
  readonly source: WorldMapSource;
  /** 월드 행성 값 파일(행성 서비스, 준비되면 풀린다). 없으면 둘레 땅을 비운다 */
  readonly values?: (() => Promise<Uint8Array>) | undefined;
  /** 바이옴 ID → 이름(행성 목록 정보의 범례) */
  readonly biomeName?: ((id: string) => LocalizedName | undefined) | undefined;
  /** 세력 코드 → 화면 이름(팩 국가 프리셋 등) */
  readonly factionName?: ((code: string) => LocalizedName | undefined) | undefined;
}

export interface WorldMapReadServices {
  cities(viewer: Viewer, nowMs: number): Promise<WorldCitiesResponse>;
  position(viewer: Viewer, nowMs: number): WorldPositionResponse;
}

const DEG = 180 / Math.PI;
/** 둘레 땅을 위해 행성 값을 기다리는 상한(ms). 서버는 보통 듣기 전에 행성을 굽는다(이미 풀린 약속) */
const LAND_WAIT_MS = 1_500;
/** 위도·경도 소수 자리(표시용, 약 1m) */
const LAT_LON_DIGITS = 5;
const round = (value: number): number => Number(value.toFixed(LAT_LON_DIGITS));

/** 방향(단위가 아니어도 된다) → 위도·경도(°). 북극 +z, 경도 0 = +x, 동쪽 +y(엔진 globeCamera와 같다) */
export function latLonOfDirection(x: number, y: number, z: number): { latDeg: number; lonDeg: number } {
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  return {
    latDeg: round(Math.asin(Math.max(-1, Math.min(1, z / length))) * DEG),
    lonDeg: round(Math.atan2(y, x) * DEG),
  };
}

/** 2차맵 안 배치 칸 (x, y) 자리의 위도·경도. 칸이 틀리면 2차맵 칸 가운데 */
export function placeLatLon(mapKey: CellKey, x: number, y: number): { latDeg: number; lonDeg: number } {
  const inside = Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0;
  const key = inside && x < PLACEMENT_SIZE && y < PLACEMENT_SIZE ? placementCellKey(mapKey, x, y) : mapKey;
  const [cx, cy, cz] = cellCenter(key);
  return latLonOfDirection(cx, cy, cz);
}

interface CityRecord {
  readonly id: number;
  readonly factionId: number;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly start: boolean;
  readonly name: string | null;
  readonly code: string | null;
  readonly kind: "npc" | "player";
}

async function loadCityRecords(pool: QueryPool, planetId: string): Promise<CityRecord[]> {
  const result = await pool.query(
    `select c.id, c.faction_id, c.map_key, c.cell_x, c.cell_y, c.start, c.name, f.code, f.kind
     from world_cities c join factions f on f.id = c.faction_id
     where c.planet_id = $1 and f.dissolved_at_ms is null
     order by c.id`,
    [planetId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    factionId: Number(row.faction_id),
    mapKey: Number(row.map_key),
    cellX: Number(row.cell_x),
    cellY: Number(row.cell_y),
    start: row.start === true,
    name: typeof row.name === "string" ? row.name : null,
    code: typeof row.code === "string" ? row.code : null,
    kind: row.kind === "player" ? "player" : "npc",
  }));
}

async function myFactionOf(pool: QueryPool, userId: string): Promise<number | null> {
  const result = await pool.query(`select faction_id from faction_members where user_id = $1`, [userId]);
  const row = result.rows[0];
  return row ? Number(row.faction_id) : null;
}

export function createWorldMapReads(deps: WorldMapReadDeps): WorldMapReadServices {
  const { planetId, faceLevel, pool, source } = deps;
  // 행성 값 바이트: 처음 조회 때 받기를 걸고 LAND_WAIT_MS까지만 기다린다(이미 구웠으면 바로 풀린다. 굽는 중이면 land null, 다음 조회에서 채운다)
  let values: Uint8Array | null = null;
  let pending: Promise<Uint8Array | null> | null = null;
  const valuesSoon = async (): Promise<Uint8Array | null> => {
    if (values || !deps.values) return values;
    pending ??= deps.values().then(
      (bytes) => {
        values = bytes;
        return bytes;
      },
      () => {
        // 행성 값을 못 받았다(없는 행성 등): 둘레 땅 없이 답한다. 다음 조회에서 다시 묻는다
        pending = null;
        return null;
      },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LAND_WAIT_MS);
    });
    try {
      return await Promise.race([pending, late]);
    } finally {
      clearTimeout(timer);
    }
  };
  /** 같은 2차맵의 둘레 땅은 한 번만 읽는다(행성 값은 바뀌지 않는다) */
  const lands = new Map<number, WorldMapLand | null>();
  const landOf = (mapKey: number, bytes: Uint8Array | null): WorldMapLand | null => {
    const known = lands.get(mapKey);
    if (known !== undefined) return known;
    if (!bytes) return null;
    let land: WorldMapLand | null = null;
    try {
      const cell = planetCellValuesFromFile(bytes, mapKey);
      land = {
        biomeId: cell.biomeId,
        biomeName: cell.biomeId === null ? null : (deps.biomeName?.(cell.biomeId) ?? null),
        elevationM: cell.elevationM,
        temperatureC: cell.temperatureC,
        humidity: cell.humidity,
        precipitationMm: cell.precipitationMm,
        water: cell.water,
        forest: cell.forest,
      };
    } catch {
      // 행성 면 레벨과 다른 키 등: 그 도시만 땅 없이
      land = null;
    }
    lands.set(mapKey, land);
    return land;
  };

  const nameOf = (code: string | null): LocalizedName | null =>
    code === null ? null : (deps.factionName?.(code) ?? null);

  return {
    async cities(viewer, nowMs) {
      const [records, myFactionId, territory, bytes] = await Promise.all([
        loadCityRecords(pool, planetId),
        myFactionOf(pool, viewer.id),
        source.territory?.(planetId, viewer.id).catch(() => undefined) ?? Promise.resolve(undefined),
        valuesSoon(),
      ]);
      const territoryCities = new Map((territory?.cities ?? []).map((city) => [city.id, city]));
      const factions = new Map<number, WorldMapFaction>();
      const numbers = new Map<number, number>();
      // 띄운 2차맵마다 내 시야(구독과 같은 규칙)를 한 번씩 본다
      const loadedKeys = [...new Set(records.map((record) => record.mapKey))].filter((key) =>
        source.maps.has(key),
      );
      const viewable = new Map(
        await Promise.all(
          loadedKeys.map(async (key) => {
            const map = source.maps.get(key);
            return [key, map ? await canViewSecondMap(source.directory, viewer, map) : false] as const;
          }),
        ),
      );
      const cities: WorldMapCity[] = [];
      for (const record of records) {
        if (!isCellKey(record.mapKey)) continue;
        const cell = decodeCellKey(record.mapKey);
        if (cell.level !== faceLevel) continue;
        if (!factions.has(record.factionId))
          factions.set(record.factionId, {
            id: record.factionId,
            code: record.code,
            kind: record.kind,
            name: nameOf(record.code),
          });
        const number = (numbers.get(record.factionId) ?? 0) + 1;
        numbers.set(record.factionId, number);
        const map = source.maps.get(record.mapKey);
        const area = territoryCities.get(record.id);
        cities.push({
          id: record.id,
          factionId: record.factionId,
          number,
          name: record.name,
          mapKey: record.mapKey,
          face: cell.face,
          i: cell.i,
          j: cell.j,
          cellX: record.cellX,
          cellY: record.cellY,
          ...placeLatLon(record.mapKey, record.cellX, record.cellY),
          start: record.start,
          grade: area?.grade ?? null,
          radiusMilli: area?.radiusMilli ?? null,
          loaded: map !== undefined,
          viewable: viewable.get(record.mapKey) ?? false,
          land: landOf(record.mapKey, bytes),
        });
      }
      const hulls: WorldMapHull[] = [];
      for (const group of territory?.groups ?? []) {
        if (!group.hull || !factions.has(group.factionId)) continue;
        hulls.push({
          factionId: group.factionId,
          points: group.hull.map((vertex) => {
            const { latDeg, lonDeg } = latLonOfDirection(...vertex.point);
            return [latDeg, lonDeg] as const;
          }),
        });
      }
      return {
        status: "ready",
        planetId,
        faceLevel,
        factions: [...factions.values()],
        cities,
        hulls,
        milliPerRadian: territory?.milliPerRadian ?? 0,
        myFactionId,
        generatedAt: nowMs,
      };
    },

    position(viewer, nowMs) {
      const fallbackMapKey = source.maps.keys().next().value ?? null;
      const cyborg = source.cyborgOf(viewer.id);
      const unitId = cyborg?.unitId ?? null;
      let position: WorldPosition | null = null;
      if (cyborg && unitId !== null) {
        for (const [mapKey, map] of source.maps) {
          const info = map.unitInfo(unitId);
          if (!info || !isCellKey(mapKey)) continue;
          const at = positionAt(info.motion, nowMs);
          const cellX = clampCell(Math.floor(at.x / CELL_UNITS));
          const cellY = clampCell(Math.floor(at.y / CELL_UNITS));
          const cell = decodeCellKey(mapKey);
          position = {
            planetId,
            mapKey,
            face: cell.face,
            i: cell.i,
            j: cell.j,
            cellX,
            cellY,
            ...placeLatLon(mapKey, cellX, cellY),
            unitId,
            startCityId: cyborg.startCityId,
          };
          break;
        }
      }
      return { status: "ready", position, fallbackMapKey, generatedAt: nowMs };
    },
  };
}

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));

/** [임시] 시험 NPC 세력 이름(세력 표에 이름 칸이 없다 — 사이보그 만들기 화면과 같은 글자, cyborg/service.ts) */
const TEST_FACTION_NAME: LocalizedName = { ko: "시험 NPC 세력", en: "Test NPC faction" };

/** 행성 서비스에서 이 조회가 쓰는 것(목록 정보의 바이옴 범례, 행성 값) */
export interface WorldMapPlanets {
  planetValues(planetId: string): Promise<Uint8Array>;
  manifest(
    planetId: string,
  ): { readonly biomes: readonly { readonly id: string; readonly name: LocalizedName }[] } | undefined;
}

/**
 * 앱(app.ts)이 세계·행성 서비스로 조회를 만든다: 세계가 준비된 뒤에만 서비스(아니면 undefined → not_ready). 세력 이름 = 시험 NPC 세력 + 팩 국가
 * 프리셋(nationName), 바이옴 이름 = 행성 목록 정보 범례, 둘레 땅 = 월드 행성 값
 */
export function worldMapReadsOf(options: {
  readonly world: World;
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly faceLevel: number;
  readonly presets?: readonly NationPreset[] | undefined;
  readonly planets?: WorldMapPlanets | undefined;
}): () => WorldMapReadServices | undefined {
  const { world, planets, planetId } = options;
  const reads = createWorldMapReads({
    planetId,
    faceLevel: options.faceLevel,
    pool: options.pool,
    source: {
      maps: world.maps,
      directory: world,
      cyborgOf: (userId) => world.persistence?.cyborgs.record(userId),
      territory: (id, userId) =>
        world.persistence?.territory.planetView(id, userId) ?? Promise.resolve(undefined),
    },
    values: planets ? () => planets.planetValues(planetId) : undefined,
    biomeName: (id) => planets?.manifest(planetId)?.biomes.find((biome) => biome.id === id)?.name,
    factionName: (code) =>
      code === TEST_NPC_FACTION_CODE ? TEST_FACTION_NAME : nationName(code, options.presets),
  });
  return () => (world.status().state === "ready" && world.persistence ? reads : undefined);
}
