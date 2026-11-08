// 근처 판의 줄 만들기 — docs/adr/2026-11-08-seamless-second-map.md WP-2. 엔진·React를 모른다(위치는 함수로 받는다).
// - 자원: 채집 오브젝트(gather.objects). 이름 = 종류 이름, 덧말 = 남은 번수 또는 다시 자라는 시간.
// - 건물: 지도 자료의 건물(보이는 것만 온다). 이름 = 겉모습 답의 시설 이름(없으면 "건물 #ID"), 덧말 = 레벨·내 것.
// - 유닛: 내 유닛(이 2차맵 목록, 늘 위) 다음 시야 안 다른 유닛. 내 유닛 덧말 = 상태(유닛 목록과 같은 글).
// 셋 모두 기준점에서 가까운 차례이고 limit개까지 싣는다(목록 끝에서 20개씩 더). 탭 글자의 수는 전체 수다.
import type { BuildingFootprint } from "@terra/engine";
import type { GatherKindView } from "@terra/shared/gather";
import type { MapBuildingLook } from "@terra/shared/mapLooks";
import type { MapUnit } from "@terra/shared/mapUnits";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { minutesText, nameText } from "../gather/gatherData.ts";
import type { GatherObjectEntry } from "../gather/gatherState.ts";
import { unitName, unitStatusText } from "../mapUnits.ts";
import { type Point, buildingCentre, objectCentre, rankByDistance } from "./nearbyData.ts";
import type { NearbyTab } from "./nearbyState.ts";

export type NearbyRow =
  | {
      readonly kind: "object";
      readonly id: number;
      readonly name: string;
      readonly detail: string;
      readonly cells: number;
      readonly depleted: boolean;
    }
  | {
      readonly kind: "building";
      readonly id: number;
      readonly name: string;
      readonly detail: string;
      readonly cells: number;
      readonly mine: boolean;
    }
  | {
      readonly kind: "unit";
      readonly id: number;
      readonly name: string;
      readonly detail: string;
      readonly cells: number;
      /** 내 유닛이면 목록 줄(고르기), 아니면 null(살펴보기) */
      readonly unit: MapUnit | null;
    };

export interface NearbyRows {
  readonly counts: Readonly<Record<NearbyTab, number>>;
  /** 고른 탭의 줄(limit개까지) */
  readonly rows: readonly NearbyRow[];
  /** 고른 탭의 전체 수(더 보일 것이 있나) */
  readonly total: number;
}

export const EMPTY_ROWS: NearbyRows = {
  counts: { resources: 0, buildings: 0, units: 0 },
  rows: [],
  total: 0,
};

export interface NearbyInput {
  readonly tab: NearbyTab | null;
  readonly limit: number;
  /** 기준점(배치 칸). 없으면 원래 차례 */
  readonly at: Point | null;
  readonly nowMs: number;
  readonly kinds: readonly GatherKindView[];
  readonly objects: readonly GatherObjectEntry[];
  readonly buildings: readonly BuildingFootprint[];
  readonly looks: ReadonlyMap<number, MapBuildingLook>;
  /** 이 2차맵의 내 유닛(받기 전 null) */
  readonly myUnits: readonly MapUnit[] | null;
  /** 시야 안 유닛 ID(내 유닛 포함 — 빼고 센다) */
  readonly visibleUnits: Iterable<number>;
  /** 엔진이 아는 유닛의 지금 자리(배치 칸) */
  readonly unitAt: (id: number) => Point | null;
  readonly moving: ReadonlySet<number>;
  /** 내 유닛 목록을 받은 서버 시각(부상 남은 시간, D-525) */
  readonly listedAt?: number | undefined;
}

function objectRow(object: GatherObjectEntry, cells: number, input: NearbyInput): NearbyRow {
  const kind = input.kinds[object.kind];
  const depleted = object.usesLeft <= 0 && object.regrowAtMs > input.nowMs;
  return {
    kind: "object",
    id: object.id,
    name: nameText(kind?.name ?? null, m.gather_object_unknown()),
    detail: depleted
      ? m.nearby_regrow({ time: minutesText(object.regrowAtMs - input.nowMs) })
      : m.nearby_uses_left({ uses: object.usesLeft }),
    cells,
    depleted,
  };
}

function buildingRow(building: BuildingFootprint, cells: number, input: NearbyInput): NearbyRow {
  const look = input.looks.get(building.id);
  const name = look?.name ? (getLocale() === "en" ? look.name.en : look.name.ko) : null;
  const mine = look?.mine === true;
  const level = look ? m.nearby_building_level({ level: look.level }) : null;
  return {
    kind: "building",
    id: building.id,
    name: name ?? m.nearby_building_unknown({ id: building.id }),
    detail: [level, mine ? m.nearby_building_mine() : null].filter((part) => part !== null).join(" · "),
    cells,
    mine,
  };
}

/** 고른 탭의 줄과 탭마다 수 */
export function buildNearbyRows(input: NearbyInput): NearbyRows {
  const mineIds = new Set((input.myUnits ?? []).map((unit) => unit.unitId));
  const others: { id: number; point: Point }[] = [];
  for (const id of input.visibleUnits) {
    if (mineIds.has(id)) continue;
    const point = input.unitAt(id);
    if (point) others.push({ id, point });
  }
  const counts = {
    resources: input.objects.length,
    buildings: input.buildings.length,
    units: mineIds.size + others.length,
  };
  if (input.tab === null) return { counts, rows: [], total: 0 };
  const { at, limit } = input;
  if (input.tab === "resources") {
    const ranked = rankByDistance(input.objects, at, objectCentre, (object) => object.id, limit);
    return {
      counts,
      rows: ranked.map((row) => objectRow(row.item, row.cells, input)),
      total: counts.resources,
    };
  }
  if (input.tab === "buildings") {
    const ranked = rankByDistance(input.buildings, at, buildingCentre, (building) => building.id, limit);
    return {
      counts,
      rows: ranked.map((row) => buildingRow(row.item, row.cells, input)),
      total: counts.buildings,
    };
  }
  // 유닛: 내 유닛(가까운 차례) 다음 다른 유닛(가까운 차례), 합쳐 limit개
  const mine = rankByDistance(
    input.myUnits ?? [],
    at,
    (unit) => input.unitAt(unit.unitId) ?? { x: unit.cellX + 0.5, y: unit.cellY + 0.5 },
    (unit) => unit.unitId,
  ).map(
    (row): NearbyRow => ({
      kind: "unit",
      id: row.item.unitId,
      name: unitName(row.item),
      detail: unitStatusText(row.item, input.moving.has(row.item.unitId), input.listedAt),
      cells: row.cells,
      unit: row.item,
    }),
  );
  const rest = rankByDistance(
    others,
    at,
    (other) => other.point,
    (other) => other.id,
  ).map(
    (row): NearbyRow => ({
      kind: "unit",
      id: row.item.id,
      name: m.map_unit_number({ id: row.item.id }),
      detail: m.nearby_unit_other(),
      cells: row.cells,
      unit: null,
    }),
  );
  return { counts, rows: [...mine, ...rest].slice(0, limit), total: counts.units };
}
