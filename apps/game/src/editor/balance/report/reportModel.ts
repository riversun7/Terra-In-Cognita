// 전투 보고서 화면 모델(순수 함수) — docs/adr/2026-11-14-battle-report.md "화면"
// 입력 폼(이 기기에 남김) ↔ 서버 입력(ReportStartInput), 오류 풀이, 보고서 수치(판마다 평균·비율), 피해 흐름 단계 줄(흐름도),
// 기록 둘 견주기. 판정·집계는 서버가 한다(기기는 판정 코드를 받지 않는다).
import {
  FLOW_VALUE_STAGES,
  type FlowValueStage,
  REPORT_LIMITS,
  REPORT_REASONS,
  type ReportCity,
  type ReportCounters,
  type ReportFlow,
  type ReportMode,
  type ReportReason,
  type ReportResult,
  type ReportSetup,
  type ReportStartInput,
  type ReportTuningChange,
  flowQuantile,
  reportProblem,
} from "@terra/shared/battleReport";
import { field } from "../../../net/json.ts";
import type { Teams } from "../lab/labModel.ts";

export interface WaveForm {
  readonly strength: number;
  readonly physical: number;
  readonly creatureTech: number;
  readonly defenders: number;
  readonly defenderTech: number;
}

/** 보고서 폼(팀은 실험실 자료 useLabData가 따로 든다) */
export interface ReportForm {
  readonly name: string;
  readonly note: string;
  readonly mode: ReportMode;
  readonly terrain: string;
  readonly limitSec: number;
  readonly runs: number;
  readonly seed: number;
  readonly city: ReportCity;
  readonly nexusDurability: number;
  readonly wave: WaveForm;
  /** A/B: 켰나, B 이름, B 팀(null = A 팀 그대로), B 웨이브, 설정 칸 바꿈 */
  readonly variantOn: boolean;
  readonly variantLabel: string;
  readonly variantTeams: Teams | null;
  readonly variantWave: WaveForm | null;
  readonly variantTuning: readonly ReportTuningChange[];
}

export const DEFAULT_WAVE: WaveForm = {
  strength: 8,
  physical: 4,
  creatureTech: 3,
  defenders: 10,
  defenderTech: 3,
};

export function defaultReportForm(): ReportForm {
  return {
    name: "",
    note: "",
    mode: "arena",
    terrain: "flat",
    limitSec: 120,
    runs: 200,
    seed: 1,
    city: { layout: "city", housing: 40, adminLevel: 1 },
    nexusDurability: 2000,
    wave: DEFAULT_WAVE,
    variantOn: false,
    variantLabel: "B",
    variantTeams: null,
    variantWave: null,
    variantTuning: [],
  };
}

/** 판 수 고르기(짝수, 상한 안) */
export const REPORT_RUN_OPTIONS = [20, 50, 100, 200, 500, 1000, 2000] as const;
export const REPORT_SIEGE_RUN_OPTIONS = [4, 10, 20, 50, 100, 200] as const;
export const REPORT_LIMIT_OPTIONS = [60, 120, 180, 300, 600] as const;
export const REPORT_SIEGE_LIMIT_OPTIONS = [300, 600, 900, 1200, 1800] as const;

const isSiege = (mode: ReportMode): boolean => mode !== "arena";

/** 종류를 바꾸면 판 수·제한 시간을 그 종류 범위로 */
export function withMode(form: ReportForm, mode: ReportMode): ReportForm {
  if (isSiege(mode) === isSiege(form.mode)) return { ...form, mode };
  return isSiege(mode)
    ? { ...form, mode, runs: 20, limitSec: 900 }
    : { ...form, mode, runs: 200, limitSec: 120 };
}

function setupOf(form: ReportForm, teams: Teams, wave: WaveForm): ReportSetup {
  if (form.mode === "arena")
    return { mode: "arena", a: teams.a, b: teams.b, terrain: form.terrain, limitSec: form.limitSec };
  if (form.mode === "siege")
    return {
      mode: "siege",
      a: teams.a,
      b: teams.b,
      city: form.city,
      nexusDurability: form.nexusDurability,
      limitSec: form.limitSec,
    };
  return {
    mode: "wave",
    ...wave,
    city: form.city,
    nexusDurability: form.nexusDurability,
    limitSec: form.limitSec,
  };
}

/** 폼 → 서버 입력(이름이 비면 종류·판 수로 채운다) */
export function reportInputOf(form: ReportForm, teams: Teams, fallbackName: string): ReportStartInput {
  const setup = setupOf(form, teams, form.wave);
  const variantSetup =
    form.mode === "wave"
      ? form.variantWave
        ? setupOf(form, teams, form.variantWave)
        : null
      : form.variantTeams
        ? setupOf(form, form.variantTeams, form.wave)
        : null;
  return {
    name: form.name.trim() || fallbackName,
    note: form.note,
    setup,
    variant: form.variantOn
      ? { label: form.variantLabel.trim() || "B", setup: variantSetup, tuning: form.variantTuning }
      : null,
    runs: form.runs,
    seed: form.seed,
  };
}

const waveOf = (s: Extract<ReportSetup, { mode: "wave" }>): WaveForm => ({
  strength: s.strength,
  physical: s.physical,
  creatureTech: s.creatureTech,
  defenders: s.defenders,
  defenderTech: s.defenderTech,
});

/** 기록의 입력 → 폼·팀(다시 돌리기) */
export function formOfInput(
  input: ReportStartInput,
  base: ReportForm,
): { form: ReportForm; teams: Teams | null } {
  const { setup, variant } = input;
  const common = {
    ...base,
    name: input.name,
    note: input.note,
    mode: setup.mode,
    runs: input.runs,
    seed: input.seed,
    limitSec: setup.limitSec,
    variantOn: variant !== null,
    variantLabel: variant?.label ?? "B",
    variantTuning: variant?.tuning ?? [],
    variantTeams: null,
    variantWave: null,
  };
  if (setup.mode === "arena") {
    const vb = variant?.setup?.mode === "arena" ? { a: variant.setup.a, b: variant.setup.b } : null;
    return {
      form: { ...common, terrain: setup.terrain, variantTeams: vb },
      teams: { a: setup.a, b: setup.b },
    };
  }
  if (setup.mode === "siege") {
    const vb = variant?.setup?.mode === "siege" ? { a: variant.setup.a, b: variant.setup.b } : null;
    return {
      form: { ...common, city: setup.city, nexusDurability: setup.nexusDurability, variantTeams: vb },
      teams: { a: setup.a, b: setup.b },
    };
  }
  return {
    form: {
      ...common,
      city: setup.city,
      nexusDurability: setup.nexusDurability,
      wave: waveOf(setup),
      variantWave: variant?.setup?.mode === "wave" ? waveOf(variant.setup) : null,
    },
    teams: null,
  };
}

/** 폼 문제(서버와 같은 검사) */
export function formProblem(form: ReportForm, teams: Teams): ReportReason | null {
  if (form.mode !== "wave" && (teams.a.units.length === 0 || teams.b.units.length === 0))
    return "invalid_settings";
  return reportProblem(reportInputOf(form, teams, "x"));
}

const FORM_KEY = "terra.dev.report.form.v1";

/** 수 칸(정수가 아니면 기본값) */
const intField = (value: unknown, key: string, fallback: number): number => {
  const raw = field(value, key);
  return typeof raw === "number" && Number.isInteger(raw) ? raw : fallback;
};

function waveField(value: unknown, fallback: WaveForm): WaveForm {
  if (typeof value !== "object" || value === null) return fallback;
  return {
    strength: intField(value, "strength", fallback.strength),
    physical: intField(value, "physical", fallback.physical),
    creatureTech: intField(value, "creatureTech", fallback.creatureTech),
    defenders: intField(value, "defenders", fallback.defenders),
    defenderTech: intField(value, "defenderTech", fallback.defenderTech),
  };
}

/** 이 기기에 남긴 폼(칸마다 모양을 보고, 틀리면 기본값. 서버가 다시 검사한다). B 팀은 남기지 않는다 */
export function loadReportForm(): ReportForm {
  const base = defaultReportForm();
  try {
    const raw = globalThis.localStorage?.getItem(FORM_KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    const mode = field(parsed, "mode");
    if (mode !== "arena" && mode !== "siege" && mode !== "wave") return base;
    const text = (key: string, fallback: string): string => {
      const value = field(parsed, key);
      return typeof value === "string" ? value : fallback;
    };
    const city = field(parsed, "city");
    const layout = field(city, "layout");
    const variantWave = field(parsed, "variantWave");
    const tuning = field(parsed, "variantTuning");
    return {
      ...base,
      name: text("name", base.name),
      note: text("note", base.note),
      mode,
      terrain: text("terrain", base.terrain),
      limitSec: intField(parsed, "limitSec", base.limitSec),
      runs: intField(parsed, "runs", base.runs),
      seed: intField(parsed, "seed", base.seed),
      city: {
        layout: layout === "open" ? "open" : "city",
        housing: intField(city, "housing", base.city.housing),
        adminLevel: intField(city, "adminLevel", base.city.adminLevel),
      },
      nexusDurability: intField(parsed, "nexusDurability", base.nexusDurability),
      wave: waveField(field(parsed, "wave"), base.wave),
      variantOn: field(parsed, "variantOn") === true,
      variantLabel: text("variantLabel", base.variantLabel),
      variantWave: variantWave === null ? null : waveField(variantWave, base.wave),
      variantTuning: Array.isArray(tuning)
        ? tuning.flatMap((entry: unknown) => {
            const id = field(entry, "id");
            const value = field(entry, "value");
            return typeof id === "string" && typeof value === "number" ? [{ id, value }] : [];
          })
        : [],
    };
  } catch {
    return base;
  }
}

export function saveReportForm(form: ReportForm): void {
  try {
    globalThis.localStorage?.setItem(FORM_KEY, JSON.stringify({ ...form, variantTeams: null }));
  } catch {
    // 저장소를 못 쓰면(사생활 창 등) 이 기기에만 남지 않을 뿐이다
  }
}

/** 서버 오류 → 문구 키 */
export type ReportErrorKey =
  | ReportReason
  | "forbidden"
  | "unauthorized"
  | "unavailable"
  | "invalid_input"
  | "network"
  | "timeout"
  | "failed"
  | "unknown";

const isReason = (value: unknown): value is ReportReason =>
  typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);

export function reportErrorOf(error: unknown): { key: ReportErrorKey; sessionEnded: boolean } {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  if (isReason(reason)) return { key: reason, sessionEnded: false };
  if (reason === "timeout" || reason === "failed") return { key: reason, sessionEnded: false };
  switch (code) {
    case "UNAUTHORIZED":
      return { key: "unauthorized", sessionEnded: true };
    case "FORBIDDEN":
      return { key: "forbidden", sessionEnded: false };
    case "NOT_FOUND":
      return { key: "unavailable", sessionEnded: false };
    case "BAD_REQUEST":
      return { key: "invalid_input", sessionEnded: false };
    case "TOO_MANY_REQUESTS":
      return { key: "rate_limited", sessionEnded: false };
    case undefined:
      return { key: "network", sessionEnded: false };
    default:
      return { key: "unknown", sessionEnded: false };
  }
}

/** 비율(‰, 분모 0이면 null) */
export function ratePm(part: number, whole: number): number | null {
  return whole <= 0 ? null : Math.round((part * 1000) / whole);
}

/** 판마다 평균(소수 한 자리까지) */
export function perRun(value: number, runs: number): number {
  return runs <= 0 ? 0 : Math.round((value * 10) / runs) / 10;
}

/** 초당 기본 공격 수(살아 있던 시간 기준, 소수 둘째) */
export function attacksPerSecond(c: ReportCounters): number {
  return c.aliveMs <= 0 ? 0 : Math.round((c.attacks * 100_000) / c.aliveMs) / 100;
}

/** 줄·편 하나의 보이는 수치 */
export interface CounterView {
  readonly dealtPhysical: number;
  readonly dealtElemental: number;
  readonly dealtDot: number;
  readonly takenPhysical: number;
  readonly takenElemental: number;
  readonly takenDot: number;
  readonly attacks: number;
  readonly hits: number;
  readonly misses: number;
  readonly evades: number;
  readonly crits: number;
  readonly hitPm: number | null;
  readonly evadePm: number | null;
  readonly missPm: number | null;
  readonly critPm: number | null;
  readonly critSharePm: number | null;
  readonly aps: number;
  readonly staminaWaits: number;
  readonly staminaWaitPm: number | null;
  readonly skills: number;
  readonly kills: number;
  readonly deaths: number;
  readonly healed: number;
}

/** 판 전체 합 → 판마다 평균과 비율 */
export function counterView(c: ReportCounters, runs: number): CounterView {
  return {
    dealtPhysical: perRun(c.physicalDealt, runs),
    dealtElemental: perRun(c.elementalDealt, runs),
    dealtDot: perRun(c.dotDealt, runs),
    takenPhysical: perRun(c.physicalTaken, runs),
    takenElemental: perRun(c.elementalTaken, runs),
    takenDot: perRun(c.dotTaken, runs),
    attacks: perRun(c.attacks, runs),
    hits: perRun(c.hits, runs),
    misses: perRun(c.misses, runs),
    evades: perRun(c.evades, runs),
    crits: perRun(c.crits, runs),
    hitPm: ratePm(c.hits, c.attacks),
    evadePm: ratePm(c.evades, c.attacks),
    missPm: ratePm(c.misses, c.attacks),
    critPm: ratePm(c.crits, c.hits),
    critSharePm: ratePm(c.critDamage, c.attackDamage),
    aps: attacksPerSecond(c),
    staminaWaits: perRun(c.staminaWaits, runs),
    staminaWaitPm: ratePm(c.staminaWaitMs, c.aliveMs),
    skills: perRun(c.skillCasts, runs),
    kills: perRun(c.kills, runs),
    deaths: perRun(c.deaths, runs),
    healed: perRun(c.healed, runs),
  };
}

// ── 피해 흐름 단계 줄 ──────────────────────────────────────────────

/** 흐름도 단계 하나 */
export type FlowStepId = "attack" | "hitRoll" | "evadeRoll" | "critRoll" | FlowValueStage;

export interface FlowStep {
  readonly id: FlowStepId;
  readonly kind: "count" | "value";
  /** 들어온·나간 수(수 단계) 또는 값 합(값 단계) */
  readonly into: number;
  readonly out: number;
  /** 바뀐 몫(‰, 음수 = 줄임, 양수 = 늘림). 들어온 것이 0이면 null */
  readonly changePm: number | null;
  /** 값 단계: 명중 한 번 평균(들어온·나간)과 나간 값의 p10·p90(막대 근사) */
  readonly avgIn: number;
  readonly avgOut: number;
  readonly p10: number;
  readonly p90: number;
  /** 이 단계에서 쓴 입력의 평균(‰ 등, 단계마다 뜻이 다름) */
  readonly detail: Readonly<Record<string, number>>;
  /** 이 단계가 아무것도 하지 않았다(엔진에 없는 몫이거나 쓰이지 않음) */
  readonly idle: boolean;
}

const avg = (sum: number, count: number): number => (count <= 0 ? 0 : Math.round((sum * 10) / count) / 10);

function countStep(id: FlowStepId, into: number, out: number, detail: Record<string, number>): FlowStep {
  return {
    id,
    kind: "count",
    into,
    out,
    changePm: into <= 0 ? null : Math.round(((out - into) * 1000) / into),
    avgIn: 0,
    avgOut: 0,
    p10: 0,
    p90: 0,
    detail,
    idle: into === out,
  };
}

/** 흐름 → 판정 차례 단계 줄 */
export function flowSteps(flow: ReportFlow): FlowStep[] {
  const { sums, values } = flow;
  const hits = flow.hits;
  const steps: FlowStep[] = [
    countStep("attack", flow.attacks, flow.attacks, {
      skillAttacks: flow.skillAttacks,
      hitPm: avg(sums.hitPm, flow.attacks),
    }),
    countStep("hitRoll", flow.attacks, flow.hitPassed, { hitPm: avg(sums.hitPm, flow.attacks) }),
    countStep("evadeRoll", flow.hitPassed, hits, {
      evadeBasePm: avg(sums.evadeBasePm, flow.hitPassed),
      evadeRelativePm: avg(sums.evadeRelativePm, flow.hitPassed),
      evadePm: avg(sums.evadePm, flow.hitPassed),
      evadeAtMin: sums.evadeAtMin,
      evadeAtMax: sums.evadeAtMax,
    }),
    countStep("critRoll", hits, hits, { critPm: avg(sums.critPm, hits), crits: flow.crits }),
  ];
  const detailOf: Partial<Record<FlowValueStage, Record<string, number>>> = {
    raw: {
      statAttack: avg(sums.statAttack, hits),
      weaponAttack: avg(sums.weaponAttack, hits),
      physicalRaw: avg(sums.physicalRaw, hits),
      elementalRaw: avg(sums.elementalRaw, hits),
    },
    rate: {
      ratePm: avg(sums.ratePm, sums.physicalHits),
      defenseRatePm: avg(sums.defenseRatePm, sums.physicalHits),
      penetrationPm: avg(sums.penetrationPm, sums.physicalHits),
    },
    flat: { defenseFlat: avg(sums.defenseFlat, sums.physicalHits) },
    matchup: { matchupPm: avg(sums.matchupPm, sums.elementalHits), elementalHits: sums.elementalHits },
    elementalDefense: { elementalDefensePm: avg(sums.elementalDefensePm, sums.elementalHits) },
    resist: { resistPm: avg(sums.resistPm, sums.elementalHits) },
    crit: { critMulPm: avg(sums.critMulPm, flow.crits), crits: flow.crits },
    skill: { skillMulPm: avg(sums.skillMulPm, hits) },
    buff: { buffPm: avg(sums.buffPm, hits) },
    floor: { floored: flow.floored },
    applied: { toArmor: sums.toArmor, toShield: sums.toShield, toHp: sums.toHp, overkill: sums.overkill },
  };
  let previous = values.raw;
  for (const stage of FLOW_VALUE_STAGES) {
    const out = values[stage];
    const into = stage === "raw" ? out : previous;
    const hist = flow.hist?.[stage] ?? [];
    steps.push({
      id: stage,
      kind: "value",
      into,
      out,
      changePm: into <= 0 ? null : Math.round(((out - into) * 1000) / into),
      avgIn: avg(into, hits),
      avgOut: avg(out, hits),
      p10: flowQuantile(hist, 0.1),
      p90: flowQuantile(hist, 0.9),
      detail: detailOf[stage] ?? {},
      idle: stage !== "raw" && into === out,
    });
    previous = out;
  }
  return steps;
}

/** 가장 크게 줄인·늘린 단계(attack·raw·final은 빼고 고른다 — 입력·합계 단계) */
export function flowExtremes(steps: readonly FlowStep[]): {
  loss: FlowStepId | null;
  gain: FlowStepId | null;
} {
  let loss: FlowStep | null = null;
  let gain: FlowStep | null = null;
  for (const step of steps) {
    if (step.id === "attack" || step.id === "raw" || step.id === "final" || step.changePm === null) continue;
    if (step.changePm < 0 && (!loss || step.changePm < (loss.changePm ?? 0))) loss = step;
    if (step.changePm > 0 && (!gain || step.changePm > (gain.changePm ?? 0))) gain = step;
  }
  return { loss: loss?.id ?? null, gain: gain?.id ?? null };
}

/** 줄 키 → 편(웨이브 무리는 정해진 편) */
export function pairKeys(
  pairs: Readonly<Record<string, ReportFlow>>,
): { key: string; from: string; to: string }[] {
  return Object.keys(pairs).map((key) => {
    const [from = "", to = ""] = key.split(">");
    return { key, from, to };
  });
}

// ── 기록 견주기 ──────────────────────────────────────────────

export interface CompareRow {
  readonly id: string;
  readonly left: number | null;
  readonly right: number | null;
  /** right − left */
  readonly delta: number | null;
  /** ‰ 값이면 참(보일 때 %로) */
  readonly pm: boolean;
}

const COMPARE_KEYS = [
  "scorePm",
  "avgMs",
  "p50Ms",
  "aDealt",
  "bDealt",
  "aHitPm",
  "aEvadePm",
  "aCritPm",
  "bHitPm",
  "bCritPm",
  "aDeaths",
  "bDeaths",
] as const;
const PM_KEYS: ReadonlySet<string> = new Set([
  "scorePm",
  "aHitPm",
  "aEvadePm",
  "aCritPm",
  "bHitPm",
  "bCritPm",
]);

function headline(r: ReportResult): Record<(typeof COMPARE_KEYS)[number], number | null> {
  const a = counterView(r.sides.a, r.outcome.runs);
  const b = counterView(r.sides.b, r.outcome.runs);
  return {
    scorePm: r.outcome.scorePm,
    avgMs: r.outcome.durations.avgMs,
    p50Ms: r.outcome.durations.p50Ms,
    aDealt: a.dealtPhysical + a.dealtElemental + a.dealtDot,
    bDealt: b.dealtPhysical + b.dealtElemental + b.dealtDot,
    aHitPm: a.hitPm,
    aEvadePm: b.evadePm,
    aCritPm: a.critPm,
    bHitPm: b.hitPm,
    bCritPm: b.critPm,
    aDeaths: a.deaths,
    bDeaths: b.deaths,
  };
}

/** 두 결과의 머리 수치(편 A 기준, 차이 = 오른쪽 − 왼쪽) */
export function compareRows(left: ReportResult, right: ReportResult): CompareRow[] {
  const l = headline(left);
  const r = headline(right);
  return COMPARE_KEYS.map((id) => {
    const lv = l[id];
    const rv = r[id];
    return {
      id,
      left: lv,
      right: rv,
      delta: lv === null || rv === null ? null : Math.round((rv - lv) * 10) / 10,
      pm: PM_KEYS.has(id),
    };
  });
}

/** 판 수 상한(종류마다) */
export const runsMaxOf = (mode: ReportMode): number =>
  mode === "arena" ? REPORT_LIMITS.runsMax : REPORT_LIMITS.siegeRunsMax;
