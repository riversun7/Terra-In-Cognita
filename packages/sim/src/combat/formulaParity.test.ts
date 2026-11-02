// 계산식 기본 식 = 코드 모양(docs/adr/2026-11-01-formula-editor.md "같은 결과 증명"). 공식을 여기·formula.ts에 코드로 적어 두고
// 무작위 입력에서 식 결과와 견준다. 공격력·명중·크리·공격 간격은 D-502(사용자 답 296~298)의 모양이다: 스탯 공격력 + 무기 몫,
// 무기 값 × min(N10, 1차 ÷ 적정), 적정은 밀리점(맨손 Lv 1 = 11.5), 적정이 없으면 100%.
// 최종 회피는 1%~85% 범위를 더했다(사용자 답 277, 옛 기획 회피율 §6): 바꾸기 전 공식 + 범위(evadeFinalPm)와 견주고, 옛 기획 매칭 표도 본다.
import {
  COMBAT_FORMULA_IDS,
  DEFAULT_COMBAT_FORMULAS,
  compileFormulaOrThrow,
  statRowExpression,
  STAT_FORMULA_VARS,
} from "@terra/shared/formula";
import { describe, expect, it } from "vitest";
import { createRng } from "@terra/shared";
import { TEST_COMBAT_CATALOG, UNARMED } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS, staminaCostMilli, staminaScore } from "./coefficients.ts";
import { loadoutOf } from "./equipment.ts";
import {
  EVADE_FINAL_MAX_PM,
  EVADE_FINAL_MIN_PM,
  evadeFinalPm,
  evadeRelativePm,
  realAttackOf,
  realHitPm,
  statPlusWeapon,
  weaponRatioPm,
  weaponScaled,
} from "./formula.ts";
import {
  DEFAULT_COMBAT_FORMULA_SET,
  attackIntervalMs,
  attackValue,
  bareAppropriateMilli,
  combatFormulaSetFrom,
  critMultiplierPm,
  dexFrameValue,
  evadeChancePm,
} from "./formulas.ts";
import { type StatRow, TEST_STAT_TABLE, computeSecondary } from "./stats.ts";
import { specFromStats } from "./unitSpec.ts";

const c = TEST_COMBAT_COEFFICIENTS;
const rng = createRng(20_261_101);
const int = (max: number) => rng.nextInt(max);

// ── 바꾸기 전 공식(main 27b25cd formula.ts·unitSpec.ts·coefficients.ts 그대로) ──
function oldStaminaScore(primaries: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += (primaries[i] ?? 0) * (c.stamina.scoreWeightsPm[i] ?? 0);
  return Math.floor(sum / 1000);
}
function oldStaminaCostMilli(baseCost: number, score: number): number {
  const factor =
    score <= 0
      ? c.stamina.appropriateScore * 1000
      : Math.max(c.stamina.minConsumePm, Math.floor((c.stamina.appropriateScore * 1000) / score));
  return baseCost * factor;
}
/** 공격 간격(D-502 사용자 답 297): 무기 간격 ÷ min(N10, AGI ÷ 적정 AGI). 적정(밀리점)이 없으면 무기 간격 그대로 */
function ruleInterval(intervalMs: number, agi: number, appropriateMilli: number): number {
  if (appropriateMilli <= 0) return intervalMs;
  const ratio = weaponRatioPm(agi, appropriateMilli, c.appropriateCapPm);
  return Math.max(1, Math.floor((intervalMs * 1000) / Math.max(1, ratio)));
}
const oldCritMul = (critMulPm: number, pos: number): number =>
  Math.max(0, critMulPm) + Math.floor((c.critSpreadPm * pos) / 10_000);

/** 기본 회피 = 2차 스탯 회피 행(확률 모양: 850 × AGI ÷ (AGI + 250)) — 판정과 같은 computeSecondary로 셈한다 */
const evadeOf = (agi: number): number =>
  computeSecondary({ str: 0, dex: 0, agi, vit: 0, int: 0, wis: 0 }, TEST_STAT_TABLE)["evade"] ?? 0;

describe("기본 식 = 바꾸기 전 공식(무작위 입력)", () => {
  it("공격력 = 스탯 공격력 + 무기 몫, 명중·크리 = 무기 값 × 비율(D-502, 적정은 밀리점)", () => {
    for (let round = 0; round < 3000; round++) {
      const weapon = int(round % 3 === 0 ? 2000 : 1_000_000);
      const stat = int(round % 5 === 0 ? 50 : 10_000_000) - (round % 7 === 0 ? 30 : 0);
      const primary = int(round % 5 === 0 ? 50 : 10_000_000) - (round % 9 === 0 ? 30 : 0);
      // 적정(밀리점): 정수 적정 × 1000, 소수 적정(맨손 11.5 등), 없음(0)
      const appropriate =
        round % 13 === 0 ? 0 : round % 4 === 0 ? 1000 * (1 + int(3000)) : 1 + int(4_000_000_000);
      const cap = round % 2 === 0 ? 1000 : int(5000);
      expect(attackValue(stat, weapon, primary, appropriate, cap, c)).toBe(
        statPlusWeapon(stat, weapon, primary, appropriate, cap),
      );
      for (const id of ["real_hit", "real_crit"] as const)
        expect(dexFrameValue(id, weapon, primary, appropriate, cap, c)).toBe(
          weaponScaled(weapon, primary, appropriate, cap),
        );
    }
  });

  it("맨손 적정 DEX·AGI = 레벨 × 1.5 + 10(밀리점, Lv 1 = 11.5)", () => {
    expect(bareAppropriateMilli(1, c)).toBe(11_500);
    expect(bareAppropriateMilli(30, c)).toBe(55_000);
    for (let level = 1; level <= 200; level++)
      expect(bareAppropriateMilli(level, c)).toBe((3 * level + 20) * 500);
  });

  it("최종 회피(상대 보정 N11 + 범위 1%~85%)", () => {
    let low = 0;
    let high = 0;
    for (let round = 0; round < 3000; round++) {
      const evade = int(1000);
      const defender = int(round % 4 === 0 ? 5 : 100_000) - (round % 9 === 0 ? 3 : 0);
      const attacker = int(round % 6 === 0 ? 3 : 100_000) - (round % 13 === 0 ? 2 : 0);
      const before = evade + evadeRelativePm(defender, attacker, c);
      const final = evadeChancePm(evade, defender, attacker, c);
      expect(final).toBe(evadeFinalPm(evade, defender, attacker, c));
      expect(final).toBe(Math.min(EVADE_FINAL_MAX_PM, Math.max(EVADE_FINAL_MIN_PM, before)));
      if (before < EVADE_FINAL_MIN_PM) low++;
      if (before > EVADE_FINAL_MAX_PM) high++;
    }
    // 무작위 입력이 두 끝을 모두 지난다(범위가 실제로 걸린다)
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
  });

  it("최종 회피 = 옛 기획 매칭 표(Lv60 K=1.0, 회피율 §6, 반올림 ±1%p)", () => {
    const agis = [35, 69, 104, 138, 162] as const;
    // 행 = 방어 AGI, 열 = 공격 AGI, 값 = 옛 기획 표의 %
    const table: readonly (readonly number[])[] = [
      [10, 1, 1, 1, 1],
      [48, 18, 5, 1, 1],
      [65, 40, 25, 15, 8],
      [70, 60, 40, 30, 25],
      [73, 73, 50, 39, 33],
    ];
    agis.forEach((defender, row) => {
      agis.forEach((attacker, column) => {
        const pm = evadeChancePm(evadeOf(defender), defender, attacker, c);
        const doc = table[row]?.[column] ?? Number.NaN;
        // 옛 표의 방어 104 ÷ 공격 162 칸(8%)은 그 문서 자신의 공식(25.0% − 14.3% = 10.7%)과 맞지 않는다 → 공식 값으로 본다
        const expected = defender === 104 && attacker === 162 ? 10.7 : doc;
        expect(
          Math.abs(pm / 10 - expected),
          `방어 ${defender} ÷ 공격 ${attacker}: ${pm}‰`,
        ).toBeLessThanOrEqual(1);
      });
    });
    // 사용자가 짚은 칸: 같은 AGI 차이라도 높은 AGI끼리는 기본 회피가 높다(대각선), 끝은 1%·85%에서 멈춘다
    expect(evadeChancePm(evadeOf(69), 69, 35, c)).toBe(474);
    expect(evadeChancePm(evadeOf(35), 35, 69, c)).toBe(EVADE_FINAL_MIN_PM);
    expect(evadeChancePm(evadeOf(162), 162, 35, c)).toBe(734);
    expect(evadeChancePm(850, 10_000, 1, c)).toBe(EVADE_FINAL_MAX_PM);
  });

  it("크리 배율(N12)", () => {
    for (let round = 0; round < 3000; round++) {
      const mul = int(100_000) - 1000;
      const pos = int(10_000);
      expect(critMultiplierPm(mul, pos, c)).toBe(oldCritMul(mul, pos));
    }
  });

  it("공격 간격(D-502: 무기 간격 ÷ min(N10, AGI ÷ 적정 AGI), 적정 미만이면 느려짐)", () => {
    for (let round = 0; round < 3000; round++) {
      const interval = 100 + int(60_000);
      const agi = int(round % 3 === 0 ? 300 : 10_000_000) - (round % 17 === 0 ? 5 : 0);
      const appropriate = round % 7 === 0 ? 0 : round % 5 === 0 ? 1 + int(3000) : 1000 * (1 + int(10_000));
      expect(attackIntervalMs(interval, agi, appropriate, c)).toBe(ruleInterval(interval, agi, appropriate));
    }
    // 예: 간격 1000ms, 적정 AGI 12 → AGI 10이면 1000 ÷ 0.833 = 1200ms, AGI 39면 1000ms(넘는 보너스 없음)
    expect(attackIntervalMs(1000, 10, 12_000, c)).toBe(1200);
    expect(attackIntervalMs(1000, 39, 12_000, c)).toBe(1000);
  });

  it("STA 점수·스태미나 소모(N13)", () => {
    for (let round = 0; round < 3000; round++) {
      const primaries = Array.from({ length: 6 }, () => int(round % 4 === 0 ? 20 : 1_000_000));
      expect(staminaScore(primaries, c)).toBe(oldStaminaScore(primaries));
      const base = int(round % 3 === 0 ? 20 : 100_000);
      const score = int(round % 5 === 0 ? 3 : 1_000_000) - (round % 7 === 0 ? 2 : 0);
      expect(staminaCostMilli(base, score, c)).toBe(oldStaminaCostMilli(base, score));
    }
  });

  it("2차 스탯: 모든 행을 가중치에서 만든 식으로 바꿔도 같다", () => {
    const vars = STAT_FORMULA_VARS.map((item) => item.name);
    const formulaTable: StatRow[] = TEST_STAT_TABLE.map((row) => ({
      ...row,
      formula: compileFormulaOrThrow(statRowExpression(row), vars),
    }));
    for (let round = 0; round < 2000; round++) {
      const p = Array.from({ length: 6 }, () => int(round % 3 === 0 ? 100 : 1_000_000));
      const primaries = {
        str: p[0] ?? 0,
        dex: p[1] ?? 0,
        agi: p[2] ?? 0,
        vit: p[3] ?? 0,
        int: p[4] ?? 0,
        wis: p[5] ?? 0,
      };
      const gear = Object.fromEntries(TEST_STAT_TABLE.map((row) => [row.id, int(500) - 100]));
      const buffs = Object.fromEntries(TEST_STAT_TABLE.map((row) => [row.id, int(300) - 50]));
      expect(computeSecondary(primaries, formulaTable, gear, buffs)).toEqual(
        computeSecondary(primaries, TEST_STAT_TABLE, gear, buffs),
      );
    }
  });

  it("팩 글과 같은 식이면 기본 묶음을 그대로 쓴다", () => {
    const set = combatFormulaSetFrom(DEFAULT_COMBAT_FORMULAS);
    for (const id of COMBAT_FORMULA_IDS) expect(set[id]).toBe(DEFAULT_COMBAT_FORMULA_SET[id]);
  });

  it("고친 식이 판정에 든다(실제 공격력 2배)", () => {
    const doubled = {
      ...c,
      formulas: combatFormulaSetFrom({
        real_attack: "2 * (S + if(A <= 0, W, floor(W * min(CAP, max(0, P) / A))))",
      }),
    };
    expect(attackValue(10, 20, 25, 25_000, 1000, doubled)).toBe(60);
    expect(attackValue(10, 20, 25, 25_000, 1000, c)).toBe(30);
  });
});

/** 맨손 유닛 사양(1차 모두 v, 레벨 level) */
function bareSpec(v: number, level: number) {
  const primaries = { str: v, dex: v, agi: v, vit: v, int: v, wis: v };
  const out = loadoutOf({
    base: primaries,
    slots: [],
    equipped: [],
    table: TEST_STAT_TABLE,
    unarmed: UNARMED,
  });
  return specFromStats({
    id: 1,
    side: 1,
    party: 1,
    x: 0,
    y: 0,
    stats: out.stats,
    weapon: out.weapon,
    naturalWeapon: UNARMED,
    primaries,
    level,
    moveIntervalMs: 1000,
  });
}

describe("맨손(D-502: 무기 몫 0, 적정 DEX·AGI = 레벨 × 1.5 + 10, 사용자 답 297)", () => {
  it("새 사이보그(1차 모두 10, Lv 1): 공격력 10(스탯만), 명중 850 × 10 ÷ 11.5 = 738‰, 크리 50 × 0.869 = 43‰, 간격 1150ms", () => {
    const spec = bareSpec(10, 1);
    expect(spec.attack.statAttack).toBe(10);
    expect(spec.attack.weaponAttack).toBe(0);
    expect(spec.attack.dexAppropriateMilli).toBe(11_500);
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(10);
    expect(realHitPm(spec.attack, c)).toBe(738);
    expect(dexFrameValue("real_crit", 50, 10, 11_500, 1000, c)).toBe(43);
    expect(spec.attackIntervalMs).toBe(1150);
  });

  it("Lv 30 균형형(39): 공격력 39, 적정 55라 명중 850 × 39 ÷ 55 = 602‰, 스킬 사양도 무기 몫 0", () => {
    const spec = bareSpec(39, 30);
    expect(realAttackOf(spec.attack, c.appropriateCapPm, c)).toBe(39);
    expect(realHitPm(spec.attack, c)).toBe(602);
    expect(spec.skillAttack?.physical.weaponAttack).toBe(0);
    // 크리쳐 발톱은 맨손이 아니다(무기와 같은 공식)
    const creature = TEST_COMBAT_CATALOG.unitKinds.find((kind) => kind.id === "creature");
    expect(creature?.naturalWeapon.unarmed).toBeUndefined();
    expect(creature?.naturalWeapon.physical?.attack).toBe(12);
  });
});

describe("장비 없는 유닛도 VIT로 방어(D-488, 바꿀 것 없음 확인)", () => {
  it("크리쳐(장비 없음)의 물리 방어율·아머 HP가 VIT로 오른다", () => {
    const creature = TEST_COMBAT_CATALOG.unitKinds.find((kind) => kind.id === "creature");
    expect(creature).toBeDefined();
    const at = (vit: number) =>
      loadoutOf({
        base: { str: 10, dex: 10, agi: 10, vit, int: 10, wis: 10 },
        slots: creature?.slots ?? [],
        equipped: [],
        table: TEST_STAT_TABLE,
        unarmed: creature?.naturalWeapon ?? UNARMED,
      }).stats;
    expect(at(10).defense_rate).toBeGreaterThan(0);
    expect(at(40).defense_rate).toBeGreaterThan(at(10).defense_rate ?? 0);
    expect(at(40).armor_hp).toBe((at(10).armor_hp ?? 0) + 30);
    expect(at(40).elemental_defense_rate).toBeGreaterThan(at(10).elemental_defense_rate ?? 0);
  });
});
