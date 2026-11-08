// 세계 배치 화면 조회·놓기(tRPC worldLayout.*) — 기획 D-528(사용자 원문 "개발자/관리자 페이지에서 행성에 고정npc 세력을 배치하는것"),
// docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)". 화면 /dev/world-layout(dev·admin, 권한 worldLayout: read·place).
// - view: 고정 NPC 국가마다 도시(발전도·수도)와 놓은 자리(놓은 사람·든 시각·막는 것).
// - place: 국가 자리(수도 2차맵)를 적는다. 누른 칸이 알맞은 땅이 아니면 SNAP_CELLS 안의 가장 가까운 알맞은 땅으로 옮긴다(없으면 not_land).
//   다른 국가 자리(놓은 자리, 없으면 지금 수도 2차맵)와 국가 간격(설정 칸 world_layout_nation_gap_cells)보다 가까우면 too_close, 시험
//   2차맵 줄 둘레 국가 간격 안이면 reserved. 시작 도시가 선 국가는 지금 막는 것을 미리 보고 blocked에 적는다(다음 시작 때 다시 본다).
//   세계는 지금 바꾸지 않는다: 서버가 다음에 켤 때 세계 씨앗이 든다(nationPlacement.ts — 실행 중인 2차맵·NPC 런타임을 옮기지 않는다 [임시, 질문 861]).
// - clear: 자리를 지운다(자동 배치로 돌아감 — 이미 선 도시는 그대로).
// - suggest: 자리를 고르지 않은 국가의 자동 배치 자리(가장 먼 점 고르기, 빈 세계로 보고 놓은 자리는 고정 수도).
// 놓기·지우기는 감사 기록(audit_log, actor_kind admin, world.place_nation·world.clear_nation_place)을 남긴다.
import { type CellKey, cellLevel, isCellKey } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import type { LocalizedName } from "@terra/shared/roster";
import { territoryDistanceMilli } from "@terra/shared/territory";
import type {
  WorldLayoutPlanetView,
  WorldLayoutSuggestion,
  WorldPlaceBlocker,
  WorldPlaceResult,
  WorldPlacementNationView,
} from "@terra/shared/worldPlacementApi";
import { WORLD_PLACE_BLOCKERS } from "@terra/shared/worldPlacementApi";
import type { WorldSeedCoefficients } from "@terra/sim";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import { type NationPlacement, loadPlacements, planNationMove } from "./nationPlacement.ts";
import type { QueryPool } from "./persist/load.ts";
import {
  CITY_CELL,
  type LayoutLand,
  isSettleLand,
  planWorldLayout,
  ringOffsets,
  seedOfText,
  walkCell,
} from "./worldLayout.ts";

/** 누른 칸이 알맞은 땅이 아니면 이 고리(1차맵 칸)까지 가장 가까운 알맞은 땅을 찾는다 */
export const SNAP_CELLS = 12;

export interface PlacementServiceOptions {
  readonly pool: QueryPool;
  readonly planetId: string;
  /** 시험 2차맵 줄(국가를 두지 않는 곳) */
  readonly testMapKeys: readonly CellKey[];
  /** 2차맵 칸의 행성 값(없으면 받기 전 — 놓기·제안이 not_ready) */
  readonly land: (mapKey: CellKey) => PlanetCellValues | undefined;
  /** 세계 씨앗 설정 칸 실효 값 */
  readonly seed: () => WorldSeedCoefficients;
  /** 세력 코드 → 나라 이름(팩 국가 프리셋) */
  readonly nationName: (code: string) => LocalizedName | undefined;
  readonly now: () => number;
}

export interface PlacementActor {
  readonly userId: string;
  readonly ip: string | null;
}

export interface PlacementService {
  /** 행성 값이 아직 없으면 undefined(화면이 "준비 중") */
  view(): Promise<WorldLayoutPlanetView | undefined>;
  place(
    entries: readonly { readonly code: string; readonly mapKey: number }[],
    actor: PlacementActor,
  ): Promise<WorldPlaceResult[] | undefined>;
  clear(code: string, actor: PlacementActor): Promise<boolean>;
  suggest(): Promise<WorldLayoutSuggestion | undefined>;
}

interface NationRow {
  readonly factionId: number;
  readonly code: string;
  readonly capitalCityId: number | null;
}

interface CityRow {
  readonly id: number;
  readonly factionId: number;
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
  readonly start: boolean;
  readonly development: number;
  readonly name: string | null;
}

const knownBlockers: ReadonlySet<string> = new Set(WORLD_PLACE_BLOCKERS);
const asBlockers = (list: readonly string[] | null): WorldPlaceBlocker[] =>
  (list ?? []).filter((entry): entry is WorldPlaceBlocker => knownBlockers.has(entry));

/** 그 국가 수도(고른 수도가 그 국가 도시면 그것, 아니면 가장 작은 ID 시작 도시) */
function capitalOf(nation: NationRow, cities: readonly CityRow[]): CityRow | undefined {
  const own = cities.filter((city) => city.factionId === nation.factionId);
  const chosen = own.find((city) => city.id === nation.capitalCityId);
  if (chosen) return chosen;
  return own.filter((city) => city.start).toSorted((a, b) => a.id - b.id)[0];
}

async function auditPlace(
  pool: QueryPool,
  actor: PlacementActor,
  action: string,
  before: unknown,
  after: unknown,
  meta: unknown,
): Promise<void> {
  await pool.query(
    `insert into audit_log (actor_kind, actor_id, action, before, after, ip, meta) values ('admin', $1, $2, $3, $4, $5, $6)`,
    [actor.userId, action, JSON.stringify(before), JSON.stringify(after), actor.ip, JSON.stringify(meta)],
  );
}

export function createPlacementService(o: PlacementServiceOptions): PlacementService {
  const first = o.testMapKeys[0];
  const faceLevel = first === undefined ? 9 : cellLevel(first);
  const metric = territoryMetric(faceLevel);
  const ready = (): boolean => first !== undefined && o.land(first) !== undefined;
  const landOf = (key: CellKey): LayoutLand | undefined => o.land(key);

  const loadNations = async (): Promise<NationRow[]> => {
    const result = await o.pool.query(
      `select id, code, capital_city_id from factions
       where kind = 'npc' and fixed and code is not null and dissolved_at_ms is null order by id`,
    );
    return result.rows.map((row) => ({
      factionId: Number(row.id),
      code: String(row.code),
      capitalCityId: row.capital_city_id === null ? null : Number(row.capital_city_id),
    }));
  };
  const loadCities = async (): Promise<CityRow[]> => {
    const result = await o.pool.query(
      `select id, faction_id, map_key, cell_x, cell_y, start, development, name from world_cities
       where planet_id = $1 order by id`,
      [o.planetId],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      factionId: Number(row.faction_id),
      mapKey: Number(row.map_key),
      x: Number(row.cell_x),
      y: Number(row.cell_y),
      start: row.start === true,
      development: Number(row.development ?? 0),
      name: typeof row.name === "string" ? row.name : null,
    }));
  };
  const distanceCells = (a: CellKey, b: CellKey): number =>
    territoryDistanceMilli(territoryPoint(a), territoryPoint(b), metric) / 1000;

  /** 알맞은 땅으로 옮긴 칸(누른 칸 → 고리 차례). 없으면 undefined */
  const snap = (key: CellKey, seed: WorldSeedCoefficients): CellKey | undefined => {
    if (isSettleLand(landOf(key), seed)) return key;
    for (const [di, dj] of ringOffsets(SNAP_CELLS)) {
      const next = walkCell(key, di, dj);
      if (next !== null && isSettleLand(landOf(next), seed)) return next;
    }
    return undefined;
  };

  return {
    async view() {
      if (!ready()) return undefined;
      const [nations, cities, placements, names] = await Promise.all([
        loadNations(),
        loadCities(),
        loadPlacements(o.pool, o.planetId),
        o.pool.query(
          `select p.faction_code, u.name from world_nation_placements p join users u on u.id = p.placed_by
           where p.planet_id = $1`,
          [o.planetId],
        ),
      ]);
      const placedByName = new Map(names.rows.map((row) => [String(row.faction_code), String(row.name)]));
      const out: WorldPlacementNationView[] = nations.map((nation) => {
        const capital = capitalOf(nation, cities);
        const placement = placements.get(nation.code);
        return {
          factionId: nation.factionId,
          code: nation.code,
          name: o.nationName(nation.code) ?? null,
          cities: cities
            .filter((city) => city.factionId === nation.factionId)
            .map((city) => ({
              id: city.id,
              name: city.name,
              mapKey: String(city.mapKey),
              start: city.start,
              development: city.development,
              capital: city.id === capital?.id,
            })),
          placement: placement
            ? {
                mapKey: String(placement.mapKey),
                placedAtMs: placement.placedAtMs,
                placedBy: placedByName.get(nation.code) ?? null,
                appliedAtMs: placement.appliedAtMs,
                blocked: asBlockers(placement.blocked),
              }
            : null,
        };
      });
      return {
        planetId: o.planetId,
        faceLevel,
        gapCells: o.seed().layoutNationGapCells,
        reserved: o.testMapKeys.map(String),
        nations: out,
      };
    },

    async place(entries, actor) {
      if (!ready()) return undefined;
      const seed = o.seed();
      const [nations, cities, placements] = await Promise.all([
        loadNations(),
        loadCities(),
        loadPlacements(o.pool, o.planetId),
      ]);
      // 국가마다 지금 자리(놓은 자리 → 지금 수도 2차맵). 이번에 놓은 자리로 바꿔 가며 다음 줄을 본다
      const homes = new Map<string, CellKey>();
      for (const nation of nations) {
        const placed = placements.get(nation.code)?.mapKey;
        const home = placed ?? capitalOf(nation, cities)?.mapKey;
        if (home !== undefined && isCellKey(home)) homes.set(nation.code, home);
      }
      const results: WorldPlaceResult[] = [];
      for (const entry of entries) {
        const nation = nations.find((row) => row.code === entry.code);
        const fail = (result: WorldPlaceResult["result"], near: string | null = null): void => {
          results.push({ code: entry.code, result, mapKey: null, blocked: [], near });
        };
        if (!nation) {
          fail("unknown_nation");
          continue;
        }
        if (!isCellKey(entry.mapKey) || cellLevel(entry.mapKey) !== faceLevel) {
          fail("bad_cell");
          continue;
        }
        const key = snap(entry.mapKey, seed);
        if (key === undefined) {
          fail("not_land");
          continue;
        }
        const gap = seed.layoutNationGapCells;
        if (o.testMapKeys.some((test) => distanceCells(key, test) < gap)) {
          fail("reserved");
          continue;
        }
        let near: string | null = null;
        for (const [code, home] of [...homes].toSorted((a, b) => a[0].localeCompare(b[0])))
          if (code !== nation.code && distanceCells(key, home) < gap) {
            near = code;
            break;
          }
        if (near !== null) {
          fail("too_close", near);
          continue;
        }
        // 시작 도시가 선 국가: 지금 막는 것(미리 보기 — DB 읽기만). 이미 그 자리에 선 국가는 옮길 것이 없다
        const own = cities.filter((city) => city.factionId === nation.factionId);
        const already = own.some((city) => city.start && city.mapKey === key);
        const preview =
          own.length === 0 || already
            ? { reasons: [] as string[] }
            : await planNationMove(o.pool, {
                planetId: o.planetId,
                factionId: nation.factionId,
                cities: own,
                place: (count) =>
                  Array.from({ length: count }, () => ({ mapKey: key, x: CITY_CELL, y: CITY_CELL })),
              });
        const before: NationPlacement | undefined = placements.get(nation.code);
        const nowMs = o.now();
        await o.pool.query(
          `insert into world_nation_placements (planet_id, faction_code, map_key, placed_by, placed_at_ms, applied_at_ms, blocked)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (planet_id, faction_code) do update set map_key = excluded.map_key, placed_by = excluded.placed_by,
             placed_at_ms = excluded.placed_at_ms, applied_at_ms = excluded.applied_at_ms, blocked = excluded.blocked`,
          [
            o.planetId,
            nation.code,
            key,
            actor.userId,
            nowMs,
            // 이미 그 자리에 선 국가는 든 것으로 적는다
            already ? nowMs : null,
            preview.reasons.length > 0 ? JSON.stringify(preview.reasons) : null,
          ],
        );
        await auditPlace(
          o.pool,
          actor,
          "world.place_nation",
          before ? { mapKey: before.mapKey } : null,
          { mapKey: key },
          { planetId: o.planetId, faction: nation.code, asked: entry.mapKey, blocked: preview.reasons },
        );
        homes.set(nation.code, key);
        results.push({
          code: nation.code,
          result: "ok",
          mapKey: String(key),
          blocked: asBlockers(preview.reasons),
          near: null,
        });
      }
      return results;
    },

    async clear(code, actor) {
      const before = (await loadPlacements(o.pool, o.planetId)).get(code);
      if (!before) return false;
      await o.pool.query(`delete from world_nation_placements where planet_id = $1 and faction_code = $2`, [
        o.planetId,
        code,
      ]);
      await auditPlace(o.pool, actor, "world.clear_nation_place", { mapKey: before.mapKey }, null, {
        planetId: o.planetId,
        faction: code,
      });
      return true;
    },

    async suggest() {
      if (!ready() || first === undefined) return undefined;
      const [nations, placements] = await Promise.all([loadNations(), loadPlacements(o.pool, o.planetId)]);
      const result = planWorldLayout({
        faceLevel,
        land: landOf,
        seed: o.seed(),
        worldSeed: seedOfText(o.planetId),
        nations: nations.map((nation) => {
          const placed = placements.get(nation.code)?.mapKey;
          return {
            factionId: nation.factionId,
            missing: 1,
            placed: [],
            home: placed !== undefined && isCellKey(placed) ? placed : undefined,
          };
        }),
        obstacles: [],
        newRadiusMilli: 0,
        avoidMaps: new Set<number>(o.testMapKeys),
      });
      const homes = nations.flatMap((nation) => {
        if (placements.has(nation.code)) return [];
        const home = result.homes.get(nation.factionId);
        return home === undefined ? [] : [{ code: nation.code, mapKey: String(home) }];
      });
      return { homes };
    },
  };
}

/** 10진 글자 칸 키 → 수(형식이 틀리거나 칸 키가 아니면 undefined) */
export function parseMapKey(text: string): number | undefined {
  if (!/^\d{1,19}$/.test(text)) return undefined;
  const value = Number(text);
  return isCellKey(value) ? value : undefined;
}

/**
 * app.ts가 맥락에 넣는 세계 배치 원천: 세계가 준비되고(부팅 복구 뒤) 지형 서비스가 행성 값을 줄 때만 서비스(한 번 만들고 다시 쓴다).
 * DB가 없는 세계는 늘 undefined
 */
export function placementSourceOf(input: {
  readonly world: {
    status(): { readonly state: string };
    readonly terrain: { cellValues?(mapKey: number): PlanetCellValues | undefined } | undefined;
  };
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly testMapKeys: readonly CellKey[];
  readonly seed: () => WorldSeedCoefficients;
  readonly nationName: (code: string) => LocalizedName | undefined;
  readonly now: () => number;
}): () => { readonly planetId: string; readonly service: PlacementService } | undefined {
  let made: PlacementService | undefined;
  return () => {
    const terrain = input.world.terrain;
    if (input.world.status().state !== "ready" || !terrain?.cellValues) return undefined;
    made ??= createPlacementService({
      pool: input.pool,
      planetId: input.planetId,
      testMapKeys: input.testMapKeys,
      land: (mapKey) => terrain.cellValues?.(mapKey),
      seed: input.seed,
      nationName: input.nationName,
      now: input.now,
    });
    return { planetId: input.planetId, service: made };
  };
}
