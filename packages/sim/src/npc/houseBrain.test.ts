import { DEFAULT_UNIT_TRAITS } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { DEFAULT_NPC_AI_COEFFICIENTS } from "./aiCoefficients.ts";
import { decideHouseAction, decideHouseVote, houseDecideIntervalMs } from "./houseBrain.ts";

const LIMITS = {
  feeMax: 5000,
  grantMax: 2000,
  vaultReturnMinPm: 200,
  vaultReturnMaxPm: 900,
  investMinVault: 10_000n,
  dividendMinVault: 5_000n,
  branchMinMembers: 4,
};

describe("houseBrain (NPC 가문 자율 AI)", () => {
  it("성향과 상황에 따라 투자·배당·분가·이주·국고 환류를 구분해 선택한다", () => {
    const investor = decideHouseAction(
      {
        houseId: 1,
        traits: { ...DEFAULT_UNIT_TRAITS, greed: 900, boldness: 850, openness: 850, communalism: 200 },
        isRulingHouse: false,
        vaultBalance: 50_000n,
        memberCount: 3,
        citySatisfaction: 70,
        cityCrowded: false,
        cityNeedsInvestment: true,
        hasMigrationTarget: true,
        limits: LIMITS,
      },
      0,
    );
    expect(investor.chosen).toBe("invest_city");

    const migrant = decideHouseAction(
      {
        houseId: 2,
        traits: { ...DEFAULT_UNIT_TRAITS, autonomy: 920, openness: 850, communalism: 150 },
        isRulingHouse: false,
        vaultBalance: 1_000n,
        memberCount: 3,
        citySatisfaction: 15,
        cityCrowded: false,
        cityNeedsInvestment: false,
        hasMigrationTarget: true,
        limits: LIMITS,
      },
      0,
    );
    expect(migrant.chosen).toBe("migrate");

    const communalRuler = decideHouseAction(
      {
        houseId: 3,
        traits: { ...DEFAULT_UNIT_TRAITS, communalism: 950, greed: 100 },
        isRulingHouse: true,
        vaultBalance: 3_000n,
        memberCount: 5,
        citySatisfaction: 75,
        cityCrowded: false,
        cityNeedsInvestment: false,
        hasMigrationTarget: false,
        limits: LIMITS,
      },
      0,
    );
    expect(communalRuler.chosen).toBe("vault_return");
    expect(communalRuler.vaultReturnPm).toBeGreaterThan(750);
  });

  it("안건 투표는 7축 성향에 따라 찬성·반대·기권을 결정적으로 낸다", () => {
    const hawk = { ...DEFAULT_UNIT_TRAITS, belligerence: 900, boldness: 850 };
    const dove = { ...DEFAULT_UNIT_TRAITS, belligerence: 100, boldness: 200, communalism: 850 };
    expect(decideHouseVote(hawk, "war")).toBe("yes");
    expect(decideHouseVote(dove, "war")).toBe("no");
    expect(decideHouseVote(dove, "peace")).toBe("yes");
    expect(decideHouseVote({ ...DEFAULT_UNIT_TRAITS, autonomy: 900, boldness: 800 }, "independence")).toBe(
      "yes",
    );
  });

  it("가문 판단 주기는 설정 구간 안에 결정적으로 들어간다", () => {
    const ms = houseDecideIntervalMs(123, DEFAULT_NPC_AI_COEFFICIENTS);
    expect(ms).toBeGreaterThanOrEqual(DEFAULT_NPC_AI_COEFFICIENTS.houseDecideMinMs);
    expect(ms).toBeLessThanOrEqual(DEFAULT_NPC_AI_COEFFICIENTS.houseDecideMaxMs);
  });
});
