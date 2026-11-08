// 설정 칸 패널 담은 변경 막대(화면 아래에 붙음) — docs/adr/2026-11-01-dev-settings-panel.md 12절·"바뀜 (2026-11-08 화면 개편)".
// 담은 칸 수(펼치면 칸마다 지금 → 담은 값과 [×] 담기 취소) · 메모 · [모두 취소](아직 보내지 않은 것만 버림) · [적용](한 묶음, Ctrl/⌘+S).
import type { TuningEntryView } from "@terra/shared/tuning";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { type Pending, formatNumber } from "./tuningModel.ts";

export interface TuningPendingBarProps {
  pending: Pending;
  entries: readonly TuningEntryView[];
  locale: string;
  note: string;
  busy: boolean;
  onNote: (note: string) => void;
  onUnstage: (id: string) => void;
  onDiscard: () => void;
  onApply: () => void;
}

export function TuningPendingBar({
  pending,
  entries,
  locale,
  note,
  busy,
  onNote,
  onUnstage,
  onDiscard,
  onApply,
}: TuningPendingBarProps) {
  const noteId = useId();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const label = m.dev_tuning_pending_count({ count: pending.size });
  return (
    <div className="tp-pending" role="region" aria-label={label}>
      <details className="tp-pending-details">
        <summary className="tp-pending-count" title={m.dev_tuning_pending_list()}>
          {label}
        </summary>
        <ul className="tp-pending-list">
          {[...pending].map(([id, value]) => {
            const entry = byId.get(id);
            const name = entry ? (locale === "en" ? entry.name.en : entry.name.ko) : id;
            const target =
              value === null
                ? m.dev_tuning_pending_pack({ value: entry ? formatNumber(entry.packValue, locale) : "?" })
                : formatNumber(value, locale);
            return (
              <li key={id} className="tp-pending-item" data-id={id}>
                <span className="tp-pending-what">
                  <code className="tp-code">{entry?.code || "—"}</code> <span>{name}</span>
                </span>
                <span className="tp-pending-change">
                  {entry ? formatNumber(entry.value, locale) : "?"} → <strong>{target}</strong>
                </span>
                <button
                  type="button"
                  className="tp-row-action tp-pending-remove"
                  aria-label={m.dev_tuning_pending_remove({ name })}
                  onClick={() => onUnstage(id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            );
          })}
        </ul>
      </details>
      <label className="visually-hidden" htmlFor={noteId}>
        {m.dev_tuning_pending_note()}
      </label>
      <input
        id={noteId}
        className="input tp-note-input"
        maxLength={200}
        placeholder={m.dev_tuning_pending_note()}
        value={note}
        onChange={(event) => onNote(event.target.value)}
      />
      <div className="tp-pending-actions">
        <button type="button" className="tp-discard" onClick={onDiscard}>
          {m.dev_tuning_clear()}
        </button>
        <button
          type="button"
          className="button-primary tp-apply"
          aria-disabled={busy}
          aria-keyshortcuts="Control+S Meta+S"
          onClick={busy ? undefined : onApply}
        >
          {m.dev_tuning_apply()}
        </button>
      </div>
    </div>
  );
}
