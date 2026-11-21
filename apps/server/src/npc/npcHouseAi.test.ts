import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { createNpcHouseAi } from "./npcHouseAi.ts";

describe("npcHouseAi", () => {
  it("houseAiEnabled=0이면 판단을 건너뛰고, 켜지면 주기 도달 시 결정적으로 판단한다", () => {
    let enabled = 0;
    const ai = createNpcHouseAi({
      worldSeed: 777,
      rules: () => ({
        ...TEST_SOCIETY_COEFFICIENTS,
        npcAi: {
          ...TEST_SOCIETY_COEFFICIENTS.npcAi,
          houseAiEnabled: enabled,
          houseDecideMinMs: 60_000,
          houseDecideMaxMs: 120_000,
        },
      }),
    });

    const snap = {
      houseId: 5,
      isRulingHouse: false,
      headTraits: { ...DEFAULT_UNIT_TRAITS, greed: 900, boldness: 850, openness: 850 },
      memberTraits: [DEFAULT_UNIT_TRAITS, DEFAULT_UNIT_TRAITS],
      vaultBalance: 100_000n,
      citySatisfaction: 70,
      cityCrowded: false,
      cityNeedsInvestment: true,
      hasMigrationTarget: false,
    };

    expect(ai.tick([snap], 1_000)).toEqual([]);

    enabled = 1;
    // 최초 호출은 시드 흩기 예약만 잡는다
    expect(ai.tick([snap], 1_000)).toEqual([]);
    // 최대 주기 경과 후 실제 판단 실행
    const out = ai.tick([snap], 200_000);
    expect(out).toHaveLength(1);
    expect(out[0]?.decision.chosen).toBe("invest_city");
    expect(ai.lastDecisionOf(5)?.chosen).toBe("invest_city");
  });

  it("traits override가 있으면 합성 대신 덮어쓰기 성향으로 투표한다", () => {
    const ai = createNpcHouseAi({
      worldSeed: 1,
      rules: () => TEST_SOCIETY_COEFFICIENTS,
    });
    const vote = ai.vote(
      {
        headTraits: { ...DEFAULT_UNIT_TRAITS, belligerence: 950, boldness: 950 },
        memberTraits: [],
        override: { ...DEFAULT_UNIT_TRAITS, belligerence: 50, boldness: 100, communalism: 900 },
        citySatisfaction: 70,
      },
      "war",
    );
    expect(vote).toBe("no");
  });
});
