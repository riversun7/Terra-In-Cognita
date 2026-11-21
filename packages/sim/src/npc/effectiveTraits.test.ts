import { describe, expect, it } from "vitest";
import { presetTactics } from "@terra/shared/aiTactics";
import { DEFAULT_UNIT_TRAITS, type UnitTraits } from "@terra/shared/unitTraits";
import { TEST_SOCIETY_COEFFICIENTS } from "../society/coefficients.ts";
import { START_WAR_COEFFICIENTS } from "../society/warOutcomes.ts";
import { tuningProblems } from "../tuningChecks.ts";
import { DEFAULT_NPC_AI_COEFFICIENTS } from "./aiCoefficients.ts";
import { TEST_NPC_COEFFICIENTS } from "./coefficients.ts";
import {
  type FactionView7,
  answerOffer7,
  chooseActionWithTemp,
  effectiveAttackRatioPm,
  effectiveReservePm,
  explainActions7,
  foundingChoice7,
  independenceYes7,
  npcHouseEntryFee7,
  npcRulingVaultReturnPm7,
  occupationChoice7,
  resolveFactionEffectiveTraits,
  resolveUnitCombatTactics,
} from "./effectiveTraits.ts";

const make7 = (overrides: Partial<UnitTraits> = {}): UnitTraits => ({
  ...DEFAULT_UNIT_TRAITS,
  ...overrides,
});

const baseFaction = (traits: UnitTraits, overrides: Partial<FactionView7> = {}): FactionView7 => ({
  id: 1,
  traits,
  cities: 2,
  strength: 200,
  treasury: 50_000n,
  satisfaction: 75,
  foodPm: 1000,
  crowded: true,
  foundCost: 5000n,
  research: { cost: 4000n, blocked: false },
  sellableShares: true,
  poor: false,
  overlord: { id: 9, strength: 100 },
  vassals: 0,
  restores: [{ ruin: 10, cost: 3000n, former: false }],
  claims: [],
  ...overrides,
});

describe("7축 분산 판단·규칙식(effectiveTraits)", () => {
  it("각 축이 분리된 게임 영역에 독립적으로 영향을 미친다(만능 축 없음)", () => {
    // 1. autonomy(자치)는 봉신 독립·마을 독립·편입 거부·독립 투표를 좌우하고, belligerence와 분리된다
    const peacefulAutonomous = make7({ belligerence: 100, autonomy: 900, greed: 200 });
    const aggressiveObedient = make7({ belligerence: 900, autonomy: 100, greed: 900 });
    expect(foundingChoice7(peacefulAutonomous, TEST_NPC_COEFFICIENTS).vassal).toBe(false);
    expect(foundingChoice7(aggressiveObedient, TEST_NPC_COEFFICIENTS).vassal).toBe(true);
    expect(answerOffer7(peacefulAutonomous, true, TEST_NPC_COEFFICIENTS)).toBe("refused");
    expect(answerOffer7(aggressiveObedient, true, TEST_NPC_COEFFICIENTS)).toBe("accepted");
    expect(independenceYes7(peacefulAutonomous, false, TEST_NPC_COEFFICIENTS)).toBe(true);
    expect(independenceYes7(aggressiveObedient, false, TEST_NPC_COEFFICIENTS)).toBe(false);

    // 2. openness(개방) + greed(이윤) 조합으로 가문 이주 정책(지원금 vs 가입비)이 갈린다
    const openPublic = make7({ openness: 900, greed: 100 });
    const closedGreedy = make7({ openness: 100, greed: 900 });
    expect(npcHouseEntryFee7(openPublic, { feeMax: 100, grantMax: 100 })).toBeLessThan(0);
    expect(npcHouseEntryFee7(closedGreedy, { feeMax: 100, grantMax: 100 })).toBeGreaterThan(0);

    // 3. boldness(과감성)는 예비금과 공격 전력 비 문턱을 낮춘다
    expect(effectiveReservePm(1000, TEST_NPC_COEFFICIENTS)).toBeLessThan(
      effectiveReservePm(0, TEST_NPC_COEFFICIENTS),
    );
    expect(effectiveAttackRatioPm(1000, TEST_NPC_COEFFICIENTS)).toBeLessThan(
      effectiveAttackRatioPm(0, TEST_NPC_COEFFICIENTS),
    );

    // 4. greed 낮고 communalism 높으면 독재 금고에서 국고로 더 많이 돌려보낸다
    expect(
      npcRulingVaultReturnPm7(make7({ greed: 100, communalism: 900 }), { minPm: 300, maxPm: 900 }),
    ).toBeGreaterThan(
      npcRulingVaultReturnPm7(make7({ greed: 900, communalism: 100 }), { minPm: 300, maxPm: 900 }),
    );

    // 5. 공성 점령 처리: belligerence 900이면 상장폐지
    const occ = occupationChoice7(
      make7({ belligerence: 900, greed: 200 }),
      1,
      true,
      TEST_NPC_COEFFICIENTS,
      START_WAR_COEFFICIENTS,
    );
    expect(occ.shares).toBe("delist");
  });

  it("점수 분해(explainActions7)와 탐색 온도(chooseActionWithTemp)가 결정적으로 동작한다", () => {
    const view = baseFaction(make7({ autonomy: 950, openness: 850, discipline: 800 }));
    const rivals = [
      { id: 2, strength: 80, takeable: 1, atWar: false, truce: false, related: false, rebel: false },
    ];
    const explained = explainActions7(view, rivals, TEST_NPC_COEFFICIENTS);
    expect(explained.length).toBeGreaterThanOrEqual(5);
    for (const item of explained) {
      const sum = item.factors.reduce((acc, f) => acc + f.delta, 0);
      expect(sum).toBe(item.score);
    }

    // 온도 0 = 최고점 고정
    const topAction = chooseActionWithTemp(explained, 0, 0);
    const maxScore = Math.max(...explained.map((e) => e.score));
    expect(explained.find((e) => e.action === topAction)?.score).toBe(maxScore);

    // 같은 roll이면 온도 > 0에서도 결정적
    const t1 = chooseActionWithTemp(explained, 17, 300);
    const t2 = chooseActionWithTemp(explained, 17, 300);
    expect(t1).toEqual(t2);
  });

  it("세력 실효 성향 합성 및 충성도 연동 플레이어 작전 계산이 계수표를 따른다", () => {
    const eff = resolveFactionEffectiveTraits({
      regime: "dictatorship",
      legacyBase: { aggression: 200, commerce: 200, faith: 200, station: 200 },
      leader: make7({ belligerence: 1000, openness: 1000 }),
      avgLoyalty: 90,
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
    });
    expect(eff.belligerence).toBeGreaterThan(eff.openness);

    const lowLoyalty = resolveUnitCombatTactics({
      kind: "human",
      traits: make7({ belligerence: 1000, boldness: 1000, autonomy: 900 }),
      playerTactics: presetTactics("hold"),
      loyaltyMilli: 15_000,
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
    });
    const highLoyalty = resolveUnitCombatTactics({
      kind: "human",
      traits: make7({ belligerence: 1000, boldness: 1000, autonomy: 900 }),
      playerTactics: presetTactics("hold"),
      loyaltyMilli: 95_000,
      ai: DEFAULT_NPC_AI_COEFFICIENTS,
    });
    expect(lowLoyalty.overridePm).toBeGreaterThan(highLoyalty.overridePm);
    expect(lowLoyalty.tactics.engage).toBeGreaterThan(highLoyalty.tactics.engage);
  });

  it("tuningChecks가 NPC AI 구간 역전(ai_range_order)과 합성 비율 합 불일치(ai_blend_sum)를 잡는다", () => {
    expect(tuningProblems(TEST_SOCIETY_COEFFICIENTS)).toEqual([]);

    const badRange = {
      ...TEST_SOCIETY_COEFFICIENTS,
      npcAi: { ...DEFAULT_NPC_AI_COEFFICIENTS, guardBoldnessMin: 800, guardBoldnessMax: 400 },
    };
    expect(tuningProblems(badRange)).toContain("ai_range_order");

    const badBlend = {
      ...TEST_SOCIETY_COEFFICIENTS,
      npcAi: { ...DEFAULT_NPC_AI_COEFFICIENTS, dictDecLeaderPm: 900 },
    };
    expect(tuningProblems(badBlend)).toContain("ai_blend_sum");
  });
});
