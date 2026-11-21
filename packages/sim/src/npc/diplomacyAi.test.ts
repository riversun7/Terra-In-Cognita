import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { TEST_NPC_COEFFICIENTS } from "./coefficients.ts";
import { assessDiplomacy, generateNpcQuests, planPrimaryMapMission } from "./diplomacyAi.ts";

describe("diplomacyAi (5단계 외교 호감 · 자동 의뢰 · 1차맵 임무)", () => {
  it("7축 성향·체제·역사에 따라 동맹·교역파트너·경쟁·적대를 결정적으로 구분한다", () => {
    const openDemo = { ...DEFAULT_UNIT_TRAITS, openness: 850, belligerence: 200, communalism: 700 };
    const fierceDict = { ...DEFAULT_UNIT_TRAITS, openness: 150, belligerence: 900, communalism: 200 };

    const friends = assessDiplomacy({
      myTraits: openDemo,
      otherTraits: openDemo,
      myRegime: "democracy",
      otherRegime: "democracy",
      tradeScore: 200,
      grievance: 0,
      trust: 150,
      sharedEnemy: false,
      atWar: false,
    });
    expect(friends.stance).toBe("ally");
    expect(friends.affinity).toBeGreaterThanOrEqual(450);

    const rivals = assessDiplomacy({
      myTraits: openDemo,
      otherTraits: fierceDict,
      myRegime: "democracy",
      otherRegime: "dictatorship",
      tradeScore: 0,
      grievance: 250,
      trust: 0,
      sharedEnemy: false,
      atWar: false,
    });
    expect(["rival", "hostile"]).toContain(rivals.stance);
    expect(rivals.affinity).toBeLessThan(-150);
  });

  it("D-336 자동 의뢰는 식량 위기·전쟁·연구 막힘 등 긴급 수요를 우선 발행하고 성향별 보상 배율을 조절한다", () => {
    const communal = generateNpcQuests({
      traits: { ...DEFAULT_UNIT_TRAITS, communalism: 900, openness: 800, greed: 150 },
      treasury: 50_000n,
      minQuestBudget: 5_000n,
      foodPm: 400,
      atWar: true,
      hasRuin: true,
      researchBlocked: true,
      hasTradePartner: true,
      maxOffers: 3,
    });
    const greedy = generateNpcQuests({
      traits: { ...DEFAULT_UNIT_TRAITS, communalism: 150, openness: 200, greed: 950 },
      treasury: 50_000n,
      minQuestBudget: 5_000n,
      foodPm: 400,
      atWar: false,
      hasRuin: false,
      researchBlocked: false,
      hasTradePartner: true,
      maxOffers: 3,
    });

    expect(communal).toHaveLength(3);
    expect(communal[0]?.kind).toBe("supply_food");
    expect(communal[0]?.rewardRatePm ?? 0).toBeGreaterThan(greedy[0]?.rewardRatePm ?? 0);

    // 예산 부족이면 발행하지 않는다
    expect(
      generateNpcQuests({
        traits: DEFAULT_UNIT_TRAITS,
        treasury: 100n,
        minQuestBudget: 5_000n,
        foodPm: 300,
        atWar: true,
        hasRuin: false,
        researchBlocked: false,
        hasTradePartner: false,
      }),
    ).toEqual([]);
  });

  it("1차맵 NPC 임무 계획은 상단·원정·습격을 7축 성향에 따라 구분하고 식량/예비금 부족 시 중단한다", () => {
    const merchant = planPrimaryMapMission({
      traits: { ...DEFAULT_UNIT_TRAITS, greed: 900, openness: 850, belligerence: 150, boldness: 400 },
      treasury: 100_000n,
      missionCost: 10_000n,
      idleGuards: 5,
      hasTradeTarget: true,
      hasRuinOrFrontier: true,
      hasRaidTarget: true,
      foodPm: 1000,
      c: TEST_NPC_COEFFICIENTS,
    });
    expect(merchant.kind).toBe("caravan");

    const raider = planPrimaryMapMission({
      traits: {
        ...DEFAULT_UNIT_TRAITS,
        belligerence: 950,
        boldness: 900,
        communalism: 100,
        greed: 300,
        openness: 200,
      },
      treasury: 100_000n,
      missionCost: 10_000n,
      idleGuards: 5,
      hasTradeTarget: true,
      hasRuinOrFrontier: false,
      hasRaidTarget: true,
      foodPm: 1000,
      c: TEST_NPC_COEFFICIENTS,
    });
    expect(raider.kind).toBe("raid");

    const hungry = planPrimaryMapMission({
      traits: { ...DEFAULT_UNIT_TRAITS, greed: 900, openness: 850 },
      treasury: 100_000n,
      missionCost: 10_000n,
      idleGuards: 5,
      hasTradeTarget: true,
      hasRuinOrFrontier: true,
      hasRaidTarget: true,
      foodPm: 500,
      c: TEST_NPC_COEFFICIENTS,
    });
    expect(hungry.kind).toBe("none");
  });
});
