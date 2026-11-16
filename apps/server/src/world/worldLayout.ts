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
// 3. 국력 등급(사용자 답 2026-11-11 "실제 강대국 분포처럼 알아서 배치", docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)"): 국가에
//    등급 값(tier)이 있으면
//    - 자리 고르는 차례 = 강한 등급 먼저(같으면 국가 차례).
//    - 국가 사이 띄울 거리 = 국가 간격 × 두 국가 homeGapPm의 평균(강대국끼리 멀고 소국끼리 가깝다).
//    - 초강대국·강대국: "가장 먼 점" 점수에 땅 넓이 점수(둘레 본 칸 가운데 알맞은 땅 몫)를 곱해 넓고 좋은 땅을 차지한다.
//    - 중견국: 가장 먼 점 그대로(강대국 사이 빈 곳을 메운다).
//    - 소국·도시국가: 띄울 거리를 지키는 칸 가운데 큰 이웃 둘과의 거리 합이 가장 짧은 칸(큰 나라 사이·국경), 같으면 땅 넓이 점수가 낮은 칸
//      (바닷가·땅 끝).
//    - 한 국가 시작 도시 사이 칸 = 등급의 cityStepCells(강대국은 수도 + 넓게 퍼진 지방 도시).
//    등급 값이 하나도 없으면 1·2와 똑같은 결과다(옛 세계·시험).
// 4. 도시 배후지(사용자 지적 2026-11-11 "너무 가깝게 바둑판배열로 다닥다닥", docs/adr/2026-11-11-city-catchment.md): 설정 칸
//    city_catchment_radius_cells(R)가 0보다 크면
//    - 시작 도시는 고정 걸음 표가 아니라 citySites.ts pickCitySites로 고른다: 수도 둘레 찾는 반경 안 칸 가운데 모든 도시와 간격(같은 국가
//      = max(2R × 천분율, 등급 걸음), 다른 국가 = 2R × 천분율)을 지키고 배후지 덮임(여섯 원자재 몫을 그 국가 채집 시설 수로 가중) − 수도 거리
//      몫이 가장 높은 칸부터.
//    - 수도 고르기 점수(가장 먼 점, 소국·도시국가 빼고)에 배후지 덮임을 곱한다(절반은 거리, 절반은 덮임).
//    R = 0이면 1~3과 똑같은 결과다(옛 배치).
// 5. 도시 크기에 따른 배후지(사용자 지적 2026-11-11 "인구와 도시등급이 높을 수록 … 요구 영토범위가 넓어지고", ADR 같은 파일 "바뀜 (2026-11-12)"):
//    R > 0이면 반경이 도시마다 다르다 — 국가 등급의 주거(처음 기간에 찰 인구)·기술과 설정 칸 등급으로 잡은 반경(@terra/sim plannedCityRadiusMilli,
//    수도는 더 크게). 간격 = (두 반경 합) × 천분율이라 초강대국 수도 둘레는 넓고 소국 도시는 촘촘하다(고른 바둑판이 아니다). 수도 고르기 덮임도 그
//    국가 수도 반경으로 센다. 피할 도시(다른 세력 도시·폐허)는 catchmentMilli(없으면 기본 주거·기술 1의 지방 도시 반경).
// 6. 다른 세력 땅 = 1차맵 영토 지도(기획 D-568 "판정도 지도대로", 질문 1922 나 — 2026-11-16): 입력에 territory(설정 칸 planet_territory_*
//    실효 값)가 있으면 시작 도시 자리는 피할 도시·이미 선 도시·이번에 고른 도시로 만든 영토 지도(원 바탕 = 머리 주석 5의 배후지 반경,
//    배후지가 꺼졌으면 영향권 반경 — 영토 서비스와 같은 바탕, 비콘은 넣지 않는다)에서 다른 세력 땅이 아닌 곳만 고른다(겹친 곳은 지도 주인).
//    폐허 자리는 영토가 없어 옛 영향권 닿기 검사로만 띄운다. territory가 없으면 옛 영향권 닿기 검사(foundingConflict, 1~5와 같은 결과).
import {
  type CellKey,
  FACES,
  cellKey,
  cellsPerSide,
  decodeCellKey,
  isCellKey,
  parseCellKey,
} from "@terra/planet";
import { placementCellKey, territoryMetric, territoryPoint } from "@terra/planet/territory";
import { type NationStart, isPowerTier, tierRank } from "@terra/shared/nationTier";
import {
  type FoundingCity,
  type TerritoryCityInput,
  type TerritoryLayout,
  type TerritoryVec,
  buildTerritory,
  foundingClaimConflict,
  foundingConflict,
  territoryDistanceMilli,
} from "@terra/shared/territory";
import type { TerritoryMapValues } from "@terra/shared/territoryMap";
import { type CatchmentRules, type MaterialWeights, weightsOfFacilities } from "@terra/shared/catchment";
import { PLACEMENT_SIZE, type WorldSeedCoefficients, plannedCityRadiusMilli } from "@terra/sim";
import { type CatchmentCache, createCatchmentCache, pickCitySites, walkCell } from "./citySites.ts";

export { walkCell };

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
  /** 숲 밀도 0 ~ 255(배후지 원자재 — 없으면 0) */
  readonly forest?: number | undefined;
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
  /** 국력 등급 값(없으면 등급 없음 = 중견국처럼 고르고 설정 칸 간격을 쓴다, 머리 주석 3) */
  readonly tier?: LayoutTier | undefined;
}

/** 국가 하나의 등급 값(자리 고르기에 쓰는 것만 — @terra/shared/nationTier NationStart에서 온다) */
export interface LayoutTier {
  /** 0 = 가장 강함(POWER_TIERS 차례) */
  readonly rank: number;
  /** 한 국가 시작 도시 사이 칸 */
  readonly cityStepCells: number;
  /** 다른 국가 수도와 띄우는 거리 = 국가 간격 × 이 천분율(두 국가 값의 평균) */
  readonly homeGapPm: number;
  /** 배후지 원자재 가중치(그 국가 시작 도시 채집 시설 수, 머리 주석 4). 없으면 농장·벌목장·광산 1씩 */
  readonly needs?: MaterialWeights | undefined;
  /** 시작 도시 주거(처음 기간에 찰 인구 — 배후지 반경, 머리 주석 5). 없으면 설정 칸 startHousing */
  readonly housing?: number | undefined;
  /** 시작 기술 단계(배후지 반경). 없으면 1 */
  readonly tech?: number | undefined;
}

/** 국가 시작 값(국력 등급) → 자리 고르기에 쓰는 등급 값. 등급이 없으면 undefined(옛 규칙) */
export function layoutTierOf(start: NationStart | undefined): LayoutTier | undefined {
  if (!start || !isPowerTier(start.tier)) return undefined;
  return {
    rank: tierRank(start.tier),
    cityStepCells: start.cityStepCells,
    homeGapPm: start.homeGapPm,
    needs: weightsOfFacilities(start.facilities),
    housing: start.housing,
    tech: start.tech,
  };
}

/** 땅 넓이 점수를 곱하는 등급(이 차례까지 — 초강대국·강대국) */
export const LAND_WEIGHT_MAX_RANK = 1;
/** 큰 이웃 사이에 끼워 넣는 등급(이 차례부터 — 소국·도시국가) */
export const BETWEEN_MIN_RANK = 3;
/** 땅 넓이 점수: 본 칸 격자에서 둘레 이 고리까지(5 × 5칸) 알맞은 땅 수 */
export const LAND_QUALITY_RINGS = 2;

/** 피할 도시(다른 세력 도시·폐허 자리 등 — 같은 2차맵에 새 시작 도시를 두지 않고 영향권과 닿지 않게) */
export interface LayoutObstacle {
  readonly factionId: number;
  readonly spot: LayoutSpot;
  /** 그 도시의 지금 영향권 반경(1000분율 칸, D-104) */
  readonly radiusMilli: number;
  /** 그 도시의 배후지 반경(1000분율 칸, 머리 주석 5). 없으면 기본 지방 도시 반경 */
  readonly catchmentMilli?: number | undefined;
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
  /** 1차맵 영토 값(설정 칸 planet_territory_* 실효 값, 머리 주석 6). 없으면 옛 영향권 닿기 검사 */
  readonly territory?: TerritoryMapValues | undefined;
}

/** 폐허 자리의 세력 ID(주인 없음 — 영토가 없다, 머리 주석 6) */
export const RUIN_FACTION = -1;

/** 영토 지도 배치에 넘기는 규칙(원 바탕을 늘 직접 주므로 영향권 표는 쓰지 않는다) */
const MAP_ONLY_RULES = { influenceMilli: [0], beaconRangeMilli: [0], beaconsPerCity: [0] };

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

/** 세계 씨앗 설정 칸 → 배후지 규칙(머리 주석 4) */
export function catchmentRulesOf(seed: WorldSeedCoefficients): CatchmentRules {
  return {
    radiusCells: Math.max(0, Math.trunc(seed.catchmentRadiusCells)),
    sameGapPm: seed.catchmentSameGapPm,
    foreignGapPm: seed.catchmentForeignGapPm,
    searchCells: seed.catchmentSearchCells,
    compactPm: seed.catchmentCompactPm,
  };
}

/** 국가 하나의 배후지 반경(1000분율 칸, 머리 주석 5): 지방 도시·수도 */
export function nationCatchmentMilli(
  seed: WorldSeedCoefficients,
  tier: LayoutTier | undefined,
): { readonly province: number; readonly capital: number } {
  const city = { housing: tier?.housing ?? seed.startHousing, tech: tier?.tech ?? 1 };
  return {
    province: plannedCityRadiusMilli(seed, { ...city, capital: false }),
    capital: plannedCityRadiusMilli(seed, { ...city, capital: true }),
  };
}

/** 배후지 원자재 가중치 바닥(등급 값이 없는 국가 — NPC 씨앗 기본 농장·벌목장·광산) */
const DEFAULT_NEEDS: MaterialWeights = { crop: 1, wood: 1, ore: 1 };

/** 행성 값 → 배후지 셈 붙잡기(반경 0이면 undefined) */
function catchmentCacheOf(
  input: Pick<LayoutInput, "faceLevel" | "land" | "seed">,
): CatchmentCache | undefined {
  const rules = catchmentRulesOf(input.seed);
  if (rules.radiusCells <= 0) return undefined;
  return createCatchmentCache(
    (key) => {
      const cell = input.land(key);
      return cell ? { ...cell, forest: cell.forest ?? 0 } : undefined;
    },
    input.seed,
    rules.radiusCells,
    input.faceLevel,
  );
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

/** 국가의 등급 차례(등급이 없으면 중견국 자리) */
const rankOf = (nation: LayoutNation): number => nation.tier?.rank ?? LAND_WEIGHT_MAX_RANK + 1;

/** 두 국가 사이 띄울 거리의 천분율(두 값의 평균, 등급이 없으면 1000) */
export const pairPm = (a: LayoutTier | undefined, b: LayoutTier | undefined): number =>
  Math.round(((a?.homeGapPm ?? 1000) + (b?.homeGapPm ?? 1000)) / 2);

/**
 * 땅 넓이 점수(1 ~ (2 × 고리 + 1)²): 본 칸 격자에서 그 칸 둘레 알맞은 땅 수(자기 포함). 넓은 땅 한가운데가 높고 바닷가·땅 끝이 낮다.
 * 면 경계는 걸어서 넘는다(꼭짓점 쪽으로 칸이 없으면 세지 않는다)
 */
export function landQuality(candidates: readonly CellKey[], faceLevel: number): Map<CellKey, number> {
  const step = Math.max(1, Math.floor(cellsPerSide(faceLevel) / SAMPLE_CELLS_PER_FACE));
  const land = new Set<number>(candidates);
  const out = new Map<CellKey, number>();
  for (const key of candidates) {
    let count = 0;
    for (let dj = -LAND_QUALITY_RINGS; dj <= LAND_QUALITY_RINGS; dj++)
      for (let di = -LAND_QUALITY_RINGS; di <= LAND_QUALITY_RINGS; di++) {
        const near = di === 0 && dj === 0 ? key : walkCell(key, di * step, dj * step);
        if (near !== null && land.has(near)) count += 1;
      }
    out.set(key, count);
  }
  return out;
}

/**
 * 수도 고르기: 고정 수도 + 가장 먼 점 고르기(반경 안). 반경을 넓혀도 간격을 못 채우면 행성 전체에서 고른 값.
 * 국력 등급 값이 있으면 머리 주석 3(강한 등급 먼저·등급마다 띄울 거리·땅 넓이·큰 이웃 사이)대로 고른다
 */
function pickHomes(
  input: LayoutInput,
  candidates: readonly CellKey[],
  cache: CatchmentCache | undefined,
): { homes: Map<number, CellKey>; regionCells: number; minGapMilli: number | null } {
  const metric = territoryMetric(input.faceLevel);
  const fixed = new Map<number, CellKey>();
  const tierOf = new Map(input.nations.map((nation) => [nation.factionId, nation.tier]));
  const tiered = input.nations.some((nation) => nation.tier !== undefined);
  for (const nation of input.nations) {
    const first = nation.placed[0];
    if (first && isCellKey(first.mapKey)) fixed.set(nation.factionId, first.mapKey);
    else if (nation.home !== undefined && isCellKey(nation.home)) fixed.set(nation.factionId, nation.home);
  }
  // 강한 등급 먼저(같으면 국가 차례 — 등급이 없으면 중견국 자리, toSorted는 차례를 지킨다)
  const free = input.nations
    .filter((nation) => !fixed.has(nation.factionId) && nation.missing > 0)
    .toSorted((a, b) => rankOf(a) - rankOf(b));
  let anchor = [...fixed.values()][0];
  const capitalMilli = (tier: LayoutTier | undefined): number =>
    nationCatchmentMilli(input.seed, tier).capital;
  const quality = tiered ? landQuality(candidates, input.faceLevel) : undefined;
  const qualitySide = 2 * LAND_QUALITY_RINGS + 1;
  const qualityMax = qualitySide * qualitySide;
  if (anchor === undefined && candidates.length > 0) {
    const firstFree = free[0];
    if (quality && firstFree && rankOf(firstFree) <= LAND_WEIGHT_MAX_RANK) {
      // 첫 강대국: 세계 시드로 고른 칸에서 시작해 땅 넓이 점수가 가장 높은 칸들 가운데 하나(시드 차례)
      const best = Math.max(...quality.values());
      const top = candidates.filter((key) => quality.get(key) === best);
      anchor = top[mix(input.worldSeed) % top.length];
    } else anchor = candidates[mix(input.worldSeed) % candidates.length];
  }
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
    const chosen: { p: TerritoryVec; tier: LayoutTier | undefined }[] = [...fixed].map(([id, key]) => ({
      p: territoryPoint(key),
      tier: tierOf.get(id),
    }));
    const region = pool.filter((entry) => entry.fromAnchor <= regionCells * 1000);
    const taken = new Set<number>(homes.values());
    // 고른 수도마다 후보까지의 거리(한 번만 셈한다 — 새 수도를 고를 때 한 줄씩 는다)
    const distanceTo = (p: TerritoryVec): Float64Array =>
      Float64Array.from(region, (entry) => territoryDistanceMilli(entry.p, p, metric));
    const distances: Float64Array[] = chosen.map((home) => distanceTo(home.p));
    for (const nation of free) {
      const rank = rankOf(nation);
      // 후보마다: 이미 고른 수도와의 "띄울 거리로 나눈 거리"의 가장 작은 값(등급이 없으면 거리 그대로), 큰 이웃 둘과의 거리 합
      let best = -1;
      let bestScore = -1;
      let bestBetween: { ok: boolean; sum: number; quality: number } | undefined;
      for (let index = 0; index < region.length; index++) {
        const entry = region[index];
        if (!entry || taken.has(entry.key)) continue;
        // 처음 고르는 수도(고정 수도 없음)는 첫 수도 자리(세계 시드)다
        if (chosen.length === 0) {
          if (entry.key === anchor) best = index;
          continue;
        }
        let ratio = Infinity;
        let near1 = Infinity;
        let near2 = Infinity;
        for (let k = 0; k < chosen.length; k++) {
          const other = chosen[k];
          const d = distances[k]?.[index];
          if (!other || d === undefined) continue;
          const pm = tiered ? pairPm(nation.tier, other.tier) : 1000;
          ratio = Math.min(ratio, pm === 1000 ? d : (d * 1000) / pm);
          if ((other.tier?.rank ?? LAND_WEIGHT_MAX_RANK + 1) < BETWEEN_MIN_RANK) {
            if (d < near1) {
              near2 = near1;
              near1 = d;
            } else if (d < near2) near2 = d;
          }
        }
        if (tiered && rank >= BETWEEN_MIN_RANK && near1 < Infinity) {
          // 소국·도시국가: 띄울 거리를 지키는 칸 가운데 큰 이웃 둘과의 거리 합이 가장 짧은 칸(같으면 땅 끝 → 작은 키)
          const now = {
            ok: ratio >= gapMilli,
            sum: near1 + (near2 < Infinity ? near2 : near1),
            quality: quality?.get(entry.key) ?? 0,
          };
          const better =
            !bestBetween ||
            (now.ok && !bestBetween.ok) ||
            (now.ok === bestBetween.ok &&
              (now.ok
                ? now.sum < bestBetween.sum ||
                  (now.sum === bestBetween.sum && now.quality < bestBetween.quality)
                : ratio > bestScore));
          if (better) {
            best = index;
            bestBetween = now;
            bestScore = ratio;
          }
          continue;
        }
        // 초강대국·강대국은 땅 넓이 점수를 곱한다(절반은 거리, 절반은 땅)
        const weight =
          tiered && rank <= LAND_WEIGHT_MAX_RANK
            ? 0.5 + (0.5 * (quality?.get(entry.key) ?? 0)) / qualityMax
            : 1;
        // 배후지(머리 주석 4): 절반은 거리, 절반은 배후지 덮임
        const cover = cache
          ? 0.5 +
            cache.cover(entry.key, nation.tier?.needs ?? DEFAULT_NEEDS, capitalMilli(nation.tier)) / 2000
          : 1;
        const score = weight === 1 && cover === 1 ? ratio : ratio * weight * cover;
        if (best < 0 || score > bestScore) {
          best = index;
          bestScore = score;
        }
      }
      const picked = best < 0 ? undefined : region[best];
      if (!picked) break;
      homes.set(nation.factionId, picked.key);
      taken.add(picked.key);
      chosen.push({ p: picked.p, tier: nation.tier });
      distances.push(distanceTo(picked.p));
    }
    // 국가 사이 가장 짧은 "띄울 거리로 나눈 거리"(등급이 없으면 거리 그대로)
    let minGapMilli: number | null = null;
    for (let a = 0; a < chosen.length; a++)
      for (let b = a + 1; b < chosen.length; b++) {
        const pa = chosen[a];
        const pb = chosen[b];
        if (!pa || !pb) continue;
        const d = territoryDistanceMilli(pa.p, pb.p, metric);
        const pm = tiered ? pairPm(pa.tier, pb.tier) : 1000;
        const scaled = pm === 1000 ? d : (d * 1000) / pm;
        minGapMilli = minGapMilli === null ? scaled : Math.min(minGapMilli, scaled);
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
  const cache = catchmentCacheOf(input);
  const { homes, regionCells, minGapMilli } = pickHomes(input, candidates, cache);
  // 피할 도시 + 이미 선 시작 도시 + 이번에 고른 도시(세력마다 영향권 반경)
  const cities: FoundingCity[] = [];
  const usedMaps = new Set<number>();
  let nextId = 1;
  // 영토 지도(머리 주석 6): 도시마다 원 바탕(배후지 반경, 배후지가 꺼졌으면 영향권), 도시가 늘면 다시 셈한다
  const mapCities: TerritoryCityInput[] = [];
  let mapLayout: TerritoryLayout | undefined;
  const defaultMilli = nationCatchmentMilli(input.seed, undefined).province;
  const addCity = (
    factionId: number,
    spot: LayoutSpot,
    radiusMilli: number,
    catchmentMilli: number,
  ): void => {
    const point = spotPoint(spot);
    cities.push({ id: nextId, faction: factionId, point, radiusMilli });
    if (factionId !== RUIN_FACTION)
      mapCities.push({
        id: nextId,
        faction: factionId,
        point,
        grade: 1,
        catchmentMilli: cache ? catchmentMilli : radiusMilli,
      });
    mapLayout = undefined;
    nextId += 1;
    usedMaps.add(spot.mapKey);
  };
  for (const obstacle of input.obstacles)
    addCity(obstacle.factionId, obstacle.spot, obstacle.radiusMilli, obstacle.catchmentMilli ?? defaultMilli);
  for (const nation of input.nations) {
    const radius = nationCatchmentMilli(input.seed, nation.tier);
    nation.placed.forEach((spot, index) =>
      addCity(nation.factionId, spot, input.newRadiusMilli, index === 0 ? radius.capital : radius.province),
    );
  }
  /** 다른 세력 땅인가: 영토 지도가 있으면 지도(폐허는 옛 영향권), 없으면 옛 영향권 닿기 검사 */
  const conflicts = (own: (faction: number) => boolean, point: TerritoryVec): boolean => {
    const values = input.territory;
    if (!values) return foundingConflict(cities, metric, own, point, input.newRadiusMilli) !== null;
    mapLayout ??= buildTerritory(mapCities, [], MAP_ONLY_RULES, metric, values);
    if (foundingClaimConflict(mapLayout, own, point) !== null) return true;
    const ruins = cities.filter((city) => city.faction === RUIN_FACTION);
    return ruins.length > 0 && foundingConflict(ruins, metric, own, point, input.newRadiusMilli) !== null;
  };
  // 배후지 간격을 볼 도시(피할 도시 + 제자리 시작 도시 + 이번에 고른 도시 — pickCitySites가 더한다). 반경은 머리 주석 5
  const spaced = [
    ...input.obstacles.map((obstacle) => ({
      factionId: obstacle.factionId,
      point: spotPoint(obstacle.spot),
      radiusMilli: obstacle.catchmentMilli ?? defaultMilli,
    })),
    ...input.nations.flatMap((nation) => {
      const radius = nationCatchmentMilli(input.seed, nation.tier);
      return nation.placed.map((spot, index) => ({
        factionId: nation.factionId,
        point: spotPoint(spot),
        radiusMilli: index === 0 ? radius.capital : radius.province,
      }));
    }),
  ];
  const offsets = ringOffsets(CITY_SEARCH_RINGS);
  const baseStride = Math.max(1, Math.trunc(input.seed.layoutCityStepCells));
  const spots: { factionId: number; spot: LayoutSpot }[] = [];
  let short = 0;
  for (const nation of input.nations) {
    const home = homes.get(nation.factionId);
    let left = nation.missing;
    if (home === undefined || left <= 0) {
      short += Math.max(0, left);
      continue;
    }
    // 한 국가 시작 도시 사이 칸: 등급 값(강대국은 넓게), 없으면 설정 칸
    const stride = Math.max(1, Math.trunc(nation.tier?.cityStepCells ?? baseStride));
    const own = (faction: number) => faction === nation.factionId;
    const fits = (mapKey: CellKey): LayoutSpot | undefined => {
      if (usedMaps.has(mapKey) || input.avoidMaps?.has(mapKey)) return undefined;
      if (!isSettleLand(input.land(mapKey), input.seed)) return undefined;
      const spot = { mapKey, x: CITY_CELL, y: CITY_CELL };
      return conflicts(own, spotPoint(spot)) ? undefined : spot;
    };
    if (cache) {
      // 배후지 배치(머리 주석 4·5): 간격을 지키며 배후지 덮임이 높은 칸부터, 반경은 국가 크기
      const radius = nationCatchmentMilli(input.seed, nation.tier);
      const picked = pickCitySites({
        radiusMilli: radius.province,
        capitalRadiusMilli: radius.capital,
        faceLevel: input.faceLevel,
        factionId: nation.factionId,
        home,
        needCapital: nation.placed.length === 0,
        count: left,
        rules: catchmentRulesOf(input.seed),
        minSameMilli: nation.tier ? stride * 1000 : 0,
        weights: nation.tier?.needs ?? DEFAULT_NEEDS,
        cache,
        fits: (key) => fits(key) !== undefined,
        cities: spaced,
        salt: mix(input.worldSeed ^ Math.imul(nation.factionId, 0x2545_f491)),
        mountainSitePm: input.seed.catchmentMountainSitePm,
      });
      for (const key of picked) {
        const spot = { mapKey: key, x: CITY_CELL, y: CITY_CELL };
        const first = nation.placed.length === 0 && key === picked[0];
        addCity(nation.factionId, spot, input.newRadiusMilli, first ? radius.capital : radius.province);
        spots.push({ factionId: nation.factionId, spot });
        left -= 1;
      }
      short += left;
      continue;
    }
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
      const capital = nation.placed.length === 0 && key === home;
      const radius = nationCatchmentMilli(input.seed, nation.tier);
      addCity(nation.factionId, spot, input.newRadiusMilli, capital ? radius.capital : radius.province);
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
