// 펼친 공식 상자의 첫 줄: 값을 낸 바로 그 식을 글로 푼 것(사용자 결정 D-556 "공식이 안써있고 … 공식이 뭐냐?").
// 예: "공식 크리 확률 = AGI + DEX (‰)". max(0, X)를 줄였으면 "AGI·DEX: 0보다 작으면 0으로 셈", 확률곡선을 쓰면 그 뜻 한 줄을 붙인다.
import type { FormulaText } from "@terra/shared/formulaText";
import { m } from "../paraglide/messages.js";
import { type FormulaLineUnit, formulaFloorNote, formulaLine, usesCurve } from "../roster/formulaLabels.ts";

export function FormulaTextLines({
  name,
  text,
  unit = "none",
  formulaId = null,
  explainCurve = true,
}: {
  name: string;
  text: FormulaText;
  unit?: FormulaLineUnit;
  /** 전투 식 ID(2차 스탯 행이면 null) — 줄인 변수 이름표용 */
  formulaId?: string | null;
  /** 확률곡선 뜻 한 줄(가중치 확률 행은 캡·반감 줄이 따로 있어 끈다) */
  explainCurve?: boolean;
}) {
  const floor = formulaFloorNote(text, formulaId);
  return (
    <>
      <p className="combat-formula combat-formula-text" translate="no">
        <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
        {formulaLine(name, text, unit)}
      </p>
      {floor ? <p className="combat-formula-note">{floor}</p> : null}
      {explainCurve && usesCurve(text) ? (
        <p className="combat-formula-note">{m.formula_curve_note()}</p>
      ) : null}
    </>
  );
}
