// 밸런스 분석 화면 순수 코드 — 조건·분포 입력 모양, 서버 입력 만들기, 결과 → 표·막대·곡선 자료, CSV·JSON 내보내기, 기기 저장.
// docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-08 완전 개편)". 판정은 서버가 한다(기기는 판정 코드를 받지 않는다).
import {
  ANALYSIS_BUILD_PRESETS,
  ANALYSIS_DEFAULT_STEPS,
  ANALYSIS_LIMITS,
  ANALYSIS_REASONS,
  type AnalysisConditions,
  type AnalysisDuelStats,
  type AnalysisMatrixInput,
  type AnalysisMatrixResult,
  type AnalysisReason,
  type AnalysisSensitivityInput,
  type AnalysisSensitivityMode,
  type AnalysisSensitivityResult,
  type AnalysisUnitSummary,
  analysisCost,
  analysisProblem,
  matrixScore,
  wilsonInterval,
} from "@terra/shared/balanceAnalysis";
import { type LabPresetView, type LabPrimaries, type LabUnit, newLabUnit } from "@terra/shared/battleLab";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { field } from "../../../net/json.ts";
import type { Teams } from "../lab/labModel.ts";

/** 유닛 틀 고르기: 샘플·팀 프리셋 ID, 또는 팀 A 유닛("team_a:<차례>") */
export const DEFAULT_TEMPLATE = "sample_new_cyborg";

/** 조건 입력(틀은 ID로 들고 보낼 때 푼다) */
export interface ConditionsForm {
  readonly templateId: string;
  /** "keep" = 틀 무기, "natural" = 맨손(타고난 무기), 그 밖 = 팩 무기 아이템 ID */
  readonly weapon: string;
  readonly level: number;
  readonly mode: "sum" | "level";
  readonly elements: "keep" | "none" | number;
  readonly skills: boolean;
  readonly gear: boolean;
  readonly teamSize: number;
  readonly limitSec: number;
}

export interface BuildForm {
  readonly id: string;
  readonly label: string;
  readonly weights: LabPrimaries;
  /** 이 분포만의 틀(null = 공통 틀) */
  readonly templateId: string | null;
}

export interface MatrixForm {
  readonly conditions: ConditionsForm;
  readonly builds: readonly BuildForm[];
  readonly sums: readonly number[];
  readonly runs: number;
  readonly seed: number;
}

export interface SensitivityForm {
  readonly conditions: ConditionsForm;
  readonly weights: LabPrimaries;
  readonly sum: number;
  readonly mode: AnalysisSensitivityMode;
  readonly steps: readonly number[];
  readonly runs: number;
  readonly seed: number;
}

export function defaultConditions(): ConditionsForm {
  return {
    templateId: DEFAULT_TEMPLATE,
    weapon: "keep",
    level: 30,
    mode: "sum",
    elements: "keep",
    skills: true,
    gear: true,
    teamSize: 1,
    limitSec: 120,
  };
}

/** 분포 출발값 → 입력(이름은 부르는 쪽이 메시지로) */
export function presetBuilds(nameOf: (id: string) => string): BuildForm[] {
  return ANALYSIS_BUILD_PRESETS.slice(0, 6).map((preset) => ({
    id: preset.id,
    label: nameOf(preset.id),
    weights: preset.weights,
    templateId: null,
  }));
}

export function defaultMatrixForm(nameOf: (id: string) => string): MatrixForm {
  return { conditions: defaultConditions(), builds: presetBuilds(nameOf), sums: [120], runs: 20, seed: 1 };
}

export function defaultSensitivityForm(): SensitivityForm {
  return {
    conditions: defaultConditions(),
    weights: ANALYSIS_BUILD_PRESETS[0]?.weights ?? { str: 1, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 },
    sum: 120,
    mode: "shift",
    steps: [...ANALYSIS_DEFAULT_STEPS.shift],
    runs: 20,
    seed: 1,
  };
}

/** 고를 수 있는 판 수·제한 시간·총합 */
export const RUN_OPTIONS = [2, 10, 20, 40, 100, 200, 400] as const;
export const LIMIT_OPTIONS = [30, 60, 120, 300, 600] as const;
export const SUM_OPTIONS = [60, 120, 180, 300, 600, 1200] as const;

/** 틀 ID → 유닛(없으면 새 사이보그) */
export function templateOf(
  id: string,
  presets: readonly LabPresetView[],
  teams: Teams | null,
): LabUnit | null {
  if (id.startsWith("team_a:")) {
    const index = Number(id.slice("team_a:".length));
    return teams?.a.units[index] ?? null;
  }
  const preset = presets.find((entry) => entry.id === id);
  return preset?.kind === "unit" ? preset.data : null;
}

/** 무기 고르기를 얹는다 */
function withWeapon(unit: LabUnit, weapon: string): LabUnit {
  if (weapon === "keep") return unit;
  if (weapon === "natural") return { ...unit, weapon: { kind: "natural" } };
  return { ...unit, weapon: { kind: "item", id: weapon, pm: 500 } };
}

export function resolveConditions(
  form: ConditionsForm,
  presets: readonly LabPresetView[],
  teams: Teams | null,
): AnalysisConditions {
  const template = templateOf(form.templateId, presets, teams) ?? newLabUnit("cyborg");
  return {
    template: withWeapon(template, form.weapon),
    level: form.level,
    mode: form.mode,
    elements: form.elements,
    skills: form.skills,
    gear: form.gear,
    teamSize: form.teamSize,
    limitSec: form.limitSec,
  };
}

/** 분포 상성 서버 입력 */
export function matrixInputOf(
  form: MatrixForm,
  presets: readonly LabPresetView[],
  teams: Teams | null,
): { kind: "matrix" } & AnalysisMatrixInput {
  const conditions = resolveConditions(form.conditions, presets, teams);
  return {
    kind: "matrix",
    conditions,
    builds: form.builds.map((build) => {
      const own = build.templateId === null ? null : templateOf(build.templateId, presets, teams);
      return {
        id: build.id,
        label: build.label.trim() || build.id,
        weights: build.weights,
        unit: own ? withWeapon(own, form.conditions.weapon) : null,
      };
    }),
    sums: [...form.sums].toSorted((a, b) => a - b),
    runs: form.runs,
    seed: form.seed,
  };
}

export function sensitivityInputOf(
  form: SensitivityForm,
  presets: readonly LabPresetView[],
  teams: Teams | null,
): { kind: "sensitivity" } & AnalysisSensitivityInput {
  return {
    kind: "sensitivity",
    conditions: resolveConditions(form.conditions, presets, teams),
    weights: form.weights,
    sum: form.sum,
    mode: form.mode,
    steps: [...form.steps].toSorted((a, b) => a - b),
    runs: form.runs,
    seed: form.seed,
  };
}

/** 새 분포 ID(custom_1, custom_2, …에서 비어 있는 것) */
export function nextBuildId(builds: readonly BuildForm[]): string {
  const used = new Set(builds.map((build) => build.id));
  for (let n = 1; n < 100; n++) if (!used.has(`custom_${n}`)) return `custom_${n}`;
  return `custom_${builds.length + 1}`;
}

/** 몫(가중치) → 백분율 글(합 0이면 고르게) */
export function weightShares(weights: LabPrimaries): Record<PrimaryStat, number> {
  const total = PRIMARY_STATS.reduce((sum, stat) => sum + Math.max(0, weights[stat]), 0);
  const out = { str: 0, vit: 0, int: 0, wis: 0, dex: 0, agi: 0 };
  for (const stat of PRIMARY_STATS)
    out[stat] = total === 0 ? 1000 / 6 : (Math.max(0, weights[stat]) * 1000) / total;
  return out;
}

/** 비용·문제(화면이 [돌리기] 전에 보인다) */
export function costOf(input: Parameters<typeof analysisCost>[0]) {
  return { ...analysisCost(input), problem: analysisProblem(input) };
}

/** 최악 걸리는 시간 어림(분, 개발 컨테이너 초당 약 800 전투 초 — ADR 잰 값) */
export const worstMinutes = (battleSeconds: number): number => battleSeconds / 800 / 60;

// ── 결과 → 화면 자료 ──

export interface HeatCell {
  readonly score: number | null;
  readonly lowPm: number;
  readonly highPm: number;
  readonly runs: number;
}

/** 분포 n × n 칸(행 = 내 분포, 열 = 상대) */
export function heatGrid(table: AnalysisMatrixResult["tables"][number], count: number): HeatCell[][] {
  return Array.from({ length: count }, (_row, i) =>
    Array.from({ length: count }, (_cell, j) => {
      const score = matrixScore(table.cells, i, j);
      const cell = table.cells.find(
        (entry) => (entry.i === i && entry.j === j) || (entry.i === j && entry.j === i),
      );
      const runs = i === j ? 0 : (cell?.runs ?? 0);
      const interval = score === null || i === j ? { lowPm: 500, highPm: 500 } : wilsonInterval(score, runs);
      return { score, runs, ...interval };
    }),
  );
}

/** 칸 색 단계(0~5, CSS가 단계마다 9%씩 섞는다)와 쪽: 이김 = 파랑 쪽, 짐 = 빨강 쪽, 반반 = 바탕 */
export function heatOf(score: number | null): { side: "win" | "loss" | "even"; level: number } {
  if (score === null || score === 500) return { side: "even", level: 0 };
  const distance = Math.abs(score - 500) / 500;
  const level = Math.round(distance * 5);
  return level === 0 ? { side: "even", level: 0 } : { side: score > 500 ? "win" : "loss", level };
}

/** 영향도 지표 */
export const SENSITIVITY_METRICS = ["score", "dps", "ehp", "attack", "time"] as const;
export type SensitivityMetric = (typeof SENSITIVITY_METRICS)[number];

/** 지표 값(score = 승률‰, time = 평균 전투 ms, 나머지는 사양 값). 없으면 null */
export function metricOf(
  metric: SensitivityMetric,
  unit: AnalysisUnitSummary | null,
  duel: AnalysisDuelStats | null,
): number | null {
  switch (metric) {
    case "score":
      return duel ? duel.scorePm : null;
    case "time":
      return duel ? duel.avgMs : null;
    case "dps":
      return unit ? unit.dpsIndex : null;
    case "ehp":
      return unit ? unit.ehp : null;
    default:
      return unit ? unit.realAttack : null;
  }
}

/** 기준 값(score = 500 반반, time = 기준 대조 칸 평균) */
export function metricBase(metric: SensitivityMetric, result: AnalysisSensitivityResult): number | null {
  if (metric === "score") return 500;
  if (metric === "time") return result.control?.avgMs ?? null;
  return metricOf(metric, result.base.unit, null);
}

/** 기준 대비 변화: score는 ‰p(그대로 차), 나머지는 ‰ 비율 차(기준 0이면 null) */
export function metricChange(
  metric: SensitivityMetric,
  value: number | null,
  base: number | null,
): number | null {
  if (value === null || base === null) return null;
  if (metric === "score") return value - base;
  if (base === 0) return value === 0 ? 0 : null;
  return Math.round(((value - base) * 1000) / Math.abs(base));
}

export interface RankedBar {
  readonly stat: PrimaryStat;
  readonly change: number | null;
  /** score만: 구간(‰p) */
  readonly lowPm: number | null;
  readonly highPm: number | null;
}

/** 한 단계에서 1차마다 변화, 큰 차례(없는 값은 뒤) */
export function rankedBars(
  result: AnalysisSensitivityResult,
  metric: SensitivityMetric,
  step: number,
): RankedBar[] {
  const base = metricBase(metric, result);
  const bars = PRIMARY_STATS.map((stat): RankedBar => {
    const point = result.points.find((entry) => entry.stat === stat && entry.step === step);
    const value = point ? metricOf(metric, point.unit, point.duel) : null;
    const change = metricChange(metric, value, base);
    if (metric === "score" && point?.duel && change !== null) {
      const interval = wilsonInterval(point.duel.scorePm, point.duel.runs);
      return { stat, change, lowPm: interval.lowPm - 500, highPm: interval.highPm - 500 };
    }
    return { stat, change, lowPm: null, highPm: null };
  });
  return bars.toSorted((a, b) => {
    if (a.change === null) return b.change === null ? 0 : 1;
    if (b.change === null) return -1;
    return b.change - a.change;
  });
}

/** 곡선: 1차마다 (단계, 변화) 점(0 단계 = 기준 0 포함) */
export function curves(
  result: AnalysisSensitivityResult,
  metric: SensitivityMetric,
): { stat: PrimaryStat; points: { step: number; change: number }[] }[] {
  const base = metricBase(metric, result);
  const steps = [...new Set([0, ...result.steps])].toSorted((a, b) => a - b);
  return PRIMARY_STATS.map((stat) => ({
    stat,
    points: steps.flatMap((step) => {
      if (step === 0) return base === null ? [] : [{ step, change: 0 }];
      const point = result.points.find((entry) => entry.stat === stat && entry.step === step);
      const change = point ? metricChange(metric, metricOf(metric, point.unit, point.duel), base) : null;
      return change === null ? [] : [{ step, change }];
    }),
  }));
}

/** 2차 스탯 변화(행 = 2차, 열 = 1차): 값 차와 ‰ 비율 */
export function secondaryEffects(result: AnalysisSensitivityResult, step: number) {
  return result.rows.map((row, r) => {
    const base = result.base.secondary[r] ?? 0;
    const cells = PRIMARY_STATS.map((stat) => {
      const point = result.points.find((entry) => entry.stat === stat && entry.step === step);
      const value = point?.secondary?.[r];
      if (value === undefined) return { stat, delta: null, pm: null };
      const delta = value - base;
      return { stat, delta, pm: base === 0 ? null : Math.round((delta * 1000) / Math.abs(base)) };
    });
    return { row, base, cells };
  });
}

// ── 내보내기 ──

const csvField = (value: string | number | null): string => {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csvLine = (values: readonly (string | number | null)[]): string => values.map(csvField).join(",");

/** 분포 상성 CSV(짝마다 한 줄, i 쪽 값) */
export function matrixCsv(result: AnalysisMatrixResult): string {
  const lines = [
    csvLine([
      "sum",
      "build",
      "opponent",
      "runs",
      "score_pm",
      "low_pm",
      "high_pm",
      "wins",
      "losses",
      "timeout_wins",
      "timeout_losses",
      "even",
      "avg_ms",
      "median_ms",
      "dps",
      "opponent_dps",
      "survival_pm",
      "opponent_survival_pm",
      "seed",
    ]),
  ];
  for (const table of result.tables)
    for (const cell of table.cells) {
      const interval = wilsonInterval(cell.scorePm, cell.runs);
      lines.push(
        csvLine([
          table.sum,
          result.builds[cell.i]?.label ?? cell.i,
          result.builds[cell.j]?.label ?? cell.j,
          cell.runs,
          cell.scorePm,
          interval.lowPm,
          interval.highPm,
          cell.wins,
          cell.losses,
          cell.timeoutWins,
          cell.timeoutLosses,
          cell.even,
          cell.avgMs,
          cell.medianMs,
          cell.dpsA,
          cell.dpsB,
          cell.survivalA,
          cell.survivalB,
          result.seed,
        ]),
      );
    }
  return `${lines.join("\n")}\n`;
}

/** 영향도 CSV(변형마다 한 줄 + 기준) */
export function sensitivityCsv(result: AnalysisSensitivityResult): string {
  const head = [
    "stat",
    "step",
    ...PRIMARY_STATS,
    "score_pm",
    "low_pm",
    "high_pm",
    "avg_ms",
    "dps_index",
    "ehp",
    "real_attack",
    ...result.rows,
  ];
  const lineOf = (
    stat: string,
    step: number,
    initial: LabPrimaries | null,
    unit: AnalysisUnitSummary | null,
    duel: AnalysisDuelStats | null,
    secondary: readonly number[] | null,
  ) => {
    const interval = duel ? wilsonInterval(duel.scorePm, duel.runs) : null;
    return csvLine([
      stat,
      step,
      ...PRIMARY_STATS.map((key) => (initial ? initial[key] : null)),
      duel?.scorePm ?? null,
      interval?.lowPm ?? null,
      interval?.highPm ?? null,
      duel?.avgMs ?? null,
      unit?.dpsIndex ?? null,
      unit?.ehp ?? null,
      unit?.realAttack ?? null,
      ...result.rows.map((_, r) => secondary?.[r] ?? null),
    ]);
  };
  const lines = [
    csvLine(head),
    lineOf("base", 0, result.base.initial, result.base.unit, result.control, result.base.secondary),
    ...result.points.map((point) =>
      lineOf(point.stat, point.step, point.initial, point.unit, point.duel, point.secondary),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

/** JSON 내보내기(입력과 결과를 함께: 같은 입력·시드로 다시 돌리면 같은 결과) */
export const exportJson = (input: unknown, result: unknown): string =>
  `${JSON.stringify({ format: "terra-balance-analysis", version: 1, input, result }, null, 2)}\n`;

// ── 오류 ──

export type AnalysisErrorKey =
  | AnalysisReason
  | "forbidden"
  | "unauthorized"
  | "unavailable"
  | "network"
  | "unknown";

const isReason = (value: unknown): value is AnalysisReason =>
  typeof value === "string" && (ANALYSIS_REASONS as readonly string[]).includes(value);

export function analysisErrorOf(error: unknown): { key: AnalysisErrorKey; sessionEnded: boolean } {
  const data = field(error, "data");
  const reason = field(data, "reason");
  if (isReason(reason)) return { key: reason, sessionEnded: false };
  switch (field(data, "code")) {
    case "UNAUTHORIZED":
      return { key: "unauthorized", sessionEnded: true };
    case "FORBIDDEN":
      return { key: "forbidden", sessionEnded: false };
    case "NOT_FOUND":
      return { key: "unavailable", sessionEnded: false };
    case "BAD_REQUEST":
      return { key: "invalid_settings", sessionEnded: false };
    case "TOO_MANY_REQUESTS":
      return { key: "rate_limited", sessionEnded: false };
    case undefined:
      return { key: "network", sessionEnded: false };
    default:
      return { key: "unknown", sessionEnded: false };
  }
}

// ── 기기 저장(이 기기만, 막히면 조용히 넘어간다) ──

const STORAGE_KEY = "terra.balanceAnalysis.v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

function isPrimaries(value: unknown): value is LabPrimaries {
  return isRecord(value) && PRIMARY_STATS.every((stat) => isInt(value[stat], 0, ANALYSIS_LIMITS.weightMax));
}

function isConditionsForm(value: unknown): value is ConditionsForm {
  const L = ANALYSIS_LIMITS;
  if (!isRecord(value)) return false;
  const elements = value.elements;
  return (
    typeof value.templateId === "string" &&
    typeof value.weapon === "string" &&
    isInt(value.level, L.levelMin, L.levelMax) &&
    (value.mode === "sum" || value.mode === "level") &&
    (elements === "keep" || elements === "none" || isInt(elements, 0, 11)) &&
    typeof value.skills === "boolean" &&
    typeof value.gear === "boolean" &&
    isInt(value.teamSize, L.teamMin, L.teamMax) &&
    isInt(value.limitSec, L.limitSecMin, L.limitSecMax)
  );
}

function isBuildForm(value: unknown): value is BuildForm {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^[a-z][a-z0-9_]{0,23}$/.test(value.id) &&
    typeof value.label === "string" &&
    isPrimaries(value.weights) &&
    (value.templateId === null || typeof value.templateId === "string")
  );
}

const isIntList = (value: unknown, min: number, max: number, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= length &&
  value.every((entry) => isInt(entry, min, max));

export function isMatrixForm(value: unknown): value is MatrixForm {
  const L = ANALYSIS_LIMITS;
  return (
    isRecord(value) &&
    isConditionsForm(value.conditions) &&
    Array.isArray(value.builds) &&
    value.builds.length >= 1 &&
    value.builds.length <= L.buildsMax &&
    value.builds.every(isBuildForm) &&
    isIntList(value.sums, L.sumMin, L.sumMax, L.sumsMax) &&
    isInt(value.runs, L.runsMin, L.runsMax) &&
    isInt(value.seed, 0, 0x7fff_ffff)
  );
}

export function isSensitivityForm(value: unknown): value is SensitivityForm {
  const L = ANALYSIS_LIMITS;
  return (
    isRecord(value) &&
    isConditionsForm(value.conditions) &&
    isPrimaries(value.weights) &&
    isInt(value.sum, L.sumMin, L.sumMax) &&
    (value.mode === "shift" || value.mode === "plus") &&
    isIntList(value.steps, -L.stepAbsMax, L.stepAbsMax, L.stepsMax) &&
    isInt(value.runs, 0, L.runsMax) &&
    isInt(value.seed, 0, 0x7fff_ffff)
  );
}

export function loadForm<T>(key: "matrix" | "sensitivity", guard: (value: unknown) => value is T): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(`${STORAGE_KEY}.${key}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveForm(key: "matrix" | "sensitivity", value: unknown): void {
  try {
    globalThis.localStorage?.setItem(`${STORAGE_KEY}.${key}`, JSON.stringify(value));
  } catch {
    // 저장이 막혀도(사생활 보호 창 등) 화면은 그대로 쓴다
  }
}

/** 입력 글 → 정수(범위 안으로 자름). 숫자가 아니면 null */
export function parseIntIn(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Math.min(max, Math.max(min, Number(trimmed)));
}

/** 단계 목록 글("−20, −10, 10, 20") → 정수 목록(0·같은 값 뺌, 차례대로). 틀린 글이면 null */
export function parseSteps(text: string, plusOnly: boolean): number[] | null {
  const parts = text
    .replaceAll("−", "-")
    .split(/[\s,]+/)
    .filter((part) => part !== "");
  if (parts.length === 0) return null;
  const out = new Set<number>();
  for (const part of parts) {
    if (!/^[+-]?\d+$/.test(part)) return null;
    const value = Number(part);
    if (value === 0) continue;
    if (Math.abs(value) > ANALYSIS_LIMITS.stepAbsMax || (plusOnly && value < 0)) return null;
    out.add(value);
  }
  const list = [...out].toSorted((a, b) => a - b);
  return list.length === 0 || list.length > ANALYSIS_LIMITS.stepsMax ? null : list;
}
