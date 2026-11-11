// 세계 배치 화면 배후지 덮개(tRPC worldLayout.catchment) — docs/adr/2026-11-11-city-catchment.md 4절. 고른 국가 수도 둘레 격자에 칸마다 여섯
// 원자재 비트와, 지금 세계 도시·빈 세계 등급 배치 계획 도시의 배후지 덮임을 보인다(운영자가 간격·자원을 눈으로 판단). 읽기만 한다.
// 순수 함수(행성 값·도시 목록은 부르는 쪽이 넘긴다).
import { type CellKey, isCellKey } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import { type MaterialWeights, cellMaterials, cityGapMilli } from "@terra/shared/catchment";
import { territoryDistanceMilli } from "@terra/shared/territory";
import type { WorldCatchmentCity, WorldCatchmentView } from "@terra/shared/worldPlacementApi";
import type { WorldSeedCoefficients } from "@terra/sim";
import { createCatchmentCache, walkCell } from "./citySites.ts";
import { type LayoutLand, catchmentRulesOf } from "./worldLayout.ts";

/** 덮개에 넣을 도시 하나(국가 코드·2차맵) */
export interface CatchmentViewCity {
  readonly code: string;
  readonly mapKey: number;
}

export interface CatchmentViewInput {
  readonly faceLevel: number;
  readonly land: (key: CellKey) => LayoutLand | undefined;
  readonly seed: WorldSeedCoefficients;
  /** 고른 국가 */
  readonly code: string;
  /** 격자 가운데(고른 국가 수도) */
  readonly center: CellKey;
  readonly world: readonly CatchmentViewCity[];
  readonly plan: readonly CatchmentViewCity[];
  /** 국가 코드 → 배후지 원자재 가중치 */
  readonly needsOf: (code: string) => MaterialWeights;
}

/** 배후지가 겹친 도시 쌍 수(거리 < 2R) */
function overlapPairs(cities: readonly CatchmentViewCity[], radiusCells: number, faceLevel: number): number {
  if (radiusCells <= 0) return 0;
  const metric = territoryMetric(faceLevel);
  const points = cities.flatMap((city) => (isCellKey(city.mapKey) ? [territoryPoint(city.mapKey)] : []));
  let count = 0;
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++) {
      const pa = points[a];
      const pb = points[b];
      if (pa && pb && territoryDistanceMilli(pa, pb, metric) < radiusCells * 2000) count += 1;
    }
  return count;
}

export function catchmentViewOf(input: CatchmentViewInput): WorldCatchmentView {
  const rules = catchmentRulesOf(input.seed);
  // 반경 0(옛 배치)이어도 덮개는 반경 1로 그린다(겹침을 보이려고) — 간격 값은 설정 그대로
  const radius = Math.max(1, rules.radiusCells);
  const span = Math.max(1, Math.trunc(rules.searchCells)) + radius;
  const side = 2 * span + 1;
  const landOf = (key: CellKey) => {
    const cell = input.land(key);
    return cell ? { ...cell, forest: cell.forest ?? 0 } : undefined;
  };
  const cache = createCatchmentCache(landOf, input.seed, radius, input.faceLevel);
  const cells: number[] = [];
  const at = new Map<number, { di: number; dj: number }>();
  for (let dj = -span; dj <= span; dj++)
    for (let di = -span; di <= span; di++) {
      const key = walkCell(input.center, di, dj);
      if (key === null) {
        cells.push(-1);
        continue;
      }
      if (!at.has(key)) at.set(key, { di, dj });
      cells.push(cellMaterials(landOf(key), input.seed));
    }
  const place = (list: readonly CatchmentViewCity[]): WorldCatchmentCity[] =>
    list.flatMap((city) => {
      const spot = isCellKey(city.mapKey) ? at.get(city.mapKey) : undefined;
      if (!spot || !isCellKey(city.mapKey)) return [];
      return [
        {
          di: spot.di,
          dj: spot.dj,
          cover: cache.cover(city.mapKey, input.needsOf(city.code)),
          code: city.code,
          own: city.code === input.code,
        },
      ];
    });
  return {
    code: input.code,
    radiusCells: rules.radiusCells,
    searchCells: Math.max(1, Math.trunc(rules.searchCells)),
    sameGapCells: cityGapMilli(rules, true) / 1000,
    foreignGapCells: cityGapMilli(rules, false) / 1000,
    span,
    cells: cells.length === side * side ? cells : [],
    world: place(input.world),
    plan: place(input.plan),
    overlapWorld: overlapPairs(input.world, radius, input.faceLevel),
    overlapPlan: overlapPairs(input.plan, radius, input.faceLevel),
  };
}
