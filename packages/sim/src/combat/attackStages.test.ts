import { describe, expect, it } from "vitest";
import type { AttackStages } from "./attackStages.ts";
import { newAttackStages } from "./attackStages.ts";
import { runBattle } from "./battle.ts";
import type { BattleTrace } from "./battleTrace.ts";
import type { BattleInit } from "./battleTypes.ts";
import { TEST_COMBAT_CATALOG, skillsOf } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { resolveAttack } from "./formula.ts";
import { duel } from "./testBattle.ts";

/** 불꽃 화살을 든 3 대 3(기본 공격·속성 스킬 단계가 다 나온다) */
function skilled(seed: number): BattleInit {
  const base = duel(3, seed);
  const skills = skillsOf(TEST_COMBAT_CATALOG, ["fire_bolt", "first_aid"]);
  return {
    ...base,
    units: base.units.map((spec) => ({
      ...spec,
      mpMax: 200,
      mpRegen: 600,
      skillAttack: { physical: spec.attack, elemental: { ...spec.attack, kind: "elemental" as const } },
      skills,
    })),
  };
}

const none = (): void => undefined;

/** 단계만 모으는 관찰자(나머지 칸은 비움) */
function stageTrace(out: { stages: AttackStages; hp: number; armor: number; shield: number }[]): BattleTrace {
  return {
    attack: none,
    building: none,
    skill: none,
    skillHit: none,
    heal: none,
    dot: none,
    attackStages(_attacker, target, stages) {
      out.push({ stages: { ...stages }, hp: target.hp, armor: target.armor, shield: target.shield });
    },
  };
}

describe("공격 단계 기록(전투 보고서 피해 흐름)", () => {
  it("단계 기록을 켜도 결과·끝 상태가 바이트까지 같다", () => {
    for (const seed of [1, 2, 3, 4]) {
      const plain = runBattle(skilled(seed), []);
      const out: { stages: AttackStages; hp: number; armor: number; shield: number }[] = [];
      const watched = runBattle(skilled(seed), [], undefined, TEST_COMBAT_COEFFICIENTS, stageTrace(out));
      expect(watched.result).toEqual(plain.result);
      expect(watched.finalState).toBe(plain.finalState);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("단계 값이 판정 차례대로 이어지고 끝 값이 판정 값과 같다", () => {
    const out: { stages: AttackStages; hp: number; armor: number; shield: number }[] = [];
    runBattle(skilled(7), [], undefined, TEST_COMBAT_COEFFICIENTS, stageTrace(out));
    const hits = out.filter((row) => row.stages.outcome === "hit");
    expect(hits.length).toBeGreaterThan(0);
    expect(out.some((row) => row.stages.source === "skill")).toBe(true);
    for (const { stages } of hits) {
      // 명중·회피 굴림은 확률 안쪽
      expect(stages.hitRoll).toBeLessThan(stages.hitPm * 10);
      expect(stages.evadeRoll).toBeGreaterThanOrEqual(stages.evadePm * 10);
      expect(stages.evadePm).toBeGreaterThanOrEqual(10);
      expect(stages.evadePm).toBeLessThanOrEqual(850);
      // 방어는 줄이기만 한다
      expect(stages.physicalAfterRate).toBeLessThanOrEqual(stages.physicalRaw);
      expect(stages.physicalAfterFlat).toBeLessThanOrEqual(stages.physicalAfterRate);
      // 끝 값 = 버프 뒤(물리 최소 1)
      const floor = stages.kind === "physical" && stages.physicalAfterBuff < 1 ? 1 : stages.physicalAfterBuff;
      expect(stages.physical).toBe(floor);
      expect(stages.elemental).toBe(stages.elementalAfterBuff);
      expect(stages.floored).toBe(stages.kind === "physical" && stages.physicalAfterBuff < 1);
      // 반영: 아머 + 쉴드 + HP + 넘침 = 들어간 피해(스킬 고정 피해 포함)
      expect(stages.toArmor + stages.toShield + stages.toHp + stages.overkill).toBe(
        stages.physical + stages.elemental + stages.flat,
      );
    }
  });

  it("빗나감·회피는 굴림에서 멈춘다(뒤 칸 0), 기록 칸 유무와 판정 값이 같다", () => {
    const attack = {
      kind: "physical" as const,
      statAttack: 40,
      weaponAttack: 20,
      attackPrimary: 30,
      attackAppropriateMilli: 30_000,
      weaponHitPm: 800,
      weaponCritPm: 200,
      dex: 30,
      dexAppropriateMilli: 30_000,
      critMulPm: 1500,
      agi: 20,
      penetrationPm: 50,
      skillMulPm: 1000,
      buffPm: 1000,
      elements: Array.from({ length: 12 }, () => 0),
      skillElementsPm: Array.from({ length: 12 }, () => 0),
    };
    const defense = {
      defenseRatePm: 200,
      defenseFlat: 5,
      elementalDefenseRatePm: 100,
      evadePm: 100,
      agi: 20,
      elements: Array.from({ length: 12 }, () => 0),
      resistPm: Array.from({ length: 12 }, () => 0),
    };
    for (const rolls of [
      { hit: 9999, evade: 0, crit: 0, critPos: 0 },
      { hit: 0, evade: 0, crit: 0, critPos: 0 },
      { hit: 0, evade: 9999, crit: 0, critPos: 5000 },
      { hit: 0, evade: 9999, crit: 9999, critPos: 0 },
    ]) {
      const stages = newAttackStages("attack");
      const plain = resolveAttack(attack, defense, rolls, TEST_COMBAT_COEFFICIENTS);
      const recorded = resolveAttack(attack, defense, rolls, TEST_COMBAT_COEFFICIENTS, stages);
      expect(recorded).toEqual(plain);
      expect(stages.outcome).toBe(plain.outcome);
      if (plain.outcome !== "hit") expect(stages.realAttack).toBe(0);
      else {
        expect(stages.crit).toBe(plain.crit);
        expect(stages.physical).toBe(plain.physical);
        expect(stages.ratePm).toBe(150);
      }
    }
  });
});
