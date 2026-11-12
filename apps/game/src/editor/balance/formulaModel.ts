// 계산식 탭 모델(순수 함수) — docs/adr/2026-11-01-formula-editor.md "화면".
// 기기는 판정 코드(sim)를 받지 않으므로 같은 식 읽기·셈(@terra/shared/formula)으로 미리 보기를 만든다:
// 표본 유닛 → 2차 스탯(행 식) → 전투 식 변수 → 고르는 식의 값·풀이·1차 스탯 영향. 담은 식(drafts)은 실효 식 위에 얹는다.
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  type CombatFormulaId,
  FORMULA_FUNCTION_NAMES,
  type FormulaExplanation,
  type FormulaIssue,
  type FormulaListResponse,
  type FormulaProgram,
  type FormulaSampleInput,
  type FormulaSlot,
  type FormulaSlotView,
  type FormulaWeaponView,
  type PrimaryInfluence,
  ROLL_FORMULAS,
  bareAppropriateScope,
  critFormulaIdOf,
  evaluateFormula,
  explainFormula,
  isCombatFormulaId,
  parseFormula,
  primaryInfluence,
  runFormulaSample,
  sampleSecondary,
  slotVarNames,
  statFormulaSlot,
} from "@terra/shared/formula";

/** 담은 식(칸 키 → 글, null = 팩 식으로 되돌리기) */
export type FormulaDrafts = ReadonlyMap<string, string | null>;

/** 칸 정의(변수·단위·경고 범위) */
export function slotDefOf(view: FormulaSlotView): FormulaSlot {
  if (view.group === "combat" && isCombatFormulaId(view.key)) return COMBAT_FORMULA_SLOTS[view.key];
  return statFormulaSlot(view.row?.id ?? view.key, view.row?.shape ?? "quantity");
}

/** 칸에서 쓸 글: 담은 식 → (되돌리기면 팩 식) → 실효 식 */
export function sourceOf(view: FormulaSlotView, drafts: FormulaDrafts): string {
  const draft = drafts.get(view.key);
  if (draft === undefined) return view.source;
  return draft === null ? view.packSource : draft;
}

/** 읽은 식(실패하면 null) */
function compile(view: FormulaSlotView, source: string): FormulaProgram | null {
  const result = parseFormula(source, slotVarNames(slotDefOf(view)));
  return result.ok ? result.program : null;
}

/** 읽기 결과(오류·경고) */
export function checkSource(view: FormulaSlotView, source: string) {
  return parseFormula(source, slotVarNames(slotDefOf(view)));
}

/** 미리 보기 재료: 행 식(행 ID → 식)·전투 식(ID → 식). 담은 식이 틀리면 그 칸은 실효 식을 쓴다 */
interface Programs {
  readonly rows: readonly { readonly id: string; readonly program: FormulaProgram }[];
  readonly combat: Record<CombatFormulaId, FormulaProgram>;
}

function programsOf(
  list: FormulaListResponse,
  drafts: FormulaDrafts,
  override?: { key: string; program: FormulaProgram },
): Programs | null {
  const rows: { id: string; program: FormulaProgram }[] = [];
  const combat = new Map<CombatFormulaId, FormulaProgram>();
  for (const view of list.slots) {
    const program =
      override?.key === view.key
        ? override.program
        : (compile(view, sourceOf(view, drafts)) ?? compile(view, view.source));
    if (!program) return null;
    if (view.group === "stat" && view.row) rows.push({ id: view.row.id, program });
    else if (isCombatFormulaId(view.key)) combat.set(view.key, program);
  }
  if (!COMBAT_FORMULA_IDS.every((id) => combat.has(id))) return null;
  const pick = (id: CombatFormulaId): FormulaProgram => {
    const program = combat.get(id);
    if (!program) throw new Error(`missing formula ${id}`);
    return program;
  };
  return {
    rows,
    combat: {
      real_attack: pick("real_attack"),
      real_hit: pick("real_hit"),
      real_crit: pick("real_crit"),
      bare_appropriate: pick("bare_appropriate"),
      crit_multiplier: pick("crit_multiplier"),
      attack_interval: pick("attack_interval"),
      stamina_score: pick("stamina_score"),
      stamina_appropriate: pick("stamina_appropriate"),
      stamina_cost: pick("stamina_cost"),
      real_stamina_regen: pick("real_stamina_regen"),
      evade_chance: pick("evade_chance"),
      bare_crit: pick("bare_crit"),
    },
  };
}

export interface PreviewInput {
  readonly list: FormulaListResponse;
  readonly drafts: FormulaDrafts;
  readonly slot: FormulaSlotView;
  /** 고치는 칸의 지금 글(입력 중) */
  readonly source: string;
  readonly primaries: readonly number[];
  readonly level: number;
  readonly weapon: FormulaWeaponView;
}

export interface FormulaPreview {
  /** 결과(고정 소수점) */
  readonly value: number;
  readonly explanation: FormulaExplanation;
  readonly influence: PrimaryInfluence;
  /** 굴림 식: 굴림 0·9999일 때 값 */
  readonly rollRange: { readonly min: number; readonly max: number } | null;
  /** 결과가 칸 경고 범위 밖 */
  readonly outOfRange: boolean;
  /** 이 무기로는 판정이 이 식을 쓰지 않는다(예: 무기를 들었는데 맨손 식) */
  readonly unused: boolean;
}

/** 표본 입력 */
function sampleInput(
  input: PreviewInput,
  primaries: readonly number[],
  rows: Programs["rows"],
  roll?: number,
): FormulaSampleInput {
  return {
    primaries,
    level: input.level,
    rows,
    weapon: input.weapon,
    coefficients: input.list.coefficients,
    ...(roll === undefined ? {} : { roll }),
  };
}

/** 고르는 식의 값(행 식이면 그 행 2차 스탯, 전투 식이면 그 식) */
function valueIn(
  input: PreviewInput,
  programs: Programs,
  primaries: readonly number[],
  roll?: number,
): { value: number; scope: Readonly<Record<string, number>> } {
  const result = runFormulaSample(sampleInput(input, primaries, programs.rows, roll), programs.combat);
  const { slot } = input;
  if (slot.group === "stat" && slot.row) {
    const row = slot.row.id;
    const p = primaries;
    const scope = {
      STR: (p[0] ?? 0) * 1000,
      DEX: (p[1] ?? 0) * 1000,
      AGI: (p[2] ?? 0) * 1000,
      VIT: (p[3] ?? 0) * 1000,
      INT: (p[4] ?? 0) * 1000,
      WIS: (p[5] ?? 0) * 1000,
      LV: input.level * 1000,
      GEAR: 0,
      BUFF: 0,
    };
    return { value: (result.stats[row] ?? 0) * 1000, scope };
  }
  const id = isCombatFormulaId(slot.key) ? slot.key : "real_attack";
  return { value: result.values[id], scope: result.scopes[id] };
}

/** 표본 레벨의 맨손 적정 DEX·AGI(점, 담은 식 포함 — 맨손 적정 식 bare_appropriate, D-502). 식이 틀리면 0 */
export function sampleBareAppropriateOf(
  list: FormulaListResponse,
  drafts: FormulaDrafts,
  level: number,
): number {
  const programs = programsOf(list, drafts);
  if (!programs) return 0;
  return evaluateFormula(programs.combat.bare_appropriate, bareAppropriateScope(level)) / 1000;
}

/** 표본의 2차 스탯(담은 행 식 포함, 틀린 식은 실효 식). 무기마다 적정치 표가 쓴다 */
export function sampleStatsOf(
  list: FormulaListResponse,
  drafts: FormulaDrafts,
  primaries: readonly number[],
  level: number,
): Record<string, number> {
  const programs = programsOf(list, drafts);
  const weapon = defaultWeapon(list);
  if (!programs || !weapon) return {};
  return sampleSecondary({ primaries, level, rows: programs.rows, weapon, coefficients: list.coefficients });
}

/** 표본 유닛이 무기 하나로 기본 공격을 할 때의 스태미나(D-511 적정 스탯 개념, 담은 식 포함) */
export interface SampleStamina {
  readonly weapon: FormulaWeaponView;
  /** 적정 STA 점수(밀리점, 식 stamina_appropriate) */
  readonly appropriateMilli: number;
  readonly score: number;
  /** 최대 스태미나(2차 스탯 stamina) */
  readonly max: number;
  /** 실제 회복(분당, 식 real_stamina_regen) */
  readonly regenPerMinute: number;
  /** 기본 공격 한 번 소모(밀리점, 식 stamina_cost) */
  readonly costMilli: number;
  /** 공격 간격(ms, 식 attack_interval) */
  readonly intervalMs: number;
  /** 초당 회복 ≥ 초당 소모(일반 공격이 이어진다, D-511) */
  readonly sustained: boolean;
}

/** 표본 1차·레벨에서 무기마다 기본 공격 스태미나(판정 specFromStats와 같은 식·변수). 식이 틀리면 빈 목록 */
export function sampleStaminaOf(
  list: FormulaListResponse,
  drafts: FormulaDrafts,
  primaries: readonly number[],
  level: number,
): SampleStamina[] {
  const programs = programsOf(list, drafts);
  if (!programs) return [];
  return list.weapons.map((weapon) => {
    const result = runFormulaSample(
      { primaries, level, rows: programs.rows, weapon, coefficients: list.coefficients },
      programs.combat,
    );
    const v = result.values;
    const costMilli = Math.max(0, v.stamina_cost);
    const intervalMs = Math.max(1, Math.floor(v.attack_interval / 1000));
    const regenPerMinute = Math.max(0, Math.floor(v.real_stamina_regen / 1000));
    return {
      weapon,
      appropriateMilli: v.stamina_appropriate,
      score: result.staminaScore,
      max: Math.max(0, result.stats["stamina"] ?? 0),
      regenPerMinute,
      costMilli,
      intervalMs,
      // 분당 회복 × 간격 ≥ 60 × 한 번 소모(밀리점) ⇔ 초당 회복 ≥ 소모 ÷ 간격
      sustained: regenPerMinute * intervalMs >= 60 * costMilli,
    };
  });
}

/**
 * 이 무기로 판정이 이 식을 쓰나(맨손 적정 식은 맨손일 때만. 실제 공격력은 맨손도 쓴다: 스탯 공격력 + 무기 몫 0, D-502).
 * 크리는 맨손이면 맨손 식(bare_crit), 무기면 무기 틀 식(real_crit) — 사용자 결정 2026-11-12
 */
export function slotUsedBy(slot: FormulaSlotView, weapon: FormulaWeaponView): boolean {
  switch (slot.key) {
    case "bare_appropriate":
      return weapon.unarmed;
    case "real_crit":
    case "bare_crit":
      return critFormulaIdOf(weapon.unarmed) === slot.key;
    default:
      return true;
  }
}

/** 미리 보기(식이 틀리면 null) */
export function previewOf(input: PreviewInput): FormulaPreview | null {
  const program = compile(input.slot, input.source);
  if (!program) return null;
  const programs = programsOf(input.list, input.drafts, { key: input.slot.key, program });
  if (!programs) return null;
  const { value, scope } = valueIn(input, programs, input.primaries);
  const explanation = explainFormula(program, scope);
  const influence = primaryInfluence(
    (primaries) => valueIn(input, programs, primaries).value,
    input.primaries,
  );
  const rolls = isCombatFormulaId(input.slot.key) && ROLL_FORMULAS.includes(input.slot.key);
  const rollRange = rolls
    ? {
        min: valueIn(input, programs, input.primaries, 0).value,
        max: valueIn(input, programs, input.primaries, 9999).value,
      }
    : null;
  const warn = slotDefOf(input.slot).warn;
  const shown = slotDefOf(input.slot).result === "fixed" ? value / 1000 : Math.floor(value / 1000);
  const outOfRange = warn !== null && (shown < warn.min || (warn.max !== null && shown > warn.max));
  return {
    value,
    explanation,
    influence,
    rollRange,
    outOfRange,
    unused: !slotUsedBy(input.slot, input.weapon),
  };
}

// ── 입력 도움(자동 완성) ──

/** 글자 위치 앞의 이름 조각(자동 완성할 낱말)과 시작 위치 */
export function wordAt(source: string, caret: number): { start: number; prefix: string } {
  let start = caret;
  while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1] ?? "")) start -= 1;
  return { start, prefix: source.slice(start, caret) };
}

export interface Suggestion {
  readonly name: string;
  readonly kind: "var" | "fn" | "local";
}

/** 지역 이름(`이름 =` 줄)을 대강 모은다(입력 중이라 식이 틀려도) */
export function localsIn(source: string): string[] {
  const names: string[] = [];
  for (const line of source.split(/[\n;]/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(line);
    if (match?.[1] && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/** 조각으로 시작하는 이름(대소문자 무시): 변수 → 지역 이름 → 함수, 최대 8개. 조각이 비면 없음 */
export function suggestionsFor(slot: FormulaSlotView, source: string, prefix: string): Suggestion[] {
  if (prefix === "" || /^[0-9]/.test(prefix)) return [];
  const lower = prefix.toLowerCase();
  const out: Suggestion[] = [];
  const push = (name: string, kind: Suggestion["kind"]) => {
    if (name.toLowerCase().startsWith(lower) && name !== prefix && !out.some((item) => item.name === name))
      out.push({ name, kind });
  };
  for (const name of slotVarNames(slotDefOf(slot))) push(name, "var");
  for (const name of localsIn(source)) push(name, "local");
  for (const name of FORMULA_FUNCTION_NAMES) push(name, "fn");
  return out.slice(0, 8);
}

/** 이름을 넣은 새 글과 글자 위치(함수면 괄호를 붙인다) */
export function applySuggestion(
  source: string,
  caret: number,
  suggestion: Suggestion,
): { source: string; caret: number } {
  const { start } = wordAt(source, caret);
  const insert = suggestion.kind === "fn" ? `${suggestion.name}(` : suggestion.name;
  return { source: source.slice(0, start) + insert + source.slice(caret), caret: start + insert.length };
}

/** 오류 위치 → 줄·칸(1부터) */
export function lineColumn(source: string, at: number): { line: number; column: number } {
  const before = source.slice(0, at).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

/** 고친 칸(담은 식) → tuning.save formulas */
export function formulaChangesOf(drafts: FormulaDrafts): { id: string; source: string | null }[] {
  return [...drafts].map(([id, source]) => ({ id, source }));
}

/** 담은 식에서 이제 바꿀 것이 없는 칸을 뺀다(다시 받은 목록 기준) */
export function pruneDrafts(drafts: FormulaDrafts, list: FormulaListResponse): Map<string, string | null> {
  const next = new Map<string, string | null>();
  for (const [key, source] of drafts) {
    const view = list.slots.find((slot) => slot.key === key);
    if (!view) continue;
    if (source === null ? view.override === null : source.trim() === view.source.trim()) continue;
    next.set(key, source);
  }
  return next;
}

/** 처음 고르는 무기: 사람형 맨손 */
export function defaultWeapon(list: FormulaListResponse): FormulaWeaponView | undefined {
  return list.weapons.find((weapon) => weapon.natural === "human") ?? list.weapons[0];
}

/** 식 오류 하나가 가리키는 이름(오타 고치기 단추) */
export function fixFor(issue: FormulaIssue): string | null {
  return issue.suggestion ?? null;
}
