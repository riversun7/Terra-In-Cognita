// 2차 스탯 에디터의 식 글 한 줄(사용자 결정 D-556 "2차스탯 페이지에 공식이 안써있고 … 공식이 뭐냐?").
// 그래프·표의 값을 낸 담은 식(computeChartBundle의 programs)을 글로 푼다: "크리 확률 = AGI + DEX (‰)". 글과 값이 같은 식이라 어긋나지 않는다.
// compact = 목록·비교표 줄 안의 작은 글(뜻 줄 없이).
import type { FormulaText } from "@terra/shared/formulaText";
import { m } from "../../paraglide/messages.js";
import {
  type FormulaLineUnit,
  formulaFloorNote,
  formulaLine,
  usesCurve,
} from "../../roster/formulaLabels.ts";

export function SecondaryFormulaLine({
  name,
  text,
  unit,
  formulaId,
  compact = false,
}: {
  name: string;
  text: FormulaText | null;
  unit: FormulaLineUnit;
  /** 전투 식 ID(2차 스탯 행이면 null) */
  formulaId: string | null;
  compact?: boolean;
}) {
  if (compact) {
    if (!text) return null;
    return (
      <span className="sec-formula-compact" translate="no">
        {formulaLine(name, text, unit)}
      </span>
    );
  }
  if (!text) {
    return <p className="field-error sec-formula-line">{m.dev_sec_formula_none()}</p>;
  }
  const floor = formulaFloorNote(text, formulaId);
  return (
    <div className="sec-formula-block" data-testid="sec-formula">
      <p className="sec-formula-line" translate="no">
        <span className="sec-formula-label">{m.cyborg_formula_label()}</span> {formulaLine(name, text, unit)}
      </p>
      {floor ? <p className="field-hint sec-formula-note">{floor}</p> : null}
      {usesCurve(text) ? <p className="field-hint sec-formula-note">{m.formula_curve_note()}</p> : null}
    </div>
  );
}
