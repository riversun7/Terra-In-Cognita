// 사람이 고른 고정 NPC 국가 자리(DB·부팅) — 기획 D-528(사용자 원문 "개발자/관리자 페이지에서 행성에 고정npc 세력을 배치하는것"),
// docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)". 화면·조회는 placementService.ts, 표는 db/worldPlacementSchema.ts.
// - 자리 = 국가(세력 코드)마다 수도 2차맵 하나. 서버가 켤 때 세계 씨앗(worldBoot.ts)이 읽는다:
//   1. 시작 도시가 없는 국가(새 세계·세계 새로 시작 뒤): 그 자리가 수도, 둘레에 시작 도시(worldLayout.ts home).
//   2. 시작 도시가 이미 선 국가에 새 자리(applied_at_ms = null): 그 국가의 시작 도시를 모두 새 자리로 옮긴다 — 옛 자리 옮기기(relayout.ts)와
//      같은 막는 것·옮기는 것. 국가 단위로 모두 옮기거나 하나도 옮기지 않는다(한 국가가 둘로 갈라지지 않게): 한 도시라도 막히면(플레이어
//      건물·계약·작업·유닛·수호신·비콘·전투 등) 모두 그대로 두고 까닭을 blocked에 적는다. 시작 도시가 아닌 그 국가 도시(실행 중에 세운 마을)가
//      있으면 other_cities로 막는다 [임시, 질문 862].
//   3. 이미 든 자리(applied_at_ms 있음)는 다시 보지 않는다(같은 자리를 다시 놓으면 applied가 지워져 다시 본다).
// - 자동 배치(가장 먼 점 고르기)는 자리를 고르지 않은 국가의 뒷길이고, 화면의 [자동 제안]이 같은 함수로 자리를 보여 준다.
import { type CellKey, isCellKey } from "@terra/planet";
import type { QueryPool } from "./persist/load.ts";
import { type LegacyCity, type RelayoutMove, type RelayoutPlan, planRelayout } from "./relayout.ts";
import type { LayoutSpot } from "./worldLayout.ts";

/** 국가 자리 한 줄 */
export interface NationPlacement {
  readonly code: string;
  /** 수도 2차맵(칸 키) */
  readonly mapKey: number;
  readonly placedBy: string | null;
  readonly placedAtMs: number;
  readonly appliedAtMs: number | null;
  readonly blocked: readonly string[] | null;
}

/** 자리를 옮길 수 없게 하는 까닭(relayout.ts 까닭 + 국가 단위) */
export const PLACEMENT_EXTRA_REASONS = ["other_cities"] as const;

/** 자리의 칸 키(칸 키가 아니면 undefined) */
export const placementHome = (placement: NationPlacement | undefined): CellKey | undefined =>
  placement && isCellKey(placement.mapKey) ? placement.mapKey : undefined;

const strings = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : null;

/** 그 행성의 국가 자리(세력 코드 → 줄) */
export async function loadPlacements(
  pool: QueryPool,
  planetId: string,
): Promise<Map<string, NationPlacement>> {
  const result = await pool.query(
    `select faction_code, map_key, placed_by, placed_at_ms, applied_at_ms, blocked
     from world_nation_placements where planet_id = $1 order by faction_code`,
    [planetId],
  );
  return new Map(
    result.rows.map((row) => [
      String(row.faction_code),
      {
        code: String(row.faction_code),
        mapKey: Number(row.map_key),
        placedBy: typeof row.placed_by === "string" ? row.placed_by : null,
        placedAtMs: Number(row.placed_at_ms),
        appliedAtMs: row.applied_at_ms === null ? null : Number(row.applied_at_ms),
        blocked: strings(row.blocked),
      },
    ]),
  );
}

/** 자리가 세계에 들었다(applied_at_ms = 지금, blocked 비움) */
export async function markPlacementsApplied(
  pool: QueryPool,
  planetId: string,
  codes: readonly string[],
  nowMs: number,
): Promise<void> {
  if (codes.length === 0) return;
  await pool.query(
    `update world_nation_placements set applied_at_ms = $3, blocked = null
     where planet_id = $1 and faction_code = any($2::text[])`,
    [planetId, [...codes], nowMs],
  );
}

/** 자리를 들이지 못한 까닭을 적는다(applied_at_ms는 그대로 null — 다음 켤 때 다시 본다) */
export async function markPlacementBlocked(
  pool: QueryPool,
  planetId: string,
  code: string,
  reasons: readonly string[],
): Promise<void> {
  await pool.query(
    `update world_nation_placements set blocked = $3 where planet_id = $1 and faction_code = $2`,
    [planetId, code, JSON.stringify([...reasons])],
  );
}

/** 국가 하나의 도시(배치가 보는 칸만) */
export interface PlacementCity extends LayoutSpot {
  readonly id: number;
  readonly factionId: number;
  readonly start: boolean;
}

/**
 * 자리를 옮길 국가 하나의 계획(DB 읽기만): 시작 도시 모두를 새 자리로. 막는 것이 하나라도 있으면 moves = []이고 reasons에 까닭(겹치지 않게).
 * place = 그 국가 도시를 없는 셈 치고 새 자리(home) 둘레에 movable 수만큼 자리를 고르는 함수(worldBoot.ts layoutPlacer)
 */
export async function planNationMove(
  pool: QueryPool,
  options: {
    readonly planetId: string;
    readonly factionId: number;
    readonly cities: readonly PlacementCity[];
    readonly place: (count: number, except: ReadonlySet<number>) => readonly LayoutSpot[];
  },
): Promise<{ moves: RelayoutMove[]; reasons: string[] }> {
  const own = options.cities.filter((city) => city.factionId === options.factionId);
  const legacy: LegacyCity[] = own
    .filter((city) => city.start)
    .map((city) => ({ id: city.id, factionId: city.factionId, spot: city }));
  const reasons = new Set<string>();
  if (own.some((city) => !city.start)) reasons.add("other_cities");
  if (legacy.length === 0) return { moves: [], reasons: [...reasons] };
  const except = new Set(own.map((city) => city.id));
  const plan: RelayoutPlan = await planRelayout(pool, {
    planetId: options.planetId,
    legacy,
    // 국가 단위: 막힌 도시가 하나라도 있으면 자리를 고르지 않는다(모두 no_room이 된다 — 아래에서 까닭만 남긴다)
    place: (movable, kept) =>
      kept.length > 0 || reasons.size > 0
        ? []
        : options.place(movable.length, except).map((spot) => ({ factionId: options.factionId, spot })),
  });
  const blocking = plan.kept.flatMap((city) => city.reasons);
  const real = blocking.filter((reason) => reason !== "no_room");
  if (real.length > 0) for (const reason of real) reasons.add(reason);
  else if (reasons.size === 0) for (const reason of blocking) reasons.add(reason);
  if (reasons.size > 0) return { moves: [], reasons: [...reasons].toSorted() };
  return { moves: [...plan.moves], reasons: [] };
}
