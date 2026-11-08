// 설정 칸 패널 곁 부품 — 확인 창(구조 값·모두 되돌리기), 내보내기 창, 최근 바꿈(감사 기록), "49 칸 중 N개 연결" 목록(D-462).
// 확인·내보내기 창은 <dialog>.showModal()로 연다(초점 가둠, Esc = 닫기, 닫으면 연 자리로 초점). 부모가 request를 넘기면 열린다.
import type { TuningEntryView, TuningExportResponse, TuningHistoryRow } from "@terra/shared/tuning";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import cellsJson from "./settingsCells.json";
import { CELL_STATUS_TEXT, DROP_TEXT, errorText, historyActionText } from "./tuningMessages.ts";
import {
  type CellRow,
  cellCounts,
  cellRows,
  formatNumber,
  parseSettingsCells,
  tuningErrorOf,
} from "./tuningModel.ts";
import "./tuningExtras.css";

export interface ConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}

/** <dialog>를 request에 맞춰 열고 닫는다 */
function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

export function TuningConfirm({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const ref = useModal(request !== null);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      className="tp-dialog tp-confirm"
      aria-labelledby={titleId}
      data-density="compact"
      onClose={() => {
        if (request) onClose();
      }}
    >
      {request ? (
        <form method="dialog" className="tp-dialog-body">
          <h2 id={titleId} className="tp-dialog-title">
            {request.title}
          </h2>
          <p>{request.body}</p>
          <div className="form-actions">
            <button type="submit" value="cancel">
              {m.dev_tuning_cancel()}
            </button>
            <button
              type="button"
              className="button-primary tp-confirm-yes"
              onClick={() => {
                request.onConfirm();
                onClose();
              }}
            >
              {request.confirmLabel}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}

/** 내보내기 창: 차이 JSON(글 상자), [파일 받기]·[복사] */
export function TuningExport({
  result,
  onClose,
}: {
  result: TuningExportResponse | null;
  onClose: () => void;
}) {
  const ref = useModal(result !== null);
  const titleId = useId();
  const textId = useId();
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const text = result ? `${JSON.stringify(result.diff, null, 2)}\n` : "";
  const download = (): void => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = result.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <dialog
      ref={ref}
      className="tp-dialog tp-export"
      aria-labelledby={titleId}
      data-density="compact"
      onClose={() => {
        setCopy("idle");
        if (result) onClose();
      }}
    >
      {result ? (
        <form method="dialog" className="tp-dialog-body">
          <h2 id={titleId} className="tp-dialog-title">
            {m.dev_tuning_export_title()}
          </h2>
          <p>{m.dev_tuning_export_body({ count: result.diff.changes.length })}</p>
          <label className="field-label" htmlFor={textId}>
            {m.dev_tuning_export_text_label()}
          </label>
          <textarea id={textId} className="input tp-export-text" readOnly value={text} rows={8} />
          {copy === "done" ? <p role="status">{m.dev_tuning_copied()}</p> : null}
          {copy === "failed" ? <p role="alert">{m.dev_tuning_copy_failed()}</p> : null}
          <div className="form-actions">
            <button type="submit" value="close">
              {m.dev_tuning_close()}
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(text).then(
                  () => setCopy("done"),
                  () => setCopy("failed"),
                );
              }}
            >
              {m.dev_tuning_copy()}
            </button>
            <button type="button" className="button-primary tp-download" onClick={download}>
              {m.dev_tuning_download()}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}

type HistoryState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly rows: readonly TuningHistoryRow[]; readonly revision: number }
  | { readonly status: "error"; readonly message: string };

/** 값 글: null = 팩 값 */
const valueOrPack = (value: number | null, locale: string) =>
  value === null ? m.dev_tuning_history_pack() : formatNumber(value, locale);

function HistoryLine({ row, locale }: { row: TuningHistoryRow; locale: string }) {
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(row.at);
  return (
    <li className="tp-history-row" data-action={row.action}>
      <p className="tp-history-head">
        <span className="tp-history-action">{historyActionText(row.action, row.revision)}</span>
        <span className="tp-history-who">{row.actor ?? m.dev_tuning_history_system()}</span>
        <time dateTime={new Date(row.at).toISOString()}>{when}</time>
      </p>
      <ul className="tp-history-changes">
        {row.changes.map((change) => (
          <li key={change.id}>
            <code>{change.id}</code> {valueOrPack(change.before, locale)} →{" "}
            {row.action === "pack_won" && change.packValue !== null
              ? formatNumber(change.packValue, locale)
              : valueOrPack(change.after, locale)}
            {change.reason ? ` (${DROP_TEXT[change.reason]()})` : ""}
          </li>
        ))}
      </ul>
      {row.note ? <p className="tp-history-note">{row.note}</p> : null}
    </li>
  );
}

/** 최근 바꿈: 펼칠 때 받는다(revision이 바뀌면 다시) */
export function TuningHistory({ revision, locale }: { revision: number; locale: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HistoryState>({ status: "idle" });
  useEffect(() => {
    let alive = true;
    if (open) {
      api.tuning.history.query().then(
        (result) => {
          // 받은 때의 설정 판(판이 바뀌면 다시 받는다)
          if (alive) setState({ status: "ready", rows: result.rows, revision });
        },
        (error: unknown) => {
          if (alive) setState({ status: "error", message: errorText(tuningErrorOf(error).key) });
        },
      );
    }
    return () => {
      alive = false;
    };
  }, [open, revision]);
  return (
    <details className="tp-section tp-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="tp-section-title">{m.dev_tuning_history()}</summary>
      {state.status === "ready" ? (
        state.rows.length === 0 ? (
          <p className="field-hint">{m.dev_tuning_history_empty()}</p>
        ) : (
          <ol className="tp-history-list">
            {state.rows.map((row) => (
              <HistoryLine key={`${row.at}-${row.action}-${row.revision ?? ""}`} row={row} locale={locale} />
            ))}
          </ol>
        )
      ) : state.status === "error" ? (
        <p role="alert" className="field-error">
          {state.message}
        </p>
      ) : (
        <p className="field-hint">{m.dev_tuning_loading()}</p>
      )}
    </details>
  );
}

const CELLS = parseSettingsCells(cellsJson);

function CellLine({ row }: { row: CellRow }) {
  return (
    <li className="tp-cell" data-status={row.status} data-code={row.cell.code}>
      <span className="tp-code">{row.cell.code}</span>
      <span className="tp-cell-name" title={row.cell.what}>
        {row.cell.name}
      </span>
      <span className="tp-chip tp-cell-status" data-status={row.status}>
        {CELL_STATUS_TEXT[row.status]()}
      </span>
      {row.status === "not_connected" ? (
        <span className="tp-cell-start">{m.dev_tuning_cell_start({ start: row.cell.start })}</span>
      ) : null}
      {row.ids.length > 0 ? <code className="tp-cell-ids">{row.ids.join(", ")}</code> : null}
    </li>
  );
}

/** "49 칸 중 N개 연결"(D-462): 49 문서에서 만든 읽기 전용 목록. 장마다 칸·상태 */
export function TuningCells({ entries }: { entries: readonly TuningEntryView[] }) {
  const rows = cellRows(CELLS, entries);
  const counts = cellCounts(rows);
  const map = new Map<string, CellRow[]>();
  for (const row of rows) {
    const list = map.get(row.cell.section) ?? [];
    list.push(row);
    map.set(row.cell.section, list);
  }
  const sections = [...map.entries()];
  return (
    <details className="tp-section tp-cells">
      <summary className="tp-section-title">
        {m.dev_tuning_cells({ connected: counts.connected, total: counts.total })}
      </summary>
      <p className="tp-cells-summary">
        {m.dev_tuning_cells_summary({
          total: counts.total,
          connected: counts.connected,
          noValue: counts.no_value,
          notConnected: counts.not_connected,
        })}
      </p>
      <p className="field-hint">{m.dev_tuning_cells_note()}</p>
      {sections.map(([section, list]) => (
        <section key={section} className="tp-cells-group">
          <h3 className="tp-group-title">{section}</h3>
          <ul className="tp-cell-list">
            {list.map((row) => (
              <CellLine key={row.cell.code} row={row} />
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}
