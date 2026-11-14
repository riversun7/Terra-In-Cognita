// 2차 스탯 에디터 화면 모델(순수 함수) — 대상 목록, 가중치/수식 초안 관리, 그래프 데이터 조립, 저장 페이로드 생성.
// 걷기 속도(walk_speed / D-540)는 제외 범위다.
import type { BalancePrimaries, BalanceRowView, BalanceTableResponse } from "@terra/shared/balance";
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  type CombatFormulaId,
  FX_SCALE,
  type FormulaIssue,
  type FormulaListResponse,
  type FormulaProgram,
  type FormulaSlotView,
  type FormulaWeaponView,
  STAT_FORMULA_VARS,
  compileFormulaOrThrow,
  isCombatFormulaId,
  parseFormula,
  slotVarNames,
  statFormulaKey,
  statFormulaSlot,
} from "@terra/shared/formula";
import {
  type ArchetypeLevelCurve,
  type CompiledSecondaryPrograms,
  type KBandPoint,
  type OrderedPrimaryInfluence,
  type ProbabilityCurvePoint,
  SECONDARY_ARCHETYPE_IDS,
  SECONDARY_ARCHETYPE_WEIGHTS,
  SECONDARY_DERIVED_COMBAT_IDS,
  SECONDARY_ROW_CATEGORIES,
  type SecondaryArchetypeId,
  type SecondaryComparisonRow,
  type SecondaryStatCategory,
  archetypeInitialPrimaries,
  buildArchetypeLevelCurves,
  buildComparisonMatrix,
  buildKBandCurve,
  buildProbabilityCurve,
  compileStatRowFromValues,
  growPrimaries,
  probabilityWeightedScore,
  rowCellMap,
  rowExpressionFromValues,
  secondaryPrimaryInfluence,
} from "@terra/shared/secondaryStatsSim";
import {
  STAT_WEIGHT_FIELDS,
  type StatCellField,
  TUNING_REASONS,
  type TuningReason,
} from "@terra/shared/tuning";
import { field } from "../../net/json.ts";

/** 제외 대상(D-540 걷기 속도) */
export const EXCLUDED_STAT_ID = "walk_speed";

/** 대체된 옛 2차 스탯 참고 안내(비활성 행 → 대체 전투식) */
export const LEGACY_INACTIVE_ROWS: readonly { readonly id: string; readonly replacedBy: string }[] = [
  { id: "hit", replacedBy: "real_hit / bare_hit" },
  { id: "crit_chance", replacedBy: "real_crit / bare_crit" },
  { id: "action_speed", replacedBy: "attack_interval / bare_interval" },
];

export type StatRowMode = "weights" | "world_formula" | "pack_formula";

export type TargetEntry =
  | {
      readonly kind: "stat";
      readonly key: string;
      readonly row: BalanceRowView;
      readonly slot: FormulaSlotView | null;
      readonly category: Exclude<SecondaryStatCategory, "combat">;
      readonly name: { readonly ko: string; readonly en: string };
    }
  | {
      readonly kind: "combat";
      /** 목록·평가 고유 키("combat:<식 ID>"). 2차 스탯 행 crit_multiplier와 충돌하지 않는다 */
      readonly key: string;
      readonly formulaId: CombatFormulaId;
      readonly slot: FormulaSlotView;
      readonly category: "combat";
      readonly name: { readonly ko: string; readonly en: string };
    };

/** 담기 상태: 가중치/기본/상한/반감 초안 + 수식 초안 */
export interface SecondaryDraftState {
  readonly cellDrafts: ReadonlyMap<string, number>;
  readonly formulaDrafts: ReadonlyMap<string, string | null>;
}

export const EMPTY_DRAFTS: SecondaryDraftState = {
  cellDrafts: new Map(),
  formulaDrafts: new Map(),
};

export function categoryOfRowId(rowId: string): Exclude<SecondaryStatCategory, "combat"> {
  const cat = SECONDARY_ROW_CATEGORIES[rowId];
  if (!cat || cat === "combat") return "efficiency";
  return cat;
}

/** 목록 조립(walk_speed 제외, 5개 2차 스탯 묶음 + 파생 전투식) */
export function buildTargetCatalog(
  table: BalanceTableResponse,
  formulas: FormulaListResponse,
): TargetEntry[] {
  const slotByKey = new Map(formulas.slots.map((slot) => [slot.key, slot]));
  const statTargets: TargetEntry[] = table.rows
    .filter((row) => row.id !== EXCLUDED_STAT_ID)
    .map((row) => ({
      kind: "stat" as const,
      key: row.id,
      row,
      slot: slotByKey.get(statFormulaKey(row.id)) ?? null,
      category: categoryOfRowId(row.id),
      name: row.name,
    }));
  const combatTargets: TargetEntry[] = SECONDARY_DERIVED_COMBAT_IDS.flatMap((id) => {
    const slot = slotByKey.get(id);
    if (!slot) return [];
    return [
      {
        kind: "combat" as const,
        key: `combat:${id}`,
        formulaId: id,
        slot,
        category: "combat" as const,
        name: slot.name,
      },
    ];
  });
  return [...statTargets, ...combatTargets];
}

/** 칸 현재 값(초안 → 실효값) */
export function effectiveCellValues(
  row: BalanceRowView,
  cellDrafts: ReadonlyMap<string, number>,
): Record<StatCellField, number> {
  const base = rowCellMap(row);
  for (const cell of row.cells) {
    const draft = cellDrafts.get(`${row.id}.${cell.field}`);
    if (draft !== undefined) base[cell.field] = draft;
  }
  return base;
}

/** 행의 현재 계산 모드(가중치 vs 세계 수식 vs 팩 수식) */
export function statRowModeOf(
  row: BalanceRowView,
  slot: FormulaSlotView | null,
  formulaDrafts: ReadonlyMap<string, string | null>,
): StatRowMode {
  const formulaKey = statFormulaKey(row.id);
  const draft = formulaDrafts.get(formulaKey);
  if (draft !== undefined) {
    if (draft !== null) return "world_formula";
    return row.formula === "pack" ? "pack_formula" : "weights";
  }
  if (slot?.override !== null || row.formula === "world") return "world_formula";
  if (row.formula === "pack") return "pack_formula";
  return "weights";
}

/** 수식 편집기에서 사용할 슬롯 정의 */
export function formulaSlotDefOf(target: TargetEntry) {
  if (target.kind === "combat") return COMBAT_FORMULA_SLOTS[target.formulaId];
  return statFormulaSlot(target.row.id, target.row.shape);
}

/** 수식 편집기 텍스트 */
export function targetFormulaSourceOf(target: TargetEntry, drafts: SecondaryDraftState): string {
  if (target.kind === "combat") {
    const draft = drafts.formulaDrafts.get(target.formulaId);
    if (draft !== undefined) return draft === null ? target.slot.packSource : draft;
    return target.slot.source;
  }
  const key = statFormulaKey(target.row.id);
  const draft = drafts.formulaDrafts.get(key);
  if (draft !== undefined) {
    if (draft !== null) return draft;
    if (target.row.formula === "pack" && target.slot) return target.slot.packSource;
    return rowExpressionFromValues(target.row.shape, effectiveCellValues(target.row, drafts.cellDrafts));
  }
  if (target.slot && (target.slot.override !== null || target.row.formula === "pack")) {
    return target.slot.source;
  }
  return rowExpressionFromValues(target.row.shape, effectiveCellValues(target.row, drafts.cellDrafts));
}

/** 수식 문법 검사 */
export function validateTargetFormula(
  target: TargetEntry,
  source: string,
):
  | { ok: true; program: FormulaProgram; issues: readonly FormulaIssue[] }
  | { ok: false; issues: readonly FormulaIssue[] } {
  const result = parseFormula(source, slotVarNames(formulaSlotDefOf(target)));
  if (result.ok) return { ok: true, program: result.program, issues: result.warnings };
  return { ok: false, issues: result.errors };
}

const STAT_VAR_NAMES = STAT_FORMULA_VARS.map((item) => item.name);

/** 전체 활성 행·전투식 프로그램 컴파일(useDraft=false면 수정 전 실효값) */
export function compilePrograms(
  table: BalanceTableResponse,
  formulas: FormulaListResponse,
  drafts: SecondaryDraftState,
  useDraft: boolean,
): CompiledSecondaryPrograms {
  const slotByKey = new Map(formulas.slots.map((slot) => [slot.key, slot]));
  const rows = table.rows.map((row) => {
    const slot = slotByKey.get(statFormulaKey(row.id)) ?? null;
    if (useDraft) {
      const mode = statRowModeOf(row, slot, drafts.formulaDrafts);
      if (mode === "weights") {
        const values = effectiveCellValues(row, drafts.cellDrafts);
        return { id: row.id, program: compileStatRowFromValues(row.shape, values) };
      }
      const key = statFormulaKey(row.id);
      const source = drafts.formulaDrafts.get(key) ?? slot?.source;
      if (source) {
        const parsed = parseFormula(source, STAT_VAR_NAMES);
        if (parsed.ok) return { id: row.id, program: parsed.program };
      }
    }
    if (row.formula !== null && slot) {
      const parsed = parseFormula(slot.source, STAT_VAR_NAMES);
      if (parsed.ok) return { id: row.id, program: parsed.program };
    }
    return { id: row.id, program: compileStatRowFromValues(row.shape, rowCellMap(row)) };
  });

  const combatMap = new Map<CombatFormulaId, FormulaProgram>();
  for (const id of COMBAT_FORMULA_IDS) {
    const slot = slotByKey.get(id);
    const allowed = slotVarNames(COMBAT_FORMULA_SLOTS[id]);
    const rawDraft = useDraft ? drafts.formulaDrafts.get(id) : undefined;
    const candidate = rawDraft === undefined ? slot?.source : (rawDraft ?? slot?.packSource);
    const parsed = candidate ? parseFormula(candidate, allowed) : null;
    if (parsed?.ok) {
      combatMap.set(id, parsed.program);
      continue;
    }
    const fallback = slot ? parseFormula(slot.source, allowed) : null;
    combatMap.set(id, fallback?.ok ? fallback.program : compileFormulaOrThrow("0", allowed));
  }
  const pick = (id: CombatFormulaId): FormulaProgram => {
    const p = combatMap.get(id);
    if (!p) throw new Error(`missing combat formula: ${id}`);
    return p;
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
      bare_hit: pick("bare_hit"),
      bare_interval: pick("bare_interval"),
      walk_speed: pick("walk_speed"),
    },
  };
}

/** 선택 대상에 대한 가중치/수식 단위 설명 */
export function targetUnitKind(target: TargetEntry): "pm" | "x" | "ms" | "points" {
  if (target.kind === "stat") {
    if (target.row.shape === "probability") return "pm";
    if (target.row.id === "crit_multiplier") return "x";
    return "points";
  }
  const slot = COMBAT_FORMULA_SLOTS[target.formulaId];
  if (slot.unit === "pm") return "pm";
  if (slot.unit === "ms") return "ms";
  if (slot.unit === "x") return "x";
  return "points";
}

export interface SimulationConfig {
  readonly archetype: SecondaryArchetypeId | "custom";
  readonly customWeights: BalancePrimaries;
  readonly showCustomInCurves: boolean;
  readonly initialSum: number;
  readonly maxLevel: number;
  readonly focusLevel: number;
  readonly growthPm: number;
  readonly kPm: number;
  readonly showBaseline: boolean;
  readonly weaponId: string;
}

export interface SecondaryChartBundle {
  readonly influence: { readonly base: number; readonly items: readonly OrderedPrimaryInfluence[] };
  readonly curves: readonly ArchetypeLevelCurve[];
  readonly kBand: readonly KBandPoint[];
  readonly probabilityCurve: readonly ProbabilityCurvePoint[] | null;
  readonly probabilityMarker: {
    readonly score: number;
    readonly valuePm: number;
    readonly cap: number;
    readonly half: number;
  } | null;
  readonly matrix: readonly SecondaryComparisonRow[];
}

/** 4종 차트 + 전체 비교표 데이터를 한 번에 계산 */
export function computeChartBundle(
  target: TargetEntry,
  table: BalanceTableResponse,
  formulas: FormulaListResponse,
  drafts: SecondaryDraftState,
  config: SimulationConfig,
): SecondaryChartBundle {
  const draftPrograms = compilePrograms(table, formulas, drafts, true);
  const baselinePrograms = config.showBaseline ? compilePrograms(table, formulas, EMPTY_DRAFTS, false) : null;
  const weapon: FormulaWeaponView | undefined =
    formulas.weapons.find((w) => w.id === config.weaponId) ?? formulas.weapons[0];
  const fallbackWeapon = weapon ?? {
    id: "natural_human",
    name: { ko: "맨손", en: "Unarmed" },
    natural: "human",
    kind: "physical" as const,
    attack: 0,
    appropriate: {},
    hitPm: 1000,
    critPm: 50,
    intervalMs: 2000,
    staminaCost: 10,
    unarmed: true,
  };

  const selectedWeights =
    config.archetype === "custom" ? config.customWeights : SECONDARY_ARCHETYPE_WEIGHTS[config.archetype];
  const initialSelected = archetypeInitialPrimaries(selectedWeights, config.initialSum);
  const focusPrimaries = growPrimaries(initialSelected, config.growthPm, config.kPm, config.focusLevel);

  const influence = secondaryPrimaryInfluence(
    target.key,
    config.focusLevel,
    focusPrimaries,
    draftPrograms,
    fallbackWeapon,
    formulas.coefficients,
  );

  const archetypes: { id: string; weights: BalancePrimaries }[] = SECONDARY_ARCHETYPE_IDS.map((id) => ({
    id,
    weights: SECONDARY_ARCHETYPE_WEIGHTS[id],
  }));
  if (config.showCustomInCurves || config.archetype === "custom") {
    archetypes.push({ id: "custom", weights: config.customWeights });
  }

  const curves = buildArchetypeLevelCurves({
    targetKey: target.key,
    archetypes,
    initialSum: config.initialSum,
    growthPm: config.growthPm,
    kPm: config.kPm,
    maxLevel: config.maxLevel,
    draftPrograms,
    baselinePrograms,
    weapon: fallbackWeapon,
    coefficients: formulas.coefficients,
  });

  const kMinPm = formulas.growth?.kMinPm ?? 800;
  const kMaxPm = formulas.growth?.kMaxPm ?? 1200;
  const kBand = buildKBandCurve({
    targetKey: target.key,
    weights: selectedWeights,
    initialSum: config.initialSum,
    growthPm: config.growthPm,
    kMinPm,
    kMidPm: config.kPm,
    kMaxPm,
    maxLevel: config.maxLevel,
    programs: draftPrograms,
    weapon: fallbackWeapon,
    coefficients: formulas.coefficients,
  });

  let probabilityCurve: readonly ProbabilityCurvePoint[] | null = null;
  let probabilityMarker: SecondaryChartBundle["probabilityMarker"] = null;
  if (target.kind === "stat" && target.row.shape === "probability") {
    const mode = statRowModeOf(target.row, target.slot, drafts.formulaDrafts);
    if (mode === "weights") {
      const values = effectiveCellValues(target.row, drafts.cellDrafts);
      const currentScore = Math.max(0, probabilityWeightedScore(values, focusPrimaries));
      const maxCurveScore = Math.max(values.half * 3, currentScore * 1.4, 200);
      probabilityCurve = buildProbabilityCurve(values.cap, values.half, maxCurveScore);
      const valuePm =
        probabilityCurve.find((pt) => pt.score === currentScore)?.valuePm ??
        Math.floor((values.cap * currentScore) / Math.max(1, currentScore + values.half));
      probabilityMarker = {
        score: currentScore,
        valuePm,
        cap: values.cap,
        half: values.half,
      };
    }
  }

  const activeRowIds = table.rows.filter((r) => r.id !== EXCLUDED_STAT_ID).map((r) => r.id);
  const matrix = buildComparisonMatrix({
    rowIds: activeRowIds,
    level: config.focusLevel,
    archetypes,
    initialSum: config.initialSum,
    growthPm: config.growthPm,
    kPm: config.kPm,
    draftPrograms,
    baselinePrograms: baselinePrograms ?? compilePrograms(table, formulas, EMPTY_DRAFTS, false),
    weapon: fallbackWeapon,
    coefficients: formulas.coefficients,
  });

  return {
    influence,
    curves,
    kBand,
    probabilityCurve,
    probabilityMarker,
    matrix,
  };
}

/** 대상(선택된 행/전투식)과 관련된 초안만 되돌리기 */
export function revertTargetDrafts(target: TargetEntry, drafts: SecondaryDraftState): SecondaryDraftState {
  const nextCells = new Map(drafts.cellDrafts);
  const nextFormulas = new Map(drafts.formulaDrafts);
  if (target.kind === "stat") {
    for (const cell of target.row.cells) nextCells.delete(`${target.row.id}.${cell.field}`);
    nextFormulas.delete(statFormulaKey(target.row.id));
  } else {
    nextFormulas.delete(target.formulaId);
  }
  return { cellDrafts: nextCells, formulaDrafts: nextFormulas };
}

/** 특정 행·전투식에 수정된 초안이 있는지 */
export function hasTargetChanges(target: TargetEntry, drafts: SecondaryDraftState): boolean {
  if (target.kind === "combat") return drafts.formulaDrafts.has(target.formulaId);
  if (drafts.formulaDrafts.has(statFormulaKey(target.row.id))) return true;
  return target.row.cells.some((cell) => drafts.cellDrafts.has(`${target.row.id}.${cell.field}`));
}

/** tuning.save 페이로드 조립 */
export function buildSavePayload(drafts: SecondaryDraftState) {
  const changes = [...drafts.cellDrafts.entries()].map(([id, value]) => ({ id, value }));
  const formulas = [...drafts.formulaDrafts.entries()].map(([id, source]) => ({ id, source }));
  return { changes, formulas, totalCount: changes.length + formulas.length };
}

function isTuningReason(value: string): value is TuningReason {
  return (TUNING_REASONS as readonly string[]).includes(value);
}

/** 서버 오류 코드 추출 */
export function extractErrorKey(
  error: unknown,
): TuningReason | "forbidden" | "unauthorized" | "unavailable" | "network" | "unknown" {
  const data = field(error, "data");
  const code = field(data, "code");
  const reason = field(data, "reason");
  if (typeof reason === "string" && isTuningReason(reason)) {
    return reason;
  }
  switch (code) {
    case "UNAUTHORIZED":
      return "unauthorized";
    case "FORBIDDEN":
      return "forbidden";
    case "NOT_FOUND":
      return "unavailable";
    case undefined:
      return "network";
    default:
      return "unknown";
  }
}

export const WEIGHT_ORDER = STAT_WEIGHT_FIELDS;
export { FX_SCALE, isCombatFormulaId };
