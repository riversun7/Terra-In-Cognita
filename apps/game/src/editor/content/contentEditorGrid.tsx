// 표 묶음 바꾸기(편집기 공용) — docs/adr/2026-11-10-editor-input-controls.md. 레벨·티어 표의 칸을 여러 개 골라 한꺼번에 바꾼다.
// - useGridSelection: 고른 칸(누름 = 한 칸, Shift+누름 = 닻 칸부터 네모, Ctrl/⌘+누름 = 더 고르기, 머리 단추 = 열 전체), 닻 칸의 끌어 채우기.
// - GridBulkBar: 값으로 · 더하기 · 곱하기(%) · 선형 채우기 · 등비 채우기(열마다 고른 첫 칸과 끝 칸 사이). 셈은 contentEditorNumeric.bulkApply.
// - Sparkline: 열(줄)마다 작은 막대 곡선 — 꺾인 곳이 한눈에 보인다(늘다가 주는 곡선은 밑줄로 알린다).
// 화면은 칸(td)에 cellProps(row, col)를 펴 넣고, 닻 칸에 fillHandle(...)을 그린다. 값은 화면이 든다(여기는 고르기와 도구만).
import { type PointerEvent as ReactPointerEvent, type ReactNode, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { parseInt32 } from "./contentEditorModel.ts";
import { NumberControl } from "./contentEditorNumber.tsx";
import {
  type BulkOp,
  type IntLimits,
  cellKey,
  curveShape,
  rectKeys,
  sparkHeights,
} from "./contentEditorNumeric.ts";
import "./contentEditorInputs.css";

type Cell = readonly [number, number];

export interface GridCellProps {
  readonly "data-grid-cell": "";
  readonly "data-grid-row": number;
  readonly "data-grid-col": number;
  readonly "data-picked": "" | undefined;
  readonly "data-fill": "" | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onFocusCapture: () => void;
}

export interface GridSelection {
  readonly picked: ReadonlySet<string>;
  readonly anchor: Cell | null;
  readonly cellProps: (row: number, col: number) => GridCellProps;
  /** 열 전체(0 ~ rows−1)를 고른다 */
  readonly pickColumn: (col: number, rows: number) => void;
  readonly clear: () => void;
  /** 닻 칸이면 끌어 채우기 손잡이(아니면 null). onFill(처음 줄, 끝 줄, 열) */
  readonly fillHandle: (
    row: number,
    col: number,
    onFill: (from: number, to: number, col: number) => void,
  ) => ReactNode;
}

const cellOf = (element: Element | null): Cell | null => {
  const cell = element?.closest<HTMLElement>("[data-grid-cell]");
  if (!cell) return null;
  const row = Number(cell.dataset.gridRow);
  const col = Number(cell.dataset.gridCol);
  return Number.isInteger(row) && Number.isInteger(col) ? [row, col] : null;
};

export function useGridSelection(): GridSelection {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [fillTo, setFillTo] = useState<number | null>(null);
  const fill =
    anchor !== null && fillTo !== null ? new Set(rectKeys(anchor, [fillTo, anchor[1]])) : new Set<string>();

  const pickOne = (row: number, col: number): void => {
    setAnchor([row, col]);
    setPicked(new Set([cellKey(row, col)]));
  };
  return {
    picked,
    anchor,
    cellProps: (row, col) => ({
      "data-grid-cell": "",
      "data-grid-row": row,
      "data-grid-col": col,
      "data-picked": picked.has(cellKey(row, col)) ? "" : undefined,
      "data-fill": fill.has(cellKey(row, col)) ? "" : undefined,
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest(".ce-fill-handle")) return;
        if (event.shiftKey && anchor) {
          setPicked(new Set(rectKeys(anchor, [row, col])));
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          const next = new Set(picked);
          const key = cellKey(row, col);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          setPicked(next);
          setAnchor([row, col]);
          return;
        }
        pickOne(row, col);
      },
      // 키보드로 들어온 칸도 닻이 된다(이미 고른 칸이면 고른 것을 그대로 둔다)
      onFocusCapture: () => {
        if (!picked.has(cellKey(row, col))) pickOne(row, col);
      },
    }),
    pickColumn: (col, rows) => {
      setAnchor([0, col]);
      setPicked(new Set(rectKeys([0, col], [Math.max(0, rows - 1), col])));
    },
    clear: () => {
      setPicked(new Set());
      setAnchor(null);
      setFillTo(null);
    },
    fillHandle: (row, col, onFill) => {
      if (!anchor || anchor[0] !== row || anchor[1] !== col || picked.size !== 1) return null;
      return (
        // 포인터 전용 지름길이라 읽기 프로그램·탭 차례 밖이다(키보드는 범위를 고르고 [값으로])
        <span
          className="ce-fill-handle"
          aria-hidden="true"
          title={m.dev_grid_fill_handle()}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setFillTo(row);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const over = cellOf(document.elementFromPoint(event.clientX, event.clientY));
            // 같은 열 안에서만 채운다
            if (over && over[1] === col) setFillTo(over[0]);
          }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            const to = fillTo;
            setFillTo(null);
            if (to !== null && to !== row) {
              onFill(row, to, col);
              setPicked(new Set(rectKeys([row, col], [to, col])));
            }
          }}
          onPointerCancel={() => setFillTo(null)}
        />
      );
    },
  };
}

const AMOUNT_OPS = ["set", "add", "scale"] as const;
type AmountOp = (typeof AMOUNT_OPS)[number];
const isAmountOp = (value: string): value is AmountOp => AMOUNT_OPS.some((op) => op === value);

/** 고른 칸 한꺼번에 바꾸기 막대. 고른 칸이 없으면 고르는 법을 적는다(자리는 그대로 — 표가 밀리지 않게) */
export function GridBulkBar({
  count,
  limits,
  unit,
  canFill,
  onApply,
  onClear,
  className,
}: {
  /** 고른 칸 수 */
  count: number;
  /** 칸 값 범위(값으로의 범위, 더하기는 ±폭) */
  limits: IntLimits;
  unit?: string | undefined;
  /** 채우기를 쓸 수 있나(한 열에 두 칸 넘게 고름) */
  canFill: boolean;
  onApply: (op: BulkOp) => void;
  onClear: () => void;
  className?: string | undefined;
}) {
  const opId = useId();
  const amountId = useId();
  const [kind, setKind] = useState<AmountOp>("set");
  const [texts, setTexts] = useState<Record<AmountOp, string>>({ set: "0", add: "10", scale: "110" });
  const span = limits.max - limits.min;
  const bounds: Record<AmountOp, IntLimits> = {
    set: limits,
    add: { min: -span, max: span },
    scale: { min: 0, max: 1000 },
  };
  const bound = bounds[kind];
  const text = texts[kind];
  const amount = parseInt32(text, bound.min, bound.max);
  const active = count > 0;
  const apply = (): void => {
    if (!active || amount === null) return;
    onApply(
      kind === "set"
        ? { kind, value: amount }
        : kind === "add"
          ? { kind, value: amount }
          : { kind, percent: amount },
    );
  };
  const label: Record<AmountOp, () => string> = {
    set: m.dev_grid_op_set,
    add: m.dev_grid_op_add,
    scale: m.dev_grid_op_scale,
  };
  return (
    <div
      className={`ce-bulk ${className ?? ""}`}
      role="group"
      aria-label={m.dev_grid_bulk_label()}
      data-active={active ? "" : undefined}
      data-count={count}
    >
      <span className="ce-bulk-count" role="status">
        {m.dev_grid_picked({ count })}
      </span>
      <span className="ce-bulk-group">
        <label className="visually-hidden" htmlFor={opId}>
          {m.dev_grid_op()}
        </label>
        <select
          id={opId}
          className="ce-bulk-op"
          value={kind}
          onChange={(event) => {
            if (isAmountOp(event.target.value)) setKind(event.target.value);
          }}
        >
          {AMOUNT_OPS.map((op) => (
            <option key={op} value={op}>
              {label[op]()}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor={amountId}>
          {m.dev_grid_amount()}
        </label>
        <NumberControl
          id={amountId}
          label={m.dev_grid_amount()}
          text={text}
          value={amount}
          min={bound.min}
          max={bound.max}
          unit={kind === "scale" ? "%" : unit}
          compact
          onText={(next) => setTexts({ ...texts, [kind]: next })}
          onAdjust={(next) => setTexts({ ...texts, [kind]: String(next) })}
          inputProps={{
            inputMode: bound.min >= 0 ? "numeric" : "text",
            "aria-invalid": amount === null || undefined,
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply();
              }
            },
          }}
        />
        <button
          type="button"
          className="button-small ce-bulk-apply"
          aria-disabled={!active || amount === null || undefined}
          onClick={apply}
        >
          {m.dev_grid_change()}
        </button>
      </span>
      <span className="ce-bulk-group">
        <button
          type="button"
          className="button-small ce-bulk-linear"
          aria-disabled={!canFill || undefined}
          title={m.dev_grid_fill_hint()}
          onClick={canFill ? () => onApply({ kind: "linear" }) : undefined}
        >
          {m.dev_grid_fill_linear()}
        </button>
        <button
          type="button"
          className="button-small ce-bulk-geometric"
          aria-disabled={!canFill || undefined}
          title={m.dev_grid_fill_hint()}
          onClick={canFill ? () => onApply({ kind: "geometric" }) : undefined}
        >
          {m.dev_grid_fill_geometric()}
        </button>
        {active ? (
          <button type="button" className="button-small ce-bulk-clear" onClick={onClear}>
            {m.dev_grid_clear()}
          </button>
        ) : null}
      </span>
      {active ? null : <p className="ce-bulk-hint">{m.dev_grid_none()}</p>}
    </div>
  );
}

const formatInt = (value: number): string => new Intl.NumberFormat(getLocale()).format(value);

/** 작은 막대 곡선(값 차례대로). 읽는 이름에 처음·끝·가장 작은·큰 값을 적는다 */
export function Sparkline({
  values,
  name,
  tone,
  className,
}: {
  values: readonly number[];
  name: string;
  tone?: number | undefined;
  className?: string | undefined;
}) {
  if (values.length === 0) return null;
  const n = formatInt;
  const heights = sparkHeights(values);
  return (
    <span
      className={`ce-spark ${className ?? ""}`}
      role="img"
      data-tone={tone}
      data-shape={curveShape(values)}
      aria-label={m.dev_grid_curve({
        name,
        first: n(values[0] ?? 0),
        last: n(values.at(-1) ?? 0),
        min: n(Math.min(...values)),
        max: n(Math.max(...values)),
      })}
    >
      {heights.map((height, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- 값 차례가 곧 열쇠다(줄·레벨 차례 고정)
        <span key={index} className="ce-spark-bar" style={{ blockSize: `${Math.round(height * 100)}%` }} />
      ))}
    </span>
  );
}
