// 건물 편집기 판 — 담은 변경 막대(화면 아래에 붙음: 수·칩·검사 상태·메모·[검사]·[적용]·[비우기]), 내보내기(팩 차이 파일), 잠든 시설 줄.
// 아이템 편집기 막대(ItemStageBar)와 같은 모양이다(그 조각을 끌고 오지 않게 따로 둔다).
import type { ContentSleepingRow } from "@terra/shared/contentEdit";
import type { TuningExportResponse } from "@terra/shared/tuning";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";

export type CheckState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "done"; readonly errors: number; readonly advice: number }
  | { readonly status: "failed" };

export function BuildingStageBar({
  keys,
  check,
  note,
  onNote,
  busy,
  onCheck,
  onApply,
  onClear,
  onPick,
}: {
  keys: readonly string[];
  check: CheckState;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  onCheck: () => void;
  onApply: () => void;
  onClear: () => void;
  onPick: (key: string) => void;
}) {
  const noteId = useId();
  const [asking, setAsking] = useState(false);
  const blocked = check.status === "done" && check.errors > 0;
  const canApply = keys.length > 0 && check.status === "done" && check.errors === 0 && !busy;
  const status =
    keys.length === 0
      ? m.dev_buildings_stage_empty()
      : check.status === "checking" || check.status === "idle"
        ? m.dev_buildings_checking()
        : check.status === "failed"
          ? m.dev_buildings_check_failed()
          : blocked
            ? m.dev_buildings_check_blocked({ count: check.errors })
            : m.dev_buildings_check_ok({ advice: check.advice });
  return (
    <div
      className="be-stagebar"
      role="region"
      aria-label={m.dev_buildings_stage_label()}
      data-count={keys.length}
      data-check={check.status === "done" ? (blocked ? "blocked" : "ok") : check.status}
    >
      <div className="be-stage-top">
        <strong className="be-stage-count">{m.dev_buildings_stage_count({ count: keys.length })}</strong>
        <span className="be-stage-status" role="status" data-blocked={blocked ? "" : undefined}>
          {status}
        </span>
      </div>
      {keys.length > 0 ? (
        <>
          <ul className="be-chips" aria-label={m.dev_buildings_stage_label()}>
            {keys.map((key) => (
              <li key={key}>
                <button type="button" className="be-chip" onClick={() => onPick(key)}>
                  {key}
                </button>
              </li>
            ))}
          </ul>
          <div className="be-stage-actions">
            <label className="visually-hidden" htmlFor={noteId}>
              {m.dev_buildings_note_label()}
            </label>
            <input
              id={noteId}
              className="input be-note"
              placeholder={m.dev_buildings_note_label()}
              maxLength={200}
              value={note}
              onChange={(event) => onNote(event.target.value)}
            />
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={busy ? undefined : onCheck}
            >
              {m.dev_buildings_check()}
            </button>
            <button
              type="button"
              className="button-small button-primary be-apply"
              aria-disabled={!canApply}
              onClick={canApply ? onApply : undefined}
            >
              {m.dev_buildings_apply()}
            </button>
            {asking ? (
              <span className="be-confirm" role="group" aria-label={m.dev_buildings_clear_confirm()}>
                <span>{m.dev_buildings_clear_confirm()}</span>
                <button
                  type="button"
                  className="button-small button-primary"
                  onClick={() => {
                    setAsking(false);
                    onClear();
                  }}
                >
                  {m.dev_buildings_confirm_yes()}
                </button>
                <button type="button" className="button-small" onClick={() => setAsking(false)}>
                  {m.dev_buildings_confirm_no()}
                </button>
              </span>
            ) : (
              <button type="button" className="button-small" onClick={() => setAsking(true)}>
                {m.dev_buildings_clear()}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** 팩 차이 내보내기(tuning.export — 설정 칸·편집기 차이를 함께 든 파일, `pnpm tuning:apply`가 facilities.json에 넣는다) */
export function BuildingExport({
  exported,
  onClose,
}: {
  exported: TuningExportResponse;
  onClose: () => void;
}) {
  const text = `${JSON.stringify(exported.diff, null, 2)}\n`;
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.fileName;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="be-panel" aria-labelledby="be-export-title">
      <h2 id="be-export-title" className="be-heading">
        {m.dev_buildings_export_title()}
      </h2>
      <p className="field-hint">{m.dev_buildings_export_hint()}</p>
      <textarea
        className="input be-export-text"
        readOnly
        rows={6}
        value={text}
        aria-labelledby="be-export-title"
      />
      <div className="be-actions">
        <button type="button" className="button-small button-primary" onClick={download}>
          {m.dev_buildings_export_download()}
        </button>
        <button type="button" className="button-small" onClick={onClose}>
          {m.dev_buildings_close()}
        </button>
      </div>
    </section>
  );
}

/** 잠든 시설 줄(켤 때 적용하지 않고 DB에 둔 것) — [버리기 담기]를 누르면 담은 변경에 든다 */
export function BuildingSleeping({
  rows,
  discard,
  onToggle,
}: {
  rows: readonly ContentSleepingRow[];
  discard: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
}) {
  return (
    <section className="be-panel" aria-labelledby="be-sleeping-title">
      <h2 id="be-sleeping-title" className="be-heading">
        {m.dev_buildings_sleeping_title()}
      </h2>
      <ul className="be-plain-list">
        {rows.map((row) => (
          <li key={row.id} className="be-actions">
            <span>
              {m.dev_buildings_sleeping_line({ id: row.id, reason: row.reason, version: row.contentVersion })}
            </span>
            <button
              type="button"
              className="button-small"
              aria-pressed={discard.has(row.id)}
              onClick={() => onToggle(row.id, !discard.has(row.id))}
            >
              {m.dev_buildings_discard()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
