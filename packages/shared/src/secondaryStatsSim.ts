// 2차 스탯 에디터(/dev/secondary-stats) 전용 순수 시뮬레이션 모델 — 기기·서버 공용(결정적 정수 연산).
// 기존 @terra/shared의 primaryAtLevel(성장식)·distributePoints(초기 배분)·statRowExpression(행 수식 생성)·
// runFormulaSample(판정 동일 계산)·primaryInfluence(1차 영향력)를 그대로 조합해 계산 중복과 오차를 없앤다.
// 걷기 속도(walk_speed / D-540)는 제외 범위(다른 작업 중)다.
import type { BalancePrimaries, BalanceRowView } from "./balance.ts";
import { distributePoints } from "./balanceAnalysis.ts";
import {
  type CombatFormulaId,
  FX_SCALE,
  type FormulaCoefficients,
  type FormulaProgram,
  type FormulaSampleWeapon,
  type PrimaryInfluence,
  STAT_FORMULA_VARS,
  type StatRowShape,
  compileFormulaOrThrow,
  evaluateFormulaInt,
  isCombatFormulaId,
  parseStatFormulaKey,
  primaryInfluence,
  runFormulaSample,
  statFormulaKey,
  statRowExpression,
} from "./formula.ts";
import { PRIMARY_STATS, type PrimaryStat, RULE_STAT_ORDER } from "./roster.ts";
import { STAT_SUM_ABSOLUTE_MAX, primaryAtLevel } from "./statGrowth.ts";
import type { StatCellField } from "./tuning.ts";

/** 비교 계열 4종(물리계 · 재능계 · 지능계 · 균형형) */
export const SECONDARY_ARCHETYPE_IDS = ["physical", "talent", "magic", "balanced"] as const;
export type SecondaryArchetypeId = (typeof SECONDARY_ARCHETYPE_IDS)[number];

/** 초기 스탯 합 빠른 선택 단추(30~80·100, D-534 절대 상한 100) */
export const SECONDARY_INITIAL_SUM_PRESETS = [30, 40, 50, 60, 70, 80, 100] as const;
export const SECONDARY_INITIAL_SUM_MIN = PRIMARY_STATS.length;
export const SECONDARY_INITIAL_SUM_MAX = STAT_SUM_ABSOLUTE_MAX;

/**
 * 계열별 1차 배분 비중:
 * - 물리계: STR·VIT 중심
 * - 재능계: DEX·AGI 중심
 * - 지능계: INT·WIS 중심
 * - 균형형: 여섯 균등
 */
export const SECONDARY_ARCHETYPE_WEIGHTS: Readonly<Record<SecondaryArchetypeId, BalancePrimaries>> = {
  physical: { str: 40, vit: 35, int: 5, wis: 5, dex: 8, agi: 7 },
  talent: { str: 7, vit: 8, int: 5, wis: 5, dex: 40, agi: 35 },
  magic: { str: 5, vit: 5, int: 42, wis: 33, dex: 7, agi: 8 },
  balanced: { str: 1, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 },
};

/** 2차 스탯 카테고리 묶음(에디터 왼쪽 목록 — walk_speed 제외) */
export const SECONDARY_STAT_CATEGORIES = [
  "vitals",
  "offense",
  "defense",
  "mobility",
  "efficiency",
  "combat",
] as const;
export type SecondaryStatCategory = (typeof SECONDARY_STAT_CATEGORIES)[number];

/** 묶음별 포함 행/전투식 ID(정렬·분류용). 여기에 없는 활성 stat_row는 efficiency로 넣는다 */
export const SECONDARY_ROW_CATEGORIES: Readonly<Record<string, SecondaryStatCategory>> = {
  hp: "vitals",
  hp_regen: "vitals",
  armor_hp: "vitals",
  shield_hp: "vitals",
  shield_regen: "vitals",
  mp: "vitals",
  mp_regen: "vitals",
  stamina: "vitals",
  stamina_regen: "vitals",
  physical_attack: "offense",
  elemental_attack: "offense",
  crit_multiplier: "offense",
  defense_rate: "defense",
  elemental_defense_rate: "defense",
  evade: "defense",
  sight: "mobility",
  job_crafting: "efficiency",
};

/** 2차 스탯과 함께 보는 파생 전투식(D-540 walk_speed 제외) */
export const SECONDARY_DERIVED_COMBAT_IDS: readonly CombatFormulaId[] = [
  "real_attack",
  "real_hit",
  "real_crit",
  "crit_multiplier",
  "attack_interval",
  "evade_chance",
  "bare_hit",
  "bare_crit",
  "bare_interval",
  "stamina_score",
  "stamina_cost",
  "real_stamina_regen",
];

/** 초기 스탯 합(6~100 정수로 맞춤)과 비중 → 정수 초기 1차 스탯(합 = initialSum) */
export function archetypeInitialPrimaries(weights: BalancePrimaries, initialSum: number): BalancePrimaries {
  const clamped = Math.max(
    SECONDARY_INITIAL_SUM_MIN,
    Math.min(SECONDARY_INITIAL_SUM_MAX, Math.trunc(initialSum)),
  );
  return distributePoints(weights, clamped);
}

/** UI 차례(BalancePrimaries) → 판정·계산식 차례(STR·DEX·AGI·VIT·INT·WIS) */
export function toRuleOrderPrimaries(primaries: BalancePrimaries): readonly number[] {
  return RULE_STAT_ORDER.map((stat) => primaries[stat]);
}

/** 레벨·성장률·K에서의 1차 스탯(D-417 primaryAtLevel 그대로) */
export function growPrimaries(
  initial: BalancePrimaries,
  growthPm: number,
  kPm: number,
  level: number,
): BalancePrimaries {
  return {
    str: primaryAtLevel(initial.str, growthPm, kPm, level),
    vit: primaryAtLevel(initial.vit, growthPm, kPm, level),
    int: primaryAtLevel(initial.int, growthPm, kPm, level),
    wis: primaryAtLevel(initial.wis, growthPm, kPm, level),
    dex: primaryAtLevel(initial.dex, growthPm, kPm, level),
    agi: primaryAtLevel(initial.agi, growthPm, kPm, level),
  };
}

/** BalanceRowView 칸 map 추출(가중치·기본값·상한·반감) */
export function rowCellMap(row: Pick<BalanceRowView, "cells">): Record<StatCellField, number> {
  const out: Record<StatCellField, number> = {
    str: 0,
    dex: 0,
    agi: 0,
    vit: 0,
    int: 0,
    wis: 0,
    base: 0,
    cap: 0,
    half: 1,
  };
  for (const cell of row.cells) out[cell.field] = cell.value;
  return out;
}

/** 칸 값 → StatRowShape(RULE_STAT_ORDER 차례 가중치) */
export function rowShapeFromValues(
  shape: "quantity" | "probability",
  values: Readonly<Partial<Record<StatCellField, number>>>,
): StatRowShape {
  const weights = RULE_STAT_ORDER.map((stat) => values[stat] ?? 0);
  if (shape === "probability") {
    return {
      shape: "probability",
      cap: values.cap ?? 0,
      halfConstant: Math.max(1, values.half ?? 1),
      weights,
    };
  }
  return { shape: "quantity", base: values.base ?? 0, weights };
}

/** 가중치 칸 값 → 동일한 결과를 내는 수식 글(statRowExpression) */
export function rowExpressionFromValues(
  shape: "quantity" | "probability",
  values: Readonly<Partial<Record<StatCellField, number>>>,
): string {
  return statRowExpression(rowShapeFromValues(shape, values));
}

const STAT_VAR_NAMES = STAT_FORMULA_VARS.map((item) => item.name);

/** 가중치 값으로 2차 스탯 행 수식을 컴파일한다 */
export function compileStatRowFromValues(
  shape: "quantity" | "probability",
  values: Readonly<Partial<Record<StatCellField, number>>>,
): FormulaProgram {
  return compileFormulaOrThrow(rowExpressionFromValues(shape, values), STAT_VAR_NAMES);
}

/** 컴파일된 전체 행·전투식 프로그램 묶음 */
export interface CompiledSecondaryPrograms {
  readonly rows: readonly { readonly id: string; readonly program: FormulaProgram }[];
  readonly combat: Readonly<Record<CombatFormulaId, FormulaProgram>>;
}

/**
 * 선택한 대상 키(행 ID 또는 `<행 ID>.formula` 또는 전투식 ID)의 값(고정 소수점 밀리점) 계산.
 * 행 ID인 경우 2차 스탯 정수 × FX_SCALE(1000)을 돌려줘 combat 식 결과와 같은 단위로 비교·영향력 분석을 할 수 있다.
 */
export function evaluateTargetFixed(
  targetKey: string,
  level: number,
  primaries: BalancePrimaries,
  programs: CompiledSecondaryPrograms,
  weapon: FormulaSampleWeapon,
  coefficients: FormulaCoefficients,
  roll = 5000,
): number {
  const result = runFormulaSample(
    {
      primaries: toRuleOrderPrimaries(primaries),
      level,
      rows: programs.rows,
      weapon,
      coefficients,
      roll,
    },
    programs.combat,
  );
  if (targetKey.startsWith("combat:")) {
    const combatId = targetKey.slice("combat:".length);
    if (isCombatFormulaId(combatId)) return result.values[combatId];
  }
  const rowId = parseStatFormulaKey(targetKey) ?? targetKey;
  if (Object.hasOwn(result.stats, rowId)) return (result.stats[rowId] ?? 0) * FX_SCALE;
  if (isCombatFormulaId(targetKey)) return result.values[targetKey];
  return 0;
}

/** 1차 스탯별 영향력(UI PRIMARY_STATS 순서로 정렬) + +10 한계효율(밀리점) */
export interface OrderedPrimaryInfluence {
  readonly stat: PrimaryStat;
  readonly base: number;
  readonly contribution: number;
  readonly sharePm: number | null;
  readonly plus10: number;
  /** 식의 가중치: 1차 여섯이 모두 같은 값(equalLevel)일 때 그 1차 +10의 차이(D-556) */
  readonly equalPlus10: number;
}

/**
 * 특정 레벨·1차 스탯에서 대상 스탯/전투식에 대한 1차 스탯 6종 영향력과 +10 한계효율을 UI 차례(STR·VIT·INT·WIS·DEX·AGI)로 반환.
 */
export function secondaryPrimaryInfluence(
  targetKey: string,
  level: number,
  primaries: BalancePrimaries,
  programs: CompiledSecondaryPrograms,
  weapon: FormulaSampleWeapon,
  coefficients: FormulaCoefficients,
): {
  readonly base: number;
  readonly equalLevel: number;
  readonly items: readonly OrderedPrimaryInfluence[];
} {
  const ruleOrder: readonly number[] = toRuleOrderPrimaries(primaries);
  const raw: PrimaryInfluence = primaryInfluence((rulePrimaries) => {
    const mapped: BalancePrimaries = {
      str: rulePrimaries[0] ?? 0,
      dex: rulePrimaries[1] ?? 0,
      agi: rulePrimaries[2] ?? 0,
      vit: rulePrimaries[3] ?? 0,
      int: rulePrimaries[4] ?? 0,
      wis: rulePrimaries[5] ?? 0,
    };
    return evaluateTargetFixed(targetKey, level, mapped, programs, weapon, coefficients);
  }, ruleOrder);
  const indexByStat = new Map<PrimaryStat, number>(RULE_STAT_ORDER.map((stat, i) => [stat, i]));
  const items = PRIMARY_STATS.map((stat): OrderedPrimaryInfluence => {
    const index = indexByStat.get(stat) ?? 0;
    return {
      stat,
      base: raw.base,
      contribution: raw.contribution[index] ?? 0,
      sharePm: raw.sharePm[index] ?? null,
      plus10: raw.plus10[index] ?? 0,
      equalPlus10: raw.equalPlus10[index] ?? 0,
    };
  });
  return { base: raw.base, equalLevel: raw.equalLevel, items };
}

/** 레벨별 곡선 점 하나(표시용 실수 — 고정소수점 ÷ FX_SCALE) */
export interface LevelCurvePoint {
  readonly level: number;
  readonly primaries: BalancePrimaries;
  readonly draftValue: number;
  readonly baselineValue: number | null;
}

export interface ArchetypeLevelCurve {
  readonly id: string;
  readonly points: readonly LevelCurvePoint[];
}

export interface BuildLevelCurvesInput {
  readonly targetKey: string;
  readonly archetypes: readonly { readonly id: string; readonly weights: BalancePrimaries }[];
  readonly initialSum: number;
  readonly growthPm: number;
  readonly kPm: number;
  readonly maxLevel: number;
  readonly draftPrograms: CompiledSecondaryPrograms;
  readonly baselinePrograms: CompiledSecondaryPrograms | null;
  readonly weapon: FormulaSampleWeapon;
  readonly coefficients: FormulaCoefficients;
}

/** 계열별 레벨 성장 곡선(Lv 1 ~ maxLevel) 계산 */
export function buildArchetypeLevelCurves(input: BuildLevelCurvesInput): ArchetypeLevelCurve[] {
  const maxLv = Math.max(1, Math.min(200, Math.trunc(input.maxLevel)));
  return input.archetypes.map((arch) => {
    const initial = archetypeInitialPrimaries(arch.weights, input.initialSum);
    const points: LevelCurvePoint[] = [];
    for (let level = 1; level <= maxLv; level += 1) {
      const primaries = growPrimaries(initial, input.growthPm, input.kPm, level);
      const draftFx = evaluateTargetFixed(
        input.targetKey,
        level,
        primaries,
        input.draftPrograms,
        input.weapon,
        input.coefficients,
      );
      const baseFx = input.baselinePrograms
        ? evaluateTargetFixed(
            input.targetKey,
            level,
            primaries,
            input.baselinePrograms,
            input.weapon,
            input.coefficients,
          )
        : null;
      points.push({
        level,
        primaries,
        draftValue: draftFx / FX_SCALE,
        baselineValue: baseFx === null ? null : baseFx / FX_SCALE,
      });
    }
    return { id: arch.id, points };
  });
}

export interface KBandPoint {
  readonly level: number;
  readonly minValue: number;
  readonly midValue: number;
  readonly maxValue: number;
}

/** 선택 계열의 K 편차(min ~ mid ~ max) 성장 밴드 */
export function buildKBandCurve(input: {
  readonly targetKey: string;
  readonly weights: BalancePrimaries;
  readonly initialSum: number;
  readonly growthPm: number;
  readonly kMinPm: number;
  readonly kMidPm: number;
  readonly kMaxPm: number;
  readonly maxLevel: number;
  readonly programs: CompiledSecondaryPrograms;
  readonly weapon: FormulaSampleWeapon;
  readonly coefficients: FormulaCoefficients;
}): KBandPoint[] {
  const maxLv = Math.max(1, Math.min(200, Math.trunc(input.maxLevel)));
  const initial = archetypeInitialPrimaries(input.weights, input.initialSum);
  const kMin = Math.min(input.kMinPm, input.kMidPm, input.kMaxPm);
  const kMax = Math.max(input.kMinPm, input.kMidPm, input.kMaxPm);
  const points: KBandPoint[] = [];
  for (let level = 1; level <= maxLv; level += 1) {
    const minP = growPrimaries(initial, input.growthPm, kMin, level);
    const midP = growPrimaries(initial, input.growthPm, input.kMidPm, level);
    const maxP = growPrimaries(initial, input.growthPm, kMax, level);
    const evalAt = (p: BalancePrimaries) =>
      evaluateTargetFixed(input.targetKey, level, p, input.programs, input.weapon, input.coefficients) /
      FX_SCALE;
    const minValue = evalAt(minP);
    const midValue = evalAt(midP);
    const maxValue = evalAt(maxP);
    points.push({
      level,
      minValue: Math.min(minValue, maxValue),
      midValue,
      maxValue: Math.max(minValue, maxValue),
    });
  }
  return points;
}

export interface ProbabilityCurvePoint {
  readonly score: number;
  /** 확률 ‰ (0 ~ cap) */
  readonly valuePm: number;
}

/** 확률형 스탯 수확체감 곡선(0 ~ maxScore, 판정 curve 식과 동일: ⌊cap × x ÷ (x + half)⌋) */
export function buildProbabilityCurve(
  cap: number,
  halfConstant: number,
  maxScore: number,
  steps = 24,
): ProbabilityCurvePoint[] {
  const safeHalf = Math.max(1, Math.trunc(halfConstant));
  const safeCap = Math.max(0, Math.trunc(cap));
  const topScore = Math.max(safeHalf * 2, Math.trunc(maxScore));
  const scores = new Set<number>([safeHalf]);
  for (let i = 0; i <= steps; i += 1) scores.add(Math.round((topScore * i) / steps));
  const program = compileFormulaOrThrow(`curve(GEAR, ${safeCap}, ${safeHalf})`, STAT_VAR_NAMES);
  return [...scores]
    .toSorted((a, b) => a - b)
    .map((score) => ({
      score,
      valuePm: evaluateFormulaInt(program, {
        STR: 0,
        DEX: 0,
        AGI: 0,
        VIT: 0,
        INT: 0,
        WIS: 0,
        LV: FX_SCALE,
        GEAR: score * FX_SCALE,
        BUFF: 0,
      }),
    }));
}

/** 행의 가중치 점수(확률형 마커용): ⌊Σ 1차 × 가중치⌋ */
export function probabilityWeightedScore(
  values: Readonly<Partial<Record<StatCellField, number>>>,
  primaries: BalancePrimaries,
): number {
  let acc = 0;
  for (const stat of RULE_STAT_ORDER) acc += primaries[stat] * (values[stat] ?? 0);
  return Math.floor(acc / FX_SCALE);
}

/** 선택 레벨에서 여러 계열의 모든 활성 2차 스탯 값(수정 전/후) 비교 행 */
export interface SecondaryComparisonRow {
  readonly rowId: string;
  readonly values: Readonly<
    Record<
      string,
      {
        readonly draft: number;
        readonly baseline: number | null;
      }
    >
  >;
}

/** 선택 레벨에서 계열별 전체 2차 스탯 비교표 계산 */
export function buildComparisonMatrix(input: {
  readonly rowIds: readonly string[];
  readonly level: number;
  readonly archetypes: readonly { readonly id: string; readonly weights: BalancePrimaries }[];
  readonly initialSum: number;
  readonly growthPm: number;
  readonly kPm: number;
  readonly draftPrograms: CompiledSecondaryPrograms;
  readonly baselinePrograms: CompiledSecondaryPrograms | null;
  readonly weapon: FormulaSampleWeapon;
  readonly coefficients: FormulaCoefficients;
}): SecondaryComparisonRow[] {
  const byArchDraft = new Map<string, Readonly<Record<string, number>>>();
  const byArchBase = new Map<string, Readonly<Record<string, number>>>();
  for (const arch of input.archetypes) {
    const initial = archetypeInitialPrimaries(arch.weights, input.initialSum);
    const primaries = growPrimaries(initial, input.growthPm, input.kPm, input.level);
    const ruleP = toRuleOrderPrimaries(primaries);
    byArchDraft.set(
      arch.id,
      runFormulaSample(
        {
          primaries: ruleP,
          level: input.level,
          rows: input.draftPrograms.rows,
          weapon: input.weapon,
          coefficients: input.coefficients,
        },
        input.draftPrograms.combat,
      ).stats,
    );
    if (input.baselinePrograms) {
      byArchBase.set(
        arch.id,
        runFormulaSample(
          {
            primaries: ruleP,
            level: input.level,
            rows: input.baselinePrograms.rows,
            weapon: input.weapon,
            coefficients: input.coefficients,
          },
          input.baselinePrograms.combat,
        ).stats,
      );
    }
  }
  return input.rowIds.map((rowId) => {
    const values: Record<string, { readonly draft: number; readonly baseline: number | null }> = {};
    for (const arch of input.archetypes) {
      const draft = byArchDraft.get(arch.id)?.[rowId] ?? 0;
      const base = byArchBase.get(arch.id)?.[rowId] ?? null;
      values[arch.id] = { draft, baseline: base };
    }
    return { rowId, values };
  });
}

/** BalanceRowView 목록의 한 행이 수식 덮어쓰기 키인지 확인 */
export const statRowFormulaKey = (rowId: string): string => statFormulaKey(rowId);
