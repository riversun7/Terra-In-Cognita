// 밸런스 분석 계획(순수 함수) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)" 1·2절
// 입력(분포·조건) → 실험 유닛(LabUnit) → 전투 사양(build.ts buildLabUnit, 실효 표·계수·N5) → 묶음 칸(analysisBatch.ts)과 결과 조립.
// - 분포 상성: 총합마다 분포 n개를 정수로 나누고(distributePoints), 짝 i < j마다 칸 하나(편 A = i). 칸 시드 = (시드, 합 차례, i, j)에서.
// - 영향도: 기준 분포를 나누고, 1차마다 단계 k로 옮기거나(shiftPoints, 총합 그대로) 더해(plusPoints) 변형을 만든다. 칸 = 변형 vs 기준,
//   맨 앞에 기준 vs 기준(같은 유닛 대조) 하나. 판 수 0이면 칸 없이 2차 스탯·사양만.
// - 조건: mode "sum" = 성장 끔(1차 = 나눈 값, 레벨은 LV·맨손 적정에만), "level" = 처음 총합을 나누고 N5·K로 그 레벨까지 성장.
//   속성값 바꿈, 스킬 끔(고유·장비 스킬 모두 — 사양의 스킬을 비운다), 장비 끔(무기 밖 장비·직접 값 뺌), 편마다 같은 유닛 teamSize명.
// 사양은 주 스레드에서 만들고(가볍다) 판정은 워커가 한다. 공식 수는 여기 없다(규칙 rules가 실효 표·계수를 준다).
import {
  type AnalysisBuild,
  type AnalysisConditions,
  type AnalysisDuelStats,
  type AnalysisMatrixInput,
  type AnalysisMatrixResult,
  type AnalysisResult,
  type AnalysisSensitivityInput,
  type AnalysisSensitivityPoint,
  type AnalysisSensitivityResult,
  type AnalysisUnitSummary,
  distributePoints,
  plusPoints,
  shiftPoints,
} from "@terra/shared/balanceAnalysis";
import { type LabDropped, type LabPrimaries, type LabUnit, emptyLabGear } from "@terra/shared/battleLab";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { mix32, realAttackOf, realCritPm, realHitPm } from "@terra/sim";
import type { ArenaParty } from "./arena.ts";
import type { BatchCell } from "./analysisBatch.ts";
import { type BuiltLabUnit, type LabRules, buildLabUnit } from "./build.ts";

/** 묶음 칸과 결과 조립. 칸이 없으면(영향도 판 수 0) 워커 없이 바로 조립한다 */
export interface AnalysisPlan {
  readonly cells: readonly BatchCell[];
  readonly runs: number;
  readonly limitMs: number;
  assemble(results: readonly AnalysisDuelStats[]): AnalysisResult;
}

/** 칸 시드(시드에서 갈라 씀, 차례·묶음과 무관) */
export const cellSeed = (seed: number, a: number, b: number, c: number): number =>
  mix32(seed ^ Math.imul(((a * 64 + b) * 64 + c + 1) | 0, 0x85eb_ca6b));

/** 조건을 얹은 실험 유닛(1차 = initial) */
export function unitFor(template: LabUnit, initial: LabPrimaries, conditions: AnalysisConditions): LabUnit {
  const elements =
    conditions.elements === "keep"
      ? template.elements
      : Array.from({ length: 12 }, (_, index) => (index === conditions.elements ? 10 : 0));
  return {
    ...template,
    level: conditions.level,
    initial,
    elements,
    ...(conditions.gear ? {} : { equipment: [], gear: emptyLabGear() }),
    ...(conditions.skills ? {} : { skills: [] }),
    pos: undefined,
  };
}

/** 조건에 맞는 규칙(mode "sum"이면 성장 끔) */
const rulesFor = (rules: LabRules, conditions: AnalysisConditions): LabRules =>
  conditions.mode === "sum" ? { ...rules, growthPm: 0 } : rules;

interface Built {
  readonly built: BuiltLabUnit;
  readonly party: ArenaParty;
  readonly summary: AnalysisUnitSummary;
}

/** 사양 요약(서버 사양 그대로) */
export function summaryOf(built: BuiltLabUnit, rules: LabRules): AnalysisUnitSummary {
  const { spec } = built;
  const c = rules.coefficients;
  const realAttack = realAttackOf(spec.attack, c.appropriateCapPm, c);
  const hitPm = realHitPm(spec.attack, c);
  const critPm = realCritPm(spec.attack, c);
  const critMulPm = spec.attack.critMulPm;
  const interval = Math.max(1, spec.attackIntervalMs);
  const expected = realAttack * (hitPm / 1000) * (1 + (critPm / 1000) * (critMulPm / 1000 - 1));
  const p = built.loadout.primaries;
  return {
    primaries: { str: p.str, vit: p.vit, int: p.int, wis: p.wis, dex: p.dex, agi: p.agi },
    maxHp: spec.maxHp,
    armorHp: spec.armorHp,
    shieldHp: spec.shieldHp,
    realAttack,
    hitPm,
    critPm,
    critMulPm,
    attackIntervalMs: spec.attackIntervalMs,
    evadePm: spec.defense.evadePm,
    defenseRatePm: spec.defense.defenseRatePm,
    ehp: spec.maxHp + spec.armorHp + spec.shieldHp,
    dpsIndex: Math.round((expected * 1000) / interval),
  };
}

function buildOne(
  template: LabUnit,
  initial: LabPrimaries,
  conditions: AnalysisConditions,
  rules: LabRules,
  dropped: Map<string, LabDropped>,
): Built {
  const effective = rulesFor(rules, conditions);
  const unit = unitFor(template, initial, conditions);
  const built = buildLabUnit(unit, effective);
  for (const entry of built.dropped) dropped.set(`${entry.kind}:${entry.id}`, entry);
  const spec = conditions.skills ? built.spec : { ...built.spec, skills: [] };
  const units = Array.from({ length: conditions.teamSize }, () => ({ spec, row: unit.row }));
  return { built, party: { units, retreatHpPct: 0 }, summary: summaryOf(built, effective) };
}

/** 2차 스탯(실효 표 차례) */
const secondaryOf = (built: BuiltLabUnit, rules: LabRules): number[] =>
  rules.catalog.statTable.map((row) => built.loadout.stats[row.id] ?? 0);

/** 분포 상성 계획 */
export function matrixPlan(input: AnalysisMatrixInput, rules: LabRules, revision: number): AnalysisPlan {
  const { conditions, builds } = input;
  const dropped = new Map<string, LabDropped>();
  const templateOf = (build: AnalysisBuild): LabUnit => build.unit ?? conditions.template;
  const tables = input.sums.map((sum) => {
    const initial = builds.map((build) => distributePoints(build.weights, sum));
    const made = builds.map((build, index) =>
      buildOne(templateOf(build), initial[index] ?? build.weights, conditions, rules, dropped),
    );
    return { sum, initial, made };
  });
  const cells: BatchCell[] = [];
  const keys: { table: number; i: number; j: number }[] = [];
  tables.forEach((table, t) => {
    for (let i = 0; i < builds.length; i++)
      for (let j = i + 1; j < builds.length; j++) {
        const a = table.made[i];
        const b = table.made[j];
        if (!a || !b) continue;
        cells.push({ a: a.party, b: b.party, seed: cellSeed(input.seed, t, i, j) });
        keys.push({ table: t, i, j });
      }
  });
  return {
    cells,
    runs: input.runs,
    limitMs: conditions.limitSec * 1000,
    assemble(results): AnalysisMatrixResult {
      return {
        kind: "matrix",
        revision,
        seed: input.seed,
        runs: input.runs,
        builds: builds.map((build) => ({ id: build.id, label: build.label })),
        tables: tables.map((table, t) => ({
          sum: table.sum,
          initial: table.initial,
          units: table.made.map((entry) => entry.summary),
          cells: keys.flatMap((key, index) => {
            const stats = results[index];
            return key.table === t && stats ? [{ ...stats, i: key.i, j: key.j }] : [];
          }),
        })),
        dropped: [...dropped.values()],
      };
    },
  };
}

/** 영향도 계획 */
export function sensitivityPlan(
  input: AnalysisSensitivityInput,
  rules: LabRules,
  revision: number,
): AnalysisPlan {
  const { conditions } = input;
  const dropped = new Map<string, LabDropped>();
  const baseInitial = distributePoints(input.weights, input.sum);
  const base = buildOne(conditions.template, baseInitial, conditions, rules, dropped);
  const effective = rulesFor(rules, conditions);
  const withDuels = input.runs > 0;
  const cells: BatchCell[] = [];
  if (withDuels) cells.push({ a: base.party, b: base.party, seed: cellSeed(input.seed, 63, 0, 0) });
  const points: (Omit<AnalysisSensitivityPoint, "duel"> & { cell: number | null })[] = [];
  PRIMARY_STATS.forEach((stat, s) => {
    input.steps.forEach((step, k) => {
      const initial =
        input.mode === "shift" ? shiftPoints(baseInitial, stat, step) : plusPoints(baseInitial, stat, step);
      if (!initial) {
        points.push({ stat, step, initial: null, unit: null, secondary: null, cell: null });
        return;
      }
      const made = buildOne(conditions.template, initial, conditions, rules, dropped);
      let cell: number | null = null;
      if (withDuels) {
        cell = cells.length;
        cells.push({ a: made.party, b: base.party, seed: cellSeed(input.seed, 62, s, k) });
      }
      points.push({
        stat,
        step,
        initial,
        unit: made.summary,
        secondary: secondaryOf(made.built, effective),
        cell,
      });
    });
  });
  return {
    cells,
    runs: input.runs,
    limitMs: conditions.limitSec * 1000,
    assemble(results): AnalysisSensitivityResult {
      return {
        kind: "sensitivity",
        revision,
        seed: input.seed,
        runs: input.runs,
        mode: input.mode,
        sum: input.sum,
        steps: [...input.steps],
        rows: effective.catalog.statTable.map((row) => row.id),
        base: { initial: baseInitial, unit: base.summary, secondary: secondaryOf(base.built, effective) },
        control: withDuels ? (results[0] ?? null) : null,
        points: points.map(({ cell, ...point }) => ({
          ...point,
          duel: cell === null ? null : (results[cell] ?? null),
        })),
        dropped: [...dropped.values()],
      };
    },
  };
}
