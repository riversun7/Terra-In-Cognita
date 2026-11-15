// 세계 배치 화면 배후지 덮개(tRPC worldLayout.catchment) — docs/adr/2026-11-11-city-catchment.md 4절·"바뀜 (2026-11-12)". 고른 국가 수도 둘레
// 격자에 칸마다 여섯 원자재 비트와, 지금 세계 도시·빈 세계 등급 배치 계획 도시의 배후지(도시마다 반경이 다르다)·덮임·다툼을 보인다(운영자가
// 간격·자원·겹침을 눈으로 판단). 읽기만 한다. 순수 함수(행성 값·도시 목록은 부르는 쪽이 넘긴다).
// - 지금 세계 도시 반경 = 지금 크기(인구·발전도 → 도시 등급·주인 기술, @terra/shared/catchment catchmentRadiusMilli), 목표 반경 = 처음 기간에
//   이를 크기(국가 등급 주거·기술, 수도는 더 크게 — 시작 도시 배치가 쓰는 값). 계획 도시는 목표 반경.
// - 다툼: 도시마다 다른 도시 배후지와 겹친 칸 수(shared), 둘 이상 배후지에 든 칸 수(contested), 겹친 쌍(거리 < 두 반경 합).
// - 버틸 수 있는 도시 수(질문 1025 나, 기획 D-533 "추천대로" — 읽기만, 어림): 고른 국가 수도 둘레 찾는 반경 안 알맞은 땅에 시작 도시 배치와 같은
//   함수(citySites.ts pickCitySites)로 수도(목표 반경) + 지방 도시(목표 반경)를 간격(같은 국가 = 반경 합 × 천분율)을 지키며 더 놓을 수 없을
//   때까지 놓은 수. 다른 국가 계획 도시는 피할 도시(다른 국가 간격)다. 등급 표 도시 수와 견준다(땅이 좁은 섬 나라는 적다). 숫자 규칙(상한으로
//   쓸지)은 기획이 정한다 — 화면에 보이기만 한다.
// - 광석 고도 몫(2026-11-12, 기획 D-533): 도시마다 배후지 광석 몫 평균(orePm)과 산지 몫(highOrePm — 높은 티어), 몫 규칙(ore)을 함께 보인다.
import { type CellKey, isCellKey } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import {
  type CatchmentLand,
  type MaterialWeights,
  cellMaterials,
  cityPairGapMilli,
  highOrePm,
  oreSharePm,
} from "@terra/shared/catchment";
import { territoryDistanceMilli } from "@terra/shared/territory";
import type {
  WorldCatchmentCity,
  WorldCatchmentSustain,
  WorldCatchmentView,
} from "@terra/shared/worldPlacementApi";
import type { WorldSeedCoefficients } from "@terra/sim";
import { territoryDistanceMilli as distanceMilli } from "@terra/shared/territory";
import {
  type SpacedCity,
  catchmentCellsMilli,
  createCatchmentCache,
  pickCitySites,
  walkCell,
} from "./citySites.ts";
import { type LayoutLand, catchmentRulesOf, isSettleLand } from "./worldLayout.ts";

/** 덮개에 넣을 도시 하나(국가 코드·2차맵·반경) */
export interface CatchmentViewCity {
  readonly code: string;
  readonly mapKey: number;
  /** 지금 반경(1000분율 칸). 없으면 목표 반경 */
  readonly radiusMilli?: number | undefined;
  /** 목표 반경(1000분율 칸) */
  readonly targetMilli: number;
  /** 사는 휴먼 수(지금 세계). 계획 도시는 없음 */
  readonly population?: number | undefined;
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
  /** 고른 국가 지방 도시 목표 반경(간격 값 보이기) */
  readonly provinceMilli: number;
  /** 고른 국가 수도 목표 반경(버틸 수 있는 도시 수). 없으면 지방 도시 반경 */
  readonly capitalMilli?: number | undefined;
}

/** 버틸 수 있는 도시 수 어림의 위 끝(세계 배치가 한 국가에 세우는 도시 상한보다 넉넉히) */
export const SUSTAIN_CAP = 64;

/** 격자 반 폭에 더하는 반경 몫(칸) — 큰 수도 원이 격자 밖으로 덜 나가게 */
const SPAN_MARGIN = 4;

const radiusOf = (city: CatchmentViewCity): number => city.radiusMilli ?? city.targetMilli;

/** 배후지 칸들의 광석 몫 평균(‰)과 산지 몫(‰ = Σ 몫 × 산지 ÷ Σ 몫 — 시뮬 catchmentRun landShares와 같은 셈) */
export function oreOfCells(
  cells: readonly number[],
  land: (key: number) => CatchmentLand | undefined,
  seed: WorldSeedCoefficients,
): { orePm: number; highOrePm: number } {
  if (cells.length === 0) return { orePm: 0, highOrePm: 0 };
  let sum = 0;
  let high = 0;
  for (const cell of cells) {
    const value = land(cell);
    const share = oreSharePm(value, seed);
    sum += share;
    high += share * highOrePm(value, seed);
  }
  return { orePm: Math.floor(sum / cells.length), highOrePm: sum === 0 ? 0 : Math.floor(high / sum) };
}

/** 목록의 다툼: 겹친 쌍(거리 < 두 반경 합), 도시마다 겹친 칸, 둘 이상 배후지에 든 칸 */
function contest(
  cities: readonly CatchmentViewCity[],
  faceLevel: number,
): { pairs: number; contested: number; sharedOf: number[] } {
  const metric = territoryMetric(faceLevel);
  const placed = cities.flatMap((city, index) =>
    isCellKey(city.mapKey)
      ? [{ index, key: city.mapKey, point: territoryPoint(city.mapKey), radius: radiusOf(city) }]
      : [],
  );
  let pairs = 0;
  for (let a = 0; a < placed.length; a++)
    for (let b = a + 1; b < placed.length; b++) {
      const pa = placed[a];
      const pb = placed[b];
      if (pa && pb && territoryDistanceMilli(pa.point, pb.point, metric) < pa.radius + pb.radius) pairs += 1;
    }
  const cellsOf = placed.map((entry) => catchmentCellsMilli(entry.key, entry.radius, faceLevel));
  const count = new Map<number, number>();
  for (const cells of cellsOf) for (const cell of cells) count.set(cell, (count.get(cell) ?? 0) + 1);
  const sharedOf = cities.map(() => 0);
  placed.forEach((entry, k) => {
    sharedOf[entry.index] = (cellsOf[k] ?? []).filter((cell) => (count.get(cell) ?? 0) > 1).length;
  });
  let contested = 0;
  for (const n of count.values()) if (n > 1) contested += 1;
  return { pairs, contested, sharedOf };
}

/** 버틸 수 있는 도시 수(모듈 머리 주석). 배후지 규칙이 꺼졌으면(반경 스위치 0) null */
export function sustainOf(input: CatchmentViewInput): WorldCatchmentSustain | null {
  const rules = catchmentRulesOf(input.seed);
  if (rules.radiusCells <= 0) return null;
  const search = Math.max(1, Math.trunc(rules.searchCells));
  const metric = territoryMetric(input.faceLevel);
  const home = territoryPoint(input.center);
  const landOf = (key: CellKey) => {
    const cell = input.land(key);
    return cell ? { ...cell, forest: cell.forest ?? 0 } : undefined;
  };
  // 다른 국가 도시(계획 — 세계 새로 시작 뒤 자리)는 피할 도시, 그 2차맵은 쓸 수 없다
  const usedMaps = new Set<number>();
  const spaced: SpacedCity[] = input.plan.flatMap((city) => {
    if (city.code === input.code || !isCellKey(city.mapKey)) return [];
    usedMaps.add(city.mapKey);
    return [{ factionId: 1, point: territoryPoint(city.mapKey), radiusMilli: city.targetMilli }];
  });
  const fits = (key: CellKey): boolean => !usedMaps.has(key) && isSettleLand(input.land(key), input.seed);
  // 찾는 반경 안 알맞은 빈 땅 칸 수
  let landCells = 0;
  const seen = new Set<number>();
  for (let dj = -search; dj <= search; dj++)
    for (let di = -search; di <= search; di++) {
      const key = walkCell(input.center, di, dj);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      if (distanceMilli(territoryPoint(key), home, metric) <= search * 1000 && fits(key)) landCells += 1;
    }
  const picked = pickCitySites({
    faceLevel: input.faceLevel,
    factionId: 0,
    home: input.center,
    needCapital: true,
    count: SUSTAIN_CAP,
    rules,
    radiusMilli: input.provinceMilli,
    capitalRadiusMilli: input.capitalMilli ?? input.provinceMilli,
    minSameMilli: 0,
    weights: input.needsOf(input.code),
    cache: createCatchmentCache(landOf, input.seed, Math.max(1, rules.radiusCells), input.faceLevel),
    fits,
    cities: spaced,
    salt: 0,
    mountainSitePm: input.seed.catchmentMountainSitePm,
  });
  return {
    cities: picked.length,
    capped: picked.length >= SUSTAIN_CAP,
    landCells,
    tierCities: input.plan.filter((city) => city.code === input.code).length,
    worldCities: input.world.filter((city) => city.code === input.code).length,
  };
}

export function catchmentViewOf(input: CatchmentViewInput): WorldCatchmentView {
  const rules = catchmentRulesOf(input.seed);
  const span = Math.max(1, Math.trunc(rules.searchCells)) + SPAN_MARGIN;
  const side = 2 * span + 1;
  const landOf = (key: CellKey) => {
    const cell = input.land(key);
    return cell ? { ...cell, forest: cell.forest ?? 0 } : undefined;
  };
  const cache = createCatchmentCache(landOf, input.seed, Math.max(1, rules.radiusCells), input.faceLevel);
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
  const worldContest = contest(input.world, input.faceLevel);
  const planContest = contest(input.plan, input.faceLevel);
  const place = (list: readonly CatchmentViewCity[], sharedOf: readonly number[]): WorldCatchmentCity[] =>
    list.flatMap((city, index) => {
      const spot = isCellKey(city.mapKey) ? at.get(city.mapKey) : undefined;
      if (!spot || !isCellKey(city.mapKey)) return [];
      const radiusMilli = radiusOf(city);
      const ore = oreOfCells(
        catchmentCellsMilli(city.mapKey, radiusMilli, input.faceLevel),
        (key) => (isCellKey(key) ? landOf(key) : undefined),
        input.seed,
      );
      return [
        {
          di: spot.di,
          dj: spot.dj,
          cover: cache.cover(city.mapKey, input.needsOf(city.code), radiusMilli),
          code: city.code,
          own: city.code === input.code,
          radiusMilli,
          targetMilli: city.targetMilli,
          shared: sharedOf[index] ?? 0,
          population: city.population ?? null,
          orePm: ore.orePm,
          highOrePm: ore.highOrePm,
        },
      ];
    });
  return {
    code: input.code,
    radiusCells: rules.radiusCells,
    searchCells: Math.max(1, Math.trunc(rules.searchCells)),
    sameGapCells: cityPairGapMilli(input.provinceMilli, input.provinceMilli, true, rules) / 1000,
    foreignGapCells: cityPairGapMilli(input.provinceMilli, input.provinceMilli, false, rules) / 1000,
    span,
    cells: cells.length === side * side ? cells : [],
    ore: {
      lowPm: input.seed.oreShareLowPm,
      hillM: input.seed.oreShareHillM,
      hillPm: input.seed.oreShareHillPm,
      mountainM: input.seed.mineMinHeightM,
      highM: input.seed.oreHighMinM,
    },
    world: place(input.world, worldContest.sharedOf),
    plan: place(input.plan, planContest.sharedOf),
    overlapWorld: worldContest.pairs,
    overlapPlan: planContest.pairs,
    contestedWorld: worldContest.contested,
    contestedPlan: planContest.contested,
    sustain: sustainOf(input),
  };
}
