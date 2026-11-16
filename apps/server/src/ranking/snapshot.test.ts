// 랭킹 집계 순수 셈 시험 — 기간 고르기(경계·빠진 경계·처음)와 두 판의 다음 줄(감쇠·이번 점수·순위·등급·닫힌 경로)
import type { RankingPathInfo } from "@terra/shared/ranking";
import { TEST_RANKING_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { OwnerFlows, OwnerStocks } from "./measures.ts";
import { computeSnapshot, dueWindow, measureValues } from "./snapshot.ts";
import { computeUnitScores } from "./unitScores.ts";

const DAY = 86_400_000;
const PATHS: RankingPathInfo[] = [
  {
    id: "conqueror",
    name: { ko: "정복자", en: "Conqueror" },
    area: "force",
    open: true,
    measures: [
      { measure: "war_wins", weightPm: 1000 },
      { measure: "cities_held", weightPm: 1000 },
    ],
  },
  {
    id: "landlord",
    name: { ko: "대지주", en: "Landlord" },
    area: "wealth",
    open: true,
    measures: [{ measure: "production", weightPm: 500 }],
  },
  { id: "trader", name: { ko: "무역상", en: "Trader" }, area: "wealth", open: false, measures: [] },
];

const flows = (production: bigint, war = 0, battle = 0): OwnerFlows => ({
  production,
  warWinsPm: war,
  battleWinsPm: battle,
});
const stocks = (cities: number, developmentSum = 0): OwnerStocks => ({
  cities,
  developmentSum,
  facilityLevelPpm: 0n,
});

describe("집계 기간", () => {
  it("처음이면 바로 앞 기간, 경계가 안 지났으면 null, 빠진 경계가 여럿이면 감쇠 횟수만 늘린다", () => {
    const now = 10 * DAY + 3_600_000;
    expect(dueWindow(null, now, DAY)).toEqual({ fromMs: 9 * DAY, toMs: 10 * DAY, periods: 1 });
    const state = { periodFromMs: 9 * DAY, periodToMs: 10 * DAY, computedAtMs: 10 * DAY + 1 };
    expect(dueWindow(state, now, DAY)).toBeNull();
    expect(dueWindow(state, 13 * DAY + 5, DAY)).toEqual({ fromMs: 10 * DAY, toMs: 13 * DAY, periods: 3 });
    // 주기 하한 1분(설정 칸 범위와 같다)
    expect(dueWindow(null, 120_500, 1)).toEqual({ fromMs: 60_000, toMs: 120_000, periods: 1 });
  });
});

describe("다음 판", () => {
  it("연 경로만, 점수 = 감쇠한 앞 점수 + 이번 점수, 같은 점수는 같은 순위, 지난 순위를 남긴다", () => {
    expect(measureValues(flows(3n, 2000), stocks(1)).cities_held).toBe(1000);
    const next = computeSnapshot({
      paths: PATHS,
      prevPaths: new Map([
        [
          "conqueror",
          new Map([
            [5, { score: 1000, rank: 1 }],
            [6, { score: 1, rank: 2 }],
          ]),
        ],
        ["trader", new Map([[5, { score: 999, rank: 1 }]])],
      ]),
      prevFactions: new Map([[1, 2]]),
      flows: new Map([
        [7, flows(3n, 2000)],
        [5, flows(0n)],
      ]),
      stocks: new Map([[8, stocks(1)]]),
      factions: [
        { factionId: 1, cities: 2, developmentSum: 0, humans: 10, treasury: 0n, renown: 40 },
        { factionId: 2, cities: 0, developmentSum: 0, humans: 0, treasury: 0n, renown: null },
        { factionId: 3, cities: 3, developmentSum: 0, humans: 0, treasury: 0n, renown: null },
      ],
      coefficients: TEST_RANKING_COEFFICIENTS,
      periods: 1,
    });
    const conqueror = next.paths.filter((row) => row.pathId === "conqueror");
    // 7: 전쟁 승리 2000 / 8: 도시 하나 1000 / 5: 1000 → 982(감쇠) / 6: 1 → 0(빠짐)
    expect(conqueror.map((row) => [row.ownerId, row.score, row.gain, row.rank, row.prevRank])).toEqual([
      [7, 2000, 2000, 1, null],
      [8, 1000, 1000, 2, null],
      [5, 982, 0, 3, 1],
    ]);
    // 참가자 3: 1위만 상위 50%(1 × 1000 ≤ 3 × 500), 나머지는 등급 밖
    expect(conqueror.map((row) => row.tierPm)).toEqual([500, null, null]);
    const landlord = next.paths.filter((row) => row.pathId === "landlord");
    // 산출 3 → log2(4) = 2000 × 가중치 500‰ = 1000
    expect(landlord.map((row) => [row.ownerId, row.score])).toEqual([[7, 1000]]);
    expect(next.paths.some((row) => row.pathId === "trader")).toBe(false);
    // 세력 판: 3 = 3000, 1 = 2000 + 휴먼 10 × 100 = 3000(같은 점수 → 같은 순위, 키 작은 순, 명성은 점수에 더하지 않음), 2 = 0(빠짐)
    expect(
      next.factions.map((row) => [row.factionId, row.score, row.rank, row.prevRank, row.renown]),
    ).toEqual([
      [1, 3000, 1, 2, 40],
      [3, 3000, 1, null, null],
    ]);
  });
});

describe("NPC 가문원 유닛 점수(질문 2146 → 고침, unitScores.ts)", () => {
  it("유닛 자신의 전투 승리만 세고(도시·산출 0), 앞 점수는 감쇠, 지금 가문원이 아닌 유닛·점수 0은 뺀다", () => {
    const decayPm = TEST_RANKING_COEFFICIENTS.decayPm;
    const rows = computeUnitScores({
      paths: PATHS,
      prev: new Map([
        [
          "conqueror",
          new Map([
            [5, 10_000],
            [6, 900],
          ]),
        ],
      ]),
      flows: new Map([
        [5, flows(0n, 2000)],
        [7, flows(0n, 1500)],
        [8, flows(0n, 0, 4000)],
      ]),
      members: new Set([5, 7, 8]),
      coefficients: { decayPm },
      periods: 1,
    });
    const decayed = 10_000 - Math.floor((10_000 * decayPm) / 1000);
    expect(rows).toEqual([
      { pathId: "conqueror", unitId: 5, score: decayed + 2000 },
      { pathId: "conqueror", unitId: 7, score: 1500 },
    ]);
  });
});
