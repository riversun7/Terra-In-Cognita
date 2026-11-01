// 밸런스 화면 가중치 표 — 행 × (1차 6 + 기본·상한·반감) 입력 칸. docs/adr/2026-11-01-balance-screen.md 7절.
// 칸을 고치면(입력을 떠나거나 Enter) 담는다. 담은 칸은 강조, 세계 덮어쓰기(팩과 다름)는 다른 표시, 칸마다 되돌리기 버튼.
// 좁은 화면은 표 안에서만 옆으로 민다(쪽 전체는 밀리지 않는다). 입력은 담은 값이 바뀌면 다시 그린다(key에 보이는 값).
import type { BalanceCellView, BalanceRowView } from "@terra/shared/balance";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import type { StatCellField } from "@terra/shared/tuning";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { fieldText, primaryCode, primaryName } from "./balanceMessages.ts";
import { type Pending, cellState, formatNumber, parseCellInput, shownValue } from "./balanceModel.ts";

/** 열 차례: 1차 화면 차례(STR·VIT, INT·WIS, DEX·AGI) 다음 기본·상한·반감 */
const COLUMNS: readonly StatCellField[] = [...PRIMARY_STATS, "base", "cap", "half"];

interface CellProps {
  readonly row: BalanceRowView;
  readonly cell: BalanceCellView;
  readonly rowName: string;
  readonly pending: Pending;
  readonly locale: string;
  readonly onStage: (row: BalanceRowView, cell: BalanceCellView, value: number | null) => void;
  readonly onUnstage: (row: BalanceRowView, cell: BalanceCellView) => void;
}

function WeightCell({ row, cell, rowName, pending, locale, onStage, onUnstage }: CellProps) {
  const [invalid, setInvalid] = useState(false);
  const state = cellState(row, cell, pending);
  const shown = shownValue(row, cell, pending);
  const label = m.dev_balance_cell_label({ stat: rowName, field: fieldText(cell.field) });
  const commit = (text: string): void => {
    const value = parseCellInput(text, cell.field);
    if (value === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (value !== shown) onStage(row, cell, value);
  };
  return (
    <td className="bp-cell" data-state={state} data-field={cell.field}>
      <span className="bp-cell-box">
        <input
          key={`${cell.field}:${shown}`}
          className="bp-input"
          inputMode="numeric"
          autoComplete="off"
          /* 팩 값은 title(마우스)로만 보이므로 팩과 다른 칸은 읽는 이름에도 넣는다 */
          aria-label={
            state === "pack"
              ? label
              : `${label} (${m.dev_balance_cell_pack({ value: formatNumber(cell.pack, locale) })})`
          }
          aria-invalid={invalid || undefined}
          title={m.dev_balance_cell_pack({ value: formatNumber(cell.pack, locale) })}
          defaultValue={String(shown)}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {state === "pack" ? null : (
          <button
            type="button"
            className="bp-reset"
            aria-label={`${label}: ${state === "staged" ? m.dev_balance_cell_unstage() : m.dev_balance_cell_reset()}`}
            onClick={() => (state === "staged" ? onUnstage(row, cell) : onStage(row, cell, null))}
          >
            ↺
          </button>
        )}
      </span>
    </td>
  );
}

export function BalanceTable(props: {
  readonly rows: readonly BalanceRowView[];
  readonly pending: Pending;
  readonly locale: string;
  readonly onStage: CellProps["onStage"];
  readonly onUnstage: CellProps["onUnstage"];
}) {
  const { rows, pending, locale } = props;
  return (
    <div className="bp-scroll" role="region" aria-label={m.dev_balance_table_title()} tabIndex={0}>
      <table className="bp-table bp-weights">
        <thead>
          <tr>
            <th scope="col" className="bp-th-stat">
              {m.dev_balance_col_stat()}
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                data-field={column}
                title={isPrimary(column) ? `${primaryCode(column)} ${primaryName(column)}` : undefined}
              >
                {fieldText(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowName = locale === "en" ? row.name.en : row.name.ko;
            return (
              <tr key={row.id} data-row={row.id}>
                <th scope="row" className="bp-row-name">
                  <span className="bp-row-label">{rowName}</span>
                  <span className="bp-shape" data-shape={row.shape}>
                    {row.shape === "quantity"
                      ? m.dev_balance_shape_quantity()
                      : m.dev_balance_shape_probability()}
                  </span>
                </th>
                {COLUMNS.map((column) => {
                  const cell = row.cells.find((entry) => entry.field === column);
                  return cell ? (
                    <WeightCell
                      key={column}
                      row={row}
                      cell={cell}
                      rowName={rowName}
                      pending={pending}
                      locale={locale}
                      onStage={props.onStage}
                      onUnstage={props.onUnstage}
                    />
                  ) : (
                    <td key={column} className="bp-cell bp-cell-none" aria-hidden="true">
                      —
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 1차 칸인가(가중치 칸) */
const isPrimary = (column: StatCellField): column is PrimaryStat =>
  (PRIMARY_STATS as readonly string[]).includes(column);
