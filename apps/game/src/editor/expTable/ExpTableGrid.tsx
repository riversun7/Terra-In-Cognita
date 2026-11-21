// 유닛 경험치 테이블 레벨별 편집 표(/dev/exp-table)
import { EXP_TABLE_LIMITS, type ExpTableRowView } from "@terra/shared/expTable";
import { m } from "../../paraglide/messages.js";
import { fmtDecimal, fmtDuration, fmtInt } from "./expTableFormat.ts";
import type { ComputedExpRow } from "./expTableModel.ts";

export type ExpTableFilter = "all" | "base" | "prestige" | "changed";

interface ExpTableGridProps {
  readonly allRows: readonly ComputedExpRow[];
  readonly visibleRows: readonly ComputedExpRow[];
  readonly serverRows: readonly ExpTableRowView[];
  readonly filter: ExpTableFilter;
  readonly baseCapLevel: number;
  readonly maxLevel: number;
  readonly focusLevel: number;
  readonly locale: string;
  readonly ko: boolean;
  readonly onFilter: (next: ExpTableFilter) => void;
  readonly onFocusLevel: (level: number) => void;
  readonly onEditSpan: (level: number, requiredExp: number) => void;
  readonly onRevertRow: (row: ExpTableRowView) => void;
}

export function ExpTableGrid({
  allRows,
  visibleRows,
  serverRows,
  filter,
  baseCapLevel,
  maxLevel,
  focusLevel,
  locale,
  ko,
  onFilter,
  onFocusLevel,
  onEditSpan,
  onRevertRow,
}: ExpTableGridProps) {
  return (
    <section className="exp-panel" aria-label={m.dev_exp_table_title()}>
      <div className="exp-table-head">
        <h2>{m.dev_exp_table_title()}</h2>
        <div className="exp-pills">
          {(
            [
              ["all", m.dev_exp_filter_all({ count: allRows.length })],
              [
                "base",
                m.dev_exp_filter_base({
                  cap: baseCapLevel,
                  count: allRows.filter((row) => !row.isPrestige).length,
                }),
              ],
              [
                "prestige",
                m.dev_exp_filter_prestige({
                  cap: baseCapLevel,
                  max: maxLevel,
                  count: allRows.filter((row) => row.isPrestige).length,
                }),
              ],
              [
                "changed",
                m.dev_exp_filter_changed({
                  count: allRows.filter((row) => row.staged || row.overridden).length,
                }),
              ],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="exp-pill"
              aria-pressed={filter === id}
              onClick={() => onFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="exp-table-wrap">
        <table className="exp-table">
          <thead>
            <tr>
              <th>{m.dev_exp_col_level()}</th>
              <th>{m.dev_exp_col_required()}</th>
              <th>{m.dev_exp_col_diff()}</th>
              <th>{m.dev_exp_col_cum()}</th>
              <th>{m.dev_exp_col_share()}</th>
              <th>{m.dev_exp_col_span_time()}</th>
              <th>{m.dev_exp_col_days()}</th>
              <th>{m.dev_exp_col_actions()}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const serverRow = serverRows.find((item) => item.entry.id === row.id);
              const sign = row.deltaSpan > 0 ? "up" : row.deltaSpan < 0 ? "down" : "flat";
              return (
                <tr
                  key={row.id}
                  data-prestige={row.isPrestige}
                  data-focused={row.level === focusLevel}
                  data-non-mono={row.nonMonotone}
                >
                  <td>
                    <button type="button" className="exp-lv-btn" onClick={() => onFocusLevel(row.level)}>
                      Lv {row.level} → {row.nextLevel}
                    </button>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="input exp-cell-input"
                      min={EXP_TABLE_LIMITS.requiredExpMin}
                      max={EXP_TABLE_LIMITS.requiredExpMax}
                      step={1}
                      value={row.requiredExp}
                      data-staged={row.staged}
                      aria-label={`Lv ${row.level} -> ${row.nextLevel}`}
                      onFocus={() => onFocusLevel(row.level)}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        if (!Number.isFinite(parsed) || parsed < 1) return;
                        onEditSpan(row.level, parsed);
                      }}
                    />
                  </td>
                  <td className="exp-mono exp-diff" data-sign={sign}>
                    {row.deltaSpan === 0
                      ? "—"
                      : `${row.deltaSpan > 0 ? "+" : ""}${fmtInt(row.deltaSpan, locale)}`}
                  </td>
                  <td className="exp-mono">{fmtInt(row.cumEnd, locale)}</td>
                  <td className="exp-mono">{fmtDecimal(row.sharePct, locale, 2)}%</td>
                  <td className="exp-mono">{fmtDuration(row.daysForSpan, locale, ko)}</td>
                  <td className="exp-mono">{fmtDuration(row.daysToReach, locale, ko)}</td>
                  <td>
                    {(row.staged || row.overridden) && serverRow ? (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => onRevertRow(serverRow)}
                      >
                        {m.dev_exp_row_revert()}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
