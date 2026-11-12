// 아이템 미리 보기의 무기 부분(설계안 3.7, 아이템 편집기 WP-5) — preview.ts가 부른다.
// - 칸마다 실제 공격력·명중·크리·공격 간격: 그 세계의 실효 계산식(TuningState.combatFormulas)과 판정과 같은 변수 함수
//   (@terra/shared/formula sampleScopes). 식을 여기에 박지 않는다. 공격력 = 스탯 공격력 + 무기 몫(D-502).
// - 몫마다 비율(D-502, 사용자 답 296~298): 기준 유닛(가운데 자리)의 1차(공격 몫 STR·INT, 명중·크리 DEX, 공격 간격 AGI) ÷ 무기의 1차
//   적정 스탯, 상한 N10(1000‰). 적정이 없는 몫은 100%(판정 weaponRatioPm·전투 실험실 appropriateView와 같은 식).
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  type FormulaCoefficients,
  type FormulaSampleWeapon,
  evaluateFormula,
  evaluateFormulaInt,
  sampleScopes,
  staminaAppropriateScope,
  staminaScoreScope,
} from "@terra/shared/formula";
import type { ItemEditorPreviewResponse, WeaponPartRatio } from "@terra/shared/itemEditor";
import type { Loadout, WeaponSpec } from "@terra/sim";
import type { TuningState } from "../tuning/state.ts";

/** 비율(‰) = min(상한, 유닛 1차 × 1000 ÷ 적정)(내림). 적정이 없거나 0 이하면 무기 값 그대로(1000‰, 식 if(A <= 0, W, …)) */
export function efficiencyPm(stat: number, appropriate: number, capPm: number): number {
  if (appropriate <= 0) return 1000;
  return Math.min(capPm, Math.floor((Math.max(0, stat) * 1000) / appropriate));
}

/** 기준 유닛의 무기 몫마다 비율(무기에 있는 공격력 칸만, 그다음 명중·크리·공격 간격) */
export function weaponParts(weapon: WeaponSpec, middle: Loadout, capPm: number): WeaponPartRatio[] {
  const p = middle.primaries;
  const a = weapon.appropriate ?? {};
  const part = (
    id: WeaponPartRatio["part"],
    stat: WeaponPartRatio["stat"],
    value: number,
    appropriate: number | undefined,
  ): WeaponPartRatio => ({
    part: id,
    stat,
    value,
    appropriate: appropriate ?? null,
    ratioPm: efficiencyPm(value, appropriate ?? 0, capPm),
  });
  return [
    ...(weapon.physical ? [part("physical", "str", p.str, a.str)] : []),
    ...(weapon.elemental ? [part("elemental", "int", p.int, a.int)] : []),
    part("hit", "dex", p.dex, a.dex),
    part("crit", "dex", p.dex, a.dex),
    part("speed", "agi", p.agi, a.agi),
  ];
}

/** 레벨만 보는 식(무기와 상관없음) */
const LEVEL_ONLY_FORMULAS: ReadonlySet<string> = new Set(["bare_appropriate", "stamina_appropriate"]);
/** 맨손 자료만 쓰는 식(맨손 크리, 2026-11-12) — 아이템 무기는 맨손이 아니라 보이지 않는다 */
const BARE_ONLY_FORMULAS: ReadonlySet<string> = new Set(["bare_crit"]);

export interface WeaponPreviewInput {
  /** 전투가 쓰는 무기 사양(1차 적정 스탯 포함) */
  readonly spec: WeaponSpec;
  readonly middle: Loadout;
  readonly level: number;
  readonly tuning: TuningState | undefined;
  readonly coefficients: FormulaCoefficients;
}

/** 무기 미리 보기(칸마다 전투 식 값·몫마다 비율) */
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
      appropriate: { ...spec.appropriate },
      hitPm: spec.hitPm,
      critPm: spec.critPm,
      intervalMs: spec.intervalMs,
      staminaCost: spec.staminaCost,
      unarmed: false,
    };
    const scopeInput = { primaries, level: input.level, rows: [], weapon: sample, coefficients };
    const staminaScore = evaluateFormulaInt(
      formulas.stamina_score,
      staminaScoreScope(primaries, coefficients.staminaWeightsPm),
    );
    // 적정 STA 점수(D-511 레벨 식): 기준 유닛 레벨로 셈해 소모·회복의 APP로 넣는다(판정과 같은 차례)
    const staminaAppropriate = Math.max(
      0,
      evaluateFormula(formulas.stamina_appropriate, staminaAppropriateScope(input.level)),
    );
    const scopes = sampleScopes(scopeInput, middle.stats, staminaScore, 0, staminaAppropriate);
    return [
      {
        kind,
        // 레벨만 보는 식(맨손 적정 bare_appropriate·적정 STA stamina_appropriate)은 무기 값이 아니라 보이지 않는다
        // 맨손 크리(bare_crit)도 아이템 무기에는 쓰지 않아 뺀다
        values: COMBAT_FORMULA_IDS.filter(
          (id) => !LEVEL_ONLY_FORMULAS.has(id) && !BARE_ONLY_FORMULAS.has(id),
        ).map((id) => {
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
  return {
    fields,
    parts: weaponParts(spec, middle, coefficients.capPm),
    capPm: coefficients.capPm,
  };
}
