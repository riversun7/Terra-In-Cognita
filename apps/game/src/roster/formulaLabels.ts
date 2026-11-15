// 계산식 글의 이름표 — 사용자 결정 D-556(질문 1253 "2차스탯 페이지에 공식이 안써있고 … 공식이 뭐냐?").
// 사이보그 판(상세 전투 스펙)과 2차 스탯 에디터(/dev/secondary-stats)가 같은 표를 쓴다. 글은 값을 내는 읽은 식에서 만든다
// (@terra/shared/formulaText): 1차 스탯은 스탯 코드(메시지), 2차 스탯 행의 LV·GEAR·BUFF와 사이보그 판 전투 식 변수는 짧은 이름,
// 나머지(개발자 화면의 다른 전투 식 변수)는 식의 이름 그대로다.
import type { FormulaProgram } from "@terra/shared/formula";
import {
  type FormulaText,
  type FormulaTextOptions,
  STAT_ROW_VAR_NAMES,
  combatFormulaSourceText,
  formulaSourceText,
  formulaText,
  formulaTextLine,
  statRowShapeText,
} from "@terra/shared/formulaText";
import { type PrimaryStat, RULE_STAT_ORDER, type RosterStatBreakdown } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { primaryCode } from "./rosterText.ts";

/** 식 변수 이름 → 1차 스탯 */
const PRIMARY_VAR: Readonly<Record<string, PrimaryStat>> = {
  STR: "str",
  DEX: "dex",
  AGI: "agi",
  VIT: "vit",
  INT: "int",
  WIS: "wis",
};

/** max(0, X)를 X로 줄일 변수(1차 스탯 — 0 아래면 0이라는 한 줄을 함께 보인다) */
const PRIMARY_VAR_NAMES: readonly string[] = Object.keys(PRIMARY_VAR);

/** 식 ID마다 "적정 …"이 보는 1차(실제 공격력은 attackStat) */
const APPROPRIATE_OF: Readonly<Record<string, PrimaryStat>> = {
  real_hit: "dex",
  real_crit: "dex",
  bare_hit: "dex",
  bare_crit: "dex",
  attack_interval: "agi",
};

/** 무기 값 W의 이름(식마다) */
function weaponLabel(formulaId: string | null): string {
  switch (formulaId) {
    case "real_attack":
      return m.formula_var_weapon_attack();
    case "real_hit":
    case "bare_hit":
      return m.formula_var_weapon_hit();
    case "real_crit":
    case "bare_crit":
      return m.formula_var_weapon_crit();
    default:
      return m.formula_var_weapon_value();
  }
}

/**
 * 변수 이름표. formulaId = 전투 식 ID(2차 스탯 행이면 null), attackStat = 실제 공격력의 적정 대상 1차(물리 STR·속성 INT)
 */
export function formulaVarLabel(name: string, formulaId: string | null, attackStat?: PrimaryStat): string {
  const primary = PRIMARY_VAR[name];
  if (primary) return primaryCode(primary);
  switch (name) {
    case "LV":
      return m.formula_var_lv();
    case "GEAR":
      return m.formula_var_gear();
    case "BUFF":
      return m.formula_var_buff();
    case "S":
      return formulaId === "real_attack" ? m.formula_var_stat_attack() : name;
    case "P":
      if (formulaId !== "real_attack") return name;
      return attackStat ? primaryCode(attackStat) : m.formula_var_attack_stat();
    case "W":
      return formulaId === null ? name : weaponLabel(formulaId);
    case "A": {
      const stat =
        formulaId === "real_attack" ? attackStat : formulaId ? APPROPRIATE_OF[formulaId] : undefined;
      if (stat) return m.formula_var_appropriate({ stat: primaryCode(stat) });
      return formulaId === "real_attack"
        ? m.formula_var_appropriate({ stat: m.formula_var_attack_stat() })
        : name;
    }
    case "CAP":
      return formulaId === null ? name : m.formula_var_ratio_cap();
    case "I":
      return formulaId === "attack_interval" || formulaId === "bare_interval"
        ? m.formula_var_interval()
        : name;
    case "R":
      return formulaId === "real_stamina_regen" ? m.formula_var_row_regen() : name;
    case "SC":
      return m.formula_var_sta_score();
    case "APP":
      return m.formula_var_sta_appropriate();
    default:
      return name;
  }
}

/** 글 풀이 설정(이름표·확률곡선 이름·1차 max(0, X) 줄임) */
export function formulaTextOptions(formulaId: string | null, attackStat?: PrimaryStat): FormulaTextOptions {
  return {
    varLabel: (name) => formulaVarLabel(name, formulaId, attackStat),
    fnLabel: (fn) => (fn === "curve" ? m.formula_fn_curve() : fn),
    nonNegative: PRIMARY_VAR_NAMES,
  };
}

/** 결과 단위 기호(‰·ms, 그 밖에는 없음) */
export type FormulaLineUnit = "pm" | "ms" | "none";

/** 한 줄: "크리 확률 = AGI + DEX (‰)" */
export function formulaLine(name: string, text: FormulaText, unit: FormulaLineUnit = "none"): string {
  const line = formulaTextLine(text, name);
  const suffix = unit === "pm" ? "(‰)" : unit === "ms" ? "(ms)" : "";
  // 이름에 단위가 이미 있으면("실제 크리 확률(‰)") 다시 붙이지 않는다
  return suffix === "" || name.includes(suffix) ? line : `${line} ${suffix}`;
}

/** 줄인 max(0, X)의 뜻 한 줄(없으면 null) — 글만 읽어도 값과 같게 */
export function formulaFloorNote(text: FormulaText, formulaId: string | null): string | null {
  if (text.floored.length === 0) return null;
  return m.formula_floor_note({
    names: text.floored.map((name) => formulaVarLabel(name, formulaId)).join("·"),
  });
}

/** 확률곡선을 쓰는 글인가(뜻 한 줄을 붙일지) */
export function usesCurve(text: FormulaText): boolean {
  const curve = m.formula_fn_curve();
  return text.body.includes(`${curve}(`) || text.lets.some((item) => item.text.includes(`${curve}(`));
}

/** 읽은 식 → 글(2차 스탯 행이면 formulaId null) */
export function programText(program: FormulaProgram, formulaId: string | null, attackStat?: PrimaryStat) {
  return formulaText(program, formulaTextOptions(formulaId, attackStat));
}

/**
 * 사이보그 판 2차 스탯 줄의 식 글: 행 식이면 그 식, 가중치 행이면 판정과 같은 결과를 내는 행 식(statRowExpression — 서버가 보낸
 * 가중치·기본·상한·반감에서). 읽히지 않으면 null
 */
export function breakdownText(row: RosterStatBreakdown): FormulaText | null {
  const options = formulaTextOptions(null);
  if (row.formula) return formulaSourceText(row.formula.source, STAT_ROW_VAR_NAMES, options);
  const weightOf = new Map(row.terms.map((term) => [term.stat, term.weightPm]));
  const weights = RULE_STAT_ORDER.map((stat) => weightOf.get(stat) ?? 0);
  if (row.shape === "probability") {
    if (row.cap === null || row.halfConstant === null) return null;
    return statRowShapeText(
      { shape: "probability", cap: row.cap, halfConstant: row.halfConstant, weights },
      STAT_ROW_VAR_NAMES,
      options,
    );
  }
  return statRowShapeText({ shape: "quantity", base: row.base, weights }, STAT_ROW_VAR_NAMES, options);
}

/** 사이보그 판 전투 줄의 식 글(서버가 보낸 판정 식 글, 옛 서버면 null) */
export function combatSourceText(
  formula: { readonly id: string; readonly source: string } | undefined,
  attackStat?: PrimaryStat,
): FormulaText | null {
  if (!formula) return null;
  return combatFormulaSourceText(formula.id, formula.source, formulaTextOptions(formula.id, attackStat));
}
