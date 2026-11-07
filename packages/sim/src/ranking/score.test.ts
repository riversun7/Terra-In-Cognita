import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { societyCoefficientsFrom } from "../tuning.ts";
import { TEST_RANKING_COEFFICIENTS } from "./coefficients.ts";
import {
  citiesValue,
  decayScore,
  facilitiesValue,
  factionScore,
  log2Milli,
  nextScore,
  periodGain,
  productionValue,
  rankEntries,
  tierCuts,
  tierPmOf,
  underdogPm,
} from "./score.ts";

describe("랭킹 점수 규칙(20 §8.2)", () => {
  it("정수 log2(‰)는 2의 거듭제곱에서 정확하고, 그 사이는 1/1024 안이다(실수 로그 없음)", () => {
    expect([1n, 2n, 4n, 1024n, 1n << 40n].map(log2Milli)).toEqual([0, 1000, 2000, 10_000, 40_000]);
    for (const x of [3n, 5n, 100n, 200n, 12_345n, 987_654_321n, 10n ** 15n]) {
      const exact = 1000 * Math.log2(Number(x));
      expect(Math.abs(log2Milli(x) - exact), String(x)).toBeLessThan(2);
    }
    expect(() => log2Milli(0n)).toThrow(RangeError);
  });

  it("절대량은 로그로 줄인다(D-042 ④): 산출 두 배 = +1000, 도시·시설은 하나(가득) = 1000", () => {
    expect(productionValue(0n)).toBe(0);
    expect(productionValue(1n)).toBe(1000);
    expect(productionValue(3n)).toBe(2000);
    expect(citiesValue(0, 0)).toBe(0);
    expect(citiesValue(1, 0)).toBe(1000);
    expect(citiesValue(3, 0)).toBe(2000);
    // 발전도 100인 도시 하나 = 도시 둘과 같은 값
    expect(citiesValue(1, 100)).toBe(citiesValue(2, 0));
    expect(facilitiesValue(1_000_000n)).toBe(1000);
    expect(facilitiesValue(0n)).toBe(0);
  });

  it("언더독(D-042 ①): 강자를 이기면 크게(상한), 약자를 이기면 0에 가깝게", () => {
    expect(underdogPm(5, 5, 4000)).toBe(1000);
    expect(underdogPm(20, 2, 4000)).toBe(4000);
    expect(underdogPm(1, 50, 4000)).toBe(20);
    expect(underdogPm(3, 0, 4000)).toBe(0);
    expect(underdogPm(0, 3, 4000)).toBe(0);
  });

  it("이번 기간 점수 = Σ ⌊값 × 가중치 ÷ 1000⌋, 없는 지표·0 가중치는 빠진다", () => {
    const weights = [
      { measure: "war_wins", weightPm: 1500 },
      { measure: "cities_held", weightPm: 500 },
      { measure: "production", weightPm: 0 },
    ];
    expect(periodGain({ war_wins: 1000, cities_held: 1001, production: 5000 }, weights)).toBe(1500 + 500);
    expect(periodGain({}, weights)).toBe(0);
  });

  it("감쇠형(D-037): 집계마다 ⌊점수 × (1000 − 감쇠) ÷ 1000⌋, 여러 번이면 여러 번, 다음 점수 = 감쇠 + 이번 점수", () => {
    expect(decayScore(1000, 18, 1)).toBe(982);
    expect(decayScore(1000, 18, 2)).toBe(964);
    expect(decayScore(1, 18, 1)).toBe(0);
    expect(decayScore(1000, 0, 5)).toBe(1000);
    expect(decayScore(1000, 1000, 1)).toBe(0);
    expect(nextScore(1000, 250, 18, 1)).toBe(1232);
    // 활동하지 않으면 줄어들어 결국 판에서 빠진다(점수 0)
    let score = 5000;
    for (let day = 0; day < 1000 && score > 0; day++) score = nextScore(score, 0, 18, 1);
    expect(score).toBe(0);
  });

  it("순위: 점수 0은 빠지고, 높은 순·같으면 키 작은 순, 같은 점수는 같은 순위(1·2·2·4)", () => {
    const ranked = rankEntries([
      { key: 7, score: 10 },
      { key: 3, score: 50 },
      { key: 9, score: 0 },
      { key: 5, score: 30 },
      { key: 2, score: 30 },
    ]);
    expect(ranked.map((entry) => [entry.key, entry.rank])).toEqual([
      [3, 1],
      [2, 2],
      [5, 2],
      [7, 4],
    ]);
  });

  it("백분위 등급(D-041): 순위 × 1000 ≤ 참가자 × 문턱. 참가자가 적으면 1%·5%에 아무도 들지 않는다", () => {
    const tiers = [10, 50, 200, 500];
    expect(tierPmOf(1, 1000, tiers)).toBe(10);
    expect(tierPmOf(10, 1000, tiers)).toBe(10);
    expect(tierPmOf(11, 1000, tiers)).toBe(50);
    expect(tierPmOf(500, 1000, tiers)).toBe(500);
    expect(tierPmOf(501, 1000, tiers)).toBeNull();
    expect(tierPmOf(1, 3, tiers)).toBe(500);
    expect(tierPmOf(1, 5, tiers)).toBe(200);
    const ranked = rankEntries(
      Array.from({ length: 10 }, (_, index) => ({ key: index + 1, score: (10 - index) * 100 })),
    );
    expect(tierCuts(ranked, tiers)).toEqual([
      { tierPm: 10, minScore: null },
      { tierPm: 50, minScore: null },
      { tierPm: 200, minScore: 900 },
      { tierPm: 500, minScore: 600 },
    ]);
  });

  it("세력 판 점수 = 도시·발전도·휴먼·국고(빚은 0)", () => {
    const w = TEST_RANKING_COEFFICIENTS.faction;
    expect(factionScore({ cities: 2, developmentSum: 30, humans: 40, treasury: 5500n }, w)).toBe(
      2000 + 300 + 4000 + 5,
    );
    expect(factionScore({ cities: 0, developmentSum: 0, humans: 0, treasury: -10n }, w)).toBe(0);
  });

  it("설정 칸(팩 tuning ranking_*)이 계수표 ranking 칸을 바꾼다", () => {
    expect(TEST_SOCIETY_COEFFICIENTS.ranking).toEqual(TEST_RANKING_COEFFICIENTS);
    const tuned = societyCoefficientsFrom(
      new Map([
        ["ranking_decay", 30],
        ["ranking_tier_2", 40],
        ["ranking_faction_human", 7],
        ["ranking_period", 3_600_000],
      ]),
    );
    expect([
      tuned.ranking.decayPm,
      tuned.ranking.tiersPm,
      tuned.ranking.faction.humanPoints,
      tuned.ranking.periodMs,
    ]).toEqual([30, [10, 40, 200, 500], 7, 3_600_000]);
  });
});
