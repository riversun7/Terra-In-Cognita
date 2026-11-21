import { DEFAULT_UNIT_TRAITS, type UnitTraits } from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { chooseLeagueInvestment, leagueDuesOf, leagueTechCost } from "./leagueBrain.ts";

const all = {
  expand: { cost: 500n },
  production: { cost: 500n },
  military: { cost: 300n },
  tech: { cost: 4000n },
};
const base = { fund: 10_000n, options: all, crowded: false, atWar: false };
const traits = (patch: Partial<UnitTraits>): UnitTraits => ({ ...DEFAULT_UNIT_TRAITS, ...patch });

describe("가문 연맹 투자 판단", () => {
  it("대표 성향에 따라 고르는 투자가 갈린다", () => {
    expect(
      chooseLeagueInvestment({ ...base, traits: traits({ belligerence: 1000, boldness: 900 }) }).chosen,
    ).toBe("military");
    expect(chooseLeagueInvestment({ ...base, traits: traits({ greed: 1000, discipline: 900 }) }).chosen).toBe(
      "production",
    );
    expect(
      chooseLeagueInvestment({ ...base, traits: traits({ openness: 1000, discipline: 800 }) }).chosen,
    ).toBe("tech");
    expect(
      chooseLeagueInvestment({ ...base, traits: traits({ autonomy: 1000, boldness: 1000 }) }).chosen,
    ).toBe("expand");
  });

  it("붐비는 도시는 확장, 전쟁 중이면 군사 쪽으로 기운다", () => {
    expect(chooseLeagueInvestment({ ...base, traits: DEFAULT_UNIT_TRAITS, crowded: true }).chosen).toBe(
      "expand",
    );
    expect(chooseLeagueInvestment({ ...base, traits: DEFAULT_UNIT_TRAITS, atWar: true }).chosen).toBe(
      "military",
    );
  });

  it("기금이 모자라면 싼 것으로 바꾸지 않고 모은다. 할 수 없는 투자는 후보가 아니다", () => {
    const scholar = traits({ openness: 1000, discipline: 800 });
    const saving = chooseLeagueInvestment({ ...base, traits: scholar, fund: 1000n });
    expect(saving.chosen).toBe("tech");
    expect(saving.affordable).toBe(false);
    const capped = chooseLeagueInvestment({ ...base, traits: scholar, options: { ...all, tech: undefined } });
    expect(capped.chosen).not.toBe("tech");
    expect(chooseLeagueInvestment({ ...base, traits: scholar, options: {} }).chosen).toBeNull();
  });

  it("분담금은 금고의 몫(내림), 기술 비용은 레벨이 오를수록 비싸다", () => {
    expect(leagueDuesOf(999n, 200)).toBe(199n);
    expect(leagueDuesOf(0n, 200)).toBe(0n);
    expect(leagueTechCost(2000n, 0)).toBe(2000n);
    expect(leagueTechCost(2000n, 3)).toBe(8000n);
  });
});
