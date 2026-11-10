// 사다리 칸(레벨·등급마다 값 하나) — docs/adr/2026-11-10-editor-input-controls.md. 스킬 등급 배율처럼 차례가 있는 값 줄을 한 표로:
// 줄마다 값 칸(− / +, ↑↓) + 막대(줄들이 나란히 서서 곡선이 보인다), 머리에 작은 곡선. 여러 줄을 골라 한꺼번에 바꾸거나
// (값으로·더하기·곱하기·선형·등비 채우기) 칸 모서리를 끌어 아래로 채운다. 값은 범위 안 정수만 든다.
// 칸은 공용 NumberField(hideLabel)라 pathOf를 주면 담음·팩과 다름 표지와 팩 값 눈금이 붙는다.
import { m } from "../../paraglide/messages.js";
import { NumberField } from "./contentEditorFields.tsx";
import { GridBulkBar, Sparkline, useGridSelection } from "./contentEditorGrid.tsx";
import {
  type IntLimits,
  LINEAR_SPAN_MAX,
  bulkApply,
  dragFill,
  niceCeil,
  pickedByColumn,
} from "./contentEditorNumeric.ts";
import "./contentEditorInputs.css";

export function LadderEditor({
  name,
  values,
  limits,
  unit,
  rowLabel,
  pathOf,
  onChange,
  className,
}: {
  /** 묶음 이름(표 이름·곡선 읽는 이름) */
  name: string;
  values: readonly number[];
  limits: IntLimits;
  unit?: string | undefined;
  /** 줄 이름(1등급 …) */
  rowLabel: (index: number) => string;
  /** 팩 항목 안 경로(견주기) */
  pathOf?: ((index: number) => string) | undefined;
  onChange: (next: number[]) => void;
  className?: string | undefined;
}) {
  const grid = useGridSelection();
  const rows = pickedByColumn(grid.picked).get(0) ?? [];
  // 줄마다 같은 막대 범위를 쓴다(곡선을 견줄 수 있게): 넓은 기술 범위는 가장 큰 값의 2배까지로 좁힌다
  const soft: readonly [number, number] | undefined =
    limits.max - limits.min > LINEAR_SPAN_MAX
      ? [Math.max(limits.min, 0), Math.min(limits.max, niceCeil(Math.max(...values, 50) * 2))]
      : undefined;
  return (
    <div className={`ce-ladder ${className ?? ""}`}>
      <GridBulkBar
        count={rows.length}
        limits={limits}
        unit={unit}
        canFill={rows.length >= 2}
        onApply={(op) => onChange(bulkApply(values, rows, op, limits))}
        onClear={grid.clear}
      />
      <div className="dev-table-wrap">
        <table className="dev-table ce-ladder-table">
          <caption className="visually-hidden">{name}</caption>
          <thead>
            <tr>
              <th scope="col" className="ce-ladder-step">
                <button
                  type="button"
                  className="ce-col-pick"
                  aria-label={m.dev_grid_select_column({ name })}
                  title={m.dev_grid_select_column({ name })}
                  onClick={() => grid.pickColumn(0, values.length)}
                >
                  {name}
                </button>
              </th>
              <th scope="col" className="ce-ladder-curve">
                <Sparkline name={name} values={values} />
              </th>
            </tr>
          </thead>
          <tbody>
            {values.map((value, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- 줄 차례가 곧 열쇠다(등급·레벨 차례)
              <tr key={index} data-ladder-row={index}>
                <th scope="row" className="ce-ladder-step">
                  {rowLabel(index)}
                </th>
                <td className="ce-ladder-cell" {...grid.cellProps(index, 0)}>
                  <NumberField
                    label={rowLabel(index)}
                    hideLabel
                    slider
                    soft={soft}
                    path={pathOf?.(index)}
                    unit={unit}
                    value={value}
                    min={limits.min}
                    max={limits.max}
                    onChange={(next) => {
                      if (next === undefined) return;
                      const out = [...values];
                      out[index] = next;
                      onChange(out);
                    }}
                  />
                  {grid.fillHandle(index, 0, (from, to) => onChange(dragFill(values, from, to)))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
