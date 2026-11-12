// 계산식 칸 — 어느 식을 고칠 수 있고 식마다 어떤 변수를 쓰나. docs/adr/2026-11-01-formula-editor.md "식 칸"
// 판정 코드(sim)·서버·팩 검사·화면이 이 표 하나를 본다. 변수 값을 만드는 함수(…Scope)도 여기 둬서 판정과 화면 미리 보기가
// 같은 값을 넣는다(어긋날 수 없게).
// - 2차 스탯 행(팩 stat_rows): 칸 키 `<행 ID>.formula`. 팩 행에 formula가 없으면 그 행의 가중치에서 만든 식(statRowExpression)이
//   출발 식이다(결과가 가중치 계산과 같다 — sim stats.test.ts가 무작위 입력으로 본다).
// - 전투 식(팩 formulas): 칸 키 = 식 ID. 기본 식(DEFAULT_COMBAT_FORMULAS)은 지금 코드와 같은 결과를 내는 식이다.
//   공격력 = 스탯 공격력 + 무기 몫(D-502): 무기 몫·명중·크리·공격 간격은 무기의 1차 적정 스탯(몫마다 하나: 공격 STR·INT, 명중·크리 DEX,
//   공격 간격 AGI) 대비 비율을 N10(1000‰)까지 곱한다(사용자 답 296~298). 맨손의 적정 DEX·AGI는 bare_appropriate(옛 규칙 레벨 × 1.5 + 10).
//   맨손 크리 확률은 따로 칸(bare_crit, 사용자 결정 2026-11-12 "맨손 크리확률은 agi+dex 을 퍼밀로쓰자 10,10이면 2%" — 무기 틀
//   min(1, DEX ÷ 적정)에서는 스탯이 적정을 넘어도 맨손 자료 크리 5% 그대로였다). 맨손 명중도 따로 칸(bare_hit, 사용자 결정 2026-11-12
//   "맨손 항상 100%" — 빗나감은 방어자 회피 굴림만).
//   스태미나 소모·회복도 적정 스탯 개념이다(D-511): 적정 STA 점수 = 레벨 식 stamina_appropriate(맨손 적정과 같은 틀), 소모는 적정 ÷ 점수를
//   곱하고(stamina_cost), 회복은 2차 스탯 스태미나 회복 × 점수 ÷ 적정(real_stamina_regen). 보통 유닛은 어느 레벨이든 배율 1이다.
// - 단위: points(점수·정수), pm(천분율 ‰), x(배, 비율), ms, roll(굴림 0~9999), level(레벨).
// 결정성 검사 대상이다(scripts/check-boundaries.mjs).
import { FX_SCALE, fxFormat, fxFromInt, fxFromPm } from "./formulaFixed.ts";
import type { FormulaScope } from "./formulaEval.ts";

export type FormulaUnit = "points" | "pm" | "x" | "ms" | "roll" | "level";

export interface FormulaVarDef {
  readonly name: string;
  readonly unit: FormulaUnit;
}

export interface FormulaSlot {
  /** 칸 키(전투 식 ID 또는 `<행 ID>.formula`) */
  readonly id: string;
  readonly group: "stat" | "combat";
  readonly vars: readonly FormulaVarDef[];
  /** 결과를 쓰는 법: int = 소수점 아래 버린 정수, fixed = 소수 셋째 자리까지(스태미나 소모 밀리점) */
  readonly result: "int" | "fixed";
  readonly unit: FormulaUnit;
  /** 표본 결과가 이 범위(양 끝 포함, 결과 단위) 밖이면 화면이 경고한다(막지 않는다). max null = 위 끝 없음 */
  readonly warn: { readonly min: number; readonly max: number | null } | null;
}

const v = (name: string, unit: FormulaUnit): FormulaVarDef => ({ name, unit });
const PRIMARY_DEFS = ["STR", "DEX", "AGI", "VIT", "INT", "WIS"].map((name) => v(name, "points"));

/** 2차 스탯 행 식의 변수: 1차 6개, 레벨, 그 행의 장비 합·버프 합 */
export const STAT_FORMULA_VARS: readonly FormulaVarDef[] = [
  ...PRIMARY_DEFS,
  v("LV", "level"),
  v("GEAR", "points"),
  v("BUFF", "points"),
];

/** 전투 식 ID(팩 formulas 항목 ID) */
export const COMBAT_FORMULA_IDS = [
  "real_attack",
  "real_hit",
  "real_crit",
  "bare_appropriate",
  "crit_multiplier",
  "attack_interval",
  "stamina_score",
  "stamina_appropriate",
  "stamina_cost",
  "real_stamina_regen",
  "evade_chance",
  "bare_crit",
  "bare_hit",
] as const;
export type CombatFormulaId = (typeof COMBAT_FORMULA_IDS)[number];

export function isCombatFormulaId(value: unknown): value is CombatFormulaId {
  return typeof value === "string" && (COMBAT_FORMULA_IDS as readonly string[]).includes(value);
}

/** 무기 비율 틀(D-502): W 무기 값, 1차 스탯(이름), A 무기 적정 1차 스탯(맨손은 bare_appropriate), CAP 비율 상한(N10) */
const ratioFrame = (unit: FormulaUnit, primary: string): readonly FormulaVarDef[] => [
  v("W", unit),
  v(primary, "points"),
  v("A", "points"),
  v("CAP", "x"),
];

const combatSlot = (
  id: CombatFormulaId,
  vars: readonly FormulaVarDef[],
  unit: FormulaUnit,
  warn: FormulaSlot["warn"],
  result: FormulaSlot["result"] = "int",
): FormulaSlot => ({ id, group: "combat", vars, result, unit, warn });

/** 전투 식 칸. 변수 뜻(화면 문구)은 게임 앱 메시지 `formula_var_<식>_<변수>` */
export const COMBAT_FORMULA_SLOTS: Readonly<Record<CombatFormulaId, FormulaSlot>> = {
  // 공격력(D-502): S 스탯 공격력(2차 physical_attack·elemental_attack), W 무기 공격력(맨손 0), P 무기 적정을 보는 1차(물리 STR·속성 INT),
  // A 무기 적정 STR·INT, CAP 비율 상한(N10)
  real_attack: combatSlot(
    "real_attack",
    [v("S", "points"), v("W", "points"), v("P", "points"), v("A", "points"), v("CAP", "x")],
    "points",
    { min: 0, max: null },
  ),
  // 명중·크리(사용자 답 297·298): 무기 값 × min(N10, DEX ÷ 적정 DEX)
  real_hit: combatSlot("real_hit", ratioFrame("pm", "DEX"), "pm", { min: 0, max: 1000 }),
  real_crit: combatSlot("real_crit", ratioFrame("pm", "DEX"), "pm", { min: 0, max: 1000 }),
  // 맨손 적정 DEX·AGI(사용자 답 297, 옛 규칙): LV 레벨. 결과는 점(소수 셋째 자리, Lv 1 = 11.5)
  bare_appropriate: combatSlot(
    "bare_appropriate",
    [v("LV", "level")],
    "points",
    { min: 1, max: null },
    "fixed",
  ),
  // 크리 배율(N12): M 크리 배율 점수(‰), SPREAD 범위 폭(‰), ROLL 자리 굴림
  crit_multiplier: combatSlot("crit_multiplier", [v("M", "pm"), v("SPREAD", "pm"), v("ROLL", "roll")], "pm", {
    min: 1000,
    max: null,
  }),
  // 공격 간격(사용자 답 297): I 무기 간격, AGI, A 무기 적정 AGI(맨손은 bare_appropriate), CAP 비율 상한(N10). 적정 미만이면 느려진다
  attack_interval: combatSlot(
    "attack_interval",
    [v("I", "ms"), v("AGI", "points"), v("A", "points"), v("CAP", "x")],
    "ms",
    {
      min: 100,
      max: 60_000,
    },
  ),
  // STA 점수(N13): 1차와 가중치(배)
  stamina_score: combatSlot("stamina_score", [...PRIMARY_DEFS, v("W_AGI", "x"), v("W_VIT", "x")], "points", {
    min: 0,
    max: null,
  }),
  // 적정 STA 점수(D-511, 맨손 적정과 같은 틀): LV 레벨. 결과는 점(소수 셋째 자리). 소모·회복 식의 APP로 든다
  stamina_appropriate: combatSlot(
    "stamina_appropriate",
    [v("LV", "level")],
    "points",
    { min: 1, max: null },
    "fixed",
  ),
  // 행동 한 번 스태미나 소모(N13·D-511): B 행동 기본 소모, SC STA 점수, APP 적정 STA 점수(stamina_appropriate 값), MIN 최소 소모(배).
  // 결과는 점(소수 셋째 자리)
  stamina_cost: combatSlot(
    "stamina_cost",
    [v("B", "points"), v("SC", "points"), v("APP", "points"), v("MIN", "x")],
    "points",
    { min: 0, max: null },
    "fixed",
  ),
  // 실제 스태미나 회복(D-511): R 2차 스탯 스태미나 회복(분당, 적정 STA에서의 회복), SC STA 점수, APP 적정 STA 점수. 결과는 분당 정수
  real_stamina_regen: combatSlot(
    "real_stamina_regen",
    [v("R", "points"), v("SC", "points"), v("APP", "points")],
    "points",
    { min: 0, max: null },
  ),
  // 최종 회피(N11): E 회피(2차 ‰), DA 방어자 AGI, AA 공격자 AGI, 상대 보정 기울기·끝값(‰)
  evade_chance: combatSlot(
    "evade_chance",
    [
      v("E", "pm"),
      v("DA", "points"),
      v("AA", "points"),
      v("FAVOR_SLOPE", "pm"),
      v("FAVOR_CAP", "pm"),
      v("UNFAVOR_SLOPE", "pm"),
      v("UNFAVOR_CAP", "pm"),
    ],
    "pm",
    { min: 0, max: 1000 },
  ),
  // 맨손 크리 확률(‰, 사용자 결정 2026-11-12): W 맨손 자료 크리(‰), DEX, AGI, A 맨손 적정 DEX·AGI(bare_appropriate). 기본 = AGI + DEX
  bare_crit: combatSlot(
    "bare_crit",
    [v("W", "pm"), v("DEX", "points"), v("AGI", "points"), v("A", "points")],
    "pm",
    { min: 0, max: 1000 },
  ),
  // 맨손 명중(‰, 사용자 결정 2026-11-12 "맨손 항상 100%"): W 맨손 자료 명중(‰), DEX, A 맨손 적정 DEX(bare_appropriate), CAP(N10). 기본 = 1000
  bare_hit: combatSlot("bare_hit", ratioFrame("pm", "DEX"), "pm", { min: 0, max: 1000 }),
};

/**
 * 전투 식 기본(= 팩 core formulas 출발값, 서버 시험이 같은지 본다). 지금 코드(formula.ts·unitSpec.ts·coefficients.ts)와 결과가 같다
 * (sim formulaParity.test.ts가 무작위 입력으로 본다). 적정이 없으면(A ≤ 0) 비율 100%(사용자 답 297)
 */
export const DEFAULT_COMBAT_FORMULAS: Readonly<Record<CombatFormulaId, string>> = {
  real_attack: "S + if(A <= 0, W, floor(W * min(CAP, max(0, P) / A)))",
  real_hit: "if(A <= 0, W, floor(W * min(CAP, max(0, DEX) / A)))",
  real_crit: "if(A <= 0, W, floor(W * min(CAP, max(0, DEX) / A)))",
  bare_appropriate: "# [임시] 옛 프로젝트 맨손 규칙: 맨손 적정 DEX·AGI = 레벨 × 1.5 + 10\nLV * 1.5 + 10",
  crit_multiplier: "max(0, M) + floor(SPREAD * ROLL / 10000)",
  attack_interval: "if(A <= 0, I, max(1, floor(I / max(0.001, min(CAP, max(0, AGI) / A)))))",
  stamina_score: "floor(AGI * W_AGI + VIT * W_VIT)",
  stamina_appropriate: [
    "# [임시] 보통 유닛의 STA 점수(D-511): 1차 처음 모두 10, 성장률 N5 100‰ × K 1 → 1차 = 10 × (1 + 0.1 × (레벨 − 1))",
    "# STA 점수 = AGI × 0.7 + VIT × 0.3 = 같은 값(Lv 1 = 10, Lv 30 = 39). 보통 유닛은 어느 레벨이든 소모·회복 배율 1",
    "10 * (1 + 0.1 * (LV - 1))",
  ].join("\n"),
  stamina_cost: "B * if(SC <= 0, APP, max(MIN, APP / SC))",
  real_stamina_regen: [
    "# [임시] 회복 = 2차 스탯 스태미나 회복 × min(2, STA 점수 ÷ 적정 STA)(옛 CHR 회복 배수 상한 2배, D-511)",
    "if(APP <= 0, R, floor(R * min(2, max(0, SC) / APP)))",
  ].join("\n"),
  evade_chance: [
    "r = max(0, DA) / AA",
    "favor = min(FAVOR_CAP, floor(FAVOR_SLOPE * (r - 1)))",
    "unfavor = max(-UNFAVOR_CAP, trunc(UNFAVOR_SLOPE * (r - 1)))",
    "rel = if(AA <= 0, if(DA > 0, FAVOR_CAP, 0), if(r >= 1, favor, unfavor))",
    "# 최종 회피는 1%~85%(옛 기획 회피율 §6, 사용자 답 277)",
    "clamp(E + rel, 10, 850)",
  ].join("\n"),
  bare_crit: [
    '# 사용자 결정 2026-11-12: 맨손 크리(‰) = AGI + DEX ("10,10이면 2%")',
    "max(0, AGI) + max(0, DEX)",
  ].join("\n"),
  bare_hit:
    '# 사용자 결정 2026-11-12: 맨손은 늘 맞는다("맨손 항상 100%") — 빗나감은 방어자 회피 굴림만\n1000',
};

/**
 * 판정이 크리 확률에 쓰는 식(사용자 결정 2026-11-12): 맨손 자료(unarmed)는 맨손 칸(bare_crit), 무기는 무기 틀 칸(real_crit).
 * 판정(sim formula.ts realCritPm)과 미리 보기가 같은 고르기를 쓴다
 */
export function critFormulaIdOf(unarmed: boolean): "real_crit" | "bare_crit" {
  return unarmed ? "bare_crit" : "real_crit";
}
/** 판정이 명중에 쓰는 식(사용자 결정 2026-11-12 "맨손 항상 100%"): 맨손 자료는 bare_hit, 무기는 real_hit */
export function hitFormulaIdOf(unarmed: boolean): "real_hit" | "bare_hit" {
  return unarmed ? "bare_hit" : "real_hit";
}

/** 굴림 칸이 있는 식(화면은 굴림 0·중간·9999를 함께 보인다) */
export const ROLL_FORMULAS: readonly CombatFormulaId[] = ["crit_multiplier"];

// ── 2차 스탯 행 식 ──

export const STAT_FORMULA_FIELD = "formula";

/** 행 식 칸 키 */
export function statFormulaKey(rowId: string): string {
  return `${rowId}.${STAT_FORMULA_FIELD}`;
}

/** 칸 키 → 행 ID(행 식 키가 아니면 null) */
export function parseStatFormulaKey(key: string): string | null {
  const suffix = `.${STAT_FORMULA_FIELD}`;
  if (!key.endsWith(suffix)) return null;
  const row = key.slice(0, -suffix.length);
  return isContentLikeId(row) ? row : null;
}

/** 콘텐츠 ID 모양(^[a-z][a-z0-9_]{1,47}$, 정규식 리터럴 없이) */
function isContentLikeId(id: string): boolean {
  if (id.length < 2 || id.length > 48) return false;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    const lower = c >= 97 && c <= 122;
    if (i === 0 ? !lower : !(lower || (c >= 48 && c <= 57) || c === 95)) return false;
  }
  return true;
}

/** 행 결과 단위: 확률 모양은 ‰, 크리 배율 점수는 ‰(1500 = 1.5배), 나머지는 점수 */
export function statFormulaSlot(rowId: string, shape: "quantity" | "probability"): FormulaSlot {
  const pm = shape === "probability" || rowId === "crit_multiplier";
  return {
    id: statFormulaKey(rowId),
    group: "stat",
    vars: STAT_FORMULA_VARS,
    result: "int",
    unit: pm ? "pm" : "points",
    warn: shape === "probability" ? { min: 0, max: 1000 } : { min: 0, max: null },
  };
}

export const FORMULA_PRIMARY_NAMES = ["STR", "DEX", "AGI", "VIT", "INT", "WIS"] as const;

/** 가중치 행 모양(팩 stat_rows·sim StatRow와 같은 칸) */
export type StatRowShape =
  | { readonly shape: "quantity"; readonly base: number; readonly weights: readonly number[] }
  | {
      readonly shape: "probability";
      readonly cap: number;
      readonly halfConstant: number;
      readonly weights: readonly number[];
    };

/** 가중치 항 글: 1000‰는 이름만, 아니면 "이름 * 배" */
function weightedText(weights: readonly number[]): string {
  let text = "";
  FORMULA_PRIMARY_NAMES.forEach((name, index) => {
    const weight = weights[index] ?? 0;
    if (weight === 0) return;
    const magnitude = Math.abs(weight);
    const term = magnitude === FX_SCALE ? name : `${name} * ${fxFormat(magnitude)}`;
    if (text === "") text = weight < 0 ? `-${term}` : term;
    else text += weight < 0 ? ` - ${term}` : ` + ${term}`;
  });
  return text;
}

/**
 * 가중치 행 → 같은 결과를 내는 식 글(행 식의 출발값). 양: 기본 + Σ 1차 × 배 + GEAR + BUFF(끝에서 내림),
 * 확률: curve(⌊Σ 1차 × 배⌋ + GEAR, 상한, 반감)(48 §3.1: 확률 모양에는 버프를 넣지 않는다)
 */
export function statRowExpression(row: StatRowShape): string {
  const weighted = weightedText(row.weights);
  if (row.shape === "probability")
    return `curve(floor(${weighted === "" ? "0" : weighted}) + GEAR, ${row.cap}, ${row.halfConstant})`;
  const parts = [row.base !== 0 ? String(row.base) : "", weighted, "GEAR", "BUFF"].filter(
    (part) => part !== "",
  );
  return parts.reduce(
    (text, part) =>
      text === "" ? part : part.startsWith("-") ? `${text} - ${part.slice(1)}` : `${text} + ${part}`,
    "",
  );
}

// ── 변수 값 만들기: 판정(sim)과 화면 미리 보기가 같은 함수를 쓴다 ──

const int = fxFromInt;
const pm = fxFromPm;

/** 2차 스탯 행 식의 변수(1차 6개 STR·DEX·AGI·VIT·INT·WIS 차례, 레벨, 그 행의 장비·버프) */
export function statRowScope(
  primaries: readonly number[],
  level: number,
  gear: number,
  buff: number,
): FormulaScope {
  return {
    STR: int(primaries[0] ?? 0),
    DEX: int(primaries[1] ?? 0),
    AGI: int(primaries[2] ?? 0),
    VIT: int(primaries[3] ?? 0),
    INT: int(primaries[4] ?? 0),
    WIS: int(primaries[5] ?? 0),
    LV: int(level),
    GEAR: int(gear),
    BUFF: int(buff),
  };
}

/** 공격력 식(real_attack, D-502): 스탯 공격력·무기 공격력·무기 적정을 보는 1차(STR·INT)·적정(밀리점, 0 이하 = 없음)·상한(‰) */
export function attackScope(
  statAttack: number,
  weapon: number,
  primary: number,
  appropriateMilli: number,
  capPm: number,
): FormulaScope {
  return { S: int(statAttack), W: int(weapon), P: int(primary), A: pm(appropriateMilli), CAP: pm(capPm) };
}

/** 명중·크리 식(real_hit·real_crit): 무기 값(‰)·DEX·적정 DEX(밀리점)·상한(‰) */
export function dexFrameScope(
  weapon: number,
  dex: number,
  appropriateMilli: number,
  capPm: number,
): FormulaScope {
  return { W: int(weapon), DEX: int(dex), A: pm(appropriateMilli), CAP: pm(capPm) };
}

/** 맨손 적정 DEX·AGI 식(bare_appropriate): 레벨 */
export function bareAppropriateScope(level: number): FormulaScope {
  return { LV: int(level) };
}

/** 맨손 크리 식(bare_crit): 맨손 자료 크리(‰)·DEX·AGI·맨손 적정(밀리점) */
export function bareCritScope(
  weapon: number,
  dex: number,
  agi: number,
  appropriateMilli: number,
): FormulaScope {
  return { W: int(weapon), DEX: int(dex), AGI: int(agi), A: pm(appropriateMilli) };
}

/** 크리 배율 식: 크리 배율 점수(‰)·범위 폭(‰)·굴림 */
export function critMultiplierScope(multiplierPm: number, spreadPm: number, roll: number): FormulaScope {
  return { M: int(multiplierPm), SPREAD: int(spreadPm), ROLL: int(roll) };
}

/** 공격 간격 식: 무기 간격(ms)·AGI·적정 AGI(밀리점)·상한(‰) */
export function attackIntervalScope(
  intervalMs: number,
  agi: number,
  appropriateMilli: number,
  capPm: number,
): FormulaScope {
  return { I: int(intervalMs), AGI: int(agi), A: pm(appropriateMilli), CAP: pm(capPm) };
}

/** STA 점수 식: 1차 6개와 AGI·VIT 가중치(‰) */
export function staminaScoreScope(primaries: readonly number[], weightsPm: readonly number[]): FormulaScope {
  return { ...statRowScope(primaries, 1, 0, 0), W_AGI: pm(weightsPm[2] ?? 0), W_VIT: pm(weightsPm[3] ?? 0) };
}

/** 적정 STA 점수 식(stamina_appropriate, D-511): 레벨 */
export function staminaAppropriateScope(level: number): FormulaScope {
  return { LV: int(level) };
}

/** 스태미나 소모 식: 행동 기본 소모·STA 점수·적정 STA 점수(밀리점, stamina_appropriate 값)·최소 소모(‰) */
export function staminaCostScope(
  baseCost: number,
  score: number,
  appropriateMilli: number,
  minConsumePm: number,
): FormulaScope {
  return { B: int(baseCost), SC: int(score), APP: pm(appropriateMilli), MIN: pm(minConsumePm) };
}

/** 실제 스태미나 회복 식(real_stamina_regen, D-511): 2차 스탯 스태미나 회복(분당)·STA 점수·적정 STA 점수(밀리점) */
export function staminaRegenScope(
  regenPerMinute: number,
  score: number,
  appropriateMilli: number,
): FormulaScope {
  return { R: int(regenPerMinute), SC: int(score), APP: pm(appropriateMilli) };
}

/** 회피 상대 보정(N11) 칸 값(‰) */
export interface EvadeRelativeValues {
  readonly favorSlopePm: number;
  readonly favorCapPm: number;
  readonly unfavorSlopePm: number;
  readonly unfavorCapPm: number;
}

/** 최종 회피 식: 회피(‰)·방어자 AGI·공격자 AGI·상대 보정 칸 */
export function evadeScope(
  evadePm: number,
  defenderAgi: number,
  attackerAgi: number,
  relative: EvadeRelativeValues,
): FormulaScope {
  return {
    E: int(evadePm),
    DA: int(defenderAgi),
    AA: int(attackerAgi),
    FAVOR_SLOPE: int(relative.favorSlopePm),
    FAVOR_CAP: int(relative.favorCapPm),
    UNFAVOR_SLOPE: int(relative.unfavorSlopePm),
    UNFAVOR_CAP: int(relative.unfavorCapPm),
  };
}

/** 칸 변수 이름 목록(읽기 parseFormula의 allowed) */
export function slotVarNames(slot: FormulaSlot): string[] {
  return slot.vars.map((item) => item.name);
}
