// 계산식 기본 식 = 바꾸기 전 코드(docs/adr/2026-11-01-formula-editor.md "같은 결과 증명"). 바꾸기 전 공식을 여기 그대로 옮겨 두고
// 무작위 입력에서 식 결과와 견준다. 맨손 일반 공격만 옛 프로젝트 규칙으로 바꿨다(D-488): 그 값은 따로 본다.
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
  resolveAttack,
  weaponScaled,
} from "./formula.ts";
import {
  DEFAULT_COMBAT_FORMULA_SET,
  attackIntervalMs,
  bareAttackValue,
  combatFormulaSetFrom,
  critMultiplierPm,
  evadeChancePm,
  frameValue,
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
function oldInterval(intervalMs: number, speed: number, appropriate: number): number {
  const ratio = Math.min(2000, Math.floor((Math.max(1, speed) * 1000) / Math.max(1, appropriate)));
  return Math.max(1, Math.floor((intervalMs * 1000) / Math.max(1, ratio)));
}
const oldCritMul = (critMulPm: number, pos: number): number =>
  Math.max(0, critMulPm) + Math.floor((c.critSpreadPm * pos) / 10_000);

/** 기본 회피 = 2차 스탯 회피 행(확률 모양: 850 × AGI ÷ (AGI + 250)) — 판정과 같은 computeSecondary로 셈한다 */
const evadeOf = (agi: number): number =>
  computeSecondary({ str: 0, dex: 0, agi, vit: 0, int: 0, wis: 0 }, TEST_STAT_TABLE)["evade"] ?? 0;

describe("기본 식 = 바꾸기 전 공식(무작위 입력)", () => {
  it("무기 틀(실제 공격력·명중·크리)", () => {
    for (let round = 0; round < 3000; round++) {
      const weapon = int(round % 3 === 0 ? 2000 : 1_000_000);
      const stat = int(round % 5 === 0 ? 50 : 10_000_000) - (round % 7 === 0 ? 30 : 0);
      const appropriate = int(round % 11 === 0 ? 3 : 10_000_000);
      const cap = round % 2 === 0 ? 2000 : int(5000);
      for (const id of ["real_attack", "real_hit", "real_crit"] as const)
        expect(frameValue(id, weapon, stat, appropriate, cap, c)).toBe(
          weaponScaled(weapon, stat, appropriate, cap),
        );
    }
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

  it("공격 간격", () => {
    for (let round = 0; round < 3000; round++) {
      const interval = 100 + int(60_000);
      const speed = int(round % 3 === 0 ? 300 : 10_000_000) - (round % 17 === 0 ? 5 : 0);
      const appropriate = int(round % 5 === 0 ? 3 : 10_000_000);
      expect(attackIntervalMs(interval, speed, appropriate, c)).toBe(
        oldInterval(interval, speed, appropriate),
      );
    }
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
        real_attack: "2 * if(A <= 0, W, floor(W * min(CAP, max(0, S) / A)))",
      }),
    };
    expect(frameValue("real_attack", 20, 40, 40, 2000, doubled)).toBe(40);
    expect(frameValue("real_attack", 20, 40, 40, 2000, c)).toBe(20);
  });
});

/** 1차 10에서 K 1로 자란 값(D-417) */
const grown = (level: number) => Math.floor((10 * (1000 + 100 * (level - 1))) / 1000);

/** 옛 프로젝트 맨손 규칙(AntiGravt01 terra-server/combat/formulas.js calcUnarmedDamage) — 실수 셈이라 근사로 견준다 */
function oldUnarmed(str: number, dex: number, level: number, t: number): number {
  const optDex = level * 1.5 + 10;
  const ratio = dex / optDex;
  const maxDmg = str * Math.min(1.5, ratio);
  const minDmg = str * Math.max(0.1, ratio * 0.5);
  const lo = Math.min(minDmg, maxDmg);
  const hi = Math.max(minDmg, maxDmg);
  return Math.max(1, lo + t * (hi - lo));
}

describe("맨손 일반 공격(D-488: 10 상한 없음, 적정 DEX = 레벨 × 1.5 + 10)", () => {
  const frame = { weapon: 5, stat: 0, appropriate: 20, capPm: 2000 };

  it("모두 10 Lv 1 → 4~8, 모두 39 Lv 30 → 13~27(옛 규칙과 소수점 아래만 다르다)", () => {
    expect(bareAttackValue([10, 10, 10, 10, 10, 10], 1, frame, 0, c)).toBe(4);
    expect(bareAttackValue([10, 10, 10, 10, 10, 10], 1, frame, 9999, c)).toBe(8);
    expect(bareAttackValue([39, 39, 39, 39, 39, 39], 30, frame, 0, c)).toBe(13);
    expect(bareAttackValue([39, 39, 39, 39, 39, 39], 30, frame, 9999, c)).toBe(27);
    for (let round = 0; round < 2000; round++) {
      const str = int(500);
      const dex = int(500);
      const level = 1 + int(60);
      const roll = int(10_000);
      const value = bareAttackValue([str, dex, 0, 0, 0, 0], level, frame, roll, c);
      // 고정 소수점(소수 셋째 자리 내림)이라 옛 실수 값의 내림과 1 이내
      expect(Math.abs(value - Math.floor(oldUnarmed(str, dex, level, roll / 10_000)))).toBeLessThanOrEqual(1);
    }
  });

  it("STR이 오르면 10을 넘어 계속 오른다", () => {
    expect(bareAttackValue([100, 30, 0, 0, 0, 0], 10, frame, 5000, c)).toBeGreaterThan(10);
    const levels = [1, 5, 10, 20, 30].map((level) =>
      bareAttackValue(
        Array.from({ length: 6 }, () => grown(level)),
        level,
        frame,
        5000,
        c,
      ),
    );
    for (let i = 1; i < levels.length; i++) expect(levels[i] ?? 0).toBeGreaterThan(levels[i - 1] ?? 0);
  });

  it("맨손 사양은 기본 공격에만 붙고, 스킬 사양·크리쳐 발톱은 무기 틀 그대로", () => {
    const primaries = { str: 39, dex: 39, agi: 39, vit: 39, int: 39, wis: 39 };
    const out = loadoutOf({
      base: primaries,
      slots: [],
      equipped: [],
      table: TEST_STAT_TABLE,
      unarmed: UNARMED,
    });
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: out.stats,
      weapon: out.weapon,
      naturalWeapon: UNARMED,
      primaries,
      level: 30,
      moveIntervalMs: 1000,
    });
    expect(spec.attack.unarmed).toBe(true);
    expect(spec.attack.level).toBe(30);
    expect(spec.skillAttack?.physical.unarmed).toBeUndefined();
    expect(realAttackOf(spec.attack, 9999, 2000, c)).toBe(27);
    // 바꾸기 전: 5 × min(2, 물리 공격력 ÷ 20) = 10에서 멈춤
    expect(weaponScaled(5, out.stats.physical_attack ?? 0, 20)).toBe(10);
    const creature = TEST_COMBAT_CATALOG.unitKinds.find((kind) => kind.id === "creature");
    expect(creature?.naturalWeapon.unarmed).toBeUndefined();
  });

  it("맨손 공격만 피해 자리 굴림을 쓴다(무기 공격은 굴림 넷 그대로)", () => {
    const primaries = { str: 39, dex: 39, agi: 39, vit: 39, int: 39, wis: 39 };
    const out = loadoutOf({
      base: primaries,
      slots: [],
      equipped: [],
      table: TEST_STAT_TABLE,
      unarmed: UNARMED,
    });
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: out.stats,
      weapon: out.weapon,
      primaries,
      level: 30,
      moveIntervalMs: 1000,
    });
    const defense = { ...spec.defense, defenseRatePm: 0, evadePm: 0, agi: 39 };
    const low = resolveAttack(
      spec.attack,
      defense,
      { hit: 0, evade: 9999, crit: 9999, critPos: 0, damagePos: 0 },
      c,
    );
    const high = resolveAttack(
      spec.attack,
      defense,
      { hit: 0, evade: 9999, crit: 9999, critPos: 0, damagePos: 9999 },
      c,
    );
    expect(low.physical).toBe(13);
    expect(high.physical).toBe(27);
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
