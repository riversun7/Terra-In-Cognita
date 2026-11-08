// 세계 배치(고정 NPC 국가의 자리와 시작 도시) — docs/adr/2026-11-07-world-layout.md, 사용자 지적(2026-11-07, 원문) "1차맵에서 도시가 너무
// 겹침. 다른 세력 범위에 도시를 건설할 수 없는데, 현재 강제배치로 다른 세력내에 중첩되게 배치되어 문제. 세력범위 구분도 엉망인 상태".
// 순수 함수(행성 값 읽기는 부르는 쪽이 land로 넘긴다). 같은 입력이면 같은 결과다(칸 키 차례·정수 걸음·결정적 거리 detAtan2).
// 1. 국가 수도(국가 자리): 행성을 고르게 띄엄띄엄 본 칸(SAMPLE_CELLS_PER_FACE) 가운데 알맞은 땅(물 없음·고도·기온·강수, 설정 칸 [임시])에서 고른다.
//    시작 도시가 이미 선 국가는 그 첫 도시의 2차맵이 수도다. 사람이 자리를 고른 국가(D-528, home)는 그 2차맵이 수도다.
//    아무 국가도 자리가 없으면 첫 수도는 세계 시드로 고른 칸이다(자동 배치는 사람이 고르지 않은 국가의 뒷길·화면의 "제안").
//    나머지는 가장 먼 점 고르기(이미 고른 수도들과의 가장 짧은 거리가 가장 긴 칸, 같으면 작은 키) — 첫 수도 둘레 반경(설정 칸) 안에서.
//    국가 사이 가장 짧은 거리가 설정 칸보다 짧으면 반경을 두 배씩 넓혀 다시 고른다(행성 전체까지). 피할 2차맵(시험 2차맵 줄) 둘레 국가 간격
//    안의 칸은 수도 후보에서 뺀다.
// 2. 시작 도시: 국가마다 수도 2차맵 가운데가 첫 도시(수도), 다음 도시는 수도에서 설정 칸 걸음만큼 떨어진 2차맵(변 이웃 먼저 — 띄운
//    2차맵끼리 이어져 걸어서 오간다)의 가운데. 2차맵 하나에 도시 하나, 알맞은 땅, 다른 세력 도시 영향권과 닿지 않는 곳(@terra/shared
//    foundingConflict — NPC 마을 자리와 같은 규칙)만 고른다. 자리가 모자라면 고른 만큼만 돌려준다(부르는 쪽이 기록에 남긴다).
import {
  type CellKey,
  FACES,
  cellKey,
  cellsPerSide,
  decodeCellKey,
  isCellKey,
  parseCellKey,
  stepCell,
} from "@terra/planet";
import { placementCellKey, territoryMetric, territoryPoint } from "@terra/planet/territory";
import {
  type FoundingCity,
  type TerritoryVec,
  foundingConflict,
  territoryDistanceMilli,
} from "@terra/shared/territory";
import { PLACEMENT_SIZE, type WorldSeedCoefficients } from "@terra/sim";

/** 국가 자리를 고를 때 면 한 변에서 보는 칸 수(면 레벨 9 = 512칸 → 8칸마다 하나, 행성 전체 약 2만 5천 칸) */
export const SAMPLE_CELLS_PER_FACE = 64;
/** 시작 도시를 찾는 고리 수(수도에서 걸음 × 이 수까지) */
export const CITY_SEARCH_RINGS = 4;
/** 시작 도시의 2차맵 안 자리(가운데 = 그 2차맵 칸의 행성 값이 나타내는 곳) */
export const CITY_CELL = PLACEMENT_SIZE >> 1;

/** 행성 값에서 이 모듈이 보는 칸 값(PlanetCellValues의 일부) */
export interface LayoutLand {
  readonly biomeId: string | null;
  readonly elevationM: number;
  readonly temperatureC: number;
  readonly precipitationMm: number;
  /** 물 비트(바다 1·호수 2·강 4·해안 8). 0이어야 도시가 선다 */
  readonly water: number;
}

/** 시작 도시 자리(2차맵 키, 배치 칸) */
export interface LayoutSpot {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 자리를 고를 국가 하나(국가 차례) */
export interface LayoutNation {
  readonly factionId: number;
  /** 더 세울 시작 도시 수 */
  readonly missing: number;
  /** 이미 제자리에 선 이 국가의 시작 도시(첫 것의 2차맵이 수도) */
  readonly placed: readonly LayoutSpot[];
  /**
   * 사람이 고른 국가 자리(수도 2차맵, 기획 D-528 — 개발자·관리자 세계 배치 화면 /dev/world-layout, 표 world_nation_placements).
   * 제자리 시작 도시가 없을 때 그 국가의 고정 수도가 된다(가장 먼 점 고르기를 하지 않는다)
   */
  readonly home?: CellKey | undefined;
}

/** 피할 도시(다른 세력 도시·폐허 자리 등 — 같은 2차맵에 새 시작 도시를 두지 않고 영향권과 닿지 않게) */
export interface LayoutObstacle {
  readonly factionId: number;
  readonly spot: LayoutSpot;
  /** 그 도시의 지금 영향권 반경(1000분율 칸, D-104) */
  readonly radiusMilli: number;
}

export interface LayoutInput {
  readonly faceLevel: number;
  /** 그 2차맵 칸의 행성 값(없으면 알맞은 땅이 아니다) */
  readonly land: (mapKey: CellKey) => LayoutLand | undefined;
  readonly seed: WorldSeedCoefficients;
  /** 세계 시드(첫 수도를 고른다) */
  readonly worldSeed: number;
  readonly nations: readonly LayoutNation[];
  readonly obstacles: readonly LayoutObstacle[];
  /** 새 시작 도시의 영향권 반경(1000분율 칸, 처음 등급) */
  readonly newRadiusMilli: number;
  /** 시작 도시를 두지 않을 2차맵(시험 2차맵 줄 — 봇 규모 시험 자리) */
  readonly avoidMaps?: ReadonlySet<number> | undefined;
}

export interface LayoutResult {
  /** 국가마다 수도 2차맵 */
  readonly homes: ReadonlyMap<number, CellKey>;
  /** 새로 세울 시작 도시(국가 차례, 국가 안은 수도 → 가까운 차례) */
  readonly spots: readonly { readonly factionId: number; readonly spot: LayoutSpot }[];
  /** 마지막으로 쓴 반경(1차맵 칸) */
  readonly regionCells: number;
  /** 국가 수도 사이 가장 짧은 거리(1차맵 칸, 수도가 둘 이상일 때). 하나면 null */
  readonly minGapCells: number | null;
  /** 자리가 모자라 세우지 못한 시작 도시 수 */
  readonly short: number;
}

/** 시작 도시가 설 땅인가(설정 칸 [임시]): 바이옴이 있고, 물 비트가 없고, 고도 0 초과 위 끝 이하, 기온이 아래 끝~위 끝, 강수가 아래 끝 이상 */
export function isSettleLand(cell: LayoutLand | undefined, seed: WorldSeedCoefficients): boolean {
  if (!cell || cell.biomeId === null || cell.water !== 0) return false;
  if (cell.elevationM <= 0 || cell.elevationM > seed.layoutLandMaxHeightM) return false;
  if (cell.precipitationMm < seed.layoutLandMinRainMm) return false;
  return cell.temperatureC >= seed.layoutLandMinTempC && cell.temperatureC <= seed.layoutLandMaxTempC;
}

/** 글자 → 32비트 시드(FNV-1a). 세계 시드 = 세계 행성 ID(행성 하나에 세계 하나) */
export function seedOfText(text: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }
  return hash >>> 0;
}

/** 32비트 섞기(첫 수도 고르기) */
function mix(seed: number): number {
  let x = seed >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb_352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846c_a68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** 2차맵 안 배치 칸 자리의 영토 점 */
export function spotPoint(spot: LayoutSpot): TerritoryVec {
  return territoryPoint(placementCellKey(parseCellKey(spot.mapKey), spot.x, spot.y));
}

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

/** 고리 r(체비쇼프)의 걸음들: 맨해튼 거리가 짧은 것(변 이웃) 먼저, 같으면 (dj, di) 차례 */
export function ringOffsets(rings: number): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  for (let r = 1; r <= rings; r++) {
    const ring: (readonly [number, number])[] = [];
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === r) ring.push([di, dj]);
    ring.sort(
      (a, b) =>
        Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])) || a[1] - b[1] || a[0] - b[0],
    );
    out.push(...ring);
  }
  return out;
}

/** 행성을 띄엄띄엄 본 알맞은 땅 칸(키 차례) */
export function sampleLand(input: Pick<LayoutInput, "faceLevel" | "land" | "seed" | "avoidMaps">): CellKey[] {
  const n = cellsPerSide(input.faceLevel);
  const step = Math.max(1, Math.floor(n / SAMPLE_CELLS_PER_FACE));
  const out: CellKey[] = [];
  for (const face of FACES)
    for (let j = step >> 1; j < n; j += step)
      for (let i = step >> 1; i < n; i += step) {
        const key = cellKey(face, input.faceLevel, i, j);
        if (input.avoidMaps?.has(key)) continue;
        if (isSettleLand(input.land(key), input.seed)) out.push(key);
      }
  return out.toSorted((a, b) => a - b);
}

/** 수도 고르기: 고정 수도 + 가장 먼 점 고르기(반경 안). 반경을 넓혀도 간격을 못 채우면 행성 전체에서 고른 값 */
function pickHomes(
  input: LayoutInput,
  candidates: readonly CellKey[],
): { homes: Map<number, CellKey>; regionCells: number; minGapMilli: number | null } {
  const metric = territoryMetric(input.faceLevel);
  const fixed = new Map<number, CellKey>();
  for (const nation of input.nations) {
    const first = nation.placed[0];
    if (first && isCellKey(first.mapKey)) fixed.set(nation.factionId, first.mapKey);
    else if (nation.home !== undefined && isCellKey(nation.home)) fixed.set(nation.factionId, nation.home);
  }
  const free = input.nations.filter((nation) => !fixed.has(nation.factionId) && nation.missing > 0);
  let anchor = [...fixed.values()][0];
  if (anchor === undefined && candidates.length > 0)
    anchor = candidates[mix(input.worldSeed) % candidates.length];
  const planetMilli = Math.PI * metric.milliPerRadian;
  const gapMilli = input.seed.layoutNationGapCells * 1000;
  const anchorPoint = anchor === undefined ? undefined : territoryPoint(anchor);
  // 후보마다 점·첫 수도와의 거리를 한 번만 셈한다
  const pool = candidates.map((key) => {
    const p = territoryPoint(key);
    return { key, p, fromAnchor: anchorPoint ? territoryDistanceMilli(p, anchorPoint, metric) : 0 };
  });
  let regionCells = Math.max(1, input.seed.layoutRegionCells);
  for (;;) {
    const homes = new Map(fixed);
    const chosen: TerritoryVec[] = [...fixed.values()].map((key) => territoryPoint(key));
    const region = pool.filter((entry) => entry.fromAnchor <= regionCells * 1000);
    // 후보마다 이미 고른 수도와의 가장 짧은 거리(새 수도마다 줄인다)
    const nearest = region.map((entry) =>
      chosen.reduce((best, p) => Math.min(best, territoryDistanceMilli(entry.p, p, metric)), Infinity),
    );
    for (const nation of free) {
      let best = -1;
      for (let index = 0; index < region.length; index++) {
        const entry = region[index];
        if (!entry || [...homes.values()].includes(entry.key)) continue;
        const d = nearest[index] ?? Infinity;
        const bestD = best < 0 ? -1 : (nearest[best] ?? Infinity);
        // 처음 고르는 수도(고정 수도 없음)는 첫 수도 자리(세계 시드)다
        if (chosen.length === 0) {
          if (entry.key === anchor) best = index;
          continue;
        }
        if (best < 0 || d > bestD) best = index;
      }
      const picked = best < 0 ? undefined : region[best];
      if (!picked) break;
      homes.set(nation.factionId, picked.key);
      chosen.push(picked.p);
      for (let index = 0; index < region.length; index++) {
        const entry = region[index];
        if (entry)
          nearest[index] = Math.min(
            nearest[index] ?? Infinity,
            territoryDistanceMilli(entry.p, picked.p, metric),
          );
      }
    }
    let minGapMilli: number | null = null;
    for (let a = 0; a < chosen.length; a++)
      for (let b = a + 1; b < chosen.length; b++) {
        const pa = chosen[a];
        const pb = chosen[b];
        if (!pa || !pb) continue;
        const d = territoryDistanceMilli(pa, pb, metric);
        minGapMilli = minGapMilli === null ? d : Math.min(minGapMilli, d);
      }
    const enough =
      homes.size >= fixed.size + free.length && (minGapMilli === null || minGapMilli >= gapMilli);
    if (enough || regionCells * 1000 >= planetMilli) return { homes, regionCells, minGapMilli };
    regionCells *= 2;
  }
}

/** 국가 수도와 시작 도시 자리를 고른다(순수 함수, 모듈 머리 주석) */
export function planWorldLayout(input: LayoutInput): LayoutResult {
  const metric = territoryMetric(input.faceLevel);
  // 피할 2차맵(시험 2차맵 줄) 둘레 국가 간격 안에는 수도를 두지 않는다(옛 자리에 남은 도시·봇 자리와 국가 영토가 닿지 않게)
  const gapMilli = input.seed.layoutNationGapCells * 1000;
  const avoidPoints = [...(input.avoidMaps ?? [])].flatMap((key) =>
    isCellKey(key) ? [territoryPoint(parseCellKey(key))] : [],
  );
  const candidates = sampleLand(input).filter((key) => {
    const p = territoryPoint(key);
    return avoidPoints.every((avoid) => territoryDistanceMilli(p, avoid, metric) >= gapMilli);
  });
  const { homes, regionCells, minGapMilli } = pickHomes(input, candidates);
  // 피할 도시 + 이미 선 시작 도시 + 이번에 고른 도시(세력마다 영향권 반경)
  const cities: FoundingCity[] = [];
  const usedMaps = new Set<number>();
  let nextId = 1;
  const addCity = (factionId: number, spot: LayoutSpot, radiusMilli: number): void => {
    cities.push({ id: nextId, faction: factionId, point: spotPoint(spot), radiusMilli });
    nextId += 1;
    usedMaps.add(spot.mapKey);
  };
  for (const obstacle of input.obstacles) addCity(obstacle.factionId, obstacle.spot, obstacle.radiusMilli);
  for (const nation of input.nations)
    for (const spot of nation.placed) addCity(nation.factionId, spot, input.newRadiusMilli);
  const offsets = ringOffsets(CITY_SEARCH_RINGS);
  const stride = Math.max(1, Math.trunc(input.seed.layoutCityStepCells));
  const spots: { factionId: number; spot: LayoutSpot }[] = [];
  let short = 0;
  for (const nation of input.nations) {
    const home = homes.get(nation.factionId);
    let left = nation.missing;
    if (home === undefined || left <= 0) {
      short += Math.max(0, left);
      continue;
    }
    const own = (faction: number) => faction === nation.factionId;
    const fits = (mapKey: CellKey): LayoutSpot | undefined => {
      if (usedMaps.has(mapKey) || input.avoidMaps?.has(mapKey)) return undefined;
      if (!isSettleLand(input.land(mapKey), input.seed)) return undefined;
      const spot = { mapKey, x: CITY_CELL, y: CITY_CELL };
      return foundingConflict(cities, metric, own, spotPoint(spot), input.newRadiusMilli) === null
        ? spot
        : undefined;
    };
    // 수도 2차맵(이 국가의 첫 도시) → 둘레 고리
    const order: (CellKey | null)[] = [
      nation.placed.length === 0 ? home : null,
      ...offsets.map(([di, dj]) => walkCell(home, di * stride, dj * stride)),
    ];
    for (const key of order) {
      if (left <= 0) break;
      if (key === null) continue;
      const spot = fits(key);
      if (!spot) continue;
      addCity(nation.factionId, spot, input.newRadiusMilli);
      spots.push({ factionId: nation.factionId, spot });
      left -= 1;
    }
    short += left;
  }
  return {
    homes,
    spots,
    regionCells,
    minGapCells: minGapMilli === null ? null : Math.floor(minGapMilli / 1000),
    short,
  };
}

/** 칸 키의 면·i·j(기록용) */
export function cellLabel(key: number): string {
  if (!isCellKey(key)) return String(key);
  const { face, i, j } = decodeCellKey(key);
  return `${face}:${i},${j}`;
}
