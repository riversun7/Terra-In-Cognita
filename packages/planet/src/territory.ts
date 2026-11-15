// 행성 칸 ↔ 영토 점, 영토 칸 표(1차맵 칸마다 차지한 세력) — docs/adr/2026-11-03-territory-layer.md, 기획 D-104·D-568
// 소속·겹침 규칙(1차맵 영토 지도 — 도시 원·띠·비콘 외곽선·영향력 비율)은 @terra/shared/territory·territoryMap이고, 여기는 행성 격자와
// 잇는 부분만 한다.
// - 점 = 칸 중심 단위 벡터(결정적 투영 cellCenter) × 2^16을 반올림한 정수 벡터. 엔진과 상관없이 같다(사칙연산·sqrt·detTan만).
//   2^16 해상도 = 1/65536 라디안(지구 F9에서 약 8m, 배치 칸 5.9m 수준)이라 1차맵 칸 중심끼리는 늘 다른 점이다.
// - 거리 = 각 × 평균 칸/라디안. 평균 칸 한 변 = R·√(2π/3)/2^F = 약 1,500.7m(모든 행성에서 같다, projection.ts). 그래서 거리 설정 칸은
//   "1000분율 칸"으로 적고 km는 이 값으로 바꾼다(옛 비콘 거리 15km ≈ 10칸, 20km ≈ 13.3칸).
// - 칸 표: 칸마다 하위 칸(기본 2단계 더 = 4×4 = 16곳) 중심의 소속을 세어 가장 많은 쪽(소속 없음도 한 쪽)이 그 칸이다(D-104 "칸마다
//   차지한 비율이 가장 큰 세력의 색"). 같으면 세력이 소속 없음을 이기고, 세력끼리는 작은 ID. 지방 = 이긴 세력 표본에서 가장 많은 도시.
//   도시·비콘 칸에서 시작해 표본이 하나라도 소속된 칸의 이웃 8칸으로 넓힌다(덩이마다 원·띠·삼각형이 이어져 있다).
import {
  type TerritoryClaim,
  type TerritoryLayout,
  type TerritoryVec,
  claimAt,
} from "@terra/shared/territory";
import { type CellKey, cellLevel } from "./cellKey.ts";
import { descendantAt } from "./hierarchy.ts";
import { PLACEMENT_SUBLEVELS, cellsPerSide } from "./levels.ts";
import { neighbors8 } from "./neighbors.ts";
import { cellCenter } from "./projection.ts";

/** 점 성분 배율(@terra/shared TERRITORY_POINT_SCALE와 같다) */
const SCALE = 65_536;
/** 칸 표의 표본 깊이(하위 2단계 = 칸마다 16곳) */
export const TERRITORY_SAMPLE_DEPTH = 2;
/** 칸 표 한 번에 보는 칸 수 상한(세력 영토가 비정상으로 클 때 멈춘다) */
export const TERRITORY_RASTER_MAX_CELLS = 200_000;

/** 칸 중심 → 영토 점 */
export function territoryPoint(key: CellKey): TerritoryVec {
  const [x, y, z] = cellCenter(key);
  return [Math.round(x * SCALE), Math.round(y * SCALE), Math.round(z * SCALE)];
}

/** 2차맵(1차맵 칸) 안 배치 칸 (x, y)의 칸 키(도시 시청 자리 등) */
export function placementCellKey(mapKey: CellKey, x: number, y: number): CellKey {
  return descendantAt(mapKey, PLACEMENT_SUBLEVELS, x, y);
}

/** 면 레벨 F 행성의 거리 환산(각 → 1000분율 평균 칸) */
export function territoryMetric(faceLevel: number): { readonly milliPerRadian: number } {
  return { milliPerRadian: (1000 * cellsPerSide(faceLevel)) / Math.sqrt((2 * Math.PI) / 3) };
}

/** km → 1000분율 평균 칸(설정 칸 출발값을 적을 때. 평균 칸 한 변 1.5007km) */
export const AVERAGE_CELL_EDGE_METERS = 1500.7;

export interface TerritoryRasterCell {
  readonly faction: number;
  /** 지방(가까운 도시). 그 세력에 도시가 없으면 null */
  readonly province: number | null;
  /** 그 세력이 차지한 표본 수(0 ~ 표본 수) */
  readonly samples: number;
}

/**
 * 영토 칸 표: 레벨 faceLevel 칸 키 → 차지한 세력. seeds = 시작 칸(꼭짓점이 든 1차맵 칸들). 차례 = 칸 키 차례
 */
export function rasterizeTerritory(
  layout: TerritoryLayout,
  seeds: readonly CellKey[],
  faceLevel: number,
  depth = TERRITORY_SAMPLE_DEPTH,
): Map<CellKey, TerritoryRasterCell> {
  const side = 1 << depth;
  const queue = [...new Set(seeds.filter((key) => cellLevel(key) === faceLevel))].toSorted((a, b) => a - b);
  const seen = new Set<CellKey>(queue);
  const out = new Map<CellKey, TerritoryRasterCell>();
  for (let head = 0; head < queue.length && head < TERRITORY_RASTER_MAX_CELLS; head++) {
    const key = queue[head];
    if (key === undefined) continue;
    const claims: TerritoryClaim[] = [];
    for (let x = 0; x < side; x++)
      for (let y = 0; y < side; y++) {
        const claim = claimAt(layout, territoryPoint(descendantAt(key, depth, x, y)));
        if (claim) claims.push(claim);
      }
    if (claims.length === 0) continue;
    const cell = pickCell(claims, side * side);
    if (cell) out.set(key, cell);
    for (const next of neighbors8(key))
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  }
  return new Map([...out.entries()].toSorted((a, b) => a[0] - b[0]));
}

/** 표본 소속 → 칸 하나(가장 많은 세력이 소속 없음보다 적으면 없음) */
function pickCell(claims: readonly TerritoryClaim[], total: number): TerritoryRasterCell | undefined {
  const byFaction = new Map<number, TerritoryClaim[]>();
  for (const claim of claims) {
    const list = byFaction.get(claim.faction) ?? [];
    list.push(claim);
    byFaction.set(claim.faction, list);
  }
  let faction: number | undefined;
  let count = 0;
  for (const [id, list] of byFaction)
    if (list.length > count || (list.length === count && faction !== undefined && id < faction)) {
      faction = id;
      count = list.length;
    }
  if (faction === undefined || count < total - claims.length) return undefined;
  const provinces = new Map<number, number>();
  for (const claim of byFaction.get(faction) ?? [])
    if (claim.province !== null) provinces.set(claim.province, (provinces.get(claim.province) ?? 0) + 1);
  let province: number | null = null;
  let best = 0;
  for (const [id, n] of provinces)
    if (n > best || (n === best && province !== null && id < province)) {
      province = id;
      best = n;
    }
  return { faction, province, samples: count };
}
