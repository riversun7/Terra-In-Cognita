// 세계 배치 화면 조회·놓기(tRPC worldLayout.*) — 기획 D-528(사용자 원문 "개발자/관리자 페이지에서 행성에 고정npc 세력을 배치하는것"),
// docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)". 화면 /dev/world-layout(dev·admin, 권한 worldLayout: read·place).
// - view: 고정 NPC 국가마다 도시(발전도·수도)와 놓은 자리(놓은 사람·든 시각·막는 것).
// - place: 국가 자리(수도 2차맵)를 적는다. 누른 칸이 알맞은 땅이 아니면 SNAP_CELLS 안의 가장 가까운 알맞은 땅으로 옮긴다(없으면 not_land).
//   다른 국가 자리(놓은 자리, 없으면 지금 수도 2차맵)와 국가 간격(설정 칸 world_layout_nation_gap_cells × 두 국가 국력 등급 간격의 평균)보다
//   가까우면 too_close, 시험
//   2차맵 줄 둘레 국가 간격 안이면 reserved. 시작 도시가 선 국가는 지금 막는 것을 미리 보고 blocked에 적는다(다음 시작 때 다시 본다).
//   세계는 지금 바꾸지 않는다: 서버가 다음에 켤 때 세계 씨앗이 든다(nationPlacement.ts — 실행 중인 2차맵·NPC 런타임을 옮기지 않는다 [임시, 질문 861]).
// - clear: 자리를 지운다(자동 배치로 돌아감 — 이미 선 도시는 그대로).
// - suggest: 자리를 고르지 않은 국가의 자동 배치 자리(가장 먼 점 고르기, 빈 세계로 보고 놓은 자리는 고정 수도).
// 놓기·지우기는 감사 기록(audit_log, actor_kind admin, world.place_nation·world.clear_nation_place)을 남긴다.
// 국력 등급(사용자 답 2026-11-11, 같은 ADR "바뀜 (2026-11-11)"):
// - view: 국가마다 등급 시작 값(start)과 이 세계에 아직 서지 않은 켜진 국가 프리셋(founding — 자리를 놓으면 다음 시작 때 그 국가가 선다).
// - place: 아직 서지 않은 국가 프리셋 코드도 받는다(이 세계에 이 국가 세우기 — 감사 기록 world.found_nation). 같은 땅·간격 검사.
// - suggest: 등급대로 고른 자리(강한 등급 먼저·등급 간격·땅 넓이) + 빈 세계 등급 배치 계획(plan — 모든 국가의 수도·시작 도시).
// - tierPlan·requestTierApply·cancelTierApply: 이미 선 세계에 등급 분포를 반영(tierApply.ts·tierPlan.ts — 더하기만, 다음 시작 때).
import { type CellKey, cellLevel, isCellKey } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import type { LocalizedName } from "@terra/shared/roster";
import { territoryDistanceMilli } from "@terra/shared/territory";
import type {
  WorldFoundingView,
  WorldLayoutPlanetView,
  WorldLayoutSuggestion,
  WorldPlaceBlocker,
  WorldPlaceResult,
  WorldPlacementNationView,
  WorldCatchmentView,
  WorldTierApplyView,
} from "@terra/shared/worldPlacementApi";
import { WORLD_PLACE_BLOCKERS } from "@terra/shared/worldPlacementApi";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS, type WorldSeedCoefficients } from "@terra/sim";
import type { PlanetCellValues } from "@terra/planet/secondMap";
import {
  MAX_TEST_NATIONS,
  type NationPreset,
  nationCode,
  nationEmblemOf,
  nationStartOf,
  presetOfCode,
} from "../npc/nations.ts";
import { weightsOfFacilities } from "@terra/shared/catchment";
import { catchmentViewOf } from "./catchmentView.ts";
import type { CityLayoutService } from "../facilities/cityLayoutView.ts";
import { type NationPlacement, loadPlacements, planNationMove } from "./nationPlacement.ts";
import type { QueryPool } from "./persist/load.ts";
import { cancelTierApply, requestTierApply } from "./tierApply.ts";
import { type TierPlanNation, freshTierPlan, startViewOf, tierApplyPlan } from "./tierPlan.ts";
import {
  CITY_CELL,
  type LayoutLand,
  isSettleLand,
  layoutTierOf,
  pairPm,
  ringOffsets,
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
  /** 실효 국가 프리셋(국력 등급·세울 수 있는 국가). 없으면 등급 없음·세울 국가 없음(옛 동작) */
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  /** 이 서버의 고정 국가 수(NPC_TEST_NATIONS — 차례로 서는 국가). 없으면 세울 국가 후보를 내지 않는다 */
  readonly testNations?: number | undefined;
  /** 영토 설정 칸(도시 영향권 — 더 세울 도시 자리 미리 보기). 없으면 출발값 */
  readonly territory?: (() => SocietyCoefficients["territory"]) | undefined;
  /** 도시 건물 배치 미리 보기·다시 놓기 예약(facilities/cityLayoutView.ts). 없으면 그 조회가 not ready */
  readonly cityLayout?: CityLayoutService | undefined;
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
  /** 이미 선 세계에 국력 등급 분포를 반영하면 더해지는 것(미리 보기 — DB 읽기만)과 걸린 요청 */
  tierPlan(): Promise<WorldTierApplyView | undefined>;
  /** 반영 요청을 적는다(다음 서버 시작 때 든다, 감사 기록 world.tier_apply_request). 적은 뒤의 미리 보기를 돌려준다 */
  requestTierApply(actor: PlacementActor): Promise<WorldTierApplyView | undefined>;
  /** 아직 들지 않은 요청을 지운다(감사 기록 world.tier_apply_cancel). 지울 요청이 없으면 false */
  cancelTierApply(actor: PlacementActor): Promise<boolean>;
  /** 고른 국가 수도 둘레 배후지 덮개(catchmentView.ts — 읽기만). 모르는 국가면 null */
  catchment(code: string): Promise<WorldCatchmentView | null | undefined>;
  /** 도시 건물 배치(facilities/cityLayoutView.ts). 없으면 undefined */
  readonly cityLayout: CityLayoutService | undefined;
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

  const presets = (): readonly NationPreset[] => o.presets?.() ?? [];
  const startOf = (code: string) => nationStartOf(o.seed(), presetOfCode(code, presets()));
  const avoidMaps = new Set<number>(o.testMapKeys);
  /** 국가 시그니처 컬러(프리셋이 있으면) */
  const colorOf = (code: string): { color?: string } => {
    const color = nationEmblemOf(code, presets())?.color;
    return color === undefined ? {} : { color };
  };
  /**
   * 이 세계에 아직 서지 않은 켜진 국가 프리셋(세울 수 있는 국가): 세력 행이 없고, 16번째 프리셋(1번 시험 NPC 세력의 것)이 아닌 것.
   * 고정 국가 수 설정(testNations)을 모르면 후보를 내지 않는다
   */
  const foundable = (nations: readonly NationRow[]): NationPreset[] => {
    if (o.testNations === undefined) return [];
    const list = presets();
    const standing = new Set(nations.map((nation) => nation.code));
    // 차례로 서는 국가 코드(부팅이 만든다 — 아직 세력 행이 없어도 후보가 아니다)
    const count = Math.max(1, Math.min(MAX_TEST_NATIONS, o.testNations));
    for (let n = 1; n <= count; n++) standing.add(nationCode(n, list));
    return list.filter((preset, index) => index !== MAX_TEST_NATIONS - 1 && !standing.has(preset.code));
  };
  /** 등급 계획에 넣을 국가: 선 국가 + 자리를 놓아 세울 국가(음수 ID) */
  const planNations = (
    nations: readonly NationRow[],
    placements: ReadonlyMap<string, NationPlacement>,
  ): TierPlanNation[] => {
    const homeOf = (code: string): CellKey | undefined => {
      const placed = placements.get(code)?.mapKey;
      return placed !== undefined && isCellKey(placed) ? placed : undefined;
    };
    return [
      ...nations.map((nation) => ({
        code: nation.code,
        factionId: nation.factionId,
        start: startOf(nation.code),
        home: homeOf(nation.code),
      })),
      ...foundable(nations)
        .filter((preset) => placements.has(preset.code))
        .map((preset, index) => ({
          code: preset.code,
          factionId: -1 - index,
          start: startOf(preset.code),
          home: homeOf(preset.code),
        })),
    ];
  };
  const planBase = () => ({ faceLevel, land: landOf, seed: o.seed(), planetId: o.planetId, avoidMaps });
  const tierView = async (): Promise<WorldTierApplyView | undefined> => {
    if (!ready()) return undefined;
    const [nations, placements] = await Promise.all([loadNations(), loadPlacements(o.pool, o.planetId)]);
    const list = presets();
    return tierApplyPlan(
      o.pool,
      { ...planBase(), territory: (o.territory ?? (() => TEST_SOCIETY_COEFFICIENTS.territory))() },
      nations.map((nation) => {
        const placed = placements.get(nation.code)?.mapKey;
        return {
          code: nation.code,
          factionId: nation.factionId,
          start: startOf(nation.code),
          home: placed !== undefined && isCellKey(placed) ? placed : undefined,
          name: o.nationName(nation.code) ?? null,
          tiered: presetOfCode(nation.code, list)?.tier !== undefined,
        };
      }),
    );
  };

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
          start: startViewOf(startOf(nation.code)),
          ...colorOf(nation.code),
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
      const founding: WorldFoundingView[] = foundable(nations).map((preset) => {
        const placement = placements.get(preset.code);
        return {
          code: preset.code,
          name: { ko: preset.name.ko, en: preset.name.en },
          start: startViewOf(startOf(preset.code)),
          ...colorOf(preset.code),
          mapKey: placement ? String(placement.mapKey) : null,
          placedAtMs: placement?.placedAtMs ?? null,
          placedBy: placedByName.get(preset.code) ?? null,
        };
      });
      return {
        planetId: o.planetId,
        faceLevel,
        gapCells: o.seed().layoutNationGapCells,
        reserved: o.testMapKeys.map(String),
        nations: out,
        founding,
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
      // 아직 서지 않은 국가 프리셋(이 세계에 이 국가 세우기): 세력 행이 없으므로 옮길 것이 없다
      const candidates = new Set(foundable(nations).map((preset) => preset.code));
      // 이미 자리를 놓은 세울 국가의 자리도 국가 간격 검사에 넣는다
      for (const code of candidates) {
        const placed = placements.get(code)?.mapKey;
        if (placed !== undefined && isCellKey(placed)) homes.set(code, placed);
      }
      for (const entry of entries) {
        const nation =
          nations.find((row) => row.code === entry.code) ??
          (candidates.has(entry.code) ? { factionId: -1, code: entry.code, capitalCityId: null } : undefined);
        const founding = nation !== undefined && nation.factionId < 0;
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
        // 다른 국가와 띄울 거리 = 국가 간격 × 두 국가 국력 등급 간격의 평균(세계 배치·등급 배치 계획과 같은 규칙 — 소국은 가깝게, 강대국은 멀게)
        const mine = layoutTierOf(startOf(nation.code));
        const gapWith = (code: string): number => (gap * pairPm(mine, layoutTierOf(startOf(code)))) / 1000;
        let near: string | null = null;
        for (const [code, home] of [...homes].toSorted((a, b) => a[0].localeCompare(b[0])))
          if (code !== nation.code && distanceCells(key, home) < gapWith(code)) {
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
          founding ? "world.found_nation" : "world.place_nation",
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
      // 빈 세계로 보고 등급대로(강한 등급 먼저·등급 간격·땅 넓이) 고른다. 놓은 자리는 고정 수도, 세울 국가(자리를 놓은 것)도 함께
      const plan = freshTierPlan(planBase(), planNations(nations, placements));
      const homes = plan.nations
        .filter((nation) => !placements.has(nation.code))
        .map((nation) => ({ code: nation.code, mapKey: nation.home }));
      return { homes, plan };
    },

    tierPlan: tierView,
    cityLayout: o.cityLayout,

    async catchment(code) {
      if (!ready()) return undefined;
      const [nations, cities, placements] = await Promise.all([
        loadNations(),
        loadCities(),
        loadPlacements(o.pool, o.planetId),
      ]);
      const plan = freshTierPlan(planBase(), planNations(nations, placements));
      const codeOf = new Map(nations.map((nation) => [nation.factionId, nation.code]));
      const row = nations.find((nation) => nation.code === code);
      const planned = plan.nations.find((nation) => nation.code === code);
      const capital = row ? capitalOf(row, cities)?.mapKey : undefined;
      const center = capital ?? (planned ? parseMapKey(planned.home) : undefined);
      if (center === undefined || !isCellKey(center)) return null;
      return catchmentViewOf({
        faceLevel,
        land: landOf,
        seed: o.seed(),
        code,
        center,
        world: cities.flatMap((city) => {
          const owner = codeOf.get(city.factionId);
          return owner === undefined ? [] : [{ code: owner, mapKey: city.mapKey }];
        }),
        plan: plan.nations.flatMap((nation) =>
          nation.cities.map((key) => ({ code: nation.code, mapKey: Number(key) })),
        ),
        needsOf: (owner) => weightsOfFacilities(startOf(owner).facilities),
      });
    },

    async requestTierApply(actor) {
      if (!ready()) return undefined;
      const nowMs = o.now();
      await requestTierApply(o.pool, { planetId: o.planetId, userId: actor.userId, nowMs });
      const view = await tierView();
      await auditPlace(o.pool, actor, "world.tier_apply_request", null, view?.totals ?? null, {
        planetId: o.planetId,
        atMs: nowMs,
      });
      return view;
    },

    async cancelTierApply(actor) {
      const cancelled = await cancelTierApply(o.pool, o.planetId);
      if (cancelled)
        await auditPlace(o.pool, actor, "world.tier_apply_cancel", null, null, { planetId: o.planetId });
      return cancelled;
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
  readonly presets?: PlacementServiceOptions["presets"];
  readonly testNations?: number | undefined;
  readonly territory?: PlacementServiceOptions["territory"];
  readonly cityLayout?: PlacementServiceOptions["cityLayout"];
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
      presets: input.presets,
      testNations: input.testNations,
      territory: input.territory,
      cityLayout: input.cityLayout,
    });
    return { planetId: input.planetId, service: made };
  };
}
