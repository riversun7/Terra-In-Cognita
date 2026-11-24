// NPC AI 판단 실험실 tRPC 라우터(/dev/npc-ai 탭 5) — docs/adr/2026-11-20-npc-autonomous-ai.md
// 권한: tuning:read(dev·admin). 게임 앱은 @terra/sim을 직접 import하지 못하므로(check-boundaries.mjs),
// 에디터의 가상 7축 성향·상황·담은 변경값으로 서버 판정 함수(explainActions7 등)를 그대로 돌려 점수 분해표를 반환한다.
import {
  chooseActionWithTemp,
  chooseCombatTacticFromTraits,
  deriveUnitDrives,
  driveRulesFromAi,
  effectiveAttackRatioPm,
  effectiveReservePm,
  explainActions7,
  foundingChoice7,
  guardPatrolRadiusCells,
  loyaltyRulesFromAi,
  moveSkillAllowed,
  npcHouseEntryFee7,
  npcRulingVaultReturnPm7,
  simulateDailySchedule,
  tradePolicy7,
  wantsRun,
} from "@terra/sim/npcAi";
import { AI_PRESET_VALUES, AI_PRESETS } from "@terra/shared/aiTactics";
import { societyCoefficientsFrom } from "@terra/sim";
import { TUNING_VALUE_LIMIT } from "@terra/shared/tuning";
import {
  UNIT_TRAIT_MAX,
  UNIT_TRAIT_MIN,
  blendTacticsByLoyalty,
  loyaltyOverridePm,
  tacticsFromUnitTraits,
} from "@terra/shared/unitTraits";
import { z } from "zod";
import { permissionProcedure, router } from "./init.ts";

const axisSchema = z.int().min(UNIT_TRAIT_MIN).max(UNIT_TRAIT_MAX);

const traitsSchema = z.strictObject({
  belligerence: axisSchema,
  greed: axisSchema,
  boldness: axisSchema,
  communalism: axisSchema,
  autonomy: axisSchema,
  openness: axisSchema,
  discipline: axisSchema,
});

const previewInput = z.strictObject({
  traits: traitsSchema,
  cities: z.int().min(1).max(64),
  strength: z.int().min(1).max(100_000),
  rivalStrength: z.int().min(1).max(100_000),
  rivalAtWar: z.boolean(),
  rivalRebel: z.boolean(),
  treasury: z.int().min(0).max(1_000_000_000),
  satisfaction: z.int().min(0).max(100),
  foodPm: z.int().min(0).max(1000),
  crowded: z.boolean(),
  researchBlocked: z.boolean(),
  poor: z.boolean(),
  hasOverlord: z.boolean(),
  overlordStrength: z.int().min(1).max(100_000),
  vassals: z.int().min(0).max(32),
  hasRuin: z.boolean(),
  roll: z.int().min(0).max(10_000).default(0),
  /** 현재 실효 + 에디터 담은 변경값(ID → 정수) */
  tuningValues: z.record(z.string(), z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT)).optional(),
});

const scheduleInput = z.strictObject({
  traits: traitsSchema,
  role: z.enum(["citizen", "worker", "guard", "leader"]),
  hasWorkplace: z.boolean(),
  hasMarket: z.boolean(),
  /** 만족도(0~100점)·그날 식사 몫(‰) — 1차 값(docs/adr/2026-11-21-npc-needs-drives.md). 없으면 만족도는 세지 않고 식사는 가득 */
  satisfaction: z.int().min(0).max(100).optional(),
  fedPm: z.int().min(0).max(1000).optional(),
  tuningValues: z.record(z.string(), z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT)).optional(),
});

const combatMoveInput = z.strictObject({
  traits: traitsSchema,
  unitKind: z.enum(["human", "android", "creature", "cyborg_main"]),
  loyalty: z.int().min(0).max(100),
  playerPreset: z.enum(AI_PRESETS),
  range: z.int().min(1).max(8).default(1),
  hpPct: z.int().min(1).max(100).default(70),
  staminaPct: z.int().min(0).max(100).default(75),
  tuningValues: z.record(z.string(), z.int().min(-TUNING_VALUE_LIMIT).max(TUNING_VALUE_LIMIT)).optional(),
});

const read = permissionProcedure({ tuning: ["read"] });

export const npcAiRouter = router({
  /**
   * AI 작동 모니터(/dev/npc-ai [모니터] 탭): 스위치·세계 합계·도시 표(지시 불복 많은 차례)·마지막 하루 끝·관리인 기록. cityId를 주면 그 도시
   * 가문 표(집계·깃발·금고)를 붙인다. 읽기만 한다
   */
  monitor: read.input(z.strictObject({ cityId: z.int().min(1).optional() })).query(({ ctx, input }) => {
    const found = ctx.npcAiMonitor?.(input.cityId);
    return found ? { status: "ready" as const, ...found } : { status: "not_ready" as const };
  }),
  /** 가상 유닛의 D-558 전개 방식 + WP-4 달리기·이동 스킬 허용 미리보기 */
  previewCombatMove: read.input(combatMoveInput).query(({ input }) => {
    const map = new Map<string, number>(Object.entries(input.tuningValues ?? {}));
    const society = societyCoefficientsFrom(map);
    const ai = society.npcAi;
    const overridePm = loyaltyOverridePm({
      kind: input.unitKind,
      loyaltyMilli: input.loyalty * 1000,
      traits: input.traits,
      rules: {
        at100Pm: ai.loyaltyOverride100Pm,
        at80Pm: ai.loyaltyOverride80Pm,
        at50Pm: ai.loyaltyOverride50Pm,
        at20Pm: ai.loyaltyOverride20Pm,
        at0Pm: ai.loyaltyOverride0Pm,
        minPm: ai.loyaltyOverrideMinPm,
        maxPm: ai.loyaltyOverrideMaxPm,
        autonomyWeightPm: ai.loyaltyAutonomyWeightPm,
        disciplineWeightPm: ai.loyaltyDisciplineWeightPm,
        communalismWeightPm: ai.loyaltyCommunalismWeightPm,
        creatureInstinctPm: ai.creatureInstinctPm,
      },
    });
    const effectiveTactics = blendTacticsByLoyalty(
      AI_PRESET_VALUES[input.playerPreset],
      tacticsFromUnitTraits(input.traits),
      overridePm,
    );
    const sampleUnit = {
      id: 1,
      x: 10,
      y: 10,
      maxHp: 1000,
      hp: input.hpPct * 10,
      range: input.range,
      staminaMax: 100,
      staminaMilli: input.staminaPct * 1000,
      command: null,
      aiTactics: effectiveTactics,
      stealthUntilMs: undefined,
      detectUntilMs: undefined,
    };
    const farEnemy = { x: 10 + input.range + 2, y: 10 };
    const nearEnemy = { x: 11, y: 10 };
    return {
      overridePm,
      deployment: chooseCombatTacticFromTraits(input.traits, input.range),
      runsNormally: wantsRun(sampleUnit),
      runsRetreating: wantsRun(sampleUnit, { retreating: true }),
      moves: {
        dash: moveSkillAllowed(
          sampleUnit,
          { id: "dash_preview", move: { kind: "dash", cells: 3 } },
          farEnemy,
          1000,
        ),
        backstep: moveSkillAllowed(
          sampleUnit,
          { id: "backstep_preview", move: { kind: "backstep", cells: 2 } },
          nearEnemy,
          1000,
        ),
        stealth: moveSkillAllowed(
          sampleUnit,
          { id: "stealth_preview", move: { kind: "stealth", durationMs: 4000 } },
          farEnemy,
          1000,
        ),
        detect: moveSkillAllowed(
          sampleUnit,
          { id: "detect_preview", move: { kind: "detect", cells: 5, durationMs: 4000 } },
          farEnemy,
          1000,
        ),
      },
    };
  }),

  /** 가상 7축 성향·직군에 대한 24시간(0~23시) 유닛 일상 자율행동 시간표 미리보기 */
  previewUnitSchedule: read.input(scheduleInput).query(({ input }) => {
    const map = new Map<string, number>(Object.entries(input.tuningValues ?? {}));
    const society = societyCoefficientsFrom(map);
    const workStartHour = Math.round((society.worldSeed.workStartPm * 24) / 1000) % 24;
    const workEndHour = Math.round((society.worldSeed.workEndPm * 24) / 1000) % 24;
    const loyaltyRules = loyaltyRulesFromAi(society.npcAi);
    const satisfactionMilli = input.satisfaction === undefined ? null : input.satisfaction * 1000;
    const fedPm = input.fedPm ?? null;
    const slots = simulateDailySchedule({
      traits: input.traits,
      role: input.role,
      hasWorkplace: input.hasWorkplace,
      hasMarket: input.hasMarket,
      workStartHour,
      workEndHour,
      satisfactionMilli,
      fedPm,
      ai: society.npcAi,
      loyaltyRules,
    });
    return {
      slots,
      // 2차 지수(근로 의욕·복종도·위험 감수·소비 성향)
      drives: deriveUnitDrives({
        traits: input.traits,
        satisfactionMilli,
        fedPm,
        loyaltyRules,
        rules: driveRulesFromAi(society.npcAi),
      }),
      patrolRadiusCells: guardPatrolRadiusCells(input.traits, society.npcAi),
      leaderRoamRadiusCells: society.npcAi.leaderRoamRadiusCells,
    };
  }),

  /** 가상 7축 성향·상황에 대한 행동 후보별 점수 분해표 + 최종 선택 + 정책 규칙식 결과 */
  previewDecision: read.input(previewInput).query(({ input }) => {
    const map = new Map<string, number>(Object.entries(input.tuningValues ?? {}));
    const society = societyCoefficientsFrom(map);
    const c = society.npc;
    const ai = society.npcAi;
    const view = {
      id: 1,
      traits: input.traits,
      cities: input.cities,
      strength: input.strength,
      treasury: BigInt(input.treasury),
      satisfaction: input.satisfaction,
      foodPm: input.foodPm,
      crowded: input.crowded,
      foundCost: BigInt(society.house.villageCost),
      research: { cost: 4000n, blocked: input.researchBlocked },
      sellableShares: true,
      poor: input.poor,
      overlord: input.hasOverlord ? { id: 99, strength: input.overlordStrength } : null,
      vassals: input.vassals,
      restores: input.hasRuin ? [{ ruin: 101, cost: 3000n, former: true }] : [],
      claims: [],
    };
    const rivals = [
      {
        id: 2,
        strength: input.rivalStrength,
        takeable: 2,
        atWar: input.rivalAtWar,
        truce: false,
        related: false,
        rebel: input.rivalRebel,
      },
    ];
    const explained = explainActions7(view, rivals, c);
    const chosen = chooseActionWithTemp(explained, input.roll, ai.decisionTempPm);
    const trade = tradePolicy7(input.traits, input.foodPm < 1000, c);
    const founding = foundingChoice7(input.traits, c);
    const houseEntryFee = npcHouseEntryFee7(input.traits, {
      feeMax: society.house.npcEntryFeeMax,
      grantMax: society.house.npcEntryGrantMax,
    });
    const vaultReturnPm = npcRulingVaultReturnPm7(input.traits, {
      minPm: society.house.npcVaultReturnMinPm,
      maxPm: society.house.npcVaultReturnMaxPm,
    });
    return {
      chosen,
      decisionTempPm: ai.decisionTempPm,
      actions: explained,
      policies: {
        sellPct: Number(trade.sellPct),
        bidPct: Number(trade.bidPct),
        spendDivisor: Number(trade.spendDivisor),
        effectiveReservePm: effectiveReservePm(input.traits.boldness, c),
        effectiveAttackRatioPm: effectiveAttackRatioPm(input.traits.boldness, c),
        founding,
        houseEntryFee,
        vaultReturnPm,
      },
    };
  }),
});
