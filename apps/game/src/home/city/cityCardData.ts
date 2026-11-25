// 홈 [도시 활동] 카드의 자료 도우미 — 순수 함수(시험 대상, cityCardData.test.ts). 사용자 요청 2026-11-25 "대시보드의 2차맵 없이 빠른 도시활동 메뉴":
// 고른 내 유닛(기본 = 사이보그 본체)이 있는 2차맵의 건물·유닛·자원·정보를 2차맵에 들어가지 않고 본다.
// 자료는 있던 조회를 그대로 쓴다(새 서버 조회 없음): 내 유닛 전체 = world.travels(units), 건물 = facilities.mapLooks(시야 규칙 그대로),
// 유닛 = world.mapUnits, 자원 = gather.objects, 도시·땅 = world.cities, 정부 건물 건설 가능 = facilities.landRule.
// 엔진을 가져오지 않는다(2차맵 도시 화면의 map/city/cityRows.ts는 건물 칸·그림 모델을 써서 엔진 조각을 끈다 — 여기는 분류 칸만 본다).
import { FACILITY_CATEGORIES, type FacilityCategory } from "@terra/shared/facilityCategory";
import type { FacilityLandRuleResponse } from "@terra/shared/facilities";
import {
  GATHER_OBJECT_STRIDE,
  type GatherLoopView,
  type GatherName,
  type GatherObjectsResponse,
} from "@terra/shared/gather";
import type { MapBuildingLook, MapLookState } from "@terra/shared/mapLooks";
import type { WorldMyUnit } from "@terra/shared/worldMap";

/** 카드의 탭: 건물(기본)·유닛·자원·2차맵 정보. 유닛·자원은 눌러야 받는다 */
export const CITY_TABS = ["buildings", "units", "resources", "info"] as const;
export type CityTab = (typeof CITY_TABS)[number];

/** 고르기 상자의 차례: 사이보그 본체 먼저, 그다음 유닛 ID 차례 */
export function sortMyUnits(units: readonly WorldMyUnit[]): WorldMyUnit[] {
  return units.toSorted(
    (a, b) => Number(b.kind === "cyborg") - Number(a.kind === "cyborg") || a.unitId - b.unitId,
  );
}

/** 고른 유닛: 고른 ID가 목록에 있으면 그것, 없으면(고른 적 없음·사라짐) 사이보그 본체, 본체도 없으면 첫 유닛 */
export function pickUnit(units: readonly WorldMyUnit[], chosen: number | null): WorldMyUnit | null {
  const sorted = sortMyUnits(units);
  return sorted.find((unit) => unit.unitId === chosen) ?? sorted[0] ?? null;
}

/** 건물 무리 = 시설 분류 + 그 밖(시설 줄이 없거나 분류를 모르는 건물) */
export type BuildingGroup = FacilityCategory | "other";
export const BUILDING_GROUPS: readonly BuildingGroup[] = [...FACILITY_CATEGORIES, "other"];
export type BuildingFilter = "all" | "mine" | BuildingGroup;

export interface CityBuildingRow {
  readonly id: number;
  readonly facilityId: string | null;
  /** 지금 언어의 시설 이름(없으면 null — 화면이 "건물 #ID") */
  readonly name: string | null;
  readonly group: BuildingGroup;
  readonly level: number;
  readonly state: MapLookState;
  readonly upgrading: boolean;
  readonly mine: boolean;
  /** 건물이 차지하는 배치 칸 네모(미니맵 — 옛 서버는 없음) */
  readonly rect?: MapBuildingLook["rect"];
}

const GROUP_RANK: ReadonlyMap<BuildingGroup, number> = new Map(
  BUILDING_GROUPS.map((group, index) => [group, index]),
);

/** 겉모습 답 → 건물 줄. 차례: 분류표 차례 → 내 것 먼저 → 이름 → 건물 ID */
export function buildingRows(looks: readonly MapBuildingLook[], locale: "ko" | "en"): CityBuildingRow[] {
  const rows = looks.map(
    (look): CityBuildingRow => ({
      id: look.buildingId,
      facilityId: look.facilityId,
      name: look.name ? (locale === "en" ? look.name.en : look.name.ko) : null,
      group: look.facilityId === null ? "other" : (look.category ?? "other"),
      level: look.level,
      state: look.state,
      upgrading: look.upgrading,
      mine: look.mine,
      ...(look.rect ? { rect: look.rect } : {}),
    }),
  );
  return rows.toSorted(
    (a, b) =>
      (GROUP_RANK.get(a.group) ?? 0) - (GROUP_RANK.get(b.group) ?? 0) ||
      Number(b.mine) - Number(a.mine) ||
      (a.name ?? "").localeCompare(b.name ?? "", locale) ||
      a.id - b.id,
  );
}

export function filterBuildings(rows: readonly CityBuildingRow[], filter: BuildingFilter): CityBuildingRow[] {
  if (filter === "all") return [...rows];
  if (filter === "mine") return rows.filter((row) => row.mine);
  return rows.filter((row) => row.group === filter);
}

/** 거르기 칩: 전체는 늘, 내 것·무리는 1개 이상일 때만(수와 함께) */
export function buildingFilters(
  rows: readonly CityBuildingRow[],
): { readonly filter: BuildingFilter; readonly count: number }[] {
  const mine = rows.filter((row) => row.mine).length;
  const groups = BUILDING_GROUPS.map((group) => ({
    filter: group as BuildingFilter,
    count: rows.filter((row) => row.group === group).length,
  }));
  return [
    { filter: "all" as BuildingFilter, count: rows.length },
    { filter: "mine" as BuildingFilter, count: mine },
    ...groups,
  ].filter((entry) => entry.filter === "all" || entry.count > 0);
}

/** 이 2차맵에 (다 지었든 짓는 중이든) 정부 건물이 보이나 */
export function hasGovernment(rows: readonly CityBuildingRow[]): boolean {
  return rows.some((row) => row.facilityId === "government_hall");
}

/**
 * 도시가 아닌 2차맵의 "정부 건물 건설 가능" 표시: 땅 규칙이 지을 수 있다고 하고, 다 지으면 새 도시의 주인이 정해지며(claim), 아직 정부 건물이
 * 없을 때. 모르면(받기 전·옛 서버) 보이지 않는다
 */
export function canClaimCity(rule: FacilityLandRuleResponse | null): boolean {
  if (rule === null || rule.status !== "ready" || !rule.allowed) return false;
  return rule.claim !== null && rule.claim !== undefined && rule.governmentExists !== true;
}

/** 끝난 진행 줄(들어감·멈춤 까닭)을 카드에 남겨 두는 시간(ms) */
export const LOOP_DONE_SHOW_MS = 120_000;

/**
 * 카드에 보일 그 유닛의 진행 줄(건물 판에서 보낸 들어가기·채집): 진행 중인 줄, 없으면 방금 끝난 줄(LOOP_DONE_SHOW_MS 안 — 바로 옆 건물은
 * 들어가기가 곧 끝난다, 결과를 알리지 않으면 아무 일도 없던 것처럼 보인다). nowMs = 응답을 만든 서버 시각
 */
export function loopOf(
  loops: readonly GatherLoopView[],
  unitId: number,
  nowMs: number,
): GatherLoopView | null {
  const mine = loops.filter((loop) => loop.unitId === unitId);
  const active = mine.find((loop) => loop.phase !== "done");
  if (active) return active;
  const latest = mine.toSorted((a, b) => b.updatedAt - a.updatedAt)[0];
  return latest !== undefined && nowMs - latest.updatedAt < LOOP_DONE_SHOW_MS ? latest : null;
}

/** 배치 칸 자리 */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** 배치 칸 번호 수(이 위 번호는 움직이는 어군 — 서버 SCHOOL_ID_BASE, map/gather/gatherState.ts와 같다) */
const PLACEMENT_IDS = 256 * 256;

export interface CityResourceRow {
  readonly kindId: string;
  readonly name: GatherName;
  readonly itemName: GatherName | null;
  /** 이 2차맵의 그 종류 오브젝트 수 */
  readonly count: number;
  /** 지금 캘 수 있는 수(남은 번수가 있거나 다시 자랄 시각이 지남) */
  readonly ready: number;
  /** 유닛이 직접 캘 수 있나(false = 맡는 시설의 일꾼만 — 밭·목초지·물터) */
  readonly direct: boolean;
  /** 배로만 닿는 종류인가 */
  readonly boat: boolean;
  /**
   * 기준 자리에서 가장 가까운, 지금 캘 수 있는 오브젝트(번호·거리 칸). 기준 자리를 모르거나 캘 수 있는 것이 없으면 null.
   * 움직이는 어군은 길의 첫 점(집 자리)으로 잰다
   */
  readonly nearest: { readonly objectId: number; readonly cells: number } | null;
}

/**
 * 자원 오브젝트를 종류별로 센다. 차례: 기준 자리(at)를 알면 가장 가까운 캘 수 있는 것이 가까운 종류 먼저(없는 종류는 뒤), 같으면 많은 순 →
 * 종류 차례. 걸음이 틀린 응답은 빈 목록. [채집]은 줄의 nearest 오브젝트로 보낸다(사용자 요청 2026-11-25 "가까운순으로 접근함")
 */
export function resourceRows(
  response: Pick<GatherObjectsResponse, "kinds" | "objects"> &
    Partial<Pick<GatherObjectsResponse, "schools">>,
  nowMs: number,
  at: Cell | null = null,
): CityResourceRow[] {
  const flat = response.objects;
  if (flat.length % GATHER_OBJECT_STRIDE !== 0) return [];
  const schools = new Map((response.schools ?? []).map((school) => [school.id, school.points]));
  const counts = new Map<number, { count: number; ready: number; nearest: CityResourceRow["nearest"] }>();
  for (let i = 0; i < flat.length; i += GATHER_OBJECT_STRIDE) {
    const id = flat[i] ?? 0;
    const kind = flat[i + 1] ?? 0;
    const usesLeft = flat[i + 2] ?? 0;
    const regrowAtMs = flat[i + 3] ?? 0;
    const entry = counts.get(kind) ?? { count: 0, ready: 0, nearest: null };
    counts.set(kind, entry);
    entry.count += 1;
    if (usesLeft <= 0 && regrowAtMs > nowMs) continue;
    entry.ready += 1;
    if (at === null) continue;
    const points = id < PLACEMENT_IDS ? null : schools.get(id);
    // 길이 없는 어군 번호는 자리를 모른다(셈에는 넣고 가까운 것 고르기에서 뺀다)
    if (id >= PLACEMENT_IDS && (!points || points.length < 2)) continue;
    const x = points ? (points[0] ?? 0) : id % 256;
    const y = points ? (points[1] ?? 0) : Math.floor(id / 256);
    const cells = Math.hypot(x - at.x, y - at.y);
    if (entry.nearest === null || cells < entry.nearest.cells) entry.nearest = { objectId: id, cells };
  }
  const rows: (CityResourceRow & { readonly index: number })[] = [];
  for (const [index, entry] of counts) {
    const kind = response.kinds[index];
    if (!kind) continue;
    rows.push({
      index,
      kindId: kind.id,
      name: kind.name,
      itemName: kind.itemName,
      direct: kind.direct !== false,
      boat: kind.boat === true,
      ...entry,
    });
  }
  return rows
    .toSorted(
      (a, b) =>
        (a.nearest?.cells ?? Number.POSITIVE_INFINITY) - (b.nearest?.cells ?? Number.POSITIVE_INFINITY) ||
        b.count - a.count ||
        a.index - b.index,
    )
    .map(({ index: _index, ...row }) => row);
}

/** 이 종류를 그 유닛이 지금 캘 수 있나(직접 캐는 종류 + 배 규칙: 배로만 닿는 종류는 배에 탄 유닛만, 땅 종류는 배에 타지 않은 유닛만) */
export function canGatherKind(
  row: Pick<CityResourceRow, "direct" | "boat" | "nearest">,
  aboard: boolean,
): boolean {
  return row.direct && row.nearest !== null && row.boat === aboard;
}

/** 건물 가운데까지 거리(칸). 건물 칸 네모를 모르거나 기준 자리를 모르면 null */
export function cellsTo(
  at: Cell | null,
  rect:
    | { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
    | undefined,
): number | null {
  if (at === null || rect === undefined) return null;
  return Math.hypot(rect.x + rect.width / 2 - at.x, rect.y + rect.height / 2 - at.y);
}
