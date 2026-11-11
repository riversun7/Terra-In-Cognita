// 도시 배후지(1차맵 칸 원)와 지방 도시 자리 점수 — docs/adr/2026-11-11-city-catchment.md, 사용자 지적(2026-11-11, 원문) "npc세력의 도시 배치를
// 어느정도 벌려야 한다. 너무 가까우면 도시를 유지하기 위한 주변 지형자원의 점유 영역이 겹쳐 도시간의 자원경쟁으로 서로 발전하지 못한다. 현재 너무
// 가깝게 바둑판배열로 다닥다닥 붙어있다."
// - 배후지 칸: 도시 2차맵(1차맵 칸)에서 영토 거리(@terra/shared territoryDistanceMilli) R칸 안의 칸들(가운데 포함). 면 경계는 걸어서 넘는다.
// - 덮임: @terra/shared/catchment(칸마다 여섯 원자재 비트 → 원자재마다 몫을 쓰는 시설 수로 가중 평균).
// - 다툼(겹친 배후지): 한 칸은 가장 가까운 도시 하나의 것(같으면 작은 ID) — splitCatchments.
// 순수 함수(행성 값은 부르는 쪽이 land로 넘긴다). 같은 입력이면 같은 결과다.
import { type CellKey, parseCellKey, stepCell } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import {
  type CatchmentLand,
  type CatchmentThresholds,
  type MaterialCounts,
  type MaterialWeights,
  cellMaterials,
  countMaterials,
  coveragePm,
} from "@terra/shared/catchment";
import { territoryDistanceMilli } from "@terra/shared/territory";

/** 칸 키에서 (di, dj)만큼 걸어간 칸(한 칸씩 걸어 면 경계를 넘는다). 꼭짓점 쪽으로 칸이 없으면 null */
export function walkCell(start: CellKey, di: number, dj: number): CellKey | null {
  let key: CellKey | null = start;
  const steps = Math.max(Math.abs(di), Math.abs(dj));
  for (let k = 0; k < steps && key !== null; k++) {
    const si = k < Math.abs(di) ? Math.sign(di) : 0;
    const sj = k < Math.abs(dj) ? Math.sign(dj) : 0;
    key = stepCell(key, si, sj);
  }
  return key;
}

/** 배후지 칸들(가운데 → 걸음 차례). 반경 0이면 가운데 하나 */
export function catchmentCells(center: CellKey, radiusCells: number, faceLevel: number): CellKey[] {
  const radius = Math.max(0, Math.trunc(radiusCells));
  const out: CellKey[] = [center];
  if (radius === 0) return out;
  const metric = territoryMetric(faceLevel);
  const origin = territoryPoint(center);
  const limit = radius * 1000;
  const seen = new Set<number>([center]);
  for (let dj = -radius; dj <= radius; dj++)
    for (let di = -radius; di <= radius; di++) {
      if (di === 0 && dj === 0) continue;
      const key = walkCell(center, di, dj);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      if (territoryDistanceMilli(territoryPoint(key), origin, metric) <= limit) out.push(key);
    }
  return out;
}

/** 배후지 하나의 원자재 칸 수·덮임 */
export interface CatchmentSummary {
  readonly cells: number;
  readonly counts: MaterialCounts;
  readonly coverPm: number;
}

/** 칸 목록의 원자재 칸 수와 덮임 */
export function summarize(
  cells: readonly CellKey[],
  land: (key: CellKey) => CatchmentLand | undefined,
  thresholds: CatchmentThresholds,
  weights: MaterialWeights,
): CatchmentSummary {
  const counts = countMaterials(cells.map((key) => cellMaterials(land(key), thresholds)));
  return { cells: cells.length, counts, coverPm: coveragePm(counts, cells.length, weights) };
}

/** 도시 하나(배후지를 나눌 때) */
export interface CatchmentCity {
  readonly id: number;
  readonly mapKey: CellKey;
}

/**
 * 겹친 배후지 나누기: 도시마다 배후지 칸 가운데 그 도시가 가장 가까운 칸만(같은 거리면 작은 ID). 도시 ID → 제 몫 칸, 겹친 칸 수(둘 이상의
 * 배후지에 든 칸)
 */
export function splitCatchments(
  cities: readonly CatchmentCity[],
  radiusCells: number,
  faceLevel: number,
): { readonly own: Map<number, CellKey[]>; readonly shared: number } {
  const metric = territoryMetric(faceLevel);
  const sorted = cities.toSorted((a, b) => a.id - b.id);
  const claim = new Map<number, { city: number; distance: number }>();
  const seenBy = new Map<number, number>();
  const cellsOf = new Map<number, CellKey[]>();
  for (const city of sorted) {
    const origin = territoryPoint(parseCellKey(city.mapKey));
    const cells = catchmentCells(city.mapKey, radiusCells, faceLevel);
    cellsOf.set(city.id, cells);
    for (const key of cells) {
      seenBy.set(key, (seenBy.get(key) ?? 0) + 1);
      const distance = territoryDistanceMilli(territoryPoint(key), origin, metric);
      const now = claim.get(key);
      if (!now || distance < now.distance) claim.set(key, { city: city.id, distance });
    }
  }
  const own = new Map<number, CellKey[]>();
  for (const city of sorted)
    own.set(
      city.id,
      (cellsOf.get(city.id) ?? []).filter((key) => claim.get(key)?.city === city.id),
    );
  let shared = 0;
  for (const count of seenBy.values()) if (count > 1) shared += 1;
  return { own, shared };
}
