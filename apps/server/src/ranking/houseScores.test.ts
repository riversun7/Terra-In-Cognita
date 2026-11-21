// 가문 몫 점수 순수 셈 시험(fixes-1116t, 기획 대조 2341 나) — 금고·지도자 몫이 감쇠형으로 쌓이는지(D-037), 지표 없는 경로·닫힌 경로·없어진 가문
import type { RankingPathInfo } from "@terra/shared/ranking";
import { TEST_RANKING_COEFFICIENTS, decayScore } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { computeHouseScores } from "./houseScores.ts";

const PATHS: RankingPathInfo[] = [
  {
    id: "wealthiest",
    name: { ko: "자산", en: "Wealth" },
    area: "wealth",
    open: true,
    measures: [{ measure: "assets", weightPm: 1000 }],
  },
  {
    id: "landlord",
    name: { ko: "대지주", en: "Landlord" },
    area: "wealth",
    open: true,
    measures: [{ measure: "production", weightPm: 1000 }],
  },
  { id: "trader", name: { ko: "무역상", en: "Trader" }, area: "wealth", open: false, measures: [] },
];

const base = {
  paths: PATHS,
  coefficients: TEST_RANKING_COEFFICIENTS,
  periods: 1,
};

describe("computeHouseScores", () => {
  it("자산 지표 경로에서만 가문 몫 점수가 생기고, 다음 집계는 앞 점수를 감쇠해 더한다", () => {
    const first = computeHouseScores({
      ...base,
      prev: new Map(),
      houses: new Map([[5, { power: 0n, assets: 1000n }]]),
      npcHouses: new Map([[5, { power: 10n, assets: 1000n }]]),
      live: new Set(["p:5", "n:5"]),
    });
    // 같은 숫자 5라도 플레이어·NPC 가문이 따로 선다. 산출 경로(landlord)·닫힌 경로는 없다
    expect(first.map((row) => [row.pathId, row.npc, row.houseId])).toEqual([
      ["wealthiest", true, 5],
      ["wealthiest", false, 5],
    ]);
    const gain = first[0]?.score ?? 0;
    expect(gain).toBeGreaterThan(0);
    expect(first[1]?.score).toBe(gain);
    // 금고가 비면 이번 기간 점수는 0 — 앞 점수만 감쇠한다(감쇠형 D-037)
    const second = computeHouseScores({
      ...base,
      prev: new Map([["wealthiest", new Map([["p:5", gain]])]]),
      houses: new Map(),
      npcHouses: new Map(),
      live: new Set(["p:5"]),
    });
    expect(second).toEqual([
      {
        pathId: "wealthiest",
        npc: false,
        houseId: 5,
        score: decayScore(gain, TEST_RANKING_COEFFICIENTS.decayPm, 1),
      },
    ]);
  });

  it("없어진 가문(해산·NPC 가문 사라짐)의 줄은 지운다", () => {
    const rows = computeHouseScores({
      ...base,
      prev: new Map([["wealthiest", new Map([["n:7", 500]])]]),
      houses: new Map(),
      npcHouses: new Map([[7, { power: 0n, assets: 100n }]]),
      live: new Set(),
    });
    expect(rows).toEqual([]);
  });
});
