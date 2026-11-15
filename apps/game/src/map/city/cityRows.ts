// 도시 화면의 건물 줄과 시설 무리 — 엔진·React를 모른다(시험 대상). 사용자 지적 2026-11-12 "도시(현재맵도시와 건물 리스트를 보여주고 빠르게
// 조회 및 조작할 수있는 큰화면)". 지도 자료의 건물(보이는 것만 온다)에 겉모습 답(facilities.mapLooks — 시설·이름·레벨·상태·내 것·분류)을 붙인다.
// - 시설 무리 = 시설 분류(기획 D-560 시설 분류표 — 팩 facilities.category, 서버가 겉모습 답에 싣는다, @terra/shared/facilityCategory).
//   분류가 없는 옛 답은 건물 그림 모델(팩 facilities.look.model, 없으면 엔진이 시설 ID로 고르는 모델)에서 고른다. 시설이 없는 건물은 그 밖.
//   지도 위 누른 건물 이름표(gatherOverlay.ts)도 같은 무리 색을 쓴다.
// - 차례: 무리 차례(분류표 차례) → 기준점에서 가까운 차례(기준점이 없으면 이름) → 건물 ID.
import type { BuildingFootprint } from "@terra/engine";
import { artKindOf } from "@terra/engine/buildingArt";
import { FACILITY_CATEGORIES, type FacilityCategory } from "@terra/shared/facilityCategory";
import type { FacilityLookModel } from "@terra/shared/facilityLook";
import type { MapBuildingLook, MapLookState } from "@terra/shared/mapLooks";
import { type Point, buildingCentre } from "../nearby/nearbyData.ts";

/** 시설 무리 — 시설 분류 + 그 밖(시설이 없는 건물). 지도 표시 색·도시 화면 거르기 */
export type FacilityGroup = FacilityCategory | "other";

export const FACILITY_GROUPS: readonly FacilityGroup[] = [...FACILITY_CATEGORIES, "other"];

/** 분류가 없는 옛 답: 그림 모델 → 분류 */
const GROUP_OF_MODEL: Readonly<Record<FacilityLookModel, FacilityGroup>> = {
  farm: "gathering",
  lumber: "gathering",
  mine: "gathering",
  herb: "gathering",
  ranch: "gathering",
  fishing: "gathering",
  dock: "transport",
  stockpile: "storage",
  storehouse: "storage",
  warehouse: "storage",
  smelter: "processing",
  kitchen: "processing",
  workshop: "processing",
  sawmill: "processing",
  kiln: "processing",
  temple: "public",
  lab: "public",
  government: "administration",
  hospital: "public",
  house: "housing",
};

/** 겉모습 답 → 시설 무리(분류 칸 → 옛 답이면 그림 모델. 시설이 없는 건물 = 그 밖) */
export function groupOf(
  look: Pick<MapBuildingLook, "facilityId" | "art" | "category"> | undefined,
): FacilityGroup {
  const facility = look?.facilityId ?? null;
  if (facility === null) return "other";
  if (look?.category !== undefined) return look.category;
  const model = look?.art?.model;
  const kind: FacilityLookModel =
    model !== undefined && Object.hasOwn(GROUP_OF_MODEL, model) ? model : artKindOf(facility);
  const group = GROUP_OF_MODEL[kind];
  // 모르는 시설은 엔진이 일반 집으로 그린다 — 그것까지 "주거"로 묶지 않는다(숙소만 집 모델을 정해 둔다)
  if (group === "housing" && model !== "house") return "other";
  return group;
}

/** 도시 화면 거르기: 전체·내 것·무리 하나 */
export type CityFilter = "all" | "mine" | FacilityGroup;

export interface CityRow {
  readonly id: number;
  readonly facilityId: string | null;
  /** 지금 언어의 시설 이름(없으면 null — 화면이 "건물 #ID") */
  readonly name: string | null;
  readonly group: FacilityGroup;
  /** 다 지은 레벨(겉모습 답이 없으면 null) */
  readonly level: number | null;
  readonly state: MapLookState | null;
  readonly upgrading: boolean;
  readonly mine: boolean;
  /** 기준점에서 건물 가운데까지(배치 칸, 기준점이 없으면 null) */
  readonly cells: number | null;
}

export interface CityRowsInput {
  readonly buildings: readonly BuildingFootprint[];
  readonly looks: ReadonlyMap<number, MapBuildingLook>;
  readonly at: Point | null;
  readonly locale: "ko" | "en";
}

const GROUP_RANK: ReadonlyMap<FacilityGroup, number> = new Map(
  FACILITY_GROUPS.map((group, index) => [group, index]),
);

export function buildCityRows(input: CityRowsInput): CityRow[] {
  const rows = input.buildings.map((building): CityRow => {
    const look = input.looks.get(building.id);
    const centre = buildingCentre(building);
    return {
      id: building.id,
      facilityId: look?.facilityId ?? null,
      name: look?.name ? (input.locale === "en" ? look.name.en : look.name.ko) : null,
      group: groupOf(look),
      level: look ? look.level : null,
      state: look ? look.state : null,
      upgrading: look?.upgrading === true,
      mine: look?.mine === true,
      cells: input.at ? Math.hypot(centre.x - input.at.x, centre.y - input.at.y) : null,
    };
  });
  return rows.toSorted((a, b) => {
    const group = (GROUP_RANK.get(a.group) ?? 0) - (GROUP_RANK.get(b.group) ?? 0);
    if (group !== 0) return group;
    if (a.cells !== null && b.cells !== null && a.cells !== b.cells) return a.cells - b.cells;
    const name = (a.name ?? "").localeCompare(b.name ?? "", input.locale);
    return name !== 0 ? name : a.id - b.id;
  });
}

/** 거르기에 맞는 줄 */
export function filterCityRows(rows: readonly CityRow[], filter: CityFilter): CityRow[] {
  if (filter === "all") return [...rows];
  if (filter === "mine") return rows.filter((row) => row.mine);
  return rows.filter((row) => row.group === filter);
}

/** 거르기마다 수(0인 무리는 화면이 칩을 숨긴다) */
export function cityCounts(rows: readonly CityRow[]): Readonly<Record<CityFilter, number>> {
  const counts: Record<CityFilter, number> = {
    all: rows.length,
    mine: 0,
    administration: 0,
    gathering: 0,
    processing: 0,
    storage: 0,
    housing: 0,
    public: 0,
    commerce: 0,
    transport: 0,
    military: 0,
    other: 0,
  };
  for (const row of rows) {
    counts[row.group] += 1;
    if (row.mine) counts.mine += 1;
  }
  return counts;
}

/** 행정 건물(정부 판이 그 건물 판 안에 있다 — 도시 화면 머리의 바로가기). 없으면 null */
export function governmentOf(rows: readonly CityRow[]): CityRow | null {
  return rows.find((row) => row.facilityId === "government_hall") ?? null;
}
