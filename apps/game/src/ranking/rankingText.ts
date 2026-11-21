// 랭킹 화면 글·순수 셈 — 등급·순위 변화·이름·판 주소(시험 대상). 셈 자체(점수·순위·등급)는 서버가 한다(서버 권위).
import type { LocalizedName } from "@terra/shared/faction";
import type {
  RankingArea,
  RankingBoardKey,
  RankingBoardRequest,
  RankingMeasure,
  RankingPathInfo,
  RankingSubjectKind,
  RankingUnitMeasure,
} from "@terra/shared/ranking";
import { isRankingUnitMeasure } from "@terra/shared/ranking";
import type { RouteMatch, RouteTarget } from "@terra/shared";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

export const AREA_NAMES: Record<RankingArea, () => string> = {
  force: m.ranking_area_force,
  life: m.ranking_area_life,
  wealth: m.ranking_area_wealth,
  tech: m.ranking_area_tech,
  frontier: m.ranking_area_frontier,
  influence: m.ranking_area_influence,
  living: m.ranking_area_living,
};

export const MEASURE_NAMES: Record<RankingMeasure, () => string> = {
  war_wins: m.ranking_measure_war_wins,
  battle_wins: m.ranking_measure_battle_wins,
  cities_held: m.ranking_measure_cities_held,
  production: m.ranking_measure_production,
  facilities: m.ranking_measure_facilities,
  combat_power: m.ranking_measure_combat_power,
  assets: m.ranking_measure_assets,
};

export const KIND_NAMES: Record<RankingSubjectKind, () => string> = {
  user: m.ranking_kind_user,
  npc_faction: m.ranking_kind_npc_faction,
  player_faction: m.ranking_kind_player_faction,
  house: m.ranking_kind_house,
  unit: m.ranking_kind_unit,
};

/** 유닛 판 지표(house-10, D-569 1746): 고르기 칸 이름·재는 것 글 */
export const UNIT_BOARD_NAMES: Record<RankingUnitMeasure, () => string> = {
  combat_power: m.ranking_board_unit_combat_power,
  assets: m.ranking_board_unit_assets,
};
export const UNIT_MEASURE_NAMES: Record<RankingUnitMeasure, () => string> = {
  combat_power: m.ranking_unit_measure_combat_power,
  assets: m.ranking_unit_measure_assets,
};

/** 판 줄 이름: 이름 없는 유닛은 "유닛 #ID", 그 밖은 nameText */
export function rowName(row: {
  readonly kind: RankingSubjectKind;
  readonly name: LocalizedName | null;
  readonly unitId?: number | undefined;
}): string {
  if (row.kind === "unit" && row.name === null && row.unitId !== undefined)
    return m.ranking_unit_unnamed({ id: String(row.unitId) });
  return nameText(row.name);
}

/** 등급 문턱(‰) → 퍼센트 글자(10 → "1", 5 → "0.5") */
export const tierPercent = (tierPm: number): string => formatCount(tierPm / 10);

/** 든 등급 글: "상위 5%" 또는 "등급 밖" */
export function tierText(tierPm: number | null): string {
  return tierPm === null ? m.ranking_no_tier() : m.ranking_tier({ percent: tierPercent(tierPm) });
}

export type RankChange =
  | { readonly kind: "new" }
  | { readonly kind: "same" }
  | { readonly kind: "up" | "down"; readonly steps: number };

/** 지난 집계와 비교한 순위 변화(순위는 작을수록 위) */
export function rankChange(rank: number, prevRank: number | null): RankChange {
  if (prevRank === null) return { kind: "new" };
  if (prevRank === rank) return { kind: "same" };
  return prevRank > rank ? { kind: "up", steps: prevRank - rank } : { kind: "down", steps: rank - prevRank };
}

export function rankChangeText(change: RankChange): string {
  switch (change.kind) {
    case "new":
      return m.ranking_change_new();
    case "same":
      return m.ranking_change_same();
    case "up":
      return m.ranking_change_up({ steps: formatCount(change.steps) });
    case "down":
      return m.ranking_change_down({ steps: formatCount(change.steps) });
    default: {
      const unhandled: never = change;
      return unhandled;
    }
  }
}

/** 이름(두 언어 값) → 지금 언어. 없으면 "이름 없음" */
export function nameText(name: LocalizedName | null, locale: Locale = getLocale()): string {
  if (name === null) return m.ranking_unnamed();
  return locale === "en" ? name.en : name.ko;
}

/** 주소 → 판 요청: 세력 판 주소(?house=<경로>면 그 경로의 가문 판), 경로 판 주소(?path= 없으면 서버가 고른다) */
export function boardRequestOf(match: RouteMatch): RankingBoardRequest {
  if (match.id === "faction_ranking") {
    const house = match.search.house;
    return house === undefined || house === "" ? { kind: "faction" } : { kind: "house", path: house };
  }
  if (match.id === "cyborg_ranking") {
    // 유닛 판(house-10): ?unit=<지표>
    const unit = match.search.unit;
    if (isRankingUnitMeasure(unit)) return { kind: "unit", measure: unit };
    return { kind: "path", path: match.search.path ?? null };
  }
  return { kind: "path", path: null };
}

/** 판 → 주소(고르기 칸이 바꾼다) */
export function boardTarget(board: RankingBoardKey): RouteTarget {
  if (board.kind === "faction") return { route: "faction_ranking" };
  if (board.kind === "house") return { route: "faction_ranking", search: { house: board.path } };
  if (board.kind === "unit") return { route: "cyborg_ranking", search: { unit: board.measure } };
  return { route: "cyborg_ranking", search: { path: board.path } };
}

/** 판 고르기 칸 값(세력 = "faction:", 경로 = "path:<ID>", 가문 판 = "house:<ID>", 유닛 판 = "unit:<지표>") ↔ 판 */
export function boardValue(board: RankingBoardKey): string {
  if (board.kind === "faction") return "faction:";
  if (board.kind === "unit") return `unit:${board.measure}`;
  return `${board.kind}:${board.path}`;
}

export function boardFromValue(value: string): RankingBoardKey | null {
  if (value === "faction:") return { kind: "faction" };
  if (value.startsWith("unit:")) {
    const measure = value.slice("unit:".length);
    return isRankingUnitMeasure(measure) ? { kind: "unit", measure } : null;
  }
  for (const kind of ["path", "house"] as const)
    if (value.startsWith(`${kind}:`) && value.length > kind.length + 1)
      return { kind, path: value.slice(kind.length + 1) };
  return null;
}

/** 경로를 영역마다 묶는다(팩 차례 그대로, 빈 영역은 뺀다) */
export function pathsByArea(
  paths: readonly RankingPathInfo[],
): { area: RankingArea; paths: RankingPathInfo[] }[] {
  const groups = new Map<RankingArea, RankingPathInfo[]>();
  for (const path of paths) {
    const list = groups.get(path.area) ?? [];
    list.push(path);
    groups.set(path.area, list);
  }
  return [...groups].map(([area, list]) => ({ area, paths: list }));
}
