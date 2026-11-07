// NPC 마을 자리 — docs/adr/2026-11-01-npc-brain-r5.md 7절(새 마을은 부모 도시 둘레), docs/adr/2026-11-07-world-layout.md
// 사용자 지적(2026-11-07) "다른 세력 범위에 도시를 건설할 수 없다": 세우는 세력(부모)이 아닌 세력의 도시 영향권과 닿는 자리는 고르지 않는다
// (@terra/shared foundingConflict — 세계 배치의 시작 도시 자리와 같은 규칙). 자리가 없으면 세우지 않는다(시뮬 society.found의 자리 검사
// canFound가 false → 값을 내지 않는다). 순수 함수: 같은 입력이면 같은 자리(정해진 거리·16방위 차례).
import { placementCellKey, territoryMetric, territoryPoint } from "@terra/planet/territory";
import {
  type FoundingCity,
  type TerritoryCoefficients,
  cityGrade,
  foundingConflict,
  gradeValue,
} from "@terra/shared/territory";
import { cellLevel, isCellKey, parseCellKey } from "@terra/planet";
import type { CityPlace } from "./persist.ts";

/** 새 마을 자리: 부모 도시에서 떨어진 거리(칸)와 다른 도시와 띄울 거리(체비쇼프 칸) */
export const TOWN_DISTANCES = [28, 40, 52] as const;
export const TOWN_SPACING = 14;
const MAP_MARGIN = 8;
const MAP_SIZE = 256;

/** 16방위 단위 벡터(1000배, 정수 표 — 초월함수를 쓰지 않는다) */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1000, 0],
  [924, 383],
  [707, 707],
  [383, 924],
  [0, 1000],
  [-383, 924],
  [-707, 707],
  [-924, 383],
  [-1000, 0],
  [-924, -383],
  [-707, -707],
  [-383, -924],
  [0, -1000],
  [383, -924],
  [707, -707],
  [924, -383],
];

/** 자리 고르기가 보는 도시 하나(자리·주인·영향권) */
export interface TownSiteCity {
  readonly id: number;
  readonly place: CityPlace;
  /** 주인 세력(거울 세계 세력 ID). 폐허 자리는 null(띄우기만 한다) */
  readonly owner: number | null;
  /** 지금 영향권 반경(1000분율 칸, D-104) */
  readonly radiusMilli: number;
}

/** 영토 계수(설정 칸 실효 값) → 발전도별 영향권 반경·새 마을 영향권 반경(처음 등급) */
export function territoryOf(t: TerritoryCoefficients): {
  influenceOf(development: number): number;
  newRadiusMilli: number;
} {
  return {
    influenceOf: (development) => gradeValue(t.influenceMilli, cityGrade(development, t)),
    newRadiusMilli: gradeValue(t.influenceMilli, 1),
  };
}

/** 배치 칸 자리의 영토 점(셀 키가 아니면 undefined — S1 임시 지형 시험 등) */
function pointOf(mapKey: number, x: number, y: number) {
  return isCellKey(mapKey) ? territoryPoint(placementCellKey(parseCellKey(mapKey), x, y)) : undefined;
}

/**
 * 마을 자리: from(붐비는 도시) 둘레 같은 2차맵에서 정해진 거리 × 16방위 차례로, 지도 가장자리 안·다른 도시(폐허 자리 포함)와 띄운 곳·
 * founder가 아닌 세력 도시 영향권과 닿지 않는 첫 칸. 없으면 undefined
 */
export function pickTownSite(input: {
  readonly from: CityPlace;
  readonly founder: number;
  readonly cities: readonly TownSiteCity[];
  /** 새 마을의 영향권 반경(처음 등급, 1000분율 칸) */
  readonly newRadiusMilli: number;
  readonly nowMs: number;
}): CityPlace | undefined {
  const { from } = input;
  const taken = input.cities.filter((city) => city.place.mapKey === from.mapKey).map((city) => city.place);
  const metric = isCellKey(from.mapKey) ? territoryMetric(cellLevel(parseCellKey(from.mapKey))) : undefined;
  const foreign: FoundingCity[] = [];
  for (const city of input.cities) {
    if (city.owner === null) continue;
    const point = pointOf(city.place.mapKey, city.place.cellX, city.place.cellY);
    if (point) foreign.push({ id: city.id, faction: city.owner, point, radiusMilli: city.radiusMilli });
  }
  const own = (faction: number) => faction === input.founder;
  for (const distance of TOWN_DISTANCES) {
    for (const [dx, dy] of DIRECTIONS) {
      const x = from.cellX + Math.trunc((dx * distance) / 1000);
      const y = from.cellY + Math.trunc((dy * distance) / 1000);
      if (x < MAP_MARGIN || y < MAP_MARGIN || x >= MAP_SIZE - MAP_MARGIN || y >= MAP_SIZE - MAP_MARGIN)
        continue;
      if (taken.some((p) => Math.max(Math.abs(p.cellX - x), Math.abs(p.cellY - y)) < TOWN_SPACING)) continue;
      const point = pointOf(from.mapKey, x, y);
      if (metric && point && foundingConflict(foreign, metric, own, point, input.newRadiusMilli) !== null)
        continue;
      return { planetId: from.planetId, mapKey: from.mapKey, cellX: x, cellY: y, foundedAtMs: input.nowMs };
    }
  }
  return undefined;
}
