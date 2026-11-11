// 국력 등급 세계 배치 시험(docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)") — 가짜 행성 값(면 레벨 6: 큰 땅 하나·작은 섬들·바다)으로
// 16개 국가(초강대국 2·강대국 3·중견국 5·소국 4·도시국가 2)를 등급대로 놓을 때: 같은 입력이면 같은 결과, 강한 나라끼리 멀고 소국은
// 가깝게, 강대국 수도는 넓은 땅에, 소국은 큰 이웃 곁에, 등급마다 도시 수·도시 간격.
import { type CellKey, decodeCellKey } from "@terra/planet";
import { territoryMetric, territoryPoint } from "@terra/planet/territory";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { START_WORLD_SEED } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  type LayoutInput,
  type LayoutLand,
  type LayoutNation,
  type LayoutTier,
  landQuality,
  planWorldLayout,
  sampleLand,
  seedOfText,
} from "./worldLayout.ts";

const LEVEL = 6;
const metric = territoryMetric(LEVEL);
const GRASS: LayoutLand = {
  biomeId: "grassland",
  elevationM: 100,
  temperatureC: 15,
  precipitationMm: 400,
  water: 0,
};
const SEA: LayoutLand = { ...GRASS, water: 1, elevationM: -200 };
/** 가짜 행성: 면 0·1·2는 온통 땅(큰 대륙), 면 3은 가운데 띠만 땅(좁은 땅), 면 4·5는 바다 */
function land(key: CellKey): LayoutLand {
  const { face, j } = decodeCellKey(key);
  if (face <= 2) return GRASS;
  if (face === 3) return j >= 28 && j < 36 ? GRASS : SEA;
  return SEA;
}

/** 등급 값(팩 등급 표와 같은 간격·걸음) */
const TIERS: Record<string, LayoutTier & { cities: number }> = {
  superpower: { rank: 0, cityStepCells: 2, homeGapPm: 1600, cities: 6 },
  great_power: { rank: 1, cityStepCells: 2, homeGapPm: 1300, cities: 4 },
  middle_power: { rank: 2, cityStepCells: 1, homeGapPm: 1000, cities: 3 },
  small_state: { rank: 3, cityStepCells: 1, homeGapPm: 700, cities: 2 },
  city_state: { rank: 4, cityStepCells: 1, homeGapPm: 500, cities: 1 },
};
/** 국가 차례(서버: 1번 = 16번째 프리셋 소국, 2번부터 프리셋 1~15)의 등급 */
const ORDER = [
  "small_state",
  "superpower",
  "great_power",
  "middle_power",
  "middle_power",
  "great_power",
  "middle_power",
  "small_state",
  "middle_power",
  "superpower",
  "small_state",
  "city_state",
  "small_state",
  "great_power",
  "middle_power",
  "city_state",
];
const nations: LayoutNation[] = ORDER.map((tier, index) => {
  const row = TIERS[tier];
  if (!row) throw new Error(tier);
  return {
    factionId: index + 1,
    missing: row.cities,
    placed: [],
    tier: { rank: row.rank, cityStepCells: row.cityStepCells, homeGapPm: row.homeGapPm },
  };
});
const seed = { ...START_WORLD_SEED, layoutRegionCells: 12, layoutNationGapCells: 8 };
const input = (overrides: Partial<LayoutInput> = {}): LayoutInput => ({
  faceLevel: LEVEL,
  land,
  seed,
  worldSeed: seedOfText("s2_test_planet"),
  nations,
  obstacles: [],
  newRadiusMilli: 100,
  ...overrides,
});
const cellsBetween = (a: CellKey, b: CellKey): number =>
  territoryDistanceMilli(territoryPoint(a), territoryPoint(b), metric) / 1000;

describe("세계 배치: 국력 등급", () => {
  const result = planWorldLayout(input());
  const homeOf = (factionId: number): CellKey => {
    const home = result.homes.get(factionId);
    if (home === undefined) throw new Error(`no home ${factionId}`);
    return home;
  };
  const idsOf = (tier: string): number[] =>
    ORDER.flatMap((entry, index) => (entry === tier ? [index + 1] : []));
  const nearestOther = (factionId: number, among: readonly number[]): number =>
    Math.min(
      ...among
        .filter((other) => other !== factionId)
        .map((other) => cellsBetween(homeOf(factionId), homeOf(other))),
    );

  it("같은 입력이면 같은 자리(결정적), 16개 국가 모두 자리를 받고 등급마다 도시 수가 맞다", () => {
    const again = planWorldLayout(input());
    expect([...again.homes]).toEqual([...result.homes]);
    expect(again.spots).toEqual(result.spots);
    expect(result.homes.size).toBe(16);
    expect(result.short).toBe(0);
    const count = new Map<number, number>();
    for (const entry of result.spots) count.set(entry.factionId, (count.get(entry.factionId) ?? 0) + 1);
    ORDER.forEach((tier, index) => expect(count.get(index + 1)).toBe(TIERS[tier]?.cities));
    // 2차맵 하나에 도시 하나
    expect(new Set(result.spots.map((entry) => entry.spot.mapKey)).size).toBe(result.spots.length);
    // 다른 세계 시드면 다른 자리
    const other = planWorldLayout(input({ worldSeed: seedOfText("another_planet") }));
    expect([...other.homes.values()]).not.toEqual([...result.homes.values()]);
  });

  it("띄울 거리: 두 국가 사이 = 국가 간격 × 등급 간격의 평균 — 강대국끼리 멀고 소국끼리 가깝다", () => {
    const all = ORDER.map((_, index) => index + 1);
    for (const a of all)
      for (const b of all) {
        if (a >= b) continue;
        const pm =
          ((TIERS[ORDER[a - 1] ?? ""]?.homeGapPm ?? 1000) + (TIERS[ORDER[b - 1] ?? ""]?.homeGapPm ?? 1000)) /
          2;
        expect(cellsBetween(homeOf(a), homeOf(b))).toBeGreaterThanOrEqual(
          (seed.layoutNationGapCells * pm) / 1000 - 0.001,
        );
      }
    // 강한 나라(초강대국·강대국) 사이 가장 가까운 거리 > 약한 나라(소국·도시국가)가 가장 가까운 이웃과 떨어진 거리
    const strong = [...idsOf("superpower"), ...idsOf("great_power")];
    const weak = [...idsOf("small_state"), ...idsOf("city_state")];
    const strongGap = Math.min(...strong.map((id) => nearestOther(id, strong)));
    const weakGap = Math.max(...weak.map((id) => nearestOther(id, all)));
    expect(strongGap).toBeGreaterThan(weakGap);
    expect(result.minGapCells).toBeGreaterThanOrEqual(seed.layoutNationGapCells);
  });

  it("초강대국·강대국 수도는 넓은 땅 안쪽에(땅 넓이 점수가 가장 높은 칸 — 소국·도시국가 평균 이상), 좁은 띠 땅에는 서지 않는다", () => {
    const quality = landQuality(sampleLand(input()), LEVEL);
    const mean = (ids: readonly number[]): number =>
      ids.reduce((sum, id) => sum + (quality.get(homeOf(id)) ?? 0), 0) / ids.length;
    const strong = [...idsOf("superpower"), ...idsOf("great_power")];
    const weak = [...idsOf("small_state"), ...idsOf("city_state")];
    expect(mean(strong)).toBeGreaterThanOrEqual(mean(weak));
    // 넓은 땅 한가운데(둘레 5 × 5칸이 모두 땅)
    for (const id of strong) expect(quality.get(homeOf(id))).toBe(25);
    for (const id of strong) expect(decodeCellKey(homeOf(id)).face).toBeLessThanOrEqual(2);
  });

  it("소국·도시국가는 큰 이웃 곁에: 가장 가까운 큰 나라까지의 거리가 중견국보다 짧다(평균)", () => {
    const big = [...idsOf("superpower"), ...idsOf("great_power"), ...idsOf("middle_power")];
    const toBig = (id: number): number =>
      Math.min(
        ...big.filter((other) => other !== id).map((other) => cellsBetween(homeOf(id), homeOf(other))),
      );
    const mean = (ids: readonly number[]): number => ids.reduce((sum, id) => sum + toBig(id), 0) / ids.length;
    expect(mean([...idsOf("small_state"), ...idsOf("city_state")])).toBeLessThan(mean(idsOf("middle_power")));
  });

  it("도시 간격: 초강대국은 수도에서 두 칸 걸음으로 넓게, 중견국은 붙은 2차맵", () => {
    const spread = (factionId: number): number => {
      const cities = result.spots
        .filter((entry) => entry.factionId === factionId)
        .map((entry) => entry.spot.mapKey);
      const [capital, ...rest] = cities;
      if (capital === undefined || rest.length === 0) return 0;
      return Math.min(...rest.map((key) => cellsBetween(capital as CellKey, key as CellKey)));
    };
    for (const id of idsOf("superpower")) expect(spread(id)).toBeGreaterThan(1.7);
    for (const id of idsOf("middle_power")) expect(spread(id)).toBeLessThan(1.6);
  });

  it("등급 값이 없으면 옛 규칙 그대로(가장 먼 점 고르기) — 등급을 뗀 같은 입력의 수도 간격은 모두 국가 간격 이상", () => {
    const plain = planWorldLayout(
      input({ nations: nations.map(({ tier: _tier, ...rest }) => ({ ...rest, missing: 2 })) }),
    );
    expect(plain.homes.size).toBe(16);
    expect(plain.minGapCells).toBeGreaterThanOrEqual(seed.layoutNationGapCells);
  });
});
