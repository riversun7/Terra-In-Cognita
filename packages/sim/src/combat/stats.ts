// 스탯 계산기 — docs/adr/2026-10-31-combat-core.md "스탯", 기획 D-414(2차 스탯은 저장하지 않고 계산)·D-416·D-417(성장)
// 서버·시뮬레이터·(나중의) 개발자 페이지 스탯 시뮬레이터가 같은 순수 함수를 쓴다.
// - 유닛이 저장하는 것: 1차 스탯 6개(초기값·K)·레벨·장비·버프. 2차 스탯은 가중치 표 하나로 계산한다.
// - 가중치 표: 행(2차 스탯 17개 D-458 + 활동 수치) × 1차 6열(STR·DEX·AGI·VIT·INT·WIS), 정수 ‰. 행마다 모양 하나.
//   양: 기본 + Σ(1차 × 가중치‰) ÷ 1000 + 장비 + 버프 / 확률: 상한 × 점수 ÷ (점수 + 반감 상수), 점수 = Σ(…) ÷ 1000 + 장비 + 버프.
// - 게임 상한은 없다(D-421). 확률 모양이 저절로 상한(점근선)을 넘지 않는다. 정수 넘침은 입력 범위로 막는다(아래 상수).
// - 안드로이드(D-416)는 레벨·K 없이 1차 = 몸체 + 부품 합을 그대로 넘긴다(같은 표·같은 함수).
// 원본 표는 콘텐츠 팩 `stat_rows`(임시)이고, 시험·기본값은 TEST_STAT_TABLE(같은 값)이다.
// - 행 식(docs/adr/2026-11-01-formula-editor.md): 행에 formula(개발자 모드에서 고친 계산식, 팩 stat_rows formula 또는 그 세계의
//   덮어쓰기)가 있으면 가중치 대신 그 식으로 셈한다(변수 = 1차 6개·레벨·그 행의 장비·버프, 결과는 내림한 정수). 식이 없는 행은
//   가중치 그대로이고, 가중치에서 만든 식(@terra/shared statRowExpression)은 이 계산과 같은 값을 낸다(stats.test.ts).
import {
  type FormulaProgram,
  type FormulaTerm,
  evaluateFormulaInt,
  explainFormula,
  statRowScope,
} from "@terra/shared/formula";

export interface Primaries {
  readonly str: number;
  readonly dex: number;
  readonly agi: number;
  readonly vit: number;
  readonly int: number;
  readonly wis: number;
}

export type StatRow =
  | {
      readonly id: string;
      readonly shape: "quantity";
      readonly base: number;
      readonly weights: readonly number[];
      /** 행 식(있으면 가중치·기본 대신 이 식) */
      readonly formula?: FormulaProgram | undefined;
    }
  | {
      readonly id: string;
      readonly shape: "probability";
      /** 점근선(‰) */
      readonly cap: number;
      readonly halfConstant: number;
      readonly weights: readonly number[];
      readonly formula?: FormulaProgram | undefined;
    };

/** 입력 범위(넘침 방지): 1차 스탯·장비·버프 값은 이 안이어야 한다(가장 큰 곱 = 10^7 × 10^5 × 6 < 2^53) */
export const MAX_STAT_INPUT = 10_000_000;
export const MAX_WEIGHT_PM = 100_000;

/** 1차 스탯 성장(D-417): 초기 × (1000 + 성장률‰ × K‰ × (Lv − 1) ÷ 1000) ÷ 1000 */
export function primaryAtLevel(initial: number, growthPm: number, kPm: number, level: number): number {
  const factor = 1000 + Math.floor((growthPm * kPm * (level - 1)) / 1000);
  return Math.floor((initial * factor) / 1000);
}

function check(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < -MAX_STAT_INPUT || value > MAX_STAT_INPUT)
    throw new RangeError(`${label} out of range: ${value}`);
}

/** 행 식의 값(변수 = 1차 6개·레벨·그 행의 장비·버프) */
function formulaValue(
  program: FormulaProgram,
  p: readonly number[],
  level: number,
  gear: number,
  buff: number,
): number {
  return evaluateFormulaInt(program, statRowScope(p, level, gear, buff));
}

/** 2차 스탯과 활동 수치(행 ID → 값). gear·buffs는 행 ID → 더하는 값. level은 행 식의 LV(없으면 1) */
export function computeSecondary(
  primaries: Primaries,
  table: readonly StatRow[],
  gear: Readonly<Record<string, number>> = {},
  buffs: Readonly<Record<string, number>> = {},
  level = 1,
): Record<string, number> {
  const p = [primaries.str, primaries.dex, primaries.agi, primaries.vit, primaries.int, primaries.wis];
  for (const value of p) check(value, "primary");
  const out: Record<string, number> = {};
  for (const row of table) {
    if (row.formula) {
      out[row.id] = formulaValue(row.formula, p, level, gear[row.id] ?? 0, buffs[row.id] ?? 0);
      continue;
    }
    let weighted = 0;
    for (let i = 0; i < 6; i++) {
      const weight = row.weights[i] ?? 0;
      if (weight < -MAX_WEIGHT_PM || weight > MAX_WEIGHT_PM)
        throw new RangeError(`weight out of range in ${row.id}`);
      weighted += (p[i] ?? 0) * weight;
    }
    // 양 모양 = 기본 + 가중합 + 장비 + 버프, 확률 모양 점수 = 가중합 + 장비(버프는 넣지 않는다, 48 §3.1)
    const extra = (gear[row.id] ?? 0) + (row.shape === "quantity" ? (buffs[row.id] ?? 0) : 0);
    check(extra, `gear+buff ${row.id}`);
    const score = Math.floor(weighted / 1000) + extra;
    if (row.shape === "quantity") out[row.id] = row.base + score;
    else out[row.id] = score <= 0 ? 0 : Math.floor((row.cap * score) / (score + row.halfConstant));
  }
  return out;
}

/** 풀이의 한 항: 가중치 칸 번호(0~5 = STR·DEX·AGI·VIT·INT·WIS), 1차 스탯 값, 가중치‰, 곱(÷ 1000 전) */
export interface SecondaryTerm {
  readonly index: number;
  readonly value: number;
  readonly weightPm: number;
  readonly milli: number;
}

/** 2차 스탯 한 줄의 풀이. value는 computeSecondary의 같은 행 값과 늘 같다(stats.test.ts가 본다) */
export interface SecondaryExplanation {
  readonly id: string;
  readonly shape: StatRow["shape"];
  /** 양 모양의 기본(확률 모양은 0) */
  readonly base: number;
  /** 가중치가 0이 아닌 항만, 칸 번호 차례 */
  readonly terms: readonly SecondaryTerm[];
  /** ⌊Σ 곱 ÷ 1000⌋ */
  readonly weighted: number;
  /** 장비 + (양 모양이면) 버프 */
  readonly extra: number;
  /** weighted + extra */
  readonly score: number;
  readonly cap: number | null;
  readonly halfConstant: number | null;
  readonly value: number;
  /** 행 식으로 셈한 행: 식 글과 결과 식의 항(이때 terms는 비고 weighted = value − extra) */
  readonly formula?: { readonly source: string; readonly terms: readonly FormulaTerm[] } | undefined;
}

/**
 * 2차 스탯의 풀이(화면의 "공식·입력·결과" 펼침, 나중의 개발자 페이지 스탯 시뮬레이터). 판정은 computeSecondary를 쓴다.
 * 같은 식이라 결과가 같아야 한다: 식을 바꾸면 두 함수를 함께 고친다(시험이 무작위 입력으로 같은지 본다).
 */
export function explainSecondary(
  primaries: Primaries,
  table: readonly StatRow[],
  gear: Readonly<Record<string, number>> = {},
  buffs: Readonly<Record<string, number>> = {},
  level = 1,
): SecondaryExplanation[] {
  const p = [primaries.str, primaries.dex, primaries.agi, primaries.vit, primaries.int, primaries.wis];
  for (const value of p) check(value, "primary");
  return table.map((row): SecondaryExplanation => {
    if (row.formula) {
      const extra = (gear[row.id] ?? 0) + (buffs[row.id] ?? 0);
      const value = formulaValue(row.formula, p, level, gear[row.id] ?? 0, buffs[row.id] ?? 0);
      const explained = explainFormula(
        row.formula,
        statRowScope(p, level, gear[row.id] ?? 0, buffs[row.id] ?? 0),
      );
      return {
        id: row.id,
        shape: row.shape,
        base: 0,
        terms: [],
        weighted: value - extra,
        extra,
        score: value,
        cap: null,
        halfConstant: null,
        value,
        formula: { source: row.formula.source, terms: explained.terms },
      };
    }
    const terms: SecondaryTerm[] = [];
    let weighted = 0;
    for (let i = 0; i < 6; i++) {
      const weight = row.weights[i] ?? 0;
      if (weight < -MAX_WEIGHT_PM || weight > MAX_WEIGHT_PM)
        throw new RangeError(`weight out of range in ${row.id}`);
      const value = p[i] ?? 0;
      weighted += value * weight;
      if (weight !== 0) terms.push({ index: i, value, weightPm: weight, milli: value * weight });
    }
    const extra = (gear[row.id] ?? 0) + (row.shape === "quantity" ? (buffs[row.id] ?? 0) : 0);
    check(extra, `gear+buff ${row.id}`);
    const score = Math.floor(weighted / 1000) + extra;
    const base = row.shape === "quantity" ? row.base : 0;
    return {
      id: row.id,
      shape: row.shape,
      base,
      terms,
      weighted: Math.floor(weighted / 1000),
      extra,
      score,
      cap: row.shape === "probability" ? row.cap : null,
      halfConstant: row.shape === "probability" ? row.halfConstant : null,
      value:
        row.shape === "quantity"
          ? row.base + score
          : score <= 0
            ? 0
            : Math.floor((row.cap * score) / (score + row.halfConstant)),
    };
  });
}

const q = (id: string, base: number, weights: readonly number[]): StatRow => ({
  id,
  shape: "quantity",
  base,
  weights,
});
const pr = (id: string, cap: number, halfConstant: number, weights: readonly number[]): StatRow => ({
  id,
  shape: "probability",
  cap,
  halfConstant,
  weights,
});

/**
 * 가중치 표(STR·DEX·AGI·VIT·INT·WIS 차례, ‰). 2차 스탯 17개(D-458) + 시야(활동 수치, D-5037). 차례는 48 §3.2 묶음 차례.
 * HP·쉴드·MP·스태미나·회피는 기획 49 N1·N3·N14 출발값. 새 네 행(N40 출발값 없음)은 설정값 출발값(D-5032, 기술):
 * 속성 방어율 = 물리 방어율과 짝(WIS·VIT를 맞바꿈), 스태미나 회복 = 적정 STA에서의 회복(D-511 적정 스탯 개념: 실제 회복 = 이 값 ×
 * min(2, STA 점수 ÷ 적정 STA), 계산식 real_stamina_regen. [임시] 분당 720 = 초당 12 — 가장 빠른 팩 무기(간격 900ms)의 기본 공격 10을
 * 적정 스탯에서 이어 칠 만큼), MP 회복 = 옛 N15 [임시](WIS 1점당 분당 3)를 WIS·INT로, 쉴드 재생 = L11 "1분에 WIS만큼".
 * 회복·재생 세 행의 단위는 분당이다.
 * 물리·속성 공격력 = (STR + VIT) ÷ 2·(INT + WIS) ÷ 2(D-502, 가중치 500‰ 둘 → ⌊(두 1차 합) ÷ 2⌋, 음의 무한대 쪽 내림). 명중·크리·
 * 공격 간격은 무기 값 × 1차(DEX·AGI) ÷ 무기 적정이라(사용자 답 297·298) 옛 점수 행(명중·크리·행동 속도 점수, D-458)은 팩에서 껐다
 * (enabled false, 이 표에 없음). 나머지 행·크리 배율의 DEX 몫은 [임시]. 확률 모양의 상한은 ‰(예: 회피 상한 850 = 85%).
 */
export const TEST_STAT_TABLE: readonly StatRow[] = [
  q("hp", 0, [1500, 1000, 1500, 3000, 1000, 1200]),
  q("armor_hp", 0, [500, 0, 0, 1000, 0, 0]),
  q("shield_hp", 0, [200, 200, 200, 200, 1000, 3000]),
  pr("defense_rate", 700, 100, [600, 0, 0, 1200, 0, 0]),
  pr("elemental_defense_rate", 700, 100, [0, 0, 0, 600, 0, 1200]),
  q("physical_attack", 0, [500, 0, 0, 500, 0, 0]),
  q("elemental_attack", 0, [0, 0, 0, 0, 500, 500]),
  pr("evade", 850, 250, [0, 0, 1000, 0, 0, 0]),
  q("crit_multiplier", 1500, [0, 10_000, 0, 0, 0, 0]),
  q("stamina", 100, [0, 0, 700, 300, 0, 0]),
  q("stamina_regen", 720, [0, 0, 0, 0, 0, 0]),
  q("mp", 0, [300, 300, 300, 300, 1500, 2000]),
  q("mp_regen", 0, [0, 0, 0, 0, 1000, 2000]),
  q("shield_regen", 0, [0, 0, 0, 0, 0, 1000]),
  q("sight", 10, [0, 0, 50, 0, 0, 100]),
];
