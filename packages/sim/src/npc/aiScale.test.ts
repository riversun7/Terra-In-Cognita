// 5단계: 180일 세대 교체·체제별 성향 진화 결정성 + 24시간 일과 안정성 + 대규모 유닛 성능 예산 검증
// docs/adr/2026-11-20-npc-autonomous-ai.md 6절
import { createRng } from "@terra/shared";
import {
  DEFAULT_ROLE_TRAIT_RANGES,
  type TraitRegime,
  UNIT_TRAIT_AXES,
  type UnitTraits,
  blendFactionTraits,
  driftUnitTraits,
  isUnitTraits,
  loyaltyOverridePm,
  rollUnitTraits,
} from "@terra/shared/unitTraits";
import { describe, expect, it } from "vitest";
import { DEFAULT_NPC_AI_COEFFICIENTS, blendRulesFromAi, loyaltyRulesFromAi } from "./aiCoefficients.ts";
import { TEST_NPC_COEFFICIENTS } from "./coefficients.ts";
import { assessDiplomacy, generateNpcQuests, planPrimaryMapMission } from "./diplomacyAi.ts";
import { chooseActionWithTemp, explainActions7 } from "./effectiveTraits.ts";
import { decideUnitState, simulateDailySchedule } from "./unitBrain.ts";

interface SimNation {
  readonly id: number;
  readonly regime: TraitRegime;
  readonly base: UnitTraits;
  leader: UnitTraits;
  houses: { traits: UnitTraits; weight: number }[];
  loyalty: number;
  actions: Record<string, number>;
}

function run180DayEvolution(seed: number) {
  const rng = createRng(seed);
  const ai = DEFAULT_NPC_AI_COEFFICIENTS;
  const blendRules = blendRulesFromAi(ai);
  const regimes: readonly TraitRegime[] = [
    "dictatorship",
    "dictatorship",
    "democracy",
    "democracy",
    "capitalism",
    "capitalism",
  ];
  const nations: SimNation[] = regimes.map((regime, idx) => {
    const base = rollUnitTraits(rng, DEFAULT_ROLE_TRAIT_RANGES.citizen);
    return {
      id: idx + 1,
      regime,
      base,
      leader: driftUnitTraits(base, ai.unitTraitSpread, rng, DEFAULT_ROLE_TRAIT_RANGES.leader),
      houses: Array.from({ length: 4 }, (_, h) => ({
        traits: driftUnitTraits(base, ai.unitTraitSpread, rng, DEFAULT_ROLE_TRAIT_RANGES.citizen),
        weight: regime === "capitalism" ? (h + 1) * 100 : 100,
      })),
      loyalty: 65,
      actions: {},
    };
  });

  // 180일 × 하루 4회(6시간 주기) = 720 판단 사이클
  for (let cycle = 0; cycle < 720; cycle += 1) {
    // 30일(120 사이클)마다 지도자 세대 교체 + 가문 1곳 갱신
    if (cycle > 0 && cycle % 120 === 0) {
      for (const n of nations) {
        n.leader = driftUnitTraits(n.base, ai.unitTraitSpread, rng, DEFAULT_ROLE_TRAIT_RANGES.leader);
        const slot = (cycle / 120) % n.houses.length;
        const target = n.houses[slot];
        if (target) {
          target.traits = driftUnitTraits(n.base, ai.unitTraitSpread, rng, DEFAULT_ROLE_TRAIT_RANGES.citizen);
        }
      }
    }

    const effective = nations.map((n) =>
      blendFactionTraits({
        regime: n.regime,
        leader: n.leader,
        houses: n.houses,
        base: n.base,
        avgLoyalty: n.loyalty,
        rules: blendRules,
      }),
    );

    for (let i = 0; i < nations.length; i += 1) {
      const n = nations[i]!;
      const eff = effective[i]!;
      expect(isUnitTraits(eff)).toBe(true);
      const other = effective[(i + 1) % nations.length]!;
      const dip = assessDiplomacy({
        myTraits: eff,
        otherTraits: other,
        myRegime: n.regime,
        otherRegime: nations[(i + 1) % nations.length]!.regime,
        tradeScore: 100,
        grievance: 50,
        trust: 80,
        sharedEnemy: false,
        atWar: false,
      });
      const explained = explainActions7(
        {
          id: n.id,
          traits: eff,
          cities: 3,
          strength: 1200 + (cycle % 400),
          treasury: 40_000n,
          satisfaction: n.loyalty,
          foodPm: 950,
          crowded: cycle % 8 === 0,
          foundCost: 10_000n,
          research: { cost: 4000n, blocked: cycle % 12 === 0 },
          sellableShares: true,
          poor: false,
          overlord: null,
          vassals: 0,
          restores: cycle % 16 === 0 ? [{ ruin: 10, cost: 3000n, former: true }] : [],
          claims: [],
        },
        [
          {
            id: ((i + 1) % nations.length) + 1,
            strength: 1000,
            takeable: 2,
            atWar: dip.stance === "hostile",
            truce: false,
            related: false,
            rebel: false,
          },
        ],
        TEST_NPC_COEFFICIENTS,
      );
      const chosen = chooseActionWithTemp(explained, rng.nextInt(10_000), ai.decisionTempPm);
      n.actions[chosen.kind] = (n.actions[chosen.kind] ?? 0) + 1;

      if (cycle % 4 === 0) {
        generateNpcQuests({
          traits: eff,
          treasury: 40_000n,
          minQuestBudget: 5_000n,
          foodPm: 950,
          atWar: dip.stance === "hostile",
          hasRuin: cycle % 16 === 0,
          researchBlocked: cycle % 12 === 0,
          hasTradePartner: dip.stance === "trade_partner" || dip.stance === "ally",
        });
        planPrimaryMapMission({
          traits: eff,
          treasury: 40_000n,
          missionCost: 5_000n,
          idleGuards: 4,
          hasTradeTarget: dip.stance === "trade_partner" || dip.stance === "ally",
          hasRuinOrFrontier: true,
          hasRaidTarget: dip.stance === "hostile",
          foodPm: 950,
          c: TEST_NPC_COEFFICIENTS,
        });
      }
    }
  }

  return nations.map((n) => ({
    id: n.id,
    regime: n.regime,
    leader: n.leader,
    actions: n.actions,
  }));
}

describe("NPC AI 5단계 장기 시뮬레이션 · 결정성 · 대규모 성능 예산", () => {
  it("180일(720 사이클) 6개국 세대 교체 시뮬레이션은 두 번 실행 시 완전히 같은 결과를 낸다", () => {
    const runA = run180DayEvolution(20261121);
    const runB = run180DayEvolution(20261121);
    expect(runA).toEqual(runB);
    // 모든 국가가 720회 판단을 빠짐없이 수행했고 축 범위가 유효하다
    for (const n of runA) {
      const total = Object.values(n.actions).reduce((a, b) => a + b, 0);
      expect(total).toBe(720);
      for (const axis of UNIT_TRAIT_AXES) {
        expect(n.leader[axis]).toBeGreaterThanOrEqual(0);
        expect(n.leader[axis]).toBeLessThanOrEqual(1000);
      }
    }
  });

  it("100명 다양한 유닛의 24시간 일과는 진동 없이 일관된 근무·휴식·순찰 분포를 낸다", () => {
    const rng = createRng(9991);
    let workHours = 0;
    let restHours = 0;
    let patrolHours = 0;
    for (let i = 0; i < 100; i += 1) {
      const role = i < 20 ? "guard" : i < 80 ? "worker" : "citizen";
      const traits = rollUnitTraits(rng, DEFAULT_ROLE_TRAIT_RANGES[role === "worker" ? "citizen" : role]);
      const slots = simulateDailySchedule({
        traits,
        role,
        hasWorkplace: role === "worker",
        hasMarket: true,
        ai: DEFAULT_NPC_AI_COEFFICIENTS,
      });
      for (const s of slots) {
        if (s.state === "work") workHours += 1;
        if (s.state === "rest") restHours += 1;
        if (s.state === "patrol") patrolHours += 1;
      }
    }
    expect(workHours).toBeGreaterThan(200);
    expect(restHours).toBeGreaterThan(400);
    expect(patrolHours).toBeGreaterThan(200);
  });

  it("10,000명 유닛 성향 생성 + 8상태 FSM + 충성도 개입 계산이 빠르게 완료된다(ADR 27 예산)", () => {
    const rng = createRng(2026);
    const ai = DEFAULT_NPC_AI_COEFFICIENTS;
    const loyaltyRules = loyaltyRulesFromAi(ai);
    const start = Date.now();
    let checksum = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const traits = rollUnitTraits(rng, DEFAULT_ROLE_TRAIT_RANGES.citizen);
      const dec = decideUnitState(
        {
          unitId: i + 1,
          role: i % 5 === 0 ? "guard" : "worker",
          traits,
          currentState: "rest",
          stateEnteredAtMs: 0,
          nowMs: 120_000,
          isWorkHours: i % 2 === 0,
          hasWorkplace: i % 5 !== 0,
          hasHaulJob: false,
          hasMarket: true,
          fatiguePm: (i * 37) % 1000,
          threatNear: false,
          cityAtWar: false,
          ai,
        },
        i,
      );
      const ov = loyaltyOverridePm({
        kind: "human",
        loyaltyMilli: ((i * 13) % 101) * 1000,
        traits,
        rules: loyaltyRules,
      });
      checksum += dec.nextReevalMs + ov;
    }
    const elapsedMs = Date.now() - start;
    expect(checksum).toBeGreaterThan(0);
    // 1만 유닛 1회 전체 계산이 500ms 미만(실측 보통 ~20-60ms, 1천 유닛당 수 ms 미만)
    expect(elapsedMs).toBeLessThan(500);
  });
});
