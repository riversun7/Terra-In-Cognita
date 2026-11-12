// 도시 배후지(1차맵 칸 원)와 지방 도시 자리 점수 — docs/adr/2026-11-11-city-catchment.md, 사용자 지적(2026-11-11, 원문) "npc세력의 도시 배치를
// 어느정도 벌려야 한다. 너무 가까우면 도시를 유지하기 위한 주변 지형자원의 점유 영역이 겹쳐 도시간의 자원경쟁으로 서로 발전하지 못한다. 현재 너무
// 가깝게 바둑판배열로 다닥다닥 붙어있다."
// - 배후지 칸: 도시 2차맵(1차맵 칸)에서 영토 거리(@terra/shared territoryDistanceMilli) R칸 안의 칸들(가운데 포함). 면 경계는 걸어서 넘는다.
// - 덮임: @terra/shared/catchment(칸마다 여섯 원자재 몫 → 원자재마다 몫 평균을 쓰는 시설 수로 가중 평균). 바뀜 (2026-11-12, 기획 D-533·질문
//   1027 다): 있음/없음 비트 대신 몫(광석 = 고도 몫, 목재 = 숲 밀도 — cellSharesPm "site")으로 센다. 칸 수(counts)는 비트 그대로 보인다.
// - 다툼(겹친 배후지): 한 칸은 가장 가까운 도시 하나의 것(같으면 작은 ID) — splitCatchments.
// - 바뀜 (2026-11-12, 사용자 지적 "인구와 도시등급이 높을 수록 … 요구 영토범위가 넓어지고"): 반경이 도시마다 다르다(1000분율 칸,
//   @terra/shared/catchment catchmentRadiusMilli·sim plannedCityRadiusMilli). 두 도시 간격 = (두 반경 합) × 천분율(cityPairGapMilli).
// 순수 함수(행성 값은 부르는 쪽이 land로 넘긴다). 같은 입력이면 같은 결과다.
import { type CellKey, parseCellKey, stepCell } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import {
  type CatchmentLand,
  type CatchmentLandRules,
  type CatchmentRules,
  type MaterialCounts,
  type MaterialShares,
  type MaterialWeights,
  cellMaterials,
  cellSharesPm,
  cityPairGapMilli,
  countMaterials,
  shareCoveragePm,
  siteScore,
  sumShares,
} from "@terra/shared/catchment";
import { type TerritoryVec, territoryDistanceMilli } from "@terra/shared/territory";

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
  return catchmentCellsMilli(center, Math.max(0, Math.trunc(radiusCells)) * 1000, faceLevel);
}

/** 배후지 칸들(반경 1000분율 칸 — 도시 크기마다 다르다). 반경이 1칸 미만이면 가운데 하나 */
export function catchmentCellsMilli(center: CellKey, radiusMilli: number, faceLevel: number): CellKey[] {
  const limit = Math.max(0, Math.trunc(radiusMilli));
  const reach = Math.floor(limit / 1000);
  const out: CellKey[] = [center];
  if (reach === 0) return out;
  const metric = territoryMetric(faceLevel);
  const origin = territoryPoint(center);
  const seen = new Set<number>([center]);
  for (let dj = -reach; dj <= reach; dj++)
    for (let di = -reach; di <= reach; di++) {
      if (di === 0 && dj === 0) continue;
      const key = walkCell(center, di, dj);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      if (territoryDistanceMilli(territoryPoint(key), origin, metric) <= limit) out.push(key);
    }
  return out;
}

/** 배후지 하나의 원자재 칸 수(비트)·몫 합·덮임(몫) */
export interface CatchmentSummary {
  readonly cells: number;
  readonly counts: MaterialCounts;
  /** 원자재마다 칸 몫 합(‰ × 칸, cellSharesPm "site") */
  readonly shares: MaterialShares;
  readonly coverPm: number;
}

/** 칸 목록의 원자재 칸 수와 덮임 */
export function summarize(
  cells: readonly CellKey[],
  land: (key: CellKey) => CatchmentLand | undefined,
  rules: CatchmentLandRules,
  weights: MaterialWeights,
): CatchmentSummary {
  const counts = countMaterials(cells.map((key) => cellMaterials(land(key), rules)));
  const shares = sumShares(cells.map((key) => cellSharesPm(land(key), rules, "site")));
  return { cells: cells.length, counts, shares, coverPm: shareCoveragePm(shares, cells.length, weights) };
}

/** 도시 하나(배후지를 나눌 때) */
export interface CatchmentCity {
  readonly id: number;
  readonly mapKey: CellKey;
  /** 이 도시 반경(1000분율 칸). 없으면 나누기에 준 반경 */
  readonly radiusMilli?: number | undefined;
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
    const cells = catchmentCellsMilli(city.mapKey, city.radiusMilli ?? radiusCells * 1000, faceLevel);
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

/** 배후지 덮임 셈 붙잡기(같은 배치 안에서 칸 비트·배후지 칸 목록을 한 번만 셈한다) */
export interface CatchmentCache {
  /** 그 칸이 가운데인 배후지의 덮임(가중치마다). radiusMilli가 없으면 붙잡기를 만들 때 준 반경 */
  cover(center: CellKey, weights: MaterialWeights, radiusMilli?: number): number;
}

export function createCatchmentCache(
  land: (key: CellKey) => CatchmentLand | undefined,
  rules: CatchmentLandRules,
  radiusCells: number,
  faceLevel: number,
): CatchmentCache {
  const sharesOf = new Map<number, MaterialShares>();
  // 반경(1000분율) → 가운데 → 칸 수·몫 합
  const countsOf = new Map<number, Map<number, { cells: number; sums: MaterialShares }>>();
  const fallback = Math.max(0, Math.trunc(radiusCells)) * 1000;
  const shares = (key: CellKey): MaterialShares => {
    let value = sharesOf.get(key);
    if (value === undefined) {
      value = cellSharesPm(land(key), rules, "site");
      sharesOf.set(key, value);
    }
    return value;
  };
  return {
    cover(center, weights, radiusMilli = fallback) {
      let byCenter = countsOf.get(radiusMilli);
      if (!byCenter) {
        byCenter = new Map();
        countsOf.set(radiusMilli, byCenter);
      }
      let entry = byCenter.get(center);
      if (!entry) {
        const cells = catchmentCellsMilli(center, radiusMilli, faceLevel);
        entry = { cells: cells.length, sums: sumShares(cells.map(shares)) };
        byCenter.set(center, entry);
      }
      return shareCoveragePm(entry.sums, entry.cells, weights);
    },
  };
}

/** 이미 선(또는 이번에 고른) 도시 하나 — 간격 검사 */
export interface SpacedCity {
  readonly factionId: number;
  readonly point: TerritoryVec;
  /** 그 도시 배후지 반경(1000분율 칸 — 크기마다 다르다) */
  readonly radiusMilli: number;
}

/** 지방 도시 자리 고르기 입력(국가 하나) */
export interface CitySiteInput {
  readonly faceLevel: number;
  readonly factionId: number;
  /** 수도 2차맵 */
  readonly home: CellKey;
  /** 수도를 새로 세워야 하나(이 국가에 제자리 도시가 없음 — 첫 자리는 수도 2차맵) */
  readonly needCapital: boolean;
  /** 더 세울 도시 수 */
  readonly count: number;
  readonly rules: CatchmentRules;
  /** 새 지방 도시의 배후지 반경(1000분율 칸, 처음 기간에 이를 크기 — sim plannedCityRadiusMilli) */
  readonly radiusMilli: number;
  /** 새 수도의 배후지 반경(needCapital일 때) */
  readonly capitalRadiusMilli: number;
  /** 같은 국가 도시 사이 가장 짧은 거리의 바닥(1/1000칸 — 국력 등급 도시 걸음) */
  readonly minSameMilli: number;
  readonly weights: MaterialWeights;
  readonly cache: CatchmentCache;
  /** 도시가 설 수 있는 칸인가(알맞은 땅·빈 2차맵·피할 2차맵 아님·다른 세력 영향권 밖) */
  readonly fits: (key: CellKey) => boolean;
  /** 지금까지 선 도시(모든 세력, 이 함수가 고른 것을 뒤에 더한다) */
  readonly cities: SpacedCity[];
  /** 같은 점수 자리를 가르는 소금(세계 시드와 국가 — 같은 땅이 고르게 이어질 때 바둑판이 되지 않게) */
  readonly salt: number;
}

/** 32비트 섞기(같은 점수 자리 가르기) */
function mixKey(salt: number, key: CellKey): number {
  let x = (salt ^ Math.imul(key % 0x1_0000_0000, 0x9e37_79b1) ^ Math.floor(key / 0x1_0000_0000)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb_352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846c_a68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 지방 도시 자리(docs/adr/2026-11-11-city-catchment.md 3절, "바뀜 (2026-11-12)"): 수도 둘레 찾는 반경 안 모든 칸 가운데 도시가 설 수 있고 모든
 * 도시와 간격(같은 국가 = max((두 반경 합) × sameGapPm, 등급 걸음), 다른 국가 = (두 반경 합) × foreignGapPm)을 지키는 칸에서, 자리 점수(배후지
 * 덮임 − 수도 거리 몫)가 가장 높은 칸을 하나씩 고른다(같으면 (소금, 키) 섞은 값이 작은 칸, 그래도 같으면 작은 키 — 고른 땅에서 고정 걸음
 * 표처럼 줄 서지 않게). 첫 자리는 수도 2차맵(needCapital). 고른 칸을 cities에 더하고 돌려준다. 반경이 도시마다 달라(수도·큰 나라는 넓고 작은
 * 나라는 좁다) 간격이 고르지 않다
 */
export function pickCitySites(input: CitySiteInput): CellKey[] {
  const metric = territoryMetric(input.faceLevel);
  const homePoint = territoryPoint(input.home);
  const search = Math.max(1, Math.trunc(input.rules.searchCells));
  const out: CellKey[] = [];
  const spaced = (point: TerritoryVec, radiusMilli: number): boolean =>
    input.cities.every((city) => {
      const same = city.factionId === input.factionId;
      const gap = cityPairGapMilli(radiusMilli, city.radiusMilli, same, input.rules);
      return (
        territoryDistanceMilli(point, city.point, metric) >= (same ? Math.max(gap, input.minSameMilli) : gap)
      );
    });
  const take = (key: CellKey, point: TerritoryVec, radiusMilli: number): void => {
    out.push(key);
    input.cities.push({ factionId: input.factionId, point, radiusMilli });
  };
  let left = input.count;
  if (input.needCapital && left > 0) {
    if (!input.fits(input.home)) return out;
    take(input.home, homePoint, input.capitalRadiusMilli);
    left -= 1;
  }
  if (left <= 0) return out;
  // 후보: 수도 둘레 찾는 반경 안 칸(키 차례로 한 번씩) — 점·수도 거리·덮임은 한 번만 셈한다
  const seen = new Set<number>([input.home]);
  const pool: { key: CellKey; point: TerritoryVec; score: number; tie: number }[] = [];
  for (let dj = -search; dj <= search; dj++)
    for (let di = -search; di <= search; di++) {
      const key = walkCell(input.home, di, dj);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      const point = territoryPoint(key);
      const fromHome = territoryDistanceMilli(point, homePoint, metric);
      if (fromHome > search * 1000 || !input.fits(key)) continue;
      const cover = input.cache.cover(key, input.weights, input.radiusMilli);
      pool.push({
        key,
        point,
        score: siteScore(cover, fromHome, input.rules, input.radiusMilli),
        tie: mixKey(input.salt, key),
      });
    }
  pool.sort((a, b) => b.score - a.score || a.tie - b.tie || a.key - b.key);
  for (const entry of pool) {
    if (left <= 0) break;
    if (!spaced(entry.point, input.radiusMilli) || !input.fits(entry.key)) continue;
    take(entry.key, entry.point, input.radiusMilli);
    left -= 1;
  }
  return out;
}
