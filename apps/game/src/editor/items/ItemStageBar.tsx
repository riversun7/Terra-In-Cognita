// 담은 변경 막대(설계안 3.10) — 화면 아래에 붙는다(설정 칸 패널과 같은 자리): 담은 항목 수와 칩(누르면 그 항목), 검사 상태(입력이 1초
// 멈추면 서버 items.check, [검사]로 바로), 메모(200자), [적용](items.save 한 묶음, 항목마다 baseHash), 되돌리기·다시하기(기기 안에서만),
// [비우기](묻고 비운다).
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";

export type CheckState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "done"; readonly errors: number; readonly advice: number }
  | { readonly status: "failed" };

export function ItemStageBar({
  keys,
  check,
  conflicts,
  note,
  onNote,
  busy,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCheck,
  onApply,
  onClear,
  onPick,
}: {
  /** 담은 변경 키(분류/ID) */
  keys: readonly string[];
  check: CheckState;
  /** 칸을 고르지 않은 충돌 항목 수(남아 있으면 [적용]을 막는다) */
  conflicts: number;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCheck: () => void;
  onApply: () => void;
  onClear: () => void;
  onPick: (key: string) => void;
}) {
  const noteId = useId();
  const [asking, setAsking] = useState(false);
  const blocked = check.status === "done" && check.errors > 0;
  const ready = check.status === "done" && check.errors === 0;
  const canApply = keys.length > 0 && ready && conflicts === 0 && !busy;
  const status =
    keys.length === 0
      ? m.dev_items_stage_empty()
      : conflicts > 0
        ? m.dev_items_conflict_pending({ count: conflicts })
        : check.status === "checking" || check.status === "idle"
          ? m.dev_items_checking()
          : check.status === "failed"
            ? m.dev_items_check_failed()
            : blocked
              ? m.dev_items_check_blocked({ count: check.errors })
              : m.dev_items_check_ok({ advice: check.advice });
  return (
    <div
      className="ie-stagebar"
      role="region"
      aria-label={m.dev_items_stage_label()}
      data-count={keys.length}
      data-check={check.status === "done" ? (blocked ? "blocked" : "ok") : check.status}
    >
      <div className="ie-stage-top">
        <strong className="ie-stage-count">{m.dev_items_stage_count({ count: keys.length })}</strong>
        <span className="ie-stage-status" role="status" data-blocked={blocked ? "" : undefined}>
          {status}
        </span>
        <div className="ie-stage-tools">
          <button
            type="button"
            className="button-small"
            aria-disabled={!canUndo}
            onClick={canUndo ? onUndo : undefined}
          >
            {m.dev_items_undo()}
          </button>
          <button
            type="button"
            className="button-small"
            aria-disabled={!canRedo}
            onClick={canRedo ? onRedo : undefined}
          >
            {m.dev_items_redo()}
          </button>
        </div>
      </div>
      {keys.length > 0 ? (
        <>
          <ul className="ie-chips ie-stage-chips" aria-label={m.dev_items_stage_list()}>
            {keys.map((key) => (
              <li key={key}>
                <button type="button" className="ie-chip ie-chip-staged" onClick={() => onPick(key)}>
                  {key}
                </button>
              </li>
            ))}
          </ul>
          <div className="ie-stage-actions">
            <label className="visually-hidden" htmlFor={noteId}>
              {m.dev_items_note_label()}
            </label>
            <input
              id={noteId}
              className="input ie-note"
              placeholder={m.dev_items_note_label()}
              maxLength={200}
              value={note}
              onChange={(event) => onNote(event.target.value)}
            />
            <button
              type="button"
              className="button-small ie-check-button"
              aria-disabled={busy}
              onClick={busy ? undefined : onCheck}
            >
              {m.dev_items_check()}
            </button>
            <button
              type="button"
              className="button-small button-primary ie-apply"
              aria-disabled={!canApply}
              onClick={canApply ? onApply : undefined}
            >
              {m.dev_items_apply()}
            </button>
            {asking ? (
              <span className="ie-confirm-inline" role="group" aria-label={m.dev_items_clear_confirm()}>
                <span>{m.dev_items_clear_confirm()}</span>
                <button
                  type="button"
                  className="button-small button-primary"
                  onClick={() => {
                    setAsking(false);
                    onClear();
                  }}
                >
                  {m.dev_items_confirm_yes()}
                </button>
                <button type="button" className="button-small" onClick={() => setAsking(false)}>
                  {m.dev_items_confirm_no()}
                </button>
              </span>
            ) : (
              <button type="button" className="button-small ie-clear" onClick={() => setAsking(true)}>
                {m.dev_items_clear()}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
