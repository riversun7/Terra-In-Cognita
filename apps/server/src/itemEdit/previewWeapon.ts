// 아이템 미리 보기의 무기 부분(설계안 3.7, 아이템 편집기 WP-5) — preview.ts가 부른다.
// - 칸마다 실제 공격력·명중·크리·공격 간격: 그 세계의 실효 계산식(TuningState.combatFormulas)과 판정과 같은 변수 함수
//   (@terra/shared/formula sampleScopes). 식을 여기에 박지 않는다.
// - 1차 적정 스탯(D-496, 질문 290 가)이 있으면 셈한 2차 적정치와 그 풀이(가중치 항 또는 행 식). 전투도 이 값을 쓴다(WP-5).
// - 효율: 기준 유닛(가운데 자리)의 행 값 ÷ 전투가 쓰는 적정치, 상한 N10(무기 틀 D-420, 전투 실험실 appropriateView와 같은 식).
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  type FormulaCoefficients,
  type FormulaSampleWeapon,
  evaluateFormula,
  evaluateFormulaInt,
  sampleScopes,
  staminaScoreScope,
} from "@terra/shared/formula";
import {
  APPROPRIATE_ROW_IDS,
  type AppropriateRowId,
  type AppropriateTerms,
  type ItemEditorPreviewResponse,
  type WeaponEfficiency,
} from "@terra/shared/itemEditor";
import { RULE_STAT_ORDER } from "@terra/shared/roster";
import {
  type Loadout,
  type PrimaryAppropriate,
  type StatRow,
  type WeaponSpec,
  appropriateFromPrimaries,
  explainSecondary,
} from "@terra/sim";
import type { TuningState } from "../tuning/state.ts";

/** 무기 사양에서 적정치 칸 하나(행 → 무기 칸) */
function appropriateOf(weapon: WeaponSpec, row: AppropriateRowId): number | null {
  if (row === "physical_attack") return weapon.physical?.attackAppropriate ?? null;
  if (row === "elemental_attack") return weapon.elemental?.attackAppropriate ?? null;
  if (row === "hit") return weapon.hitAppropriate;
  if (row === "crit_chance") return weapon.critAppropriate;
  return weapon.speedAppropriate;
}

/** 비율(‰) = min(상한, 유닛 값 × 1000 ÷ 적정치). 적정치 0 이하면 무기 값 그대로(1000‰, 식 if(A <= 0, W, …)) */
export function efficiencyPm(stat: number, appropriate: number, capPm: number): number {
  if (appropriate <= 0) return 1000;
  return Math.min(capPm, Math.floor((Math.max(0, stat) * 1000) / appropriate));
}

/** 기준 유닛의 무기 효율(무기에 있는 칸만: 공격력 칸이 없는 쪽은 뺀다) */
export function weaponEfficiency(weapon: WeaponSpec, middle: Loadout, capPm: number): WeaponEfficiency[] {
  return APPROPRIATE_ROW_IDS.flatMap((row) => {
    const appropriate = appropriateOf(weapon, row);
    if (appropriate === null) return [];
    const stat = middle.stats[row] ?? 0;
    return [{ row, stat, appropriate, ratioPm: efficiencyPm(stat, appropriate, capPm) }];
  });
}

/** 1차 적정 스탯 → 적정 행마다 풀이(그 1차만 가진 유닛, 장비·버프 0, LV 1 — appropriateFromPrimaries와 같은 입력) */
export function appropriateTerms(
  appropriate: PrimaryAppropriate,
  table: readonly StatRow[],
): AppropriateTerms[] {
  const primaries = {
    str: appropriate.str ?? 0,
    dex: appropriate.dex ?? 0,
    agi: appropriate.agi ?? 0,
    vit: appropriate.vit ?? 0,
    int: appropriate.int ?? 0,
    wis: appropriate.wis ?? 0,
  };
  const rows = new Map(explainSecondary(primaries, table, {}, {}, 1).map((row) => [row.id, row]));
  return APPROPRIATE_ROW_IDS.flatMap((id) => {
    const row = rows.get(id);
    if (!row) return [];
    return [
      {
        row: id,
        value: row.value,
        base: row.base,
        terms: row.terms.flatMap((term) => {
          const stat = RULE_STAT_ORDER[term.index];
          return stat ? [{ stat, value: term.value, weightPm: term.weightPm }] : [];
        }),
        formula: row.formula?.source ?? null,
      },
    ];
  });
}

export interface WeaponPreviewInput {
  /** 전투가 쓰는 무기 사양(1차 적정 스탯이 있으면 셈한 적정치가 든 것) */
  readonly spec: WeaponSpec;
  readonly appropriate: PrimaryAppropriate | undefined;
  readonly middle: Loadout;
  readonly level: number;
  readonly table: readonly StatRow[];
  readonly tuning: TuningState | undefined;
  readonly coefficients: FormulaCoefficients;
}

/** 무기 미리 보기(칸마다 전투 식 값·셈한 적정치·풀이·효율) */
export function previewWeapon(input: WeaponPreviewInput): NonNullable<ItemEditorPreviewResponse["weapon"]> {
  const { spec, middle, tuning, coefficients } = input;
  const formulas = tuning?.combatFormulas();
  const overridden = new Set(tuning ? [...tuning.snapshot().formulas.keys()] : []);
  const p = middle.primaries;
  const primaries = [p.str, p.dex, p.agi, p.vit, p.int, p.wis];
  const fields = (["physical", "elemental"] as const).flatMap((kind) => {
    const field = spec[kind];
    if (!field || !formulas) return [];
    const sample: FormulaSampleWeapon = {
      kind,
      attack: field.attack,
      attackAppropriate: field.attackAppropriate,
      hitPm: spec.hitPm,
      hitAppropriate: spec.hitAppropriate,
      critPm: spec.critPm,
      critAppropriate: spec.critAppropriate,
      intervalMs: spec.intervalMs,
      speedAppropriate: spec.speedAppropriate,
      staminaCost: spec.staminaCost,
      unarmed: false,
    };
    const scopeInput = { primaries, level: input.level, rows: [], weapon: sample, coefficients };
    const staminaScore = evaluateFormulaInt(
      formulas.stamina_score,
      staminaScoreScope(primaries, coefficients.staminaWeightsPm),
    );
    const scopes = sampleScopes(scopeInput, middle.stats, staminaScore);
    return [
      {
        kind,
        values: COMBAT_FORMULA_IDS.filter((id) => id !== "bare_attack").map((id) => {
          const slot = COMBAT_FORMULA_SLOTS[id];
          return {
            id,
            value:
              slot.result === "int"
                ? evaluateFormulaInt(formulas[id], scopes[id])
                : evaluateFormula(formulas[id], scopes[id]),
            result: slot.result,
            overridden: overridden.has(id),
          };
        }),
      },
    ];
  });
  let derived: NonNullable<ItemEditorPreviewResponse["weapon"]>["derived"] = null;
  let derivedTerms: AppropriateTerms[] | null = null;
  if (input.appropriate) {
    try {
      derived = appropriateFromPrimaries(input.appropriate, input.table);
      derivedTerms = appropriateTerms(input.appropriate, input.table);
    } catch {
      derived = null;
      derivedTerms = null;
    }
  }
  return {
    fields,
    derived,
    derivedTerms,
    efficiency: weaponEfficiency(spec, middle, coefficients.capPm),
    capPm: coefficients.capPm,
  };
}
